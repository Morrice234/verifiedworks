
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';

import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, SectionTitle } from '@/components/ui';
import { useToken } from '@/auth/AuthContext';
import { api, ApiError, WalletSummary } from '@/api';
import { LinkedWallet } from '@/api/types';
import { colors, space, type } from '@/theme';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function Withdrawal() {
  const token = useToken();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const idempotencyKey = useRef('');

  const refreshWallet = useCallback(async () => {
    if (!api.wallet) {
      setWallet(null);
      setError('Wallet API is unavailable. Please enable the HTTP backend.');
      setLoading(false);
      return;
    }

    try {
      setError('');
      const result = await api.wallet(token);
      setWallet(result);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not load your wallet. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshLinkedWallets = useCallback(async () => {
    if (!api.linkedWallets || !token) {
      setWalletsLoading(false);
      return;
    }

    try {
      const result = await api.linkedWallets(token);
      setLinkedWallets(result.wallets);

      setSelectedWalletId((current) =>
        result.wallets.some((item) => item.id === current) ? current : '',
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not load your linked PayPal accounts.',
      );
    } finally {
      setWalletsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  useEffect(() => {
    void refreshLinkedWallets();
  }, [refreshLinkedWallets]);

  const balanceCents = wallet?.balanceCents ?? 0;
  const minimumCents = wallet?.minimumWithdrawalCents ?? 100;

  const parsedAmountCents = /^\d+(\.\d{1,2})?$/.test(amount.trim())
    ? Math.round(Number(amount.trim()) * 100)
    : NaN;

  const validAmount =
    Number.isSafeInteger(parsedAmountCents) &&
    parsedAmountCents >= minimumCents &&
    parsedAmountCents <= balanceCents;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim());

  const submitWithdrawal = async () => {
    if (submitting) return;

    if (!wallet) {
      Alert.alert(
        'Wallet unavailable',
        'Load your wallet before requesting a withdrawal.',
      );
      return;
    }

    if (!api.requestWithdrawal) {
      Alert.alert(
        'Unavailable',
        'Withdrawal requests require the HTTP backend.',
      );
      return;
    }

    if (!validAmount) {
      Alert.alert(
        'Invalid amount',
        `Enter an amount between ${money(minimumCents)} and ${money(balanceCents)} USD.`,
      );
      return;
    }

    if (!validEmail) {
      Alert.alert(
        'Invalid PayPal email',
        'Enter a valid PayPal email address.',
      );
      return;
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current =
        `withdraw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = await api.requestWithdrawal(
        token,
        parsedAmountCents,
        account.trim(),
        idempotencyKey.current,
      );

      idempotencyKey.current = '';
      setAmount('');
      setNotice(response.detail);

      await refreshWallet();

      Alert.alert(
        'Withdrawal request processed',
        `${response.repeated ? 'Your existing request was found.' : 'Your withdrawal request was submitted.'}\n\nStatus: ${response.withdrawal.status.toUpperCase()}\nAmount: ${money(response.withdrawal.amountCents)} USD\n\nPayPal Sandbox submission was attempted. Check the withdrawal status before assuming the recipient received money.`,
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not submit the withdrawal. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const checkWithdrawalStatus = async (withdrawalId: string) => {
    if (!api.withdrawalStatus || refreshingId) return;

    setRefreshingId(withdrawalId);

    try {
      const result = await api.withdrawalStatus(token, withdrawalId);

      await refreshWallet();

      Alert.alert(
        'Withdrawal status',
        `Status: ${result.withdrawal.status.toUpperCase()}` +
          (result.batchStatus
            ? `\nPayPal batch: ${result.batchStatus}`
            : '') +
          (result.itemStatus
            ? `\nPayPal item: ${result.itemStatus}`
            : '') +
          (result.detail ? `\n${result.detail}` : ''),
      );
    } catch (e) {
      Alert.alert(
        'Status check failed',
        e instanceof ApiError
          ? e.message
          : 'Could not check withdrawal status.',
      );
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <Screen
      title="Withdraw"
      subtitle="Request a withdrawal of your available earnings."
    >
      <Card
        style={{
          backgroundColor: colors.navy,
          borderColor: colors.navy,
        }}
      >
        <Text style={[type.small, { color: '#c5cbe0' }]}>
          Available balance
        </Text>

        <Text
          style={{
            fontSize: 36,
            fontWeight: '800',
            color: '#fff',
            marginTop: 4,
          }}
        >
          {loading ? 'Loading...' : money(balanceCents)}
        </Text>

        <Text style={[type.small, { color: '#c5cbe0' }]}>
          USD · Available balance
        </Text>

        <Pressable
          disabled={loading}
          onPress={() => {
            setLoading(true);
            void refreshWallet();
          }}
          style={{ alignSelf: 'flex-start', marginTop: space(3) }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            Refresh balance
          </Text>
        </Pressable>
      </Card>

      {loading ? (
        <ActivityIndicator
          color={colors.accent}
          style={{ marginVertical: space(3) }}
        />
      ) : null}

      {error ? <Banner kind="bad" text={error} /> : null}

      {notice ? (
        <Card>
          <Text style={type.small}>{notice}</Text>
        </Card>
      ) : null}

      <SectionTitle>Withdrawal amount</SectionTitle>

      <Card>
        <Text style={type.label}>Amount (USD)</Text>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor="#8993a8"
          keyboardType="decimal-pad"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            paddingHorizontal: space(4),
            paddingVertical: space(3),
            marginTop: space(2),
            color: colors.navy,
            fontSize: 20,
            fontWeight: '700',
          }}
        />

        <Text style={[type.small, { marginTop: space(2) }]}>
          Minimum withdrawal: {money(minimumCents)} USD
        </Text>

        <Pressable
          onPress={() => setAmount(money(balanceCents).replace('$', ''))}
          disabled={loading || submitting || balanceCents <= 0}
          style={{ alignSelf: 'flex-end', marginTop: space(2) }}
        >
          <Text style={{ color: colors.accent, fontWeight: '700' }}>
            Use available balance
          </Text>
        </Pressable>
      </Card>

      <SectionTitle>Payout method</SectionTitle>

      <Card
        style={{
          borderColor: colors.accent,
          borderWidth: 2,
        }}
      >
        <Text style={type.h3}>PayPal</Text>
        <Text style={type.small}>
          Submit a withdrawal request using your PayPal email address.
        </Text>
      </Card>

      <SectionTitle>Payout account</SectionTitle>

      <Card>
        <Text style={type.label}>Saved PayPal accounts</Text>

        {walletsLoading ? (
          <ActivityIndicator
            color={colors.accent}
            style={{ marginVertical: space(3) }}
          />
        ) : linkedWallets.length > 0 ? (
          linkedWallets.map((item) => {
            const selected = selectedWalletId === item.id;

            return (
              <Pressable
                key={item.id}
                disabled={submitting}
                onPress={() => {
                  setSelectedWalletId(item.id);
                  setAccount(item.accountIdentifier);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.line,
                  borderRadius: 12,
                  padding: space(3),
                  marginTop: space(2),
                  backgroundColor: selected ? '#eef4ff' : 'transparent',
                }}
              >
                <Text style={type.h3}>
                  {selected ? '✓ ' : ''}
                  {item.accountIdentifier}
                </Text>

                <Text style={type.small}>Status: {item.status}</Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={[type.small, { marginTop: space(2) }]}>
            No saved PayPal accounts. Add one or enter an email below.
          </Text>
        )}

        <Button
          title="Manage linked wallets"
          onPress={() => router.navigate('/linked-wallets')}
          style={{ marginTop: space(3) }}
        />

        <Text style={[type.label, { marginTop: space(4) }]}>
          PayPal email address
        </Text>

        <TextInput
          value={account}
          onChangeText={(value) => {
            setAccount(value);
            setSelectedWalletId('');
          }}
          placeholder="name@example.com"
          placeholderTextColor="#8993a8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!submitting}
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            paddingHorizontal: space(4),
            paddingVertical: space(3),
            marginTop: space(2),
            color: colors.navy,
          }}
        />

        <Text style={[type.small, { marginTop: space(3) }]}>
          Selecting a saved account fills this field automatically. You can
          also enter a different email address.
        </Text>
      </Card>

      <Banner
        kind="bad"
        text="PayPal payouts are currently restricted to Sandbox testing. A submitted payout is not proof that the recipient received money. Check the withdrawal status before drawing conclusions."
      />

      <Button
        title={submitting ? 'Submitting...' : 'Request withdrawal'}
        onPress={submitWithdrawal}
        icon="arrow-forward"
        disabled={
          loading ||
          submitting ||
          !wallet ||
          !api.requestWithdrawal ||
          !validAmount ||
          !validEmail
        }
        style={{
          marginTop: space(3),
          backgroundColor: colors.accent,
        }}
      />

      <SectionTitle>Withdrawal history</SectionTitle>

      {wallet?.withdrawals.length ? (
        wallet.withdrawals.map((item) => (
          <Card key={item.id}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: space(3),
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>
                  {money(item.amountCents)} {item.currency}
                </Text>

                <Text style={type.small}>
                  {item.provider.toUpperCase()} ·{' '}
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>

              <Text style={type.label}>{item.status.toUpperCase()}</Text>
            </View>

            {item.status !== 'completed' && item.status !== 'failed' && (
              <Button
                title={
                  refreshingId === item.id
                    ? 'Checking...'
                    : 'Refresh status'
                }
                onPress={() => void checkWithdrawalStatus(item.id)}
                disabled={
                  refreshingId !== null || !api.withdrawalStatus
                }
                style={{ marginTop: space(3) }}
              />
            )}
          </Card>
        ))
      ) : (
        <Card>
          <Text style={type.h3}>No withdrawals yet</Text>
          <Text style={[type.small, { marginTop: space(2) }]}>
            Your withdrawal requests will appear here when recorded.
          </Text>
        </Card>
      )}
    </Screen>
  );
}
