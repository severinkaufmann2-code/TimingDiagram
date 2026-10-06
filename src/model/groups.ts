/** Groups: titled blocks of channels. Pure functions, like everything in the model. */

import { dropOrphanComments } from './comments';
import { newId } from './ids';
import type { Channel, Doc, Group } from './types';

export const GROUP_TITLE_MAX_LENGTH = 80;

export function findGroup(doc: Doc, groupId: string): Group | undefined {
  return doc.groups.find((group) => group.id === groupId);
}

export function groupIndex(doc: Doc, groupId: string): number {
  return doc.groups.findIndex((group) => group.id === groupId);
}

/** The channels of a group from top to bottom. With null: the channels of a diagram without groups. */
export function channelsOf(doc: Doc, groupId: string | null): Channel[] {
  return doc.channels.filter((channel) => channel.group === groupId);
}

/**
 * Brings the channels back into a consistent state after an edit: every one
 * in a group that exists, and all of them in the order of the groups.
 */
export function arrangeChannels(doc: Doc): Doc {
  if (doc.groups.length === 0) {
    if (doc.channels.every((channel) => channel.group === null)) return doc;
    return { ...doc, channels: doc.channels.map((channel) => (channel.group === null ? channel : { ...channel, group: null })) };
  }
  const order = new Map(doc.groups.map((group, index) => [group.id, index]));
  const first = doc.groups[0]!.id;
  const placed = doc.channels.map((channel) => (channel.group !== null && order.has(channel.group) ? channel : { ...channel, group: first }));
  // the sort is stable: channels keep their order inside a group
  const sorted = [...placed].sort((a, b) => order.get(a.group!)! - order.get(b.group!)!);
  return sorted.every((channel, index) => channel === doc.channels[index]) ? doc : { ...doc, channels: sorted };
}

function freeTitle(doc: Doc): string {
  const titles = new Set(doc.groups.map((group) => group.title));
  for (let n = doc.groups.length + 1; ; n++) {
    const title = `Group ${n}`;
    if (!titles.has(title)) return title;
  }
}

/**
 * Adds a group at the bottom. The first group of a diagram takes all channels
 * that are already there; every further group starts empty.
 */
export function addGroup(doc: Doc, title?: string): { doc: Doc; id: string } {
  const id = newId('g', doc.groups.map((group) => group.id));
  const group: Group = { id, title: (title ?? freeTitle(doc)).slice(0, GROUP_TITLE_MAX_LENGTH), phases: [] };
  const channels = doc.groups.length === 0 ? doc.channels.map((channel) => ({ ...channel, group: id })) : doc.channels;
  return { doc: { ...doc, groups: [...doc.groups, group], channels }, id };
}

export function renameGroup(doc: Doc, groupId: string, title: string): Doc {
  const next = title.trim().slice(0, GROUP_TITLE_MAX_LENGTH);
  const group = findGroup(doc, groupId);
  if (!group || next === '' || group.title === next) return doc;
  return { ...doc, groups: doc.groups.map((candidate) => (candidate.id === groupId ? { ...candidate, title: next } : candidate)) };
}

/** Moves a group, with its channels, so that it ends up at `toIndex` among the groups. */
export function moveGroup(doc: Doc, groupId: string, toIndex: number): Doc {
  const from = groupIndex(doc, groupId);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(toIndex, doc.groups.length - 1));
  if (to === from) return doc;
  const groups = [...doc.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved!);
  return arrangeChannels({ ...doc, groups });
}

/**
 * Copies a group with its channels, values and phases, and places the copy
 * right below. Comments are not copied: they explain the original.
 */
export function duplicateGroup(doc: Doc, groupId: string): { doc: Doc; id: string } {
  const index = groupIndex(doc, groupId);
  const source = doc.groups[index];
  if (!source) return { doc, id: '' };
  const id = newId('g', doc.groups.map((group) => group.id));

  const channelIds = new Set(doc.channels.map((channel) => channel.id));
  const channels = channelsOf(doc, groupId).map((channel) => {
    const copyId = newId('c', channelIds);
    channelIds.add(copyId);
    return { ...channel, id: copyId, group: id, cells: { ...channel.cells } };
  });
  const phaseIds = new Set(doc.groups.flatMap((group) => group.phases.map((phase) => phase.id)));
  const phases = source.phases.map((phase) => {
    const copyId = newId('h', phaseIds);
    phaseIds.add(copyId);
    return { ...phase, id: copyId };
  });

  const titles = new Set(doc.groups.map((group) => group.title));
  let title = `${source.title} (copy)`;
  for (let n = 2; titles.has(title); n++) title = `${source.title} (copy ${n})`;

  const groups = [...doc.groups];
  groups.splice(index + 1, 0, { id, title: title.slice(0, GROUP_TITLE_MAX_LENGTH), phases });
  return { doc: arrangeChannels({ ...doc, groups, channels: [...doc.channels, ...channels] }), id };
}

/**
 * Removes a group with its phases. Its channels are removed too, or kept:
 * then they join the group above (the group below when it was the first).
 * Removing the only group and keeping the channels gives a diagram without groups.
 */
export function removeGroup(doc: Doc, groupId: string, keepChannels: boolean): Doc {
  const index = groupIndex(doc, groupId);
  if (index < 0) return doc;
  const heir = doc.groups[index - 1] ?? doc.groups[index + 1];
  const groups = doc.groups.filter((group) => group.id !== groupId);
  const channels = keepChannels
    ? doc.channels.map((channel) => (channel.group === groupId ? { ...channel, group: heir ? heir.id : null } : channel))
    : doc.channels.filter((channel) => channel.group !== groupId);
  return dropOrphanComments(arrangeChannels({ ...doc, groups, channels }));
}
