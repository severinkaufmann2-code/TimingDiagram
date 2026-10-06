/**
 * The drawn pieces of a diagram. They are used twice: by the editor on screen
 * and by the exports. Everything is styled with plain SVG attributes, never
 * with CSS classes, so an exported picture needs no stylesheet.
 */

import type { ReactNode } from 'react';
import { clamp, formatNumber } from '../model/numbers';
import type { Doc } from '../model/types';
import { channelVertices } from '../model/waveform';
import { PAD_LEFT, crisp, rowY, type Layout, type Marker, type Row } from './layout';
import { channelColor, webFont, type DiagramTheme, type FontResolver } from './theme';

interface Base {
  layout: Layout;
  theme: DiagramTheme;
  /** How font faces are named. Only PDF export needs something other than the default. */
  font?: FontResolver;
}

/** Upper part of the ruler: numbers and ticks, and the tinted lane the markers sit in. */
export function RulerScale({ layout, theme, font = webFont }: Base) {
  const line = layout.scaleLine;
  const major = layout.majorTicks.map((tick) => `M${crisp(tick.x)} ${line - 6.5}V${line - 0.5}`).join('');
  const minor = layout.minorTicks.map((x) => `M${crisp(x)} ${line - 3.5}V${line - 0.5}`).join('');
  return (
    <g>
      <rect x={0} y={line + 0.5} width={layout.width} height={layout.rulerHeight - line - 0.5} fill={theme.markerLane} />
      <path d={`M0 ${line}H${layout.width}`} fill="none" stroke={theme.rule} strokeWidth={1} />
      <path d={major + minor} fill="none" stroke={theme.tick} strokeWidth={1} />
      {layout.majorTicks.map((tick) => (
        <text
          key={tick.time}
          x={crisp(tick.x)}
          y={line - 12.5}
          textAnchor="middle"
          {...font('mono400')}
          fontSize={10}
          fill={theme.textMuted}
        >
          {tick.label}
        </text>
      ))}
      <path
        d={`M0 ${layout.rulerHeight - 0.5}H${layout.width}`}
        fill="none"
        stroke={theme.axis}
        strokeWidth={1}
      />
    </g>
  );
}

/** Label box of a transition point in the ruler, with the stub of its line. */
export function MarkerPill({
  marker,
  layout,
  theme,
  font = webFont,
  selected = false,
  faint = false,
}: Base & { marker: Marker; selected?: boolean; faint?: boolean }) {
  const left = Math.round(marker.x - marker.width / 2) + 0.5;
  const x = crisp(marker.x);
  return (
    <g opacity={faint ? 0.55 : 1}>
      <path
        d={`M${x} ${marker.top + marker.height}V${layout.rulerHeight}`}
        fill="none"
        stroke={selected ? theme.selected : theme.guide}
        strokeWidth={1}
      />
      <rect
        x={left}
        y={marker.top + 0.5}
        width={marker.width}
        height={marker.height}
        rx={4}
        fill={selected ? theme.selected : theme.pillFill}
        stroke={selected ? theme.selected : theme.pillStroke}
        strokeWidth={1}
        strokeDasharray={faint ? '3 2' : undefined}
      />
      <text
        x={left + marker.width / 2}
        y={marker.top + 13.5}
        textAnchor="middle"
        {...font('mono500')}
        fontSize={11}
        fill={selected ? theme.onSelected : theme.text}
      >
        {marker.label}
      </text>
    </g>
  );
}

/** Background of the lanes: highlight of one lane, tick lines, lane separators. */
export function LaneGrid({ layout, theme, highlightRow }: Base & { highlightRow?: number }) {
  const band = highlightRow === undefined ? undefined : layout.rows[highlightRow];
  const grid = layout.majorTicks.map((tick) => `M${crisp(tick.x)} 0V${layout.lanesHeight}`).join('');
  const rules = layout.rows
    .filter((row) => row.index > 0)
    .map((row) => `M0 ${row.top + 0.5}H${layout.width}`)
    .join('');
  return (
    <g>
      {band && <rect x={0} y={band.top} width={layout.width} height={band.height} fill={theme.band} />}
      {grid && <path d={grid} fill="none" stroke={theme.grid} strokeWidth={1} />}
      {rules && <path d={rules} fill="none" stroke={theme.rule} strokeWidth={1} />}
    </g>
  );
}

/** Vertical lines of the transition points through all lanes. */
export function GuideLines({ layout, theme, selectedPointId }: Base & { selectedPointId?: string }) {
  const normal = layout.markers
    .filter((marker) => marker.pointId !== selectedPointId)
    .map((marker) => `M${crisp(marker.x)} 0V${layout.lanesHeight}`)
    .join('');
  const selected = layout.markers.find((marker) => marker.pointId === selectedPointId);
  return (
    <g>
      {normal && <path d={normal} fill="none" stroke={theme.guide} strokeWidth={1} />}
      {selected && (
        <path
          d={`M${crisp(selected.x)} 0V${layout.lanesHeight}`}
          fill="none"
          stroke={theme.selected}
          strokeWidth={1}
        />
      )}
    </g>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One channel: the wash under the line, the line, and the two value labels at the left. */
export function Waveform({ doc, row, layout, theme, font = webFont }: Base & { doc: Doc; row: Row }) {
  const { channel } = row;
  const color = channelColor(theme, channel.color);
  const vertices = channelVertices(doc, channel).map((vertex) => ({
    x: round(layout.x(vertex.t)),
    y: round(rowY(row, vertex.v)),
  }));
  const line = vertices.map((vertex, index) => `${index === 0 ? 'M' : 'L'}${vertex.x} ${vertex.y}`).join('');
  // the wash reaches from the line to zero, or to the nearest edge of the range
  const base = round(rowY(row, clamp(0, channel.min, channel.max)));
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  const area = `M${first.x} ${base}${line.replace('M', 'L')}L${last.x} ${base}Z`;
  const labelX = PAD_LEFT - 10;
  return (
    <g>
      <path d={area} fill={color} fillOpacity={theme.wash} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={labelX} y={row.yMax + 3.5} textAnchor="end" {...font('mono400')} fontSize={10} fill={theme.textMuted}>
        {formatNumber(channel.max)}
      </text>
      <text x={labelX} y={row.yMin + 3.5} textAnchor="end" {...font('mono400')} fontSize={10} fill={theme.textMuted}>
        {formatNumber(channel.min)}
      </text>
    </g>
  );
}

export type DotKind =
  /** A value the channel has at a transition point. */
  | 'value'
  /** The initial value at the start of the timeline. */
  | 'initial'
  /** A crossing without a value, shown while the pointer is near. */
  | 'empty';

export function Dot({
  cx,
  cy,
  kind,
  color,
  theme,
  selected = false,
  children,
}: {
  cx: number;
  cy: number;
  kind: DotKind;
  color: string;
  theme: DiagramTheme;
  selected?: boolean;
  children?: ReactNode;
}) {
  return (
    <g>
      {selected && <circle cx={cx} cy={cy} r={9} fill={theme.surface} stroke={theme.selected} strokeWidth={1.5} />}
      {kind === 'value' ? (
        <circle cx={cx} cy={cy} r={selected ? 4.5 : 5} fill={color} stroke={theme.surface} strokeWidth={selected ? 0 : 2} />
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={theme.surface}
          stroke={color}
          strokeWidth={kind === 'initial' ? 2 : 1.5}
          strokeDasharray={kind === 'empty' ? '2.2 2.2' : undefined}
        />
      )}
      {children}
    </g>
  );
}
