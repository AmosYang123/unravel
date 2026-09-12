import { Link } from "react-router-dom";
import { AI_SHARING_NOTICE } from "@/lib/privacy";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { fetchAllEntries, hashPasscode, useEntries, useSettings } from "@/lib/store";
import { buildJournalExport } from "@/lib/exportJournal";
import { MODE_META } from "@/lib/content";
import Row from "./Row";
import SettingRow from "./SettingRow";

const PrivacySection = () => {
  const { settings, update } = useSettings();
  const { deletedEntries, clearAll, loading, error, restoreEntry, purgeEntry } = useEntries();
  const { user } = useAuth();
  const [confirmSharing, setConfirmSharing] = useState(false);
  const [savingSharing, setSavingSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const saveSharing = async (enabled: boolean) => {
    setConfirmSharing(false);
    setSavingSharing(true);
    try {
      await update({ aiSuggestionsEnabled: enabled });
    } catch {
      toast("Couldn't save your sharing choice. Please try again.");
    } finally {
      setSavingSharing(false);
    }
  };

  const deletedSummary = loading
    ? "Loading…"
    : error
      ? "Unavailable"
      : deletedEntries.length === 0
        ? "Nothing here"
        : `${deletedEntries.length} ${deletedEntries.length === 1 ? "entry" : "entries"}`;

  const handleRestore = async (id: string) => {
    setPendingId(id);
    try {
      await restoreEntry(id);
      toast("Entry restored.");
    } catch (err) {
      console.error("Restore failed", err);
      toast("That didn't restore. Try again.");
    } finally {
      setPendingId(null);
    }
  };

  const handlePurge = async (id: string) => {
    setPendingId(id);
    try {
      await purgeEntry(id);
    } catch (err) {
      console.error("Purge failed", err);
      toast("That didn't delete. Try again.");
    } finally {
      setPendingId(null);
    }
  };

  const closeCodeEditor = () => {
    setEditingCode(false);
    setNewCode("");
    setConfirmCode("");
  };

  const toggleLock = async (enabled: boolean) => {
    if (enabled) {
      setEditingCode(true);
      return;
    }
    setSavingCode(true);
    try {
      await update({ lockEnabled: false, passcode: "" });
      closeCodeEditor();
    } catch {
      toast("Couldn't turn off the lock. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  const saveCode = async () => {
    if (savingCode) return;
    if (newCode.length !== 4) {
      toast("Your code needs to be 4 digits.");
      return;
    }
    if (newCode !== confirmCode) {
      toast("Those two codes don't match.");
      return;
    }
    setSavingCode(true);
    try {
      await update({ lockEnabled: true, passcode: await hashPasscode(newCode) });
      closeCodeEditor();
      toast("Code saved.");
    } catch (err) {
      console.error("Passcode save failed", err);
      toast("That didn't save. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      // The whole history, not the pages loaded on screen: the file promises every entry.
      const all = await fetchAllEntries();
      const text = buildJournalExport(all, settings, user?.email);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unravel-journal-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      // Some browsers cancel the download if the object URL is revoked immediately.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Export failed", err);
      toast("That export didn't finish. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="section-label">Privacy &amp; data</h2>
      <Link to="/privacy" className="inline-block py-4 underline">Privacy policy</Link>
      <Link to="/support" className="inline-block py-4 ml-6 underline">Support</Link>
      <div className="mt-2 divide-y">
        <Row title="Passcode lock" description="Ask for a 4-digit code when the app opens, on top of your password.">
          <Switch
            checked={settings.lockEnabled}
            disabled={savingCode}
            onCheckedChange={(v) => void toggleLock(v)}
          />
        </Row>
        {(settings.lockEnabled || editingCode) && (
          <Row
            title="Code"
            description="A quick second lock — not a replacement for your password."
            htmlFor={editingCode ? "settings-passcode" : undefined}
          >
            {editingCode ? (
              <div className="flex flex-col items-end gap-2">
                <Input
                  id="settings-passcode"
                  type="password"
                  autoFocus
                  value={newCode}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setNewCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 digits"
                  className="h-11 w-28 rounded-xl bg-card tracking-[0.3em]"
                  aria-label="New code"
                />
                <Input
                  type="password"
                  value={confirmCode}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Repeat"
                  className="h-11 w-28 rounded-xl bg-card tracking-[0.3em]"
                  aria-label="Repeat new code"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={savingCode} onClick={closeCodeEditor} className="rounded-full">
                    Cancel
                  </Button>
                  <Button variant="secondary" disabled={savingCode} onClick={saveCode} className="rounded-full">
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setEditingCode(true)}
                className="rounded-full"
              >
                {settings.passcode ? "Change code" : "Set code"}
              </Button>
            )}
          </Row>
        )}
        <Row
          title="AI suggestions"
          description="Optional sharing with Google Gemini, Groq, Google Search and Deezer. Review the details before enabling. Your journal still syncs to Supabase when this is off."
        >
          <Switch
            checked={settings.aiSuggestionsEnabled}
            disabled={savingSharing}
            onCheckedChange={(v) => v ? setConfirmSharing(true) : void saveSharing(false)}
          />
        </Row>
        <Row title="Export a copy" description="A clearly labelled text file with your preferences and every entry, newest first.">
          <Button variant="secondary" onClick={exportData} disabled={exporting} className="rounded-full">
            {exporting ? "Gathering…" : "Export"}
          </Button>
        </Row>
        <SettingRow
          title="Recently deleted"
          value={deletedSummary}
          onClick={() => setShowDeleted(true)}
        />
        <Row title="Delete all entries" description="Immediate and permanent, including voice recordings.">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="rounded-full text-destructive hover:text-destructive">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete every entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every entry and every voice recording will be erased from your account. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep them</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await clearAll();
                      toast("Everything deleted.");
                    } catch (err) {
                      console.error("Delete all entries failed", err);
                      toast("That delete didn't finish. Your entries are still here.");
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Row>
      </div>

      <AlertDialog open={confirmSharing} onOpenChange={setConfirmSharing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow optional data sharing?</AlertDialogTitle>
            <AlertDialogDescription>{AI_SHARING_NOTICE}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveSharing(true)}>Allow sharing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={showDeleted}
        onClose={() => setShowDeleted(false)}
        title="Recently deleted"
        description="Removed for good after a week. Until then, you can bring an entry back."
      >
        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Couldn't load these right now.</p>
          ) : deletedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            deletedEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm">{e.title ?? MODE_META[e.mode].label}</p>
                  <p className="text-xs text-muted-foreground">
                    Deleted{" "}
                    {e.deletedAt &&
                      new Date(e.deletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    disabled={pendingId === e.id}
                    onClick={() => handleRestore(e.id)}
                  >
                    Restore
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-destructive hover:text-destructive"
                        disabled={pendingId === e.id}
                      >
                        Delete forever
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this entry for good?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This can't be undone, unlike the first delete.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handlePurge(e.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </section>
  );
};

export default PrivacySection;
