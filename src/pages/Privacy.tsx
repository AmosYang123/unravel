import { Link } from "react-router-dom";
import { PRIVACY_SECTIONS } from "@/lib/privacy";
import SupportContact from "@/components/SupportContact";
import { FONT_LICENSES } from "../../mobile/lib/font-licenses";

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="text-sm underline">Back to Unravel</Link>
      <h1 className="page-title mt-8">Privacy policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Updated September 12, 2026</p>
      {PRIVACY_SECTIONS.map(({ title, text }) => (
        <section key={title} className="mt-8">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-3 leading-relaxed">{text}</p>
        </section>
      ))}
      <SupportContact />
      <Link to="/support" className="inline-block mt-8 underline">Support</Link>
      <details className="mt-8">
        <summary className="cursor-pointer underline">Font licenses</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{FONT_LICENSES}</p>
      </details>
    </main>
  );
}
