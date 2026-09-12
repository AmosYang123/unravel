import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const os = vi.hoisted(() => ({
  permission: vi.fn(), request: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), store: vi.fn(),
}));
vi.mock("../mobile/node_modules/react-native", () => ({ Platform: { OS: "ios" }, AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => ({ default: { setItem: os.store, getItem: async () => "off" } }));
vi.mock("../mobile/node_modules/expo-notifications", () => ({
  setNotificationHandler: vi.fn(), getPermissionsAsync: os.permission, requestPermissionsAsync: os.request,
  scheduleNotificationAsync: os.schedule, cancelAllScheduledNotificationsAsync: os.cancel,
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4, DENIED: 1 },
  PermissionStatus: { GRANTED: "granted", DENIED: "denied" },
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" },
}));
import { clearReminders, reminderSchedules, syncReminders, useDeviceReminders } from "../mobile/lib/notifications";
import type { Settings } from "../mobile/lib/types";
const settings = { reminderMode: "daily", reminderTime: "21:30", reminderDays: [1, 3, 5], discreetNotifications: true } as Settings;
afterEach(cleanup);
beforeEach(async () => {
  os.cancel.mockResolvedValue(undefined);
  os.schedule.mockReset().mockResolvedValue("scheduled");
  os.permission.mockReset().mockResolvedValue({ status: "granted", ios: { status: 2 } });
  os.request.mockReset();
  os.store.mockReset().mockResolvedValue(undefined);
  await clearReminders();
});
describe("native reminder scheduling", () => {
  it("builds daily, selected weekdays, weekly and monthly schedules", () => {
    expect(reminderSchedules(settings)[0].trigger).toEqual({ type: "daily", hour: 21, minute: 30 });
    expect(reminderSchedules({ ...settings, reminderMode: "days", reminderDays: [0, 0, 6, -1, 7] }).map((s) => s.trigger)).toEqual([
      { type: "weekly", weekday: 1, hour: 21, minute: 30 }, { type: "weekly", weekday: 7, hour: 21, minute: 30 },
    ]);
    expect(reminderSchedules({ ...settings, reminderMode: "weekly", reminderDays: [] })[0].trigger).toEqual({ type: "weekly", weekday: 2, hour: 21, minute: 30 });
    expect(reminderSchedules({ ...settings, reminderMode: "monthly" })[0].trigger).toEqual({ type: "monthly", day: 1, hour: 21, minute: 30 });
    expect(reminderSchedules({ ...settings, reminderMode: "manual" })).toEqual([]);
  });
  it("schedules with granted iOS permission and avoids duplicate syncs", async () => {
    const { result } = renderHook(() => useDeviceReminders(settings));
    await act(async () => { await result.current.setEnabled(true); await syncReminders(settings); });
    expect(os.schedule).toHaveBeenCalledTimes(1);
    expect(os.schedule.mock.calls[0][0].content.data.url).toBe("/write?mode=short");
    expect(os.request).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
  it("sends an immediate test notification without changing the repeating schedule", async () => {
    const { result } = renderHook(() => useDeviceReminders(settings));
    let sent = false;
    await act(async () => { sent = await result.current.sendTestNotification(); });
    expect(sent).toBe(true);
    expect(os.schedule).toHaveBeenCalledOnce();
    expect(os.schedule.mock.calls[0][0]).toEqual(expect.objectContaining({
      content: expect.objectContaining({ title: "A moment for you", data: { kind: "check-in-reminder", url: "/write?mode=short" } }),
      trigger: null,
    }));
    expect(os.store).not.toHaveBeenCalled();
  });
  it("shows OS scheduling failures and can retry the same schedule", async () => {
    os.schedule.mockRejectedValueOnce(new Error("OS refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useDeviceReminders(settings));
    await act(async () => result.current.setEnabled(true));
    expect(result.current.error).toContain("Couldn't schedule");
    expect(result.current.busy).toBe(false);
    await act(async () => syncReminders(settings));
    expect(result.current.error).toBeNull();
    expect(os.schedule).toHaveBeenCalledTimes(2);
  });
  it("does not schedule when permission was refused", async () => {
    os.permission.mockResolvedValue({ status: "denied", ios: { status: 1 }, canAskAgain: false });
    const { result } = renderHook(() => useDeviceReminders(settings));
    await act(async () => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(false);
    expect(os.schedule).not.toHaveBeenCalled();
    expect(os.request).not.toHaveBeenCalled();
  });
  it("reports a failed preference write without an unhandled rejection", async () => {
    os.store.mockRejectedValueOnce(new Error("disk full"));
    const { result } = renderHook(() => useDeviceReminders(settings));
    await act(async () => result.current.setEnabled(true));
    expect(result.current.error).toContain("Couldn't update");
    expect(result.current.busy).toBe(false);
  });
});
