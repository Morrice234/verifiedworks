import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Field } from '@/components/ui';
import { colors, space, type } from '@/theme';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // The root layout's guard switches to the tabs automatically.
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to keep practising CAPTCHA challenges.">
      {error ? <Banner kind="bad" text={error} /> : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" onSubmitEditing={submit} />
      <Button title="Sign in" onPress={submit} loading={busy} style={{ marginTop: space(2) }} />
      <Text style={[type.small, { textAlign: 'center', marginTop: space(6), fontSize: 15 }]}>
        New here?{' '}
        <Link href="/register" style={{ color: colors.accent, fontWeight: '700' }}>
          Create an account
        </Link>
      </Text>
    </AuthShell>
  );
}
