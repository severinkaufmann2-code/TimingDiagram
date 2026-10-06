/**
 * Every way a diagram can be changed. All functions are pure: they take a
 * document and return a new one, which is what makes undo trivial.
 */

import { dropOrphanComments } from './comments';
import { arrangeChannels } from './groups';
import { newId } from './ids';
import { freeMomentExtent, mapAnchors } from './moments';
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

export { newId };

/** The transition a new value gets: digital signals jump, analog signals glide. */
export function defaultMode(kind: ChannelKind): Mode {
  return kind === 'analog' ? 'ramp' : 'step';
}

export function emptyDoc(): Doc {
  return {
    title: 'Untitled diagram',
    time: { unit: 's', start: 0, end: 10, snap: 0.1 },
    points: [],
    groups: [],
    channels: [],
    comments: [],
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
 * point, phase and comment visible, and its end stays after its start.
 */
export function setTimeAxis(doc: Doc, patch: Partial<TimeAxis>): Doc {
  const next = { ...doc.time, ...patch };
  let start = Number.isFinite(next.start) ? clean(next.start) : doc.time.start;
  let end = Number.isFinite(next.end) ? clean(next.end) : doc.time.end;
  for (const extent of [pointExtent(doc.points), freeMomentExtent(doc)]) {
    if (!extent) continue;
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

/**
 * Adds a channel at the bottom of a group. Without a group it goes to the
 * last one, or to the bottom of a diagram that has no groups.
 */
export function addChannel(doc: Doc, kind: ChannelKind = 'digital', groupId?: string): { doc: Doc; id: string } {
  const id = newId('c', doc.channels.map((channel) => channel.id));
  const last = doc.groups[doc.groups.length - 1];
  const group = doc.groups.some((candidate) => candidate.id === groupId) ? groupId! : last ? last.id : null;
  const channel: Channel = {
    id,
    group,
    name: freeChannelName(doc),
    kind,
    color: freeColor(doc),
    unit: '',
    min: 0,
    max: kind === 'analog' ? 100 : 1,
    initial: 0,
    cells: {},
  };
  return { doc: arrangeChannels({ ...doc, channels: [...doc.channels, channel] }), id };
}

/** Removes a channel, together with the comments on it. */
export function removeChannel(doc: Doc, channelId: string): Doc {
  const channels = doc.channels.filter((channel) => channel.id !== channelId);
  return channels.length === doc.channels.length ? doc : dropOrphanComments({ ...doc, channels });
}

/**
 * Moves a channel so that it ends up at `toIndex` in the list. In a diagram
 * with groups it joins the group of the channel that was at that place.
 */
export function moveChannel(doc: Doc, channelId: string, toIndex: number): Doc {
  const from = doc.channels.findIndex((channel) => channel.id === channelId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(toIndex, doc.channels.length - 1));
  if (to === from) return doc;
  const channels = [...doc.channels];
  const [moved] = channels.splice(from, 1);
  channels.splice(to, 0, { ...moved!, group: doc.channels[to]!.group });
  return arrangeChannels({ ...doc, channels });
}

/**
 * Puts a channel at a place inside a group: `index` 0 is the top of the
 * group. With null as the group, the place counts in a diagram without groups.
 */
export function placeChannel(doc: Doc, channelId: string, groupId: string | null, index: number): Doc {
  const moved = findChannel(doc, channelId);
  const group = doc.groups.length === 0 ? null : groupId;
  if (!moved || (doc.groups.length > 0 && !doc.groups.some((candidate) => candidate.id === group))) return doc;
  const others = doc.channels.filter((channel) => channel.id !== channelId);
  const siblings = others.filter((channel) => channel.group === group);
  const at = Math.max(0, Math.min(Math.round(index), siblings.length));
  // right before the sibling that is at that place now, or at the end of the list; arranging sorts out the groups
  const before = siblings[at];
  const position = before ? others.indexOf(before) : others.length;
  const channels = [...others];
  channels.splice(position, 0, moved.group === group ? moved : { ...moved, group });
  const next = arrangeChannels({ ...doc, channels });
  return next.channels.every((channel, i) => channel === doc.channels[i]) ? doc : next;
}

/** Puts a channel right above or right below another one, in that channel's group. */
export function placeChannelBeside(doc: Doc, channelId: string, otherId: string, below: boolean): Doc {
  const other = findChannel(doc, otherId);
  if (!other || channelId === otherId) return doc;
  const siblings = doc.channels.filter((channel) => channel.group === other.group && channel.id !== channelId);
  return placeChannel(doc, channelId, other.group, siblings.indexOf(other) + (below ? 1 : 0));
}

/**
 * Moves a channel one place up or down. At the edge of its group it goes
 * over to the neighbouring group.
 */
export function moveChannelBy(doc: Doc, channelId: string, step: -1 | 1): Doc {
  const channel = findChannel(doc, channelId);
  if (!channel) return doc;
  const siblings = doc.channels.filter((candidate) => candidate.group === channel.group);
  const index = siblings.indexOf(channel);
  const target = index + step;
  if (target >= 0 && target < siblings.length) return placeChannel(doc, channelId, channel.group, target);
  const groupAt = doc.groups.findIndex((group) => group.id === channel.group);
  const neighbour = doc.groups[groupAt + step];
  if (groupAt < 0 || !neighbour) return doc;
  const size = doc.channels.filter((candidate) => candidate.group === neighbour.id).length;
  return placeChannel(doc, channelId, neighbour.id, step < 0 ? size : 0);
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
    const normalized = normalizeChannel(next);
    // a patch that changes nothing must not count as an edit
    return JSON.stringify(normalized) === JSON.stringify(channel) ? channel : normalized;
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

/**
 * Removes a point together with the values on it. Phases and comments that
 * held on to the point stay at the time it had.
 */
export function removePoint(doc: Doc, pointId: string): Doc {
  const removed = doc.points.find((point) => point.id === pointId);
  if (!removed) return doc;
  const released = mapAnchors(doc, (anchor) => ('point' in anchor && anchor.point === pointId ? { time: removed.time } : anchor));
  const channels = doc.channels.map((channel) => {
    if (!(pointId in channel.cells)) return channel;
    const cells = { ...channel.cells };
    delete cells[pointId];
    return { ...channel, cells };
  });
  return { ...released, points: doc.points.filter((point) => point.id !== pointId), channels };
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
 * after it keep their length. Ends of phases and pins of comments that sit
 * at a plain time from this point on move along.
 */
export function shiftPointsFrom(doc: Doc, pointId: string, delta: number): Doc {
  const from = pointIndex(doc, pointId);
  if (from < 0 || !Number.isFinite(delta) || delta === 0) return doc;
  const fromTime = doc.points[from]!.time;
  const points = sortPoints(
    doc.points.map((point, index) => (index >= from ? { ...point, time: clean(point.time + delta) } : point)),
  );
  const pushed = mapAnchors(doc, (anchor) => ('time' in anchor && anchor.time >= fromTime ? { time: clean(anchor.time + delta) } : anchor));
  let time = doc.time;
  for (const point of points) time = includeTime(time, point.time);
  const extent = freeMomentExtent(pushed);
  if (extent) time = includeTime(includeTime(time, extent.min), extent.max);
  return { ...pushed, points, time };
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
