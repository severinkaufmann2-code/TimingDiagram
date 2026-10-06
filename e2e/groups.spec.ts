/** Groups: titled blocks of channels that share the timeline. */

import { expect, test } from '@playwright/test';
import {
  centreOf,
  channelNames,
  channelsByGroup,
  dot,
  drag,
  grip,
  groupTitles,
  hidePanel,
  marker,
  openApp,
  openGroupsExample,
  savedProject,
  xOfTime,
} from './helpers';

// tall enough to show three groups without scrolling
test.use({ viewport: { width: 1440, height: 1500 } });

test('a group is added, named and filled; the first one takes the channels that are there', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.group')).toHaveCount(0);

  // from the toolbar: the cursor is in the title at once
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Group/ }).click();
  await expect(page.locator('.group')).toHaveCount(1);
  await expect(page.locator('.group .group-title')).toBeFocused();
  await page.keyboard.type('Normal cycle');
  await page.keyboard.press('Enter');
  expect(await channelsByGroup(page)).toEqual({ 'Normal cycle': ['c1', 'c2', 'c3', 'c4', 'c5'] });

  // the bar sits above the lanes, which keep their order
  const bar = (await page.locator('.group').boundingBox())!;
  const firstLane = (await page.locator('.channel').first().boundingBox())!;
  expect(firstLane.y).toBeCloseTo(bar.y + bar.height, 0);
  expect(await channelNames(page)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1', 'Pressure']);

  // a second group, from under the lanes: it starts empty
  await page.getByRole('button', { name: 'Add group' }).click();
  await expect(page.locator('.group .group-title').nth(1)).toBeFocused();
  await page.keyboard.type('Emergency stop');
  await page.keyboard.press('Enter');
  expect(await groupTitles(page)).toEqual(['Normal cycle', 'Emergency stop']);

  // "+ Channel" under the lanes fills the last group …
  await page.getByRole('button', { name: 'Add channel', exact: true }).click();
  await page.getByRole('menuitem', { name: /Digital channel/ }).click();
  await page.keyboard.type('E-stop');
  await page.keyboard.press('Enter');
  // … and the menu of a group adds to that group
  await page.getByRole('button', { name: 'Menu of group Normal cycle' }).click();
  await page.getByRole('menuitem', { name: 'Add an analog channel' }).click();
  await page.keyboard.type('Flow');
  await page.keyboard.press('Enter');
  expect(await channelNames(page)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1', 'Pressure', 'Flow', 'E-stop']);
  const groups = await channelsByGroup(page);
  expect(groups['Normal cycle']).toHaveLength(6);
  expect(groups['Emergency stop']).toHaveLength(1);

  // the values table has a heading row per group
  await expect(page.locator('.values-table tr.values-group')).toHaveCount(2);
  await expect(page.locator('.values-table tbody tr').nth(0)).toContainText('Normal cycle');
  await expect(page.locator('.values-table tbody tr').nth(7)).toContainText('Emergency stop');

  // a title cannot be emptied
  const title = page.locator('.group .group-title').first();
  await title.fill('  ');
  await title.press('Enter');
  await expect(title).toHaveValue('Normal cycle');

  // all of it can be undone, step by step, down to a diagram without groups
  const undo = page.getByRole('button', { name: 'Undo' });
  for (let i = 0; i < 8 && (await undo.isEnabled()); i++) await undo.click();
  await expect(page.locator('.group')).toHaveCount(0);
  expect(await channelNames(page)).toEqual(['Start button', 'Valve Y1', 'Cylinder A', 'Sensor B1', 'Pressure']);
});

test('groups share the timeline: one transition point moves the channels of all of them', async ({ page }) => {
  await openGroupsExample(page);
  await expect(page.locator('.ruler-svg')).toHaveCount(1);
  // the point at 2.0 s carries the E-stop of the second group
  const from = await centreOf(marker(page, '2.0'));
  await drag(page, from, { x: await xOfTime(page, 2.4), y: from.y });
  const moved = await centreOf(marker(page, '2.4'));
  for (const channel of ['c6', 'c7', 'c8']) expect((await centreOf(dot(page, channel, 'p7'))).x).toBeCloseTo(moved.x, 0);
  // every lane of every group spans the same stretch
  const lanes = await page.locator('.lane-hit').evaluateAll((rects) => rects.map((rect) => rect.getBoundingClientRect().toJSON()));
  expect(lanes).toHaveLength(12);
  for (const box of lanes) expect([box.left, box.width]).toEqual([lanes[0].left, lanes[0].width]);
});

test('a group folds away and comes back; the browser remembers it, the file does not', async ({ page }) => {
  await openGroupsExample(page);
  await expect(page.locator('.channel')).toHaveCount(12);

  await page.locator('.stage').getByRole('button', { name: 'Fold group Normal cycle away' }).click();
  await expect(page.locator('.channel')).toHaveCount(7);
  await expect(page.locator('.group').first().locator('.group-count')).toHaveText('5');
  // the table follows
  await expect(page.locator('.values-table tbody tr')).toHaveCount(3 + 7);
  await expect(page.getByLabel('Initial value of Start button')).toHaveCount(0);
  // the arrow keys of the table step over what is folded: from the first shown row to the next
  await page.getByLabel('Initial value of E-stop').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.values-table tbody tr').nth(3).locator('.values-initial input')).toBeFocused();

  // folding is not part of the diagram
  const saved = await savedProject(page);
  expect(saved.groups.map((group) => Object.keys(group).sort())).toEqual([
    ['id', 'phases', 'title'],
    ['id', 'phases', 'title'],
    ['id', 'phases', 'title'],
  ]);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator('.stage').waitFor();
  await expect(page.locator('.channel')).toHaveCount(7);

  // unfold, here from the table
  await page.locator('.values-table').getByRole('button', { name: 'Unfold group Normal cycle' }).click();
  await expect(page.locator('.channel')).toHaveCount(12);
});

test('groups are reordered with the grip, by keyboard and by dragging', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);
  expect(await groupTitles(page)).toEqual(['Normal cycle', 'Emergency stop', 'Sensor fault']);

  await grip(page, 'g3').focus();
  await page.keyboard.press('ArrowUp');
  expect(await groupTitles(page)).toEqual(['Normal cycle', 'Sensor fault', 'Emergency stop']);
  await expect(grip(page, 'g3')).toBeFocused();
  // the channels go with their group
  expect((await savedProject(page)).channels.map((channel) => channel.id)).toEqual([
    'c1', 'c2', 'c3', 'c4', 'c5', 'c9', 'c10', 'c11', 'c12', 'c6', 'c7', 'c8',
  ]);

  // drag the last group to the very top
  const from = await centreOf(grip(page, 'g2'));
  const top = (await page.locator('.group').first().boundingBox())!;
  await drag(page, from, { x: from.x, y: top.y + 5 });
  expect(await groupTitles(page)).toEqual(['Emergency stop', 'Normal cycle', 'Sensor fault']);
  // one drag is one step back
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await groupTitles(page)).toEqual(['Normal cycle', 'Sensor fault', 'Emergency stop']);
});

test('a channel moves into another group, by keyboard and by dragging its grip', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);

  // keyboard: over the edge of its group, and the grip keeps the focus
  await grip(page, 'c5').focus();
  await page.keyboard.press('ArrowDown');
  await expect(grip(page, 'c5')).toBeFocused();
  let groups = await channelsByGroup(page);
  expect(groups['Normal cycle']).toEqual(['c1', 'c2', 'c3', 'c4']);
  expect(groups['Emergency stop']).toEqual(['c5', 'c6', 'c7', 'c8']);
  await grip(page, 'c5').focus();
  await page.keyboard.press('ArrowUp');
  expect((await channelsByGroup(page))['Normal cycle']).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);

  // drag "Cylinder A" of the second group onto the bar of the third: first in that group
  let from = await centreOf(grip(page, 'c8'));
  const bar = (await page.locator('.group[data-group="g3"]').boundingBox())!;
  await drag(page, from, { x: from.x, y: bar.y + bar.height / 2 });
  groups = await channelsByGroup(page);
  expect(groups['Emergency stop']).toEqual(['c6', 'c7']);
  expect(groups['Sensor fault']).toEqual(['c8', 'c9', 'c10', 'c11', 'c12']);

  // and back up, into the lower half of the last lane of the second group: last there
  from = await centreOf(grip(page, 'c8'));
  const valve = (await page.locator('.channel[data-channel="c7"]').boundingBox())!;
  await drag(page, from, { x: from.x, y: valve.y + valve.height - 8 });
  groups = await channelsByGroup(page);
  expect(groups['Emergency stop']).toEqual(['c6', 'c7', 'c8']);
  expect(groups['Sensor fault']).toEqual(['c9', 'c10', 'c11', 'c12']);
});

test('a group is duplicated, removed with or without its channels, and all of it can be undone', async ({ page }) => {
  await openGroupsExample(page);
  const menu = (title: string) => page.getByRole('button', { name: `Menu of group ${title}`, exact: true });

  // duplicate: same channels and values, new title ready to be typed over
  await menu('Emergency stop').click();
  await page.getByRole('menuitem', { name: /^Duplicate group/ }).click();
  await expect(page.locator('.group .group-title').nth(2)).toBeFocused();
  await page.keyboard.type('Stop while retracting');
  await page.keyboard.press('Enter');
  expect(await groupTitles(page)).toEqual(['Normal cycle', 'Emergency stop', 'Stop while retracting', 'Sensor fault']);
  let doc = await savedProject(page);
  const copy = doc.groups[2]!;
  const copies = doc.channels.filter((channel) => channel.group === copy.id);
  expect(copies.map((channel) => channel.name)).toEqual(['E-stop', 'Valve Y1', 'Cylinder A']);
  expect(copies[2]!.cells).toEqual(doc.channels.find((channel) => channel.id === 'c8')!.cells);
  expect(copy.phases.map((phase) => phase.title)).toEqual(['Wait', 'Extend', 'Retract', 'Locked']);

  // remove the bar only: the channels join the group above
  await menu('Stop while retracting').click();
  await page.getByRole('menuitem', { name: /^Remove group, keep channels/ }).click();
  await expect(page.locator('.notice')).toContainText('its channels kept');
  doc = await savedProject(page);
  expect(doc.groups.map((group) => group.title)).toEqual(['Normal cycle', 'Emergency stop', 'Sensor fault']);
  expect(doc.channels.filter((channel) => channel.group === 'g2')).toHaveLength(6);

  // delete a group with everything in it
  await menu('Sensor fault').click();
  await page.getByRole('menuitem', { name: /^Delete group/ }).click();
  await expect(page.locator('.group')).toHaveCount(2);
  await expect(page.locator('.channel')).toHaveCount(11);
  await page.locator('.notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.group')).toHaveCount(3);
  await expect(page.locator('.channel')).toHaveCount(15);
});

test('removing the only group gives a diagram without groups again', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Add group' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.group')).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu of group Group 1' }).click();
  await expect(page.getByRole('menuitem', { name: /^Remove group, keep channels/ })).toContainText('without groups again');
  await page.getByRole('menuitem', { name: /^Remove group, keep channels/ }).click();
  await expect(page.locator('.group')).toHaveCount(0);
  await expect(page.locator('.channel')).toHaveCount(5);
  const doc = await savedProject(page);
  expect(doc.groups).toEqual([]);
  expect(doc.channels.every((channel) => channel.group === null)).toBe(true);
});
