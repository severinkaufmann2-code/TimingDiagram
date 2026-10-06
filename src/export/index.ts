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
  /** False leaves the comments out of what is exported. */
  comments?: boolean;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Returns the name of the file that was written. */
export async function exportDiagram(doc: Doc, kind: ExportKind, options: ExportOptions): Promise<string> {
  const name = `${fileBaseName(doc)}.${kind}`;
  const { scale } = options;
  const comments = options.comments !== false;
  // a picture file stands alone, so it lists the comments under the drawing; the other
  // formats draw the pins only and list the comments themselves
  const alone = comments ? 'list' : 'none';
  const pins = comments ? 'pins' : 'none';

  switch (kind) {
    case 'svg': {
      const picture = renderPicture(doc, { scale, css: embeddedFontCss(), comments: alone });
      download(`<?xml version="1.0" encoding="UTF-8"?>\n${picture.svg}\n`, name, 'image/svg+xml');
      break;
    }
    case 'png': {
      const picture = renderPicture(doc, { scale, css: embeddedFontCss(), comments: alone });
      download(await pictureToPng(picture), name, 'image/png');
      break;
    }
    case 'html': {
      // the page carries the title and the fonts itself
      const picture = renderPicture(doc, { scale, showTitle: false, comments: pins });
      download(buildHtml(doc, picture, embeddedFontCss(), new Date(), comments), name, 'text/html');
      break;
    }
    case 'pdf': {
      const { buildPdf } = await import('./pdf');
      download(await buildPdf(doc, { page: options.pdfPage, scale, comments }), name, 'application/pdf');
      break;
    }
    case 'xlsx': {
      const { buildWorkbook } = await import('./xlsx');
      const shown = comments ? doc : { ...doc, comments: [] };
      const picture = renderPicture(shown, { scale, showTitle: false, css: embeddedFontCss() });
      const base64 = await blobToBase64(await pictureToPng(picture));
      download(await buildWorkbook(shown, { base64, width: picture.width, height: picture.height }), name, XLSX_TYPE);
      break;
    }
  }
  return name;
}
