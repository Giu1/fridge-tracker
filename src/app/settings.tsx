import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { confirmAsk, notify } from '../lib/dialog';
import { Button, Card, Field, Label, Page } from '../components/ui';
import { resetDemo } from '../lib/demo';
import { productCount } from '../lib/localdb';
import { canLeaveDemo } from '../lib/mode';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

export default function Settings() {
  const t = useTheme();
  const { session, signOut, refreshMfa, demo } = useSession();
  const [count, setCount] = useState<number | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp[0]?.id ?? null);
  }, []);

  useEffect(() => {
    productCount().then(setCount);
    if (!demo) loadFactors();
  }, [loadFactors, demo]);

  const startEnrol = async () => {
    setBusy(true);
    // Remove half-finished enrolments first.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Fridge ${Platform.OS}` });
    setBusy(false);
    if (error) return notify('Could not start', error.message);
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const finishEnrol = async () => {
    if (!enrol) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.id, code });
    setBusy(false);
    if (error) return notify('Wrong code', 'Try the newest code from the app.');
    setEnrol(null);
    setCode('');
    await loadFactors();
    await refreshMfa();
  };

  const disable = async () => {
    if (!factorId || !(await confirmAsk('Turn off two-step sign-in?', 'Your password alone will be enough again.'))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return notify('Could not turn off', error.message);
    await loadFactors();
    await refreshMfa();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Page style={{ gap: 16 }}>
        <Card style={{ gap: 4 }}>
          <Label>Account</Label>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '600', marginTop: 4 }}>{session?.user.email}</Text>
        </Card>

        {demo && (
          <Card style={{ gap: 10 }}>
            <Label>Demo mode</Label>
            <Text style={{ color: t.text }}>
              Everything is saved only in this browser. There's no login, no sharing between devices and no AI: you name photos yourself in Review.
            </Text>
            <Button
              title="Delete all demo data"
              kind="danger"
              onPress={async () => {
                if (await confirmAsk('Delete all demo data?', 'Items, photos and pending reviews in this browser.', 'Delete')) await resetDemo();
              }}
            />
          </Card>
        )}

        {!demo && <Card style={{ gap: 12 }}>
          <Label>Two-step sign-in</Label>
          {factorId ? (
            <>
              <Text style={{ color: t.text }}>On. Each new sign-in asks for a code from your authenticator app.</Text>
              <Button title="Turn off" kind="danger" onPress={disable} />
            </>
          ) : enrol ? (
            <>
              <Text style={{ color: t.text }}>Scan this with Google Authenticator, 1Password, Authy… then type the code it shows.</Text>
              <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 12 }}>
                <Image source={{ uri: enrol.qr }} style={{ width: 200, height: 200 }} contentFit="contain" />
              </View>
              <Text selectable style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>Or enter the key: {enrol.secret}</Text>
              <Field value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit code" />
              <Button title="Confirm" onPress={finishEnrol} busy={busy} disabled={code.length !== 6} />
            </>
          ) : (
            <>
              <Text style={{ color: t.text }}>Off. Turn it on so a stolen password is not enough to open your fridge.</Text>
              <Button title="Turn on" onPress={startEnrol} busy={busy} />
            </>
          )}
        </Card>}

        <Card style={{ gap: 6 }}>
          <Label>This device</Label>
          <Text style={{ color: t.muted }}>{count ?? '…'} supermarket products saved locally for quick suggestions.</Text>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
            Product data and Nutri-Scores: Open Food Facts (openfoodfacts.org), Open Database License. Photo recognition: Claude.
          </Text>
        </Card>

        {(!demo || canLeaveDemo()) && <Button title={demo ? 'Leave demo, go to sign in' : 'Sign out'} kind="secondary" onPress={signOut} />}
      </Page>
    </ScrollView>
  );
}
