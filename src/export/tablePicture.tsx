/**
 * The tables and lists of the PDF as drawings: the values, the phases and the
 * comments. What is too wide or too tall for a page is cut into blocks; every
 * block of the values table repeats the channel names and the times it belongs to.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { timeDecimals } from '../model/describe';
import { decimalsOf, formatNumber } from '../model/numbers';
import type { Channel, Doc, Group, Point } from '../model/types';
import { fitText, textWidth } from '../render/text';
import { LIGHT, webFont, type DiagramTheme, type FontResolver } from '../render/theme';
import { CommentRows, layoutCommentList, type CommentRow } from './commentList';
import { channelBlocks, channelLabel, phaseRows, type PhaseRow } from './data';
import type { Drawing } from './picture';

export interface TableOptions {
  /** Largest size a block may have, in pixels. */
  maxWidth: number;
  maxHeight: number;
  theme?: DiagramTheme;
  font?: FontResolver;
  /** CSS placed inside each drawing, e.g. embedded fonts. */
  css?: string;
}

const ROW_HEIGHT = 26;
const HEAD_HEIGHT = 30;
const CELL_WIDTH = 86;
const PAD = 10;
/** Rough width of a character at the table's font size. Used to place text that follows other text. */
const CHAR = 6.7;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks.length > 0 ? chunks : [[]];
}

function clip(text: string, maxCharacters: number): string {
  return text.length <= maxCharacters ? text : `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

/** A row of the values table: a channel, or the heading of a group. */
type Line = Channel | { heading: Group };

function isHeading(line: Line): line is { heading: Group } {
  return 'heading' in line;
}

function TableSvg({
  doc,
  lines,
  points,
  labelWidth,
  theme,
  font,
  css,
}: {
  doc: Doc;
  lines: Line[];
  points: Point[];
  labelWidth: number;
  theme: DiagramTheme;
  font: FontResolver;
  css?: string;
}) {
  const width = labelWidth + CELL_WIDTH * (1 + points.length);
  const height = HEAD_HEIGHT + ROW_HEIGHT * lines.length;
  const unit = doc.time.unit.trim();
  const timeDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const columnLeft = (index: number) => labelWidth + CELL_WIDTH * (index + 1);
  const rowBase = (index: number) => HEAD_HEIGHT + ROW_HEIGHT * index + 17;
  const maxCharacters = Math.floor((labelWidth - 2 * PAD) / CHAR);

  const horizontals = lines.map((_, index) => `M0.5 ${HEAD_HEIGHT + ROW_HEIGHT * index + 0.5}H${width + 0.5}`).join('');
  const verticals = [labelWidth, ...points.map((_, index) => columnLeft(index))]
    .map((x) => `M${x + 0.5} 0.5V${height + 0.5}`)
    .join('');

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width + 1} height={height + 1} viewBox={`0 0 ${width + 1} ${height + 1}`} role="img">
      <title>Values</title>
      {css && (
        <defs>
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </defs>
      )}
      <rect x={0.5} y={0.5} width={width} height={height} fill={theme.surface} />
      <rect x={0.5} y={0.5} width={width} height={HEAD_HEIGHT} fill={theme.markerLane} />
      <path d={horizontals + verticals} fill="none" stroke={theme.rule} strokeWidth={1} />
      <rect x={0.5} y={0.5} width={width} height={height} fill="none" stroke={theme.axis} strokeWidth={1} />

      <text x={PAD} y={19} {...font('sans600')} fontSize={11} fill={theme.text}>
        Channel
      </text>
      <text x={labelWidth + PAD} y={19} {...font('sans600')} fontSize={11} fill={theme.text}>
        Initial
      </text>
      {points.map((point, index) => {
        const label = formatNumber(point.time, timeDecimals);
        return (
          <g key={point.id}>
            <text x={columnLeft(index) + PAD} y={19} {...font('mono500')} fontSize={11} fill={theme.text}>
              {label}
            </text>
            {unit && (
              <text
                x={columnLeft(index) + PAD + label.length * CHAR + 4}
                y={19}
                {...font('sans400')}
                fontSize={10}
                fill={theme.textMuted}
              >
                {clip(unit, 5)}
              </text>
            )}
          </g>
        );
      })}

      {lines.map((line, row) => {
        if (isHeading(line)) {
          // the heading of a group lies across the whole table, over the lines of the columns
          return (
            <g key={`group ${line.heading.id}`}>
              <rect x={1} y={HEAD_HEIGHT + ROW_HEIGHT * row + 1} width={width - 1} height={ROW_HEIGHT - 1} fill={theme.markerLane} />
              <text x={PAD} y={rowBase(row)} {...font('sans600')} fontSize={11} fill={theme.text}>
                {fitText(line.heading.title, 'sans600', 11, width - 2 * PAD)}
              </text>
            </g>
          );
        }
        const channel = line;
        return (
          <g key={channel.id}>
            <text x={PAD} y={rowBase(row)} {...font('sans600')} fontSize={11} fill={theme.text}>
              {clip(channelLabel(channel), maxCharacters)}
            </text>
            <text x={labelWidth + PAD} y={rowBase(row)} {...font('mono400')} fontSize={11} fill={theme.text}>
              {formatNumber(channel.initial)}
            </text>
            {points.map((point, index) => {
              const cell = channel.cells[point.id];
              const x = columnLeft(index) + PAD;
              if (!cell) {
                return (
                  <text key={point.id} x={x} y={rowBase(row)} {...font('mono400')} fontSize={11} fill={theme.textMuted}>
                    –
                  </text>
                );
              }
              const value = formatNumber(cell.value);
              return (
                <g key={point.id}>
                  <text x={x} y={rowBase(row)} {...font('mono400')} fontSize={11} fill={theme.text}>
                    {value}
                  </text>
                  <text x={x + value.length * CHAR + 6} y={rowBase(row)} {...font('sans400')} fontSize={9.5} fill={theme.textMuted}>
                    {cell.mode}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The rows of the values table, cut into blocks of at most `size` rows. In a
 * diagram with groups every group begins with its heading, which is repeated
 * when the group continues in the next block and never stands alone at the
 * end of one.
 */
function blocksOfLines(doc: Doc, size: number): Line[][] {
  if (doc.groups.length === 0) return chunk<Line>(doc.channels, size);
  const blocks: Line[][] = [[]];
  let current = blocks[0]!;
  const next = () => {
    current = [];
    blocks.push(current);
  };
  for (const { group, channels } of channelBlocks(doc)) {
    const heading: Line = { heading: group! };
    // a heading needs a row under it, unless the block is too small to care
    if (current.length > 0 && current.length + Math.min(2, 1 + channels.length) > size) next();
    current.push(heading);
    for (const channel of channels) {
      if (current.length >= size) {
        next();
        if (size > 1) current.push(heading);
      }
      current.push(channel);
    }
  }
  return blocks;
}

/** Draws the values table, cut into as many blocks as the given size requires. */
export function renderValueTables(doc: Doc, options: TableOptions): Drawing[] {
  const theme = options.theme ?? LIGHT;
  const font = options.font ?? webFont;
  const longest = doc.channels.reduce((length, channel) => Math.max(length, channelLabel(channel).length), 'Channel'.length);
  const labelWidth = Math.round(Math.min(240, Math.max(90, 2 * PAD + longest * CHAR)));
  const columns = Math.max(1, Math.floor((options.maxWidth - 1 - labelWidth - CELL_WIDTH) / CELL_WIDTH));
  const rows = Math.max(1, Math.floor((options.maxHeight - 1 - HEAD_HEIGHT) / ROW_HEIGHT));

  const drawings: Drawing[] = [];
  for (const lines of blocksOfLines(doc, rows)) {
    for (const points of chunk(doc.points, columns)) {
      drawings.push({
        svg: renderToStaticMarkup(
          <TableSvg doc={doc} lines={lines} points={points} labelWidth={labelWidth} theme={theme} font={font} css={options.css} />,
        ),
        width: labelWidth + CELL_WIDTH * (1 + points.length) + 1,
        height: HEAD_HEIGHT + ROW_HEIGHT * lines.length + 1,
      });
    }
  }
  return drawings;
}

// ───────────────────────────── phases ─────────────────────────────

const PHASE_COLUMNS = ['Group', 'Phase', 'From', 'To', 'Duration'] as const;

function PhaseTableSvg({
  doc,
  rows,
  widths,
  theme,
  font,
  css,
}: {
  doc: Doc;
  rows: PhaseRow[];
  /** Widths of the columns "Group" and "Phase". */
  widths: [number, number];
  theme: DiagramTheme;
  font: FontResolver;
  css?: string;
}) {
  const lefts = [0, widths[0], widths[0] + widths[1], widths[0] + widths[1] + CELL_WIDTH, widths[0] + widths[1] + 2 * CELL_WIDTH];
  const width = lefts[4]! + CELL_WIDTH;
  const height = HEAD_HEIGHT + ROW_HEIGHT * rows.length;
  const unit = doc.time.unit.trim();
  const decimals = timeDecimals(doc);
  const rowBase = (index: number) => HEAD_HEIGHT + ROW_HEIGHT * index + 17;
  const horizontals = rows.map((_, index) => `M0.5 ${HEAD_HEIGHT + ROW_HEIGHT * index + 0.5}H${width + 0.5}`).join('');
  const verticals = lefts
    .slice(1)
    .map((x) => `M${x + 0.5} 0.5V${height + 0.5}`)
    .join('');

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width + 1} height={height + 1} viewBox={`0 0 ${width + 1} ${height + 1}`} role="img">
      <title>Phases</title>
      {css && (
        <defs>
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </defs>
      )}
      <rect x={0.5} y={0.5} width={width} height={height} fill={theme.surface} />
      <rect x={0.5} y={0.5} width={width} height={HEAD_HEIGHT} fill={theme.markerLane} />
      <path d={horizontals + verticals} fill="none" stroke={theme.rule} strokeWidth={1} />
      <rect x={0.5} y={0.5} width={width} height={height} fill="none" stroke={theme.axis} strokeWidth={1} />
      {PHASE_COLUMNS.map((title, index) => (
        <text key={title} x={lefts[index]! + PAD} y={19} {...font('sans600')} fontSize={11} fill={theme.text}>
          {index > 1 && unit ? `${title} [${clip(unit, 5)}]` : title}
        </text>
      ))}
      {rows.map((row, index) => (
        <g key={index}>
          <text x={PAD} y={rowBase(index)} {...font('sans600')} fontSize={11} fill={theme.text}>
            {fitText(row.group, 'sans600', 11, widths[0] - 2 * PAD)}
          </text>
          <text x={lefts[1]! + PAD} y={rowBase(index)} {...font('sans400')} fontSize={11} fill={theme.text}>
            {fitText(row.phase, 'sans400', 11, widths[1] - 2 * PAD)}
          </text>
          {[row.from, row.to, row.duration].map((time, column) => (
            <text key={column} x={lefts[2 + column]! + PAD} y={rowBase(index)} {...font('mono400')} fontSize={11} fill={theme.text}>
              {formatNumber(time, decimals)}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Draws the table of the phases: group, phase, from, to, duration. No drawing when there are no phases. */
export function renderPhaseTables(doc: Doc, options: TableOptions): Drawing[] {
  const all = phaseRows(doc);
  if (all.length === 0) return [];
  const theme = options.theme ?? LIGHT;
  const font = options.font ?? webFont;
  const room = options.maxWidth - 1 - 3 * CELL_WIDTH;
  const need = (texts: string[], face: 'sans400' | 'sans600', title: string) =>
    Math.ceil(Math.max(textWidth(title, 'sans600', 11), ...texts.map((text) => textWidth(text, face, 11))) + 2 * PAD);
  // each of the two text columns gets what it needs, but together no more than the page has
  let group = Math.max(70, need(all.map((row) => row.group), 'sans600', 'Group'));
  let phase = Math.max(70, need(all.map((row) => row.phase), 'sans400', 'Phase'));
  if (group + phase > room) {
    const share = Math.max(140, room) / (group + phase);
    group = Math.floor(group * share);
    phase = Math.floor(phase * share);
  }
  const perBlock = Math.max(1, Math.floor((options.maxHeight - 1 - HEAD_HEIGHT) / ROW_HEIGHT));
  return chunk(all, perBlock).map((rows) => ({
    svg: renderToStaticMarkup(<PhaseTableSvg doc={doc} rows={rows} widths={[group, phase]} theme={theme} font={font} css={options.css} />),
    width: group + phase + 3 * CELL_WIDTH + 1,
    height: HEAD_HEIGHT + ROW_HEIGHT * rows.length + 1,
  }));
}

// ───────────────────────────── comments ─────────────────────────────

/** Height of a line of a comment in the list. */
const COMMENT_LINE = 16;

/**
 * Draws the list of comments, cut into blocks that fit the given height. A
 * comment stays in one block unless it alone is longer than a block: then it
 * continues in the next. No drawing when there are no comments.
 */
export function renderCommentBlocks(doc: Doc, options: TableOptions): Drawing[] {
  const list = layoutCommentList(doc, options.maxWidth);
  if (list.rows.length === 0) return [];
  const theme = options.theme ?? LIGHT;
  const font = options.font ?? webFont;

  // a comment longer than a block is laid out as parts: the first keeps the number and the place
  const linesPerBlock = Math.max(1, Math.floor((options.maxHeight - 6) / COMMENT_LINE));
  const parts: CommentRow[] = list.rows.flatMap((row) => {
    if (row.lines.length <= linesPerBlock) return [row];
    return chunk(row.lines, linesPerBlock).map((lines, index) => ({
      number: row.number,
      place: index === 0 ? row.place : '',
      lines,
      height: lines.length * COMMENT_LINE + 5,
      continued: index > 0,
    }));
  });

  const blocks: CommentRow[][] = [[]];
  let used = 0;
  for (const part of parts) {
    if (blocks[blocks.length - 1]!.length > 0 && used + part.height > options.maxHeight) {
      blocks.push([]);
      used = 0;
    }
    blocks[blocks.length - 1]!.push(part);
    used += part.height;
  }

  return blocks.map((rows) => {
    const height = Math.ceil(rows.reduce((sum, row) => sum + row.height, 0));
    const width = Math.ceil(list.width);
    return {
      svg: renderToStaticMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
          <title>Comments</title>
          {options.css && (
            <defs>
              <style dangerouslySetInnerHTML={{ __html: options.css }} />
            </defs>
          )}
          <rect x={0} y={0} width={width} height={height} fill={theme.surface} />
          <CommentRows list={list} rows={rows} theme={theme} font={font} />
        </svg>,
      ),
      width,
      height,
    };
  });
}
