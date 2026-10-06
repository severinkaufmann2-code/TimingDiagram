/** Turns a channel's values into the line that gets drawn. */

import type { Channel, Doc, Point } from './types';

export interface Vertex {
  t: number;
  v: number;
}

function pushVertex(vertices: Vertex[], t: number, v: number): void {
  const last = vertices[vertices.length - 1];
  if (last && last.t === t && last.v === v) return;
  // a third vertex on the same level only extends the flat stretch
  const beforeLast = vertices[vertices.length - 2];
  if (last && beforeLast && last.v === v && beforeLast.v === v) {
    last.t = t;
    return;
  }
  vertices.push({ t, v });
}

/**
 * The polyline of a channel from the start to the end of the timeline.
 *
 * The values of a channel are its support points; points of the timeline where
 * the channel has no value do not affect it. A step keeps the previous value up
 * to its point and jumps there. A ramp runs in a straight line from the
 * channel's previous value (or its initial value) to this one.
 */
export function channelVertices(doc: Doc, channel: Channel): Vertex[] {
  const { start, end } = doc.time;
  const vertices: Vertex[] = [{ t: start, v: channel.initial }];
  let level = channel.initial;
  let anchorTime = start;

  for (const point of doc.points) {
    const cell = channel.cells[point.id];
    if (!cell) continue;
    if (cell.mode === 'ramp') {
      pushVertex(vertices, anchorTime, level);
      pushVertex(vertices, point.time, cell.value);
    } else {
      pushVertex(vertices, point.time, level);
      pushVertex(vertices, point.time, cell.value);
    }
    level = cell.value;
    anchorTime = point.time;
  }

  pushVertex(vertices, Math.max(end, anchorTime), level);
  return vertices;
}

/** The value a channel holds once every point before the given index has acted. */
export function levelBefore(doc: Doc, channel: Channel, pointIndex: number): number {
  let level = channel.initial;
  for (let i = 0; i < pointIndex && i < doc.points.length; i++) {
    const cell = channel.cells[doc.points[i]!.id];
    if (cell) level = cell.value;
  }
  return level;
}

/**
 * The value of a channel at a time. At the instant of a step this is the value
 * after the jump.
 */
export function valueAt(doc: Doc, channel: Channel, time: number): number {
  let level = channel.initial;
  let anchorTime = doc.time.start;

  for (const point of doc.points) {
    const cell = channel.cells[point.id];
    if (!cell) continue;
    if (time < point.time) {
      if (cell.mode === 'ramp' && time > anchorTime) {
        const share = (time - anchorTime) / (point.time - anchorTime);
        return level + (cell.value - level) * share;
      }
      return level;
    }
    level = cell.value;
    anchorTime = point.time;
  }
  return level;
}

/**
 * The value a channel has just before a time: the same as {@link valueAt},
 * except at the instant of a step, where this is the value before the jump.
 */
export function valueBefore(doc: Doc, channel: Channel, time: number): number {
  let level = channel.initial;
  let anchorTime = doc.time.start;

  for (const point of doc.points) {
    const cell = channel.cells[point.id];
    if (!cell) continue;
    if (time <= point.time) {
      if (cell.mode === 'ramp' && time > anchorTime) {
        const share = (time - anchorTime) / (point.time - anchorTime);
        return level + (cell.value - level) * share;
      }
      return level;
    }
    level = cell.value;
    anchorTime = point.time;
  }
  return level;
}

/** Smallest and largest value a channel takes. */
export function valueExtent(channel: Channel): { min: number; max: number } {
  let min = channel.initial;
  let max = channel.initial;
  for (const cell of Object.values(channel.cells)) {
    if (cell.value < min) min = cell.value;
    if (cell.value > max) max = cell.value;
  }
  return { min, max };
}

/** Earliest and latest point, or null when there are no points. */
export function pointExtent(points: readonly Point[]): { min: number; max: number } | null {
  if (points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.time < min) min = p.time;
    if (p.time > max) max = p.time;
  }
  return { min, max };
}
