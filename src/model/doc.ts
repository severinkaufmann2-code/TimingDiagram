/**
 * Every way a diagram can be changed. All functions are pure: they take a
 * document and return a new one, which is what makes undo trivial.
 */

import { clean } from './numbers';
import {
  INITIAL,
  type Cell,
  type Channel,
  type ChannelKind,
  type Column,
  type Doc,
  type Mode,
  type Point,
  type TimeAxis,
} from './types';
import { levelBefore, pointExtent, valueExtent } from './waveform';

/** Number of channel colours. A channel stores an index into this palette. */
export const PALETTE_SIZE = 8;

export function newId(prefix: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = prefix + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    if (!used.has(id)) return id;
  }
}

/** The transition a new value gets: digital signals jump, analog signals glide. */
export function defaultMode(kind: ChannelKind): Mode {
  return kind === 'analog' ? 'ramp' : 'step';
}

export function emptyDoc(): Doc {
  return {
    title: 'Untitled diagram',
    time: { unit: 's', start: 0, end: 10, snap: 0.1 },
    points: [],
    channels: [],
  };
}

/** A fresh diagram with one channel, ready to be drawn on. */
export function newDoc(): Doc {
  return addChannel(emptyDoc(), 'digital').doc;
}

// ───────────────────────────── helpers ─────────────────────────────

function sortPoints(points: readonly Point[]): Point[] {
  return [...points].sort((a, b) => a.time - b.time);
}

function to01(value: number, threshold = 0.5): number {
  return value >= threshold ? 1 : 0;
}

/** Brings a channel back to a consistent state after an edit. */
export function normalizeChannel(channel: Channel): Channel {
  if (channel.kind === 'digital') {
    const cells: Record<string, Cell> = {};
    for (const [id, cell] of Object.entries(channel.cells)) {
      cells[id] = { value: to01(cell.value), mode: cell.mode };
    }
    return { ...channel, min: 0, max: 1, initial: to01(channel.initial), cells };
  }
  // an analog lane always shows all of its values
  const extent = valueExtent(channel);
  const min = clean(Math.min(channel.min, extent.min));
  let max = clean(Math.max(channel.max, extent.max));
  if (!(max > min)) max = clean(min + 1);
  return { ...channel, min, max };
}

function mapChannel(doc: Doc, channelId: string, change: (channel: Channel) => Channel): Doc {
  let changed = false;
  const channels = doc.channels.map((channel) => {
    if (channel.id !== channelId) return channel;
    const next = change(channel);
    if (next !== channel) changed = true;
    return next;
  });
  return changed ? { ...doc, channels } : doc;
}

function includeTime(time: TimeAxis, t: number): TimeAxis {
  if (t >= time.start && t <= time.end) return time;
  return { ...time, start: Math.min(time.start, t), end: Math.max(time.end, t) };
}

export function findChannel(doc: Doc, channelId: string): Channel | undefined {
  return doc.channels.find((channel) => channel.id === channelId);
}

export function pointIndex(doc: Doc, pointId: string): number {
  return doc.points.findIndex((point) => point.id === pointId);
}

// ───────────────────────────── document ─────────────────────────────

export function setTitle(doc: Doc, title: string): Doc {
  return title === doc.title ? doc : { ...doc, title };
}

/**
 * Changes unit, range or snap grid. The range always keeps every transition
 * point visible, and its end stays after its start.
 */
export function setTimeAxis(doc: Doc, patch: Partial<TimeAxis>): Doc {
  const next = { ...doc.time, ...patch };
  let start = Number.isFinite(next.start) ? clean(next.start) : doc.time.start;
  let end = Number.isFinite(next.end) ? clean(next.end) : doc.time.end;
  const extent = pointExtent(doc.points);
  if (extent) {
    start = Math.min(start, extent.min);
    end = Math.max(end, extent.max);
  }
  if (!(end > start)) {
    // keep the length the timeline had when only one side was moved too far
    const length = doc.time.end - doc.time.start;
    if (patch.start !== undefined && patch.end === undefined) end = clean(start + length);
    else end = clean(start + 1);
  }
  const snap = Number.isFinite(next.snap) && next.snap > 0 ? clean(next.snap) : 0;
  return { ...doc, time: { unit: next.unit, start, end, snap } };
}

// ───────────────────────────── channels ─────────────────────────────

function freeChannelName(doc: Doc): string {
  const names = new Set(doc.channels.map((channel) => channel.name));
  for (let n = doc.channels.length + 1; ; n++) {
    const name = `Channel ${n}`;
    if (!names.has(name)) return name;
  }
}

function freeColor(doc: Doc): number {
  const used = new Set(doc.channels.map((channel) => channel.color));
  for (let color = 0; color < PALETTE_SIZE; color++) {
    if (!used.has(color)) return color;
  }
  return doc.channels.length % PALETTE_SIZE;
}

export function addChannel(
  doc: Doc,
  kind: ChannelKind = 'digital',
  index: number = doc.channels.length,
): { doc: Doc; id: string } {
  const id = newId('c', doc.channels.map((channel) => channel.id));
  const channel: Channel = {
    id,
    name: freeChannelName(doc),
    kind,
    color: freeColor(doc),
    unit: '',
    min: 0,
    max: kind === 'analog' ? 100 : 1,
    initial: 0,
    cells: {},
  };
  const channels = [...doc.channels];
  channels.splice(Math.max(0, Math.min(index, channels.length)), 0, channel);
  return { doc: { ...doc, channels }, id };
}

export function removeChannel(doc: Doc, channelId: string): Doc {
  const channels = doc.channels.filter((channel) => channel.id !== channelId);
  return channels.length === doc.channels.length ? doc : { ...doc, channels };
}

/** Moves a channel so that it ends up at `toIndex` in the list. */
export function moveChannel(doc: Doc, channelId: string, toIndex: number): Doc {
  const from = doc.channels.findIndex((channel) => channel.id === channelId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(toIndex, doc.channels.length - 1));
  if (to === from) return doc;
  const channels = [...doc.channels];
  const [moved] = channels.splice(from, 1);
  channels.splice(to, 0, moved!);
  return { ...doc, channels };
}

export type ChannelPatch = Partial<Pick<Channel, 'name' | 'color' | 'unit' | 'min' | 'max'>>;

export function updateChannel(doc: Doc, channelId: string, patch: ChannelPatch): Doc {
  return mapChannel(doc, channelId, (channel) => {
    const next = { ...channel, ...patch };
    if (patch.color !== undefined) {
      next.color = ((Math.round(patch.color) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
    }
    if (patch.min !== undefined && Number.isFinite(patch.min)) next.min = clean(patch.min);
    else next.min = channel.min;
    if (patch.max !== undefined && Number.isFinite(patch.max)) next.max = clean(patch.max);
    else next.max = channel.max;
    return normalizeChannel(next);
  });
}

/**
 * Switches a channel between digital and analog. Going digital maps every
 * value to 0 or 1, split at the middle of the old range.
 */
export function setChannelKind(doc: Doc, channelId: string, kind: ChannelKind): Doc {
  return mapChannel(doc, channelId, (channel) => {
    if (channel.kind === kind) return channel;
    if (kind === 'analog') return normalizeChannel({ ...channel, kind });
    const threshold = (channel.min + channel.max) / 2;
    const cells: Record<string, Cell> = {};
    for (const [id, cell] of Object.entries(channel.cells)) {
      cells[id] = { value: to01(cell.value, threshold), mode: cell.mode };
    }
    return normalizeChannel({
      ...channel,
      kind,
      initial: to01(channel.initial, threshold),
      cells,
    });
  });
}

/** Makes every transition of a channel a step, or every one a ramp. */
export function setAllModes(doc: Doc, channelId: string, mode: Mode): Doc {
  return mapChannel(doc, channelId, (channel) => {
    const cells: Record<string, Cell> = {};
    for (const [id, cell] of Object.entries(channel.cells)) cells[id] = { ...cell, mode };
    return { ...channel, cells };
  });
}

// ───────────────────────────── points ─────────────────────────────

export function addPoint(doc: Doc, time: number): { doc: Doc; id: string } {
  const t = clean(time);
  const id = newId('p', doc.points.map((point) => point.id));
  return {
    doc: {
      ...doc,
      points: sortPoints([...doc.points, { id, time: t }]),
      time: includeTime(doc.time, t),
    },
    id,
  };
}

export function removePoint(doc: Doc, pointId: string): Doc {
  if (pointIndex(doc, pointId) < 0) return doc;
  const channels = doc.channels.map((channel) => {
    if (!(pointId in channel.cells)) return channel;
    const cells = { ...channel.cells };
    delete cells[pointId];
    return { ...channel, cells };
  });
  return { ...doc, points: doc.points.filter((point) => point.id !== pointId), channels };
}

export function setPointTime(doc: Doc, pointId: string, time: number): Doc {
  if (!Number.isFinite(time)) return doc;
  const t = clean(time);
  const current = doc.points.find((point) => point.id === pointId);
  if (!current || current.time === t) return doc;
  const points = sortPoints(doc.points.map((point) => (point.id === pointId ? { ...point, time: t } : point)));
  return { ...doc, points, time: includeTime(doc.time, t) };
}

/**
 * Moves a point and every later one by the same amount, so the intervals
 * after it keep their length.
 */
export function shiftPointsFrom(doc: Doc, pointId: string, delta: number): Doc {
  const from = pointIndex(doc, pointId);
  if (from < 0 || !Number.isFinite(delta) || delta === 0) return doc;
  const points = sortPoints(
    doc.points.map((point, index) => (index >= from ? { ...point, time: clean(point.time + delta) } : point)),
  );
  let time = doc.time;
  for (const point of points) time = includeTime(time, point.time);
  return { ...doc, points, time };
}

// ───────────────────────────── values ─────────────────────────────

/** Sets or removes the raw value of a channel at a point. */
export function setCell(doc: Doc, channelId: string, pointId: string, cell: Cell | null): Doc {
  if (pointIndex(doc, pointId) < 0) return doc;
  if (cell && !Number.isFinite(cell.value)) return doc;
  return mapChannel(doc, channelId, (channel) => {
    const cells = { ...channel.cells };
    if (cell) cells[pointId] = { value: clean(cell.value), mode: cell.mode };
    else if (pointId in cells) delete cells[pointId];
    else return channel;
    return normalizeChannel({ ...channel, cells });
  });
}

/** Gives the channel an explicit value at the point before `index`, if it has none there. */
function holdLevelBefore(doc: Doc, channelId: string, index: number): Doc {
  const previous = doc.points[index - 1];
  const channel = findChannel(doc, channelId);
  if (!previous || !channel || channel.cells[previous.id]) return doc;
  return setCell(doc, channelId, previous.id, {
    value: levelBefore(doc, channel, index - 1),
    mode: 'step',
  });
}

/**
 * Sets a value the way a person means it.
 *
 * A new value takes the channel's usual transition. When a value becomes a
 * ramp, the channel's level is fixed at the point before it, so the ramp spans
 * exactly the interval "from the previous point to this one". Removing that
 * fixed value afterwards lets the ramp start further back.
 */
export function putValue(doc: Doc, channelId: string, pointId: string, value: number, mode?: Mode): Doc {
  const channel = findChannel(doc, channelId);
  const index = pointIndex(doc, pointId);
  if (!channel || index < 0 || !Number.isFinite(value)) return doc;
  const existing = channel.cells[pointId];
  const nextMode = mode ?? existing?.mode ?? defaultMode(channel.kind);
  const base = nextMode === 'ramp' && existing?.mode !== 'ramp' ? holdLevelBefore(doc, channelId, index) : doc;
  return setCell(base, channelId, pointId, { value, mode: nextMode });
}

/** Sets the value in a column of the values table: a point, or the initial value. */
export function setValue(doc: Doc, channelId: string, column: Column, value: number): Doc {
  if (!Number.isFinite(value)) return doc;
  if (column !== INITIAL) return putValue(doc, channelId, column, value);
  return mapChannel(doc, channelId, (channel) => normalizeChannel({ ...channel, initial: clean(value) }));
}

/** Changes how an existing value is reached. Does nothing where the channel has no value. */
export function setMode(doc: Doc, channelId: string, pointId: string, mode: Mode): Doc {
  const cell = findChannel(doc, channelId)?.cells[pointId];
  if (!cell || cell.mode === mode) return doc;
  return putValue(doc, channelId, pointId, cell.value, mode);
}

/** Removes a value: the channel no longer changes at that point. */
export function clearValue(doc: Doc, channelId: string, pointId: string): Doc {
  return setCell(doc, channelId, pointId, null);
}

/** Flips a digital channel at a point: an existing value is inverted, a new one is the opposite of the level before. */
export function toggleDigital(doc: Doc, channelId: string, column: Column): Doc {
  const channel = findChannel(doc, channelId);
  if (!channel) return doc;
  if (column === INITIAL) return setValue(doc, channelId, INITIAL, channel.initial >= 0.5 ? 0 : 1);
  const index = pointIndex(doc, column);
  if (index < 0) return doc;
  const current = channel.cells[column]?.value ?? levelBefore(doc, channel, index);
  return putValue(doc, channelId, column, current >= 0.5 ? 0 : 1);
}
