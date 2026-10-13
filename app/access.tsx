// Shown to signed-in users whose account has no active key yet.
// Keys only come from the admin, so this screen just explains that and re-checks.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card } from '@/components/ui';
import { colors, space, type } from '@/theme';

export default function AccessScreen() {
  const { user, refreshUser, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<{ kind: 'info' | 'bad'; text: string } | null>(null);

  // When the admin has given a key, hasAccess flips and the root layout opens the lab by itself
  const checkAgain = async () => {
    setChecking(true);
    setNote(null);
    try {
      await refreshUser();
      setNote({ kind: 'info', text: 'No access yet. Check again once the admin has confirmed.' });
    } catch (err: any) {
      setNote({ kind: 'bad', text: err?.message || 'Could not check. Try again in a moment.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen title="Almost there" subtitle="Your account is waiting for access from the admin.">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="lock-closed-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: space(3) }}>
            <Text style={type.h3}>No access yet</Text>
            <Text style={type.small}>The admin gives each account its access key.</Text>
          </View>
        </View>

        <Text style={[type.body, { marginTop: space(4), lineHeight: 22 }]}>
          Send the admin the username or email below. Once they've added a key to your account, tap Check again.
          There's nothing to type in.
        </Text>

        <View style={{ marginTop: space(4), backgroundColor: colors.bg, borderRadius: 12, padding: space(3) }}>
          <Text style={type.small}>Username</Text>
          <Text style={[type.h3, { marginBottom: space(2) }]} selectable>
            {user?.username ?? '...'}
          </Text>
          <Text style={type.small}>Email</Text>
          <Text style={type.h3} selectable>
            {user?.email ?? '...'}
          </Text>
        </View>
      </Card>

      {note ? (
        <View style={{ marginTop: space(3) }}>
          <Banner kind={note.kind} text={note.text} />
        </View>
      ) : null}

      <Button title="Check again" icon="refresh-outline" onPress={checkAgain} loading={checking} style={{ marginTop: space(4) }} />
      <Button title="Sign out" variant="ghost" onPress={logout} disabled={checking} style={{ marginTop: space(2) }} />
    </Screen>
  );
}
