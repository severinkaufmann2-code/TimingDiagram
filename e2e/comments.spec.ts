/** Comments: numbered pins with a text, attached to a place in the diagram. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { centreOf, dot, drag, hidePanel, lane, marker, openApp, openGroupsExample, savedProject, xOfTime } from './helpers';

test.use({ viewport: { width: 1440, height: 1500 } });

const tool = (page: Page): Locator => page.getByRole('button', { name: 'Comment', exact: true });
/** The pin of a comment in the diagram, by its number. */
const pin = (page: Page, number: number): Locator => page.locator('.stage').getByRole('button', { name: new RegExp(`^Comment ${number}(:|$)`) });
const pinById = (page: Page, id: string): Locator => page.locator(`.stage [data-pin="${id}"]`);
const editor = (page: Page): Locator => page.getByRole('dialog').getByLabel('Comment', { exact: true });
const comments = async (page: Page) => (await savedProject(page)).comments;

/** y inside the lane of a channel, a little below its top. */
async function laneY(page: Page, channelId: string): Promise<number> {
  const box = (await lane(page, channelId).boundingBox())!;
  return box.y + box.height / 2;
}

test('a comment is pinned to a spot of a channel and gets its text', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.stage [data-pin]')).toHaveCount(0);

  // pick up the pin: the status bar says what to do
  await tool(page).click();
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.statusbar')).toContainText('Click where the comment belongs');

  // near a transition point the pin snaps to it; the place under the pointer is shown before the click
  const x = (await xOfTime(page, 4)) + 4;
  const y = await laneY(page, 'c5');
  await page.mouse.move(x, y);
  await expect(page.locator('.pin-ghost')).toHaveCount(1);
  await page.mouse.click(x, y);
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Pressure builds up in one second.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pin(page, 1)).toHaveAccessibleName('Comment 1: Pressure builds up in one second.');
  expect(await comments(page)).toEqual([
    { id: expect.any(String), text: 'Pressure builds up in one second.', on: { kind: 'channel', channel: 'c5', at: { point: 'p4' } } },
  ]);
  // the click placed a comment and nothing else: no value was set, no point added
  const doc = await savedProject(page);
  expect(doc.points).toHaveLength(6);
  expect(Object.keys(doc.channels[4]!.cells)).toEqual(['p3', 'p4', 'p5']);

  // away from every point, the pin stays at its time; the C key picks the pin up as well
  await page.keyboard.press('c');
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(await xOfTime(page, 2), await laneY(page, 'c3'));
  await page.keyboard.type('Half way.');
  // a click elsewhere finishes the text as well
  await page.mouse.click(await xOfTime(page, 7.5), await laneY(page, 'c1'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await comments(page))[1]).toMatchObject({ text: 'Half way.', on: { kind: 'channel', channel: 'c3', at: { time: 2 } } });
  // numbered from top to bottom: Cylinder A lies above Pressure
  await expect(pin(page, 1)).toHaveAccessibleName('Comment 1: Half way.');
  await expect(pin(page, 2)).toHaveAccessibleName('Comment 2: Pressure builds up in one second.');

  // adding a comment and typing its text is one step back
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.stage [data-pin]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.stage [data-pin]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('the comment tool can be put down again, and a comment without text is no comment', async ({ page }) => {
  await openApp(page);

  // Escape puts the pin down
  await tool(page).click();
  await page.keyboard.press('Escape');
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.click(await xOfTime(page, 2), await laneY(page, 'c3'));
  await expect(page.locator('.stage [data-pin]')).toHaveCount(0);

  // placed, but nothing typed: it is gone again, without a trace in the undo history
  await tool(page).click();
  await page.mouse.click(await xOfTime(page, 2), await laneY(page, 'c3'));
  await expect(editor(page)).toBeFocused();
  await expect(page.locator('.stage [data-pin]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.stage [data-pin]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(await comments(page)).toEqual([]);

  // while the tool is picked up, the diagram does nothing else: no point is added, no name is edited
  await tool(page).click();
  const before = await savedProject(page);
  await page.mouse.dblclick(await xOfTime(page, 2), await laneY(page, 'c4'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const after = await savedProject(page);
  expect(after.points).toEqual(before.points);
  expect(after.channels).toEqual(before.channels);
});

test('a comment can be on a transition point, a phase, or the name of a channel, a group or the diagram', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);
  await expect(page.locator('.stage [data-pin]')).toHaveCount(8);
  const say = async (text: string) => {
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  const added = async () => (await comments(page)).at(-1)!;

  // a transition point: the pin sits next to it in the ruler
  await tool(page).click();
  await marker(page, '0.5').click();
  await say('Start pressed.');
  expect(await added()).toMatchObject({ text: 'Start pressed.', on: { kind: 'diagram', at: { point: 'p1' } } });
  expect((await savedProject(page)).points).toHaveLength(7);

  // a phase
  await tool(page).click();
  await page.getByRole('button', { name: /^Phase Extend,/ }).first().click();
  await say('About two seconds.');
  expect(await added()).toMatchObject({ on: { kind: 'phase', phase: 'h2' } });

  // the name of a channel: the comment is about the whole channel, and the name is not edited by the click
  await tool(page).click();
  await page.locator('.channel[data-channel="c1"] .channel-name').click();
  await say('Push button S1.');
  expect(await added()).toMatchObject({ on: { kind: 'channel', channel: 'c1' } });
  await expect(page.locator('.channel[data-channel="c1"] .pin')).toHaveCount(1);

  // the bar of a group, at its title
  await tool(page).click();
  await page.locator('.group[data-group="g2"] .group-title').click();
  await say('Pressed at any time.');
  expect(await added()).toMatchObject({ on: { kind: 'group', group: 'g2' } });

  // the corner above the names: the whole diagram
  await tool(page).click();
  await page.locator('.stage-corner').click();
  await say('Drawn for machine 4.');
  expect(await added()).toMatchObject({ on: { kind: 'diagram' } });
  await expect(page.locator('.stage-corner .pin')).toHaveCount(2);

  // the C key on what has the keyboard focus: a value, a transition point, a phase
  await dot(page, 'c7', 'p2').focus();
  await page.keyboard.press('c');
  await say('Valve on.');
  expect(await added()).toMatchObject({ on: { kind: 'channel', channel: 'c7', at: { point: 'p2' } } });
  await marker(page, '6.5').focus();
  await page.keyboard.press('c');
  await say('Home again.');
  expect(await added()).toMatchObject({ on: { kind: 'diagram', at: { point: 'p6' } } });
  await page.getByRole('button', { name: /^Phase Locked,/ }).focus();
  await page.keyboard.press('c');
  await say('Until the reset.');
  expect(await added()).toMatchObject({ on: { kind: 'phase', phase: 'h8' } });

  // sixteen pins, numbered in reading order: the diagram, then group by group
  await expect(page.locator('.stage [data-pin]')).toHaveCount(16);
  await expect(pin(page, 2)).toHaveAccessibleName('Comment 2: Drawn for machine 4.');
  await expect(pin(page, 3)).toHaveAccessibleName('Comment 3: Start pressed.');
  await expect(pin(page, 7)).toHaveAccessibleName('Comment 7: About two seconds.');
  await expect(pin(page, 9)).toHaveAccessibleName('Comment 9: Push button S1.');
  await expect(pin(page, 16)).toHaveAccessibleName('Comment 16: Valve on.');
});

test('a pin follows its transition point, and can be dragged to another place', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);

  // comment 5 of the example sits on Valve Y1 at 1.0 s: move that point
  const before = (await pin(page, 5).boundingBox())!;
  const from = await centreOf(marker(page, '1.0'));
  await drag(page, from, { x: await xOfTime(page, 1.5), y: from.y });
  const after = (await pin(page, 5).boundingBox())!;
  expect(after.x - before.x).toBeCloseTo((await xOfTime(page, 1.5)) - (await xOfTime(page, 1)), 0);

  // drag the pin to Sensor B1 at 3.0 s: it now belongs there and has a later number
  let at = await centreOf(pinById(page, 'n5').locator('.pin-hit'));
  await drag(page, at, { x: (await xOfTime(page, 3)) + 3, y: await laneY(page, 'c4') });
  expect((await comments(page)).find((comment) => comment.id === 'n5')!.on).toEqual({ kind: 'channel', channel: 'c4', at: { point: 'p3' } });
  await expect(pinById(page, 'n5')).toHaveAccessibleName(/^Comment 7: Y1 switches/);
  // one drag is one step back
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pinById(page, 'n5')).toHaveAccessibleName(/^Comment 5: Y1 switches/);

  // onto the name of a channel: about the whole channel
  at = await centreOf(pinById(page, 'n5').locator('.pin-hit'));
  await drag(page, at, await centreOf(page.locator('.channel[data-channel="c8"] .channel-kind')));
  expect((await comments(page)).find((comment) => comment.id === 'n5')!.on).toEqual({ kind: 'channel', channel: 'c8' });
  await expect(page.locator('.channel[data-channel="c8"] .pin')).toHaveCount(1);

  // and from the name into the ruler, to a free time
  at = await centreOf(page.locator('.channel[data-channel="c8"] .pin'));
  await drag(page, at, { x: await xOfTime(page, 7.4, ['0.5', '6.5']), y: (await centreOf(marker(page, '6.5'))).y });
  expect((await comments(page)).find((comment) => comment.id === 'n5')!.on).toEqual({ kind: 'diagram', at: { time: 7.4 } });

  // deleting a transition point leaves its comments where they are
  await marker(page, '5.0').focus();
  await page.keyboard.press('Delete');
  expect((await comments(page)).find((comment) => comment.id === 'n2')!.on).toEqual({ kind: 'diagram', at: { time: 5 } });
  await expect(pinById(page, 'n2')).toBeVisible();
});

test('a comment is read, changed and deleted at its pin', async ({ page }) => {
  await openGroupsExample(page);
  await hidePanel(page);

  // the tooltip of a pin is its text
  await expect(pinById(page, 'n8').locator('title')).toHaveText('Comment 8: E-stop pressed while the cylinder is still extending.');

  // click: the panel shows number, place and text
  await pinById(page, 'n8').click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Emergency stop · E-stop · 2.0 s');
  await expect(editor(page)).toHaveValue('E-stop pressed while the cylinder is still extending.');
  await editor(page).fill('E-stop pressed.\nThe valve drops out at once.');
  await page.mouse.click(await xOfTime(page, 7.5), await laneY(page, 'c1'));
  expect((await comments(page)).find((comment) => comment.id === 'n8')!.text).toBe('E-stop pressed.\nThe valve drops out at once.');

  // Shift + Enter makes a new line, Escape puts the old text back
  await pinById(page, 'n8').click();
  await editor(page).press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Third line');
  await expect(editor(page)).toHaveValue('E-stop pressed.\nThe valve drops out at once.\nThird line');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveValue('E-stop pressed.\nThe valve drops out at once.');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // the bin in the panel, the Delete key on a pin, and emptying the text all remove a comment
  await pinById(page, 'n8').click();
  await panel.getByRole('button', { name: 'Delete this comment' }).click();
  await expect(pinById(page, 'n8')).toHaveCount(0);
  await pinById(page, 'n6').focus();
  await page.keyboard.press('Delete');
  await expect(pinById(page, 'n6')).toHaveCount(0);
  await pinById(page, 'n4').focus();
  await page.keyboard.press('Enter');
  await editor(page).fill('');
  await page.keyboard.press('Enter');
  await expect(pinById(page, 'n4')).toHaveCount(0);
  expect((await comments(page)).map((comment) => comment.id)).toEqual(['n1', 'n2', 'n3', 'n5', 'n7']);
  // each of the three is one step back
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.stage [data-pin]')).toHaveCount(8);

  // a comment goes with its channel
  await page.getByRole('button', { name: 'Remove channel Sensor B1' }).first().click();
  await expect(pinById(page, 'n7')).toHaveCount(0);
});

test('the Comments tab lists every comment, edits them and finds their pins', async ({ page }) => {
  await openGroupsExample(page);
  await page.getByRole('tab', { name: /Comments/ }).click();
  await expect(page.getByRole('tab', { name: /Comments/ })).toContainText('8');
  const rows = page.locator('.comment-row');
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(4)).toContainText('Normal cycle · Valve Y1 · 1.0 s');
  await expect(page.getByLabel('Text of comment 5')).toHaveValue('Y1 switches on the falling edge of the start button.');

  // the text is edited in place
  const text = page.getByLabel('Text of comment 2');
  await text.fill('The dwell time T1 is over.');
  await text.press('Enter');
  expect((await comments(page))[1]!.text).toBe('The dwell time T1 is over.');
  await expect(pinById(page, 'n2')).toHaveAccessibleName('Comment 2: The dwell time T1 is over.');

  // a click on the number finds the pin: it is marked, and its group is unfolded if needed
  await page.locator('.stage').getByRole('button', { name: 'Fold group Emergency stop away' }).click();
  await expect(pinById(page, 'n8')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show comment 8 in the diagram' }).click();
  await expect(pinById(page, 'n8')).toHaveAttribute('data-selected', 'true');
  await expect(rows.nth(7)).toHaveAttribute('data-selected', 'true');
  await expect(pinById(page, 'n8')).toBeInViewport();

  // a comment on the whole diagram is added here; its row is ready for the text
  await page.getByRole('button', { name: 'Comment on the whole diagram' }).click();
  await expect(rows).toHaveCount(9);
  await expect(page.getByLabel('Text of comment 2')).toBeFocused();
  await page.keyboard.type('Checked on the machine.');
  await page.keyboard.press('Tab');
  expect((await comments(page)).at(-1)).toMatchObject({ text: 'Checked on the machine.', on: { kind: 'diagram' } });
  await expect(page.locator('.stage-corner .pin')).toHaveCount(2);
  // adding it and typing its text was one step
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(8);
  // left without text, it does not stay
  await page.getByRole('button', { name: 'Comment on the whole diagram' }).click();
  await expect(rows).toHaveCount(9);
  await page.keyboard.press('Tab');
  await expect(rows).toHaveCount(8);

  // delete with the cross, or by emptying the text
  await page.getByRole('button', { name: 'Delete comment 1', exact: true }).click();
  await expect(rows).toHaveCount(7);
  await page.getByLabel('Text of comment 1').fill('');
  await page.getByLabel('Text of comment 1').press('Enter');
  await expect(rows).toHaveCount(6);
  expect((await comments(page)).map((comment) => comment.id)).toEqual(['n3', 'n4', 'n5', 'n6', 'n7', 'n8']);

  // the tab is remembered; the Values tab is still there
  await page.getByRole('tab', { name: 'Values' }).click();
  await expect(page.locator('.values-table')).toBeVisible();
});

test('a diagram without groups takes comments too, and an empty list says how to add one', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: /Comments/ }).click();
  await expect(page.locator('.comments-empty')).toContainText('No comments yet');
  await marker(page, '3.0').focus();
  await page.keyboard.press('c');
  await page.keyboard.type('Front end position reached.');
  await page.keyboard.press('Enter');
  await expect(page.locator('.comment-row')).toHaveCount(1);
  await expect(page.locator('.comment-row')).toContainText('Transition point · 3.0 s');
  const doc = await savedProject(page);
  expect(doc.groups).toEqual([]);
  expect(doc.comments).toHaveLength(1);
});
