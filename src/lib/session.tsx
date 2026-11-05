import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isConfigured, supabase } from './supabase';

type Aal = 'aal1' | 'aal2' | null;

interface Ctx {
  ready: boolean;
  session: Session | null;
  /** true when this account has 2FA enabled but this login has not passed it yet */
  needsMfa: boolean;
  refreshMfa: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [aal, setAal] = useState<{ current: Aal; next: Aal }>({ current: null, next: null });

  const refreshMfa = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ current: (data?.currentLevel as Aal) ?? null, next: (data?.nextLevel as Aal) ?? null });
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setReady(true);
      return;
    }
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await refreshMfa();
      setReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) setTimeout(refreshMfa, 0); // don't call auth methods inside the callback
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshMfa]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const needsMfa = !!session && aal.next === 'aal2' && aal.current !== 'aal2';

  return (
    <SessionContext.Provider value={{ ready, session, needsMfa, refreshMfa, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
