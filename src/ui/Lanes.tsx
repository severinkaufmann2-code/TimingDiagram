/** The lanes: one per channel with its waveform and the dots of its values, and the bars of the groups between them. */

import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { addPoint, clearValue, findChannel, putValue, setMode, setValue, toggleDigital } from '../model/doc';
import { clamp, formatNumber, snapTo } from '../model/numbers';
import { INITIAL, type Channel, type Column, type Doc } from '../model/types';
import { valueAt } from '../model/waveform';
import { rowValue, rowY, valueStep, type Layout, type Row } from '../render/layout';
import { Dot, GroupBars, GuideLines, LaneGrid, Waveform, type DotKind } from '../render/parts';
import { FONT_MONO, channelColor, type DiagramTheme } from '../render/theme';
import { useStore, type Selection } from '../state/store';
import { startDrag } from './drag';
import { SNAP_DISTANCE, timeAtPixel } from './snap';

function describeValue(channel: Channel, value: number): string {
  return channel.kind === 'analog' && channel.unit ? `${formatNumber(value)} ${channel.unit}` : formatNumber(value);
}

interface LanesProps {
  doc: Doc;
  layout: Layout;
  theme: DiagramTheme;
  selection: Selection;
  selectedPointId?: string;
  /** Index of the lane that is highlighted. */
  selectedRow?: number;
  svgRef: RefObject<SVGSVGElement | null>;
  /** Called with a key that a value does not use itself. Returns true when it was handled. */
  onValueKey?: (event: KeyboardEvent, channelId: string, column: Column) => boolean;
  /** Drawn right above the grid, under the waveforms: what belongs to the bars of the groups. */
  under?: ReactNode;
  /** Drawn on top of everything, e.g. the pins of comments. */
  children?: ReactNode;
}

export function Lanes({ doc, layout, theme, selection, selectedPointId, selectedRow, svgRef, onValueKey, under, children }: LanesProps) {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);

  const beginDotDrag = (event: PointerEvent, row: Row, column: Column, hasValue: boolean, startValue: number) => {
    const channelId = row.channel.id;
    const kind = row.channel.kind;
    const startY = rowY(row, startValue);
    const dotX = column === INITIAL ? layout.x(doc.time.start) : (layout.markers.find((m) => m.pointId === column)?.x ?? 0);
    useStore.getState().select({ kind: 'cell', channelId, column });
    startDrag(event, {
      cursor: 'ns-resize',
      onStart: () => useStore.getState().beginGesture(),
      onMove: (_dx, dy, move) => {
        const { change } = useStore.getState();
        const raw = rowValue(row, startY + dy);
        const step = valueStep(row.channel);
        const value = clamp(snapTo(raw, move.altKey && kind === 'analog' ? step / 10 : step), row.channel.min, row.channel.max);
        change((d) => setValue(d, channelId, column, value));
        setReadout({ x: dotX, y: rowY(row, value), text: describeValue(row.channel, value) });
      },
      onEnd: (dragged) => {
        const { endGesture, change, select } = useStore.getState();
        setReadout(null);
        if (dragged) {
          endGesture();
          return;
        }
        // a click on an empty crossing of a digital channel flips the signal there
        if (!hasValue && kind === 'digital') change((d) => toggleDigital(d, channelId, column));
        select({ kind: 'cell', channelId, column }, { type: 'cell' });
      },
    });
  };

  const onDotKey = (event: KeyboardEvent, channelId: string, column: Column) => {
    const { doc: current, change, select } = useStore.getState();
    const channel = findChannel(current, channelId);
    if (!channel) return;
    const point = current.points.find((candidate) => candidate.id === column);
    const cell = column === INITIAL ? undefined : channel.cells[column];
    const level =
      column === INITIAL ? channel.initial : (cell?.value ?? (point ? valueAt(current, channel, point.time) : channel.initial));
    const step = valueStep(channel) * (event.shiftKey ? 10 : 1);
    const set = (value: number) =>
      change((d) => setValue(d, channelId, column, clamp(snapTo(value, valueStep(channel)), channel.min, channel.max)));
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) return;
    if (key === 'arrowup') set(level + step);
    else if (key === 'arrowdown') set(level - step);
    else if (key === 'enter' || key === ' ') select({ kind: 'cell', channelId, column }, { type: 'cell' });
    else if ((key === 'delete' || key === 'backspace') && column !== INITIAL) change((d) => clearValue(d, channelId, column));
    else if (key === 's' && column !== INITIAL) change((d) => setMode(d, channelId, column, 'step'));
    else if (key === 'r' && column !== INITIAL) change((d) => setMode(d, channelId, column, 'ramp'));
    else if (!onValueKey?.(event, channelId, column)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Double click in a lane: a transition right there, on a new point if none is near. */
  const onLaneDoubleClick = (event: MouseEvent, row: Row) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { change, select } = useStore.getState();
    const channelId = row.channel.id;
    const near = layout.markers.find((marker) => Math.abs(marker.x - x) <= SNAP_DISTANCE);
    let pointId = near?.pointId ?? '';
    change((current) => {
      let next = current;
      if (!pointId) {
        const added = addPoint(next, timeAtPixel(current, layout, x, event.altKey));
        next = added.doc;
        pointId = added.id;
      }
      if (row.channel.kind === 'digital') return toggleDigital(next, channelId, pointId);
      return putValue(next, channelId, pointId, snapTo(rowValue(row, y), valueStep(row.channel)));
    });
    if (pointId) select({ kind: 'cell', channelId, column: pointId }, { type: 'cell' });
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const row = layout.rows.find((candidate) => y >= candidate.top && y < candidate.top + candidate.height);
    const index = row ? row.index : null;
    if (index !== hoverRow) setHoverRow(index);
  };

  const dots = layout.rows.flatMap((row) => {
    const { channel } = row;
    const color = channelColor(theme, channel.color);
    const showEmpty = hoverRow === row.index || selectedRow === row.index;
    const isSelected = (column: Column) =>
      selection.kind === 'cell' && selection.channelId === channel.id && selection.column === column;
    const items: {
      key: string;
      column: Column;
      kind: DotKind;
      x: number;
      value: number;
      label: string;
    }[] = [
      {
        key: `${channel.id}:${INITIAL}`,
        column: INITIAL,
        kind: 'initial',
        x: layout.x(doc.time.start),
        value: channel.initial,
        label: `${channel.name}, initial value: ${describeValue(channel, channel.initial)}`,
      },
    ];
    for (const marker of layout.markers) {
      const cell = channel.cells[marker.pointId];
      const at = `${channel.name} at ${marker.label} ${doc.time.unit}`.trim();
      if (cell) {
        items.push({
          key: `${channel.id}:${marker.pointId}`,
          column: marker.pointId,
          kind: 'value',
          x: marker.x,
          value: cell.value,
          label: `${at}: ${describeValue(channel, cell.value)}, ${cell.mode}`,
        });
      } else if (showEmpty) {
        items.push({
          key: `${channel.id}:${marker.pointId}`,
          column: marker.pointId,
          kind: 'empty',
          x: marker.x,
          value: valueAt(doc, channel, marker.time),
          label: `${at}: no value`,
        });
      }
    }
    return items.map((item) => (
      <g
        key={item.key}
        className="dot"
        data-kind={item.kind}
        data-channel={channel.id}
        data-column={item.column}
        tabIndex={0}
        role="button"
        aria-label={item.label}
        onPointerDown={(event) => beginDotDrag(event, row, item.column, item.kind !== 'empty', item.value)}
        onKeyDown={(event) => onDotKey(event, channel.id, item.column)}
      >
        <title>{item.label}</title>
        <circle className="dot-hit" cx={item.x} cy={rowY(row, item.value)} r={11} fill="transparent" />
        <Dot cx={item.x} cy={rowY(row, item.value)} kind={item.kind} color={color} theme={theme} selected={isSelected(item.column)} />
      </g>
    ));
  });

  return (
    <svg
      ref={svgRef}
      className="lanes-svg"
      width={layout.width}
      height={layout.lanesHeight}
      viewBox={`0 0 ${layout.width} ${layout.lanesHeight}`}
      role="group"
      aria-label="Channels"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHoverRow(null)}
    >
      <LaneGrid layout={layout} theme={theme} highlightRow={selectedRow} />
      {layout.bands.length > 0 && <GroupBars layout={layout} theme={theme} />}
      {layout.rows.map((row) => (
        <rect
          key={row.channel.id}
          className="lane-hit"
          data-channel={row.channel.id}
          x={0}
          y={row.top}
          width={layout.width}
          height={row.height}
          fill="transparent"
          onClick={() => useStore.getState().select({ kind: 'none' })}
          onDoubleClick={(event) => onLaneDoubleClick(event, row)}
        />
      ))}
      <g pointerEvents="none">
        <GuideLines layout={layout} theme={theme} selectedPointId={selectedPointId} />
      </g>
      {under}
      <g pointerEvents="none">
        {layout.rows.map((row) => (
          <Waveform key={row.channel.id} doc={doc} row={row} layout={layout} theme={theme} />
        ))}
      </g>
      {dots}
      {children}
      {readout && (
        <g pointerEvents="none">
          <rect x={readout.x + 12} y={readout.y - 26} width={readout.text.length * 6.7 + 12} height={19} rx={4} fill={theme.selected} />
          <text x={readout.x + 18} y={readout.y - 12.5} fontFamily={FONT_MONO} fontSize={11} fontWeight={500} fill={theme.onSelected}>
            {readout.text}
          </text>
        </g>
      )}
    </svg>
  );
}
