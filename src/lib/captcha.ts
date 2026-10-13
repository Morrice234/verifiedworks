import type { Challenge, ShapeCell, ShapeName } from '@/api/types';
import { pick, randInt, uid } from './random';

// Characters that are easy to confuse (0/O, 1/l/I) are left out on purpose.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INKS = ['#1f3a5f', '#7a2e2e', '#2f5d3a', '#5b3b8c', '#8a5a00'];
const SHAPES: ShapeName[] = ['circle', 'square', 'triangle', 'star'];
const SHAPE_COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686'];

export type Generated = { challenge: Challenge; solution: string };

export function makeTextChallenge(): Generated {
  const length = randInt(5, 6);
  let solution = '';
  const glyphs = Array.from({ length }, () => {
    const char = pick(CHARSET.split(''));
    solution += char;
    return { char, rotation: randInt(-28, 28), dy: randInt(-6, 6), color: pick(INKS) };
  });
  return {
    challenge: {
      id: uid('c_'),
      kind: 'text',
      prompt: 'Type the characters you see',
      glyphs,
      noiseSeed: randInt(1, 1e9),
    },
    solution,
  };
}

export function makeMathChallenge(): Generated {
  const op = pick(['+', '-', '×'] as const);
  let a = randInt(2, 19);
  let b = randInt(2, 9);
  if (op === '-' && b > a) [a, b] = [b, a];
  const result = op === '+' ? a + b : op === '-' ? a - b : a * b;
  return {
    challenge: {
      id: uid('c_'),
      kind: 'math',
      prompt: 'Solve the sum',
      expression: `${a} ${op} ${b} = ?`,
      noiseSeed: randInt(1, 1e9),
    },
    solution: String(result),
  };
}

export function makeShapesChallenge(): Generated {
  const target = pick(SHAPES);
  const count = randInt(2, 4);
  const cells: ShapeCell[] = [];
  const others = SHAPES.filter((s) => s !== target);
  for (let i = 0; i < 9; i++) {
    cells.push({
      shape: i < count ? target : pick(others),
      color: pick(SHAPE_COLORS),
      rotation: randInt(0, 359),
    });
  }
  // Shuffle so the targets aren't always first.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const solution = cells
    .map((c, i) => (c.shape === target ? i : -1))
    .filter((i) => i >= 0)
    .join(',');
  return {
    challenge: {
      id: uid('c_'),
      kind: 'shapes',
      prompt: `Tap every ${target}`,
      target,
      grid: cells,
    },
    solution,
  };
}

export function makeRandomChallenge(): Generated {
  const roll = Math.random();
  if (roll < 0.45) return makeTextChallenge();
  if (roll < 0.75) return makeMathChallenge();
  return makeShapesChallenge();
}

export const POINTS: Record<Challenge['kind'], number> = { text: 3, math: 2, shapes: 4 };
