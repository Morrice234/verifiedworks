import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { api } from '@/api';
import { useAuth, useToken } from '@/auth/AuthContext';
import { BarChart } from '@/components/BarChart';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, SectionTitle, StatTile } from '@/components/ui';
import { kindLabel, pct, secs } from '@/lib/format';
import { useFocusData } from '@/lib/useAsync';
import { colors, space, type } from '@/theme';

export default function Dashboard() {
  const token = useToken();
  const { user } = useAuth();
  const { data: s, error, refreshing, refresh } = useFocusData(() => api.stats(token));

  return (
    <Screen title={`Hi, ${user?.username ?? ''}`} subtitle="Here's how your practice is going." refreshing={refreshing} onRefresh={refresh}>
      {error ? <Banner kind="bad" text={error} /> : null}

      <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
        <Text style={[type.small, { color: '#c5cbe0' }]}>Total points</Text>
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#fff', marginTop: 2 }}>{s?.totalPoints ?? 0}</Text>
        <Text style={[type.small, { color: '#c5cbe0' }]}>+{s?.todayPoints ?? 0} today</Text>
        <Button
          title="Start practising"
          icon="flash"
          onPress={() => router.navigate('/tasks')}
          style={{ marginTop: space(4), backgroundColor: colors.accent }}
        />
      </Card>

      <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(3) }}>
        <StatTile label="Solved" value={String(s?.solved ?? 0)} sub={`of ${s?.attempted ?? 0} tries`} icon="checkmark-done" tint={colors.goodSoft} />
        <StatTile label="Accuracy" value={pct(s?.accuracy ?? 0)} icon="locate" />
        <StatTile label="Avg time" value={secs(s?.avgDurationMs ?? 0)} icon="stopwatch-outline" tint="#e6ecf7" />
      </View>

      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <BarChart data={s?.last7Days ?? []} />
      </Card>

      <SectionTitle>By challenge type</SectionTitle>
      <Card>
        {(['text', 'math', 'shapes'] as const).map((k, i) => {
          const row = s?.byKind[k] ?? { solved: 0, attempted: 0 };
          const ratio = row.attempted ? row.solved / row.attempted : 0;
          return (
            <View key={k} style={{ marginTop: i ? space(4) : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={type.h3}>{kindLabel[k]}</Text>
                <Text style={type.small}>
                  {row.solved}/{row.attempted} · {pct(ratio)}
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: colors.good }} />
              </View>
            </View>
          );
        })}
      </Card>

      {s?.solver ? (
        <>
          <SectionTitle right={<Text style={type.small}>{s.solver.runs} OCR runs</Text>}>You vs OCR</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', marginBottom: space(2) }}>
              <Text style={[type.label, { flex: 1.1 }]}>Type</Text>
              <Text style={[type.label, { flex: 1, textAlign: 'right' }]}>You</Text>
              <Text style={[type.label, { flex: 1, textAlign: 'right' }]}>OCR</Text>
            </View>
            {(['text', 'math'] as const).map((k) => {
              const me = s.byKind[k];
              const bot = s.solver!.byKind[k];
              const acc = (x: { solved: number; attempted: number }) => (x.attempted ? pct(x.solved / x.attempted) : '-');
              return (
                <View key={k} style={{ flexDirection: 'row', paddingVertical: space(2.5), borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Text style={[type.h3, { flex: 1.1 }]}>{kindLabel[k]}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={type.h3}>{acc(me)}</Text>
                    <Text style={type.small}>{me.attempted ? secs(me.avgMs ?? 0) : ''}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={type.h3}>{acc(bot)}</Text>
                    <Text style={type.small}>{bot.attempted ? `${bot.avgMs ?? 0} ms` : ''}</Text>
                  </View>
                </View>
              );
            })}
            <Text style={[type.small, { marginTop: space(2) }]}>
              A good CAPTCHA keeps your score high and the OCR score low. Try each difficulty to find where that happens.
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
