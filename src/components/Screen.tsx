import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space, type } from '@/theme';

export function Screen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space(4), paddingBottom: space(10) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.navy} /> : undefined}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: space(5), marginTop: space(2) }}>
          <View style={{ flex: 1 }}>
            <Text style={type.h1}>{title}</Text>
            {subtitle ? <Text style={[type.small, { fontSize: 15, marginTop: 4 }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
