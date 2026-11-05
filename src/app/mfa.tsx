import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Field, Page } from '../components/ui';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

/** Second step of sign-in when two-factor is on: 6-digit code from the authenticator app. */
export default function Mfa() {
  const t = useTheme();
  const { refreshMfa, signOut } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: e1 } = await supabase.auth.mfa.listFactors();
      if (e1) throw e1;
      const totp = factors.totp[0];
      if (!totp) throw new Error('No authenticator set up');
      const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
      if (e2) throw e2;
      await refreshMfa();
    } catch {
      setError('That code did not work. Try the newest one.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 14, maxWidth: 420 }}>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>Two-step check</Text>
      <Text style={{ color: t.muted, fontSize: 16 }}>Enter the 6-digit code from your authenticator app.</Text>
      <Field
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        placeholder="123456"
        style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
        onSubmitEditing={verify}
        autoFocus
      />
      {error && <Text style={{ color: t.danger, fontWeight: '600' }}>{error}</Text>}
      <Button title="Verify" onPress={verify} busy={busy} disabled={code.length !== 6} />
      <Button title="Use another account" kind="ghost" onPress={signOut} />
    </Page>
  );
}
