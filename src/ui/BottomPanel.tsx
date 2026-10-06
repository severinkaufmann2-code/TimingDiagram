/** The panel under the diagram, with two tabs: the values as a table, and the comments as a list. */

import { useEffect, useRef } from 'react';
import { numberedComments } from '../model/comments';
import { commentPlace } from '../model/describe';
import type { Comment } from '../model/types';
import { useStore, type Tab } from '../state/store';
import { addGeneralComment, applyCommentText, dropComment, revealComment, settleComment } from './comments';
import { TextArea } from './fields';
import { focusGiven, isFocusWanted } from './focus';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon } from './icons';
import { ValuesTable } from './ValuesTable';

const HINTS: Record<Tab, string> = {
  values: 'One column per transition point. An empty cell keeps the previous value.',
  comments: 'Numbered like the pins in the diagram. Click a number to find its pin.',
};

function CommentRow({ comment, number, place, selected }: { comment: Comment; number: number; place: string; selected: boolean }) {
  const id = comment.id;
  const focus = useRef(isFocusWanted(id)).current;

  useEffect(() => {
    if (focus) focusGiven(id);
  }, [focus, id]);

  return (
    <li className="comment-row" data-comment={id} data-selected={selected || undefined}>
      <button
        type="button"
        className="comment-pin"
        aria-label={`Show comment ${number} in the diagram`}
        title="Show its pin in the diagram"
        onClick={() => revealComment(id)}
      >
        <span className="pin" data-selected={selected || undefined}>
          {number}
        </span>
      </button>
      <button type="button" className="comment-where" title="Show its pin in the diagram" onClick={() => revealComment(id)}>
        {place}
      </button>
      <TextArea
        className="field comment-text"
        ariaLabel={`Text of comment ${number}`}
        value={comment.text}
        autoFocus={focus}
        placeholder="What is there to say about this?"
        onCommit={(text) => applyCommentText(id, text)}
        onLeave={() => settleComment(id)}
      />
      <button
        type="button"
        className="icon-button small comment-remove"
        aria-label={`Delete comment ${number}`}
        title="Delete this comment"
        onClick={() => dropComment(id)}
      >
        <CloseIcon />
      </button>
    </li>
  );
}

function CommentList() {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const numbered = numberedComments(doc);

  return (
    <div className="values-scroll">
      {numbered.length === 0 ? (
        <p className="comments-empty">
          No comments yet. Pick up a pin with <b>Comment</b> in the toolbar (or the <kbd>C</kbd> key) and click where it belongs.
        </p>
      ) : (
        <ol className="comments">
          {numbered.map((comment, index) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              number={index + 1}
              place={commentPlace(doc, comment)}
              selected={selection.kind === 'comment' && selection.commentId === comment.id}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export function BottomPanel() {
  const open = useStore((state) => state.tableOpen);
  const tab = useStore((state) => state.tab);
  const count = useStore((state) => state.doc.comments.length);
  const { setTab, setTableOpen } = useStore.getState();

  return (
    <section className="values" aria-label={tab === 'values' ? 'Values' : 'Comments'}>
      <div className="values-head">
        <button
          type="button"
          className="values-toggle"
          aria-expanded={open}
          aria-label={open ? 'Hide the panel' : 'Show the panel'}
          title={open ? 'Hide the panel' : 'Show the panel'}
          onClick={() => setTableOpen(!open)}
        >
          {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
        <div className="tabs" role="tablist" aria-label="Panel under the diagram">
          <button type="button" role="tab" className="tab" aria-selected={open && tab === 'values'} onClick={() => setTab('values')}>
            Values
          </button>
          <button type="button" role="tab" className="tab" aria-selected={open && tab === 'comments'} onClick={() => setTab('comments')}>
            Comments
            {count > 0 && <span className="tab-count">{count}</span>}
          </button>
        </div>
        <span className="values-hint">{HINTS[tab]}</span>
        {tab === 'comments' && (
          <button type="button" className="text-button outlined" title="A comment that is about the whole diagram" onClick={addGeneralComment}>
            <PlusIcon /> Comment on the whole diagram
          </button>
        )}
      </div>
      {open && (tab === 'values' ? <ValuesTable /> : <CommentList />)}
    </section>
  );
}
