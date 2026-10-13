
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useToken } from '@/auth/AuthContext';
import { api, ApiError, WalletSummary } from '@/api';
import { colors, radius, space, type } from '@/theme';

type TransferItem = {
  id: string;
  senderUsername: string;
  recipientUsername: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  direction: 'sent' | 'received';
};

const money = (cents: number, currency = 'USD') =>
  `${currency} ${(cents / 100).toFixed(2)}`;

export default function TransferScreen() {
  const token = useToken();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [history, setHistory] = useState<TransferItem[]>([]);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!api.wallet || !api.transferHistory) {
        throw new Error('Transfers are unavailable in the current backend mode.');
      }

      const [walletData, transferData] = await Promise.all([
        api.wallet(token),
        api.transferHistory(token),
      ]);

      setWallet(walletData);
      setHistory(transferData.transfers);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load wallet information.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const performTransfer = async (
    recipientUsername: string,
    amountCents: number,
  ) => {
    if (!token || !api.transferFunds || sending) return;

    setSending(true);

    const idempotencyKey =
      `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;

    try {
      const result = await api.transferFunds(
        token,
        recipientUsername,
        amountCents,
        idempotencyKey,
      );

      Alert.alert('Transfer result', result.detail);
      setUsername('');
      setAmount('');
      await loadData();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The transfer could not be completed.';

      Alert.alert('Transfer failed', message);
      await loadData();
    } finally {
      setSending(false);
    }
  };

  const submitTransfer = () => {
    const recipient = username.trim();
    const normalizedAmount = amount.trim();

    if (!recipient) {
      Alert.alert('Recipient required', 'Enter the recipient username.');
      return;
    }

    if (!normalizedAmount || !/^\d+(\.\d{1,2})?$/.test(normalizedAmount)) {
      Alert.alert('Invalid amount', 'Enter a valid amount, such as 5 or 5.50.');
      return;
    }

    const amountCents = Math.round(Number(normalizedAmount) * 100);

    if (!Number.isSafeInteger(amountCents) || amountCents < 1) {
      Alert.alert('Invalid amount', 'Enter an amount of at least USD 0.01.');
      return;
    }

    if (wallet && amountCents > wallet.balanceCents) {
      Alert.alert('Insufficient balance', 'Your available balance is too low.');
      return;
    }

    if (!api.transferFunds) {
      Alert.alert('Unavailable', 'Transfers are not supported by this backend.');
      return;
    }

    Alert.alert(
      'Confirm transfer',
      `Send ${money(amountCents)} to ${recipient}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            void performTransfer(recipient, amountCents);
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ ...type.body, marginTop: space(3) }}>
          Loading wallet...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: space(4),
        gap: space(4),
        paddingBottom: space(8),
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: space(1) }}>
        <Text style={type.h1}>Account transfer</Text>
        <Text style={type.small}>
          Send funds to another CaptchaLab account using their username.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: space(5),
          gap: space(2),
        }}
      >
        <Text style={type.small}>Available balance</Text>
        <Text style={{ ...type.h1, color: colors.navy }}>
          {money(wallet?.balanceCents ?? 0, wallet?.currency ?? 'USD')}
        </Text>
      </View>

      {error ? (
        <View
          style={{
            backgroundColor: colors.badSoft,
            borderRadius: radius.md,
            padding: space(3),
            gap: space(2),
          }}
        >
          <Text style={{ ...type.body, color: colors.bad }}>{error}</Text>
          <Pressable onPress={() => void loadData()}>
            <Text style={{ ...type.body, color: colors.navy, fontWeight: '700' }}>
              Retry loading
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: space(4),
          gap: space(3),
        }}
      >
        <Text style={type.h2}>Send funds</Text>

        <Text style={type.label}>Recipient username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Enter username"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!sending}
          style={{
            color: colors.ink,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space(3),
            fontSize: 15,
          }}
        />

        <Text style={type.label}>Amount (USD)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          editable={!sending}
          style={{
            color: colors.ink,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space(3),
            fontSize: 15,
          }}
        />

        <Pressable
          onPress={submitTransfer}
          disabled={sending || !!error}
          style={{
            padding: space(3.5),
            alignItems: 'center',
            borderRadius: radius.md,
            backgroundColor: colors.accent,
            opacity: sending || !!error ? 0.6 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={{ ...type.body, color: '#ffffff', fontWeight: '700' }}>
              Send transfer
            </Text>
          )}
        </Pressable>

        <Text style={type.small}>
          Check the recipient username and amount carefully before confirming.
        </Text>
      </View>

      <View style={{ gap: space(3) }}>
        <Text style={type.h2}>Transfer history</Text>

        {history.length === 0 ? (
          <Text style={type.small}>No transfers yet.</Text>
        ) : (
          history.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                padding: space(3),
                borderRadius: radius.md,
                gap: space(1),
              }}
            >
              <Text style={{ ...type.body, fontWeight: '700' }}>
                {item.direction === 'sent'
                  ? `To ${item.recipientUsername}`
                  : `From ${item.senderUsername}`}
              </Text>

              <Text
                style={{
                  ...type.h3,
                  color: item.direction === 'sent' ? colors.bad : colors.good,
                }}
              >
                {item.direction === 'sent' ? '−' : '+'}
                {money(item.amountCents, item.currency)}
              </Text>

              <Text style={type.small}>
                {new Date(item.createdAt).toLocaleString()} · {item.status}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
