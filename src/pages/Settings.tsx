import AppShell from "@/components/AppShell";
import AppearanceSection from "@/components/settings/AppearanceSection";
import ProfileSection from "@/components/settings/ProfileSection";
import RemindersSection from "@/components/settings/RemindersSection";
import AccountSection from "@/components/settings/AccountSection";
import PrivacySection from "@/components/settings/PrivacySection";

const Settings = () => (
  <AppShell>
    <header className="animate-fade">
      <h1 className="page-title">Settings</h1>
      <div className="page-underline mt-3" />
    </header>

    {/* A scannable list: each line shows where the setting stands, and opens the rest in a dialog. */}
    <div className="mt-8 divide-y">
      <AppearanceSection />
      <ProfileSection />
      <RemindersSection />
      <AccountSection />
    </div>

    <PrivacySection />

    <p className="mt-12 text-xs leading-relaxed text-muted-foreground">
      Your journal syncs to Supabase. AI sharing is optional and can be turned off in Privacy & data.
    </p>
  </AppShell>
);

export default Settings;
