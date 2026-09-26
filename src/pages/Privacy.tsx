import { Link } from "react-router-dom";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import SupportContact from "@/components/SupportContact";

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/auth" className="text-sm underline">Back to Unravel</Link>
      <h1 className="page-title mt-8">Privacy policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Updated September 12, 2026</p>
      {PRIVACY_SECTIONS.map(({ title, text }) => (
        <section key={title} className="mt-8">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-3 leading-relaxed">{text}</p>
        </section>
      ))}
      <SupportContact />
      <div className="mt-8 flex gap-6">
        <Link to="/terms" className="underline">Terms of use</Link>
        <Link to="/support" className="underline">Support</Link>
      </div>
      <details className="mt-8">
        <summary className="cursor-pointer underline">Font licenses</summary>
        <p className="mt-3 text-sm leading-relaxed">
          The complete bundled licenses are available for <a className="underline" href="/licenses/Fraunces-LICENSE.txt">Fraunces</a> and <a className="underline" href="/licenses/Karla-LICENSE.txt">Karla</a>.
        </p>
      </details>
      <Link to="/auth" className="inline-block mt-8 text-sm underline">Back to Unravel</Link>
    </main>
  );
}
