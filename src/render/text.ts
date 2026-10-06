/**
 * Measuring text without a browser. A drawing that is exported has to know how
 * wide its texts are, to shorten a title that does not fit or to break a long
 * comment into lines. The widths come from the bundled fonts themselves.
 */

import { FONT_WIDTHS } from '../assets/fonts/metrics';
import type { FontFace } from './theme';

/** Every character of the monospaced faces is this wide, in thousandths of the font size. */
const MONO_WIDTH = 600;
/** Assumed for a character the bundled font cannot draw: some other font then draws it, probably wide. */
const UNKNOWN_WIDTH = 1000;
/**
 * Pixels added per character. Some browsers (Chromium on Linux) round the
 * width of every letter to whole pixels, which makes small text up to 5 %
 * wider than the font says; Firefox keeps the exact widths. With this
 * allowance a text measured here does not turn out wider on screen.
 */
const ROUNDING_ALLOWANCE = 0.35;

const tables = new Map<string, Map<number, number>>();

function widthsOf(face: 'sans400' | 'sans600'): Map<number, number> {
  let table = tables.get(face);
  if (!table) {
    table = new Map();
    for (const run of FONT_WIDTHS[face]) {
      for (let i = 1; i < run.length; i++) table.set(run[0]! + i - 1, run[i]!);
    }
    tables.set(face, table);
  }
  return table;
}

/** Width in pixels of a single line of text at a font size. It errs on the wide side: kerning is left out, and see above. */
export function textWidth(text: string, face: FontFace, size: number): number {
  let units = 0;
  let characters = 0;
  const table = face === 'mono400' || face === 'mono500' ? null : widthsOf(face);
  for (const character of text) {
    units += table ? (table.get(character.codePointAt(0)!) ?? UNKNOWN_WIDTH) : MONO_WIDTH;
    characters++;
  }
  return (units * size) / 1000 + characters * ROUNDING_ALLOWANCE;
}

/** Shortens a text with an ellipsis until it fits a width. Empty when not even one character fits. */
export function fitText(text: string, face: FontFace, size: number, maxWidth: number): string {
  if (textWidth(text, face, size) <= maxWidth) return text;
  const characters = [...text];
  while (characters.length > 0) {
    characters.pop();
    const shortened = `${characters.join('').trimEnd()}…`;
    if (characters.length > 0 && textWidth(shortened, face, size) <= maxWidth) return shortened;
  }
  return '';
}

/**
 * Breaks a text into lines that fit a width. Line breaks in the text are
 * kept, lines break between words, and a word longer than a line is cut.
 */
export function wrapText(text: string, face: FontFace, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const fits = (candidate: string) => textWidth(candidate, face, size) <= maxWidth;
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
      const joined = line === '' ? word : `${line} ${word}`;
      if (fits(joined)) {
        line = joined;
        continue;
      }
      if (line !== '') lines.push(line);
      line = word;
      // a single word that is too long: cut it wherever the line ends
      while (!fits(line) && [...line].length > 1) {
        const characters = [...line];
        let cut = characters.length - 1;
        while (cut > 1 && !fits(characters.slice(0, cut).join(''))) cut--;
        lines.push(characters.slice(0, cut).join(''));
        line = characters.slice(cut).join('');
      }
    }
    lines.push(line);
  }
  return lines;
}
