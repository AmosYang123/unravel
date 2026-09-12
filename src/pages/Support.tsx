import { Link } from "react-router-dom";
import SupportContact from "@/components/SupportContact";

export default function Support() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="text-sm underline">Back to Unravel</Link>
      <h1 className="page-title mt-8">Unravel support</h1>
      <SupportContact />
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Account and journal help</h2>
        <p className="mt-3 leading-relaxed">Use Forgot password on the sign-in screen to reset your password. You can export your journal in Settings → Privacy &amp; data, and permanently delete your account in Settings → Account.</p>
        <p className="mt-3 leading-relaxed">If you cannot sign in or complete deletion, contact support. Do not send your password or private journal content.</p>
      </section>
      <Link to="/privacy" className="inline-block mt-8 underline">Privacy policy</Link>
    </main>
  );
}
