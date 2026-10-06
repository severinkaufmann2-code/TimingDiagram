/**
 * Moments: the places on the timeline that the ends of phases and the pins of
 * comments hold on to. A moment on a transition point follows that point; a
 * moment that is a plain time stays where it is.
 */

import { clean } from './numbers';
import type { Anchor, Comment, Doc, Group } from './types';

/** The time of a moment. One on a point that no longer exists counts as the start of the timeline. */
export function anchorTime(doc: Doc, anchor: Anchor): number {
  if ('time' in anchor) return anchor.time;
  const point = doc.points.find((candidate) => candidate.id === anchor.point);
  return point ? point.time : doc.time.start;
}

/** The moment for a time: the transition point at exactly that time when there is one, otherwise the time itself. */
export function anchorAt(doc: Doc, time: number): Anchor {
  const t = clean(time);
  const point = doc.points.find((candidate) => candidate.time === t);
  return point ? { point: point.id } : { time: t };
}

export function sameAnchor(a: Anchor, b: Anchor): boolean {
  if ('point' in a) return 'point' in b && a.point === b.point;
  return 'time' in b && a.time === b.time;
}

/** Applies a change to every moment of the diagram. Returns the same diagram when none of them changes. */
export function mapAnchors(doc: Doc, change: (anchor: Anchor) => Anchor): Doc {
  let changed = false;
  const apply = (anchor: Anchor): Anchor => {
    const next = change(anchor);
    if (next !== anchor) changed = true;
    return next;
  };

  const groups: Group[] = doc.groups.map((group) => {
    let touched = false;
    const phases = group.phases.map((phase) => {
      const from = apply(phase.from);
      const to = apply(phase.to);
      if (from === phase.from && to === phase.to) return phase;
      touched = true;
      return { ...phase, from, to };
    });
    return touched ? { ...group, phases } : group;
  });

  const comments: Comment[] = doc.comments.map((comment) => {
    const on = comment.on;
    if ((on.kind !== 'diagram' && on.kind !== 'channel') || !on.at) return comment;
    const at = apply(on.at);
    return at === on.at ? comment : { ...comment, on: { ...on, at } };
  });

  return changed ? { ...doc, groups, comments } : doc;
}

/** Every moment of the diagram that is a plain time. */
function freeTimes(doc: Doc): number[] {
  const times: number[] = [];
  mapAnchors(doc, (anchor) => {
    if ('time' in anchor) times.push(anchor.time);
    return anchor;
  });
  return times;
}

/** Earliest and latest moment that is a plain time, or null when there is none. */
export function freeMomentExtent(doc: Doc): { min: number; max: number } | null {
  const times = freeTimes(doc);
  if (times.length === 0) return null;
  return { min: Math.min(...times), max: Math.max(...times) };
}

/** Widens the time range so that it shows every moment. */
export function coverMoments(doc: Doc): Doc {
  const extent = freeMomentExtent(doc);
  if (!extent || (extent.min >= doc.time.start && extent.max <= doc.time.end)) return doc;
  return { ...doc, time: { ...doc.time, start: Math.min(doc.time.start, extent.min), end: Math.max(doc.time.end, extent.max) } };
}
