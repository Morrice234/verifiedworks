import React from 'react';
import { Text, View } from 'react-native';
import { colors, type } from '@/theme';

/** Plain-View bar chart: no chart library needed for something this simple. */
export function BarChart({ data, height = 120 }: { data: { label: string; solved: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.solved));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 8 }}>
        {data.map((d, i) => {
          const isToday = i === data.length - 1;
          const h = Math.max(4, (d.solved / max) * (height - 18));
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={[type.small, { fontSize: 11, marginBottom: 2 }]}>{d.solved || ''}</Text>
              <View
                style={{
                  width: '70%',
                  height: h,
                  borderRadius: 6,
                  backgroundColor: isToday ? colors.accent : d.solved ? colors.navy : colors.line,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {data.map((d, i) => (
          <Text key={i} style={[type.small, { flex: 1, textAlign: 'center', fontSize: 11 }]}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
