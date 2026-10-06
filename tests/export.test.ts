import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { plotRows } from '../src/export/data';
import { embeddedFontCss, isCovered } from '../src/export/fonts';
import { buildHtml } from '../src/export/html';
import { paginate } from '../src/export/pdf';
import { pictureScale, renderPicture } from '../src/export/picture';
import { renderValueTables } from '../src/export/tablePicture';
import { buildWorkbook } from '../src/export/xlsx';
import { addChannel, addPoint, emptyDoc, updateChannel } from '../src/model/doc';
import { sampleDoc } from '../src/model/sample';
import { EMBED_ID, fileBaseName, parseProject, serialize } from '../src/model/serialize';
import { valueBefore } from '../src/model/waveform';

describe('project files', () => {
  it('round-trips a diagram', () => {
    const doc = sampleDoc();
    expect(parseProject(serialize(doc))).toEqual(doc);
  });

  it('rejects files that are something else', () => {
    expect(() => parseProject('not json')).toThrow(/not a timing diagram/i);
    expect(() => parseProject('{"hello":1}')).toThrow(/not a timing diagram/i);
    expect(() => parseProject('<html><body>plain page</body></html>')).toThrow(/does not contain/i);
  });

  it('repairs what it can', () => {
    const doc = parseProject(
      JSON.stringify({
        kind: 'timing-diagram',
        version: 1,
        title: 'Odd',
        time: { unit: 'ms', start: 5, end: 1, snap: -3 },
        points: [{ id: 'a', time: 9 }, { id: 'a', time: 2 }, { time: 'x' }],
        channels: [
          { id: 'c', name: 'A', kind: 'digital', initial: 7, cells: { a: { value: 3, mode: 'ramp' }, gone: { value: 1 } } },
          { name: 'B', kind: 'analog', min: 5, max: 5, cells: {} },
        ],
      }),
    );
    expect(doc.points.map((p) => p.time)).toEqual([2, 9]);
    expect(new Set(doc.points.map((p) => p.id)).size).toBe(2);
    expect(doc.time).toMatchObject({ unit: 'ms', start: 2, end: 9, snap: 0 });
    expect(doc.channels[0]).toMatchObject({ initial: 1, min: 0, max: 1 });
    expect(Object.keys(doc.channels[0]!.cells)).toEqual(['a']);
    expect(doc.channels[0]!.cells.a).toEqual({ value: 1, mode: 'ramp' });
    expect(doc.channels[1]!.max).toBeGreaterThan(doc.channels[1]!.min);
  });

  it('makes file names from titles', () => {
    expect(fileBaseName(sampleDoc())).toBe('Cylinder-A-extend-and-retract');
    expect(fileBaseName({ ...sampleDoc(), title: 'Über/Größe: 5 µs?' })).toBe('Über-Größe-5-µs');
    expect(fileBaseName({ ...sampleDoc(), title: '***' })).toBe('timing-diagram');
  });
});

describe('picture', () => {
  it('is a standalone SVG with every channel and every point', () => {
    const doc = sampleDoc();
    const picture = renderPicture(doc);
    expect(picture.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(picture.width).toBeGreaterThan(1100);
    for (const channel of doc.channels) expect(picture.svg).toContain(`>${channel.name}<`);
    for (const label of ['0.5', '1.0', '3.0', '4.0', '5.0', '6.5']) expect(picture.svg).toContain(`>${label}<`);
    expect(picture.svg).toContain('Cylinder A: extend and retract');
    expect(picture.svg).toContain('Time (s)');
    // no editing handles, no CSS classes
    expect(picture.svg).not.toContain('class=');
    expect(picture.svg).not.toContain('<circle');
  });

  it('escapes text', () => {
    const doc = updateChannel(sampleDoc(), 'c1', { name: 'A <b> & "C"' });
    const { svg } = renderPicture(doc);
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;C&quot;');
  });

  it('embeds fonts when asked', () => {
    const css = embeddedFontCss();
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).toContain('data:font/woff2;base64,');
    expect(renderPicture(sampleDoc(), { css }).svg).toContain('<style>@font-face');
  });

  it('keeps the size within sane limits', () => {
    const doc = sampleDoc();
    expect(renderPicture(doc, { scale: 1e9 }).width).toBeLessThan(16400);
    expect(renderPicture(doc, { scale: 1e-9 }).width).toBeGreaterThan(480);
    expect(pictureScale(doc)).toBeCloseTo((1100 - 90) / 8);
  });

  it('draws a diagram without channels or points', () => {
    expect(renderPicture(emptyDoc()).svg).toContain('</svg>');
  });

  it('knows which characters the bundled font can draw', () => {
    expect(isCovered('Druck Δp [µs] ≤ 5 Ω, Größe → 3')).toBe(true);
    expect(isCovered('温度')).toBe(false);
  });
});

describe('web page', () => {
  it('contains the picture, the table and the project', () => {
    const doc = sampleDoc();
    const html = buildHtml(doc, renderPicture(doc, { showTitle: false }), '', new Date(2026, 9, 6));
    expect(html).toContain('<h1>Cylinder A: extend and retract</h1>');
    expect(html).toContain('<th scope="row">Cylinder A [mm]</th>');
    expect(html).toContain('100<small>ramp</small>');
    expect(html).toContain('Exported on 2026-10-06');
    expect(html).toContain(`id="${EMBED_ID}"`);
  });

  it('can be opened again as a project', () => {
    const doc = updateChannel(sampleDoc(), 'c1', { name: 'Tricky </script><b>' });
    const html = buildHtml(doc, renderPicture(doc, { showTitle: false }), '');
    expect(html).not.toContain('Tricky </script>');
    expect(parseProject(html)).toEqual(doc);
  });
});

describe('chart-ready data', () => {
  it('doubles the rows where a channel jumps', () => {
    const doc = sampleDoc();
    const rows = plotRows(doc).map((row) => [row.time, ...row.values]);
    expect(rows).toEqual([
      [0, 0, 0, 0, 0, 0],
      [0.5, 0, 0, 0, 0, 0],
      [0.5, 1, 0, 0, 0, 0],
      [1, 1, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0],
      [3, 0, 1, 100, 0, 0],
      [3, 0, 1, 100, 1, 0],
      [4, 0, 1, 100, 1, 6],
      [5, 0, 1, 100, 1, 6],
      [5, 0, 0, 100, 0, 0],
      [6.5, 0, 0, 0, 0, 0],
      [8, 0, 0, 0, 0, 0],
    ]);
  });

  it('gives the value just before a jump', () => {
    const doc = sampleDoc();
    expect(valueBefore(doc, doc.channels[1]!, 1)).toBe(0);
    expect(valueBefore(doc, doc.channels[2]!, 3)).toBe(100);
    expect(valueBefore(doc, doc.channels[2]!, 2)).toBe(50);
  });
});

describe('Excel workbook', () => {
  it('lists values, transitions and plot data', async () => {
    const doc = sampleDoc();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildWorkbook(doc));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data']);

    const values = workbook.getWorksheet('Values')!;
    expect(values.getCell('A1').value).toBe('Point');
    expect(values.getCell('B1').value).toBe('Time [s]');
    expect(values.getCell('C1').value).toBe('Start button');
    expect(values.getCell('G1').value).toBe('Cylinder A [mm]');
    expect(values.getCell('G2').value).toBe('Value');
    expect(values.getCell('H2').value).toBe('Transition');
    // initial row, then one row per point
    expect(values.getCell('A3').value).toBe('Initial');
    expect(values.getCell('B3').value).toBe(0);
    expect(values.getCell('G3').value).toBe(0);
    expect(values.getCell('B6').value).toBe(3);
    expect(values.getCell('G6').value).toBe(100);
    expect(values.getCell('H6').value).toBe('ramp');
    expect(values.getCell('C6').value).toBeNull();
    expect(values.getCell('B9').value).toBe(6.5);
    expect(values.getCell('H9').value).toBe('ramp');

    const plot = workbook.getWorksheet('Plot data')!;
    expect(plot.getCell('A3').value).toBe('Time [s]');
    expect(plot.getCell('D3').value).toBe('Cylinder A [mm]');
    expect(plot.getCell('A4').value).toBe(0);
    expect(plot.getCell('A5').value).toBe(0.5);
    expect(plot.getCell('A6').value).toBe(0.5);
    expect(plot.getCell('B6').value).toBe(1);
    expect(plot.rowCount).toBe(15);
  });
});

describe('PDF pages', () => {
  it('fills pages lane by lane and never leaves one empty', () => {
    let doc = emptyDoc();
    for (let i = 0; i < 10; i++) doc = addChannel(doc, i % 2 ? 'analog' : 'digital').doc;
    // 5 digital lanes of 60 and 5 analog lanes of 100, 100 fixed per page
    expect(paginate(doc, 100, 2000).map((page) => page.length)).toEqual([10]);
    expect(paginate(doc, 100, 420).map((page) => page.length)).toEqual([4, 4, 2]);
    expect(paginate(doc, 100, 50).map((page) => page.length)).toEqual(Array(10).fill(1));
    expect(paginate(emptyDoc(), 100, 400)).toEqual([[]]);
  });
});

describe('values table for the PDF', () => {
  it('is one block when everything fits', () => {
    const tables = renderValueTables(sampleDoc(), { maxWidth: 1000, maxHeight: 600 });
    expect(tables).toHaveLength(1);
    expect(tables[0]!.svg).toContain('>Cylinder A [mm]<');
    expect(tables[0]!.svg).toContain('>ramp<');
    expect(tables[0]!.height).toBe(30 + 5 * 26 + 1);
  });

  it('is cut into blocks that fit the page, each within the limits', () => {
    let doc = emptyDoc();
    for (let i = 0; i < 12; i++) doc = addChannel(doc).doc;
    for (let i = 1; i <= 25; i++) doc = addPoint(doc, i * 0.25).doc;
    const tables = renderValueTables(doc, { maxWidth: 700, maxHeight: 250 });
    // 8 channels and 6 points per block
    expect(tables).toHaveLength(2 * 5);
    for (const table of tables) {
      expect(table.width).toBeLessThanOrEqual(700);
      expect(table.height).toBeLessThanOrEqual(250);
    }
  });

  it('still shows the initial values when there are no points', () => {
    const tables = renderValueTables(addChannel(emptyDoc()).doc, { maxWidth: 800, maxHeight: 400 });
    expect(tables).toHaveLength(1);
    expect(tables[0]!.svg).toContain('>Initial<');
  });
});
