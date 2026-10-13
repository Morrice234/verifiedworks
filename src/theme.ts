export const colors = {
  bg: '#f6f3ee',
  surface: '#ffffff',
  ink: '#16213a',
  inkSoft: '#56607a',
  muted: '#8b93a7',
  line: '#e4dfd6',
  accent: '#e07a2f',
  accentSoft: '#fbe9dc',
  navy: '#16213a',
  good: '#2f8f5b',
  goodSoft: '#e1f2e8',
  bad: '#c2423b',
  badSoft: '#f8e1df',
};

export const radius = { sm: 8, md: 14, lg: 20 };
export const space = (n: number) => n * 4;

export const type = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.ink },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  small: { fontSize: 13, color: colors.inkSoft },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.inkSoft, letterSpacing: 0.4, textTransform: 'uppercase' as const },
};
