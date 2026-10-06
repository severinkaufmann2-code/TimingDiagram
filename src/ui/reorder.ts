/**
 * Where a channel or a group that is being dragged by its grip belongs.
 *
 * The answers are stable: once the dragged thing has moved, the same pointer
 * position asks for no further move. Without that, a lane would flicker
 * between two places while the pointer rests.
 */

import { placeChannel, placeChannelBeside } from '../model/doc';
import { moveGroup } from '../model/groups';
import type { Doc } from '../model/types';
import { GROUP_BAR, type Lanes } from '../render/layout';

type Change = (doc: Doc) => Doc;

/**
 * The move that puts a dragged channel where the pointer is, at height `y` of
 * the lanes. Null when it is already there.
 *
 * Over a lane, the channel changes places with that lane once the pointer has
 * passed its middle. Next to the edge of another group, it joins that group.
 * The bar of a group stands for the top of the group.
 */
export function channelDrop(lanes: Lanes, channelId: string, y: number): Change | null {
  const own = lanes.rows.find((row) => row.channel.id === channelId);
  if (!own || lanes.rows.length === 0) return null;

  const bar = lanes.bands.find((band) => y >= band.top && y < band.top + GROUP_BAR);
  if (bar) {
    // nothing can be dropped into a group whose lanes are not shown
    if (bar.folded || bar.rows[0] === own) return null;
    return (doc) => placeChannel(doc, channelId, bar.group.id, 0);
  }

  const first = lanes.rows[0]!;
  const last = lanes.rows[lanes.rows.length - 1]!;
  const over = lanes.rows.find((row) => y >= row.top && y < row.top + row.height) ?? (y < first.top ? first : y >= last.top + last.height ? last : undefined);
  if (!over || over === own) return null;

  const beyondMiddle = y >= over.top + over.height / 2;
  const sameGroup = over.channel.group === own.channel.group;
  if (over.index > own.index) {
    // going down: below the lane once past its middle; before that, only over into its group
    if (beyondMiddle) return (doc) => placeChannelBeside(doc, channelId, over.channel.id, true);
    return sameGroup ? null : (doc) => placeChannelBeside(doc, channelId, over.channel.id, false);
  }
  if (!beyondMiddle) return (doc) => placeChannelBeside(doc, channelId, over.channel.id, false);
  return sameGroup ? null : (doc) => placeChannelBeside(doc, channelId, over.channel.id, true);
}

/**
 * The move that puts a dragged group where the pointer is. It changes places
 * with a neighbour once the pointer has passed the middle of that neighbour.
 */
export function groupDrop(lanes: Lanes, groupId: string, y: number): Change | null {
  const own = lanes.bands.find((band) => band.group.id === groupId);
  const firstBand = lanes.bands[0];
  const lastBand = lanes.bands[lanes.bands.length - 1];
  if (!own || !firstBand || !lastBand) return null;
  const over = lanes.bands.find((band) => y >= band.top && y < band.bottom) ?? (y < firstBand.top ? firstBand : y >= lastBand.bottom ? lastBand : undefined);
  if (!over || over === own) return null;
  const middle = (over.top + over.bottom) / 2;
  if ((over.index > own.index && y > middle) || (over.index < own.index && y < middle)) {
    return (doc) => moveGroup(doc, groupId, over.index);
  }
  return null;
}
