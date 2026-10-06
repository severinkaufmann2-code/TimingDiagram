/**
 * Colours of the drawn diagram. Kept as plain values (not CSS variables) so
 * that an exported picture carries its colours with it.
 *
 * The channel colours are a categorical palette checked for colour-vision
 * deficiency and contrast on both surfaces; their order is part of that check.
 */

export interface DiagramTheme {
  name: 'light' | 'dark';
  /** Background of the lanes. */
  surface: string;
  /** Lower lane of the ruler, where the transition points sit. */
  markerLane: string;
  /** Highlight behind the selected channel. */
  band: string;
  /** Vertical lines at the ruler ticks. */
  grid: string;
  /** Lines between lanes. */
  rule: string;
  /** Line under the ruler. */
  axis: string;
  tick: string;
  text: string;
  textMuted: string;
  /** Vertical line of a transition point. */
  guide: string;
  pillFill: string;
  pillStroke: string;
  /** Ink of whatever is selected, and the text on top of it. */
  selected: string;
  onSelected: string;
  channels: readonly string[];
  /** Opacity of the wash under a waveform. */
  wash: number;
}

export const LIGHT: DiagramTheme = {
  name: 'light',
  surface: '#ffffff',
  markerLane: '#f7f8fa',
  band: '#f2f4f7',
  grid: '#eceef1',
  rule: '#e3e6ea',
  axis: '#c2c7cf',
  tick: '#8f97a3',
  text: '#14181f',
  textMuted: '#667080',
  guide: '#aab1bb',
  pillFill: '#ffffff',
  pillStroke: '#8f97a3',
  selected: '#14181f',
  onSelected: '#ffffff',
  channels: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  wash: 0.13,
};

export const DARK: DiagramTheme = {
  name: 'dark',
  surface: '#16181d',
  markerLane: '#1b1e24',
  band: '#20242b',
  grid: '#20232a',
  rule: '#2a2f37',
  axis: '#454c57',
  tick: '#6b7480',
  text: '#eef0f3',
  textMuted: '#9aa3af',
  guide: '#4d5560',
  pillFill: '#16181d',
  pillStroke: '#6b7480',
  selected: '#eef0f3',
  onSelected: '#14181f',
  channels: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  wash: 0.18,
};

export function channelColor(theme: DiagramTheme, index: number): string {
  const count = theme.channels.length;
  return theme.channels[((index % count) + count) % count]!;
}

export const FONT_SANS = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";

/** The font faces the drawing uses. Each one ships with the app. */
export type FontFace = 'sans400' | 'sans600' | 'mono400' | 'mono500';

export interface FontAttributes {
  fontFamily: string;
  fontWeight?: number;
}

/** Turns a font face into SVG attributes. Exports to PDF name their fonts differently. */
export type FontResolver = (face: FontFace) => FontAttributes;

const WEB_FONTS: Record<FontFace, FontAttributes> = {
  sans400: { fontFamily: FONT_SANS, fontWeight: 400 },
  sans600: { fontFamily: FONT_SANS, fontWeight: 600 },
  mono400: { fontFamily: FONT_MONO, fontWeight: 400 },
  mono500: { fontFamily: FONT_MONO, fontWeight: 500 },
};

export const webFont: FontResolver = (face) => WEB_FONTS[face];
