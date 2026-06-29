import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
  signUpWithEmail: async () => ({ error: null }),
  signInWithEmail: async () => ({ error: null }),
  signOut: async () => { /* no-op default */ },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  // Initialize Supabase client
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await getSupabaseBrowserClientWithRetry();
        if (!cancelled) setSupabase(client);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for auth changes
  useEffect(() => {
    if (!supabase) return;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, updatedSession) => {
        setSession(updatedSession);
        setUser(updatedSession?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signUpWithEmail = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not initialized' };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // Immediately set session to avoid race condition with navigation
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    }
    return { error: null };
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not initialized' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Immediately set session to avoid race condition with navigation
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    }
    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!user,
        isLoading,
        signUpWithEmail,
        signInWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
