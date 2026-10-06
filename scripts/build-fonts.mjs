// Builds the font files the app ships, from the IBM Plex packages in node_modules.
//
// The fonts are reduced to the characters a timing diagram realistically needs
// (Western and Central European letters, Greek, technical symbols), which keeps
// the single-file build small. Each face is written twice:
//   *.woff2  for the screen and for embedding into exported SVG / HTML
//   *.ttf    for embedding into exported PDF (jsPDF reads TrueType only)
// plus coverage.ts, the list of characters the fonts can draw, and metrics.ts,
// how wide each of them is, so that text can be fitted and wrapped in exports
// without asking a browser.
//
// The output in src/assets/fonts is committed; run `npm run fonts` only after
// changing the character set or updating the font packages.

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/assets/fonts');

const FACES = [
  // `metrics` names the face the drawing code asks for (see FontFace in src/render/theme.ts)
  { file: 'plex-sans-400', text: true, metrics: 'sans400', src: '@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2' },
  { file: 'plex-sans-500', text: true, src: '@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2' },
  { file: 'plex-sans-600', text: true, metrics: 'sans600', src: '@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2' },
  // the mono faces only ever draw numbers, so they do not limit the coverage list
  { file: 'plex-mono-400', text: false, src: '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2' },
  { file: 'plex-mono-500', text: false, src: '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Medium.woff2' },
];

/** Inclusive code point ranges to keep. Characters a font lacks are skipped silently. */
const RANGES = [
  [0x0020, 0x007e], // Basic Latin
  [0x00a0, 0x00ff], // Latin-1: umlauts, accents, µ ° ± × ÷ ² ³ ¼ ½
  [0x0100, 0x017f], // Latin Extended-A: Central European letters
  [0x0192, 0x0192],
  [0x02c6, 0x02dc],
  [0x0370, 0x03ff], // Greek: Ω Δ α β μ π τ φ ω
  [0x2010, 0x2027], // dashes, quotes, bullet, ellipsis
  [0x2030, 0x203a], // per mille, primes
  [0x2044, 0x2044],
  [0x2070, 0x209f], // superscripts and subscripts
  [0x20ac, 0x20ac], // €
  [0x2100, 0x214f], // letterlike: ℃ ℓ № ™ Ω Å
  [0x2190, 0x21ff], // arrows
  [0x2200, 0x22ff], // mathematical operators: − ∆ ∑ √ ∞ ≈ ≠ ≤ ≥
  [0x2300, 0x23ff], // technical: ⌀
  [0x25a0, 0x25ff], // geometric shapes
  [0x2713, 0x2717], // check marks
];

const CHARSET = RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)),
).join('');

/** Offsets of the tables of a TrueType / OpenType font, by tag. */
function readTables(sfnt) {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const tables = {};
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    tables[String.fromCharCode(...sfnt.subarray(record, record + 4))] = view.getUint32(record + 8);
  }
  return { view, tables };
}

/** Reads which glyph a TrueType / OpenType font draws for each code point. */
function readGlyphs(sfnt) {
  const { view, tables } = readTables(sfnt);
  const cmap = tables.cmap ?? -1;
  if (cmap < 0) throw new Error('font has no cmap table');

  const codePoints = new Map();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const offset = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(offset);
    if (format === 4) {
      const segCount = view.getUint16(offset + 6) / 2;
      const ends = offset + 14;
      const starts = ends + segCount * 2 + 2;
      const deltas = starts + segCount * 2;
      const rangeOffsets = deltas + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const end = view.getUint16(ends + s * 2);
        const start = view.getUint16(starts + s * 2);
        const delta = view.getUint16(deltas + s * 2);
        const rangeOffset = view.getUint16(rangeOffsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (rangeOffset === 0) {
            glyph = (c + delta) & 0xffff;
          } else {
            const at = rangeOffsets + s * 2 + rangeOffset + (c - start) * 2;
            glyph = view.getUint16(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) codePoints.set(c, glyph);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12);
      for (let g = 0; g < groups; g++) {
        const start = view.getUint32(offset + 16 + g * 12);
        const end = view.getUint32(offset + 20 + g * 12);
        const firstGlyph = view.getUint32(offset + 24 + g * 12);
        for (let c = start; c <= end; c++) codePoints.set(c, firstGlyph + (c - start));
      }
    }
  }
  return codePoints;
}

/** How far each character moves the pen, in thousandths of the font size. */
function readAdvances(sfnt, glyphs) {
  const { view, tables } = readTables(sfnt);
  if (tables.head === undefined || tables.hhea === undefined || tables.hmtx === undefined) {
    throw new Error('font has no horizontal metrics');
  }
  const unitsPerEm = view.getUint16(tables.head + 18);
  const longMetrics = view.getUint16(tables.hhea + 34);
  const advances = new Map();
  for (const [codePoint, glyph] of glyphs) {
    // glyphs beyond the list share the width of its last entry
    const units = view.getUint16(tables.hmtx + Math.min(glyph, longMetrics - 1) * 4);
    advances.set(codePoint, Math.round((units * 1000) / unitsPerEm));
  }
  return advances;
}

/** Turns widths by code point into runs of neighbouring code points: [first code point, widths…]. */
function toRuns(advances) {
  const runs = [];
  for (const codePoint of [...advances.keys()].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last.length - 1 === codePoint) last.push(advances.get(codePoint));
    else runs.push([codePoint, advances.get(codePoint)]);
  }
  return runs;
}

function toRanges(sortedCodePoints) {
  const ranges = [];
  for (const c of sortedCodePoints) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === c - 1) last[1] = c;
    else ranges.push([c, c]);
  }
  return ranges;
}

await mkdir(outDir, { recursive: true });

let common = null;
const metrics = [];
for (const face of FACES) {
  const source = await readFile(require.resolve(face.src));
  const ttf = await subsetFont(source, CHARSET, { targetFormat: 'sfnt' });
  const woff2 = await subsetFont(source, CHARSET, { targetFormat: 'woff2' });

  const flavour = ttf.readUInt32BE(0);
  if (flavour !== 0x00010000) {
    throw new Error(`${face.file}: expected TrueType outlines, found 0x${flavour.toString(16)}`);
  }

  await writeFile(path.join(outDir, `${face.file}.ttf`), ttf);
  await writeFile(path.join(outDir, `${face.file}.woff2`), woff2);

  const glyphs = readGlyphs(ttf);
  const codePoints = new Set(glyphs.keys());
  if (face.text) {
    common = common ? new Set([...common].filter((c) => codePoints.has(c))) : codePoints;
  }
  if (face.metrics) metrics.push({ name: face.metrics, runs: toRuns(readAdvances(ttf, glyphs)) });
  console.log(
    `${face.file}: ${codePoints.size} characters, ttf ${(ttf.length / 1024).toFixed(0)} KB, woff2 ${(woff2.length / 1024).toFixed(0)} KB`,
  );
}

const ranges = toRanges([...common].sort((a, b) => a - b));
const coverage = `// Generated by scripts/build-fonts.mjs. Do not edit.

/** Inclusive code point ranges that the bundled text font (IBM Plex Sans) can draw. */
export const FONT_COVERAGE: readonly (readonly [number, number])[] = [
${ranges.map(([a, b]) => `  [0x${a.toString(16)}, 0x${b.toString(16)}],`).join('\n')}
];
`;
await writeFile(path.join(outDir, 'coverage.ts'), coverage);

const widths = `// Generated by scripts/build-fonts.mjs. Do not edit.

/**
 * How far each character of the bundled text fonts moves the pen, in
 * thousandths of the font size. Each entry is a run of neighbouring code
 * points: the first code point, then the widths.
 */
export const FONT_WIDTHS: Record<'sans400' | 'sans600', readonly (readonly number[])[]> = {
${metrics.map((face) => `  ${face.name}: [\n${face.runs.map((run) => `    [${run.join(', ')}],`).join('\n')}\n  ],`).join('\n')}
};
`;
await writeFile(path.join(outDir, 'metrics.ts'), widths);

await copyFile(
  require.resolve('@ibm/plex-sans/LICENSE.txt'),
  path.join(outDir, 'LICENSE-IBM-Plex.txt'),
);

console.log(`text coverage: ${common.size} characters in ${ranges.length} ranges`);
