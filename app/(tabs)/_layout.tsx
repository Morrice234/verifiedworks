import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Practice', tabBarIcon: icon('flash-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time-outline') }} />
      {/* Invite is opened from Profile, so it's kept out of the tab bar */}
      <Tabs.Screen name="invite" options={{ title: 'Invite', href: null }} />
      <Tabs.Screen name="withdraw" options={{ title: 'Withdraw', href: null }} />
      <Tabs.Screen name="linked-wallets" options={{ title: 'Linked Wallets', href: null }} />
	<Tabs.Screen name="transfer" options={{ title: 'Transfer', href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
