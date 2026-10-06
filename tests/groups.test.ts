import { describe, expect, it } from 'vitest';
import { addComment, commentTime, moveComment, numberedComments, removeComment, setCommentText } from '../src/model/comments';
import {
  addChannel,
  moveChannelBy,
  placeChannel,
  placeChannelBeside,
  removeChannel,
  removePoint,
  setPointTime,
  setTimeAxis,
  shiftPointsFrom,
} from '../src/model/doc';
import { addGroup, channelsOf, duplicateGroup, moveGroup, removeGroup, renameGroup } from '../src/model/groups';
import { anchorAt, anchorTime } from '../src/model/moments';
import { addPhase, firstGap, gapAround, phaseSpan, removePhase, renamePhase, setPhaseEdge, sortedPhases } from '../src/model/phases';
import { sampleDoc, sampleGroupsDoc } from '../src/model/sample';
import { parseProject, serialize } from '../src/model/serialize';
import type { Doc } from '../src/model/types';

const ids = (doc: Doc) => doc.channels.map((channel) => channel.id);
const inGroup = (doc: Doc, groupId: string) => channelsOf(doc, groupId).map((channel) => channel.id);

/** The example with one group "g" that holds all five channels. */
function oneGroup(): { doc: Doc; g: string } {
  const added = addGroup(sampleDoc(), 'Normal');
  return { doc: added.doc, g: added.id };
}

describe('groups', () => {
  it('gives the first group all channels and starts further groups empty', () => {
    const { doc, g } = oneGroup();
    expect(doc.channels.every((channel) => channel.group === g)).toBe(true);
    const second = addGroup(doc);
    expect(second.doc.groups.map((group) => group.title)).toEqual(['Normal', 'Group 2']);
    expect(channelsOf(second.doc, second.id)).toEqual([]);
    expect(ids(second.doc)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('adds a channel to the last group, or to the one that is named', () => {
    const { doc, g } = oneGroup();
    const second = addGroup(doc);
    const a = addChannel(second.doc, 'digital');
    expect(a.doc.channels.at(-1)).toMatchObject({ id: a.id, group: second.id });
    const b = addChannel(a.doc, 'analog', g);
    expect(ids(b.doc)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', b.id, a.id]);
    expect(b.doc.channels[5]).toMatchObject({ group: g, kind: 'analog' });
  });

  it('keeps the channels in the order of the groups', () => {
    const doc = moveGroup(sampleGroupsDoc(), 'g3', 0);
    expect(doc.groups.map((group) => group.id)).toEqual(['g3', 'g1', 'g2']);
    expect(ids(doc)).toEqual(['c9', 'c10', 'c11', 'c12', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(moveGroup(doc, 'g3', 0)).toBe(doc);
  });

  it('moves a channel inside its group and over to the neighbouring group', () => {
    const doc = sampleGroupsDoc();
    expect(inGroup(moveChannelBy(doc, 'c2', 1), 'g1')).toEqual(['c1', 'c3', 'c2', 'c4', 'c5']);
    expect(inGroup(moveChannelBy(doc, 'c2', -1), 'g1')).toEqual(['c2', 'c1', 'c3', 'c4', 'c5']);

    // over the bar of the next group: first there
    const down = moveChannelBy(doc, 'c5', 1);
    expect(inGroup(down, 'g1')).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(inGroup(down, 'g2')).toEqual(['c5', 'c6', 'c7', 'c8']);
    // and up: last in the group above
    const up = moveChannelBy(doc, 'c6', -1);
    expect(inGroup(up, 'g1')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(inGroup(up, 'g2')).toEqual(['c7', 'c8']);

    expect(moveChannelBy(doc, 'c1', -1)).toBe(doc);
    expect(moveChannelBy(doc, 'c12', 1)).toBe(doc);
  });

  it('puts a channel at a place of any group', () => {
    const doc = sampleGroupsDoc();
    expect(inGroup(placeChannel(doc, 'c1', 'g3', 2), 'g3')).toEqual(['c9', 'c10', 'c1', 'c11', 'c12']);
    expect(inGroup(placeChannelBeside(doc, 'c8', 'c2', false), 'g1')).toEqual(['c1', 'c8', 'c2', 'c3', 'c4', 'c5']);
    expect(inGroup(placeChannelBeside(doc, 'c1', 'c7', true), 'g2')).toEqual(['c6', 'c7', 'c1', 'c8']);
    expect(placeChannel(doc, 'c1', 'g1', 0)).toBe(doc);
    expect(placeChannel(doc, 'c1', 'nope', 0)).toBe(doc);
  });

  it('duplicates a group with channels, values and phases, but without comments', () => {
    const doc = sampleGroupsDoc();
    const copy = duplicateGroup(doc, 'g1');
    expect(copy.doc.groups.map((group) => group.title)).toEqual(['Normal cycle', 'Normal cycle (copy)', 'Emergency stop', 'Sensor fault']);
    const channels = channelsOf(copy.doc, copy.id);
    expect(channels.map((channel) => channel.name)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1', 'Pressure']);
    expect(new Set([...ids(copy.doc)]).size).toBe(17);
    expect(channels[2]!.cells).toEqual(doc.channels[2]!.cells);
    expect(channels[2]!.cells).not.toBe(doc.channels[2]!.cells);
    const phases = copy.doc.groups[1]!.phases;
    expect(phases.map((phase) => phase.title)).toEqual(['Wait', 'Extend', 'Hold', 'Retract']);
    expect(phases.some((phase) => doc.groups[0]!.phases.some((original) => original.id === phase.id))).toBe(false);
    expect(copy.doc.comments).toEqual(doc.comments);
  });

  it('removes a group and keeps its channels in the neighbouring group', () => {
    const doc = sampleGroupsDoc();
    const middle = removeGroup(doc, 'g2', true);
    expect(middle.groups.map((group) => group.id)).toEqual(['g1', 'g3']);
    expect(ids(middle)).toEqual(ids(doc));
    expect(inGroup(middle, 'g1')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(middle.comments.map((comment) => comment.id)).toContain('n8');

    // the first group hands its channels down; what was said about the group and its phases goes
    const first = removeGroup(doc, 'g1', true);
    expect(inGroup(first, 'g2')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(first.comments.map((comment) => comment.id)).toEqual(['n1', 'n2', 'n5', 'n6', 'n7', 'n8']);
  });

  it('deletes a group with its channels and their comments', () => {
    const doc = removeGroup(sampleGroupsDoc(), 'g1', false);
    expect(ids(doc)).toEqual(['c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12']);
    expect(doc.comments.map((comment) => comment.id)).toEqual(['n1', 'n2', 'n8']);
  });

  it('goes back to a diagram without groups when the only group is removed', () => {
    const { doc, g } = oneGroup();
    expect(removeGroup(doc, g, true)).toEqual(sampleDoc());
    expect(removeGroup(doc, g, false).channels).toEqual([]);
    expect(removeGroup(doc, 'nope', true)).toBe(doc);
  });

  it('renames, and keeps the old title when the new one is empty', () => {
    const { doc, g } = oneGroup();
    expect(renameGroup(doc, g, '  Fault ').groups[0]!.title).toBe('Fault');
    expect(renameGroup(doc, g, '   ')).toBe(doc);
  });
});

describe('phases', () => {
  it('fills the stretch between the transition points around a time', () => {
    const { doc, g } = oneGroup();
    expect(gapAround(doc, g, 2)).toEqual({ from: { point: 'p2' }, to: { point: 'p3' } });
    expect(gapAround(doc, g, 0.2)).toEqual({ from: { time: 0 }, to: { point: 'p1' } });
    expect(gapAround(doc, g, 7)).toEqual({ from: { point: 'p6' }, to: { time: 8 } });
    expect(gapAround(doc, g, 8)).toEqual({ from: { point: 'p6' }, to: { time: 8 } });
    expect(firstGap(doc, g)).toEqual({ from: { time: 0 }, to: { point: 'p1' } });

    const gap = gapAround(doc, g, 2)!;
    const added = addPhase(doc, g, gap.from, gap.to);
    expect(added.doc.groups[0]!.phases).toEqual([{ id: added.id, title: 'Phase 1', from: { point: 'p2' }, to: { point: 'p3' } }]);
    // no second phase where one already is
    expect(gapAround(added.doc, g, 2.5)).toBeNull();
    expect(gapAround(added.doc, g, 1)).toBeNull();
    expect(gapAround(added.doc, g, 3)).toEqual({ from: { point: 'p3' }, to: { point: 'p4' } });
  });

  it('stops where another phase begins, and shares the moment with it', () => {
    const { doc, g } = oneGroup();
    const one = addPhase(doc, g, { point: 'p2' }, { point: 'p3' }, 'Extend').doc;
    const before = addPhase(one, g, { time: 0 }, { time: 8 }, 'Wait');
    expect(before.doc.groups[0]!.phases[1]).toMatchObject({ from: { time: 0 }, to: { point: 'p2' } });
    // drawn from right to left
    const after = addPhase(one, g, { time: 8 }, { time: 0 }, 'Rest');
    expect(after.doc.groups[0]!.phases[1]).toMatchObject({ from: { point: 'p3' }, to: { time: 8 } });
    // no room: inside the existing phase, or without length
    expect(addPhase(one, g, { time: 2 }, { time: 6 }).id).toBe('');
    expect(addPhase(one, g, { point: 'p2' }, { time: 4 }).id).toBe('');
    expect(addPhase(one, g, { time: 5 }, { time: 5 }).id).toBe('');
    expect(sortedPhases(before.doc, before.doc.groups[0]!).map((phase) => phase.title)).toEqual(['Wait', 'Extend']);
  });

  it('follows a transition point that is moved, and stays put when it is deleted', () => {
    const { doc, g } = oneGroup();
    const added = addPhase(doc, g, { point: 'p2' }, { point: 'p3' });
    const phase = (d: Doc) => d.groups[0]!.phases[0]!;
    const moved = setPointTime(added.doc, 'p3', 3.5);
    expect(phaseSpan(moved, phase(moved))).toEqual({ start: 1, end: 3.5 });
    const deleted = removePoint(moved, 'p3');
    expect(phase(deleted).to).toEqual({ time: 3.5 });
    expect(phaseSpan(deleted, phase(deleted))).toEqual({ start: 1, end: 3.5 });
  });

  it('moves one end, up to the neighbouring phase', () => {
    const { doc, g } = oneGroup();
    const a = addPhase(doc, g, { point: 'p2' }, { point: 'p3' });
    const b = addPhase(a.doc, g, { point: 'p3' }, { point: 'p5' });
    // into the neighbour: stays at the shared point
    expect(setPhaseEdge(b.doc, g, a.id, 'end', { point: 'p4' })).toBe(b.doc);
    const longer = setPhaseEdge(b.doc, g, b.id, 'end', { time: 7.2 });
    expect(longer.groups[0]!.phases[1]).toMatchObject({ from: { point: 'p3' }, to: { time: 7.2 } });
    const shorter = setPhaseEdge(b.doc, g, b.id, 'start', { point: 'p4' });
    expect(shorter.groups[0]!.phases[1]).toMatchObject({ from: { point: 'p4' }, to: { point: 'p5' } });
    // an end dragged through the other end: the phase lies on the other side
    const flipped = setPhaseEdge(shorter, g, b.id, 'start', { time: 7 });
    expect(flipped.groups[0]!.phases[1]).toMatchObject({ from: { point: 'p5' }, to: { time: 7 } });
    // beyond the timeline: the range grows
    expect(setPhaseEdge(b.doc, g, b.id, 'end', { time: 9 }).time.end).toBe(9);
  });

  it('is pushed along with the later points, also where it holds on to none', () => {
    const { doc, g } = oneGroup();
    let next = addPhase(doc, g, { point: 'p5' }, { time: 7 }).doc;
    next = addComment(next, { kind: 'channel', channel: 'c3', at: { time: 5.75 } }, 'fast').doc;
    next = addComment(next, { kind: 'channel', channel: 'c3', at: { time: 2 } }, 'early').doc;
    const pushed = shiftPointsFrom(next, 'p5', 1.5);
    expect(pushed.points.map((point) => point.time)).toEqual([0.5, 1, 3, 4, 6.5, 8]);
    expect(pushed.groups[0]!.phases[0]).toMatchObject({ from: { point: 'p5' }, to: { time: 8.5 } });
    expect(pushed.comments.map((comment) => commentTime(pushed, comment))).toEqual([7.25, 2]);
    expect(pushed.time.end).toBe(8.5);
  });

  it('keeps the time range wide enough to show it', () => {
    const { doc, g } = oneGroup();
    const next = addPhase(doc, g, { point: 'p6' }, { time: 8 }).doc;
    expect(setTimeAxis(next, { end: 7 }).time.end).toBe(8);
    expect(setTimeAxis(doc, { end: 7 }).time.end).toBe(7);
  });

  it('renames and removes, and takes its comments with it', () => {
    const doc = sampleGroupsDoc();
    expect(renamePhase(doc, 'g1', 'h3', 'Dwell').groups[0]!.phases[2]!.title).toBe('Dwell');
    expect(renamePhase(doc, 'g1', 'h3', ' ')).toBe(doc);
    const removed = removePhase(doc, 'g1', 'h3');
    expect(removed.groups[0]!.phases.map((phase) => phase.id)).toEqual(['h1', 'h2', 'h4']);
    expect(removed.comments.map((comment) => comment.id)).not.toContain('n4');
    expect(removePhase(doc, 'g1', 'nope')).toBe(doc);
  });

  it('knows the moment for a time', () => {
    const doc = sampleDoc();
    expect(anchorAt(doc, 3)).toEqual({ point: 'p3' });
    expect(anchorAt(doc, 3.25)).toEqual({ time: 3.25 });
    expect(anchorTime(doc, { point: 'p4' })).toBe(4);
    expect(anchorTime(doc, { time: 1.5 })).toBe(1.5);
  });
});

describe('comments', () => {
  const order = (doc: Doc) => numberedComments(doc).map((comment) => comment.id);

  it('numbers them from top to bottom and from left to right', () => {
    let doc = sampleGroupsDoc();
    expect(order(doc)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']);

    const onValve = addComment(doc, { kind: 'channel', channel: 'c2' }, 'whole channel');
    const early = addComment(onValve.doc, { kind: 'diagram', at: { time: 0.2 } }, 'early');
    const lastGroup = addComment(early.doc, { kind: 'group', group: 'g3' }, 'third');
    doc = lastGroup.doc;
    expect(order(doc)).toEqual(['n1', early.id, 'n2', 'n3', 'n4', onValve.id, 'n5', 'n6', 'n7', 'n8', lastGroup.id]);
  });

  it('numbers them channel by channel in a diagram without groups', () => {
    let doc = sampleDoc();
    doc = addComment(doc, { kind: 'channel', channel: 'c4', at: { point: 'p3' } }, 'b').doc;
    doc = addComment(doc, { kind: 'channel', channel: 'c1', at: { point: 'p2' } }, 'a2').doc;
    doc = addComment(doc, { kind: 'channel', channel: 'c1', at: { point: 'p1' } }, 'a1').doc;
    doc = addComment(doc, { kind: 'diagram' }, 'first').doc;
    expect(numberedComments(doc).map((comment) => comment.text)).toEqual(['first', 'a1', 'a2', 'b']);
  });

  it('follows the transition point it is pinned to, and stays put when the point is deleted', () => {
    const doc = sampleGroupsDoc();
    const pinned = (d: Doc) => d.comments.find((comment) => comment.id === 'n5')!;
    const moved = setPointTime(doc, 'p2', 1.5);
    expect(commentTime(moved, pinned(moved))).toBe(1.5);
    const deleted = removePoint(moved, 'p2');
    expect(pinned(deleted).on).toEqual({ kind: 'channel', channel: 'c2', at: { time: 1.5 } });
    // the phases that began and ended there stay as well
    expect(deleted.groups[0]!.phases[0]!.to).toEqual({ time: 1.5 });
    expect(deleted.groups[0]!.phases[1]!.from).toEqual({ time: 1.5 });
  });

  it('goes when its channel goes', () => {
    const doc = removeChannel(sampleGroupsDoc(), 'c2');
    expect(order(doc)).toEqual(['n1', 'n2', 'n3', 'n4', 'n6', 'n7', 'n8']);
  });

  it('can be moved, edited and removed', () => {
    const doc = sampleGroupsDoc();
    const moved = moveComment(doc, 'n7', { kind: 'channel', channel: 'c4', at: { point: 'p3' } });
    expect(commentTime(moved, moved.comments[6]!)).toBe(3);
    expect(moveComment(doc, 'n7', { kind: 'channel', channel: 'c4' })).toBe(doc);
    expect(setCommentText(doc, 'n2', 'T1 is over.').comments[1]!.text).toBe('T1 is over.');
    expect(setCommentText(doc, 'n2', 'End of the dwell time T1.')).toBe(doc);
    expect(removeComment(doc, 'n1').comments).toHaveLength(7);
    expect(removeComment(doc, 'nope')).toBe(doc);
    // pinned beyond the timeline: the range grows
    expect(moveComment(doc, 'n6', { kind: 'channel', channel: 'c3', at: { time: 9.5 } }).time.end).toBe(9.5);
  });

  it('refuses a place that does not exist', () => {
    const doc = sampleGroupsDoc();
    expect(addComment(doc, { kind: 'channel', channel: 'nope' }).id).toBe('');
    expect(addComment(doc, { kind: 'phase', phase: 'nope' }).id).toBe('');
    expect(addComment(doc, { kind: 'group', group: 'nope' }).id).toBe('');
    expect(addComment(doc, { kind: 'diagram', at: { point: 'nope' } }).doc).toBe(doc);
    expect(moveComment(doc, 'n1', { kind: 'group', group: 'nope' })).toBe(doc);
  });
});

describe('project files with groups', () => {
  it('opens a file of version 1 as a diagram without groups', () => {
    const { groups: _groups, comments: _comments, channels, ...rest } = sampleDoc();
    const old = { kind: 'timing-diagram', version: 1, ...rest, channels: channels.map(({ group: _group, ...channel }) => channel) };
    expect(parseProject(JSON.stringify(old))).toEqual(sampleDoc());
  });

  it('round-trips groups, phases and comments', () => {
    const doc = sampleGroupsDoc();
    expect(parseProject(serialize(doc))).toEqual(doc);
  });

  it('says version 1 as long as nothing new is used', () => {
    const version = (doc: Doc) => JSON.parse(serialize(doc)).version;
    expect(version(sampleDoc())).toBe(1);
    expect(version(addGroup(sampleDoc()).doc)).toBe(2);
    expect(version(addComment(sampleDoc(), { kind: 'diagram' }, 'note').doc)).toBe(2);
    expect(() => parseProject(JSON.stringify({ kind: 'timing-diagram', version: 3 }))).toThrow(/newer version/);
  });

  it('repairs what it can', () => {
    const doc = parseProject(
      JSON.stringify({
        kind: 'timing-diagram',
        version: 2,
        time: { unit: 's', start: 0, end: 10, snap: 0.1 },
        points: [{ id: 'p1', time: 1 }, { id: 'p2', time: 2 }],
        groups: [
          {
            id: 'g',
            title: 'A',
            phases: [
              { id: 'h', title: 'lost', from: { point: 'p1' }, to: { point: 'gone' } },
              { id: 'h', title: 'kept', from: { point: 'p1' }, to: { time: 4 } },
              { id: 'h', from: { time: 5 }, to: { time: 20 } },
            ],
          },
          { id: 'g', title: 'B', phases: 'none' },
          'not a group',
        ],
        channels: [
          { id: 'c1', name: 'one', group: 'nowhere' },
          { id: 'c2', name: 'two', group: 'g' },
          { id: 'c3', name: 'three' },
        ],
        comments: [
          { id: 'n', text: 'lost', on: { kind: 'channel', channel: 'gone' } },
          { id: 'n', text: '   ', on: { kind: 'diagram' } },
          { id: 'n', text: 'whole diagram', on: { kind: 'diagram', at: { point: 'gone' } } },
          { id: 'n', text: 'phase', on: { kind: 'phase', phase: 'h' } },
          { id: 'm', text: 'late', on: { kind: 'channel', channel: 'c2', at: { time: 25 } } },
          { text: 'nothing to hold on to', on: { kind: 'elsewhere' } },
        ],
      }),
    );
    expect(doc.groups.map((group) => group.title)).toEqual(['A', 'B']);
    expect(new Set(doc.groups.map((group) => group.id)).size).toBe(2);
    expect(doc.groups[0]!.phases.map((phase) => phase.title)).toEqual(['kept', 'Phase 2']);
    expect(new Set(doc.groups[0]!.phases.map((phase) => phase.id)).size).toBe(2);
    // every channel is in a group that exists
    expect(doc.channels.map((channel) => channel.group)).toEqual(['g', 'g', 'g']);
    expect(doc.comments.map((comment) => comment.text)).toEqual(['whole diagram', 'phase', 'late']);
    expect(doc.comments[0]!.on).toEqual({ kind: 'diagram' });
    expect(new Set(doc.comments.map((comment) => comment.id)).size).toBe(3);
    // the range shows every moment
    expect(doc.time.end).toBe(25);
  });
});
