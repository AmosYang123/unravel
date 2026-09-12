import { useCallback, useEffect, useReducer } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { Settings } from "./types";

/**
 * Reminders that this phone raises for itself. No server, no domain, no cost —
 * the email path stays as the backup, and the two are independent on purpose.
 *
 * Whether this device chimes is a device preference, not a profile one: the
 * same account on a second phone should not silently start buzzing there.
 */
const DEVICE_REMINDERS_KEY = "quiet.deviceReminders.v1";

/** Android needs a channel before it will even ask for permission. */
const CHANNEL_ID = "reminders";

/** Where a tapped reminder lands. Same destination as the email's link. */
export const REMINDER_ROUTE = "/write?mode=short";

/** Marks our own notifications so a tap can be told apart from anything else. */
export const REMINDER_KIND = "check-in-reminder";

/** Repeating notifications reuse the request id; each delivery still needs handling. */
export const reminderResponseKey = (response: Notifications.NotificationResponse): string =>
  `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;

/* ---------- wording ---------- */

/* The same two lines the email sends (supabase/functions/_shared/reminder-email.ts),
   so both channels say the same thing. The one difference is deliberate: this is
   a reminder, so it says reminder rather than nudge. */

const REMINDER_TITLE = "A moment for you";

const REMINDER_BODY_DISCREET =
  "A quiet moment for you, whenever you have one. Nothing to catch up on.";

const REMINDER_BODY_PLAIN =
  "Your reminder to open Unravel and check in, if you feel like it. Nothing to catch up on.";

/* ---------- permission ---------- */

export type ReminderPermission = "granted" | "denied" | "undetermined";

/**
 * iOS answers with more shades than "yes" and "no", and the docs ask that the
 * ios.status field be read rather than the flattened one, so it is.
 */
function toPermission(response: Notifications.NotificationPermissionsStatus): ReminderPermission {
  const iosStatus = response.ios?.status;
  if (Platform.OS === "ios" && iosStatus !== undefined) {
    switch (iosStatus) {
      case Notifications.IosAuthorizationStatus.AUTHORIZED:
      case Notifications.IosAuthorizationStatus.PROVISIONAL:
      case Notifications.IosAuthorizationStatus.EPHEMERAL:
        return "granted";
      case Notifications.IosAuthorizationStatus.DENIED:
        return "denied";
      default:
        return "undetermined";
    }
  }
  if (response.status === Notifications.PermissionStatus.GRANTED) return "granted";
  if (response.status === Notifications.PermissionStatus.DENIED) return "denied";
  return "undetermined";
}

/* ---------- the schedule ---------- */

type TriggerInput = Notifications.SchedulableNotificationTriggerInput;

/** One scheduled repeat, with a stable id so a re-schedule replaces it. */
export interface ReminderSchedule {
  identifier: string;
  trigger: TriggerInput;
}

/** "21:00" → { hour: 21, minute: 0 }. Mirrors how send-reminders reads the same field. */
function parseTime(time: string): { hour: number; minute: number } {
  const [rawHour, rawMinute] = (time || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const clamp = (n: number, max: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), max) : 0);
  return { hour: clamp(hour, 23), minute: clamp(minute, 59) };
}

/**
 * What this rhythm means in triggers. Pure, so the whole schedule can be read
 * off the settings without touching the OS.
 *
 * The rules match `isDue` in supabase/functions/send-reminders: "weekly" uses
 * the first selected day and falls back to Monday, "monthly" is the 1st.
 * Weekdays are 1-7 with 1 = Sunday for expo-notifications, while the stored
 * days are 0-6 with 0 = Sunday, hence the +1.
 */
export function reminderSchedules(settings: Settings): ReminderSchedule[] {
  const { hour, minute } = parseTime(settings.reminderTime);

  switch (settings.reminderMode) {
    case "daily":
      return [
        {
          identifier: "check-in-daily",
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
        },
      ];
    case "days":
      return [...new Set(settings.reminderDays)]
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        .sort((a, b) => a - b)
        .map((day) => ({
          identifier: `check-in-weekday-${day}`,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day + 1,
            hour,
            minute,
          },
        }));
    case "weekly": {
      const day = settings.reminderDays[0] ?? 1;
      return [
        {
          identifier: "check-in-weekly",
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: (day >= 0 && day <= 6 ? day : 1) + 1,
            hour,
            minute,
          },
        },
      ];
    }
    case "monthly":
      return [
        {
          identifier: "check-in-monthly",
          trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: 1, hour, minute },
        },
      ];
    default:
      return [];
  }
}

/* ---------- tiny external store, same shape as lib/store ---------- */

interface ReminderState {
  /** Whether this device is meant to raise its own reminders. */
  enabled: boolean;
  /** What the OS says right now. Re-read whenever the app comes forward. */
  permission: ReminderPermission;
  /** True until the stored preference has been read once. */
  loading: boolean;
  busy: boolean;
  error: string | null;
}

/**
 * expo-notifications is an Android and iOS module. On web every scheduling and
 * permission call throws ("not available on web"), so the whole module is a
 * no-op there rather than a source of caught-and-logged errors. Platform.OS is
 * fixed for the life of the bundle, so this resolves once.
 */
const SCHEDULING_SUPPORTED = Platform.OS !== "web";

let state: ReminderState = { enabled: false, permission: "undetermined", loading: true, busy: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<ReminderState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/* Foreground arrivals still show: a reminder that only appears when the app is
   closed would be a strange thing to promise. */
if (SCHEDULING_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function readDevicePreference(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEVICE_REMINDERS_KEY)) === "on";
  } catch {
    return false;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Check-in reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Reads permission without ever prompting. Safe on cold start. */
export async function refreshPermission(): Promise<ReminderPermission> {
  if (!SCHEDULING_SUPPORTED) return state.permission;
  try {
    const permission = toPermission(await Notifications.getPermissionsAsync());
    set({ permission });
    return permission;
  } catch {
    return state.permission;
  }
}

/* Every write to the OS goes through one chain, so two quick taps cannot
   interleave a cancel with someone else's schedule. */
let queue: Promise<void> = Promise.resolve();
const enqueue = (run: () => Promise<void>): Promise<void> => {
  queue = queue.then(run, run);
  return queue;
};

/** What is currently on the OS, as a string, so identical syncs are skipped. */
let appliedSignature: string | null = null;

const signature = (settings: Settings | null, enabled: boolean, permission: ReminderPermission): string => {
  if (!settings || !enabled || permission !== "granted") return "off";
  return [
    settings.reminderMode,
    settings.reminderDays.join(","),
    settings.reminderTime,
    settings.discreetNotifications ? "discreet" : "plain",
  ].join("|");
};

/**
 * Makes the OS match the settings. Always cancels first, so changing the time
 * twice replaces the schedule rather than stacking a second copy of it.
 */
export function syncReminders(settings: Settings | null): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return Promise.resolve();
  return enqueue(async () => {
    const next = signature(settings, state.enabled, state.permission);
    if (next === appliedSignature) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (settings && state.enabled && state.permission === "granted") {
        await ensureAndroidChannel();
        const body = settings.discreetNotifications ? REMINDER_BODY_DISCREET : REMINDER_BODY_PLAIN;
        for (const { identifier, trigger } of reminderSchedules(settings)) {
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
              title: REMINDER_TITLE,
              body,
              sound: false,
              data: { kind: REMINDER_KIND, url: REMINDER_ROUTE },
            },
            trigger: { ...trigger, ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}) },
          });
        }
      }
      appliedSignature = next;
      set({ error: null });
    } catch (err) {
      // A refused schedule must never take the app down with it; the next
      // change tries again from a clean slate.
      appliedSignature = null;
      set({ error: "Couldn't schedule reminders. Try turning them off and on again." });
      console.error("Could not update reminders", err);
    }
  });
}

/** Cancels everything, for signing out. */
export function clearReminders(): Promise<void> {
  if (!SCHEDULING_SUPPORTED) return Promise.resolve();
  return enqueue(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      appliedSignature = "off";
    } catch {
      appliedSignature = null;
    }
  });
}

/* ---------- hooks ---------- */

function useReminderState(): ReminderState {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, [bump]);
  return state;
}

/**
 * The Settings control. Permission is only ever asked for here, at the moment
 * someone turns reminders on — never on a cold start.
 */
export function useDeviceReminders(settings: Settings | null) {
  const { enabled, permission, loading, busy, error } = useReminderState();

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!SCHEDULING_SUPPORTED || state.busy) return;
      set({ busy: true, error: null });
      try {
        if (!on) {
          set({ enabled: false });
          await AsyncStorage.setItem(DEVICE_REMINDERS_KEY, "off");
          await syncReminders(settings);
          return;
        }

        await ensureAndroidChannel();
        const current = await Notifications.getPermissionsAsync();
        let permissionNow = toPermission(current);
        if (permissionNow !== "granted" && current.canAskAgain !== false) {
          permissionNow = toPermission(
            await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowSound: true, allowBadge: false },
            }),
          );
        }
        set({ permission: permissionNow });

        // Refused is not an error, and it is not a silent failure either: the
        // switch stays off and Settings says why.
        if (permissionNow !== "granted") {
          set({ enabled: false });
          await AsyncStorage.setItem(DEVICE_REMINDERS_KEY, "off");
          await syncReminders(settings);
          return;
        }

        set({ enabled: true });
        await AsyncStorage.setItem(DEVICE_REMINDERS_KEY, "on");
        await syncReminders(settings);
      } catch {
        set({ error: "Couldn't update reminders. Please try again." });
      } finally {
        set({ busy: false });
      }
    },
    [settings],
  );

  const sendTestNotification = useCallback(async () => {
    if (!SCHEDULING_SUPPORTED || state.busy) return false;
    set({ busy: true, error: null });
    try {
      await ensureAndroidChannel();
      const current = await Notifications.getPermissionsAsync();
      let permissionNow = toPermission(current);
      if (permissionNow !== "granted" && current.canAskAgain !== false) {
        permissionNow = toPermission(await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }));
      }
      set({ permission: permissionNow });
      if (permissionNow !== "granted") return false;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: REMINDER_TITLE,
          body: settings?.discreetNotifications === false ? REMINDER_BODY_PLAIN : REMINDER_BODY_DISCREET,
          data: { kind: REMINDER_KIND, url: REMINDER_ROUTE },
          sound: "default",
        },
        trigger: null,
      });
      return true;
    } catch (err) {
      console.error("Could not send test notification", err);
      set({ error: "Couldn't send a test notification. Please try again." });
      return false;
    } finally {
      set({ busy: false });
    }
  }, [settings?.discreetNotifications]);

  return { enabled, permission, loading, busy, error, setEnabled, sendTestNotification };
}

/**
 * Keeps the OS in step with the settings for as long as the app is running:
 * on load, on every settings change, and on every return to the foreground —
 * because permission can be taken away from outside the app.
 */
/**
 * The reminder tap, read safely on every platform.
 *
 * expo-notifications is an Android and iOS module: on web the underlying
 * `getLastNotificationResponse` does not exist, and the hook throws from inside
 * its own mount effect, where none of the try/catch above can reach it. There is
 * nothing to read there anyway — these reminders are raised by the phone itself.
 * Platform.OS is fixed for the life of the bundle, so this branch resolves the
 * same way on every render and the hook order never shifts.
 */
export function useLastReminderResponse(): Notifications.NotificationResponse | null | undefined {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return Platform.OS === "web" ? undefined : Notifications.useLastNotificationResponse();
}

export function useReminderSync(settings: Settings | null): void {
  const { loading } = useReminderState();

  // Reads the device preference and the OS's answer. Neither prompts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readDevicePreference();
      if (cancelled) return;
      await refreshPermission();
      if (cancelled) return;
      set({ enabled: stored, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mode = settings?.reminderMode;
  const days = settings?.reminderDays.join(",");
  const time = settings?.reminderTime;
  const discreet = settings?.discreetNotifications;
  const signedOut = settings === null;

  // Waits for `loading` to clear, so the very first sync is never made on a
  // preference that has not been read off the disk yet.
  useEffect(() => {
    if (loading) return;
    if (!settings) {
      void clearReminders();
      return;
    }
    void syncReminders(settings);
    // The four fields the schedule is made of, rather than the settings object,
    // which is replaced on every unrelated edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mode, days, time, discreet, signedOut]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") return;
      void (async () => {
        await refreshPermission();
        // Retry failed scheduling even when permission has not changed.
        await syncReminders(settings);
      })();
    });
    return () => subscription.remove();
  }, [settings]);
}
