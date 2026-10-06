/** The exports of a diagram with groups, phases and comments. */

import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { contentOf, downloadOf, openApp, openGroupsExample } from './helpers';

const exportAs = (page: Page, title: RegExp) =>
  downloadOf(page, async () => {
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: title }).click();
  });

async function sheetsOf(page: Page): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await contentOf(await exportAs(page, /^Excel workbook/))) as unknown as ArrayBuffer);
  return workbook;
}

/** Width and height of a PNG, from its header. */
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test('groups, phases and comments are in every export', async ({ page }, testInfo) => {
  await openGroupsExample(page);

  // Excel: the group above its channels, and the phases and comments on sheets of their own
  const workbook = await sheetsOf(page);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data', 'Phases', 'Comments']);
  expect(workbook.getWorksheet('Diagram')!.getImages()).toHaveLength(1);
  const values = workbook.getWorksheet('Values')!;
  expect(values.getCell('C1').value).toBe('Normal cycle');
  expect(values.getCell('M1').value).toBe('Emergency stop');
  expect(values.getCell('M2').value).toBe('E-stop');
  expect(values.getCell('M7').value).toBe(1);
  expect(workbook.getWorksheet('Plot data')!.getCell('I3').value).toBe('Emergency stop – Cylinder A [mm]');
  expect(workbook.getWorksheet('Phases')!.getRow(4).values).toEqual([undefined, 'Normal cycle', 'Hold', 3, 5, 2]);
  expect(workbook.getWorksheet('Comments')!.getCell('D6').value).toBe('Y1 switches on the falling edge of the start button.');

  // PDF: the lanes of three groups need a second page; the lists follow
  const pdf = (await contentOf(await exportAs(page, /^PDF document/))).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf.match(/\/Type\s*\/Page\b/g)!.length).toBeGreaterThanOrEqual(3);
  expect(pdf).toContain('PlexSans600');

  // pictures stand alone: they carry the list of comments under the drawing
  const png = await contentOf(await exportAs(page, /^Picture/));
  const svg = (await contentOf(await exportAs(page, /^Vector picture/))).toString('utf8');
  expect(svg).toContain('>Comments<');
  expect(svg).toContain('>Normal cycle · Valve Y1 · 1.0 s<');
  expect(svg).toContain('>Sensor fault<');
  expect(svg).toContain('>Timeout<');
  expect(svg.split('rx="7"').length - 1).toBe(16);
  // three bars and twelve lanes, also for the group that could be folded away in the editor
  const height = Number(/<svg [^>]*height="(\d+)"/.exec(svg)![1]);
  expect(height).toBeGreaterThan(1250);
  expect(pngSize(png).height).toBe(height * 2);

  // the web page shows the diagram, the values, the phases and the comments …
  const html = await exportAs(page, /^Web page/);
  const htmlPath = testInfo.outputPath('grouped.html');
  await html.saveAs(htmlPath);
  const viewer = await page.context().newPage();
  const problems: string[] = [];
  viewer.on('pageerror', (error) => problems.push(String(error)));
  await viewer.goto(pathToFileURL(htmlPath).href);
  await expect(viewer.locator('.values tr.group')).toHaveCount(3);
  await expect(viewer.locator('.phases tbody tr')).toHaveCount(13);
  await expect(viewer.locator('.comments li')).toHaveCount(8);
  await expect(viewer.locator('.comments li').nth(3)).toContainText('Normal cycle · Hold');
  // … and under the pointer the phase each group is in: at 4.0 s
  const picture = (await viewer.locator('.diagram svg').boundingBox())!;
  const geometry = JSON.parse((await viewer.locator('.diagram svg').getAttribute('data-geometry'))!);
  const zoom = picture.width / geometry.width;
  await viewer.mouse.move(picture.x + (geometry.x0 + 4 * geometry.scale) * zoom, picture.y + (geometry.top + 60) * zoom);
  await expect(viewer.locator('.readout')).toContainText('Normal cycle · Hold');
  await expect(viewer.locator('.readout')).toContainText('Emergency stop · Locked');
  await expect(viewer.locator('.readout')).toContainText('Sensor fault · Timeout');
  expect(problems).toEqual([]);
  await viewer.close();

  // … and opens in the editor again with everything in it
  await page.getByRole('button', { name: 'New diagram' }).click();
  await expect(page.locator('.group')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a project file' }).click();
  await (await chooser).setFiles(htmlPath);
  await expect(page.locator('.group')).toHaveCount(3);
  await expect(page.locator('.stage [data-pin]')).toHaveCount(8);
  await expect(page.locator('.phase')).toHaveCount(13);
});

test('exports show every group in full, also one that is folded away', async ({ page }) => {
  await openGroupsExample(page);
  await page.locator('.stage').getByRole('button', { name: 'Fold group Sensor fault away' }).click();
  await page.locator('.stage').getByRole('button', { name: 'Fold group Normal cycle away' }).click();
  await expect(page.locator('.channel')).toHaveCount(3);
  const svg = (await contentOf(await exportAs(page, /^Vector picture/))).toString('utf8');
  for (const name of ['Start button', 'Pressure', 'E-stop', 'Alarm H1']) expect(svg).toContain(`>${name}<`);
  const workbook = await sheetsOf(page);
  expect(workbook.getWorksheet('Values')!.getCell('C2').value).toBe('Start button');
});

test('comments can be left out of the exports', async ({ page }) => {
  await openGroupsExample(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const choice = page.getByRole('group', { name: 'Comments in exports' });
  await expect(choice.getByRole('button', { name: 'Show' })).toHaveAttribute('aria-pressed', 'true');
  await choice.getByRole('button', { name: 'Hide' }).click();
  await page.keyboard.press('Escape');

  const svg = (await contentOf(await exportAs(page, /^Vector picture/))).toString('utf8');
  expect(svg).not.toContain('>Comments<');
  expect(svg.split('rx="7"').length - 1).toBe(0);
  expect(svg).toContain('>Hold<');
  const workbook = await sheetsOf(page);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data', 'Phases']);
  // the diagram itself keeps them, also the one carried by an exported web page
  const html = (await contentOf(await exportAs(page, /^Web page/))).toString('utf8');
  expect(html).not.toContain('<h2>Comments</h2>');
  expect(html).toContain('Y1 switches on the falling edge of the start button.');
  await expect(page.locator('.stage [data-pin]')).toHaveCount(8);

  // the choice is remembered, and there is nothing to choose in a diagram without comments
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.stage').waitFor();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('group', { name: 'Comments in exports' }).getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New diagram' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('group', { name: 'PDF page' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Comments in exports' })).toHaveCount(0);
});

test('a diagram without groups exports as before: three sheets, one page', async ({ page }) => {
  await openApp(page);
  const workbook = await sheetsOf(page);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Diagram', 'Values', 'Plot data']);
  expect(workbook.getWorksheet('Values')!.getCell('A3').value).toBe('Initial');
  const pdf = (await contentOf(await exportAs(page, /^PDF document/))).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  const svg = (await contentOf(await exportAs(page, /^Vector picture/))).toString('utf8');
  expect(svg).not.toContain('>Comments<');
});
