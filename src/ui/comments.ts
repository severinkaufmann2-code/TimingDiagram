/** Commands for comments that are reachable from more than one place: the diagram, the keyboard and the Comments tab. */

import { addComment, findComment, phaseOwner, removeComment, setCommentText } from '../model/comments';
import { findChannel } from '../model/doc';
import type { CommentTarget, Doc } from '../model/types';
import { useStore } from '../state/store';
import { focusWhenShown } from './focus';

/** Selects a comment and opens its panel at its pin. */
export function openComment(commentId: string): void {
  useStore.getState().select({ kind: 'comment', commentId }, { type: 'comment' });
}

/** The group whose lanes or bar a comment sits in, if any. */
function groupOf(doc: Doc, on: CommentTarget): string | null {
  switch (on.kind) {
    case 'diagram':
      return null;
    case 'group':
      return on.group;
    case 'phase':
      return phaseOwner(doc, on.phase)?.group.id ?? null;
    case 'channel':
      return findChannel(doc, on.channel)?.group ?? null;
  }
}

/** Unfolds the group of a comment whose pin would otherwise be hidden with the lanes. */
function show(doc: Doc, on: CommentTarget): void {
  const group = on.kind === 'channel' ? groupOf(doc, on) : null;
  if (group !== null) useStore.getState().setFolded(group, false);
}

/**
 * Adds a comment without text. What follows, typing the text, belongs to the
 * same undo step, which {@link settleComment} closes.
 */
function addEmpty(on: CommentTarget): string {
  const store = useStore.getState();
  store.setPlacing(false);
  store.endGesture();
  store.beginGesture();
  let id = '';
  store.change((doc) => {
    const added = addComment(doc, on);
    id = added.id;
    return added.doc;
  });
  if (!id) store.endGesture();
  return id;
}

/** Adds a comment at a place of the diagram and opens it there, ready for its text. */
export function placeComment(on: CommentTarget): void {
  const id = addEmpty(on);
  if (!id) return;
  show(useStore.getState().doc, on);
  openComment(id);
}

/** Adds a comment on the whole diagram and puts the cursor into its row of the Comments tab. */
export function addGeneralComment(): void {
  const id = addEmpty({ kind: 'diagram' });
  if (!id) return;
  focusWhenShown(id);
  const store = useStore.getState();
  store.setTab('comments');
  store.select({ kind: 'comment', commentId: id });
}

/** Removes a comment. One that was only just added goes without leaving an undo step. */
export function dropComment(commentId: string): void {
  const store = useStore.getState();
  if (store.gestureBase && !findComment(store.gestureBase, commentId)) store.cancelGesture();
  else store.change((doc) => removeComment(doc, commentId));
  useStore.getState().endGesture();
}

/**
 * Called when the editing of a comment ends. A comment left without text is
 * removed, the way an emptied cell removes its value. Closes the undo step
 * that began when the comment was added.
 */
export function settleComment(commentId: string): void {
  const comment = findComment(useStore.getState().doc, commentId);
  if (comment && comment.text.trim() === '') dropComment(commentId);
  else useStore.getState().endGesture();
}

/** Applies the text typed for a comment. Emptying it removes the comment, the way an emptied cell removes its value. */
export function applyCommentText(commentId: string, text: string): void {
  if (text.trim() === '') dropComment(commentId);
  else useStore.getState().change((doc) => setCommentText(doc, commentId, text.trim()));
}

/** Selects a comment and brings its pin into view, unfolding its group if needed. */
export function revealComment(commentId: string): void {
  const store = useStore.getState();
  const comment = findComment(store.doc, commentId);
  if (!comment) return;
  show(store.doc, comment.on);
  store.select({ kind: 'comment', commentId });
  // after the diagram has been drawn with the pin
  requestAnimationFrame(() => {
    document.querySelector(`.stage [data-pin="${commentId}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
  });
}
