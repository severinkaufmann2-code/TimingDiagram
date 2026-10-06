/** The small panels for typing exact numbers: one for a value, one for a transition point. */

import { useEffect, type ReactNode, type RefObject } from 'react';
import { findComment, numberedComments } from '../model/comments';
import { commentPlace } from '../model/describe';
import { clearValue, removePoint, setMode, setPointTime, setValue } from '../model/doc';
import { anchorAt } from '../model/moments';
import { formatNumber, niceStep } from '../model/numbers';
import { findPhase, phaseSpan, removePhase, renamePhase, setPhaseEdge } from '../model/phases';
import { INITIAL, type Comment, type Mode } from '../model/types';
import { valueAt } from '../model/waveform';
import { rowY, valueStep, type Layout } from '../render/layout';
import { useStore } from '../state/store';
import { applyCommentText, dropComment, settleComment } from './comments';
import { HEADER_WIDTH } from './constants';
import { NumberField, TextArea, TextField } from './fields';
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

/** Title, exact start and end, and removal for the selected phase. */
export function PhaseEditor({ layout, lanesSvg, stage }: EditorProps & { lanesSvg: RefObject<SVGSVGElement | null> }) {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const panel = useStore((state) => state.panel);
  const change = useStore((state) => state.change);
  const closePanel = useStore((state) => state.closePanel);

  if (panel?.type !== 'phase' || selection.kind !== 'phase') return null;
  const box = layout.phases.find((candidate) => candidate.phase.id === selection.phaseId);
  if (!box) return null;
  const { phase, groupId } = box;
  const span = phaseSpan(doc, phase);
  const step = doc.time.snap > 0 ? doc.time.snap : niceStep((doc.time.end - doc.time.start) / 100);
  const notANumber = (text: string) => useStore.getState().notify(`“${text}” is not a number.`, 'error');

  /** Sets one end to an exact time. Says so when a neighbouring phase or the other end is in the way. */
  const setEdge = (edge: 'start' | 'end', time: number) => {
    const state = useStore.getState();
    const next = setPhaseEdge(state.doc, groupId, phase.id, edge, anchorAt(state.doc, time));
    const moved = findPhase(next, groupId, phase.id);
    const reached = moved ? phaseSpan(next, moved) : span;
    state.change(() => next);
    if (reached.start !== time && reached.end !== time) state.notify('A phase needs a length and cannot reach into another phase.');
  };

  return (
    <Popover
      key={phase.id}
      anchor={() =>
        anchorIn(
          lanesSvg,
          stage,
          { x: box.x + box.width / 2, y: box.y + box.height / 2, halfWidth: Math.min(box.width / 2, 40), halfHeight: box.height / 2 },
          layout.rulerHeight,
        )
      }
      side="bottom"
      arrow
      label={`Phase ${phase.title}`}
      onClose={closePanel}
    >
      <div className="editor">
        <span className="editor-caption">Phase</span>
        <TextField
          className="field editor-title"
          ariaLabel="Title of the phase"
          value={phase.title}
          required
          maxLength={80}
          autoFocus
          onCommit={(title) => change((d) => renamePhase(d, groupId, phase.id, title))}
          onEnter={closePanel}
        />
        <span className="editor-divider" aria-hidden="true" />
        <span className="editor-caption">from</span>
        <NumberField
          className="field field-number editor-edge"
          ariaLabel="Start of the phase"
          value={span.start}
          minDecimals={layout.timeDecimals}
          step={step}
          onCommit={(time) => setEdge('start', time)}
          onInvalid={notANumber}
        />
        <span className="editor-caption">to</span>
        <NumberField
          className="field field-number editor-edge"
          ariaLabel="End of the phase"
          value={span.end}
          minDecimals={layout.timeDecimals}
          step={step}
          onCommit={(time) => setEdge('end', time)}
          onInvalid={notANumber}
        />
        {doc.time.unit && <span className="editor-unit">{doc.time.unit}</span>}
        <span className="editor-divider" aria-hidden="true" />
        <button
          type="button"
          className="text-button"
          title="Delete this phase and the comments on it"
          onClick={() => change((d) => removePhase(d, groupId, phase.id))}
        >
          <TrashIcon /> Delete
        </button>
      </div>
    </Popover>
  );
}

/** The text of the selected comment, at its pin. */
export function CommentEditor({ layout, stage }: EditorProps) {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const panel = useStore((state) => state.panel);

  if (panel?.type !== 'comment' || selection.kind !== 'comment') return null;
  const comment = findComment(doc, selection.commentId);
  if (!comment) return null;
  return (
    <CommentPanel
      key={comment.id}
      comment={comment}
      number={numberedComments(doc).indexOf(comment) + 1}
      place={commentPlace(doc, comment)}
      layout={layout}
      stage={stage}
    />
  );
}

function CommentPanel({ comment, number, place, layout, stage }: EditorProps & { comment: Comment; number: number; place: string }) {
  const id = comment.id;
  const closePanel = useStore((state) => state.closePanel);

  // When the panel goes, for whatever reason, the editing of the comment is over.
  // Asked a moment later: a panel that is only drawn anew is still open then.
  useEffect(
    () => () => {
      queueMicrotask(() => {
        const state = useStore.getState();
        const open = state.panel?.type === 'comment' && state.selection.kind === 'comment' && state.selection.commentId === id;
        if (!open) settleComment(id);
      });
    },
    [id],
  );

  /** The pin in window coordinates, or null while it is scrolled out of sight or folded away. */
  const anchor = (): AnchorRect | null => {
    const frame = stage.current?.getBoundingClientRect();
    const pin = stage.current?.querySelector(`[data-pin="${id}"]`);
    if (!frame || !pin) return null;
    const rect = pin.getBoundingClientRect();
    const drawn = pin.closest('.ruler-svg, .lanes-svg') !== null;
    const inLanes = pin.closest('.lanes-svg') !== null;
    const visible =
      rect.bottom > frame.top &&
      rect.top < frame.bottom &&
      rect.left < frame.right &&
      (!drawn || rect.left >= frame.left + HEADER_WIDTH - 2) &&
      (!inLanes || rect.top >= frame.top + layout.rulerHeight - 2);
    return visible ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
  };

  return (
    <Popover anchor={anchor} side="bottom" arrow label={`Comment ${number}`} onClose={closePanel}>
      <div className="comment-editor">
        <div className="comment-editor-head">
          <span className="pin" data-selected>
            {number}
          </span>
          <span className="comment-editor-where">{place}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Delete this comment"
            title="Delete this comment"
            onClick={() => {
              dropComment(id);
              closePanel();
            }}
          >
            <TrashIcon />
          </button>
        </div>
        <TextArea
          className="field comment-field"
          ariaLabel="Comment"
          value={comment.text}
          autoFocus
          placeholder="What is there to say about this?"
          onCommit={(text) => applyCommentText(id, text)}
          onEnter={closePanel}
        />
        <span className="comment-editor-foot">Enter to finish · Shift + Enter for a new line</span>
      </div>
    </Popover>
  );
}
