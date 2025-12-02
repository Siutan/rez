export function toNumber(input: unknown): number | null {
    const n = Number(input);
    if (Number.isNaN(n)) return null;
    return n;
  }