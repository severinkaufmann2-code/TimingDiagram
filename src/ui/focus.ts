/**
 * Lets a command ask that the name field of the thing it just created takes
 * the keyboard focus as soon as it appears, so the name can be typed at once.
 */

let wanted: string | null = null;

export function focusWhenShown(id: string): void {
  wanted = id;
}

/** True for the thing whose field was asked to take the focus. */
export function isFocusWanted(id: string): boolean {
  return wanted === id;
}

/** Called by the field once it is on screen. */
export function focusGiven(id: string): void {
  if (wanted === id) wanted = null;
}
