import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

function RootStack() {
  const { ready, token, hasAccess } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }

  // Stack.Protected swaps the visible routes based on the session:
  // signed out -> (auth), signed in without a key -> access (waiting for the admin), with a key -> the lab.
  // When the admin gives the account a key, hasAccess flips and the app moves into the lab by itself.
  const signedIn = !!token;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn && hasAccess}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasAccess}>
        <Stack.Screen name="access" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen
          name="faq"
          options={{ headerShown: true, title: 'Help & FAQ', headerTintColor: colors.ink, headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg } }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
