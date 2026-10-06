import { describe, expect, it } from 'vitest';
import { channelsOf } from '../src/model/groups';
import { sampleDoc, sampleGroupsDoc } from '../src/model/sample';
import type { Doc } from '../src/model/types';
import { layoutLanes } from '../src/render/layout';
import { channelDrop, groupDrop } from '../src/ui/reorder';

const inGroup = (doc: Doc, groupId: string) => channelsOf(doc, groupId).map((channel) => channel.id);

/** Drops a channel at a height of the lanes and returns the diagram after it. */
function dropAt(doc: Doc, channelId: string, y: number, folded: string[] = []): Doc {
  const drop = channelDrop(layoutLanes(doc, new Set(folded)), channelId, y);
  return drop ? drop(doc) : doc;
}

// The example with groups: bar of g1 at 0, its lanes c1…c5 from 34 to 414; bar of g2 at 414,
// c6 448–508, c7 508–568, c8 568–668; bar of g3 at 668, c9…c12 from 702 to 982.
describe('dragging a channel by its grip', () => {
  const doc = sampleGroupsDoc();

  it('changes places with a lane once the pointer is past its middle', () => {
    // c2 lies from 94 to 154
    expect(dropAt(doc, 'c1', 100)).toBe(doc);
    expect(inGroup(dropAt(doc, 'c1', 130), 'g1')).toEqual(['c2', 'c1', 'c3', 'c4', 'c5']);
    expect(inGroup(dropAt(doc, 'c3', 110), 'g1')).toEqual(['c1', 'c3', 'c2', 'c4', 'c5']);
    expect(dropAt(doc, 'c3', 140)).toBe(doc);
  });

  it('goes over into the next group at the bar or at the first lane of that group', () => {
    const first = ['c5', 'c6', 'c7', 'c8'];
    expect(inGroup(dropAt(doc, 'c5', 430), 'g2')).toEqual(first);
    expect(inGroup(dropAt(doc, 'c5', 460), 'g2')).toEqual(first);
    expect(inGroup(dropAt(doc, 'c5', 490), 'g2')).toEqual(['c6', 'c5', 'c7', 'c8']);
    // from the middle of a group straight onto the bar of another
    expect(inGroup(dropAt(doc, 'c2', 680), 'g3')).toEqual(['c2', 'c9', 'c10', 'c11', 'c12']);
  });

  it('goes over into the group above at the last lane of that group', () => {
    // c5 lies from 314 to 414
    expect(inGroup(dropAt(doc, 'c6', 400), 'g1')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(inGroup(dropAt(doc, 'c6', 340), 'g1')).toEqual(['c1', 'c2', 'c3', 'c4', 'c6', 'c5']);
    // the bar of the own group stands for its top
    expect(inGroup(dropAt(doc, 'c8', 430), 'g2')).toEqual(['c8', 'c6', 'c7']);
    expect(dropAt(doc, 'c6', 430)).toBe(doc);
  });

  it('goes to the very top or bottom when the pointer leaves the lanes', () => {
    expect(inGroup(dropAt(doc, 'c7', -40), 'g1')).toEqual(['c7', 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(inGroup(dropAt(doc, 'c7', 2000), 'g3')).toEqual(['c9', 'c10', 'c11', 'c12', 'c7']);
  });

  it('drops nothing into a group that is folded away', () => {
    // with g2 folded, its bar lies from 414 to 448 and g3 follows at once
    expect(dropAt(doc, 'c5', 430, ['g2'])).toBe(doc);
    expect(inGroup(dropAt(doc, 'c5', 460, ['g2']), 'g3')).toEqual(['c5', 'c9', 'c10', 'c11', 'c12']);
  });

  it('works as before in a diagram without groups', () => {
    const flat = sampleDoc();
    // c2 lies from 60 to 120
    expect(dropAt(flat, 'c1', 80)).toBe(flat);
    expect(dropAt(flat, 'c1', 100).channels.map((channel) => channel.id)).toEqual(['c2', 'c1', 'c3', 'c4', 'c5']);
    expect(dropAt(flat, 'c5', -10).channels.map((channel) => channel.id)).toEqual(['c5', 'c1', 'c2', 'c3', 'c4']);
  });

  it('comes to rest: after a move, the same pointer position asks for no other', () => {
    for (const start of [sampleGroupsDoc(), sampleDoc()]) {
      for (const channel of start.channels) {
        for (let y = -30; y < 1040; y += 7) {
          const moved = dropAt(start, channel.id, y);
          const again = dropAt(moved, channel.id, y);
          expect(again, `${channel.id} at ${y}`).toBe(moved);
        }
      }
    }
  });
});

describe('dragging a group by its grip', () => {
  const doc = sampleGroupsDoc();
  const order = (next: Doc) => next.groups.map((group) => group.id);
  const dropAt = (current: Doc, groupId: string, y: number): Doc => {
    const drop = groupDrop(layoutLanes(current), groupId, y);
    return drop ? drop(current) : current;
  };

  it('changes places with a neighbour once the pointer is past the middle of it', () => {
    // g2 reaches from 414 to 668, its middle is at 541
    expect(dropAt(doc, 'g3', 600)).toBe(doc);
    expect(order(dropAt(doc, 'g3', 500))).toEqual(['g1', 'g3', 'g2']);
    expect(dropAt(doc, 'g1', 500)).toBe(doc);
    expect(order(dropAt(doc, 'g1', 600))).toEqual(['g2', 'g1', 'g3']);
    expect(order(dropAt(doc, 'g3', -50))).toEqual(['g3', 'g1', 'g2']);
    expect(order(dropAt(doc, 'g1', 5000))).toEqual(['g2', 'g3', 'g1']);
  });

  it('comes to rest', () => {
    for (const group of doc.groups) {
      for (let y = -30; y < 1040; y += 7) {
        const moved = dropAt(doc, group.id, y);
        expect(dropAt(moved, group.id, y), `${group.id} at ${y}`).toBe(moved);
      }
    }
  });
});
