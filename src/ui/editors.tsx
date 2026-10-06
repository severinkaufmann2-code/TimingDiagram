/** The small panels for typing exact numbers: one for a value, one for a transition point. */

import type { ReactNode, RefObject } from 'react';
import { clearValue, removePoint, setMode, setPointTime, setValue } from '../model/doc';
import { formatNumber, niceStep } from '../model/numbers';
import { INITIAL, type Mode } from '../model/types';
import { valueAt } from '../model/waveform';
import { rowY, valueStep, type Layout } from '../render/layout';
import { useStore } from '../state/store';
import { HEADER_WIDTH } from './constants';
import { NumberField } from './fields';
import { CloseIcon, RampIcon, StepIcon, TrashIcon } from './icons';
import { Popover, type AnchorRect } from './Popover';


interface SegmentedProps<T extends string | number> {
  label: string;
  value: T | null;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string | number>({ label, value, options, disabled, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const MODE_OPTIONS: readonly { value: Mode; label: ReactNode; title: string }[] = [
  {
    value: 'step',
    label: (
      <>
        <StepIcon /> Step
      </>
    ),
    title: 'Keep the previous value up to this point, then jump',
  },
  {
    value: 'ramp',
    label: (
      <>
        <RampIcon /> Ramp
      </>
    ),
    title: 'Change gradually from the previous point to this one',
  },
];

/**
 * Turns a position inside one of the diagram's drawings into window
 * coordinates. Returns null when that spot is scrolled out of sight, so a
 * panel never points at something hidden.
 */
function anchorIn(
  svg: RefObject<SVGSVGElement | null>,
  stage: RefObject<HTMLDivElement | null>,
  box: { x: number; y: number; halfWidth: number; halfHeight: number },
  clipTop: number,
): AnchorRect | null {
  const svgRect = svg.current?.getBoundingClientRect();
  const stageRect = stage.current?.getBoundingClientRect();
  if (!svgRect || !stageRect) return null;
  const x = svgRect.left + box.x;
  const y = svgRect.top + box.y;
  const visible =
    x >= stageRect.left + HEADER_WIDTH - 2 && x <= stageRect.right && y >= stageRect.top + clipTop - 2 && y <= stageRect.bottom;
  if (!visible) return null;
  return { left: x - box.halfWidth, right: x + box.halfWidth, top: y - box.halfHeight, bottom: y + box.halfHeight };
}

interface EditorProps {
  layout: Layout;
  stage: RefObject<HTMLDivElement | null>;
}

/** Value, transition and removal for the selected crossing of a channel and a point. */
export function CellEditor({ layout, lanesSvg, stage }: EditorProps & { lanesSvg: RefObject<SVGSVGElement | null> }) {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const panel = useStore((state) => state.panel);
  const change = useStore((state) => state.change);
  const closePanel = useStore((state) => state.closePanel);

  if (panel?.type !== 'cell' || selection.kind !== 'cell') return null;
  const row = layout.rows.find((candidate) => candidate.channel.id === selection.channelId);
  if (!row) return null;
  const { channel } = row;
  const column = selection.column;
  const isInitial = column === INITIAL;
  const marker = isInitial ? undefined : layout.markers.find((candidate) => candidate.pointId === column);
  if (!isInitial && !marker) return null;

  const cell = isInitial ? undefined : channel.cells[column];
  const level = isInitial ? channel.initial : (cell?.value ?? valueAt(doc, channel, marker!.time));
  const x = isInitial ? layout.x(doc.time.start) : marker!.x;
  const y = rowY(row, level);
  const hasValue = isInitial || cell !== undefined;
  const where = isInitial ? 'initial value' : `at ${marker!.label} ${doc.time.unit}`.trim();

  return (
    <Popover
      key={`${channel.id}:${column}`}
      anchor={() => anchorIn(lanesSvg, stage, { x, y, halfWidth: 10, halfHeight: 10 }, layout.rulerHeight)}
      side="top"
      arrow
      label={`${channel.name}, ${where}`}
      onClose={closePanel}
    >
      <div className="editor">
        <span className="editor-caption">{isInitial ? 'Initial value' : 'Value'}</span>
        {channel.kind === 'digital' ? (
          <Segmented
            label="Value"
            value={hasValue ? level : null}
            options={[
              { value: 0, label: '0' },
              { value: 1, label: '1' },
            ]}
            onChange={(value) => change((d) => setValue(d, channel.id, column, value))}
          />
        ) : (
          <>
            <NumberField
              className="field field-number editor-value"
              ariaLabel={`Value of ${channel.name}, ${where}`}
              value={hasValue ? level : null}
              placeholder={formatNumber(level)}
              step={valueStep(channel)}
              autoFocus
              onCommit={(value) => change((d) => setValue(d, channel.id, column, value))}
              onClear={isInitial ? undefined : () => change((d) => clearValue(d, channel.id, column))}
              onInvalid={(text) => useStore.getState().notify(`“${text}” is not a number.`, 'error')}
              onEnter={closePanel}
            />
            {channel.unit && <span className="editor-unit">{channel.unit}</span>}
          </>
        )}
        {!isInitial && (
          <>
            <span className="editor-divider" aria-hidden="true" />
            <Segmented
              label="Transition from the previous point"
              value={cell?.mode ?? null}
              options={MODE_OPTIONS}
              disabled={!cell}
              onChange={(mode) => change((d) => setMode(d, channel.id, column, mode))}
            />
            <span className="editor-divider" aria-hidden="true" />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove this value"
              title="Remove this value: the channel does not change at this point"
              disabled={!cell}
              onClick={() => {
                change((d) => clearValue(d, channel.id, column));
                closePanel();
              }}
            >
              <CloseIcon />
            </button>
          </>
        )}
      </div>
    </Popover>
  );
}

/** Exact time and removal for the selected transition point. */
export function PointEditor({ layout, rulerSvg, stage }: EditorProps & { rulerSvg: RefObject<SVGSVGElement | null> }) {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const panel = useStore((state) => state.panel);
  const change = useStore((state) => state.change);
  const closePanel = useStore((state) => state.closePanel);

  if (panel?.type !== 'point' || selection.kind !== 'point') return null;
  const marker = layout.markers.find((candidate) => candidate.pointId === selection.pointId);
  if (!marker) return null;
  const pointId = marker.pointId;
  const step = doc.time.snap > 0 ? doc.time.snap : niceStep((doc.time.end - doc.time.start) / 100);

  return (
    <Popover
      key={pointId}
      anchor={() =>
        anchorIn(
          rulerSvg,
          stage,
          { x: marker.x, y: marker.top + marker.height / 2, halfWidth: marker.width / 2, halfHeight: marker.height / 2 },
          0,
        )
      }
      side="bottom"
      arrow
      label="Transition point"
      onClose={closePanel}
    >
      <div className="editor">
        <span className="editor-caption">Time</span>
        <NumberField
          className="field field-number editor-value editor-time"
          ariaLabel="Exact time of this transition point"
          value={marker.time}
          minDecimals={layout.timeDecimals}
          step={step}
          autoFocus
          onCommit={(time) => change((d) => setPointTime(d, pointId, time))}
          onInvalid={(text) => useStore.getState().notify(`“${text}” is not a number.`, 'error')}
          onEnter={closePanel}
        />
        {doc.time.unit && <span className="editor-unit">{doc.time.unit}</span>}
        <span className="editor-divider" aria-hidden="true" />
        <button
          type="button"
          className="text-button"
          title="Delete this transition point and the values on it"
          onClick={() => change((d) => removePoint(d, pointId))}
        >
          <TrashIcon /> Delete
        </button>
      </div>
    </Popover>
  );
}
