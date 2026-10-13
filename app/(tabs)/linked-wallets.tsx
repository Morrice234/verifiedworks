
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { api } from '@/api';
import { useToken } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Field, SectionTitle } from '@/components/ui';
import { LinkedWallet } from '@/api/types';
import { colors, space, type } from '@/theme';

export default function LinkedWalletsScreen() {
  const token = useToken();

  const [email, setEmail] = useState('');
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    kind: 'good' | 'bad';
    text: string;
  } | null>(null);

  const loadWallets = useCallback(async () => {
    if (api.mode !== 'http') {
      setLoading(false);
      return;
    }

    if (!token) {
      setMsg({ kind: 'bad', text: 'Please sign in again.' });
      setLoading(false);
      return;
    }

    if (!api.linkedWallets) {
      setMsg({ kind: 'bad', text: 'Linked wallets are not supported by this backend.' });
      setLoading(false);
      return;
    }

    try {
      const result = await api.linkedWallets(token);
      setWallets(result.wallets);
    } catch (error: any) {
      setMsg({ kind: 'bad', text: error.message || 'Could not load linked wallets.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  async function addWallet() {
    const accountIdentifier = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountIdentifier)) {
      setMsg({ kind: 'bad', text: 'Enter a valid PayPal email address.' });
      return;
    }

    if (!token || !api.linkWallet) {
      setMsg({
        kind: 'bad',
        text: 'Connect to the Express backend to link a wallet.',
      });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const result = await api.linkWallet(
        token,
        'paypal',
        accountIdentifier,
      );

      setWallets((current) => [
        result.wallet,
        ...current.filter((item) => item.id !== result.wallet.id),
      ]);
      setEmail('');
      setMsg({ kind: 'good', text: result.detail });
    } catch (error: any) {
      setMsg({
        kind: 'bad',
        text: error.message || 'Could not link the account.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeWallet(walletId: string) {
    if (!token || !api.unlinkWallet) {
      setMsg({ kind: 'bad', text: 'Unable to remove this account.' });
      return;
    }

    setRemovingId(walletId);
    setMsg(null);

    try {
      const result = await api.unlinkWallet(token, walletId);
      setWallets((current) => current.filter((item) => item.id !== walletId));
      setMsg({ kind: 'good', text: result.detail });
    } catch (error: any) {
      setMsg({
        kind: 'bad',
        text: error.message || 'Could not remove the account.',
      });
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(walletId: string) {
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this linked account?')) {
        void removeWallet(walletId);
      }
      return;
    }

    Alert.alert(
      'Remove linked account?',
      'This removes the saved account from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeWallet(walletId),
        },
      ],
    );
  }

  return (
    <Screen title="Linked Wallets">
      <Text style={[type.body, { marginBottom: space(3) }]}>
        Manage the payment account details saved to your CaptchaLab profile.
      </Text>

      {api.mode === 'mock' ? (
        <Banner
          kind="bad"
          text="You are using offline demo mode. Switch to the Express backend to manage linked wallets."
        />
      ) : null}

      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}

      <SectionTitle>Add a PayPal account</SectionTitle>

      <Card>
        <Text style={type.small}>
          Provider: PayPal
        </Text>

        <Field
          label="PayPal email address"
          value={email}
          onChangeText={setEmail}
        />

        <Button
          title="Link PayPal account"
          onPress={addWallet}
          loading={saving}
        />

        <Text style={[type.small, { marginTop: space(3) }]}>
          Linking saves the email address only. It does not verify ownership
          or enable real payouts.
        </Text>
      </Card>

      <SectionTitle>Saved accounts</SectionTitle>

      {loading ? (
        <Text style={type.small}>Loading linked accounts...</Text>
      ) : wallets.length === 0 ? (
        <Card>
          <Text style={type.body}>No linked accounts yet.</Text>
        </Card>
      ) : (
        wallets.map((wallet) => (
          <Card key={wallet.id}>
            <View style={{ marginBottom: space(2) }}>
              <Text style={type.h2}>
                {wallet.provider.toUpperCase()}
              </Text>
              <Text style={type.body}>
                {wallet.accountIdentifier}
              </Text>
              <Text style={[type.small, { marginTop: space(1) }]}>
                Status: {wallet.status}
              </Text>
              <Text style={type.small}>
                Added: {new Date(wallet.createdAt).toLocaleDateString()}
              </Text>
            </View>

            <Pressable
              disabled={removingId === wallet.id}
              onPress={() => confirmRemove(wallet.id)}
              style={{
                alignSelf: 'flex-start',
                paddingVertical: space(2),
                opacity: removingId === wallet.id ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.bad, fontWeight: '700' }}>
                {removingId === wallet.id ? 'Removing...' : 'Remove account'}
              </Text>
            </Pressable>
          </Card>
        ))
      )}

      {api.mode === 'http' ? (
        <Button
          title="Refresh accounts"
          onPress={() => {
            setLoading(true);
            void loadWallets();
          }}
        />
      ) : null}
    </Screen>
  );
}
