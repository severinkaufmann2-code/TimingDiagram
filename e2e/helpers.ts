import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import type { Doc } from '../src/model/types';

export const APP_URL = pathToFileURL(path.resolve('dist/index.html')).href;

/** Opens the app with the example diagram: channels c1…c5, points p1…p6 at 0.5, 1, 3, 4, 5 and 6.5 s. */
export async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.locator('.stage').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.channel')).toHaveCount(5);
}

export async function downloadOf(page: Page, trigger: () => Promise<void>): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return download;
}

export async function contentOf(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

/** The diagram as the app would save it: the surest way to see what an action really changed. */
export async function savedProject(page: Page): Promise<Doc> {
  const download = await downloadOf(page, () => page.getByRole('button', { name: 'Save as a project file' }).click());
  return JSON.parse((await contentOf(download)).toString('utf8')) as Doc;
}

export function marker(page: Page, time: string): Locator {
  return page.getByRole('button', { name: `Transition point at ${time} s`, exact: true });
}

export function dot(page: Page, channelId: string, column: string): Locator {
  return page.locator(`.dot[data-channel="${channelId}"][data-column="${column}"]`);
}

export function lane(page: Page, channelId: string): Locator {
  return page.locator(`.lane-hit[data-channel="${channelId}"]`);
}

export async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Screen x of a time on the ruler, worked out from two points of the example
 * that the test has not moved (0.5 s and 6.5 s unless told otherwise).
 */
export async function xOfTime(page: Page, time: number, known: [string, string] = ['0.5', '6.5']): Promise<number> {
  // the invisible grab area of a marker is centred exactly on its time
  const a = await centreOf(marker(page, known[0]).locator('.marker-hit'));
  const b = await centreOf(marker(page, known[1]).locator('.marker-hit'));
  const scale = (b.x - a.x) / (Number(known[1]) - Number(known[0]));
  return a.x + (time - Number(known[0])) * scale;
}

/** y of the lane under the ruler where transition points are added. */
export async function markerLaneY(page: Page): Promise<number> {
  const box = (await page.locator('.marker-lane').boundingBox())!;
  return box.y + box.height / 2;
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

export function channelNames(page: Page): Promise<string[]> {
  return page.locator('.channel .channel-name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

export function markerLabels(page: Page): Promise<string[]> {
  return page.locator('.marker text').allTextContents();
}

/**
 * Opens the app with the example that has groups, phases and comments: the
 * groups g1 "Normal cycle" (c1…c5), g2 "Emergency stop" (c6…c8) and g3
 * "Sensor fault" (c9…c12), with one more point, p7 at 2.0 s.
 */
export async function openGroupsExample(page: Page): Promise<void> {
  await openApp(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'Load the example with groups' }).click();
  await expect(page.locator('.group')).toHaveCount(3);
}

export function groupTitles(page: Page): Promise<string[]> {
  return page.locator('.group .group-title').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

/** The ids of the channels of every group, as the app would save them. */
export async function channelsByGroup(page: Page): Promise<Record<string, string[]>> {
  const doc = await savedProject(page);
  const result: Record<string, string[]> = {};
  for (const group of doc.groups) result[group.title] = doc.channels.filter((channel) => channel.group === group.id).map((channel) => channel.id);
  return result;
}

/** The grip of a channel or of a group. */
export function grip(page: Page, id: string): Locator {
  return page.locator(`[data-grip="${id}"]`);
}

/** Folds the panel under the diagram away, which leaves the whole height of the window to the diagram. */
export async function hidePanel(page: Page): Promise<void> {
  const toggle = page.locator('.values-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
}
