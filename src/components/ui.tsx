import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, space, type } from '@/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon, style }: ButtonProps) {
  const isOff = disabled || loading;
  const fg = variant === 'primary' ? '#fff' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && { backgroundColor: colors.navy },
        variant === 'secondary' && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        isOff && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  right?: React.ReactNode;
};

export function Field({ label, error, hint, right, secureTextEntry, style, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={{ marginBottom: space(4) }}>
      <Text style={[type.label, { marginBottom: 6 }]}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          focused && { borderColor: colors.navy },
          !!error && { borderColor: colors.bad },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={hidden}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={{ paddingHorizontal: 12 }}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.inkSoft} />
          </Pressable>
        ) : null}
        {right}
      </View>
      {error ? (
        <Text style={[type.small, { color: colors.bad, marginTop: 4 }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.small, { marginTop: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  tint = colors.accentSoft,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={16} color={colors.ink} />
      </View>
      <Text style={[type.small, { marginTop: space(3) }]}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {sub ? <Text style={[type.small, { fontSize: 12 }]}>{sub}</Text> : null}
    </View>
  );
}

export function Banner({ kind, text }: { kind: 'good' | 'bad' | 'info'; text: string }) {
  const bg = kind === 'good' ? colors.goodSoft : kind === 'bad' ? colors.badSoft : colors.accentSoft;
  const fg = kind === 'good' ? colors.good : kind === 'bad' ? colors.bad : colors.ink;
  const icon = kind === 'good' ? 'checkmark-circle' : kind === 'bad' ? 'alert-circle' : 'information-circle';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[type.body, { color: fg, marginLeft: 8, flex: 1, fontSize: 14 }]}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between', marginBottom: space(3), marginTop: space(6) }]}>
      <Text style={type.h2}>{children}</Text>
      {right}
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.line,
  },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  btnText: { fontSize: 16, fontWeight: '700' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  input: { flex: 1, height: 50, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(4),
  },
});
