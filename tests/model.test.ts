import { describe, expect, it } from 'vitest';
import {
  addChannel,
  addPoint,
  clearValue,
  emptyDoc,
  moveChannel,
  newDoc,
  putValue,
  removeChannel,
  removePoint,
  setAllModes,
  setChannelKind,
  setMode,
  setPointTime,
  setTimeAxis,
  setValue,
  shiftPointsFrom,
  toggleDigital,
  updateChannel,
} from '../src/model/doc';
import { clean, decimalsOf, formatNumber, niceStep, parseNumber, snapTo } from '../src/model/numbers';
import { sampleDoc } from '../src/model/sample';
import { INITIAL, type Doc } from '../src/model/types';
import { channelVertices, levelBefore, valueAt } from '../src/model/waveform';

/** A diagram with one channel of the given kind and points at the given times. */
function docWith(kind: 'digital' | 'analog', times: number[]): { doc: Doc; ch: string; p: string[] } {
  let { doc, id: ch } = addChannel(emptyDoc(), kind);
  const p: string[] = [];
  for (const time of times) {
    const added = addPoint(doc, time);
    doc = added.doc;
    p.push(added.id);
  }
  return { doc, ch, p };
}

const line = (doc: Doc, channelId: string) =>
  channelVertices(doc, doc.channels.find((c) => c.id === channelId)!).map((v) => [v.t, v.v]);

describe('numbers', () => {
  it('removes floating point noise', () => {
    expect(clean(0.1 + 0.2)).toBe(0.3);
    expect(snapTo(0.30000000000000004, 0.1)).toBe(0.3);
    expect(snapTo(2.449, 0.1)).toBe(2.4);
    expect(snapTo(7, 0)).toBe(7);
  });

  it('counts the decimals a number needs', () => {
    expect(decimalsOf(3)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(3.125)).toBe(3);
  });

  it('formats without needless digits', () => {
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(3, 1)).toBe('3.0');
    expect(formatNumber(3.125, 1)).toBe('3.125');
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });

  it('reads numbers the way people type them', () => {
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber(' 1,5 ')).toBe(1.5);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('2e-3')).toBe(0.002);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
    expect(parseNumber('12 mm')).toBeNull();
  });

  it('picks round step sizes', () => {
    expect(niceStep(0.07)).toBe(0.1);
    expect(niceStep(1.2)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(60)).toBe(100);
  });
});

describe('channels', () => {
  it('adds channels with unique names and colours', () => {
    let doc = newDoc();
    doc = addChannel(doc, 'analog').doc;
    doc = addChannel(doc).doc;
    expect(doc.channels.map((c) => c.name)).toEqual(['Channel 1', 'Channel 2', 'Channel 3']);
    expect(new Set(doc.channels.map((c) => c.color)).size).toBe(3);
    expect(doc.channels[1]).toMatchObject({ kind: 'analog', min: 0, max: 100 });
  });

  it('does not reuse the name of a remaining channel after a removal', () => {
    let doc = newDoc();
    doc = addChannel(doc).doc;
    doc = removeChannel(doc, doc.channels[0]!.id);
    doc = addChannel(doc).doc;
    expect(doc.channels.map((c) => c.name)).toEqual(['Channel 2', 'Channel 3']);
  });

  it('renames, removes and reorders', () => {
    let doc = sampleDoc();
    doc = updateChannel(doc, 'c1', { name: 'Start' });
    expect(doc.channels[0]!.name).toBe('Start');
    doc = moveChannel(doc, 'c1', 2);
    expect(doc.channels.map((c) => c.id)).toEqual(['c2', 'c3', 'c1', 'c4', 'c5']);
    doc = removeChannel(doc, 'c3');
    expect(doc.channels.map((c) => c.id)).toEqual(['c2', 'c1', 'c4', 'c5']);
  });

  it('keeps an analog range wide enough for its values', () => {
    let { doc, ch, p } = docWith('analog', [1]);
    doc = putValue(doc, ch, p[0]!, 250);
    expect(doc.channels[0]).toMatchObject({ min: 0, max: 250 });
    doc = updateChannel(doc, ch, { max: 100 });
    expect(doc.channels[0]!.max).toBe(250);
    doc = updateChannel(doc, ch, { min: -50, max: 400 });
    expect(doc.channels[0]).toMatchObject({ min: -50, max: 400 });
  });

  it('maps values to 0 and 1 when a channel becomes digital', () => {
    let { doc, ch, p } = docWith('analog', [1, 2]);
    doc = putValue(doc, ch, p[0]!, 80);
    doc = putValue(doc, ch, p[1]!, 20);
    doc = setChannelKind(doc, ch, 'digital');
    const channel = doc.channels[0]!;
    expect(channel).toMatchObject({ kind: 'digital', min: 0, max: 1 });
    expect(channel.cells[p[0]!]!.value).toBe(1);
    expect(channel.cells[p[1]!]!.value).toBe(0);
  });

  it('switches every transition of a channel at once', () => {
    let doc = sampleDoc();
    doc = setAllModes(doc, 'c2', 'ramp');
    expect(Object.values(doc.channels[1]!.cells).every((c) => c.mode === 'ramp')).toBe(true);
  });
});

describe('transition points', () => {
  it('keeps points sorted by time', () => {
    const { doc } = docWith('digital', [3, 1, 2]);
    expect(doc.points.map((p) => p.time)).toEqual([1, 2, 3]);
  });

  it('moves a point to an exact time and re-sorts', () => {
    let { doc, p } = docWith('digital', [1, 2, 3]);
    doc = setPointTime(doc, p[0]!, 2.375);
    expect(doc.points.map((point) => point.time)).toEqual([2, 2.375, 3]);
    expect(doc.points[1]!.id).toBe(p[0]);
  });

  it('extends the timeline when a point is placed outside it', () => {
    let { doc, p } = docWith('digital', [1]);
    doc = setPointTime(doc, p[0]!, 25);
    expect(doc.time.end).toBe(25);
    doc = addPoint(doc, -2).doc;
    expect(doc.time.start).toBe(-2);
  });

  it('never lets the range hide a point', () => {
    let { doc } = docWith('digital', [1, 8]);
    doc = setTimeAxis(doc, { start: 2, end: 5 });
    expect(doc.time).toMatchObject({ start: 1, end: 8 });
    doc = setTimeAxis(doc, { end: 20 });
    expect(doc.time.end).toBe(20);
  });

  it('removes a point together with its values', () => {
    let doc = sampleDoc();
    doc = removePoint(doc, 'p2');
    expect(doc.points.map((p) => p.id)).toEqual(['p1', 'p3', 'p4', 'p5', 'p6']);
    expect(doc.channels.some((c) => 'p2' in c.cells)).toBe(false);
  });

  it('shifts a point and all later ones together', () => {
    let { doc, p } = docWith('digital', [1, 2, 3]);
    doc = shiftPointsFrom(doc, p[1]!, 0.5);
    expect(doc.points.map((point) => point.time)).toEqual([1, 2.5, 3.5]);
  });
});

describe('values', () => {
  it('draws a step: hold, then jump', () => {
    let { doc, ch, p } = docWith('digital', [2, 5]);
    doc = putValue(doc, ch, p[0]!, 1);
    doc = putValue(doc, ch, p[1]!, 0);
    expect(line(doc, ch)).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [5, 1],
      [5, 0],
      [10, 0],
    ]);
  });

  it('draws a ramp from the previous point to this one', () => {
    let { doc, ch, p } = docWith('analog', [1, 3]);
    doc = putValue(doc, ch, p[1]!, 100);
    // the level is held at the point before, so the ramp covers exactly 1 → 3
    expect(doc.channels[0]!.cells[p[0]!]).toEqual({ value: 0, mode: 'step' });
    expect(line(doc, ch)).toEqual([
      [0, 0],
      [1, 0],
      [3, 100],
      [10, 100],
    ]);
  });

  it('ramps from the start of the timeline at the first point', () => {
    let { doc, ch, p } = docWith('analog', [4]);
    doc = setValue(doc, ch, INITIAL, 20);
    doc = putValue(doc, ch, p[0]!, 60);
    expect(line(doc, ch)).toEqual([
      [0, 20],
      [4, 60],
      [10, 60],
    ]);
  });

  it('lets a ramp span several points once the held value is removed', () => {
    let { doc, ch, p } = docWith('analog', [1, 2, 3]);
    doc = putValue(doc, ch, p[2]!, 90);
    doc = clearValue(doc, ch, p[1]!);
    expect(line(doc, ch)).toEqual([
      [0, 0],
      [3, 90],
      [10, 90],
    ]);
  });

  it('is not disturbed by points that other channels use', () => {
    let { doc, ch, p } = docWith('analog', [1, 3]);
    doc = putValue(doc, ch, p[1]!, 100);
    const before = line(doc, ch);
    doc = addPoint(doc, 2).doc;
    doc = addPoint(doc, 0.5).doc;
    expect(line(doc, ch)).toEqual(before);
  });

  it('mixes steps and ramps in one channel', () => {
    const doc = sampleDoc();
    expect(line(doc, 'c5')).toEqual([
      [0, 0],
      [3, 0],
      [4, 6],
      [5, 6],
      [5, 0],
      [8, 0],
    ]);
  });

  it('turns an existing step into a ramp and back', () => {
    let { doc, ch, p } = docWith('digital', [1, 2]);
    doc = putValue(doc, ch, p[1]!, 1);
    doc = setMode(doc, ch, p[1]!, 'ramp');
    expect(line(doc, ch)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [10, 1],
    ]);
    doc = setMode(doc, ch, p[1]!, 'step');
    expect(line(doc, ch)).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [10, 1],
    ]);
  });

  it('ignores a mode change where the channel has no value', () => {
    const { doc, ch, p } = docWith('digital', [1]);
    expect(setMode(doc, ch, p[0]!, 'ramp')).toBe(doc);
  });

  it('toggles a digital channel against the level before the point', () => {
    let { doc, ch, p } = docWith('digital', [1, 2, 3]);
    doc = toggleDigital(doc, ch, p[0]!);
    expect(doc.channels[0]!.cells[p[0]!]!.value).toBe(1);
    doc = toggleDigital(doc, ch, p[2]!);
    expect(doc.channels[0]!.cells[p[2]!]!.value).toBe(0);
    doc = toggleDigital(doc, ch, p[0]!);
    expect(doc.channels[0]!.cells[p[0]!]!.value).toBe(0);
    doc = toggleDigital(doc, ch, INITIAL);
    expect(doc.channels[0]!.initial).toBe(1);
  });

  it('only stores 0 or 1 in a digital channel', () => {
    let { doc, ch, p } = docWith('digital', [1]);
    doc = putValue(doc, ch, p[0]!, 7);
    expect(doc.channels[0]!.cells[p[0]!]!.value).toBe(1);
    doc = setValue(doc, ch, INITIAL, 0.2);
    expect(doc.channels[0]!.initial).toBe(0);
  });

  it('reports the level before a point and the value at any time', () => {
    const doc = sampleDoc();
    const cylinder = doc.channels[2]!;
    expect(levelBefore(doc, cylinder, 2)).toBe(0);
    expect(levelBefore(doc, cylinder, 3)).toBe(100);
    expect(valueAt(doc, cylinder, 0.2)).toBe(0);
    expect(valueAt(doc, cylinder, 2)).toBe(50);
    expect(valueAt(doc, cylinder, 4.5)).toBe(100);
    expect(valueAt(doc, cylinder, 5.75)).toBe(50);
    expect(valueAt(doc, cylinder, 7.9)).toBe(0);
    // at the instant of a step the new value counts
    expect(valueAt(doc, doc.channels[1]!, 1)).toBe(1);
  });

  it('returns the same document when nothing changes', () => {
    const doc = sampleDoc();
    expect(clearValue(doc, 'c1', 'p6')).toBe(doc);
    expect(setPointTime(doc, 'p1', 0.5)).toBe(doc);
    expect(removePoint(doc, 'nope')).toBe(doc);
    expect(removeChannel(doc, 'nope')).toBe(doc);
  });
});
