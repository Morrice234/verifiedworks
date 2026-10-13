import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, TaskRecord } from '@/api';
import { useToken } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { Banner, Card } from '@/components/ui';
import { kindLabel, secs, timeAgo } from '@/lib/format';
import { useFocusData } from '@/lib/useAsync';
import { colors, radius, space, type } from '@/theme';

const FILTERS = ['all', 'correct', 'wrong'] as const;
type Filter = (typeof FILTERS)[number];

export default function History() {
  const token = useToken();
  const { data, error, refreshing, refresh } = useFocusData(() => api.history(token));
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === 'correct') return all.filter((r) => r.correct);
    if (filter === 'wrong') return all.filter((r) => !r.correct);
    return all;
  }, [data, filter]);

  return (
    <Screen title="History" subtitle="Every challenge you've answered." refreshing={refreshing} onRefresh={refresh}>
      {error ? <Banner kind="bad" text={error} /> : null}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space(4) }}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 99,
              backgroundColor: filter === f ? colors.navy : colors.surface,
              borderWidth: 1,
              borderColor: filter === f ? colors.navy : colors.line,
            }}
          >
            <Text style={{ color: filter === f ? '#fff' : colors.ink, fontWeight: '600', textTransform: 'capitalize' }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {rows.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: space(10) }}>
          <Ionicons name="file-tray-outline" size={32} color={colors.muted} />
          <Text style={[type.small, { marginTop: 8 }]}>Nothing here yet.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: space(1) }}>
          {rows.map((r, i) => (
            <Row key={r.id} r={r} last={i === rows.length - 1} />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Row({ r, last }: { r: TaskRecord; last: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space(3),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: r.correct ? colors.goodSoft : colors.badSoft,
        }}
      >
        <Ionicons name={r.correct ? 'checkmark' : 'close'} size={18} color={r.correct ? colors.good : colors.bad} />
      </View>
      <View style={{ flex: 1, marginLeft: space(3) }}>
        <Text style={type.h3}>{kindLabel[r.kind]} challenge</Text>
        <Text style={type.small}>
          {timeAgo(r.createdAt)} · {secs(r.durationMs)}
          {r.difficulty ? ` · ${r.difficulty}` : ''}
          {r.assisted ? ' · solver used' : ''}
        </Text>
      </View>
      <Text style={[type.h3, { color: r.points ? colors.good : colors.muted }]}>{r.points ? `+${r.points}` : '0'}</Text>
    </View>
  );
}
