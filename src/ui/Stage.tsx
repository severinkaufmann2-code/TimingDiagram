/**
 * The diagram itself: the ruler with the transition points on top, the channel
 * names on the left, and the lanes with the waveforms. Ruler and names stay in
 * view while the lanes scroll.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  addPoint,
  clearValue,
  findChannel,
  putValue,
  removePoint,
  setMode,
  setPointTime,
  setValue,
  shiftPointsFrom,
  toggleDigital,
} from '../model/doc';
import { clamp, formatNumber, niceStep, snapTo } from '../model/numbers';
import { INITIAL, type Channel, type Column, type Doc } from '../model/types';
import { valueAt } from '../model/waveform';
import {
  computeLayout,
  formatTime,
  markerWidth,
  rowValue,
  rowY,
  valueStep,
  type Layout,
  type Marker,
  type Row,
} from '../render/layout';
import { Dot, GuideLines, LaneGrid, MarkerPill, RulerScale, Waveform, type DotKind } from '../render/parts';
import { DARK, FONT_MONO, FONT_SANS, LIGHT, channelColor } from '../render/theme';
import { effectiveScale, useStore } from '../state/store';
import { AddChannelRow, ChannelHeader } from './ChannelHeader';
import { HEADER_WIDTH } from './constants';
import { startDrag } from './drag';
import { CellEditor, PointEditor } from './editors';

/** Height of the row under the lanes that holds the "Add channel" button. */
const FOOTER_HEIGHT = 46;

/** The time a pixel position stands for, on the snap grid unless `free`. */
function timeAtPixel(doc: Doc, layout: Layout, x: number, free: boolean): number {
  const grid = doc.time.snap > 0 && !free ? doc.time.snap : niceStep(1 / layout.scale) / 10;
  return clamp(snapTo(layout.time(x), grid), doc.time.start, doc.time.end);
}

function describeValue(channel: Channel, value: number): string {
  return channel.kind === 'analog' && channel.unit ? `${formatNumber(value)} ${channel.unit}` : formatNumber(value);
}

export function Stage() {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const themeName = useStore((state) => state.theme);
  const scale = useStore(effectiveScale);
  const theme = themeName === 'dark' ? DARK : LIGHT;
  const layout = useMemo(() => computeLayout(doc, scale), [doc, scale]);

  const stage = useRef<HTMLDivElement>(null);
  const rulerSvg = useRef<SVGSVGElement>(null);
  const lanesSvg = useRef<SVGSVGElement>(null);
  /** Marker to give keyboard focus back to after the next render (its DOM node may have moved). */
  const refocusPoint = useRef<string | null>(null);

  const [ghostTime, setGhostTime] = useState<number | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => useStore.getState().setViewWidth(element.clientWidth - HEADER_WIDTH - 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const pointId = refocusPoint.current;
    if (!pointId) return;
    refocusPoint.current = null;
    const element = rulerSvg.current?.querySelector<SVGGElement>(`[data-point="${pointId}"]`);
    if (element && document.activeElement !== element) element.focus();
  });

  const selectedPointId =
    selection.kind === 'point' ? selection.pointId : selection.kind === 'cell' && selection.column !== INITIAL ? selection.column : undefined;
  const selectedRow =
    selection.kind === 'cell' ? layout.rows.find((row) => row.channel.id === selection.channelId)?.index : undefined;

  // ───────────── ruler: adding and moving transition points ─────────────

  const rulerTime = (event: MouseEvent | PointerEvent): number => {
    const rect = rulerSvg.current!.getBoundingClientRect();
    return timeAtPixel(doc, layout, event.clientX - rect.left, event.altKey);
  };

  const addPointAt = (time: number) => {
    const { change, select } = useStore.getState();
    let id = '';
    change((current) => {
      const added = addPoint(current, time);
      id = added.id;
      return added.doc;
    });
    if (id) select({ kind: 'point', pointId: id }, { type: 'point' });
    setGhostTime(null);
  };

  const beginMarkerDrag = (event: PointerEvent, marker: Marker) => {
    const store = useStore.getState();
    const pointId = marker.pointId;
    const startTime = marker.time;
    const dragScale = layout.scale;
    store.select({ kind: 'point', pointId });
    setGhostTime(null);
    startDrag(event, {
      cursor: 'ew-resize',
      onStart: () => useStore.getState().beginGesture(),
      onMove: (dx, _dy, move) => {
        const { doc: current, change } = useStore.getState();
        const grid = current.time.snap > 0 && !move.altKey ? current.time.snap : niceStep(1 / dragScale) / 10;
        let time = clamp(snapTo(startTime + dx / dragScale, grid), current.time.start, current.time.end);
        const now = current.points.find((point) => point.id === pointId);
        if (!now) return;
        if (move.shiftKey) {
          // push the later points along, but never past the end of the timeline
          const last = current.points[current.points.length - 1]!;
          time = Math.min(time, now.time + (current.time.end - last.time));
          change((d) => shiftPointsFrom(d, pointId, time - now.time));
        } else {
          change((d) => setPointTime(d, pointId, time));
        }
      },
      onEnd: (dragged) => {
        const { endGesture, select } = useStore.getState();
        if (dragged) endGesture();
        else select({ kind: 'point', pointId }, { type: 'point' });
      },
    });
  };

  const onMarkerKey = (event: KeyboardEvent, pointId: string) => {
    const { doc: current, change, select } = useStore.getState();
    const point = current.points.find((candidate) => candidate.id === pointId);
    if (!point) return;
    const base = current.time.snap > 0 ? current.time.snap : niceStep((current.time.end - current.time.start) / 100);
    const step = base * (event.shiftKey ? 10 : 1);
    const moveTo = (time: number) => {
      refocusPoint.current = pointId;
      change((d) => setPointTime(d, pointId, clamp(time, current.time.start, current.time.end)));
    };
    if (event.key === 'ArrowLeft') moveTo(point.time - step);
    else if (event.key === 'ArrowRight') moveTo(point.time + step);
    else if (event.key === 'Enter' || event.key === ' ') select({ kind: 'point', pointId }, { type: 'point' });
    else if (event.key === 'Delete' || event.key === 'Backspace') change((d) => removePoint(d, pointId));
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  // ───────────── lanes: setting values ─────────────

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
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Double click in a lane: a transition right there, on a new point if none is near. */
  const onLaneDoubleClick = (event: MouseEvent, row: Row) => {
    const rect = lanesSvg.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { change, select } = useStore.getState();
    const channelId = row.channel.id;
    const near = layout.markers.find((marker) => Math.abs(marker.x - x) <= 7);
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

  const onLanesPointerMove = (event: PointerEvent) => {
    const rect = lanesSvg.current!.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const row = layout.rows.find((candidate) => y >= candidate.top && y < candidate.top + candidate.height);
    const index = row ? row.index : null;
    if (index !== hoverRow) setHoverRow(index);
  };

  // ───────────── drawing ─────────────

  const ghost: Marker | null =
    ghostTime === null
      ? null
      : (() => {
          const label = formatTime(ghostTime, layout.timeDecimals);
          return {
            pointId: '',
            index: -1,
            time: ghostTime,
            x: layout.x(ghostTime),
            label,
            width: markerWidth(label),
            top: layout.markers[0]?.top ?? layout.scaleLine + 5.5,
            height: 19,
          };
        })();

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
        <Dot
          cx={item.x}
          cy={rowY(row, item.value)}
          kind={item.kind}
          color={color}
          theme={theme}
          selected={isSelected(item.column)}
        />
      </g>
    ));
  });

  const unit = doc.time.unit.trim();

  return (
    <div className="stage" ref={stage}>
      <div className="stage-grid" style={{ gridTemplateColumns: `${HEADER_WIDTH}px ${layout.width}px` }}>
        <div className="stage-corner" style={{ height: layout.rulerHeight }}>
          <span>{unit ? `Time (${unit})` : 'Time'}</span>
          <span>Transition points</span>
        </div>

        <div className="stage-ruler" style={{ height: layout.rulerHeight }}>
          <svg
            ref={rulerSvg}
            className="ruler-svg"
            width={layout.width}
            height={layout.rulerHeight}
            viewBox={`0 0 ${layout.width} ${layout.rulerHeight}`}
            role="group"
            aria-label="Timeline with transition points"
          >
            <RulerScale layout={layout} theme={theme} />
            <rect
              className="marker-lane"
              x={0}
              y={layout.scaleLine + 0.5}
              width={layout.width}
              height={layout.rulerHeight - layout.scaleLine - 0.5}
              fill="transparent"
              onPointerMove={(event) => setGhostTime(rulerTime(event))}
              onPointerLeave={() => setGhostTime(null)}
              onClick={(event) => addPointAt(rulerTime(event))}
            >
              <title>Click to add a transition point</title>
            </rect>
            {layout.markers.length === 0 && ghost === null && (
              <text
                x={layout.x(doc.time.start) + 4}
                y={layout.scaleLine + 19}
                fontFamily={FONT_SANS}
                fontSize={12}
                fill={theme.textMuted}
                pointerEvents="none"
              >
                Click here to add a transition point
              </text>
            )}
            {ghost && (
              <g pointerEvents="none">
                <MarkerPill marker={ghost} layout={layout} theme={theme} faint />
              </g>
            )}
            {layout.markers.map((marker) => {
              const selected = marker.pointId === selectedPointId;
              const half = Math.max(marker.width / 2, 12);
              const label = `Transition point at ${marker.label} ${unit}`.trim();
              return (
                <g
                  key={marker.pointId}
                  className="marker"
                  data-point={marker.pointId}
                  data-selected={selected || undefined}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  onPointerDown={(event) => beginMarkerDrag(event, marker)}
                  onKeyDown={(event) => onMarkerKey(event, marker.pointId)}
                >
                  <title>{`${label}. Drag to move, click to type the exact time.`}</title>
                  <MarkerPill marker={marker} layout={layout} theme={theme} selected={selected} />
                  <rect
                    className="marker-hit"
                    x={marker.x - half}
                    y={marker.top}
                    width={half * 2}
                    height={layout.rulerHeight - marker.top}
                    rx={4}
                    fill="transparent"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="stage-headers">
          {layout.rows.map((row) => (
            <ChannelHeader
              key={row.channel.id}
              row={row}
              layout={layout}
              color={channelColor(theme, row.channel.color)}
              selected={selectedRow === row.index}
            />
          ))}
          <AddChannelRow height={FOOTER_HEIGHT} />
        </div>

        <div className="stage-lanes">
          <svg
            ref={lanesSvg}
            className="lanes-svg"
            width={layout.width}
            height={layout.lanesHeight}
            viewBox={`0 0 ${layout.width} ${layout.lanesHeight}`}
            role="group"
            aria-label="Channels"
            onPointerMove={onLanesPointerMove}
            onPointerLeave={() => setHoverRow(null)}
          >
            <LaneGrid layout={layout} theme={theme} highlightRow={selectedRow} />
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
              {layout.rows.map((row) => (
                <Waveform key={row.channel.id} doc={doc} row={row} layout={layout} theme={theme} />
              ))}
            </g>
            {dots}
            {readout && (
              <g pointerEvents="none">
                <rect
                  x={readout.x + 12}
                  y={readout.y - 26}
                  width={readout.text.length * 6.7 + 12}
                  height={19}
                  rx={4}
                  fill={theme.selected}
                />
                <text
                  x={readout.x + 18}
                  y={readout.y - 12.5}
                  fontFamily={FONT_MONO}
                  fontSize={11}
                  fontWeight={500}
                  fill={theme.onSelected}
                >
                  {readout.text}
                </text>
              </g>
            )}
          </svg>
          <div className="lanes-footer" style={{ height: FOOTER_HEIGHT }}>
            {layout.rows.length === 0 && <span>No channels yet. Add one to start drawing.</span>}
          </div>
        </div>
      </div>

      <CellEditor layout={layout} lanesSvg={lanesSvg} stage={stage} />
      <PointEditor layout={layout} rulerSvg={rulerSvg} stage={stage} />
    </div>
  );
}
