/** What a pointer position in the drawing means for a comment that is placed or moved there. */

import { addComment, moveComment } from '../model/comments';
import type { CommentTarget, Doc } from '../model/types';
import { GROUP_BAR, computeLayout, type Layout, type LayoutOptions, type PinPlace } from '../render/layout';
import { SNAP_DISTANCE, momentAtPixel } from './snap';

/**
 * The place in the lanes that a position stands for: a spot of the channel
 * whose lane it is in, or the phase it is on. Null in the free part of a
 * group's bar and below the lanes. Near a transition point the spot is on
 * that point, unless `free`.
 */
export function laneTarget(doc: Doc, layout: Layout, x: number, y: number, free: boolean): CommentTarget | null {
  const band = layout.bands.find((candidate) => y >= candidate.top && y < candidate.top + GROUP_BAR);
  if (band) {
    const box = layout.phases.find((candidate) => candidate.groupId === band.group.id && x >= candidate.x && x <= candidate.x + candidate.width);
    return box ? { kind: 'phase', phase: box.phase.id } : null;
  }
  const row = layout.rows.find((candidate) => y >= candidate.top && y < candidate.top + candidate.height);
  if (!row) return null;
  return { kind: 'channel', channel: row.channel.id, at: momentAtPixel(doc, layout, x, free) };
}

/** The place in the ruler that a position stands for: the transition point under it, or else the time. */
export function rulerTarget(doc: Doc, layout: Layout, x: number, free: boolean): CommentTarget {
  let nearest: { pointId: string; distance: number } | null = null;
  for (const marker of layout.markers) {
    const distance = Math.abs(marker.x - x);
    // the whole label of a point counts as the point
    if (distance <= Math.max(marker.width / 2, SNAP_DISTANCE) && (!nearest || distance < nearest.distance)) {
      nearest = { pointId: marker.pointId, distance };
    }
  }
  return { kind: 'diagram', at: nearest ? { point: nearest.pointId } : momentAtPixel(doc, layout, x, free) };
}

/** A comment as it would look at a place where it is not yet. */
export interface PinPreview {
  /** The pin in the drawing, with the number the comment would get. Null when it would sit next to a name. */
  pin: PinPlace | null;
  /** For a pin next to a name: the id of the channel or group, or "diagram". */
  nameOf: string | null;
}

/**
 * Where the pin would be if a comment were put on a target: a new comment, or
 * the one with `commentId` moved there. Null when the target is of no use.
 */
export function previewPin(doc: Doc, scale: number, options: LayoutOptions, on: CommentTarget, commentId?: string): PinPreview | null {
  let id = commentId ?? '';
  let next: Doc;
  if (commentId) {
    next = moveComment(doc, commentId, on);
  } else {
    const added = addComment(doc, on);
    id = added.id;
    next = added.doc;
  }
  if (!id) return null;
  const pin = computeLayout(next, scale, options).pins.find((candidate) => candidate.comment.id === id) ?? null;
  if (pin) return { pin, nameOf: null };
  if (on.kind === 'channel' && !on.at) return { pin: null, nameOf: on.channel };
  if (on.kind === 'group') return { pin: null, nameOf: on.group };
  if (on.kind === 'diagram' && !on.at) return { pin: null, nameOf: 'diagram' };
  return null;
}
