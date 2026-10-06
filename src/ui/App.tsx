import { useEffect } from 'react';
import { clearValue, removePoint } from '../model/doc';
import { INITIAL } from '../model/types';
import { useStore } from '../state/store';
import { loadFile, openProject, saveCurrentProject, zoomBy } from './actions';
import { Stage } from './Stage';
import { Toolbar } from './Toolbar';
import { ValuesTable } from './ValuesTable';

/** True while the keyboard focus is somewhere that uses typing keys itself. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

function useGlobalKeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useStore.getState();
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (command && key === 's') {
        event.preventDefault();
        saveCurrentProject();
        return;
      }
      if (command && key === 'o') {
        event.preventDefault();
        void openProject();
        return;
      }
      // inside a text field, undo and delete belong to the text
      if (isTyping(event.target)) return;

      if (command && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (command && key === 'y') {
        event.preventDefault();
        state.redo();
      } else if (key === 'escape') {
        if (state.panel) state.closePanel();
        else if (state.selection.kind !== 'none') state.select({ kind: 'none' });
      } else if (key === 'delete' || key === 'backspace') {
        const { selection } = state;
        if (selection.kind === 'point') {
          event.preventDefault();
          state.change((doc) => removePoint(doc, selection.pointId));
        } else if (selection.kind === 'cell' && selection.column !== INITIAL) {
          event.preventDefault();
          state.change((doc) => clearValue(doc, selection.channelId, selection.column));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** Ctrl + wheel zooms the timeline instead of the whole page. */
function useWheelZoom() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!(event.target instanceof Element) || !event.target.closest('.stage')) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1, event.clientX);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);
}

/** A project file dropped anywhere on the window is opened. */
function useFileDrop() {
  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file) void loadFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

function Notice() {
  const notice = useStore((state) => state.notice);
  const canUndo = useStore((state) => state.past.length > 0);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => useStore.getState().dismissNotice(), notice.kind === 'error' ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const offersUndo = notice.undo && canUndo;
  return (
    <div className="notice" data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span>{notice.text}</span>
      {offersUndo && (
        <button
          type="button"
          className="notice-action"
          onClick={() => {
            const state = useStore.getState();
            state.undo();
            state.dismissNotice();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

export function App() {
  const theme = useStore((state) => state.theme);
  const title = useStore((state) => state.doc.title);

  useGlobalKeys();
  useWheelZoom();
  useFileDrop();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.title = title ? `${title} – Timing Diagram` : 'Timing Diagram';
  }, [title]);

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <Stage />
        <ValuesTable />
      </main>
      <footer className="statusbar">
        <span>Click the lane under the ruler to add a transition point</span>
        <span>Drag a point to move it, click it to type an exact time</span>
        <span>Drag a dot to change a value, click it to type one and choose Step or Ramp</span>
      </footer>
      <Notice />
    </div>
  );
}
