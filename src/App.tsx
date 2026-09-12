import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import LockGate from "./components/LockGate";
import { AuthProvider, useAuth } from "@/lib/auth";
import { applyAppearance, loadUserData, useSettings } from "@/lib/store";

const Privacy = lazy(() => import("./pages/Privacy"));
const Support = lazy(() => import("./pages/Support"));
const Home = lazy(() => import("./pages/Home"));
const Compose = lazy(() => import("./pages/Compose"));
const History = lazy(() => import("./pages/History"));
const EntryDetail = lazy(() => import("./pages/EntryDetail"));
const Insights = lazy(() => import("./pages/Insights"));
const Reading = lazy(() => import("./pages/Reading"));
const Impact = lazy(() => import("./pages/Impact"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Breathe = lazy(() => import("./pages/Breathe"));
const AuthPage = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const Appearance = () => {
  const { settings } = useSettings();
  useEffect(() => applyAppearance(settings), [settings]);
  return null;
};

export const RequireAuth = () => {
  const { session, loading, signOut } = useAuth();
  const { settings, loading: settingsLoading, error } = useSettings();
  const location = useLocation();

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (settingsLoading) return <div className="min-h-screen bg-background" />;
  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <p>Couldn't load your account. Please try again.</p>
      <button onClick={() => void loadUserData(session.user.id)}>Try again</button>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
  // Asked once, on the first visit after signing in. `onboardedAt` is stamped
  // whether the questions were answered or skipped, so this never fires twice.
  // It waits for the profile to arrive so a slow load can't flash the questions
  // at someone who has already been through them.
  if (!settingsLoading && !settings.onboardedAt && location.pathname !== "/onboarding")
    return <Navigate to="/onboarding" replace />;
  return <LockGate key={session.user.id}><Outlet /></LockGate>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
        <AuthProvider>
          <Appearance />
          <Toaster />
          <Sonner />
          <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/support" element={<Support />} />
              <Route path="/auth" element={<AuthPage />} />
              {/* Public: arrives from an email link before a normal sign-in. */}
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/journal" element={<Home />} />
              <Route path="/write" element={<Compose />} />
              <Route path="/history" element={<History />} />
              <Route path="/entry/:id" element={<EntryDetail />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/reading" element={<Reading />} />
              <Route path="/impact" element={<Impact />} />

              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/breathe" element={<Breathe />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
