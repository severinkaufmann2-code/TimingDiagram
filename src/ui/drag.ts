/** Pointer dragging that tells a drag from a plain click. */

import type { PointerEvent as ReactPointerEvent } from 'react';

interface DragHandlers {
  /** Called once, when the pointer has travelled far enough to count as a drag. */
  onStart?: () => void;
  /** Called on every movement of a drag, with the distance from where it began. */
  onMove: (dx: number, dy: number, event: PointerEvent) => void;
  /** Called when the pointer is released. `dragged` is false for a plain click. */
  onEnd: (dragged: boolean, event: PointerEvent) => void;
  /** CSS cursor to show everywhere while dragging. */
  cursor?: string;
}

const THRESHOLD = 3;

export function startDrag(down: ReactPointerEvent, handlers: DragHandlers): void {
  if (down.button !== 0) return;
  const startX = down.clientX;
  const startY = down.clientY;
  const pointerId = down.pointerId;
  let dragged = false;

  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragged) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      dragged = true;
      document.body.classList.add('dragging');
      if (handlers.cursor) document.body.style.cursor = handlers.cursor;
      handlers.onStart?.();
    }
    handlers.onMove(dx, dy, event);
  };

  const finish = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    document.body.classList.remove('dragging');
    document.body.style.cursor = '';
    handlers.onEnd(dragged, event);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
