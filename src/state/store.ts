/**
 * The one place where the state of the editor lives: the diagram with its undo
 * history, what is selected, and which small panel is open.
 */

import { create } from 'zustand';
import { findChannel, pointIndex } from '../model/doc';
import { sampleDoc } from '../model/sample';
import { fitScale } from '../render/layout';
import { parseProject, serialize } from '../model/serialize';
import { INITIAL, type Column, type Doc } from '../model/types';

export type Selection =
  | { kind: 'none' }
  | { kind: 'point'; pointId: string }
  | { kind: 'cell'; channelId: string; column: Column };


/** The small floating panel that is open, if any. Only one is open at a time. */
export type Panel =
  | null
  | { type: 'cell' }
  | { type: 'point' }
  | { type: 'channel'; channelId: string }
  | { type: 'menu'; name: string };

export type ThemeName = 'light' | 'dark';

/** Page of an exported PDF: a paper size in landscape, or a page exactly as large as the diagram. */
export type PdfPage = 'a4' | 'a3' | 'fit';

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  /** The diagram as it was when the running drag began; null when no drag is running. */
  gestureBase: Doc | null;
  selection: Selection;
  panel: Panel;
  /** 'fit' keeps the whole timeline in view; a number is pixels per unit of time. */
  zoom: 'fit' | number;
  /** Width in pixels that the timeline can use on screen. Measured by the diagram view. */
  viewWidth: number;
  tableOpen: boolean;
  theme: ThemeName;
  pdfPage: PdfPage;
  /** A short notice shown at the bottom of the window. */
  notice: { text: string; kind: 'info' | 'error'; id: number } | null;
}

interface Actions {
  /** Applies one undoable change. During a drag, all changes merge into one step. */
  change(update: (doc: Doc) => Doc): void;
  beginGesture(): void;
  endGesture(): void;
  /** Replaces the whole diagram (new, open). Undo brings the old one back. */
  replaceDoc(doc: Doc): void;
  undo(): void;
  redo(): void;
  select(selection: Selection, panel?: Panel): void;
  openPanel(panel: Panel): void;
  closePanel(): void;
  setZoom(zoom: 'fit' | number): void;
  setViewWidth(width: number): void;
  setTableOpen(open: boolean): void;
  setTheme(theme: ThemeName): void;
  setPdfPage(page: PdfPage): void;
  notify(text: string, kind?: 'info' | 'error'): void;
  dismissNotice(): void;
}

const HISTORY_LIMIT = 200;
const DOC_KEY = 'timing-diagram:doc';
const UI_KEY = 'timing-diagram:ui';

function readStored<T>(key: string, read: (text: string) => T): T | null {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : read(text);
  } catch {
    return null;
  }
}

function initialTheme(stored: ThemeName | undefined): ThemeName {
  if (stored === 'light' || stored === 'dark') return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Drops a selection or panel that points at something the diagram no longer has. */
function reconcile(doc: Doc, selection: Selection, panel: Panel): Pick<State, 'selection' | 'panel'> {
  let nextSelection = selection;
  if (selection.kind === 'point' && pointIndex(doc, selection.pointId) < 0) {
    nextSelection = { kind: 'none' };
  } else if (selection.kind === 'cell') {
    const columnExists = selection.column === INITIAL || pointIndex(doc, selection.column) >= 0;
    if (!findChannel(doc, selection.channelId) || !columnExists) nextSelection = { kind: 'none' };
  }

  let nextPanel = panel;
  if (panel?.type === 'cell' && nextSelection.kind !== 'cell') nextPanel = null;
  if (panel?.type === 'point' && nextSelection.kind !== 'point') nextPanel = null;
  if (panel?.type === 'channel' && !findChannel(doc, panel.channelId)) nextPanel = null;
  return { selection: nextSelection, panel: nextPanel };
}

const storedUi = readStored(
  UI_KEY,
  (text) => JSON.parse(text) as { theme?: ThemeName; tableOpen?: boolean; pdfPage?: PdfPage },
);
let noticeId = 0;

export const useStore = create<State & Actions>()((set, get) => ({
  doc: readStored(DOC_KEY, parseProject) ?? sampleDoc(),
  past: [],
  future: [],
  gestureBase: null,
  selection: { kind: 'none' },
  panel: null,
  zoom: 'fit',
  viewWidth: 1000,
  tableOpen: storedUi?.tableOpen ?? true,
  theme: initialTheme(storedUi?.theme),
  pdfPage: storedUi?.pdfPage === 'a3' || storedUi?.pdfPage === 'fit' ? storedUi.pdfPage : 'a4',
  notice: null,

  change(update) {
    const state = get();
    const doc = update(state.doc);
    if (doc === state.doc) return;
    if (state.gestureBase) {
      set({ doc, ...reconcile(doc, state.selection, state.panel) });
      return;
    }
    set({
      doc,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
      ...reconcile(doc, state.selection, state.panel),
    });
  },

  beginGesture() {
    if (!get().gestureBase) set({ gestureBase: get().doc });
  },

  endGesture() {
    const { gestureBase, doc, past } = get();
    if (!gestureBase) return;
    if (doc === gestureBase) set({ gestureBase: null });
    else set({ gestureBase: null, past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [] });
  },

  replaceDoc(doc) {
    const state = get();
    set({
      doc,
      past: [...state.past, state.gestureBase ?? state.doc].slice(-HISTORY_LIMIT),
      future: [],
      gestureBase: null,
      selection: { kind: 'none' },
      panel: null,
      zoom: 'fit',
    });
  },

  undo() {
    const state = get();
    if (state.gestureBase) return;
    const doc = state.past[state.past.length - 1];
    if (!doc) return;
    set({
      doc,
      past: state.past.slice(0, -1),
      future: [state.doc, ...state.future],
      ...reconcile(doc, state.selection, null),
    });
  },

  redo() {
    const state = get();
    if (state.gestureBase) return;
    const doc = state.future[0];
    if (!doc) return;
    set({
      doc,
      past: [...state.past, state.doc],
      future: state.future.slice(1),
      ...reconcile(doc, state.selection, null),
    });
  },

  select(selection, panel = null) {
    set({ selection, panel });
  },

  openPanel(panel) {
    set({ panel });
  },

  closePanel() {
    if (get().panel) set({ panel: null });
  },

  setZoom(zoom) {
    set({ zoom });
  },

  setViewWidth(viewWidth) {
    if (viewWidth !== get().viewWidth) set({ viewWidth });
  },

  setTableOpen(tableOpen) {
    set({ tableOpen });
  },

  setTheme(theme) {
    set({ theme });
  },

  setPdfPage(pdfPage) {
    set({ pdfPage });
  },

  notify(text, kind = 'info') {
    set({ notice: { text, kind, id: ++noticeId } });
  },

  dismissNotice() {
    set({ notice: null });
  },
}));

/** Pixels per unit of time that the diagram is currently drawn with. */
export function effectiveScale(state: Pick<State, 'doc' | 'zoom' | 'viewWidth'>): number {
  return state.zoom === 'fit' ? fitScale(state.doc, state.viewWidth) : state.zoom;
}

/** Keeps the diagram and the view settings in the browser, so closing the tab loses nothing. */
export function startPersistence(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let savedDoc = useStore.getState().doc;
  let savedUi = '';

  const save = () => {
    const state = useStore.getState();
    try {
      if (state.doc !== savedDoc) {
        localStorage.setItem(DOC_KEY, serialize(state.doc));
        savedDoc = state.doc;
      }
      const ui = JSON.stringify({ theme: state.theme, tableOpen: state.tableOpen, pdfPage: state.pdfPage });
      if (ui !== savedUi) {
        localStorage.setItem(UI_KEY, ui);
        savedUi = ui;
      }
    } catch {
      // storage can be full or switched off; the editor keeps working without it
    }
  };

  useStore.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, 300);
  });
  window.addEventListener('pagehide', save);
}
