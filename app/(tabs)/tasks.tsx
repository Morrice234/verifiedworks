import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { AnswerResult, api, Challenge, Difficulty, SolverResult } from '@/api';
import { useToken } from '@/auth/AuthContext';
import { MathCaptcha, ShapesCaptcha, TextCaptcha } from '@/components/CaptchaView';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Field } from '@/components/ui';
import { kindLabel, secs } from '@/lib/format';
import { colors, space, type } from '@/theme';

type Phase = 'idle' | 'loading' | 'solving' | 'checking' | 'result';
type SolverState = { running: boolean; result: SolverResult | null; error: string | null };

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const NO_SOLVER: SolverState = { running: false, result: null, error: null };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function Practice() {
  const token = useToken();
  const [phase, setPhase] = useState<Phase>('idle');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [session, setSession] = useState({
    solved: 0,
    tried: 0,
    earningsCents: 0,
  });
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [solver, setSolver] = useState<SolverState>(NO_SOLVER);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshWallet = useCallback(async () => {
    if (!api.wallet) {
      setWalletBalanceCents(null);
      return;
    }

    try {
      const wallet = await api.wallet(token);
      setWalletBalanceCents(wallet.balanceCents);
    } catch (e) {
      console.error('Could not refresh wallet balance:', e);
    }
  }, [token]);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);

    setPhase('loading');
    setError(null);
    setResult(null);
    setValue('');
    setSelected([]);
    setSolver(NO_SOLVER);

    try {
      setChallenge(await api.nextChallenge(token, difficulty));
      setPhase('solving');
    } catch (e: any) {
      setError(e.message);
      setPhase('idle');
    }
  }, [token, difficulty]);

  async function submit() {
    if (!challenge) return;
    if (challenge.kind !== 'shapes' && !value.trim()) return;
    if (challenge.kind === 'shapes' && !selected.length) return;

    setPhase('checking');

    try {
      const r = await api.answer(
        token,
        challenge.id,
        challenge.kind === 'shapes'
          ? { kind: 'shapes', selected }
          : { kind: challenge.kind, value },
      );

      setResult(r);

      setSession((s) => ({
        solved: s.solved + (r.correct ? 1 : 0),
        tried: s.tried + 1,
        earningsCents: s.earningsCents + (r.rewardCents ?? 0),
      }));

      await refreshWallet();

      setPhase('result');

      if (autoNext) {
        timer.current = setTimeout(load, 1200);
      }
    } catch (e: any) {
      setError(e.message);
      setPhase('solving');
    }
  }

  async function runSolver() {
    if (!challenge || !api.solve) return;

    setSolver({ running: true, result: null, error: null });

    try {
      setSolver({
        running: false,
        result: await api.solve(token, challenge.id),
        error: null,
      });
    } catch (e: any) {
      setSolver({ running: false, result: null, error: e.message });
    }
  }

  const toggle = (i: number) =>
    setSelected((s) =>
      s.includes(i) ? s.filter((x) => x !== i) : [...s, i],
    );

  const locked = phase === 'checking' || phase === 'result';

  return (
    <Screen title="Tasks" subtitle="Complete challenges and track your rewards.">
      <Card
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: space(3),
        }}
      >
        <Mini label="Completed" value={`${session.solved}/${session.tried}`} />
        <Mini label="Session earnings" value={money(session.earningsCents)} />
        <Mini
          label="Wallet balance"
          value={
            walletBalanceCents === null
              ? api.wallet
                ? 'Loading'
                : 'Demo'
              : money(walletBalanceCents)
          }
        />
      </Card>

      {api.mode === 'http' ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            marginTop: space(3),
          }}
        >
          {DIFFICULTIES.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDifficulty(d)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 99,
                backgroundColor:
                  difficulty === d ? colors.navy : colors.surface,
                borderWidth: 1,
                borderColor: difficulty === d ? colors.navy : colors.line,
              }}
            >
              <Text
                style={{
                  color: difficulty === d ? '#fff' : colors.ink,
                  fontWeight: '600',
                  textTransform: 'capitalize',
                }}
              >
                {d}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card style={{ marginTop: space(3), minHeight: 260 }}>
        {error ? <Banner kind="bad" text={error} /> : null}

        {phase === 'idle' ? (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: space(8),
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="flash" size={28} color={colors.accent} />
            </View>

            <Text style={[type.h2, { marginTop: space(4) }]}>
              Ready when you are
            </Text>

            <Text
              style={[
                type.small,
                {
                  textAlign: 'center',
                  marginTop: 6,
                  marginBottom: space(5),
                },
              ]}
            >
              You'll get a mix of text, math and shape challenges.
            </Text>

            <Button
              title="Start"
              icon="play"
              onPress={load}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        ) : phase === 'loading' || !challenge ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: space(16),
            }}
          >
            <ActivityIndicator color={colors.navy} />
          </View>
        ) : (
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: space(3),
              }}
            >
              <View
                style={{
                  backgroundColor: colors.bg,
                  borderRadius: 99,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={[
                    type.small,
                    { fontWeight: '700', color: colors.ink },
                  ]}
                >
                  {kindLabel[challenge.kind]}
                </Text>
              </View>

              <Text style={[type.h3, { marginLeft: 10, flex: 1 }]}>
                {challenge.prompt}
              </Text>
            </View>

            {challenge.kind === 'text' ? (
              <TextCaptcha challenge={challenge} />
            ) : null}

            {challenge.kind === 'math' ? (
              <MathCaptcha challenge={challenge} />
            ) : null}

            {challenge.kind === 'shapes' ? (
              <ShapesCaptcha
                challenge={challenge}
                selected={selected}
                onToggle={toggle}
                disabled={locked}
              />
            ) : null}

            {challenge.kind !== 'shapes' ? (
              <View style={{ marginTop: space(4) }}>
                <Field
                  label="Your answer"
                  value={value}
                  onChangeText={setValue}
                  editable={!locked}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType={
                    challenge.kind === 'math'
                      ? 'numbers-and-punctuation'
                      : 'default'
                  }
                  onSubmitEditing={submit}
                  returnKeyType="done"
                />
              </View>
            ) : (
              <View style={{ height: space(4) }} />
            )}

            {solver.result || solver.error ? (
              <SolverPanel state={solver} revealed={phase === 'result'} />
            ) : null}

            {phase === 'result' && result ? (
              <Banner
                kind={result.correct ? 'good' : 'bad'}
                text={
                  !result.correct
                    ? 'Not quite. Try the next one.'
                    : result.assisted
                      ? 'Correct, but no reward because the solver ran first.'
                      : `Correct, earned ${money(result.rewardCents ?? 0)} in ${secs(result.durationMs)}`
                }
              />
            ) : null}

            {api.solve && challenge.solvable && phase === 'solving' && !solver.result ? (
              <Button
                title="Run OCR solver"
                icon="hardware-chip-outline"
                variant="secondary"
                onPress={runSolver}
                loading={solver.running}
                style={{ marginBottom: space(3) }}
              />
            ) : null}

            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <Button
                title="Skip"
                variant="secondary"
                icon="refresh"
                onPress={load}
                disabled={phase === 'checking'}
                style={{ flex: 1 }}
              />

              {phase === 'result' ? (
                <Button
                  title="Next"
                  icon="arrow-forward"
                  onPress={load}
                  style={{ flex: 2 }}
                />
              ) : (
                <Button
                  title="Submit"
                  onPress={submit}
                  loading={phase === 'checking'}
                  style={{ flex: 2 }}
                />
              )}
            </View>
          </View>
        )}
      </Card>

      <Card
        style={{
          marginTop: space(3),
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>Auto-advance</Text>
          <Text style={type.small}>
            Load the next challenge after each answer
          </Text>
        </View>

        <Switch
          value={autoNext}
          onValueChange={setAutoNext}
          trackColor={{ true: colors.accent, false: colors.line }}
          thumbColor="#fff"
        />
      </Card>
    </Screen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[type.h2, { fontSize: 18 }]}>{value}</Text>
      <Text style={[type.small, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

function SolverPanel({
  state,
  revealed,
}: {
  state: SolverState;
  revealed: boolean;
}) {
  if (state.error) {
    return (
      <View style={{ marginBottom: space(3) }}>
        <Banner kind="bad" text={`Solver: ${state.error}`} />
      </View>
    );
  }

  const r = state.result!;

  const read = r.guess ? `"${r.guess}"` : 'nothing';
  const time = r.elapsedMs != null ? ` in ${Math.round(r.elapsedMs)} ms` : '';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderRadius: 12,
        padding: space(3),
        marginBottom: space(3),
      }}
    >
      <Ionicons name="hardware-chip-outline" size={20} color={colors.ink} />

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={type.h3}>
          OCR read {read}
          {time}
        </Text>

        <Text
          style={[
            type.small,
            {
              color: r.correct ? colors.good : colors.bad,
              fontWeight: '600',
            },
          ]}
        >
          {r.status === 'failed'
            ? `Failed: ${r.error ?? 'could not read the image'}`
            : r.correct
              ? 'The solver got it right'
              : 'The solver got it wrong'}
          {!revealed ? ' · answering now earns no reward' : ''}
        </Text>
      </View>
    </View>
  );
}