import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isTester: boolean;
  isOptIn: boolean;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isTester: false,
  isOptIn: false,
  refreshRoles: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTester, setIsTester] = useState(false);
  const [isOptIn, setIsOptIn] = useState(false);

  const checkRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (data || []).map(r => r.role as string);
    setIsAdmin(roles.includes("admin"));
    setIsTester(roles.includes("tester"));
    setIsOptIn(roles.includes("opt_in"));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsAdmin(false);
      setIsTester(false);
      setIsOptIn(false);
      if (session?.user) {
        setTimeout(() => checkRoles(session.user.id), 0);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkRoles(session.user.id);
        // Heartbeat: update last_seen_at at most once per hour per browser
        const key = `lastSeenPing:${session.user.id}`;
        const last = Number(localStorage.getItem(key) || 0);
        if (Date.now() - last > 60 * 60 * 1000) {
          localStorage.setItem(key, String(Date.now()));
          supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("user_id", session.user.id).then(() => {});
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshRoles = async () => {
    if (user) await checkRoles(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, isTester, isOptIn, refreshRoles, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
