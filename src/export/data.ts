/** The numbers and texts of a diagram arranged as tables, for the exports that list them. */

import { commentTime, numberedComments } from '../model/comments';
import { commentPlace } from '../model/describe';
import { clean } from '../model/numbers';
import { phaseSpan, sortedPhases } from '../model/phases';
import type { Channel, Doc, Group } from '../model/types';
import { valueAt, valueBefore } from '../model/waveform';

/** Name of a channel with its unit, e.g. "Cylinder A [mm]". */
export function channelLabel(channel: Channel): string {
  const unit = channel.kind === 'analog' ? channel.unit.trim() : '';
  return unit ? `${channel.name} [${unit}]` : channel.name;
}

/**
 * Name of a channel that says which group it is in, e.g. "Emergency stop –
 * Cylinder A [mm]". Two groups often hold channels of the same name. In a
 * diagram without groups this is {@link channelLabel}.
 */
export function qualifiedChannelLabel(doc: Doc, channel: Channel): string {
  const group = doc.groups.find((candidate) => candidate.id === channel.group);
  return group ? `${group.title} – ${channelLabel(channel)}` : channelLabel(channel);
}

export function timeLabel(doc: Doc): string {
  const unit = doc.time.unit.trim();
  return unit ? `Time [${unit}]` : 'Time';
}

/** The channels arranged by group, in the order they are drawn. One block without a group for a diagram that has none. */
export function channelBlocks(doc: Doc): { group: Group | null; channels: Channel[] }[] {
  if (doc.groups.length === 0) return [{ group: null, channels: doc.channels }];
  return doc.groups.map((group) => ({ group, channels: doc.channels.filter((channel) => channel.group === group.id) }));
}

export interface PlotRow {
  time: number;
  values: number[];
}

/**
 * The waveforms as rows of (time, one value per channel) that draw the exact
 * diagram when plotted as an XY chart with straight lines. Where a channel
 * jumps, the time appears twice: once with the values before the jump and once
 * with the values after it.
 */
export function plotRows(doc: Doc): PlotRow[] {
  const times = [...new Set([doc.time.start, ...doc.points.map((point) => point.time), doc.time.end])].sort((a, b) => a - b);
  const rows: PlotRow[] = [];
  for (const time of times) {
    const before = doc.channels.map((channel) => clean(valueBefore(doc, channel, time)));
    const after = doc.channels.map((channel) => clean(valueAt(doc, channel, time)));
    if (before.some((value, index) => value !== after[index])) rows.push({ time, values: before });
    rows.push({ time, values: after });
  }
  return rows;
}

export interface PhaseRow {
  group: string;
  phase: string;
  from: number;
  to: number;
  duration: number;
}

/** Every phase with its times, group by group and from left to right. */
export function phaseRows(doc: Doc): PhaseRow[] {
  return doc.groups.flatMap((group) =>
    sortedPhases(doc, group).map((phase) => {
      const span = phaseSpan(doc, phase);
      return { group: group.title, phase: phase.title, from: span.start, to: span.end, duration: clean(span.end - span.start) };
    }),
  );
}

export interface CommentLine {
  number: number;
  place: string;
  /** The time the comment is pinned to, or null when it is about a whole channel, group, phase or diagram. */
  time: number | null;
  text: string;
}

/** Every comment with its number and its place, in the order of the numbers. */
export function commentLines(doc: Doc): CommentLine[] {
  return numberedComments(doc).map((comment, index) => ({
    number: index + 1,
    place: commentPlace(doc, comment),
    time: commentTime(doc, comment),
    text: comment.text.trim(),
  }));
}
