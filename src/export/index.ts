/** Entry point of the exports: builds the chosen file and hands it to the browser as a download. */

import { fileBaseName } from '../model/serialize';
import type { Doc } from '../model/types';
import type { PdfPage } from '../state/store';
import type { ExportKind } from '../ui/actions';
import { download } from '../ui/files';
import { embeddedFontCss } from './fonts';
import { buildHtml } from './html';
import { renderPicture } from './picture';
import { blobToBase64, pictureToPng } from './png';

export interface ExportOptions {
  pdfPage: PdfPage;
  /** Pixels per unit of time when the view is zoomed by hand; undefined for the fitted view. */
  scale?: number;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Returns the name of the file that was written. */
export async function exportDiagram(doc: Doc, kind: ExportKind, options: ExportOptions): Promise<string> {
  const name = `${fileBaseName(doc)}.${kind}`;
  const { scale } = options;

  switch (kind) {
    case 'svg': {
      const picture = renderPicture(doc, { scale, css: embeddedFontCss() });
      download(`<?xml version="1.0" encoding="UTF-8"?>\n${picture.svg}\n`, name, 'image/svg+xml');
      break;
    }
    case 'png': {
      const picture = renderPicture(doc, { scale, css: embeddedFontCss() });
      download(await pictureToPng(picture), name, 'image/png');
      break;
    }
    case 'html': {
      // the page carries the title and the fonts itself
      const picture = renderPicture(doc, { scale, showTitle: false });
      download(buildHtml(doc, picture, embeddedFontCss()), name, 'text/html');
      break;
    }
    case 'pdf': {
      const { buildPdf } = await import('./pdf');
      download(await buildPdf(doc, { page: options.pdfPage, scale }), name, 'application/pdf');
      break;
    }
    case 'xlsx': {
      const { buildWorkbook } = await import('./xlsx');
      const picture = renderPicture(doc, { scale, showTitle: false, css: embeddedFontCss() });
      const base64 = await blobToBase64(await pictureToPng(picture));
      download(await buildWorkbook(doc, { base64, width: picture.width, height: picture.height }), name, XLSX_TYPE);
      break;
    }
  }
  return name;
}
