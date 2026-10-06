/** The pins of the comments as things to click, drag and reach with the keyboard. */

import type { KeyboardEvent, PointerEvent } from 'react';
import type { Comment } from '../model/types';
import { pinWidth, type PinPlace } from '../render/layout';
import { PlacedPin } from '../render/parts';
import type { DiagramTheme } from '../render/theme';

export interface PinHandlers {
  onPinDown: (event: PointerEvent, comment: Comment) => void;
  onPinKey: (event: KeyboardEvent, comment: Comment) => void;
}

/** What a pin says to a screen reader and in its tooltip. */
function pinLabel(number: number, comment: Comment): string {
  const text = comment.text.trim();
  return text ? `Comment ${number}: ${text}` : `Comment ${number}`;
}

interface PinLayerProps extends PinHandlers {
  pins: readonly PinPlace[];
  theme: DiagramTheme;
  selectedId?: string;
  /** A pin that is not there yet: where a comment would land. */
  ghost?: PinPlace | null;
}

/** Pins inside one of the drawings: the ruler or the lanes. */
export function PinLayer({ pins, theme, selectedId, ghost, onPinDown, onPinKey }: PinLayerProps) {
  return (
    <g>
      {pins.map((pin) => {
        const label = pinLabel(pin.number, pin.comment);
        const width = pinWidth(pin.number);
        return (
          <g
            key={pin.comment.id}
            className="pin-mark"
            data-pin={pin.comment.id}
            data-selected={pin.comment.id === selectedId || undefined}
            tabIndex={0}
            role="button"
            aria-label={label}
            onPointerDown={(event) => onPinDown(event, pin.comment)}
            onKeyDown={(event) => onPinKey(event, pin.comment)}
          >
            <title>{label}</title>
            <PlacedPin pin={pin} theme={theme} selected={pin.comment.id === selectedId} />
            <rect className="pin-hit" x={pin.cx - width / 2 - 3} y={pin.cy - 10} width={width + 6} height={20} rx={10} fill="transparent" />
          </g>
        );
      })}
      {ghost && (
        <g className="pin-ghost" pointerEvents="none">
          <PlacedPin pin={ghost} theme={theme} faint />
        </g>
      )}
    </g>
  );
}

interface NamePinsProps extends PinHandlers {
  /** The comments in the order of their numbers. */
  numbered: readonly Comment[];
  /** Which of them belong next to this name. */
  match: (comment: Comment) => boolean;
  selectedId?: string;
}

/** Pins next to a name: comments on a whole channel, a group or the diagram. */
export function NamePins({ numbered, match, selectedId, onPinDown, onPinKey }: NamePinsProps) {
  return (
    <>
      {numbered.map((comment, index) => {
        if (!match(comment)) return null;
        const label = pinLabel(index + 1, comment);
        return (
          <button
            key={comment.id}
            type="button"
            className="pin"
            data-pin={comment.id}
            data-selected={comment.id === selectedId || undefined}
            aria-label={label}
            title={label}
            onPointerDown={(event) => onPinDown(event, comment)}
            onKeyDown={(event) => onPinKey(event, comment)}
          >
            {index + 1}
          </button>
        );
      })}
    </>
  );
}
