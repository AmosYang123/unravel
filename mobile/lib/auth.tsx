import { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearUserData, loadUserData } from "@/lib/store";

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    let currentUserId: string | null = null;
    const applySession = (next: Session | null) => {
      if (!active) return;
      const nextUserId = next?.user.id ?? null;
      if (nextUserId !== currentUserId) {
        currentUserId = nextUserId;
        clearUserData();
        if (nextUserId) void loadUserData(nextUserId);
      }
      setSession(next);
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      receivedEvent = true;
      applySession(next);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!receivedEvent) applySession(data.session);
    }).catch(() => {
      if (!receivedEvent) applySession(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // On native the token refresh timer must follow the app's foreground state,
  // otherwise it keeps firing while the app is backgrounded.
  useEffect(() => {
    const onChange = (next: string) => {
      if (next === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    onChange(AppState.currentState);
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Never leave the UI signed in holding local data if the call rejects.
      setSession(null);
      clearUserData();
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

/* ---------- password rules ---------- */

// Password rule: eight characters, nothing else.
//
// This has to sit at or above the project's own minimum (GoTrue's default is
// six). Below it the form accepts a password the server then refuses, and
// describeAuthError answers that refusal by quoting this number back — telling
// someone to use at least four characters when four is exactly what was just
// rejected.
export const MIN_PASSWORD_LENGTH = 8;

export const passwordMeetsRule = (v: string) => v.length >= MIN_PASSWORD_LENGTH;
