import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { api } from '@/api';
import { resetMockDb } from '@/api/mock';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Field, SectionTitle } from '@/components/ui';
import { colors, space, type } from '@/theme';

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setCity(user?.city ?? '');
  }, [user]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), city: city.trim() });
      setMsg({ kind: 'good', text: 'Profile saved.' });
    } catch (e: any) {
      setMsg({ kind: 'bad', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  function confirmReset() {
    const reset = async () => {
      await resetMockDb();
      await logout();
    };
    // Alert.alert does nothing in a browser, so use the browser's own dialog there.
    if (Platform.OS === 'web') {
      if (window.confirm('Reset demo data? This deletes every account and record stored on this device.')) reset();
      return;
    }
    Alert.alert('Reset demo data?', 'This deletes every account and record stored on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: reset,
      },
    ]);
  }

  return (
    <Screen title="Profile">
      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>{user?.username[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ marginLeft: space(3), flex: 1 }}>
          <Text style={type.h2}>{user?.username}</Text>
          <Text style={type.small}>{user?.email}</Text>
        </View>
      </Card>

      <SectionTitle>Personal details</SectionTitle>
      <Text style={[type.small, { marginTop: -space(2), marginBottom: space(3) }]}>All optional.</Text>
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Field label="First name" value={firstName} onChangeText={setFirstName} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last name" value={lastName} onChangeText={setLastName} />
        </View>
      </View>
      <Field label="City" value={city} onChangeText={setCity} />
      <Button title="Save changes" onPress={save} loading={saving} />

      <SectionTitle>More</SectionTitle>
      <Card style={{ paddingVertical: space(1) }}>
        <Item icon="people-outline" label="Invite friends" onPress={() => router.navigate('/invite')} />
	<Item icon="wallet-outline" label="Withdraw" onPress={() => router.navigate('/withdraw')} />
	<Item icon="swap-horizontal-outline" label="Transfer Funds" onPress={() => router.navigate('/transfer')} />
	<Item icon="card-outline" label="Linked Wallets" onPress={() => router.navigate('/linked-wallets')} />
        <Item icon="help-circle-outline" label="Help & FAQ" onPress={() => router.push('/faq')} />
        <Item
          icon="server-outline"
          label="Backend"
          detail={api.mode === 'mock' ? 'Offline demo' : process.env.EXPO_PUBLIC_API_URL}
        />
        {api.mode === 'mock' ? <Item icon="trash-outline" label="Reset demo data" onPress={confirmReset} danger /> : null}
        <Item icon="log-out-outline" label="Sign out" onPress={logout} last />
      </Card>
    </Screen>
  );
}

function Item({
  icon,
  label,
  detail,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const fg = danger ? colors.bad : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space(3.5),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[type.body, { flex: 1, marginLeft: space(3), color: fg }]}>{label}</Text>
      {detail ? <Text style={[type.small, { maxWidth: 170 }]} numberOfLines={1}>{detail}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}
