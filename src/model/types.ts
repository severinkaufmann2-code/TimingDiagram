/**
 * The document model of a timing diagram.
 *
 * Transition points belong to the timeline and are shared by all channels.
 * A channel may hold a value at a point (a "cell"); a missing cell means the
 * channel does not change there.
 */

/** How a channel arrives at a value, seen from the previous point on the timeline. */
export type Mode =
  /** Keep the previous value up to this point, then jump. */
  | 'step'
  /** Change linearly from the previous point to this one. */
  | 'ramp';

export type ChannelKind = 'digital' | 'analog';

export interface Cell {
  value: number;
  mode: Mode;
}

export interface Point {
  id: string;
  time: number;
}

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  /** Index into the channel colour palette. */
  color: number;
  /** Unit of the values, shown next to the name. Analog channels only. */
  unit: string;
  /** Value drawn at the bottom of the lane. Always 0 for digital channels. */
  min: number;
  /** Value drawn at the top of the lane. Always 1 for digital channels. */
  max: number;
  /** Value at the start of the timeline. */
  initial: number;
  /** Values by point id. */
  cells: Record<string, Cell>;
}

export interface TimeAxis {
  /** Label of the axis unit, e.g. "s" or "ms". Free text; no conversion is attached to it. */
  unit: string;
  start: number;
  end: number;
  /** Grid that dragged points snap to. 0 switches snapping off. */
  snap: number;
}

export interface Doc {
  title: string;
  time: TimeAxis;
  /** Sorted by time. */
  points: Point[];
  /** Top to bottom. */
  channels: Channel[];
}

/** Marks the initial value of a channel where a point id is expected. */
export const INITIAL = '@initial';

/** Either a point id or {@link INITIAL}. */
export type Column = string;
