/**
 * The one place where the state of the editor lives: the diagram with its undo
 * history, what is selected, and which small panel is open.
 */

import { create } from 'zustand';
import { findComment } from '../model/comments';
import { findChannel, pointIndex } from '../model/doc';
import { findPhase } from '../model/phases';
import { sampleDoc } from '../model/sample';
import { fitScale } from '../render/layout';
import { parseProject, serialize } from '../model/serialize';
import { INITIAL, type Column, type Doc } from '../model/types';

export type Selection =
  | { kind: 'none' }
  | { kind: 'point'; pointId: string }
  | { kind: 'cell'; channelId: string; column: Column }
  | { kind: 'phase'; groupId: string; phaseId: string }
  | { kind: 'comment'; commentId: string };

/** The small floating panel that is open, if any. Only one is open at a time. */
export type Panel =
  | null
  | { type: 'cell' }
  | { type: 'point' }
  | { type: 'phase' }
  | { type: 'comment' }
  | { type: 'channel'; channelId: string }
  | { type: 'menu'; name: string };

/** What the panel under the diagram shows. */
export type Tab = 'values' | 'comments';

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
  tab: Tab;
  /**
   * Groups that are folded away, by id. A way of looking at the diagram: it
   * is kept by the browser, but is neither saved with the diagram nor an undo step.
   */
  folded: string[];
  /** The comment tool is picked up: the next click in the diagram places a comment. */
  placing: boolean;
  theme: ThemeName;
  pdfPage: PdfPage;
  /** Whether exports show the comments. */
  exportComments: boolean;
  /** A short notice shown at the bottom of the window. `undo` offers to take the reported action back. */
  notice: { text: string; kind: 'info' | 'error'; undo: boolean; id: number } | null;
}

interface Actions {
  /** Applies one undoable change. During a drag, all changes merge into one step. */
  change(update: (doc: Doc) => Doc): void;
  beginGesture(): void;
  endGesture(): void;
  /** Ends the running gesture by putting the diagram back as it was when the gesture began. */
  cancelGesture(): void;
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
  setTab(tab: Tab): void;
  setFolded(groupId: string, folded: boolean): void;
  setPlacing(placing: boolean): void;
  setTheme(theme: ThemeName): void;
  setPdfPage(page: PdfPage): void;
  setExportComments(show: boolean): void;
  notify(text: string, kind?: 'info' | 'error', undo?: boolean): void;
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
  } else if (selection.kind === 'phase' && !findPhase(doc, selection.groupId, selection.phaseId)) {
    nextSelection = { kind: 'none' };
  } else if (selection.kind === 'comment' && !findComment(doc, selection.commentId)) {
    nextSelection = { kind: 'none' };
  }

  let nextPanel = panel;
  if (panel?.type === 'cell' && nextSelection.kind !== 'cell') nextPanel = null;
  if (panel?.type === 'point' && nextSelection.kind !== 'point') nextPanel = null;
  if (panel?.type === 'phase' && nextSelection.kind !== 'phase') nextPanel = null;
  if (panel?.type === 'comment' && nextSelection.kind !== 'comment') nextPanel = null;
  if (panel?.type === 'channel' && !findChannel(doc, panel.channelId)) nextPanel = null;
  return { selection: nextSelection, panel: nextPanel };
}

const storedUi = readStored(
  UI_KEY,
  (text) =>
    JSON.parse(text) as {
      theme?: ThemeName;
      tableOpen?: boolean;
      pdfPage?: PdfPage;
      tab?: Tab;
      folded?: unknown;
      exportComments?: boolean;
    },
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
  tab: storedUi?.tab === 'comments' ? 'comments' : 'values',
  folded: Array.isArray(storedUi?.folded) ? storedUi.folded.filter((id): id is string => typeof id === 'string') : [],
  placing: false,
  theme: initialTheme(storedUi?.theme),
  pdfPage: storedUi?.pdfPage === 'a3' || storedUi?.pdfPage === 'fit' ? storedUi.pdfPage : 'a4',
  exportComments: storedUi?.exportComments !== false,
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

  cancelGesture() {
    const state = get();
    if (!state.gestureBase) return;
    set({ doc: state.gestureBase, gestureBase: null, ...reconcile(state.gestureBase, state.selection, state.panel) });
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
      placing: false,
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

  setTab(tab) {
    set({ tab, tableOpen: true });
  },

  setFolded(groupId, fold) {
    const { folded } = get();
    if (folded.includes(groupId) === fold) return;
    set({ folded: fold ? [...folded, groupId] : folded.filter((id) => id !== groupId) });
  },

  setPlacing(placing) {
    if (placing !== get().placing) set(placing ? { placing, panel: null } : { placing });
  },

  setTheme(theme) {
    set({ theme });
  },

  setPdfPage(pdfPage) {
    set({ pdfPage });
  },

  setExportComments(exportComments) {
    set({ exportComments });
  },

  notify(text, kind = 'info', undo = false) {
    set({ notice: { text, kind, undo, id: ++noticeId } });
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
    clearTimeout(timer);
    timer = undefined;
    const state = useStore.getState();
    try {
      if (state.doc !== savedDoc) {
        localStorage.setItem(DOC_KEY, serialize(state.doc));
        savedDoc = state.doc;
      }
      const ui = JSON.stringify({
        theme: state.theme,
        tableOpen: state.tableOpen,
        pdfPage: state.pdfPage,
        tab: state.tab,
        // ids of groups that are gone are of no use any more
        folded: state.folded.filter((id) => state.doc.groups.some((group) => group.id === id)),
        exportComments: state.exportComments,
      });
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
  // a change made just before the tab is hidden or closed must not wait for the timer
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) save();
  });
}
