import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { api } from '@/api';
import { useToken } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, SectionTitle } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useFocusData } from '@/lib/useAsync';
import { colors, space, type } from '@/theme';

export default function Invite() {
  const token = useToken();
  const { data, error, refreshing, refresh } = useFocusData(() => api.invite(token));
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    if (!data) return;
    await Share.share({ message: `Join me on VerifiedWorks. Use my invite code ${data.code} when you sign up.` });
  }

  return (
    <Screen title="Invite friends" subtitle="Share your code so friends can practise with you." refreshing={refreshing} onRefresh={refresh}>
      {error ? <Banner kind="bad" text={error} /> : null}

      <Card style={{ alignItems: 'center', paddingVertical: space(6) }}>
        <Text style={type.label}>Your invite code</Text>
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 6, color: colors.ink, marginVertical: space(3) }}>{data?.code ?? '······'}</Text>
        <View style={{ flexDirection: 'row', gap: space(3), alignSelf: 'stretch' }}>
          <Button title={copied ? 'Copied' : 'Copy'} icon={copied ? 'checkmark' : 'copy-outline'} variant="secondary" onPress={copy} style={{ flex: 1 }} />
          <Button title="Share" icon="share-social-outline" onPress={share} style={{ flex: 1 }} />
        </View>
      </Card>

      <SectionTitle right={<Text style={type.small}>{data?.invitedCount ?? 0} joined</Text>}>Friends who joined</SectionTitle>
      <Card>
        {!data?.invited.length ? (
          <View style={{ alignItems: 'center', paddingVertical: space(6) }}>
            <Ionicons name="people-outline" size={30} color={colors.muted} />
            <Text style={[type.small, { marginTop: 8 }]}>No one has used your code yet.</Text>
          </View>
        ) : (
          data.invited.map((f, i) => (
            <View key={f.username} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '800', color: colors.accent }}>{f.username[0]?.toUpperCase()}</Text>
              </View>
              <Text style={[type.h3, { flex: 1, marginLeft: space(3) }]}>{f.username}</Text>
              <Text style={type.small}>{timeAgo(f.joinedAt)}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
