/**
 * The drawn pieces of a diagram. They are used twice: by the editor on screen
 * and by the exports. Everything is styled with plain SVG attributes, never
 * with CSS classes, so an exported picture needs no stylesheet.
 */

import type { ReactNode } from 'react';
import { clamp, formatNumber } from '../model/numbers';
import type { Doc } from '../model/types';
import { channelVertices } from '../model/waveform';
import { GROUP_BAR, PAD_LEFT, PIN_STEP, crisp, pinWidth, rowY, type Layout, type Marker, type PinPlace, type Row } from './layout';
import { fitText } from './text';
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

/** Title bars of the groups: the tinted strip across the timeline, and the lines above and below it. */
export function GroupBars({ layout, theme }: Base) {
  return (
    <g>
      {layout.bands.map((band) => (
        <g key={band.group.id}>
          <rect x={0} y={band.top} width={layout.width} height={GROUP_BAR} fill={theme.markerLane} />
          {band.top > 0 && <path d={`M0 ${band.top + 0.5}H${layout.width}`} fill="none" stroke={theme.axis} strokeWidth={1} />}
          {band.rows.length > 0 && (
            <path d={`M0 ${band.top + GROUP_BAR + 0.5}H${layout.width}`} fill="none" stroke={theme.rule} strokeWidth={1} />
          )}
        </g>
      ))}
    </g>
  );
}

/** The phases of all groups, each a labelled box inside the bar of its group. */
export function PhaseBars({ layout, theme, font = webFont, selectedPhaseId }: Base & { selectedPhaseId?: string }) {
  return (
    <g>
      {layout.phases.map((box) => {
        const selected = box.phase.id === selectedPhaseId;
        // pins of comments sit at the right end of the box
        const room = box.width - box.pins * PIN_STEP - (box.pins > 0 ? 3 : 0);
        return (
          <g key={box.phase.id}>
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={4}
              fill={theme.surface}
              stroke={selected ? theme.selected : theme.guide}
              strokeWidth={selected ? 1.5 : 1}
            />
            <text
              x={round(box.x + room / 2)}
              y={box.y + box.height / 2 + 4}
              textAnchor="middle"
              {...font('sans600')}
              fontSize={11.5}
              fill={theme.text}
            >
              {fitText(box.phase.title, 'sans600', 11.5, room - 10)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The numbered marker of a comment. */
export function PinMark({
  cx,
  cy,
  number,
  theme,
  font = webFont,
  selected = false,
  faint = false,
}: {
  cx: number;
  cy: number;
  number: number;
  theme: DiagramTheme;
  font?: FontResolver;
  selected?: boolean;
  faint?: boolean;
}) {
  const width = pinWidth(number);
  return (
    <g opacity={faint ? 0.6 : 1}>
      <rect
        x={cx - width / 2}
        y={cy - 7}
        width={width}
        height={14}
        rx={7}
        fill={selected ? theme.selected : theme.surface}
        stroke={theme.selected}
        strokeWidth={1.25}
        strokeDasharray={faint ? '2.5 2' : undefined}
      />
      <text x={cx} y={cy + 3.4} textAnchor="middle" {...font('sans600')} fontSize={9.5} fill={selected ? theme.onSelected : theme.text}>
        {number}
      </text>
    </g>
  );
}

/**
 * A pin at its place, with the short stroke that ties it to its moment. At a
 * plain time, where no line of a transition point runs, it brings its own.
 */
export function PlacedPin({
  pin,
  theme,
  font = webFont,
  selected = false,
  faint = false,
}: {
  pin: PinPlace;
  theme: DiagramTheme;
  font?: FontResolver;
  selected?: boolean;
  faint?: boolean;
}) {
  const x = crisp(pin.x);
  const stalk = pin.where === 'ruler' ? `M${x} ${pin.top + 1}V${pin.top + 19}` : `M${x} ${pin.top + 2}V${pin.top + 17}`;
  return (
    <g>
      {pin.where !== 'phase' && pin.free && <path d={stalk} fill="none" stroke={theme.selected} strokeWidth={1} opacity={faint ? 0.6 : 1} />}
      {pin.where === 'lane' && (
        <path d={`M${x} ${pin.cy}H${pin.cx - pinWidth(pin.number) / 2}`} fill="none" stroke={theme.selected} strokeWidth={1} opacity={faint ? 0.6 : 1} />
      )}
      <PinMark cx={pin.cx} cy={pin.cy} number={pin.number} theme={theme} font={font} selected={selected} faint={faint} />
    </g>
  );
}

/** The pins of the comments, either those in the ruler or those in the lanes. */
export function Pins({ layout, theme, font = webFont, ruler = false }: Base & { ruler?: boolean }) {
  return (
    <g>
      {layout.pins
        .filter((pin) => (pin.where === 'ruler') === ruler)
        .map((pin) => (
          <PlacedPin key={pin.comment.id} pin={pin} theme={theme} font={font} />
        ))}
    </g>
  );
}
