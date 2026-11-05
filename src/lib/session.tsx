import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { initMode, isDemo, setDemo } from './mode';
import { supabase } from './supabase';

type Aal = 'aal1' | 'aal2' | null;

interface Ctx {
  ready: boolean;
  session: Session | null;
  /** true when this account has 2FA enabled but this login has not passed it yet */
  needsMfa: boolean;
  refreshMfa: () => Promise<void>;
  signOut: () => Promise<void>;
  /** demo mode: everything stays in this browser, no account */
  demo: boolean;
  enterDemo: () => Promise<void>;
}

const DEMO_SESSION = { user: { id: 'demo', email: 'demo (this browser only)' } } as unknown as Session;

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemoState] = useState(isDemo());
  const [aal, setAal] = useState<{ current: Aal; next: Aal }>({ current: null, next: null });

  const refreshMfa = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ current: (data?.currentLevel as Aal) ?? null, next: (data?.nextLevel as Aal) ?? null });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (await initMode()) {
        setDemoState(true);
        setReady(true);
        return;
      }
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
    if (demo) {
      await setDemo(false);
      setDemoState(isDemo());
      return;
    }
    await supabase.auth.signOut();
  };

  const enterDemo = async () => {
    await setDemo(true);
    setDemoState(true);
  };

  const needsMfa = !demo && !!session && aal.next === 'aal2' && aal.current !== 'aal2';

  return (
    <SessionContext.Provider
      value={{ ready, session: demo ? DEMO_SESSION : session, needsMfa, refreshMfa, signOut, demo, enterDemo }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
