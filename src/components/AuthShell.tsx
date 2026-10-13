import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api';
import { colors, space, type } from '@/theme';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space(6), paddingTop: space(10) }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(8) }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.navy,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="shapes-outline" size={22} color={colors.accent} />
            </View>
            <Text style={[type.h3, { marginLeft: 10, fontSize: 18 }]}>VerifiedWorks</Text>
            {api.mode === 'mock' ? (
              <View style={{ marginLeft: 'auto', backgroundColor: colors.accentSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={[type.small, { color: colors.ink, fontWeight: '600', fontSize: 12 }]}>Offline demo</Text>
              </View>
            ) : null}
          </View>
          <Text style={type.h1}>{title}</Text>
          <Text style={[type.small, { fontSize: 15, marginTop: 6, marginBottom: space(7) }]}>{subtitle}</Text>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
