/** The bundled fonts as data, for files that have to carry their fonts with them. */

import { FONT_COVERAGE } from '../assets/fonts/coverage';
import mono400 from '../assets/fonts/plex-mono-400.woff2?inline';
import mono500 from '../assets/fonts/plex-mono-500.woff2?inline';
import sans400 from '../assets/fonts/plex-sans-400.woff2?inline';
import sans600 from '../assets/fonts/plex-sans-600.woff2?inline';

const FACES = [
  { family: 'IBM Plex Sans', weight: 400, url: sans400 },
  { family: 'IBM Plex Sans', weight: 600, url: sans600 },
  { family: 'IBM Plex Mono', weight: 400, url: mono400 },
  { family: 'IBM Plex Mono', weight: 500, url: mono500 },
];

/** CSS that makes the bundled fonts available inside a standalone SVG or HTML file. */
export function embeddedFontCss(): string {
  return FACES.map(
    (face) =>
      `@font-face{font-family:'${face.family}';font-weight:${face.weight};font-style:normal;` +
      `src:url(${face.url}) format('woff2')}`,
  ).join('');
}

/** True when the bundled text font can draw every character of the text. */
export function isCovered(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code === 0x0a || code === 0x0d || code === 0x09) continue;
    if (!FONT_COVERAGE.some(([from, to]) => code >= from && code <= to)) return false;
  }
  return true;
}
