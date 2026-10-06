/**
 * The values table as drawings, for the PDF. A table that is too wide or too
 * tall for a page is cut into blocks; every block repeats the channel names
 * and the times it belongs to.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { decimalsOf, formatNumber } from '../model/numbers';
import type { Channel, Doc, Point } from '../model/types';
import { LIGHT, webFont, type DiagramTheme, type FontResolver } from '../render/theme';
import { channelLabel } from './data';
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

function TableSvg({
  doc,
  channels,
  points,
  labelWidth,
  theme,
  font,
  css,
}: {
  doc: Doc;
  channels: Channel[];
  points: Point[];
  labelWidth: number;
  theme: DiagramTheme;
  font: FontResolver;
  css?: string;
}) {
  const width = labelWidth + CELL_WIDTH * (1 + points.length);
  const height = HEAD_HEIGHT + ROW_HEIGHT * channels.length;
  const unit = doc.time.unit.trim();
  const timeDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const columnLeft = (index: number) => labelWidth + CELL_WIDTH * (index + 1);
  const rowBase = (index: number) => HEAD_HEIGHT + ROW_HEIGHT * index + 17;
  const maxCharacters = Math.floor((labelWidth - 2 * PAD) / CHAR);

  const horizontals = channels.map((_, index) => `M0.5 ${HEAD_HEIGHT + ROW_HEIGHT * index + 0.5}H${width + 0.5}`).join('');
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

      {channels.map((channel, row) => (
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
      ))}
    </svg>
  );
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
  for (const channels of chunk(doc.channels, rows)) {
    for (const points of chunk(doc.points, columns)) {
      drawings.push({
        svg: renderToStaticMarkup(
          <TableSvg doc={doc} channels={channels} points={points} labelWidth={labelWidth} theme={theme} font={font} css={options.css} />,
        ),
        width: labelWidth + CELL_WIDTH * (1 + points.length) + 1,
        height: HEAD_HEIGHT + ROW_HEIGHT * channels.length + 1,
      });
    }
  }
  return drawings;
}
