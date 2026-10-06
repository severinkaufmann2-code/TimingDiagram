/**
 * The document model of a timing diagram.
 *
 * Transition points belong to the timeline and are shared by all channels.
 * A channel may hold a value at a point (a "cell"); a missing cell means the
 * channel does not change there.
 *
 * Channels can be arranged in groups, titled blocks that share the timeline.
 * A group can name stretches of time, its phases. Comments are attached to a
 * place in the diagram.
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

/**
 * A moment on the timeline: a transition point, which it then follows, or a
 * fixed time. The ends of a phase and the pin of a comment are moments.
 */
export type Anchor = { point: string } | { time: number };

/** A titled stretch of time inside a group. */
export interface Phase {
  id: string;
  title: string;
  from: Anchor;
  to: Anchor;
}

/** A titled block of channels. */
export interface Group {
  id: string;
  title: string;
  /** Side by side in one row. Editing keeps them from overlapping. */
  phases: Phase[];
}

export interface Channel {
  id: string;
  /** The group the channel belongs to. Null in a diagram without groups. */
  group: string | null;
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

/** What a comment is on. Without a moment it is about the whole diagram or the whole channel. */
export type CommentTarget =
  | { kind: 'diagram'; at?: Anchor }
  | { kind: 'group'; group: string }
  | { kind: 'phase'; phase: string }
  | { kind: 'channel'; channel: string; at?: Anchor };

/** A note attached to a place in the diagram. Its number is not stored; it follows from where it sits. */
export interface Comment {
  id: string;
  text: string;
  on: CommentTarget;
}

export interface Doc {
  title: string;
  time: TimeAxis;
  /** Sorted by time. */
  points: Point[];
  /** Top to bottom. Empty in a diagram without groups; otherwise every channel is in one of them. */
  groups: Group[];
  /** Top to bottom. The channels of a group follow each other, in the order of the groups. */
  channels: Channel[];
  comments: Comment[];
}

/** Marks the initial value of a channel where a point id is expected. */
export const INITIAL = '@initial';

/** Either a point id or {@link INITIAL}. */
export type Column = string;
