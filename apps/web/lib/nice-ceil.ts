/** Round a chart's upper bound up to a clean number (1/2/5 × 10ⁿ style). */
export function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
