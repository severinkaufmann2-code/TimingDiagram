/** Phases: titled stretches of time inside a group. Pure functions, like everything in the model. */

import { dropOrphanComments } from './comments';
import { newId } from './ids';
import { anchorAt, anchorTime, coverMoments, sameAnchor } from './moments';
import type { Anchor, Doc, Group, Phase } from './types';

export const PHASE_TITLE_MAX_LENGTH = 80;

export interface Span {
  start: number;
  end: number;
}

/** From when to when a phase lasts. Its two ends can have changed places when their points were moved. */
export function phaseSpan(doc: Doc, phase: Phase): Span {
  const a = anchorTime(doc, phase.from);
  const b = anchorTime(doc, phase.to);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** The moment a phase starts at, and the one it ends at. */
function phaseEnds(doc: Doc, phase: Phase): { start: Anchor; end: Anchor } {
  return anchorTime(doc, phase.from) <= anchorTime(doc, phase.to) ? { start: phase.from, end: phase.to } : { start: phase.to, end: phase.from };
}

/** The phases of a group from left to right. */
export function sortedPhases(doc: Doc, group: Group): Phase[] {
  return [...group.phases].sort((a, b) => phaseSpan(doc, a).start - phaseSpan(doc, b).start);
}

function findGroup(doc: Doc, groupId: string): Group | undefined {
  return doc.groups.find((group) => group.id === groupId);
}

export function findPhase(doc: Doc, groupId: string, phaseId: string): Phase | undefined {
  return findGroup(doc, groupId)?.phases.find((phase) => phase.id === phaseId);
}

/**
 * The stretch from `origin` towards `target` that is free in a group: it ends
 * where another phase begins. Null when it would have no length, or when
 * `origin` lies inside another phase.
 */
function fit(doc: Doc, group: Group, origin: Anchor, target: Anchor, ignoreId?: string): { from: Anchor; to: Anchor } | null {
  const o = anchorTime(doc, origin);
  let t = anchorTime(doc, target);
  let far = target;
  if (!Number.isFinite(o) || !Number.isFinite(t)) return null;
  for (const other of group.phases) {
    if (other.id === ignoreId) continue;
    const span = phaseSpan(doc, other);
    if (span.start === span.end) continue;
    if (o > span.start && o < span.end) return null;
    const ends = phaseEnds(doc, other);
    if (t > o && span.start >= o && span.start < t) {
      t = span.start;
      far = ends.start;
    } else if (t < o && span.end <= o && span.end > t) {
      t = span.end;
      far = ends.end;
    }
  }
  if (t === o) return null;
  return t > o ? { from: origin, to: far } : { from: far, to: origin };
}

/**
 * The stretch a new phase gets when it is added at a time without saying how
 * long it is: from the nearest transition point, phase or end of the timeline
 * on the left to the nearest one on the right. Null where a phase already is.
 */
export function gapAround(doc: Doc, groupId: string, time: number): { from: Anchor; to: Anchor } | null {
  const group = findGroup(doc, groupId);
  if (!group || !Number.isFinite(time)) return null;
  const t = Math.min(Math.max(time, doc.time.start), doc.time.end);
  const spans = group.phases.map((phase) => phaseSpan(doc, phase)).filter((span) => span.end > span.start);
  const marks = [doc.time.start, doc.time.end, ...doc.points.map((point) => point.time), ...spans.flatMap((span) => [span.start, span.end])];

  let left = -Infinity;
  let right = Infinity;
  for (const mark of marks) {
    if (mark <= t && mark > left) left = mark;
    if (mark > t && mark < right) right = mark;
  }
  if (!Number.isFinite(right)) {
    // at the very end of the timeline: the stretch before it
    right = left;
    left = -Infinity;
    for (const mark of marks) if (mark < right && mark > left) left = mark;
  }
  if (!Number.isFinite(left) || !(right > left)) return null;
  if (spans.some((span) => span.start < right && span.end > left)) return null;
  return { from: anchorAt(doc, left), to: anchorAt(doc, right) };
}

/** The first stretch of a group that a new phase could fill, from the left. */
export function firstGap(doc: Doc, groupId: string): { from: Anchor; to: Anchor } | null {
  const group = findGroup(doc, groupId);
  if (!group) return null;
  const marks = [...new Set([doc.time.start, doc.time.end, ...doc.points.map((point) => point.time)])].sort((a, b) => a - b);
  for (const mark of marks) {
    const gap = gapAround(doc, groupId, mark);
    if (gap && anchorTime(doc, gap.from) === mark) return gap;
  }
  return null;
}

function freeTitle(group: Group): string {
  const titles = new Set(group.phases.map((phase) => phase.title));
  for (let n = group.phases.length + 1; ; n++) {
    const title = `Phase ${n}`;
    if (!titles.has(title)) return title;
  }
}

function mapGroup(doc: Doc, groupId: string, change: (group: Group) => Group): Doc {
  let changed = false;
  const groups = doc.groups.map((group) => {
    if (group.id !== groupId) return group;
    const next = change(group);
    if (next !== group) changed = true;
    return next;
  });
  return changed ? { ...doc, groups } : doc;
}

/**
 * Adds a phase that runs from one moment towards another. It stops where
 * another phase of the group begins. The id is empty when there is no room.
 */
export function addPhase(doc: Doc, groupId: string, from: Anchor, to: Anchor, title?: string): { doc: Doc; id: string } {
  const group = findGroup(doc, groupId);
  const fitted = group && fit(doc, group, from, to);
  if (!group || !fitted) return { doc, id: '' };
  const id = newId('h', doc.groups.flatMap((candidate) => candidate.phases.map((phase) => phase.id)));
  const phase: Phase = { id, title: (title ?? freeTitle(group)).slice(0, PHASE_TITLE_MAX_LENGTH), ...fitted };
  return { doc: coverMoments(mapGroup(doc, groupId, (current) => ({ ...current, phases: [...current.phases, phase] }))), id };
}

export function renamePhase(doc: Doc, groupId: string, phaseId: string, title: string): Doc {
  const next = title.trim().slice(0, PHASE_TITLE_MAX_LENGTH);
  if (next === '') return doc;
  return mapGroup(doc, groupId, (group) => {
    const phase = group.phases.find((candidate) => candidate.id === phaseId);
    if (!phase || phase.title === next) return group;
    return { ...group, phases: group.phases.map((candidate) => (candidate.id === phaseId ? { ...candidate, title: next } : candidate)) };
  });
}

/**
 * The stretch a phase would get in a group when it is drawn from `origin`
 * towards `target`: it stops where another phase begins. Null when there is
 * no room. `ignoreId` names a phase that is being changed and so is not in the way.
 */
export function fitPhase(doc: Doc, groupId: string, origin: Anchor, target: Anchor, ignoreId?: string): { from: Anchor; to: Anchor } | null {
  const group = findGroup(doc, groupId);
  return group ? fit(doc, group, origin, target, ignoreId) : null;
}

/**
 * Lays a phase out anew: from the moment `origin`, which stays, towards
 * `target`, as far as the neighbouring phases allow.
 */
export function stretchPhase(doc: Doc, groupId: string, phaseId: string, origin: Anchor, target: Anchor): Doc {
  const group = findGroup(doc, groupId);
  const phase = group?.phases.find((candidate) => candidate.id === phaseId);
  if (!group || !phase) return doc;
  const fitted = fit(doc, group, origin, target, phaseId);
  if (!fitted || (sameAnchor(fitted.from, phase.from) && sameAnchor(fitted.to, phase.to))) return doc;
  const next = mapGroup(doc, groupId, (current) => ({
    ...current,
    phases: current.phases.map((candidate) => (candidate.id === phaseId ? { ...candidate, ...fitted } : candidate)),
  }));
  return coverMoments(next);
}

/** The moment a phase starts at, and the one it ends at. */
export function phaseMoments(doc: Doc, phase: Phase): { start: Anchor; end: Anchor } {
  return phaseEnds(doc, phase);
}

/**
 * Moves the start or the end of a phase to another moment. The other end
 * stays; the moved one stops where a neighbouring phase begins.
 */
export function setPhaseEdge(doc: Doc, groupId: string, phaseId: string, edge: 'start' | 'end', moment: Anchor): Doc {
  const phase = findPhase(doc, groupId, phaseId);
  if (!phase) return doc;
  const ends = phaseEnds(doc, phase);
  return stretchPhase(doc, groupId, phaseId, edge === 'start' ? ends.end : ends.start, moment);
}

/** Removes a phase, together with the comments on it. */
export function removePhase(doc: Doc, groupId: string, phaseId: string): Doc {
  const next = mapGroup(doc, groupId, (group) => {
    const phases = group.phases.filter((phase) => phase.id !== phaseId);
    return phases.length === group.phases.length ? group : { ...group, phases };
  });
  return next === doc ? doc : dropOrphanComments(next);
}
