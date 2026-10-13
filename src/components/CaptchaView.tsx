// Renders the three challenge types. Server-rendered images are shown as-is;
// otherwise the challenge data (glyphs, expression, shape grid) is drawn with SVG.
import React, { useMemo } from 'react';
import { Image, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { Challenge, ShapeName } from '@/api/types';
import { seeded } from '@/lib/random';
import { colors } from '@/theme';

type TextChallenge = Extract<Challenge, { kind: 'text' }>;
type MathChallenge = Extract<Challenge, { kind: 'math' }>;
type ShapesChallenge = Extract<Challenge, { kind: 'shapes' }>;

const W = 300;
const H = 100;
const NOISE_INKS = ['#9aa3b5', '#c9b79c', '#b5a3c9', '#a3c9b5'];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: W / H,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fbf8f2',
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {children}
    </View>
  );
}

function ServerImage({ uri }: { uri: string }) {
  return (
    <Frame>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </Frame>
  );
}

/** Seeded lines and dots so the noise doesn't jump around on re-render. */
function Noise({ seed }: { seed: number }) {
  const items = useMemo(() => {
    const rnd = seeded(seed);
    const lines = Array.from({ length: 7 }, () => ({
      x1: rnd() * W,
      y1: rnd() * H,
      x2: rnd() * W,
      y2: rnd() * H,
      color: NOISE_INKS[Math.floor(rnd() * NOISE_INKS.length)],
      width: 1 + rnd() * 1.5,
    }));
    const dots = Array.from({ length: 40 }, () => ({
      cx: rnd() * W,
      cy: rnd() * H,
      r: 0.8 + rnd() * 1.6,
      color: NOISE_INKS[Math.floor(rnd() * NOISE_INKS.length)],
    }));
    return { lines, dots };
  }, [seed]);

  return (
    <G>
      {items.dots.map((d, i) => (
        <Circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={d.color} />
      ))}
      {items.lines.map((l, i) => (
        <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth={l.width} />
      ))}
    </G>
  );
}

export function TextCaptcha({ challenge }: { challenge: TextChallenge }) {
  if (challenge.imageUri) return <ServerImage uri={challenge.imageUri} />;
  const glyphs = challenge.glyphs ?? [];
  const step = W / (glyphs.length + 1);

  return (
    <Frame>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Noise seed={challenge.noiseSeed ?? 1} />
        {glyphs.map((g, i) => {
          const x = step * (i + 1);
          const y = H / 2 + 14 + g.dy;
          return (
            <SvgText
              key={i}
              x={x}
              y={y}
              fill={g.color}
              fontSize={38}
              fontWeight="700"
              textAnchor="middle"
              transform={`rotate(${g.rotation} ${x} ${y - 12})`}
            >
              {g.char}
            </SvgText>
          );
        })}
      </Svg>
    </Frame>
  );
}

export function MathCaptcha({ challenge }: { challenge: MathChallenge }) {
  if (challenge.imageUri) return <ServerImage uri={challenge.imageUri} />;

  return (
    <Frame>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Noise seed={challenge.noiseSeed ?? 1} />
        <SvgText
          x={W / 2}
          y={H / 2 + 13}
          fill={colors.ink}
          fontSize={36}
          fontWeight="700"
          textAnchor="middle"
          transform={`rotate(-4 ${W / 2} ${H / 2})`}
        >
          {challenge.expression ?? ''}
        </SvgText>
      </Svg>
    </Frame>
  );
}

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

function Shape({ shape, color, rotation }: { shape: ShapeName; color: string; rotation: number }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <G transform={`rotate(${rotation} 50 50)`}>
        {shape === 'circle' ? <Circle cx={50} cy={50} r={28} fill={color} /> : null}
        {shape === 'square' ? <Rect x={24} y={24} width={52} height={52} rx={4} fill={color} /> : null}
        {shape === 'triangle' ? <Path d="M50 18 L82 76 L18 76 Z" fill={color} /> : null}
        {shape === 'star' ? <Polygon points={starPoints(50, 52, 32, 14)} fill={color} /> : null}
      </G>
    </Svg>
  );
}

export function ShapesCaptcha({
  challenge,
  selected,
  onToggle,
  disabled,
}: {
  challenge: ShapesChallenge;
  selected: number[];
  onToggle: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {challenge.grid.map((cell, i) => {
        const on = selected.includes(i);
        return (
          <View key={i} style={{ width: '33.333%', padding: 4 }}>
            <Pressable
              onPress={() => onToggle(i)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled }}
              style={({ pressed }) => ({
                aspectRatio: 1,
                borderRadius: 12,
                borderWidth: on ? 3 : 1,
                borderColor: on ? colors.accent : colors.line,
                backgroundColor: on ? colors.accentSoft : colors.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Shape shape={cell.shape} color={cell.color} rotation={cell.rotation} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
