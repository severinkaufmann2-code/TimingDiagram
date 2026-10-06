/** The ruler: the time scale, and under it the lane with the transition points. */

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { addPoint, removePoint, setPointTime, shiftPointsFrom } from '../model/doc';
import { clamp, niceStep, snapTo } from '../model/numbers';
import type { Doc } from '../model/types';
import { formatTime, markerWidth, type Layout, type Marker } from '../render/layout';
import { MarkerPill, RulerScale } from '../render/parts';
import { FONT_SANS, type DiagramTheme } from '../render/theme';
import { useStore } from '../state/store';
import { startDrag } from './drag';
import { timeAtPixel } from './snap';

interface RulerProps {
  doc: Doc;
  layout: Layout;
  theme: DiagramTheme;
  selectedPointId?: string;
  svgRef: RefObject<SVGSVGElement | null>;
  /** Called with a key that a transition point does not use itself. Returns true when it was handled. */
  onPointKey?: (event: KeyboardEvent, pointId: string) => boolean;
  /** Drawn on top of the transition points, e.g. the pins of comments. */
  children?: ReactNode;
}

export function Ruler({ doc, layout, theme, selectedPointId, svgRef, onPointKey, children }: RulerProps) {
  /** Marker to give keyboard focus back to after the next render (its DOM node may have moved). */
  const refocusPoint = useRef<string | null>(null);
  const [ghostTime, setGhostTime] = useState<number | null>(null);

  useLayoutEffect(() => {
    const pointId = refocusPoint.current;
    if (!pointId) return;
    refocusPoint.current = null;
    const element = svgRef.current?.querySelector<SVGGElement>(`[data-point="${pointId}"]`);
    if (element && document.activeElement !== element) element.focus();
  });

  const rulerTime = (event: MouseEvent | PointerEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect();
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
    else if (!onPointKey?.(event, pointId)) return;
    event.preventDefault();
    event.stopPropagation();
  };

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

  const unit = doc.time.unit.trim();

  return (
    <svg
      ref={svgRef}
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
      {children}
    </svg>
  );
}
