import { ArrowUpRight, BookOpen, Wind, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo-unravel.png";
import { releaseConfig } from "@/lib/release-config";

const features = [
  { icon: PenLine, number: "01", title: "Let it out.", text: "A few words, a longer entry, or a voice memo. Start wherever you are, without needing to make it sound right." },
  { icon: Wind, number: "02", title: "Take a breath.", text: "Pause with a guided breathing exercise. A little room between what happened and what comes next." },
  { icon: BookOpen, number: "03", title: "Notice your days.", text: "Check in with your mood and energy, revisit your entries, and see patterns over time." },
];

export default function Landing() {
  return <div className="public-site">
    <a href="#main" className="sr-only focus:not-sr-only focus:p-4">Skip to content</a>
    <header className="site-header">
      <Link to="/" className="site-brand" aria-label="Unravel home"><img src={logo} alt="" />unravel</Link>
      <nav aria-label="Main navigation"><a href="#a-little-space">About</a><Link to="/privacy">Privacy</Link><Link to="/support">Support <ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
    </header>
    <main id="main">
      <section className="site-hero">
        <div className="hero-copy"><p className="site-eyebrow">A little space for yourself</p>
          <h1>You don’t have to<br />hold it <em>all.</em></h1>
          <p className="hero-description">A quiet place to put your thoughts, check in with yourself, and take the day one breath at a time.</p>
          <a className="site-button" href="#a-little-space">Meet Unravel <ArrowUpRight size={18} aria-hidden="true" /></a>
          <p className="site-note">A journaling app, in preparation for launch.</p>
        </div>
        <div className="journal-preview" aria-label="Illustrative journal entry with fictional content">
          <div className="preview-label">A MOMENT, JUST FOR YOU <span>↗</span></div>
          <p className="preview-date">Today, at your own pace</p>
          <h2>How are you,<br /><em>really?</em></h2>
          <p className="preview-entry">Today felt like a lot. But I went for a walk, put my phone away, and noticed the sky for a minute.</p>
          <div className="preview-line" /><div className="preview-line short" />
          <span className="preview-tag">a little lighter</span>
          <p className="preview-caption">A small example. Your words will be your own.</p>
        </div>
      </section>
      <section id="a-little-space" className="site-features">
        <div className="section-heading"><p className="site-eyebrow">No perfect words required</p><h2>Make room for<br />what’s on your mind.</h2></div>
        <div className="feature-grid">{features.map(({ icon: Icon, number, title, text }) => <article key={number} className="site-feature"><div className="feature-top"><Icon size={25} strokeWidth={1.3} aria-hidden="true" /><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className="site-privacy"><p className="site-eyebrow">Your journal. Your choices.</p><h2>Personal thoughts deserve care.</h2><p>Entries aren’t public. You can export your journal, delete entries, and delete your account. Cloud sync uses service providers and is not end-to-end encrypted. Optional AI features require your permission.</p><Link to="/privacy">Read how your data is handled <ArrowUpRight size={17} aria-hidden="true" /></Link></section>
      <section className="site-closing"><p className="site-eyebrow">One thought at a time</p><h2>There’s room for you here.</h2><Link to="/support" className="site-button">Questions? Visit support <ArrowUpRight size={18} aria-hidden="true" /></Link></section>
    </main>
    <footer className="site-footer"><div><span className="font-display text-2xl">unravel</span><p>Operated by {releaseConfig.ownerName}.</p></div><div><Link to="/privacy">Privacy policy</Link><Link to="/support">Support</Link><Link to="/journal">Open web journal</Link></div><p className="footer-note">For journaling and general wellbeing. Not medical care or an emergency service.</p></footer>
  </div>;
}
