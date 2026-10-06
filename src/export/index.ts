import type { Doc } from '../model/types';
import type { ExportKind } from '../ui/actions';

export async function exportDiagram(_doc: Doc, kind: ExportKind, _options: { pdfPage: string }): Promise<string> {
  throw new Error(`${kind} export is not built yet`);
}
