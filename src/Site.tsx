import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import Privacy from "@/pages/Privacy";
import Support from "@/pages/Support";

// Public pages never import the account client or start a journal session.
const JournalApp = lazy(() => import("./App"));
const journalConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export function SiteRoutes() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/support" element={<Support />} />
    <Route path="*" element={journalConfigured
      ? <Suspense fallback={<p role="status" className="p-8">Opening your journal…</p>}><JournalApp /></Suspense>
      : <main className="mx-auto max-w-2xl px-6 py-24"><h1 className="page-title">The journal is not available here yet.</h1><p className="my-6">You can still learn about Unravel and read our privacy and support information.</p><Link className="underline" to="/">Back to Unravel</Link></main>} />
  </Routes>;
}

export default function Site() {
  return <BrowserRouter><SiteRoutes /></BrowserRouter>;
}
