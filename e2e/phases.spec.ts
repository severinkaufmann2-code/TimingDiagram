/** Phases: titled stretches of time inside a group. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { centreOf, drag, hidePanel, marker, openApp, openGroupsExample, savedProject, xOfTime } from './helpers';

test.use({ viewport: { width: 1440, height: 1500 } });

/** The example with all five channels in one group, "Group 1". */
async function openOneGroup(page: Page): Promise<void> {
  await openApp(page);
  await page.getByRole('button', { name: 'Add group' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.group')).toHaveCount(1);
}

const phase = (page: Page, title: string): Locator => page.getByRole('button', { name: new RegExp(`^Phase ${title},`) });
const phases = async (page: Page, group = 0) => (await savedProject(page)).groups[group]!.phases;

/** y of the bar of a group, where its phases are. */
async function barY(page: Page, group = 0): Promise<number> {
  const box = (await page.locator('.phase-lane').nth(group).boundingBox())!;
  return box.y + box.height / 2;
}

test('a phase is added with a click or by dragging in the bar of a group, and gets its title', async ({ page }) => {
  await openOneGroup(page);
  const y = await barY(page);
  await expect(page.locator('.lanes-svg')).toContainText('Click or drag here to add a phase');

  // under the pointer the bar shows where a click would put a phase
  await page.mouse.move(await xOfTime(page, 2), y);
  await expect(page.locator('.phase-ghost')).toHaveCount(1);

  // click: the stretch between the two transition points around it, and the title is ready to be typed
  await page.mouse.click(await xOfTime(page, 2), y);
  await expect(page.getByLabel('Title of the phase')).toBeFocused();
  await page.keyboard.type('Extend');
  await page.keyboard.press('Enter');
  await expect(phase(page, 'Extend')).toHaveAccessibleName('Phase Extend, 1.0 s to 3.0 s');
  expect(await phases(page)).toEqual([{ id: expect.any(String), title: 'Extend', from: { point: 'p2' }, to: { point: 'p3' } }]);

  // drag: from one time to another; near a transition point the ends snap to it
  await drag(page, { x: await xOfTime(page, 3.03), y }, { x: await xOfTime(page, 4.97), y });
  await page.keyboard.type('Hold');
  await page.keyboard.press('Enter');
  expect((await phases(page))[1]).toMatchObject({ title: 'Hold', from: { point: 'p3' }, to: { point: 'p5' } });

  // with Alt nothing snaps; without a point near, the end lands on the grid
  await page.keyboard.down('Alt');
  await drag(page, { x: await xOfTime(page, 5.31), y }, { x: await xOfTime(page, 5.98), y });
  await page.keyboard.up('Alt');
  await page.keyboard.press('Escape');
  const free = (await phases(page))[2]!;
  expect(free.title).toBe('Phase 3');
  expect((free.from as { time: number }).time).toBeGreaterThan(5.25);
  expect((free.from as { time: number }).time).toBeLessThan(5.37);
  await drag(page, { x: await xOfTime(page, 7.21), y }, { x: await xOfTime(page, 7.58), y });
  await page.keyboard.press('Escape');
  expect((await phases(page))[3]).toMatchObject({ from: { time: 7.2 }, to: { time: 7.6 } });

  // a drag stops where another phase begins, and a click on a phase opens it instead of adding one
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await drag(page, { x: await xOfTime(page, 0.2), y }, { x: await xOfTime(page, 2.5), y });
  await page.keyboard.type('Wait');
  await page.keyboard.press('Enter');
  expect((await phases(page))[2]).toMatchObject({ title: 'Wait', from: { time: 0.2 }, to: { point: 'p2' } });
  await page.mouse.click(await xOfTime(page, 4), y);
  await expect(page.getByLabel('Title of the phase')).toHaveValue('Hold');
  await page.keyboard.press('Escape');
  expect(await phases(page)).toHaveLength(3);

  // the menu of the group adds one where there is room, from the left
  await page.getByRole('button', { name: 'Menu of group Group 1' }).click();
  await page.getByRole('menuitem', { name: 'Add a phase' }).click();
  await expect(page.getByLabel('Title of the phase')).toBeFocused();
  await page.keyboard.press('Escape');
  expect((await phases(page))[3]).toMatchObject({ from: { time: 0 }, to: { time: 0.2 } });
});

test('the ends of a phase hold on to transition points and follow them', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);
  const hold = phase(page, 'Hold');
  await expect(hold).toHaveCount(2 - 1);
  await expect(hold).toHaveAccessibleName('Phase Hold, 3.0 s to 5.0 s');

  // move the point at 5.0 s: "Hold" ends there, "Retract" begins there, in every group that uses it
  let from = await centreOf(marker(page, '5.0'));
  await drag(page, from, { x: await xOfTime(page, 5.5), y: from.y });
  await expect(hold).toHaveAccessibleName('Phase Hold, 3.0 s to 5.5 s');
  await expect(phase(page, 'Retract').first()).toHaveAccessibleName('Phase Retract, 5.5 s to 6.5 s');
  await expect(phase(page, 'Timeout')).toHaveAccessibleName('Phase Timeout, 3.0 s to 5.5 s');
  const box = (await hold.locator('.phase-hit').boundingBox())!;
  expect(box.x + box.width).toBeCloseTo((await centreOf(marker(page, '5.5'))).x, -1);

  // type an exact time for the point: the phase follows as well
  await marker(page, '5.5').click();
  await page.getByLabel('Exact time of this transition point').fill('5.25');
  await page.keyboard.press('Enter');
  await expect(hold).toHaveAccessibleName('Phase Hold, 3.0 s to 5.25 s');

  // delete the point: the phases stay where they are
  await marker(page, '5.25').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(hold).toHaveAccessibleName('Phase Hold, 3.0 s to 5.25 s');
  const doc = await savedProject(page);
  expect(doc.points.map((point) => point.id)).not.toContain('p5');
  expect(doc.groups[0]!.phases[2]).toMatchObject({ title: 'Hold', from: { point: 'p3' }, to: { time: 5.25 } });
  expect(doc.groups[0]!.phases[3]).toMatchObject({ title: 'Retract', from: { time: 5.25 }, to: { point: 'p6' } });

  // Shift pushes the later points along, and with them the ends that hold on to no point
  from = await centreOf(marker(page, '4.0'));
  await page.keyboard.down('Shift');
  await drag(page, from, { x: await xOfTime(page, 4.5), y: from.y });
  await page.keyboard.up('Shift');
  await expect(hold).toHaveAccessibleName('Phase Hold, 3.0 s to 5.75 s');
});

test('an end of a phase is dragged, as far as the neighbouring phase allows', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);
  const y = await barY(page);
  const edge = (title: string, which: 'start' | 'end') => phase(page, title).first().locator(`.phase-edge[data-edge="${which}"]`);

  // "Retract" of the first group ends at 6.5 s; drag its end to 7.3 s
  let from = await centreOf(edge('Retract', 'end'));
  await drag(page, from, { x: await xOfTime(page, 7.3), y });
  expect((await phases(page))[3]).toMatchObject({ from: { point: 'p5' }, to: { time: 7.3 } });
  // one drag is one step back
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await phases(page))[3]).toMatchObject({ from: { point: 'p5' }, to: { point: 'p6' } });

  // the start of "Hold" cannot go into "Extend": it stays at the point they share
  from = await centreOf(edge('Hold', 'start'));
  await drag(page, from, { x: await xOfTime(page, 2), y });
  expect((await phases(page))[2]).toMatchObject({ from: { point: 'p3' }, to: { point: 'p5' } });
  // but it can let go of it: to the point at 4.0 s
  from = await centreOf(edge('Hold', 'start'));
  await drag(page, from, { x: await xOfTime(page, 4.02), y });
  expect((await phases(page))[2]).toMatchObject({ from: { point: 'p4' }, to: { point: 'p5' } });
  await expect(phase(page, 'Hold')).toHaveAccessibleName('Phase Hold, 4.0 s to 5.0 s');
});

test('a phase is renamed, set to exact times and deleted in its panel', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);

  await phase(page, 'Hold').click();
  const panel = page.getByRole('dialog');
  const title = panel.getByLabel('Title of the phase');
  await expect(title).toBeFocused();
  await title.fill('Dwell');
  await title.press('Tab');
  await expect(phase(page, 'Dwell')).toHaveAccessibleName('Phase Dwell, 3.0 s to 5.0 s');

  // an exact end that is no transition point …
  const end = panel.getByLabel('End of the phase');
  await end.fill('4,75');
  await end.press('Enter');
  expect((await phases(page))[2]).toMatchObject({ title: 'Dwell', from: { point: 'p3' }, to: { time: 4.75 } });
  // … and one that is: the end holds on to that point
  await phase(page, 'Dwell').click();
  await end.fill('4');
  await end.press('Enter');
  expect((await phases(page))[2]).toMatchObject({ from: { point: 'p3' }, to: { point: 'p4' } });

  // into the neighbour: as far as it goes, and a word about it
  await phase(page, 'Dwell').click();
  const start = panel.getByLabel('Start of the phase');
  await start.fill('2');
  await start.press('Enter');
  await expect(page.locator('.notice')).toContainText('cannot reach into another phase');
  await expect(start).toHaveValue('3.0');
  await start.fill('later');
  await start.press('Enter');
  await expect(page.locator('.notice')).toContainText('not a number');

  // delete in the panel; a phase that has the focus goes with the Delete key
  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(phase(page, 'Dwell')).toHaveCount(0);
  await phase(page, 'Locked').focus();
  await page.keyboard.press('Delete');
  await expect(phase(page, 'Locked')).toHaveCount(0);
  await phase(page, 'Timeout').focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByLabel('Title of the phase')).toHaveValue('Timeout');
  await page.keyboard.press('Escape');

  // a comment on a phase goes with the phase: number 4 of the example was on "Hold"
  const doc = await savedProject(page);
  expect(doc.groups.map((group) => group.phases.map((item) => item.title))).toEqual([
    ['Wait', 'Extend', 'Retract'],
    ['Wait', 'Extend', 'Retract'],
    ['Wait', 'Extend', 'Timeout', 'Retract', 'Alarm'],
  ]);
  expect(doc.comments.map((comment) => comment.id)).toEqual(['n1', 'n2', 'n3', 'n5', 'n6', 'n7', 'n8']);
});

test('a folded group still shows its phases', async ({ page }) => {
  await openGroupsExample(page);
  await page.locator('.stage').getByRole('button', { name: 'Fold group Sensor fault away' }).click();
  await expect(page.locator('.channel')).toHaveCount(8);
  await expect(phase(page, 'Alarm')).toBeVisible();
  await expect(phase(page, 'Timeout')).toHaveAccessibleName('Phase Timeout, 3.0 s to 5.0 s');
});
