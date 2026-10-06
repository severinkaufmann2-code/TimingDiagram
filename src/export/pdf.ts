/**
 * The diagram as a PDF. The drawing stays vector and the text stays text, set
 * in the bundled fonts. Long diagrams continue on further pages.
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
import { pictureText, renderPicture, type Picture } from './picture';
import { blobToBase64, pictureToPng } from './png';

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

export async function buildPdf(doc: Doc, options: PdfOptions): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);

  // text the bundled font cannot draw would come out as gaps, so such a diagram goes in as an image
  const asImage = !isCovered(pictureText(doc));
  const render = (channels: Channel[]): Picture =>
    renderPicture(
      { ...doc, channels },
      asImage ? { scale: options.scale, css: embeddedFontCss() } : { scale: options.scale, font: pdfFont },
    );

  const whole = render(doc.channels);
  let pdf: InstanceType<typeof jsPDF>;
  let pages: { picture: Picture; x: number; y: number; width: number; height: number }[];
  let pageSize: { width: number; height: number };

  if (options.page === 'fit') {
    pageSize = { width: whole.width * PT, height: whole.height * PT };
    pdf = new jsPDF({
      orientation: pageSize.width >= pageSize.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pageSize.width, pageSize.height],
      compress: true,
    });
    pages = [{ picture: whole, x: 0, y: 0, ...pageSize }];
  } else {
    pageSize = PAPER[options.page];
    pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.page, compress: true });
    const availableWidth = pageSize.width - 2 * PAGE_MARGIN;
    const availableHeight = pageSize.height - 2 * PAGE_MARGIN - FOOTER;
    // never enlarge: a short diagram keeps its natural size
    const zoom = Math.min(1, availableWidth / (whole.width * PT));
    const lanesHeight = layoutRows(doc).reduce((sum, row) => sum + row.height, 0);
    const groups = paginate(doc, whole.height - lanesHeight, availableHeight / (PT * zoom));
    pages = groups.map((channels) => {
      const picture = groups.length === 1 ? whole : render(channels);
      const width = picture.width * PT * zoom;
      return {
        picture,
        x: (pageSize.width - width) / 2,
        y: PAGE_MARGIN,
        width,
        height: picture.height * PT * zoom,
      };
    });
  }

  for (const font of Object.values(PDF_FONTS)) {
    pdf.addFileToVFS(font.file, font.data.slice(font.data.indexOf(',') + 1));
    pdf.addFont(font.file, font.family, 'normal');
  }
  pdf.setProperties({ title: doc.title, creator: 'Timing Diagram' });

  if (!asImage) await loadMeasurementFonts();

  // svg2pdf measures the picture in the page, so it has to be attached for a moment
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  try {
    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage();
      if (asImage) {
        const png = await blobToBase64(await pictureToPng(page.picture, 3));
        pdf.addImage(`data:image/png;base64,${png}`, 'PNG', page.x, page.y, page.width, page.height, undefined, 'FAST');
      } else {
        host.innerHTML = page.picture.svg;
        await pdf.svg(host.firstElementChild!, { x: page.x, y: page.y, width: page.width, height: page.height });
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
