/** Geometry of the drawn diagram: where every time and every value lands in pixels. */

import { clamp, clean, decimalsOf, formatNumber, niceStep } from '../model/numbers';
import type { Channel, Doc } from '../model/types';

/** Space left of the first instant, for the value labels of the lanes. */
export const PAD_LEFT = 50;
/** Space right of the last instant. */
export const PAD_RIGHT = 40;

/** Height of the upper lane of the ruler (numbers and ticks). */
const SCALE_HEIGHT = 27;
const PILL_HEIGHT = 19;
const PILL_ROW = 22;
const PILL_MARGIN = 5;

const LANE = {
  digital: { height: 60, inset: 16 },
  analog: { height: 100, inset: 18 },
} as const;

export interface Row {
  channel: Channel;
  index: number;
  top: number;
  height: number;
  /** y of the channel's highest drawable value. */
  yMax: number;
  /** y of the channel's lowest drawable value. */
  yMin: number;
}

export interface Tick {
  time: number;
  x: number;
  label: string;
}

export interface Marker {
  pointId: string;
  index: number;
  time: number;
  x: number;
  label: string;
  width: number;
  /** Top edge of the label box. Close neighbours are stacked in rows. */
  top: number;
  height: number;
}

export interface Layout {
  /** Pixels per unit of time. */
  scale: number;
  width: number;
  rulerHeight: number;
  /** y of the line between the scale and the marker lane. */
  scaleLine: number;
  lanesHeight: number;
  rows: Row[];
  majorTicks: Tick[];
  minorTicks: number[];
  markers: Marker[];
  /** Decimals that times are written with at least. */
  timeDecimals: number;
  x(time: number): number;
  time(x: number): number;
}

export function rowY(row: Row, value: number): number {
  const { min, max } = row.channel;
  const share = max > min ? (value - min) / (max - min) : 0;
  return row.yMin - share * (row.yMin - row.yMax);
}

/** The value under a y coordinate, limited to the lane's range. */
export function rowValue(row: Row, y: number): number {
  const { min, max } = row.channel;
  const share = clamp((row.yMin - y) / (row.yMin - row.yMax), 0, 1);
  return min + share * (max - min);
}

/** The grid that dragged values snap to: about a hundredth of the lane's range. */
export function valueStep(channel: Channel): number {
  if (channel.kind === 'digital') return 1;
  return niceStep((channel.max - channel.min) / 100);
}

export function formatTime(time: number, minDecimals: number): string {
  return formatNumber(time, minDecimals);
}

export function markerWidth(label: string): number {
  return Math.max(40, Math.round(label.length * 6.7 + 14));
}

function buildTicks(doc: Doc, scale: number, x: (t: number) => number) {
  const { start, end } = doc.time;
  const major = niceStep(80 / scale);
  const digit = Math.round(major / 10 ** Math.floor(Math.log10(major) + 1e-9));
  const minor = clean(digit === 5 ? major / 5 : major / 2);
  const decimals = decimalsOf(major);

  const majorTicks: Tick[] = [];
  const first = Math.ceil(start / major - 1e-9);
  const last = Math.floor(end / major + 1e-9);
  if (last - first <= 2000) {
    for (let i = first; i <= last; i++) {
      const time = clean(i * major);
      majorTicks.push({ time, x: x(time), label: formatNumber(time, decimals) });
    }
  }

  const minorTicks: number[] = [];
  const firstMinor = Math.ceil(start / minor - 1e-9);
  const lastMinor = Math.floor(end / minor + 1e-9);
  if (lastMinor - firstMinor <= 4000 && minor * scale >= 6) {
    const perMajor = Math.round(major / minor);
    for (let i = firstMinor; i <= lastMinor; i++) {
      if (i % perMajor !== 0) minorTicks.push(x(clean(i * minor)));
    }
  }
  return { majorTicks, minorTicks };
}

/** Places the label boxes of the transition points, stacking close neighbours in up to three rows. */
function buildMarkers(doc: Doc, x: (t: number) => number, timeDecimals: number) {
  const rowEnds: number[] = [];
  const markers: Marker[] = doc.points.map((point, index) => {
    const label = formatTime(point.time, timeDecimals);
    const width = markerWidth(label);
    const cx = x(point.time);
    const left = cx - width / 2;
    let row = rowEnds.findIndex((end) => left >= end + 3);
    if (row < 0) {
      if (rowEnds.length < 3) row = rowEnds.length;
      else row = rowEnds.indexOf(Math.min(...rowEnds));
    }
    rowEnds[row] = left + width;
    return {
      pointId: point.id,
      index,
      time: point.time,
      x: cx,
      label,
      width,
      top: SCALE_HEIGHT + PILL_MARGIN + row * PILL_ROW,
      height: PILL_HEIGHT,
    };
  });
  return { markers, rows: Math.max(1, rowEnds.length) };
}

/** The lanes from top to bottom. Their heights depend only on the kind of each channel. */
export function layoutRows(doc: Doc): Row[] {
  let top = 0;
  return doc.channels.map((channel, index) => {
    const lane = LANE[channel.kind];
    const row: Row = {
      channel,
      index,
      top,
      height: lane.height,
      yMax: top + lane.inset,
      yMin: top + lane.height - lane.inset,
    };
    top += lane.height;
    return row;
  });
}

export function computeLayout(doc: Doc, scale: number): Layout {
  const { start, end } = doc.time;
  const x = (time: number) => PAD_LEFT + (time - start) * scale;
  const time = (px: number) => start + (px - PAD_LEFT) / scale;

  const timeDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const { markers, rows: markerRows } = buildMarkers(doc, x, timeDecimals);
  const rulerHeight = SCALE_HEIGHT + PILL_MARGIN + markerRows * PILL_ROW + 2;

  const rows = layoutRows(doc);
  const lastRow = rows[rows.length - 1];

  return {
    scale,
    width: Math.ceil(PAD_LEFT + (end - start) * scale + PAD_RIGHT),
    rulerHeight,
    scaleLine: SCALE_HEIGHT - 0.5,
    lanesHeight: lastRow ? lastRow.top + lastRow.height : 0,
    rows,
    ...buildTicks(doc, scale, x),
    markers,
    timeDecimals,
    x,
    time,
  };
}

/** The scale at which the whole timeline fits into `available` pixels. */
export function fitScale(doc: Doc, available: number): number {
  const span = doc.time.end - doc.time.start;
  const usable = Math.max(120, available - PAD_LEFT - PAD_RIGHT);
  return usable / (span > 0 ? span : 1);
}

/** Puts a 1px line on the pixel grid so that it renders sharp. */
export function crisp(coordinate: number): number {
  return Math.round(coordinate - 0.5) + 0.5;
}
