import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Field } from '@/components/ui';
import { colors, space, type } from '@/theme';

type Errors = Partial<Record<'username' | 'email' | 'password' | 'confirm', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[A-Za-z0-9]{6,20}$/.test(username)) e.username = 'Use 6 to 20 letters or numbers.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address.';
    if (password.length < 8) e.password = 'Use at least 8 characters.';
    if (confirm !== password) e.confirm = "Passwords don't match.";
    return e;
  }

  async function submit() {
    const e = validate();
    setErrors(e);

    if (Object.keys(e).length) return;

    setBusy(true);
    setBanner(null);

    try {
      await register({
        username,
        email,
        password,
        inviteCode: inviteCode || undefined,
      });
      // The root layout now shows the access screen, since a new account has no key yet.
    } catch (err: any) {
      setBanner({
        kind: 'bad',
        text: err.message || 'Registration failed. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create account" subtitle="A practice space for building and testing CAPTCHA flows.">
      {banner ? <Banner kind={banner.kind} text={banner.text} /> : null}
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="6 or more letters or numbers" error={errors.username} />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        error={errors.email}
      />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" error={errors.password} />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Type it again" error={errors.confirm} />
      <Field
        label="Invite code (optional)"
        value={inviteCode}
        onChangeText={(t) => setInviteCode(t.toUpperCase())}
        autoCapitalize="characters"
        placeholder="From a friend"
      />
      <Button title="Create account" onPress={submit} loading={busy} style={{ marginTop: space(2) }} />
      <Text style={[type.small, { textAlign: 'center', marginTop: space(6), fontSize: 15 }]}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: colors.accent, fontWeight: '700' }}>
          Sign in
        </Link>
      </Text>
    </AuthShell>
  );
}
