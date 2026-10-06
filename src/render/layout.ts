/** Geometry of the drawn diagram: where every time and every value lands in pixels. */

import { numberedComments } from '../model/comments';
import { anchorTime } from '../model/moments';
import { clamp, clean, decimalsOf, formatNumber, niceStep } from '../model/numbers';
import { phaseSpan, sortedPhases } from '../model/phases';
import type { Channel, Comment, Doc, Group, Phase } from '../model/types';

/** Space left of the first instant, for the value labels of the lanes. */
export const PAD_LEFT = 50;
/** Space right of the last instant. */
export const PAD_RIGHT = 40;
/** Height of the title bar of a group. Its phases are drawn into it. */
export const GROUP_BAR = 34;

/** Height of the upper lane of the ruler (numbers and ticks). */
const SCALE_HEIGHT = 27;
const PILL_HEIGHT = 19;
const PILL_ROW = 22;
const PILL_MARGIN = 5;
/** Room a pin takes next to another pin, or next to the label of a transition point. */
export const PIN_STEP = 17;
/** Air above and below a phase inside the bar of its group. */
const PHASE_INSET = 7;

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

/** A group as it is drawn: its title bar, and below it the lanes of its channels. */
export interface Band {
  group: Group;
  index: number;
  /** Top of the title bar. */
  top: number;
  /** Bottom of the last lane; the bottom of the bar while the group is folded away or empty. */
  bottom: number;
  folded: boolean;
  rows: Row[];
}

/** The box of a phase inside the bar of its group. */
export interface PhaseBox {
  phase: Phase;
  groupId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Number of comment pins that sit inside the box. */
  pins: number;
}

/** Where the pin of a comment is drawn. Comments on a whole channel, group or diagram sit next to the name instead. */
export interface PinPlace {
  comment: Comment;
  /** The number of the comment, from 1. */
  number: number;
  /** In a lane, inside a phase (both in the coordinates of the lanes), or in the ruler. */
  where: 'lane' | 'phase' | 'ruler';
  cx: number;
  cy: number;
  /** x of the moment the pin is on. */
  x: number;
  /** Top of the lane, phase or ruler row the pin sits in. */
  top: number;
  /** True for a pin at a plain time, where no line of a transition point shows the moment. */
  free: boolean;
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
  /** The lanes that are drawn, from top to bottom. Channels of a folded group have none. */
  rows: Row[];
  /** The groups from top to bottom. Empty in a diagram without groups. */
  bands: Band[];
  phases: PhaseBox[];
  pins: PinPlace[];
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

/** Width of a pin: a circle for one digit, a pill for more. */
export function pinWidth(number: number): number {
  return number > 9 ? 20 : 14;
}

/**
 * Places what sits in the lower lane of the ruler: the label boxes of the
 * transition points with the pins on them, and pins at a plain time. Close
 * neighbours are stacked in up to three rows.
 */
function buildMarkers(doc: Doc, x: (t: number) => number, timeDecimals: number, numbered: readonly Comment[]) {
  const markers: Marker[] = [];
  const pins: PinPlace[] = [];
  const entries: { x: number; left: number; right: number; place: (top: number) => void }[] = [];
  const centre = (top: number) => top + 0.5 + PILL_HEIGHT / 2;

  doc.points.forEach((point, index) => {
    const label = formatTime(point.time, timeDecimals);
    const width = markerWidth(label);
    const cx = x(point.time);
    const left = cx - width / 2;
    const onPoint = numbered.filter((comment) => {
      const on = comment.on;
      return on.kind === 'diagram' && on.at !== undefined && 'point' in on.at && on.at.point === point.id;
    });
    entries.push({
      x: cx,
      left,
      right: left + width + onPoint.length * PIN_STEP,
      place(top) {
        markers.push({ pointId: point.id, index, time: point.time, x: cx, label, width, top, height: PILL_HEIGHT });
        onPoint.forEach((comment, nth) => {
          pins.push({
            comment,
            number: numbered.indexOf(comment) + 1,
            where: 'ruler',
            cx: left + width + 10 + nth * PIN_STEP,
            cy: centre(top),
            x: cx,
            top,
            free: false,
          });
        });
      },
    });
  });

  numbered.forEach((comment, index) => {
    const on = comment.on;
    if (on.kind !== 'diagram' || !on.at || !('time' in on.at)) return;
    const px = x(on.at.time);
    entries.push({
      x: px,
      left: px - 1,
      right: px + 21,
      place(top) {
        pins.push({ comment, number: index + 1, where: 'ruler', cx: px + 13, cy: centre(top), x: px, top, free: true });
      },
    });
  });

  // from left to right; the sort is stable, so the points keep their order
  entries.sort((a, b) => a.x - b.x);
  const rowEnds: number[] = [];
  for (const entry of entries) {
    let row = rowEnds.findIndex((end) => entry.left >= end + 3);
    if (row < 0) {
      if (rowEnds.length < 3) row = rowEnds.length;
      else row = rowEnds.indexOf(Math.min(...rowEnds));
    }
    rowEnds[row] = entry.right;
    entry.place(SCALE_HEIGHT + PILL_MARGIN + row * PILL_ROW);
  }
  return { markers, rows: Math.max(1, rowEnds.length), pins };
}

export interface Lanes {
  rows: Row[];
  bands: Band[];
  height: number;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * The lanes from top to bottom, with the title bars of the groups between
 * them. The height of a lane depends only on the kind of its channel. A group
 * in `folded` shows its bar only.
 */
export function layoutLanes(doc: Doc, folded: ReadonlySet<string> = NONE): Lanes {
  const rows: Row[] = [];
  const bands: Band[] = [];
  let top = 0;
  const addRow = (channel: Channel): Row => {
    const lane = LANE[channel.kind];
    const row: Row = {
      channel,
      index: rows.length,
      top,
      height: lane.height,
      yMax: top + lane.inset,
      yMin: top + lane.height - lane.inset,
    };
    rows.push(row);
    top += lane.height;
    return row;
  };

  if (doc.groups.length === 0) {
    doc.channels.forEach(addRow);
    return { rows, bands, height: top };
  }
  doc.groups.forEach((group, index) => {
    const bandTop = top;
    top += GROUP_BAR;
    const isFolded = folded.has(group.id);
    const own = isFolded ? [] : doc.channels.filter((channel) => channel.group === group.id).map(addRow);
    bands.push({ group, index, top: bandTop, bottom: top, folded: isFolded, rows: own });
  });
  return { rows, bands, height: top };
}

/** The lanes that are drawn, from top to bottom. */
export function layoutRows(doc: Doc, folded?: ReadonlySet<string>): Row[] {
  return layoutLanes(doc, folded).rows;
}

function buildPhases(doc: Doc, bands: readonly Band[], x: (t: number) => number, numbered: readonly Comment[]): PhaseBox[] {
  return bands.flatMap((band) =>
    sortedPhases(doc, band.group).map((phase) => {
      const span = phaseSpan(doc, phase);
      const left = x(span.start);
      // a little air on both sides, so the line of the transition point shows between two phases
      return {
        phase,
        groupId: band.group.id,
        x: left + 1.5,
        y: band.top + PHASE_INSET + 0.5,
        width: Math.max(0, x(span.end) - left - 3),
        height: GROUP_BAR - 2 * PHASE_INSET - 1,
        pins: numbered.filter((comment) => comment.on.kind === 'phase' && comment.on.phase === phase.id).length,
      };
    }),
  );
}

/** The pins inside phases and at spots of the lanes. A comment whose lane is folded away has none. */
function buildLanePins(doc: Doc, rows: readonly Row[], phases: readonly PhaseBox[], x: (t: number) => number, numbered: readonly Comment[]): PinPlace[] {
  const pins: PinPlace[] = [];
  const placed = new Map<string, number>();
  /** How many pins already sit at a spot: the next one goes beside them. */
  const nthAt = (spot: string): number => {
    const nth = placed.get(spot) ?? 0;
    placed.set(spot, nth + 1);
    return nth;
  };
  numbered.forEach((comment, index) => {
    const on = comment.on;
    if (on.kind === 'phase') {
      const box = phases.find((candidate) => candidate.phase.id === on.phase);
      if (!box) return;
      const right = box.x + box.width;
      pins.push({
        comment,
        number: index + 1,
        where: 'phase',
        cx: right - 11 - nthAt(`phase ${on.phase}`) * PIN_STEP,
        cy: box.y + box.height / 2,
        x: right,
        top: box.y,
        free: false,
      });
    } else if (on.kind === 'channel' && on.at) {
      const row = rows.find((candidate) => candidate.channel.id === on.channel);
      if (!row) return;
      const px = x(anchorTime(doc, on.at));
      pins.push({
        comment,
        number: index + 1,
        where: 'lane',
        cx: px + 14 + nthAt(`${on.channel} ${px}`) * PIN_STEP,
        cy: row.top + 9,
        x: px,
        top: row.top,
        free: 'time' in on.at,
      });
    }
  });
  return pins;
}

export interface LayoutOptions {
  /** Groups that are folded away. */
  folded?: ReadonlySet<string>;
}

export function computeLayout(doc: Doc, scale: number, options: LayoutOptions = {}): Layout {
  const { start, end } = doc.time;
  const x = (time: number) => PAD_LEFT + (time - start) * scale;
  const time = (px: number) => start + (px - PAD_LEFT) / scale;

  const timeDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const numbered = numberedComments(doc);
  const { markers, rows: markerRows, pins: rulerPins } = buildMarkers(doc, x, timeDecimals, numbered);
  const rulerHeight = SCALE_HEIGHT + PILL_MARGIN + markerRows * PILL_ROW + 2;

  const lanes = layoutLanes(doc, options.folded);
  const phases = buildPhases(doc, lanes.bands, x, numbered);

  return {
    scale,
    width: Math.ceil(PAD_LEFT + (end - start) * scale + PAD_RIGHT),
    rulerHeight,
    scaleLine: SCALE_HEIGHT - 0.5,
    lanesHeight: lanes.height,
    rows: lanes.rows,
    bands: lanes.bands,
    phases,
    pins: [...rulerPins, ...buildLanePins(doc, lanes.rows, phases, x, numbered)],
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
