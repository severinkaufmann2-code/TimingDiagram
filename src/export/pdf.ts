/**
 * The diagram as a PDF: the picture, then the values table. The drawing stays
 * vector and the text stays text, set in the bundled fonts. What does not fit
 * on a page continues on the next.
 */

import mono400 from '../assets/fonts/plex-mono-400.ttf?inline';
import mono500 from '../assets/fonts/plex-mono-500.ttf?inline';
import sans400 from '../assets/fonts/plex-sans-400.ttf?inline';
import sans600 from '../assets/fonts/plex-sans-600.ttf?inline';
import type { Channel, Doc } from '../model/types';
import { layoutRows } from '../render/layout';
import type { FontFace, FontResolver } from '../render/theme';
import type { PdfPage } from '../state/store';
import { embeddedFontCss, isCovered } from './fonts';
import { PICTURE_MARGIN, pictureText, renderPicture, type Drawing, type Picture } from './picture';
import { blobToBase64, pictureToPng } from './png';
import { renderValueTables } from './tablePicture';

/** jsPDF finds a font by family name and style only, so every face gets a family name of its own. */
const PDF_FONTS: Record<FontFace, { family: string; file: string; data: string }> = {
  sans400: { family: 'PlexSans400', file: 'plex-sans-400.ttf', data: sans400 },
  sans600: { family: 'PlexSans600', file: 'plex-sans-600.ttf', data: sans600 },
  mono400: { family: 'PlexMono400', file: 'plex-mono-400.ttf', data: mono400 },
  mono500: { family: 'PlexMono500', file: 'plex-mono-500.ttf', data: mono500 },
};

const pdfFont: FontResolver = (face) => ({ fontFamily: PDF_FONTS[face].family });

let measurementFonts: Promise<unknown> | undefined;

/**
 * svg2pdf asks the browser how wide a piece of text is when it centres or
 * right-aligns it. The browser can only answer for fonts it knows by the same
 * names the PDF uses, so the faces are registered under those names once.
 */
function loadMeasurementFonts(): Promise<unknown> {
  measurementFonts ??= Promise.all(
    Object.values(PDF_FONTS).map(async (font) => {
      const face = new FontFace(font.family, `url(${font.data})`);
      document.fonts.add(await face.load());
    }),
  );
  return measurementFonts;
}

/** Points per CSS pixel. */
const PT = 0.75;
const PAGE_MARGIN = 36;
const FOOTER = 16;
/** Space between the diagram and the values table, the table's heading, and between table blocks. */
const TABLE_GAP = 26;
const TABLE_HEADING = 18;
const TABLE_BLOCK_GAP = 14;
const PAPER = {
  a4: { width: 841.89, height: 595.28 },
  a3: { width: 1190.55, height: 841.89 },
} as const;

export interface PdfOptions {
  page: PdfPage;
  /** Pixels per unit of time, as on screen. Without it the timeline gets a standard width. */
  scale?: number;
}

/**
 * Splits the channels into pages. Each page repeats title and ruler, so the
 * space left for lanes is the same on all of them.
 */
export function paginate(doc: Doc, fixedHeight: number, pageHeight: number): Channel[][] {
  const pages: Channel[][] = [];
  let current: Channel[] = [];
  let used = fixedHeight;
  for (const row of layoutRows(doc)) {
    if (current.length > 0 && used + row.height > pageHeight) {
      pages.push(current);
      current = [];
      used = fixedHeight;
    }
    current.push(row.channel);
    used += row.height;
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

interface Placed {
  drawing: Drawing;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfPageContent {
  drawings: Placed[];
  /** Heading above the values table, when it starts on this page. */
  heading?: { x: number; y: number };
}

export async function buildPdf(doc: Doc, options: PdfOptions): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);

  // text the bundled font cannot draw would come out as gaps, so such a diagram goes in as images
  const asImage = !isCovered(pictureText(doc));
  const fonts = asImage ? { css: embeddedFontCss() } : { font: pdfFont };
  const whole = renderPicture(doc, { scale: options.scale, ...fonts });
  // every page of a long diagram gets the same column widths as the whole
  const render = (channels: Channel[]): Picture =>
    renderPicture({ ...doc, channels }, { scale: options.scale, labelWidth: whole.labelWidth, ...fonts });
  let pdf: InstanceType<typeof jsPDF>;
  let pageSize: { width: number; height: number };
  const pages: PdfPageContent[] = [];

  if (options.page === 'fit') {
    // just the picture, on a page of its own size: made for placing into other documents
    pageSize = { width: whole.width * PT, height: whole.height * PT };
    pdf = new jsPDF({
      orientation: pageSize.width >= pageSize.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pageSize.width, pageSize.height],
      compress: true,
    });
    pages.push({ drawings: [{ drawing: whole, x: 0, y: 0, ...pageSize }] });
  } else {
    pageSize = PAPER[options.page];
    pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.page, compress: true });
    const availableWidth = pageSize.width - 2 * PAGE_MARGIN;
    const bottom = pageSize.height - PAGE_MARGIN - FOOTER;
    const availableHeight = bottom - PAGE_MARGIN;

    // the diagram: never enlarged, shrunk to the page width, continued on further pages lane by lane
    const zoom = Math.min(1, availableWidth / (whole.width * PT));
    const lanesHeight = layoutRows(doc).reduce((sum, row) => sum + row.height, 0);
    const groups = paginate(doc, whole.height - lanesHeight, availableHeight / (PT * zoom));
    for (const channels of groups) {
      const picture = groups.length === 1 ? whole : render(channels);
      pages.push({
        drawings: [
          {
            drawing: picture,
            x: PAGE_MARGIN,
            y: PAGE_MARGIN,
            width: picture.width * PT * zoom,
            height: picture.height * PT * zoom,
          },
        ],
      });
    }

    // the values table: under the diagram when there is room, otherwise on the next page
    const tables = renderValueTables(doc, {
      maxWidth: (availableWidth - 2 * PICTURE_MARGIN * PT * zoom) / PT,
      maxHeight: (availableHeight - TABLE_HEADING) / PT,
      ...fonts,
    });
    let page = pages[pages.length - 1]!;
    const last = page.drawings[page.drawings.length - 1]!;
    let y = last.y + last.height + TABLE_GAP;
    const newPage = () => {
      page = { drawings: [] };
      pages.push(page);
      y = PAGE_MARGIN;
    };
    if (y + TABLE_HEADING + tables[0]!.height * PT > bottom) newPage();
    // in line with the frame of the diagram, which sits inside the picture's own margin
    const tableLeft = PAGE_MARGIN + PICTURE_MARGIN * PT * zoom;
    page.heading = { x: tableLeft, y: y + 9 };
    y += TABLE_HEADING;
    for (const table of tables) {
      const height = table.height * PT;
      if (y + height > bottom && page.drawings.length > 0) newPage();
      page.drawings.push({ drawing: table, x: tableLeft, y, width: table.width * PT, height });
      y += height + TABLE_BLOCK_GAP;
    }
  }

  for (const font of Object.values(PDF_FONTS)) {
    pdf.addFileToVFS(font.file, font.data.slice(font.data.indexOf(',') + 1));
    pdf.addFont(font.file, font.family, 'normal');
  }
  pdf.setProperties({ title: doc.title, creator: 'Timing Diagram' });

  if (!asImage) await loadMeasurementFonts();

  // svg2pdf measures the drawing in the page, so it has to be attached for a moment
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  try {
    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage();
      if (page.heading) {
        pdf.setFont(PDF_FONTS.sans600.family, 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(20, 24, 31);
        pdf.text('Values', page.heading.x, page.heading.y);
      }
      for (const placed of page.drawings) {
        if (asImage) {
          const png = await blobToBase64(await pictureToPng(placed.drawing, 3));
          pdf.addImage(`data:image/png;base64,${png}`, 'PNG', placed.x, placed.y, placed.width, placed.height, undefined, 'FAST');
        } else {
          host.innerHTML = placed.drawing.svg;
          await pdf.svg(host.firstElementChild!, { x: placed.x, y: placed.y, width: placed.width, height: placed.height });
        }
      }
      if (pages.length > 1) {
        pdf.setFont(PDF_FONTS.sans400.family, 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(95, 104, 117);
        pdf.text(`Page ${index + 1} of ${pages.length}`, pageSize.width - PAGE_MARGIN, pageSize.height - PAGE_MARGIN + 4, {
          align: 'right',
        });
      }
    }
  } finally {
    host.remove();
  }

  return pdf.output('blob');
}
