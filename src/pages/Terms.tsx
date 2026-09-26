import { Link } from "react-router-dom";
import { TERMS_SECTIONS } from "@/lib/terms";
import SupportContact from "@/components/SupportContact";

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/auth" className="text-sm underline">Back to Unravel</Link>
      <h1 className="page-title mt-8">Terms of use</h1>
      <p className="mt-3 text-sm text-muted-foreground">Updated September 21, 2026</p>
      {TERMS_SECTIONS.map(({ title, text }) => (
        <section key={title} className="mt-8">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-3 leading-relaxed">{text}</p>
        </section>
      ))}
      <SupportContact />
      <div className="mt-8 flex gap-6">
        <Link to="/privacy" className="underline">Privacy policy</Link>
        <Link to="/support" className="underline">Support</Link>
      </div>
      <Link to="/auth" className="inline-block mt-8 text-sm underline">Back to Unravel</Link>
    </main>
  );
}
