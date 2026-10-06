/** Words for the things of a diagram, as they appear in lists and exports. */

import { phaseOwner } from './comments';
import { anchorTime } from './moments';
import { decimalsOf, formatNumber } from './numbers';
import type { Anchor, Comment, Doc } from './types';

/** Decimals that times are written with at least: as many as the snap grid has. */
export function timeDecimals(doc: Doc): number {
  return doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
}

/** A time with the unit of the axis, e.g. "5.0 s". */
export function describeTime(doc: Doc, time: number): string {
  const unit = doc.time.unit.trim();
  const number = formatNumber(time, timeDecimals(doc));
  return unit ? `${number} ${unit}` : number;
}

function describeMoment(doc: Doc, at: Anchor): string {
  return describeTime(doc, anchorTime(doc, at));
}

/** Where a comment is, e.g. "Normal cycle · Valve Y1 · 1.0 s". */
export function commentPlace(doc: Doc, comment: Comment): string {
  const on = comment.on;
  switch (on.kind) {
    case 'diagram':
      if (!on.at) return 'Whole diagram';
      return 'point' in on.at ? `Transition point · ${describeMoment(doc, on.at)}` : `Timeline · ${describeMoment(doc, on.at)}`;
    case 'group':
      return doc.groups.find((group) => group.id === on.group)?.title ?? '';
    case 'phase': {
      const owner = phaseOwner(doc, on.phase);
      return owner ? `${owner.group.title} · ${owner.phase.title}` : '';
    }
    case 'channel': {
      const channel = doc.channels.find((candidate) => candidate.id === on.channel);
      if (!channel) return '';
      const group = doc.groups.find((candidate) => candidate.id === channel.group);
      const parts = group ? [group.title, channel.name] : [channel.name];
      if (on.at) parts.push(describeMoment(doc, on.at));
      return parts.join(' · ');
    }
  }
}
