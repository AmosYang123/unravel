import { useLocation } from "react-router-dom";
import { BookOpen, Home, Library, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/journal", label: "Today", icon: Home, end: true },
  { to: "/history", label: "Timeline", icon: BookOpen, end: false },
  { to: "/reading", label: "Reading", icon: Library, end: false },
  { to: "/insights", label: "Patterns", icon: Sparkles, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
];


const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-5 pb-32 pt-10 sm:px-8">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-gradient-to-t from-background via-background/95 to-background/70 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-4 py-2 sm:px-8">
          {tabs.map(({ to, label, icon: Icon, end }) => {
            const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] tracking-wide transition-all duration-300",
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-accent/15 to-transparent" />
                  )}
                  <Icon
                    className={cn("h-[1.15rem] w-[1.15rem] transition-transform duration-300", active && "scale-110")}
                    strokeWidth={active ? 2.1 : 1.5}
                  />
                  {label}
                  <span
                    className={cn(
                      "absolute -top-[1px] h-[2px] w-6 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent transition-opacity duration-300",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );

};

export default AppShell;
