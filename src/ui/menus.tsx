/** Buttons that open a small menu or panel below themselves. */

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { Popover } from './Popover';

interface MenuButtonProps {
  /** Identifies the menu; only one menu is open at a time. */
  name: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  align?: 'start' | 'end' | 'center';
  /** What the button shows. */
  children: ReactNode;
  /** What the opened panel shows. Rendered only while open. */
  menu: () => ReactNode;
  /** 'menu' is a list of commands, 'panel' holds form fields. */
  kind?: 'menu' | 'panel';
}

/** Moves the keyboard focus between the commands of a menu with the arrow keys. */
function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = 0;
  if (event.key === 'ArrowDown') next = (current + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
  else if (event.key === 'End') next = items.length - 1;
  items[next]!.focus();
  event.preventDefault();
}

export function MenuButton({ name, className, ariaLabel, title, align = 'start', children, menu, kind = 'menu' }: MenuButtonProps) {
  const open = useStore((state) => state.panel?.type === 'menu' && state.panel.name === name);
  const trigger = useRef<HTMLButtonElement>(null);
  const { openPanel, closePanel } = useStore.getState();

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup={kind === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        onClick={() => (open ? closePanel() : openPanel({ type: 'menu', name }))}
      >
        {children}
      </button>
      {open && (
        <Popover
          anchor={() => trigger.current?.getBoundingClientRect() ?? null}
          trigger={trigger}
          side="bottom"
          align={align}
          label={ariaLabel ?? title ?? name}
          onClose={closePanel}
        >
          {kind === 'menu' ? (
            <div className="menu" role="menu" onKeyDown={onMenuKey}>
              {menu()}
            </div>
          ) : (
            menu()
          )}
        </Popover>
      )}
    </>
  );
}

interface MenuItemProps {
  /** Short text in a small box on the left, e.g. a file type. */
  badge?: ReactNode;
  icon?: ReactNode;
  title: string;
  description?: string;
  shortcut?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSelect: () => void;
}

export function MenuItem({ badge, icon, title, description, shortcut, disabled, autoFocus, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={() => {
        useStore.getState().closePanel();
        onSelect();
      }}
    >
      {badge !== undefined && (
        <span className="menu-badge" aria-hidden="true">
          {badge}
        </span>
      )}
      {icon !== undefined && (
        <span className="menu-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="menu-text">
        <span className="menu-title">{title}</span>
        {description && <span className="menu-description">{description}</span>}
      </span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <span className="menu-divider" role="separator" />;
}
