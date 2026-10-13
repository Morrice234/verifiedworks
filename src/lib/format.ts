export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const secs = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : '0s');

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export const kindLabel = { text: 'Text', math: 'Math', shapes: 'Shapes' } as const;
