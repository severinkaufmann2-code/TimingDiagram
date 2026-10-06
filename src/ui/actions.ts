/** Commands that are reachable from more than one place (toolbar, keyboard, table). */

import { addPoint, newDoc } from '../model/doc';
import { niceStep, snapTo } from '../model/numbers';
import { sampleDoc } from '../model/sample';
import { ProjectFileError } from '../model/serialize';
import { PAD_LEFT, fitScale } from '../render/layout';
import { effectiveScale, useStore } from '../state/store';
import { HEADER_WIDTH } from './constants';
import { PROJECT_ACCEPT, pickFile, readProject, saveProject } from './files';

/** Adds a transition point one grid step after the last one and opens it for typing the exact time. */
export function addPointAtEnd(): void {
  const { doc, change, select } = useStore.getState();
  const span = doc.time.end - doc.time.start;
  const step = Math.max(doc.time.snap, niceStep(span / 10));
  const last = doc.points[doc.points.length - 1];
  const time = snapTo((last ? last.time : doc.time.start) + step, doc.time.snap);
  let id = '';
  change((current) => {
    const added = addPoint(current, time);
    id = added.id;
    return added.doc;
  });
  if (id) select({ kind: 'point', pointId: id }, { type: 'point' });
}

export async function loadFile(file: File): Promise<void> {
  const { replaceDoc, notify } = useStore.getState();
  try {
    replaceDoc(await readProject(file));
    notify(`Opened “${file.name}”.`, 'info', true);
  } catch (error) {
    notify(error instanceof ProjectFileError ? error.message : 'This file could not be read.', 'error');
  }
}

export async function openProject(): Promise<void> {
  const file = await pickFile(PROJECT_ACCEPT);
  if (file) await loadFile(file);
}

export function saveCurrentProject(): void {
  const { doc, notify } = useStore.getState();
  notify(`Saved as “${saveProject(doc)}”.`);
}

export function newDiagram(): void {
  const { replaceDoc, notify } = useStore.getState();
  replaceDoc(newDoc());
  notify('New diagram.', 'info', true);
}

export function loadExample(): void {
  const { replaceDoc, notify } = useStore.getState();
  replaceDoc(sampleDoc());
  notify('Example loaded.', 'info', true);
}

export type ExportKind = 'xlsx' | 'pdf' | 'html' | 'png' | 'svg';

/** Builds the chosen file and hands it to the browser as a download. The export code loads on first use. */
export async function runExport(kind: ExportKind): Promise<void> {
  const { doc, pdfPage, zoom, notify } = useStore.getState();
  try {
    const { exportDiagram } = await import('../export');
    // a view zoomed by hand is exported at that zoom; the fitted view gets a standard width
    const name = await exportDiagram(doc, kind, { pdfPage, scale: zoom === 'fit' ? undefined : zoom });
    notify(`Exported “${name}”.`);
  } catch (error) {
    console.error(error);
    const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
    notify(`The export did not work${reason}.`, 'error');
  }
}

const ZOOM_FACTOR = 1.25;
/** Widest the drawn timeline may get, in pixels. */
const MAX_TIMELINE_WIDTH = 60000;

/**
 * Zooms the timeline one step in or out. The time under `anchorX` (a window
 * coordinate; the middle of the view when omitted) stays where it is.
 * Zooming out stops at the fitted view.
 */
export function zoomBy(direction: 1 | -1, anchorX?: number): void {
  const state = useStore.getState();
  const { start, end } = state.doc.time;
  const current = effectiveScale(state);
  const fitted = fitScale(state.doc, state.viewWidth);
  const widest = MAX_TIMELINE_WIDTH / Math.max(end - start, Number.MIN_VALUE);
  const next = Math.min(direction > 0 ? current * ZOOM_FACTOR : current / ZOOM_FACTOR, Math.max(widest, fitted));

  const stage = document.querySelector<HTMLElement>('.stage');
  if (next <= fitted * 1.001) {
    state.setZoom('fit');
    return;
  }
  state.setZoom(next);
  if (!stage) return;

  const rect = stage.getBoundingClientRect();
  const viewLeft = rect.left + HEADER_WIDTH;
  const anchor = Math.min(Math.max(anchorX ?? (viewLeft + rect.right) / 2, viewLeft), rect.right);
  const offset = anchor - viewLeft;
  const time = start + (stage.scrollLeft + offset - PAD_LEFT) / current;
  // after the diagram has been redrawn at the new zoom
  requestAnimationFrame(() => {
    stage.scrollLeft = PAD_LEFT + (time - start) * next - offset;
  });
}
