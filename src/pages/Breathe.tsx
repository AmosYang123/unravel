import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import BreathingSession from "@/components/BreathingSession";

const Breathe = () => (
  <AppShell>
    <Link to="/journal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back
    </Link>
    <h1 className="page-title mt-8">A minute of breathing</h1>
    <div className="page-underline mt-3" />
    <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
      Follow the circle if it helps, or close your eyes and use the counts. Leaving early is fine.
    </p>
    <BreathingSession />
  </AppShell>
);

export default Breathe;
