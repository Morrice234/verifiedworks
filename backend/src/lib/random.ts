// Small seeded PRNG (mulberry32) so a challenge's noise looks the same on every re-render.
export function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (min: number, max: number, rnd = Math.random) =>
  Math.floor(rnd() * (max - min + 1)) + min;

export const pick = <T,>(arr: readonly T[], rnd = Math.random): T => arr[Math.floor(rnd() * arr.length)];

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
