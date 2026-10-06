/**
 * Text and number inputs that apply what was typed when the field is left or
 * Enter is pressed, and put the old value back on Escape. One edit is one undo step.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { clean, formatNumber, parseNumber } from '../model/numbers';

/**
 * What was typed into a field but is not applied yet.
 *
 * Besides the state that draws the field, a reference always holds the
 * unapplied text. Two things need that. Enter applies the text and then
 * leaves the field, which asks to apply it once more before the field has
 * been drawn again. And a panel that is closed by a click elsewhere is taken
 * away before its field hears that it lost the focus: `applyOnRemoval` then
 * gets what was typed, so nothing typed is lost.
 */
function useDraft(applyOnRemoval: (typed: string) => void) {
  const [draft, setDraftState] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    pending.current = next;
    setDraftState(next);
  };
  /** Hands out the unapplied text and forgets it. Null when there is none. */
  const take = (): string | null => {
    const typed = pending.current;
    if (typed !== null) setDraft(null);
    return typed;
  };

  const apply = useRef(applyOnRemoval);
  apply.current = applyOnRemoval;
  useEffect(
    () => () => {
      const typed = pending.current;
      pending.current = null;
      if (typed !== null) apply.current(typed);
    },
    [],
  );

  return { draft, setDraft, take };
}

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
  const apply = (typed: string) => {
    const next = typed.trim();
    if (next === value || (required && next === '')) return;
    onCommit(next);
  };
  const { draft, setDraft, take } = useDraft(apply);
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
    const typed = take();
    if (typed !== null) apply(typed);
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
  /** Applies a typed text. Returns false when it was not a number. */
  const apply = (text: string): boolean => {
    const typed = text.trim();
    if (typed === '') {
      if (value !== null) onClear?.();
      return true;
    }
    const parsed = parseNumber(typed);
    if (parsed === null) {
      onInvalid?.(typed);
      return false;
    }
    if (parsed !== value) onCommit(parsed);
    return true;
  };
  const { draft, setDraft, take } = useDraft(apply);
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
    const typed = take();
    if (typed === null || apply(typed)) return true;
    setInvalid(true);
    window.setTimeout(() => setInvalid(false), 900);
    return false;
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

interface TextAreaProps {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Runs after Enter has applied the text. */
  onEnter?: () => void;
  /** Runs when the field is left, whether or not something was applied. */
  onLeave?: () => void;
}

/**
 * A text field for more than one line. It grows with its text. Enter applies
 * the text, Shift + Enter starts a new line, Escape puts the old text back.
 */
export function TextArea({ value, onCommit, ariaLabel, className, autoFocus, placeholder, maxLength = 2000, onEnter, onLeave }: TextAreaProps) {
  const apply = (typed: string) => {
    const next = typed.trim();
    if (next !== value) onCommit(next);
  };
  const { draft, setDraft, take } = useDraft(apply);
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = draft ?? value;

  useEffect(() => {
    if (autoFocus) {
      area.current?.focus();
      area.current?.select();
    }
    // only when the field appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // as tall as the text, up to a limit; then it scrolls
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight + 2, 190)}px`;
  }, [shown]);

  const commit = () => {
    const typed = take();
    if (typed !== null) apply(typed);
  };

  return (
    <textarea
      ref={area}
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      spellCheck={false}
      value={shown}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        commit();
        onLeave?.();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
          onEnter?.();
          event.currentTarget.blur();
        } else if (event.key === 'Escape' && draft !== null) {
          setDraft(null);
          event.stopPropagation();
        }
      }}
    />
  );
}
