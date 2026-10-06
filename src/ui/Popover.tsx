/**
 * A small floating panel that points at something on the page. It is rendered
 * above everything else and keeps itself inside the window.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PopoverProps {
  /** Where the panel points, in window coordinates. Called again whenever the page scrolls or resizes. */
  anchor: () => AnchorRect | null;
  /** Preferred side of the anchor. The panel flips when there is no room. */
  side?: 'top' | 'bottom';
  /** Horizontal alignment relative to the anchor. */
  align?: 'center' | 'start' | 'end';
  /** Draws a small pointer towards the anchor. */
  arrow?: boolean;
  /** The element that opens the panel; clicks on it are left to its own handler. */
  trigger?: RefObject<Element | null>;
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

const MARGIN = 8;
const GAP = 10;

export function Popover({
  anchor,
  side = 'bottom',
  align = 'center',
  arrow = false,
  trigger,
  label,
  className = '',
  onClose,
  children,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = () => {
    const element = panel.current;
    const rect = anchorRef.current();
    if (!element) return;
    if (!rect) {
      element.style.visibility = 'hidden';
      return;
    }
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = document.documentElement.clientHeight;
    const gap = arrow ? GAP : 6;

    const roomAbove = rect.top - gap - height >= MARGIN;
    const roomBelow = rect.bottom + gap + height <= viewHeight - MARGIN;
    const placed = side === 'top' ? (roomAbove || !roomBelow ? 'top' : 'bottom') : roomBelow || !roomAbove ? 'bottom' : 'top';

    const centre = (rect.left + rect.right) / 2;
    let left = align === 'start' ? rect.left : align === 'end' ? rect.right - width : centre - width / 2;
    left = Math.max(MARGIN, Math.min(left, viewWidth - width - MARGIN));
    let top = placed === 'top' ? rect.top - gap - height : rect.bottom + gap;
    top = Math.max(MARGIN, Math.min(top, viewHeight - height - MARGIN));

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.visibility = 'visible';
    element.dataset.side = placed;
    element.style.setProperty('--arrow-x', `${Math.round(Math.max(14, Math.min(centre - left, width - 14)))}px`);
  };

  // after every render: the content or the anchor may have changed
  useLayoutEffect(place);

  useEffect(() => {
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // `place` only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panel.current?.contains(target)) return;
      if (trigger?.current?.contains(target)) return;
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRef.current();
      const element = trigger?.current;
      if (element instanceof HTMLElement) element.focus();
    };
    // Escape is handled while bubbling, so a field inside the panel can first
    // use it to discard what was typed
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [trigger]);

  return createPortal(
    <div
      ref={panel}
      className={`popover ${arrow ? 'popover-arrow' : ''} ${className}`}
      role="dialog"
      aria-label={label}
      style={{ visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}
