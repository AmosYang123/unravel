import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/store";
import { cn } from "@/lib/utils";
import Row from "./Row";
import SettingRow from "./SettingRow";

const REMINDERS = [
  { id: "manual", label: "Only when I open it" },
  { id: "daily", label: "Daily" },
  { id: "days", label: "Certain days" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
] as const;

const DAYS = [
  { short: "S", full: "Sunday" },
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday" },
  { short: "W", full: "Wednesday" },
  { short: "T", full: "Thursday" },
  { short: "F", full: "Friday" },
  { short: "S", full: "Saturday" },
];

const TEST_SENT = "Sent. Give it a minute, then check your inbox — or spam, if it's not there.";
const TEST_FAILED = "That didn't send. Try again in a moment.";

/** The function's own wording when it has one, never its internals. */
const testFailureMessage = async (error: unknown): Promise<string> => {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.text !== "function") return TEST_FAILED;
  try {
    const parsed: unknown = JSON.parse(await context.text());
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    /* fall through to the generic line */
  }
  return TEST_FAILED;
};

const RemindersSection = () => {
  const { settings, update } = useSettings();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  const sendTest = async () => {
    setTestState("sending");
    const { data, error } = await supabase.functions.invoke<{ sent?: boolean; error?: string }>(
      "send-test-reminder",
    );
    if (error || data?.error) {
      console.error("Test reminder failed", error);
      setTestMessage(error ? await testFailureMessage(error) : (data?.error ?? TEST_FAILED));
      setTestState("error");
      return;
    }
    setTestMessage(TEST_SENT);
    setTestState("sent");
  };

  const modeLabel = REMINDERS.find((r) => r.id === settings.reminderMode)?.label ?? "Off";
  const summary =
    settings.reminderMode === "manual" ? modeLabel : `${modeLabel}, ${settings.reminderTime}`;

  return (
    <>
      <SettingRow title="Check-in rhythm" value={summary} onClick={() => setOpen(true)} />

      {/* Left on the page, not tucked into the dialog: it works even with reminders off. */}
      <Row
        title="Send yourself a test"
        description="One real reminder, right now, so you can see what arrives. Works even with reminders off."
      >
        <Button
          variant="secondary"
          className="rounded-full"
          disabled={testState === "sending"}
          onClick={() => void sendTest()}
        >
          {testState === "sending" ? "Sending…" : testState === "sent" ? "Send again" : "Send a test"}
        </Button>
      </Row>
      {(testState === "sent" || testState === "error") && (
        <p
          role="status"
          className={cn(
            "-mt-2 pb-5 text-sm leading-relaxed",
            testState === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {testMessage}
        </p>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Check-in rhythm"
        description="How often, if ever, the app offers to remind you to check in."
      >
        <div className="flex flex-wrap gap-2">
          {REMINDERS.map((r) => (
            <button
              key={r.id}
              onClick={() => update({ reminderMode: r.id })}
              className={cn("chip px-4 py-2 text-sm", settings.reminderMode === r.id && "chip-active")}
            >
              {r.label}
            </button>
          ))}
        </div>

        {settings.reminderMode === "days" && (
          <div className="mt-4 flex gap-2">
            {DAYS.map((d, i) => (
              <button
                key={i}
                aria-label={d.full}
                onClick={() =>
                  update({
                    reminderDays: settings.reminderDays.includes(i)
                      ? settings.reminderDays.filter((x) => x !== i)
                      : [...settings.reminderDays, i],
                  })
                }
                className={cn(
                  "chip h-10 w-10 px-0 text-sm",
                  settings.reminderDays.includes(i) && "chip-active",
                )}
              >
                {d.short}
              </button>
            ))}
          </div>
        )}

        {settings.reminderMode !== "manual" && (
          <div className="mt-4 divide-y">
            <Row
              title="Time"
              description={`Sent around this time, in your local time zone (${settings.timezone}).`}
              htmlFor="settings-reminder-time"
            >
              <Input
                id="settings-reminder-time"
                type="time"
                value={settings.reminderTime}
                onChange={(e) => update({ reminderTime: e.target.value })}
                className="h-11 w-32 rounded-xl bg-card"
              />
            </Row>
            <Row
              title="Email reminders"
              description={`A short reminder email to ${user?.email ?? "your email"}. Turn it off any time.`}
            >
              <Switch
                checked={settings.reminderEmails}
                onCheckedChange={(v) => update({ reminderEmails: v })}
              />
            </Row>
            <Row title="Discreet wording" description='Emails read "A moment for you" — never the app name or your mood.'>
              <Switch
                checked={settings.discreetNotifications}
                onCheckedChange={(v) => update({ discreetNotifications: v })}
              />
            </Row>
          </div>
        )}
      </Dialog>
    </>
  );
};

export default RemindersSection;
