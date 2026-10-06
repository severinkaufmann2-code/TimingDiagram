/**
 * One test per requirement of Ideas.txt (the number is in the test title).
 * Requirement 1, "intuitive to use", cannot be checked by a machine.
 */

import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import {
  centreOf,
  channelNames,
  contentOf,
  dot,
  downloadOf,
  drag,
  lane,
  marker,
  markerLabels,
  markerLaneY,
  openApp,
  savedProject,
  xOfTime,
} from './helpers';

test('2, 3, 4: channels are stacked, and can be added, renamed, reordered and removed', async ({ page }) => {
  await openApp(page);
  expect(await channelNames(page)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1', 'Pressure']);

  // stacked vertically: same left edge, each one below the previous
  const boxes = await page.locator('.channel').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().toJSON()));
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].left).toBe(boxes[0].left);
    expect(boxes[i].top).toBeCloseTo(boxes[i - 1].bottom, 0);
  }

  // add: the new lane appears at the bottom with the cursor already in its name
  await page.getByRole('button', { name: 'Add channel', exact: true }).click();
  await page.getByRole('menuitem', { name: /Analog channel/ }).click();
  await expect(page.locator('.channel')).toHaveCount(6);
  await expect(page.locator('.channel').last().locator('.channel-name')).toBeFocused();
  await page.keyboard.type('Flow rate');
  await page.keyboard.press('Enter');
  expect((await channelNames(page)).at(-1)).toBe('Flow rate');
  await expect(page.locator('.values-table tbody tr').last()).toContainText('Flow rate');

  // rename an existing channel
  const firstName = page.locator('.channel').first().locator('.channel-name');
  await firstName.fill('Start');
  await firstName.press('Enter');
  expect((await channelNames(page))[0]).toBe('Start');

  // an emptied name falls back to the old one
  await firstName.fill('   ');
  await firstName.press('Enter');
  expect((await channelNames(page))[0]).toBe('Start');

  // reorder with the keyboard …
  await page.getByRole('button', { name: /^Reorder Start:/ }).focus();
  await page.keyboard.press('ArrowDown');
  expect((await channelNames(page)).slice(0, 2)).toEqual(['Valve Y1', 'Start']);

  // … and by dragging the grip: "Flow rate" from the bottom to the top
  const grip = await centreOf(page.getByRole('button', { name: /^Reorder Flow rate:/ }));
  const top = (await page.locator('.channel').first().boundingBox())!;
  await drag(page, grip, { x: grip.x, y: top.y + 4 });
  expect(await channelNames(page)).toEqual(['Flow rate', 'Valve Y1', 'Start', 'Cylinder A', 'Sensor B1', 'Pressure']);

  // remove, and get it back with Undo
  await page.getByRole('button', { name: 'Remove channel Cylinder A' }).click();
  expect(await channelNames(page)).toEqual(['Flow rate', 'Valve Y1', 'Start', 'Sensor B1', 'Pressure']);
  await page.locator('.notice').getByRole('button', { name: 'Undo' }).click();
  expect(await channelNames(page)).toContain('Cylinder A');
});

test('5: there is one timeline, shared by all channels', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.ruler-svg')).toHaveCount(1);
  await expect(page.locator('.stage-corner')).toContainText('Time (s)');

  // every lane spans the same stretch of the timeline
  const lanes = await page.locator('.lane-hit').evaluateAll((rects) => rects.map((rect) => rect.getBoundingClientRect().toJSON()));
  expect(lanes).toHaveLength(5);
  for (const box of lanes) {
    expect(box.left).toBe(lanes[0].left);
    expect(box.width).toBe(lanes[0].width);
  }

  // a point belongs to the timeline: moving it moves the transitions of all channels that sit on it
  const from = await centreOf(marker(page, '5.0'));
  await drag(page, from, { x: await xOfTime(page, 5.5), y: from.y });
  const moved = await centreOf(marker(page, '5.5'));
  for (const channel of ['c2', 'c3', 'c4', 'c5']) {
    expect((await centreOf(dot(page, channel, 'p5'))).x).toBeCloseTo(moved.x, 0);
  }

  // the unit is a property of the timeline
  await page.getByRole('button', { name: 'Timeline settings' }).click();
  await page.getByRole('button', { name: 'ms', exact: true }).click();
  await expect(page.locator('.stage-corner')).toContainText('Time (ms)');
  await expect(page.locator('.values-table thead')).toContainText('ms');
});

test('6: transition points can be added, dragged, set to an exact time and deleted', async ({ page }) => {
  await openApp(page);
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.0', '4.0', '5.0', '6.5']);
  const y = await markerLaneY(page);

  // add with a click in the lane under the ruler
  await page.mouse.click(await xOfTime(page, 2), y);
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '2.0', '3.0', '4.0', '5.0', '6.5']);
  // the panel for the exact time is open at once
  await expect(page.getByLabel('Exact time of this transition point')).toBeFocused();
  await page.keyboard.press('Escape');

  // drag: lands on the snap grid of 0.1
  let from = await centreOf(marker(page, '2.0'));
  await drag(page, from, { x: await xOfTime(page, 2.52), y: from.y });
  await expect(marker(page, '2.5')).toBeVisible();

  // drag with Alt: placed freely
  from = await centreOf(marker(page, '2.5'));
  await page.keyboard.down('Alt');
  await drag(page, from, { x: await xOfTime(page, 2.26), y: from.y });
  await page.keyboard.up('Alt');
  const free = (await savedProject(page)).points[2]!.time;
  expect(free).toBeGreaterThan(2.2);
  expect(free).toBeLessThan(2.32);
  expect(Math.abs(free * 10 - Math.round(free * 10))).toBeGreaterThan(0.01);

  // exact time, typed into the panel that a click opens
  await page.locator('.marker').nth(2).click();
  await page.getByLabel('Exact time of this transition point').fill('2.375');
  await page.keyboard.press('Enter');
  await expect(marker(page, '2.375')).toBeVisible();
  expect((await savedProject(page)).points[2]!.time).toBe(2.375);

  // exact time from the table, here with a decimal comma
  const cell = page.getByLabel('Time of transition point 3 in s');
  await cell.fill('2,25');
  await cell.press('Enter');
  await expect(marker(page, '2.25')).toBeVisible();

  // nudge with the arrow keys
  await marker(page, '2.25').focus();
  await page.keyboard.press('ArrowRight');
  await expect(marker(page, '2.35')).toBeVisible();

  // typing a time beyond a neighbour re-sorts the points
  await marker(page, '2.35').click();
  await page.getByLabel('Exact time of this transition point').fill('3.5');
  await page.keyboard.press('Enter');
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.0', '3.5', '4.0', '5.0', '6.5']);

  // something that is not a number changes nothing
  await marker(page, '3.5').click();
  await page.getByLabel('Exact time of this transition point').fill('soon');
  await page.keyboard.press('Enter');
  await expect(page.locator('.notice')).toContainText('not a number');
  await expect(marker(page, '3.5')).toBeVisible();

  // delete
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.0', '4.0', '5.0', '6.5']);
});

test('7: every channel can get a value at every point', async ({ page }) => {
  await openApp(page);

  // digital: one click on a crossing without a value flips the signal there
  await lane(page, 'c1').hover({ position: { x: 700, y: 30 } });
  await expect(dot(page, 'c1', 'p4')).toHaveAttribute('data-kind', 'empty');
  await dot(page, 'c1', 'p4').click();
  await expect(dot(page, 'c1', 'p4')).toHaveAttribute('data-kind', 'value');
  await expect(page.getByRole('dialog').getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // analog: click the crossing and type the exact value
  await lane(page, 'c5').hover({ position: { x: 700, y: 50 } });
  await dot(page, 'c5', 'p6').click();
  await page.getByLabel(/^Value of Pressure/).fill('2.5');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Pressure at transition point 6')).toHaveValue('2.5');

  // drag a dot: Cylinder A at 3.0 s, from 100 mm down to the middle of its lane
  const start = await centreOf(dot(page, 'c3', 'p3'));
  await drag(page, start, { x: start.x, y: start.y + 32 });
  await expect(page.getByLabel('Cylinder A at transition point 3')).toHaveValue('50');

  // the table edits the same values, also where there was none
  const cell = page.getByLabel('Valve Y1 at transition point 4');
  await expect(cell).toHaveValue('');
  await cell.fill('0');
  await cell.press('Enter');
  await expect(dot(page, 'c2', 'p4')).toHaveAttribute('data-kind', 'value');

  // … and emptying a cell removes the value again
  const filled = page.getByLabel('Sensor B1 at transition point 5');
  await filled.fill('');
  await filled.press('Enter');
  await expect(dot(page, 'c4', 'p5')).toHaveAttribute('data-kind', 'empty');

  // the initial value is a value like the others
  const initial = page.getByLabel('Initial value of Pressure');
  await initial.fill('1');
  await initial.press('Enter');

  const doc = await savedProject(page);
  const cells = (id: string) => doc.channels.find((channel) => channel.id === id)!.cells;
  expect(cells('c1').p4).toEqual({ value: 1, mode: 'step' });
  expect(cells('c5').p6).toEqual({ value: 2.5, mode: 'ramp' });
  expect(cells('c3').p3).toEqual({ value: 50, mode: 'ramp' });
  expect(cells('c2').p4).toEqual({ value: 0, mode: 'step' });
  expect(cells('c4').p5).toBeUndefined();
  expect(doc.channels.find((channel) => channel.id === 'c5')!.initial).toBe(1);
});

test('8: a value is reached by holding the previous value, or by a gradual change', async ({ page }) => {
  await openApp(page);
  const valve = async () => (await savedProject(page)).channels.find((channel) => channel.id === 'c2')!.cells;
  const line = () => page.locator('.lanes-svg path[stroke="#eb6834"][fill="none"]').getAttribute('d');

  // Valve Y1 jumps at 1.0 s: the line has a vertical edge there
  expect((await valve()).p2).toEqual({ value: 1, mode: 'step' });
  const stepped = await line();

  // switch that value to Ramp in its panel
  await dot(page, 'c2', 'p2').click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('button', { name: 'Step' })).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('button', { name: 'Ramp' }).click();
  await expect(editor.getByRole('button', { name: 'Ramp' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  // it now rises from the previous point (0.5 s), where the old level is held, up to 1.0 s
  let cells = await valve();
  expect(cells.p2).toEqual({ value: 1, mode: 'ramp' });
  expect(cells.p1).toEqual({ value: 0, mode: 'step' });
  const ramped = await line();
  expect(ramped).not.toBe(stepped);
  // one diagonal stroke from (x of 0.5 s, low) to (x of 1.0 s, high)
  const points = [...ramped!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  const rise = points.findIndex((point, index) => index > 0 && point[1]! < points[index - 1]![1]!);
  expect(points[rise]![0]! - points[rise - 1]![0]!).toBeGreaterThan(40);

  // back to Step from the keyboard, then to Ramp again in the table
  await dot(page, 'c2', 'p2').focus();
  await page.keyboard.press('s');
  expect((await valve()).p2!.mode).toBe('step');
  expect(await line()).toBe(stepped);
  await page.locator('.values-table tbody tr').nth(1).getByRole('button', { name: 'Step. Switch to ramp' }).nth(1).click();
  expect((await valve()).p2!.mode).toBe('ramp');

  // steps and ramps mix freely inside one channel (Pressure: ramp up, then a hard drop)
  cells = (await savedProject(page)).channels.find((channel) => channel.id === 'c5')!.cells;
  expect([cells.p4!.mode, cells.p5!.mode]).toEqual(['ramp', 'step']);
});

test('9: the diagram exports to Excel, PDF and HTML', async ({ page }, testInfo) => {
  await openApp(page);
  const exportAs = (title: RegExp) =>
    downloadOf(page, async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: title }).click();
    });

  // Excel
  const xlsx = await exportAs(/^Excel workbook/);
  expect(xlsx.suggestedFilename()).toBe('Cylinder-A-extend-and-retract.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await contentOf(xlsx)) as unknown as ArrayBuffer);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data']);
  expect(workbook.getWorksheet('Diagram')!.getImages()).toHaveLength(1);
  const values = workbook.getWorksheet('Values')!;
  expect(values.getCell('G1').value).toBe('Cylinder A [mm]');
  expect(values.getCell('B6').value).toBe(3);
  expect(values.getCell('G6').value).toBe(100);
  expect(values.getCell('H6').value).toBe('ramp');

  // PDF
  const pdf = await exportAs(/^PDF document/);
  expect(pdf.suggestedFilename()).toBe('Cylinder-A-extend-and-retract.pdf');
  const pdfText = (await contentOf(pdf)).toString('latin1');
  expect(pdfText.startsWith('%PDF-')).toBe(true);
  expect(pdfText.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  expect(pdfText).toContain('PlexSans600');
  expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true);

  // HTML
  const html = await exportAs(/^Web page/);
  expect(html.suggestedFilename()).toBe('Cylinder-A-extend-and-retract.html');
  const htmlText = (await contentOf(html)).toString('utf8');
  expect(htmlText).toContain('<h1>Cylinder A: extend and retract</h1>');
  expect(htmlText).toContain('<svg ');
  expect(htmlText).toContain('100<small>ramp</small>');

  // the pictures come along
  const png = await contentOf(await exportAs(/^Picture/));
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBeGreaterThan(2000);
  const svg = (await contentOf(await exportAs(/^Vector picture/))).toString('utf8');
  expect(svg.startsWith('<?xml')).toBe(true);
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');

  // the exported page shows the diagram on its own …
  const htmlPath = testInfo.outputPath('exported.html');
  await html.saveAs(htmlPath);
  const viewer = await page.context().newPage();
  const problems: string[] = [];
  viewer.on('pageerror', (error) => problems.push(String(error)));
  await viewer.goto(pathToFileURL(htmlPath).href);
  await expect(viewer.locator('h1')).toHaveText('Cylinder A: extend and retract');
  await expect(viewer.locator('.values tbody tr')).toHaveCount(5);
  const picture = (await viewer.locator('.diagram svg').boundingBox())!;
  await viewer.mouse.move(picture.x + picture.width / 2, picture.y + picture.height / 2);
  await expect(viewer.locator('.readout')).toContainText('Cylinder A');
  expect(problems).toEqual([]);
  await viewer.close();

  // … and opens in the editor again
  await page.getByRole('button', { name: 'New diagram' }).click();
  await expect(page.locator('.channel')).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a project file' }).click();
  await (await chooser).setFiles(htmlPath);
  await expect(page.locator('.channel')).toHaveCount(5);
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.0', '4.0', '5.0', '6.5']);
});
