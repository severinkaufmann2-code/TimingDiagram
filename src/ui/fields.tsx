/**
 * Text and number inputs that apply what was typed when the field is left or
 * Enter is pressed, and put the old value back on Escape. One edit is one undo step.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { clean, formatNumber, parseNumber } from '../model/numbers';

interface CommonProps {
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  title?: string;
  /** Extra attributes that let other code find the field, e.g. for arrow key navigation. */
  data?: Record<string, string | number>;
  onFocus?: () => void;
  /** Runs after Enter has applied the value. */
  onEnter?: () => void;
  /** Keys the field does not use itself. Return true when the key was handled. */
  onKey?: (event: KeyboardEvent<HTMLInputElement>) => boolean;
}

function dataAttributes(data: Record<string, string | number> | undefined): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data ?? {})) attributes[`data-${key}`] = value;
  return attributes;
}

interface TextFieldProps extends CommonProps {
  value: string;
  onCommit: (value: string) => void;
  /** When the field is left empty, the old value comes back. */
  required?: boolean;
  maxLength?: number;
}

export function TextField({
  value,
  onCommit,
  required = false,
  maxLength = 200,
  ariaLabel,
  className,
  autoFocus,
  placeholder,
  title,
  data,
  onFocus,
  onEnter,
  onKey,
}: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      input.current?.focus();
      input.current?.select();
    }
    // only when the field appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === value || (required && next === '')) return;
    onCommit(next);
  };

  return (
    <input
      ref={input}
      type="text"
      className={className}
      aria-label={ariaLabel}
      title={title}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      autoComplete="off"
      value={draft ?? value}
      {...dataAttributes(data)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => onFocus?.()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          onEnter?.();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          if (draft !== null) {
            setDraft(null);
            event.stopPropagation();
          }
        } else if (onKey?.(event)) {
          event.preventDefault();
        }
      }}
    />
  );
}

interface NumberFieldProps extends CommonProps {
  /** null shows an empty field. */
  value: number | null;
  onCommit: (value: number) => void;
  /** Called when the field is emptied. Without it, an emptied field falls back to its old value. */
  onClear?: () => void;
  /** Called when the text cannot be read as a number. */
  onInvalid?: (text: string) => void;
  /** Decimals to show at least. */
  minDecimals?: number;
  /** Arrow up / down change the value by this much. */
  step?: number;
}

export function NumberField({
  value,
  onCommit,
  onClear,
  onInvalid,
  minDecimals = 0,
  step,
  ariaLabel,
  className,
  autoFocus,
  placeholder,
  title,
  data,
  onFocus,
  onEnter,
  onKey,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = value === null ? '' : formatNumber(value, minDecimals);

  useEffect(() => {
    if (autoFocus) {
      input.current?.focus();
      input.current?.select();
    }
    // only when the field appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Applies the typed text. Returns false when it was not a number. */
  const commit = (): boolean => {
    if (draft === null) return true;
    const typed = draft.trim();
    setDraft(null);
    if (typed === '') {
      if (value !== null) onClear?.();
      return true;
    }
    const parsed = parseNumber(typed);
    if (parsed === null) {
      setInvalid(true);
      window.setTimeout(() => setInvalid(false), 900);
      onInvalid?.(typed);
      return false;
    }
    if (parsed !== value) onCommit(parsed);
    return true;
  };

  return (
    <input
      ref={input}
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      title={title}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      value={draft ?? shown}
      {...dataAttributes(data)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        event.currentTarget.select();
        onFocus?.();
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          if (commit()) onEnter?.();
          event.currentTarget.select();
        } else if (event.key === 'Escape') {
          if (draft !== null) {
            setDraft(null);
            event.stopPropagation();
          }
        } else if (step && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !onKey) {
          event.preventDefault();
          const base = (draft === null ? value : parseNumber(draft)) ?? 0;
          const factor = event.shiftKey ? 10 : 1;
          setDraft(null);
          onCommit(clean(base + (event.key === 'ArrowUp' ? step : -step) * factor));
        } else if (onKey?.(event)) {
          event.preventDefault();
        }
      }}
    />
  );
}
