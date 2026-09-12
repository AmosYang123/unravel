import { createContext, useContext, useEffect, useState } from "react";
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
