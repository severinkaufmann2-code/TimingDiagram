/**
 * The phases inside the bars of the groups, and what can be done to them
 * there: a click or a drag in the free part of a bar adds one, a click on a
 * phase opens it, a drag at one of its ends moves that end.
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { describeTime } from '../model/describe';
import { anchorTime } from '../model/moments';
import { addPhase, firstGap, fitPhase, gapAround, phaseMoments, phaseSpan, removePhase, stretchPhase } from '../model/phases';
import type { Anchor, Doc } from '../model/types';
import { GROUP_BAR, type Band, type Layout, type PhaseBox } from '../render/layout';
import { PhaseBar } from '../render/parts';
import { FONT_MONO, FONT_SANS, type DiagramTheme } from '../render/theme';
import { useStore } from '../state/store';
import { startDrag } from './drag';
import { momentAtPixel } from './snap';

/** A phase that is not there yet: under the pointer, or being drawn. */
interface Ghost {
  groupId: string;
  from: number;
  to: number;
  /** True while it is being drawn: then it says from when to when it would last. */
  drawing: boolean;
}

interface PhaseLayerProps {
  doc: Doc;
  layout: Layout;
  theme: DiagramTheme;
  selectedPhaseId?: string;
  svgRef: RefObject<SVGSVGElement | null>;
  /** Called with a key that a phase does not use itself. Returns true when it was handled. */
  onPhaseKey?: (event: KeyboardEvent, phaseId: string) => boolean;
}

/** Selects a phase and opens its panel. */
export function openPhase(groupId: string, phaseId: string): void {
  useStore.getState().select({ kind: 'phase', groupId, phaseId }, { type: 'phase' });
}

/** Adds a phase to a group and opens it, ready for its title. Returns false when there is no room for one. */
export function addPhaseNow(groupId: string, from: Anchor, to: Anchor): boolean {
  let id = '';
  useStore.getState().change((doc) => {
    const added = addPhase(doc, groupId, from, to);
    id = added.id;
    return added.doc;
  });
  if (id) openPhase(groupId, id);
  return id !== '';
}

/** Adds a phase where the group has room for one, from the left. Says so when it has none. */
export function addPhaseInFirstGap(groupId: string): void {
  const { doc, notify } = useStore.getState();
  const gap = firstGap(doc, groupId);
  if (!gap || !addPhaseNow(groupId, gap.from, gap.to)) notify('There is no room for another phase in this group.');
}

export function PhaseLayer({ doc, layout, theme, selectedPhaseId, svgRef, onPhaseKey }: PhaseLayerProps) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const drawing = useRef(false);

  const xOf = (event: { clientX: number }) => event.clientX - svgRef.current!.getBoundingClientRect().left;

  const onStripMove = (event: PointerEvent, band: Band) => {
    if (drawing.current) return;
    const gap = gapAround(doc, band.group.id, layout.time(xOf(event)));
    setGhost(gap ? { groupId: band.group.id, from: anchorTime(doc, gap.from), to: anchorTime(doc, gap.to), drawing: false } : null);
  };

  /** Press in the free part of a bar: a click fills the stretch around it, a drag draws the phase. */
  const beginPhase = (event: PointerEvent, band: Band) => {
    const groupId = band.group.id;
    const x0 = xOf(event);
    const origin = momentAtPixel(doc, layout, x0, event.altKey);
    let drawn: { from: Anchor; to: Anchor } | null = null;
    startDrag(event, {
      cursor: 'ew-resize',
      onStart: () => {
        drawing.current = true;
      },
      onMove: (dx, _dy, move) => {
        drawn = fitPhase(doc, groupId, origin, momentAtPixel(doc, layout, x0 + dx, move.altKey));
        setGhost(drawn ? { groupId, from: anchorTime(doc, drawn.from), to: anchorTime(doc, drawn.to), drawing: true } : null);
      },
      onEnd: (dragged) => {
        drawing.current = false;
        setGhost(null);
        const stretch = dragged ? drawn : gapAround(doc, groupId, layout.time(x0));
        if (stretch) addPhaseNow(groupId, stretch.from, stretch.to);
      },
    });
  };

  /** Press on one end of a phase: dragging moves that end, the other one stays. */
  const beginEdge = (event: PointerEvent, box: PhaseBox, edge: 'start' | 'end') => {
    event.stopPropagation();
    const { groupId, phase } = box;
    const moments = phaseMoments(doc, phase);
    const fixed = edge === 'start' ? moments.end : moments.start;
    startDrag(event, {
      cursor: 'ew-resize',
      onStart: () => {
        const store = useStore.getState();
        store.select({ kind: 'phase', groupId, phaseId: phase.id });
        store.beginGesture();
      },
      onMove: (_dx, _dy, move) => {
        const { doc: current, change } = useStore.getState();
        const target = momentAtPixel(current, layout, xOf(move), move.altKey);
        change((d) => stretchPhase(d, groupId, phase.id, fixed, target));
      },
      onEnd: (dragged) => {
        if (dragged) useStore.getState().endGesture();
        else openPhase(groupId, phase.id);
      },
    });
  };

  const beginBody = (event: PointerEvent, box: PhaseBox) => {
    startDrag(event, {
      onMove: () => {},
      onEnd: () => openPhase(box.groupId, box.phase.id),
    });
  };

  const onKey = (event: KeyboardEvent, box: PhaseBox) => {
    if (event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') openPhase(box.groupId, box.phase.id);
    else if (event.key === 'Delete' || event.key === 'Backspace') useStore.getState().change((d) => removePhase(d, box.groupId, box.phase.id));
    else if (!onPhaseKey?.(event, box.phase.id)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const ghostBand = ghost && layout.bands.find((band) => band.group.id === ghost.groupId);
  const ghostLabel = ghost ? `${describeTime(doc, ghost.from).replace(/ .*$/, '')} – ${describeTime(doc, ghost.to)}` : '';
  const labelWidth = ghostLabel.length * 6.7 + 12;
  const labelX = ghost ? Math.max(2, Math.min((layout.x(ghost.from) + layout.x(ghost.to) - labelWidth) / 2, layout.width - labelWidth - 2)) : 0;
  const selected = layout.phases.find((box) => box.phase.id === selectedPhaseId);
  const selectedBand = selected && layout.bands.find((band) => band.group.id === selected.groupId);

  return (
    <g>
      {selected && selectedBand && selectedBand.bottom > selectedBand.top + GROUP_BAR && (
        // how far the selected phase reaches, shown through the lanes of its group
        <rect
          x={selected.x - 1.5}
          y={selectedBand.top + GROUP_BAR + 1}
          width={selected.width + 3}
          height={selectedBand.bottom - selectedBand.top - GROUP_BAR - 1}
          fill={theme.selected}
          fillOpacity={0.045}
          pointerEvents="none"
        />
      )}

      {layout.bands.map((band) => (
        <rect
          key={band.group.id}
          className="phase-lane"
          data-group={band.group.id}
          x={0}
          y={band.top + 1}
          width={layout.width}
          height={GROUP_BAR - 1}
          fill="transparent"
          onPointerMove={(event) => onStripMove(event, band)}
          onPointerLeave={() => {
            if (!drawing.current) setGhost(null);
          }}
          onPointerDown={(event) => beginPhase(event, band)}
        >
          <title>Click or drag to add a phase</title>
        </rect>
      ))}
      {layout.bands
        .filter((band) => band.group.phases.length === 0 && ghost?.groupId !== band.group.id)
        .map((band) => (
          <text
            key={band.group.id}
            x={layout.x(doc.time.start) + 4}
            y={band.top + GROUP_BAR / 2 + 4}
            fontFamily={FONT_SANS}
            fontSize={12}
            fill={theme.textMuted}
            pointerEvents="none"
          >
            Click or drag here to add a phase
          </text>
        ))}

      {ghost && ghostBand && (
        <g className="phase-ghost" pointerEvents="none">
          <rect
            x={layout.x(ghost.from) + 1.5}
            y={ghostBand.top + 7.5}
            width={Math.max(0, layout.x(ghost.to) - layout.x(ghost.from) - 3)}
            height={GROUP_BAR - 15}
            rx={4}
            fill={theme.surface}
            fillOpacity={ghost.drawing ? 1 : 0.6}
            stroke={ghost.drawing ? theme.selected : theme.pillStroke}
            strokeWidth={ghost.drawing ? 1.25 : 1}
            strokeDasharray={ghost.drawing ? '4 3' : '3 2'}
          />
        </g>
      )}

      {layout.phases.map((box) => {
        const span = phaseSpan(doc, box.phase);
        const label = `Phase ${box.phase.title}, ${describeTime(doc, span.start)} to ${describeTime(doc, span.end)}`;
        const isSelected = box.phase.id === selectedPhaseId;
        const edge = Math.min(6, box.width / 3);
        return (
          <g
            key={box.phase.id}
            className="phase"
            data-phase={box.phase.id}
            data-group={box.groupId}
            data-selected={isSelected || undefined}
            tabIndex={0}
            role="button"
            aria-label={label}
            onPointerDown={(event) => beginBody(event, box)}
            onKeyDown={(event) => onKey(event, box)}
          >
            <title>{`${label}. Click to rename or to type exact times, drag an end to move it.`}</title>
            <PhaseBar box={box} theme={theme} selected={isSelected} />
            <rect className="phase-hit" x={box.x} y={box.y} width={box.width} height={box.height} rx={4} fill="transparent" />
            <rect
              className="phase-edge"
              data-edge="start"
              x={box.x - 3}
              y={box.y}
              width={edge + 3}
              height={box.height}
              fill="transparent"
              onPointerDown={(event) => beginEdge(event, box, 'start')}
            />
            <rect
              className="phase-edge"
              data-edge="end"
              x={box.x + box.width - edge}
              y={box.y}
              width={edge + 3}
              height={box.height}
              fill="transparent"
              onPointerDown={(event) => beginEdge(event, box, 'end')}
            />
          </g>
        );
      })}

      {ghost?.drawing && ghostBand && (
        <g pointerEvents="none">
          <rect x={labelX} y={ghostBand.top + GROUP_BAR + 6} width={labelWidth} height={19} rx={4} fill={theme.selected} />
          <text
            x={labelX + 6}
            y={ghostBand.top + GROUP_BAR + 19.5}
            fontFamily={FONT_MONO}
            fontSize={11}
            fontWeight={500}
            fill={theme.onSelected}
          >
            {ghostLabel}
          </text>
        </g>
      )}
    </g>
  );
}
