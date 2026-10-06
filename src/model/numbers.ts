/** Number helpers: rounding away floating point noise, snapping, formatting and parsing. */

/** Removes binary floating point noise, e.g. 0.1 + 0.2 becomes 0.3. */
export function clean(n: number): number {
  if (!Number.isFinite(n)) return n;
  const c = Number.parseFloat(n.toPrecision(12));
  return c === 0 ? 0 : c;
}

/** How many decimals are needed to write `n` exactly (at most `max`). */
export function decimalsOf(n: number, max = 9): number {
  if (!Number.isFinite(n)) return 0;
  const c = clean(n);
  const tolerance = 1e-9 * Math.max(1, Math.abs(c));
  for (let d = 0; d < max; d++) {
    if (Math.abs(c - Number(c.toFixed(d))) < tolerance) return d;
  }
  return max;
}

/** Rounds `value` to the nearest multiple of `step`. A step of 0 or less leaves the value alone. */
export function snapTo(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return clean(value);
  return clean(Math.round(value / step) * step);
}

/** The smallest "nice" number (1, 2 or 5 times a power of ten) that is not below `rough`. */
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return clean(nice * power);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Writes a number without noise and without needless zeros.
 * `minDecimals` pads with zeros so that a column of values lines up.
 */
export function formatNumber(n: number, minDecimals = 0, maxDecimals = 6): string {
  if (!Number.isFinite(n)) return '';
  const c = clean(n);
  const abs = Math.abs(c);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) return String(c);
  const decimals = Math.min(maxDecimals, Math.max(minDecimals, decimalsOf(c, maxDecimals)));
  const text = c.toFixed(decimals);
  // "-0.00" would be a confusing way to write zero
  return Number(text) === 0 && text.startsWith('-') ? text.slice(1) : text;
}

/**
 * Reads a number typed by a person. Accepts a decimal comma ("1,5") as well as
 * a decimal point, surrounding spaces, a sign and an exponent.
 * Returns null when the text is not a number.
 */
export function parseNumber(text: string): number | null {
  let t = text.trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (t === '') return null;
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? clean(n) : null;
}
