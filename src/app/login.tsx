import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Field, Page } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

export default function Login() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    // Same message for every failure: don't reveal which accounts exist.
    if (e) setError('Wrong e-mail or password.');
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <Page style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 14, maxWidth: 420 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 34 }}>🧊</Text>
        </View>
        <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }}>Fridge</Text>
        <Text style={{ color: t.muted, fontSize: 16, marginBottom: 12 }}>Private. Just the two of you.</Text>
        <Field placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <Field placeholder="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {error && <Text style={{ color: t.danger, fontWeight: '600' }}>{error}</Text>}
        <Button title="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />
      </Page>
    </KeyboardAvoidingView>
  );
}
