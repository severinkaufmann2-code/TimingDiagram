/** The things around drawing: undo, files, zoom, keyboard, and that nothing gets lost. */

import { expect, test } from '@playwright/test';
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

test('starts with an example and without errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await openApp(page);
  await expect(page.getByLabel('Diagram title')).toHaveValue('Cylinder A: extend and retract');
  await expect(page).toHaveTitle(/Cylinder A/);
  expect(await markerLabels(page)).toHaveLength(6);
  // the whole timeline is in view: nothing to scroll sideways
  const overflow = await page.locator('.stage').evaluate((stage) => stage.scrollWidth - stage.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});

test('every change can be undone and redone, a drag counts as one step', async ({ page }) => {
  await openApp(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();

  const from = await centreOf(marker(page, '3.0'));
  await drag(page, from, { x: await xOfTime(page, 3.6), y: from.y });
  await expect(marker(page, '3.6')).toBeVisible();

  await undo.click();
  await expect(marker(page, '3.0')).toBeVisible();
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(marker(page, '3.6')).toBeVisible();

  // with the keyboard
  await page.locator('.statusbar').click();
  await page.keyboard.press('Control+z');
  await expect(marker(page, '3.0')).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(marker(page, '3.6')).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(marker(page, '3.6')).toBeVisible();
});

test('a saved project opens again exactly as it was', async ({ page }, testInfo) => {
  await openApp(page);
  const title = page.getByLabel('Diagram title');
  await title.fill('Press cycle 7');
  await title.press('Enter');
  await page.getByLabel('Cylinder A at transition point 3').fill('87.5');
  await page.keyboard.press('Enter');

  const download = await downloadOf(page, () => page.keyboard.press('Control+s'));
  expect(download.suggestedFilename()).toBe('Press-cycle-7.timing.json');
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const saved = JSON.parse((await contentOf(download)).toString('utf8'));
  expect(saved.kind).toBe('timing-diagram');

  await page.getByRole('button', { name: 'New diagram' }).click();
  await expect(title).toHaveValue('Untitled diagram');
  await expect(page.locator('.marker')).toHaveCount(0);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a project file' }).click();
  await (await chooser).setFiles(file);
  await expect(title).toHaveValue('Press cycle 7');
  const { kind: _kind, version: _version, ...reopened } = (await savedProject(page)) as unknown as Record<string, unknown>;
  const { kind: _k, version: _v, ...original } = saved;
  expect(reopened).toEqual(original);

  // opening replaced the diagram, and that too can be undone
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(title).toHaveValue('Untitled diagram');
});

test('a file that is not a project is refused with a message', async ({ page }, testInfo) => {
  await openApp(page);
  const file = testInfo.outputPath('notes.json');
  await (await import('node:fs/promises')).writeFile(file, '{"hello": "world"}');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a project file' }).click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.notice')).toContainText('not a timing diagram project');
  await expect(page.locator('.channel')).toHaveCount(5);
});

test('a double click in a lane puts a transition right there', async ({ page }) => {
  await openApp(page);
  const box = (await lane(page, 'c4').boundingBox())!;
  const x = await xOfTime(page, 2);

  // digital lane: a new point at 2.0 s, and the signal flips there
  await page.mouse.dblclick(x, box.y + box.height / 2);
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '2.0', '3.0', '4.0', '5.0', '6.5']);
  let doc = await savedProject(page);
  const added = doc.points[2]!.id;
  expect(doc.channels[3]!.cells[added]).toEqual({ value: 1, mode: 'step' });
  await page.keyboard.press('Escape');

  // analog lane, on an existing point: the value comes from the height of the click
  const pressure = (await lane(page, 'c5').boundingBox())!;
  await page.mouse.dblclick(await xOfTime(page, 6.5), pressure.y + pressure.height / 2);
  doc = await savedProject(page);
  expect(doc.points).toHaveLength(7);
  expect(doc.channels[4]!.cells.p6).toEqual({ value: 3, mode: 'ramp' });
});

test('keyboard: arrows change the selected value, Delete removes it', async ({ page }) => {
  await openApp(page);
  await dot(page, 'c3', 'p3').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByLabel('Cylinder A at transition point 3')).toHaveValue('89');
  await page.keyboard.press('r');
  await page.keyboard.press('Delete');
  await expect(page.getByLabel('Cylinder A at transition point 3')).toHaveValue('');

  // a selected point goes with Delete as well
  await marker(page, '4.0').focus();
  await page.keyboard.press('Delete');
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.0', '5.0', '6.5']);
});

test('Shift while dragging a point pushes all later points along', async ({ page }) => {
  await openApp(page);
  const from = await centreOf(marker(page, '3.0'));
  const to = await xOfTime(page, 3.5);
  await page.keyboard.down('Shift');
  await drag(page, from, { x: to, y: from.y });
  await page.keyboard.up('Shift');
  expect(await markerLabels(page)).toEqual(['0.5', '1.0', '3.5', '4.5', '5.5', '7.0']);
});

test('zooming in makes the timeline scroll, the names stay in view, Fit brings it back', async ({ page }) => {
  await openApp(page);
  const stage = page.locator('.stage');
  const width = () => page.locator('.lanes-svg').evaluate((svg) => svg.getBoundingClientRect().width);
  const fitted = await width();

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await width()).toBeGreaterThan(fitted * 1.3);

  await stage.evaluate((element) => element.scrollTo({ left: 400 }));
  const name = (await page.locator('.channel').first().boundingBox())!;
  const frame = (await stage.boundingBox())!;
  expect(name.x).toBeCloseTo(frame.x + 1, 0);

  await page.getByRole('button', { name: 'Fit the whole timeline' }).click();
  expect(await width()).toBeCloseTo(fitted, 0);
});

test('the timeline range and snap grid can be changed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Timeline settings' }).click();
  const end = page.getByLabel('End of the timeline');
  await end.fill('20');
  await end.press('Enter');
  // a range that would hide points is widened to keep them
  const start = page.getByLabel('Start of the timeline');
  await start.fill('2');
  await start.press('Enter');
  await expect(start).toHaveValue('0.5');
  const snap = page.getByLabel('Snap grid for dragged points');
  await snap.fill('0.25');
  await snap.press('Enter');
  await page.keyboard.press('Escape');

  const doc = await savedProject(page);
  expect(doc.time).toEqual({ unit: 's', start: 0.5, end: 20, snap: 0.25 });

  // a new point lands on the new grid
  await page.mouse.click(await xOfTime(page, 10.1, ['0.50', '6.50']), await markerLaneY(page));
  await expect(marker(page, '10.00')).toBeVisible();
});

test('channel settings: type, colour, unit and range', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Digital · 0 / 1' }).first().click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: 'Analog' }).click();
  await settings.getByLabel('Unit of the values').fill('V');
  await settings.getByLabel('Unit of the values').press('Enter');
  await settings.getByLabel('Highest value shown').fill('24');
  await settings.getByLabel('Highest value shown').press('Enter');
  await settings.getByRole('button', { name: 'Violet' }).click();
  await page.keyboard.press('Escape');

  await expect(page.locator('.channel').first()).toContainText('Analog · 0 to 24 V');
  const channel = (await savedProject(page)).channels[0]!;
  expect(channel).toMatchObject({ kind: 'analog', unit: 'V', min: 0, max: 24, color: 6 });
});

test('the diagram survives closing and reopening the page', async ({ page }) => {
  await openApp(page);
  const title = page.getByLabel('Diagram title');
  await title.fill('Kept');
  await title.press('Enter');
  await page.getByRole('button', { name: 'Remove channel Pressure' }).click();
  // the browser keeps the diagram a moment after the last change
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.stage').waitFor();
  await expect(title).toHaveValue('Kept');
  expect(await channelNames(page)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1']);
});

test('dark colours can be switched on and are remembered', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Switch to dark colours' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.locator('.stage').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(22, 24, 29)');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('what was typed into a panel is applied when the panel is closed by a click elsewhere', async ({ page }) => {
  await openApp(page);
  // a value
  await dot(page, 'c5', 'p4').click();
  await page.getByLabel(/^Value of Pressure/).fill('4.5');
  await page.mouse.click(await xOfTime(page, 7.5), (await lane(page, 'c1').boundingBox())!.y + 30);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Pressure at transition point 4')).toHaveValue('4.5');
  // the exact time of a transition point
  await marker(page, '0.5').click();
  await page.getByLabel('Exact time of this transition point').fill('0.7');
  await page.mouse.click(await xOfTime(page, 7.5, ['1.0', '6.5']), (await lane(page, 'c1').boundingBox())!.y + 30);
  await expect(marker(page, '0.7')).toBeVisible();
  // each is one step back; Escape still discards what was typed
  await marker(page, '0.7').click();
  await page.getByLabel('Exact time of this transition point').fill('0.9');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(marker(page, '0.7')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(marker(page, '0.5')).toBeVisible();
  await expect(page.getByLabel('Pressure at transition point 4')).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
