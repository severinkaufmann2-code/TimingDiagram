import { describe, expect, it } from 'vitest';
import { sampleDoc, sampleGroupsDoc } from '../src/model/sample';
import { computeLayout } from '../src/render/layout';
import { laneTarget, previewPin, rulerTarget } from '../src/ui/commentTargets';
import { momentAtPixel } from '../src/ui/snap';

// at 100 pixels per second a time t lies at x = 50 + 100 t; see drawing.test.ts for the rows
describe('where a comment lands', () => {
  const doc = sampleGroupsDoc();
  const layout = computeLayout(doc, 100);

  it('turns a position on the timeline into a moment, on a transition point when one is near', () => {
    expect(momentAtPixel(doc, layout, 352, false)).toEqual({ point: 'p3' });
    expect(momentAtPixel(doc, layout, 343, false)).toEqual({ point: 'p3' });
    // further away: the time on the snap grid
    expect(momentAtPixel(doc, layout, 338, false)).toEqual({ time: 2.9 });
    // with Alt nothing snaps
    expect(momentAtPixel(doc, layout, 352, true)).toEqual({ time: 3.02 });
    // a time on the grid that has a point is that point
    expect(momentAtPixel(sampleDoc(), computeLayout(sampleDoc(), 10), 60, false)).toEqual({ point: 'p2' });
  });

  it('means a spot of the channel in whose lane the pointer is', () => {
    // the lane of Valve Y1 (c2) reaches from 94 to 154
    expect(laneTarget(doc, layout, 152, 120, false)).toEqual({ kind: 'channel', channel: 'c2', at: { point: 'p2' } });
    expect(laneTarget(doc, layout, 300, 120, false)).toEqual({ kind: 'channel', channel: 'c2', at: { time: 2.5 } });
    // the lanes of the second group begin at 448
    expect(laneTarget(doc, layout, 300, 460, false)).toMatchObject({ channel: 'c6' });
    expect(laneTarget(doc, layout, 300, 5000, false)).toBeNull();
  });

  it('means a phase in the bar of a group, and nothing in the free part of the bar', () => {
    // "Hold" of the first group reaches from 3.0 to 5.0 s
    expect(laneTarget(doc, layout, 450, 17, false)).toEqual({ kind: 'phase', phase: 'h3' });
    expect(laneTarget(doc, layout, 450, 430, false)).toEqual({ kind: 'phase', phase: 'h8' });
    // after "Retract", which ends at 6.5 s
    expect(laneTarget(doc, layout, 780, 17, false)).toBeNull();
  });

  it('means a transition point in the ruler when the pointer is on its label, otherwise the time', () => {
    // the label of the point at 5.0 s is 40 wide
    expect(rulerTarget(doc, layout, 565, false)).toEqual({ kind: 'diagram', at: { point: 'p5' } });
    expect(rulerTarget(doc, layout, 580, false)).toEqual({ kind: 'diagram', at: { time: 5.3 } });
    // the labels of the points at 0.5 s and 1.0 s reach from 80 to 120 and from 130 to 170
    expect(rulerTarget(doc, layout, 118, false)).toEqual({ kind: 'diagram', at: { point: 'p1' } });
    expect(rulerTarget(doc, layout, 133, false)).toEqual({ kind: 'diagram', at: { point: 'p2' } });
    expect(rulerTarget(doc, layout, 124, false)).toEqual({ kind: 'diagram', at: { time: 0.7 } });
  });

  it('shows where the pin would be, with the number it would get', () => {
    // a new comment on Start button at 0.5 s comes before all others of the first group's lanes
    const fresh = previewPin(doc, 100, {}, { kind: 'channel', channel: 'c1', at: { point: 'p1' } })!;
    expect(fresh.pin).toMatchObject({ where: 'lane', number: 5, x: 100, cy: 43 });
    // number 5 of the example, moved from Valve Y1 to the last group
    const moved = previewPin(doc, 100, {}, { kind: 'channel', channel: 'c12', at: { point: 'p5' } }, 'n5')!;
    expect(moved.pin).toMatchObject({ where: 'lane', number: 8, x: 550 });
    expect(previewPin(doc, 100, {}, { kind: 'phase', phase: 'h1' })!.pin).toMatchObject({ where: 'phase', number: 4 });
    expect(previewPin(doc, 100, {}, { kind: 'diagram', at: { point: 'p1' } })!.pin).toMatchObject({ where: 'ruler', number: 2 });
  });

  it('names the channel, group or diagram for a comment that sits next to a name', () => {
    expect(previewPin(doc, 100, {}, { kind: 'channel', channel: 'c4' })).toEqual({ pin: null, nameOf: 'c4' });
    expect(previewPin(doc, 100, {}, { kind: 'group', group: 'g2' })).toEqual({ pin: null, nameOf: 'g2' });
    expect(previewPin(doc, 100, {}, { kind: 'diagram' })).toEqual({ pin: null, nameOf: 'diagram' });
    expect(previewPin(doc, 100, {}, { kind: 'group', group: 'nope' })).toBeNull();
    // a spot in a lane that is folded away has no pin to show
    expect(previewPin(doc, 100, { folded: new Set(['g1']) }, { kind: 'channel', channel: 'c1', at: { point: 'p1' } })).toBeNull();
  });
});
