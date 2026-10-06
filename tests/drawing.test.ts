import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderPicture } from '../src/export/picture';
import { renderValueTables } from '../src/export/tablePicture';
import { addComment } from '../src/model/comments';
import { addPoint, emptyDoc } from '../src/model/doc';
import { sampleDoc, sampleGroupsDoc } from '../src/model/sample';
import { GROUP_BAR, computeLayout, layoutRows } from '../src/render/layout';
import { fitText, textWidth, wrapText } from '../src/render/text';

const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const count = (text: string, part: string) => text.split(part).length - 1;

describe('layout with groups', () => {
  // at 100 pixels per second a time t lies at x = 50 + 100 t
  const doc = sampleGroupsDoc();
  const layout = computeLayout(doc, 100);

  it('stacks a title bar and the lanes of every group', () => {
    expect(layout.bands.map((band) => [band.group.id, band.top, band.bottom])).toEqual([
      ['g1', 0, GROUP_BAR + 380],
      ['g2', 414, 414 + GROUP_BAR + 220],
      ['g3', 668, 668 + GROUP_BAR + 280],
    ]);
    expect(layout.rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(layout.rows[0]).toMatchObject({ top: 34, height: 60, yMax: 50, yMin: 78 });
    expect(layout.rows[5]!.top).toBe(448);
    expect(layout.lanesHeight).toBe(982);
  });

  it('shows only the bar of a group that is folded away', () => {
    const folded = computeLayout(doc, 100, { folded: new Set(['g1']) });
    expect(folded.bands.map((band) => [band.top, band.bottom, band.rows.length])).toEqual([
      [0, 34, 0],
      [34, 288, 3],
      [288, 602, 4],
    ]);
    expect(folded.rows.map((row) => row.channel.id)).toEqual(['c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12']);
    expect(layoutRows(doc, new Set(['g1', 'g2', 'g3']))).toEqual([]);
    // its phases stay, the pins in its lanes go
    expect(folded.phases).toHaveLength(13);
    expect(folded.pins.map((pin) => pin.comment.id)).toEqual(['n2', 'n4', 'n8']);
  });

  it('is what it was for a diagram without groups', () => {
    const flat = computeLayout(sampleDoc(), 100);
    expect(flat.bands).toEqual([]);
    expect(flat.phases).toEqual([]);
    expect(flat.pins).toEqual([]);
    expect(flat.rows.map((row) => row.top)).toEqual([0, 60, 120, 220, 280]);
    expect(flat.lanesHeight).toBe(380);
    expect(flat.rulerHeight).toBe(56);
  });

  it('draws a phase from one of its moments to the other, inside the bar', () => {
    const extend = layout.phases.find((box) => box.phase.id === 'h2')!;
    expect(extend).toMatchObject({ groupId: 'g1', x: 151.5, width: 197, y: 7.5, height: 19, pins: 0 });
    const locked = layout.phases.find((box) => box.phase.id === 'h8')!;
    expect(locked).toMatchObject({ groupId: 'g2', x: 351.5, width: 497, y: 421.5 });
    expect(layout.phases.find((box) => box.phase.id === 'h3')!.pins).toBe(1);
  });

  it('places the pins and gives them their numbers', () => {
    const pin = (id: string) => layout.pins.find((candidate) => candidate.comment.id === id)!;
    expect(layout.pins.map((candidate) => candidate.number)).toEqual([2, 4, 5, 6, 8]);
    expect(pin('n2')).toMatchObject({ where: 'ruler', cx: 580, cy: 42, free: false });
    expect(pin('n4')).toMatchObject({ where: 'phase', cx: 537.5, cy: 17 });
    expect(pin('n5')).toMatchObject({ where: 'lane', x: 150, cx: 164, cy: 103, free: false });
    expect(pin('n6')).toMatchObject({ where: 'lane', x: 625, cy: 163, free: true });
    expect(pin('n8')).toMatchObject({ where: 'lane', x: 250, cy: 457 });
  });

  it('puts a second pin on the same spot beside the first', () => {
    const more = addComment(doc, { kind: 'channel', channel: 'c2', at: { point: 'p2' } }, 'another').doc;
    const pins = computeLayout(more, 100).pins.filter((pin) => pin.where === 'lane' && pin.x === 150);
    expect(pins.map((pin) => pin.cx)).toEqual([164, 181]);
  });

  it('makes room in the ruler for a pin next to a transition point', () => {
    let near = addPoint(emptyDoc(), 1).doc;
    near = addPoint(near, 1.5).doc;
    expect(computeLayout(near, 100).markers.map((marker) => marker.top)).toEqual([32, 32]);
    const first = near.points[0]!.id;
    const pinned = addComment(near, { kind: 'diagram', at: { point: first } }, 'here').doc;
    const crowded = computeLayout(pinned, 100);
    expect(crowded.markers.map((marker) => marker.top)).toEqual([32, 54]);
    expect(crowded.rulerHeight).toBe(78);
    // a pin at a plain time is placed like a small label of its own
    const free = addComment(near, { kind: 'diagram', at: { time: 4 } }, 'there').doc;
    expect(computeLayout(free, 100).pins[0]).toMatchObject({ where: 'ruler', x: 450, cx: 463, cy: 42, free: true });
  });
});

describe('measuring text', () => {
  it('adds up the widths of the letters', () => {
    expect(textWidth('', 'sans400', 12)).toBe(0);
    // every character of the monospaced face is 0.6 of the font size wide, plus the allowance for rounding
    expect(textWidth('000', 'mono400', 10)).toBeCloseTo(18 + 3 * 0.35);
    expect(textWidth('WWW', 'sans600', 12)).toBeGreaterThan(textWidth('iii', 'sans600', 12) * 2);
    expect(textWidth('Valve', 'sans600', 12)).toBeGreaterThan(textWidth('Valve', 'sans400', 12));
    // a character the font does not have counts as a wide one
    expect(textWidth('温', 'sans400', 10)).toBeCloseTo(10.35);
  });

  it('shortens a text that does not fit', () => {
    expect(fitText('Emergency stop', 'sans600', 12, 200)).toBe('Emergency stop');
    const short = fitText('Emergency stop', 'sans600', 12, 60);
    expect(short.endsWith('…')).toBe(true);
    expect(textWidth(short, 'sans600', 12)).toBeLessThanOrEqual(60);
    expect(fitText('Emergency stop', 'sans600', 12, 3)).toBe('');
  });

  it('breaks a text into lines', () => {
    const text = 'Retracts faster than it extends: the exhaust throttle is fully open.';
    const lines = wrapText(text, 'sans400', 11.5, 150);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) expect(textWidth(line, 'sans400', 11.5)).toBeLessThanOrEqual(150);
    expect(wrapText('one\ntwo\n\nfour', 'sans400', 11.5, 500)).toEqual(['one', 'two', '', 'four']);
    // a word longer than a line is cut
    const cut = wrapText('Donaudampfschifffahrtsgesellschaft', 'sans400', 11.5, 60);
    expect(cut.length).toBeGreaterThan(2);
    expect(cut.join('')).toBe('Donaudampfschifffahrtsgesellschaft');
  });
});

describe('picture with groups, phases and comments', () => {
  const doc = sampleGroupsDoc();

  it('draws a diagram without groups exactly as version 1.0 did', () => {
    const flat = sampleDoc();
    expect(fingerprint(renderPicture(flat).svg)).toBe('e74213314b46b302');
    expect(fingerprint(renderPicture(flat, { showTitle: false }).svg)).toBe('cc554e02590d6698');
    expect(fingerprint(renderPicture(flat, { scale: 300 }).svg)).toBe('7b1f00c40ad8d50b');
    expect(fingerprint(renderPicture(emptyDoc()).svg)).toBe('9f5957036877d148');
    const tables = renderValueTables(flat, { maxWidth: 1000, maxHeight: 600 });
    expect(fingerprint(tables.map((table) => table.svg).join('|'))).toBe('a72aa85aa9dfa1a9');
  });

  it('shows every group in full, with its title and phases', () => {
    const picture = renderPicture(doc);
    for (const title of ['Normal cycle', 'Emergency stop', 'Sensor fault']) expect(picture.svg).toContain(`>${title}<`);
    for (const phase of ['Wait', 'Extend', 'Hold', 'Retract', 'Locked', 'Timeout', 'Alarm']) expect(picture.svg).toContain(`>${phase}<`);
    expect(picture.svg).toContain('>Alarm H1<');
    // three bars and twelve lanes under the title and the ruler
    expect(picture.height).toBe(16 + 34 + 56 + 982 + 16);
    expect(picture.plot).toMatchObject({ top: 106, bottom: 1088 });
    expect(picture.svg).not.toContain('class=');
  });

  it('draws a pin for every comment, or none', () => {
    // a pin is the only thing drawn with fully rounded ends
    expect(count(renderPicture(doc).svg, 'rx="7"')).toBe(8);
    expect(count(renderPicture(doc, { comments: 'none' }).svg, 'rx="7"')).toBe(0);
    expect(renderPicture(doc, { comments: 'none' }).svg).not.toContain('Comments');
  });

  it('lists the comments under the drawing when asked', () => {
    const plain = renderPicture(doc);
    const listed = renderPicture(doc, { comments: 'list' });
    expect(count(listed.svg, 'rx="7"')).toBe(16);
    expect(listed.svg).toContain('>Comments<');
    expect(listed.svg).toContain('>Normal cycle · Valve Y1 · 1.0 s<');
    expect(listed.svg).toContain('>Y1 switches on the falling edge of the start button.<');
    expect(listed.svg).toContain('>Transition point · 5.0 s<');
    // eight comments of one line each
    expect(listed.height).toBe(plain.height + 22 + 20 + 8 * 21);
    expect(listed.width).toBe(plain.width);
    // a diagram without comments has no list
    expect(renderPicture(sampleDoc(), { comments: 'list' }).height).toBe(renderPicture(sampleDoc()).height);
  });

  it('breaks a long comment into lines that stay inside the picture', () => {
    const long = 'The cylinder must have reached the front end position before the dwell time starts. '.repeat(6).trim();
    const picture = renderPicture(addComment(doc, { kind: 'diagram' }, long).doc, { comments: 'list' });
    expect(picture.height).toBeGreaterThan(renderPicture(doc, { comments: 'list' }).height + 3 * 16);
    expect(picture.svg).not.toContain(`>${long}<`);
    expect(picture.svg).toContain('>The cylinder must have reached');
  });

  it('makes the column of names wide enough for the titles of the groups', () => {
    expect(renderPicture(doc).labelWidth).toBe(129);
    const wide = { ...doc, groups: doc.groups.map((group, index) => (index === 0 ? { ...group, title: 'Normal cycle with a long title' } : group)) };
    expect(renderPicture(wide).labelWidth).toBeGreaterThan(200);
  });
});
