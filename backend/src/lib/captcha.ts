// Server-side copy of the app's challenge generators (src/lib/captcha.ts).
// The server keeps the solution and only sends the challenge to the phone.
import { pick, randInt, uid } from "./random";

export type ChallengeKind = "text" | "math" | "shapes";
export type Difficulty = "easy" | "medium" | "hard";
type ShapeName = "circle" | "square" | "triangle" | "star";
type ShapeCell = { shape: ShapeName; color: string; rotation: number };

export type Challenge =
  | {
      id: string;
      kind: "text";
      prompt: string;
      difficulty: Difficulty;
      glyphs: { char: string; rotation: number; dy: number; color: string }[];
      noiseSeed: number;
    }
  | { id: string; kind: "math"; prompt: string; difficulty: Difficulty; expression: string; noiseSeed: number }
  | { id: string; kind: "shapes"; prompt: string; difficulty: Difficulty; target: ShapeName; grid: ShapeCell[] };

export type Generated = { challenge: Challenge; solution: string };

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INKS = ["#1f3a5f", "#7a2e2e", "#2f5d3a", "#5b3b8c", "#8a5a00"];
const SHAPES: ShapeName[] = ["circle", "square", "triangle", "star"];
const SHAPE_COLORS = ["#e4572e", "#29335c", "#f3a712", "#669bbc", "#a8c686"];

export const POINTS: Record<ChallengeKind, number> = { text: 3, math: 2, shapes: 4 };

function makeText(difficulty: Difficulty): Generated {
  const length = difficulty === "easy" ? 4 : difficulty === "hard" ? 7 : randInt(5, 6);
  const tilt = difficulty === "easy" ? 12 : difficulty === "hard" ? 38 : 28;
  let solution = "";
  const glyphs = Array.from({ length }, () => {
    const char = pick(CHARSET.split(""));
    solution += char;
    return { char, rotation: randInt(-tilt, tilt), dy: randInt(-6, 6), color: pick(INKS) };
  });
  return {
    challenge: {
      id: uid("c_"),
      kind: "text",
      prompt: "Type the characters you see",
      difficulty,
      glyphs,
      noiseSeed: randInt(1, 1e9),
    },
    solution,
  };
}

function makeMath(difficulty: Difficulty): Generated {
  const op = difficulty === "easy" ? pick(["+", "-"] as const) : pick(["+", "-", "×"] as const);
  let a = difficulty === "hard" ? randInt(11, 49) : randInt(2, 19);
  let b = difficulty === "hard" ? randInt(3, 12) : randInt(2, 9);
  if (op === "-" && b > a) [a, b] = [b, a];
  const result = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return {
    challenge: {
      id: uid("c_"),
      kind: "math",
      prompt: "Solve the sum",
      difficulty,
      expression: `${a} ${op} ${b} = ?`,
      noiseSeed: randInt(1, 1e9),
    },
    solution: String(result),
  };
}

function makeShapes(difficulty: Difficulty): Generated {
  const target = pick(SHAPES);
  const count = difficulty === "easy" ? 2 : difficulty === "hard" ? randInt(3, 5) : randInt(2, 4);
  const others = SHAPES.filter((s) => s !== target);
  const cells: ShapeCell[] = [];
  for (let i = 0; i < 9; i++) {
    cells.push({
      shape: i < count ? target : pick(others),
      color: pick(SHAPE_COLORS),
      rotation: randInt(0, 359),
    });
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const solution = cells
    .map((c, i) => (c.shape === target ? i : -1))
    .filter((i) => i >= 0)
    .join(",");
  return {
    challenge: { id: uid("c_"), kind: "shapes", prompt: `Tap every ${target}`, difficulty, target, grid: cells },
    solution,
  };
}

export function makeRandomChallenge(difficulty: Difficulty = "medium"): Generated {
  const roll = Math.random();
  if (roll < 0.45) return makeText(difficulty);
  if (roll < 0.75) return makeMath(difficulty);
  return makeShapes(difficulty);
}
