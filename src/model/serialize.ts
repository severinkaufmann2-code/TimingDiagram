/** Saving and loading project files. */

import { COMMENT_MAX_LENGTH, dropOrphanComments } from './comments';
import { PALETTE_SIZE, normalizeChannel } from './doc';
import { GROUP_TITLE_MAX_LENGTH, arrangeChannels } from './groups';
import { newId } from './ids';
import { coverMoments } from './moments';
import { clean } from './numbers';
import { PHASE_TITLE_MAX_LENGTH } from './phases';
import type { Anchor, Cell, Channel, Comment, CommentTarget, Doc, Group, Phase, Point, TimeAxis } from './types';
import { pointExtent } from './waveform';

export const FILE_KIND = 'timing-diagram';
/** The newest format this editor writes and reads. Version 2 added groups, phases and comments. */
export const FILE_VERSION = 2;
export const FILE_EXTENSION = '.timing.json';

/** Id of the script element that carries the project inside an exported HTML page. */
export const EMBED_ID = 'timing-diagram-project';

export class ProjectFileError extends Error {}

/**
 * The format version a diagram needs. One without groups and comments is
 * written as version 1, so that version 1.0 of the editor still opens it;
 * the others it refuses instead of silently dropping what it does not know.
 */
export function fileVersion(doc: Doc): number {
  return doc.groups.length > 0 || doc.comments.length > 0 ? FILE_VERSION : 1;
}

export function serialize(doc: Doc): string {
  return JSON.stringify({ kind: FILE_KIND, version: fileVersion(doc), ...doc }, null, 2) + '\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, maxLength = 200): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clean(value) : fallback;
}

function readPoints(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];
  const taken = new Set<string>();
  const points: Point[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.time !== 'number' || !Number.isFinite(item.time)) continue;
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId('p', taken);
    if (taken.has(id)) id = newId('p', taken);
    taken.add(id);
    points.push({ id, time: clean(item.time) });
  }
  return points.sort((a, b) => a.time - b.time);
}

function readCells(value: unknown, pointIds: ReadonlySet<string>): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  if (!isRecord(value)) return cells;
  for (const [pointId, item] of Object.entries(value)) {
    if (!pointIds.has(pointId) || !isRecord(item)) continue;
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) continue;
    cells[pointId] = { value: clean(item.value), mode: item.mode === 'ramp' ? 'ramp' : 'step' };
  }
  return cells;
}

function readChannels(value: unknown, pointIds: ReadonlySet<string>): Channel[] {
  if (!Array.isArray(value)) return [];
  const taken = new Set<string>();
  const channels: Channel[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId('c', taken);
    if (taken.has(id)) id = newId('c', taken);
    taken.add(id);
    const kind = item.kind === 'analog' ? 'analog' : 'digital';
    const color = finite(item.color, channels.length);
    channels.push(
      normalizeChannel({
        id,
        group: typeof item.group === 'string' ? item.group : null,
        name: text(item.name, `Channel ${channels.length + 1}`),
        kind,
        color: ((Math.round(color) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE,
        unit: text(item.unit, '', 40),
        min: finite(item.min, 0),
        max: finite(item.max, kind === 'analog' ? 100 : 1),
        initial: finite(item.initial, 0),
        cells: readCells(item.cells, pointIds),
      }),
    );
  }
  return channels;
}

function readAnchor(value: unknown, pointIds: ReadonlySet<string>): Anchor | null {
  if (!isRecord(value)) return null;
  if (typeof value.point === 'string') return pointIds.has(value.point) ? { point: value.point } : null;
  if (typeof value.time === 'number' && Number.isFinite(value.time)) return { time: clean(value.time) };
  return null;
}

function readPhases(value: unknown, pointIds: ReadonlySet<string>, taken: Set<string>): Phase[] {
  if (!Array.isArray(value)) return [];
  const phases: Phase[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const from = readAnchor(item.from, pointIds);
    const to = readAnchor(item.to, pointIds);
    if (!from || !to) continue;
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId('h', taken);
    if (taken.has(id)) id = newId('h', taken);
    taken.add(id);
    phases.push({ id, title: text(item.title, `Phase ${phases.length + 1}`, PHASE_TITLE_MAX_LENGTH), from, to });
  }
  return phases;
}

function readGroups(value: unknown, pointIds: ReadonlySet<string>): Group[] {
  if (!Array.isArray(value)) return [];
  const taken = new Set<string>();
  const phaseIds = new Set<string>();
  const groups: Group[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId('g', taken);
    if (taken.has(id)) id = newId('g', taken);
    taken.add(id);
    groups.push({
      id,
      title: text(item.title, `Group ${groups.length + 1}`, GROUP_TITLE_MAX_LENGTH),
      phases: readPhases(item.phases, pointIds, phaseIds),
    });
  }
  return groups;
}

function readTarget(value: unknown, pointIds: ReadonlySet<string>): CommentTarget | null {
  if (!isRecord(value)) return null;
  // a moment that cannot be read makes the comment one about the whole diagram or channel
  const at = readAnchor(value.at, pointIds) ?? undefined;
  switch (value.kind) {
    case 'diagram':
      return at ? { kind: 'diagram', at } : { kind: 'diagram' };
    case 'group':
      return typeof value.group === 'string' ? { kind: 'group', group: value.group } : null;
    case 'phase':
      return typeof value.phase === 'string' ? { kind: 'phase', phase: value.phase } : null;
    case 'channel':
      if (typeof value.channel !== 'string') return null;
      return at ? { kind: 'channel', channel: value.channel, at } : { kind: 'channel', channel: value.channel };
    default:
      return null;
  }
}

function readComments(value: unknown, pointIds: ReadonlySet<string>): Comment[] {
  if (!Array.isArray(value)) return [];
  const taken = new Set<string>();
  const comments: Comment[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.text !== 'string' || item.text.trim() === '') continue;
    const on = readTarget(item.on, pointIds);
    if (!on) continue;
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : newId('n', taken);
    if (taken.has(id)) id = newId('n', taken);
    taken.add(id);
    comments.push({ id, text: item.text.slice(0, COMMENT_MAX_LENGTH), on });
  }
  return comments;
}

function readTime(value: unknown, points: readonly Point[]): TimeAxis {
  const source = isRecord(value) ? value : {};
  let start = finite(source.start, 0);
  let end = finite(source.end, 10);
  const extent = pointExtent(points);
  if (extent) {
    start = Math.min(start, extent.min);
    end = Math.max(end, extent.max);
  }
  if (!(end > start)) end = clean(start + 1);
  const snap = finite(source.snap, 0);
  return { unit: text(source.unit, 's', 20), start, end, snap: snap > 0 ? snap : 0 };
}

/** Pulls the project out of an HTML page exported by this app. */
function extractFromHtml(html: string): string {
  const pattern = new RegExp(`<script[^>]*\\bid=["']${EMBED_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i');
  const match = pattern.exec(html);
  if (!match) {
    throw new ProjectFileError('This HTML page does not contain a timing diagram that can be edited.');
  }
  return match[1]!;
}

/**
 * Reads a project file, or an HTML page exported by this app. Anything that
 * can be salvaged is kept; damaged parts fall back to defaults.
 */
export function parseProject(content: string): Doc {
  const trimmed = content.trimStart();
  const json = trimmed.startsWith('<') ? extractFromHtml(trimmed) : trimmed;

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectFileError('This file is not a timing diagram project (it is not valid JSON).');
  }
  if (!isRecord(data) || data.kind !== FILE_KIND) {
    throw new ProjectFileError('This file is not a timing diagram project.');
  }
  if (typeof data.version === 'number' && data.version > FILE_VERSION) {
    throw new ProjectFileError('This project was saved by a newer version of the editor.');
  }

  const points = readPoints(data.points);
  const pointIds = new Set(points.map((point) => point.id));
  const doc: Doc = {
    title: text(data.title, 'Untitled diagram'),
    time: readTime(data.time, points),
    points,
    groups: readGroups(data.groups, pointIds),
    channels: readChannels(data.channels, pointIds),
    comments: readComments(data.comments, pointIds),
  };
  // a file of version 1 has neither groups nor comments and passes through unchanged
  return coverMoments(dropOrphanComments(arrangeChannels(doc)));
}

/** JSON that is safe to place inside a script element of an HTML page. */
export function serializeForHtml(doc: Doc): string {
  return JSON.stringify({ kind: FILE_KIND, version: fileVersion(doc), ...doc }).replace(/</g, '\\u003c');
}

/** A file name made from the diagram title. */
export function fileBaseName(doc: Doc): string {
  // letters and digits of any language are fine in file names; everything else becomes a separator
  const name = doc.title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return name === '' ? 'timing-diagram' : name.slice(0, 80);
}
