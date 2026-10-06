/** Comments: notes attached to a place in the diagram. Pure functions, like everything in the model. */

import { newId } from './ids';
import { anchorTime, coverMoments } from './moments';
import type { Anchor, Comment, CommentTarget, Doc, Group, Phase } from './types';

export const COMMENT_MAX_LENGTH = 2000;

/** The group a phase belongs to, and the phase itself. */
export function phaseOwner(doc: Doc, phaseId: string): { group: Group; phase: Phase } | undefined {
  for (const group of doc.groups) {
    const phase = group.phases.find((candidate) => candidate.id === phaseId);
    if (phase) return { group, phase };
  }
  return undefined;
}

function momentExists(doc: Doc, at: Anchor | undefined): boolean {
  if (!at) return true;
  if ('time' in at) return Number.isFinite(at.time);
  return doc.points.some((point) => point.id === at.point);
}

/** True when the thing a comment is on is part of the diagram. */
export function targetExists(doc: Doc, on: CommentTarget): boolean {
  switch (on.kind) {
    case 'diagram':
      return momentExists(doc, on.at);
    case 'group':
      return doc.groups.some((group) => group.id === on.group);
    case 'phase':
      return phaseOwner(doc, on.phase) !== undefined;
    case 'channel':
      return doc.channels.some((channel) => channel.id === on.channel) && momentExists(doc, on.at);
  }
}

/** Removes the comments whose channel, group or phase is gone. */
export function dropOrphanComments(doc: Doc): Doc {
  const comments = doc.comments.filter((comment) => targetExists(doc, comment.on));
  return comments.length === doc.comments.length ? doc : { ...doc, comments };
}

export function findComment(doc: Doc, commentId: string): Comment | undefined {
  return doc.comments.find((comment) => comment.id === commentId);
}

export function addComment(doc: Doc, on: CommentTarget, text = ''): { doc: Doc; id: string } {
  if (!targetExists(doc, on)) return { doc, id: '' };
  const id = newId('n', doc.comments.map((comment) => comment.id));
  const comment: Comment = { id, text: text.slice(0, COMMENT_MAX_LENGTH), on };
  return { doc: coverMoments({ ...doc, comments: [...doc.comments, comment] }), id };
}

export function setCommentText(doc: Doc, commentId: string, text: string): Doc {
  const next = text.slice(0, COMMENT_MAX_LENGTH);
  const current = findComment(doc, commentId);
  if (!current || current.text === next) return doc;
  return { ...doc, comments: doc.comments.map((comment) => (comment.id === commentId ? { ...comment, text: next } : comment)) };
}

/** Pins a comment to another place. */
export function moveComment(doc: Doc, commentId: string, on: CommentTarget): Doc {
  const current = findComment(doc, commentId);
  if (!current || !targetExists(doc, on) || JSON.stringify(current.on) === JSON.stringify(on)) return doc;
  return coverMoments({ ...doc, comments: doc.comments.map((comment) => (comment.id === commentId ? { ...comment, on } : comment)) });
}

export function removeComment(doc: Doc, commentId: string): Doc {
  const comments = doc.comments.filter((comment) => comment.id !== commentId);
  return comments.length === doc.comments.length ? doc : { ...doc, comments };
}

/** The time a comment is pinned to, or null when it is about a whole channel, group, phase or diagram. */
export function commentTime(doc: Doc, comment: Comment): number | null {
  const on = comment.on;
  return (on.kind === 'diagram' || on.kind === 'channel') && on.at ? anchorTime(doc, on.at) : null;
}

/**
 * The comments in the order of their numbers, which is the order of reading:
 * the diagram first, then group by group from top to bottom, and inside a row
 * from left to right. Comment number n is the n-th entry.
 */
export function numberedComments(doc: Doc): Comment[] {
  const byTime = (comments: Comment[]) =>
    [...comments].sort((a, b) => (commentTime(doc, a) ?? -Infinity) - (commentTime(doc, b) ?? -Infinity));
  const onChannel = (channelId: string) =>
    byTime(doc.comments.filter((comment) => comment.on.kind === 'channel' && comment.on.channel === channelId));

  const ordered = byTime(doc.comments.filter((comment) => comment.on.kind === 'diagram'));
  if (doc.groups.length === 0) {
    for (const channel of doc.channels) ordered.push(...onChannel(channel.id));
    return ordered;
  }
  for (const group of doc.groups) {
    ordered.push(...doc.comments.filter((comment) => comment.on.kind === 'group' && comment.on.group === group.id));
    const phases = [...group.phases].sort(
      (a, b) =>
        Math.min(anchorTime(doc, a.from), anchorTime(doc, a.to)) - Math.min(anchorTime(doc, b.from), anchorTime(doc, b.to)),
    );
    for (const phase of phases) {
      ordered.push(...doc.comments.filter((comment) => comment.on.kind === 'phase' && comment.on.phase === phase.id));
    }
    for (const channel of doc.channels) {
      if (channel.group === group.id) ordered.push(...onChannel(channel.id));
    }
  }
  return ordered;
}
