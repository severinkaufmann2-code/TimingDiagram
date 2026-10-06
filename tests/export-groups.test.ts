import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { channelBlocks, commentLines, phaseRows, qualifiedChannelLabel } from '../src/export/data';
import { buildHtml } from '../src/export/html';
import { pageParts, paginate } from '../src/export/pdf';
import { renderPicture } from '../src/export/picture';
import { renderCommentBlocks, renderPhaseTables, renderValueTables } from '../src/export/tablePicture';
import { buildWorkbook } from '../src/export/xlsx';
import { addComment, numberedComments } from '../src/model/comments';
import { addGroup, moveGroup } from '../src/model/groups';
import { sampleDoc, sampleGroupsDoc } from '../src/model/sample';
import { parseProject } from '../src/model/serialize';
import type { Doc } from '../src/model/types';

const count = (text: string, part: string) => text.split(part).length - 1;
const ids = (channels: { id: string }[]) => channels.map((channel) => channel.id);

describe('lists for the exports', () => {
  const doc = sampleGroupsDoc();

  it('arranges the channels by group', () => {
    expect(channelBlocks(doc).map((block) => [block.group?.title, ids(block.channels)])).toEqual([
      ['Normal cycle', ['c1', 'c2', 'c3', 'c4', 'c5']],
      ['Emergency stop', ['c6', 'c7', 'c8']],
      ['Sensor fault', ['c9', 'c10', 'c11', 'c12']],
    ]);
    expect(channelBlocks(sampleDoc())).toEqual([{ group: null, channels: sampleDoc().channels }]);
  });

  it('names a channel with its group, where there are groups', () => {
    expect(qualifiedChannelLabel(doc, doc.channels[7]!)).toBe('Emergency stop – Cylinder A [mm]');
    expect(qualifiedChannelLabel(sampleDoc(), sampleDoc().channels[2]!)).toBe('Cylinder A [mm]');
  });

  it('lists the phases with their times', () => {
    const rows = phaseRows(doc);
    expect(rows).toHaveLength(13);
    expect(rows[2]).toEqual({ group: 'Normal cycle', phase: 'Hold', from: 3, to: 5, duration: 2 });
    expect(rows[7]).toEqual({ group: 'Emergency stop', phase: 'Locked', from: 3, to: 8, duration: 5 });
    expect(phaseRows(sampleDoc())).toEqual([]);
  });

  it('lists the comments with number, place and time', () => {
    const lines = commentLines(doc);
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lines[0]).toMatchObject({ place: 'Whole diagram', time: null });
    expect(lines[1]).toMatchObject({ place: 'Transition point · 5.0 s', time: 5 });
    expect(lines[3]).toMatchObject({ place: 'Normal cycle · Hold', time: null });
    expect(lines[5]).toMatchObject({ place: 'Normal cycle · Cylinder A · 5.75 s', time: 5.75 });
    expect(lines[6]).toMatchObject({ place: 'Normal cycle · Sensor B1', time: null });
    const free = addComment(doc, { kind: 'diagram', at: { time: 7 } }, 'x').doc;
    expect(commentLines(free)[2]!.place).toBe('Timeline · 7.0 s');
  });
});

describe('web page with groups, phases and comments', () => {
  const doc = sampleGroupsDoc();
  const date = new Date(2026, 9, 6);
  const html = buildHtml(doc, renderPicture(doc, { showTitle: false }), '', date);

  it('has a heading row per group, the phases as a table and the comments as a list', () => {
    expect(html).toContain('<tr class="group"><th scope="rowgroup" colspan="9">Emergency stop</th></tr>');
    expect(count(html, '<tr class="group">')).toBe(3);
    expect(html).toContain('<h2>Phases</h2>');
    expect(html).toContain('<tr><th scope="row">Normal cycle</th><td class="text">Hold</td><td>3.0 s</td><td>5.0 s</td><td>2.0 s</td></tr>');
    expect(html).toContain('<h2>Comments</h2>');
    expect(html).toContain(
      '<li><span class="pin">5</span><b>Normal cycle · Valve Y1 · 1.0 s</b><span>Y1 switches on the falling edge of the start button.</span></li>',
    );
    expect(count(html, '<li>')).toBe(8);
  });

  it('tells the readout the channels and the phases of every group', () => {
    const geometry = JSON.parse(/data-geometry="([^"]*)"/.exec(html)![1]!.replace(/&quot;/g, '"'));
    expect(geometry.groups.map((group: { title: string }) => group.title)).toEqual(['Normal cycle', 'Emergency stop', 'Sensor fault']);
    expect(geometry.groups[1].channels).toEqual([5, 6, 7]);
    expect(geometry.groups[1].phases).toEqual([
      { title: 'Wait', from: 0, to: 1 },
      { title: 'Extend', from: 1, to: 2 },
      { title: 'Retract', from: 2, to: 3 },
      { title: 'Locked', from: 3, to: 8 },
    ]);
    expect(geometry.colors).toHaveLength(12);
  });

  it('opens again as the same diagram', () => {
    expect(parseProject(html)).toEqual(doc);
  });

  it('leaves the comments out when asked, but keeps them in the diagram it carries', () => {
    const bare = buildHtml(doc, renderPicture(doc, { showTitle: false, comments: 'none' }), '', date, false);
    expect(bare).not.toContain('<h2>Comments</h2>');
    expect(count(bare, 'rx="7"')).toBe(0);
    expect(bare).toContain('<h2>Phases</h2>');
    expect(parseProject(bare).comments).toHaveLength(8);
  });

  it('escapes the text of a comment and keeps its lines', () => {
    const tricky = addComment(doc, { kind: 'diagram' }, 'Use <b>care</b> & wait\nfor "ready"').doc;
    const page = buildHtml(tricky, renderPicture(tricky, { showTitle: false }), '', date);
    expect(page).toContain('<span>Use &lt;b&gt;care&lt;/b&gt; &amp; wait<br>for &quot;ready&quot;</span>');
  });

  it('is as it was for a diagram without groups and comments', () => {
    const flat = sampleDoc();
    const page = buildHtml(flat, renderPicture(flat, { showTitle: false }), '', date);
    expect(page).not.toContain('<tr class="group">');
    expect(page).not.toContain('<h2>Phases</h2>');
    expect(page).not.toContain('<h2>Comments</h2>');
    expect(JSON.parse(/data-geometry="([^"]*)"/.exec(page)![1]!.replace(/&quot;/g, '"')).groups).toEqual([]);
  });
});

describe('Excel workbook with groups, phases and comments', () => {
  const open = async (doc: Doc) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorkbook(doc));
    return workbook;
  };

  it('names the group above its channels, and lists phases and comments on sheets of their own', async () => {
    const workbook = await open(sampleGroupsDoc());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data', 'Phases', 'Comments']);

    const values = workbook.getWorksheet('Values')!;
    expect(values.getCell('A1').value).toBe('Point');
    expect(values.getCell('B1').value).toBe('Time [s]');
    // five channels of two columns each, then three, then four
    expect(values.getCell('C1').value).toBe('Normal cycle');
    expect(values.getCell('L1').master.address).toBe('C1');
    expect(values.getCell('M1').value).toBe('Emergency stop');
    expect(values.getCell('S1').value).toBe('Sensor fault');
    expect(values.getCell('C2').value).toBe('Start button');
    expect(values.getCell('M2').value).toBe('E-stop');
    expect(values.getCell('C3').value).toBe('Value');
    expect(values.getCell('D3').value).toBe('Transition');
    // the initial values, then one row per point: 0.5, 1.0, 2.0 …
    expect(values.getCell('A4').value).toBe('Initial');
    expect(values.getCell('B7').value).toBe(2);
    expect(values.getCell('M7').value).toBe(1);
    expect(values.getCell('N7').value).toBe('step');

    const plot = workbook.getWorksheet('Plot data')!;
    expect(plot.getCell('B3').value).toBe('Normal cycle – Start button');
    expect(plot.getCell('I3').value).toBe('Emergency stop – Cylinder A [mm]');

    const phases = workbook.getWorksheet('Phases')!;
    expect(phases.getRow(1).values).toEqual([undefined, 'Group', 'Phase', 'From [s]', 'To [s]', 'Duration [s]']);
    expect(phases.getRow(4).values).toEqual([undefined, 'Normal cycle', 'Hold', 3, 5, 2]);
    expect(phases.rowCount).toBe(14);

    const comments = workbook.getWorksheet('Comments')!;
    expect(comments.getRow(1).values).toEqual([undefined, 'No.', 'Place', 'Time [s]', 'Comment']);
    expect(comments.getCell('A6').value).toBe(5);
    expect(comments.getCell('B6').value).toBe('Normal cycle · Valve Y1 · 1.0 s');
    expect(comments.getCell('C6').value).toBe(1);
    expect(comments.getCell('D6').value).toBe('Y1 switches on the falling edge of the start button.');
    expect(comments.getCell('C2').value).toBeNull();
    expect(comments.rowCount).toBe(9);
  });

  it('writes the two sheets only when there is something to list', async () => {
    const doc = sampleGroupsDoc();
    expect((await open({ ...doc, comments: [] })).worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data', 'Phases']);
    const plain = addGroup(sampleDoc(), 'Only').doc;
    expect((await open(plain)).worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data']);
    const flat = addComment(sampleDoc(), { kind: 'channel', channel: 'c2', at: { point: 'p2' } }, 'on').doc;
    const workbook = await open(flat);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data', 'Comments']);
    // without groups the heading of the values is two rows high, as it was
    expect(workbook.getWorksheet('Values')!.getCell('A3').value).toBe('Initial');
    expect(workbook.getWorksheet('Comments')!.getCell('B2').value).toBe('Valve Y1 · 1.0 s');
  });
});

// The example: the lanes of the first group are 60, 60, 100, 60 and 100 high, those of the
// second 60, 60, 100 and those of the third 60, 100, 60, 60. A bar is 34 high.
describe('PDF pages with groups', () => {
  const doc = sampleGroupsDoc();

  it('breaks between lanes and repeats the bar of a group that continues', () => {
    expect(paginate(doc, 100, 5000).map(ids)).toEqual([['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12']]);
    const pages = paginate(doc, 100, 600);
    // page 1: 100 + 34 + 380 = 514; the next bar with its first lane would make 608
    expect(pages.map(ids)).toEqual([
      ['c1', 'c2', 'c3', 'c4', 'c5'],
      ['c6', 'c7', 'c8', 'c9', 'c10'],
      ['c11', 'c12'],
    ]);
    const parts = pageParts(doc, pages);
    expect(parts.map((part) => part.groups.map((group) => group.id))).toEqual([['g1'], ['g2', 'g3'], ['g3']]);
    expect(parts.map((part) => ids(part.channels))).toEqual(pages.map(ids));
  });

  it('never leaves a bar alone at the bottom of a page', () => {
    // 100 + 34 + 380 = 514 fits; a page of 560 would have room for the next bar, but not for its first lane:
    // the second page begins with that group
    expect(paginate(doc, 100, 560).map((page) => page[0]!.id)).toEqual(['c1', 'c6', 'c11']);
  });

  it('shows a group without channels where its bar belongs', () => {
    const added = addGroup(doc, 'Spare');
    expect(pageParts(added.doc, paginate(added.doc, 100, 600)).map((part) => part.groups.map((group) => group.title))).toEqual([
      ['Normal cycle'],
      ['Emergency stop', 'Sensor fault'],
      ['Sensor fault', 'Spare'],
    ]);
    const between = moveGroup(added.doc, added.id, 1);
    expect(pageParts(between, paginate(between, 100, 600)).map((part) => part.groups.map((group) => group.title))).toEqual([
      ['Normal cycle'],
      ['Spare', 'Emergency stop', 'Sensor fault'],
      ['Sensor fault'],
    ]);
  });

  it('keeps the numbers of the pins on a page that shows only a part', () => {
    const [, second] = pageParts(doc, paginate(doc, 100, 600));
    const picture = renderPicture(second!, { numbered: numberedComments(doc) });
    // comment 8 is on E-stop, which is on the second page; without the numbers of the whole it would be another number
    expect(picture.svg).toContain('>8</text>');
    expect(picture.svg).toContain('>Emergency stop<');
    expect(picture.svg).not.toContain('>Normal cycle<');
  });
});

describe('tables and lists for the PDF, with groups', () => {
  const doc = sampleGroupsDoc();

  it('puts a heading row above the channels of every group', () => {
    const tables = renderValueTables(doc, { maxWidth: 2000, maxHeight: 2000 });
    expect(tables).toHaveLength(1);
    expect(tables[0]!.height).toBe(30 + (3 + 12) * 26 + 1);
    for (const title of ['Normal cycle', 'Emergency stop', 'Sensor fault']) expect(tables[0]!.svg).toContain(`>${title}<`);
  });

  it('repeats the heading where a group continues in the next block, and leaves none alone at the end of one', () => {
    // six rows per block
    const tables = renderValueTables(doc, { maxWidth: 2000, maxHeight: 190 });
    expect(tables.map((table) => (table.height - 31) / 26)).toEqual([6, 6, 4]);
    expect(tables[1]!.svg).toContain('>Emergency stop<');
    expect(tables[1]!.svg).toContain('>Sensor fault<');
    expect(tables[2]!.svg).toContain('>Sensor fault<');
    expect(tables[2]!.svg).not.toContain('>Emergency stop<');
    for (const table of tables) expect(table.height).toBeLessThanOrEqual(190);
  });

  it('draws the table of the phases', () => {
    const tables = renderPhaseTables(doc, { maxWidth: 900, maxHeight: 2000 });
    expect(tables).toHaveLength(1);
    expect(tables[0]!.height).toBe(30 + 13 * 26 + 1);
    expect(tables[0]!.svg).toContain('>From [s]<');
    expect(tables[0]!.svg).toContain('>Timeout<');
    expect(renderPhaseTables(doc, { maxWidth: 900, maxHeight: 140 })).toHaveLength(4);
    expect(renderPhaseTables(sampleDoc(), { maxWidth: 900, maxHeight: 2000 })).toEqual([]);
  });

  it('draws the list of comments, cut into blocks that fit', () => {
    const whole = renderCommentBlocks(doc, { maxWidth: 900, maxHeight: 2000 });
    expect(whole).toHaveLength(1);
    expect(count(whole[0]!.svg, 'rx="7"')).toBe(8);
    expect(whole[0]!.height).toBe(8 * 21);
    // two comments of one line fit into 60
    const blocks = renderCommentBlocks(doc, { maxWidth: 900, maxHeight: 60 });
    expect(blocks).toHaveLength(4);
    for (const block of blocks) expect(block.height).toBeLessThanOrEqual(60);
    expect(renderCommentBlocks(sampleDoc(), { maxWidth: 900, maxHeight: 2000 })).toEqual([]);
  });

  it('continues a comment that is longer than a block in the next one', () => {
    const long = 'A sentence that is repeated to fill many lines of the list of comments. '.repeat(30).trim();
    const one = { ...doc, comments: [{ id: 'x', text: long, on: { kind: 'diagram' as const } }] };
    const blocks = renderCommentBlocks(one, { maxWidth: 500, maxHeight: 100 });
    expect(blocks.length).toBeGreaterThan(2);
    // the number is drawn once, where the comment begins
    expect(blocks.map((block) => count(block.svg, 'rx="7"'))).toEqual([1, ...Array(blocks.length - 1).fill(0)]);
    for (const block of blocks) expect(block.height).toBeLessThanOrEqual(100);
  });
});
