/** The numbers of a diagram arranged as tables, for the exports that list values. */

import { clean } from '../model/numbers';
import type { Channel, Doc } from '../model/types';
import { valueAt, valueBefore } from '../model/waveform';

/** Name of a channel with its unit, e.g. "Cylinder A [mm]". */
export function channelLabel(channel: Channel): string {
  const unit = channel.kind === 'analog' ? channel.unit.trim() : '';
  return unit ? `${channel.name} [${unit}]` : channel.name;
}

export function timeLabel(doc: Doc): string {
  const unit = doc.time.unit.trim();
  return unit ? `Time [${unit}]` : 'Time';
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
