import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from 'react-native';
import { Card } from '@/components/ui';
import { colors, space, type } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ = [
  {
    q: 'What is VerifiedWorks?',
    a: 'A practice app for learning how CAPTCHA challenges are built, served and checked. It is meant for testing your own sites and your own OCR experiments.',
  },
  {
    q: 'What challenge types are there?',
    a: 'Distorted text, a small math sum, and a 3x3 grid where you tap every matching shape. Each one shows a different way to tell people and scripts apart.',
  },
  {
    q: 'How are points worked out?',
    a: 'Text gives 3 points, math gives 2 and shapes give 4 when you get them right. Wrong answers give 0. Points are only a score and have no cash value.',
  },
  {
    q: 'Where is the answer checked?',
    a: 'On the backend. The app never receives the solution, only the challenge. That is how real CAPTCHA services stop clients from reading the answer.',
  },
  {
    q: 'How do I connect my own server?',
    a: 'Set EXPO_PUBLIC_API_URL to your VerifyWorker server, ending in /app, and restart Expo with npx expo start -c. The README has the full steps.',
  },
  {
    q: 'What does Run OCR solver do?',
    a: 'In server mode it sends the challenge on screen to the Tesseract worker and shows what it read. Comparing its score with yours shows which settings stop OCR while staying easy for people. Answering a challenge after the solver has run on it earns no points.',
  },
  {
    q: 'How do I get access?',
    a: 'Access comes from the admin, who adds a key to your account. Send them your username or email, then tap Check again once they confirm. There is nothing to enter, and it works on any phone you sign in on.',
  },
  {
    q: 'Why does my verification code show on screen?',
    a: 'In offline demo mode there is no mail server, so the code is shown to you directly. A real backend should email it instead.',
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space(4), paddingBottom: space(10) }}>
      <Card style={{ paddingVertical: space(1) }}>
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <View key={item.q} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen(isOpen ? null : i);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space(4) }}
              >
                <Text style={[type.h3, { flex: 1, paddingRight: 8 }]}>{item.q}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
              </Pressable>
              {isOpen ? <Text style={[type.body, { color: colors.inkSoft, paddingBottom: space(4), lineHeight: 22 }]}>{item.a}</Text> : null}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
