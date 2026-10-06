/**
 * The diagram as a PDF: the picture, then the values table, the table of the
 * phases and the list of comments. The drawing stays vector and the text stays
 * text, set in the bundled fonts. What does not fit on a page continues on the next.
 */

import mono400 from '../assets/fonts/plex-mono-400.ttf?inline';
import mono500 from '../assets/fonts/plex-mono-500.ttf?inline';
import sans400 from '../assets/fonts/plex-sans-400.ttf?inline';
import sans600 from '../assets/fonts/plex-sans-600.ttf?inline';
import { numberedComments } from '../model/comments';
import type { Channel, Doc } from '../model/types';
import { GROUP_BAR, layoutLanes, type Row } from '../render/layout';
import type { FontFace, FontResolver } from '../render/theme';
import type { PdfPage } from '../state/store';
import { embeddedFontCss, isCovered } from './fonts';
import { PICTURE_MARGIN, pictureText, renderPicture, type Drawing, type Picture } from './picture';
import { blobToBase64, pictureToPng } from './png';
import { renderCommentBlocks, renderPhaseTables, renderValueTables } from './tablePicture';

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
/** Space between the diagram and what is listed under it, the height of a heading, and the space between blocks. */
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
  /** False leaves the comments out: no pins, no list. */
  comments?: boolean;
}

/**
 * Splits the channels into pages. Each page repeats title and ruler, so the
 * space left for lanes is the same on all of them. The bar of a group is
 * never left alone at the bottom of a page, and it is drawn again on every
 * page the group continues on.
 */
export function paginate(doc: Doc, fixedHeight: number, pageHeight: number): Channel[][] {
  const lanes = layoutLanes(doc);
  const grouped = lanes.bands.length > 0;
  const pages: Channel[][] = [];
  let current: Channel[] = [];
  let used = fixedHeight;
  /** The group whose bar is on the current page already. */
  let barOf: string | null = null;
  /** Height of the bars of groups without channels that come before the next lane. */
  let emptyBars = 0;

  const place = (row: Row) => {
    const bar = grouped && row.channel.group !== barOf ? GROUP_BAR : 0;
    if (current.length > 0 && used + bar + emptyBars + row.height > pageHeight) {
      pages.push(current);
      current = [];
      used = fixedHeight + (grouped ? GROUP_BAR : 0) + emptyBars + row.height;
    } else {
      used += bar + emptyBars + row.height;
    }
    emptyBars = 0;
    barOf = row.channel.group;
    current.push(row.channel);
  };

  if (!grouped) lanes.rows.forEach(place);
  for (const band of lanes.bands) {
    if (band.rows.length === 0) emptyBars += GROUP_BAR;
    else band.rows.forEach(place);
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

/**
 * The part of a diagram that each page shows: its channels, and the groups
 * they are in. A group without channels is shown on the page where its bar
 * belongs: with the group that follows it, or on the last page.
 */
export function pageParts(doc: Doc, pages: Channel[][]): Doc[] {
  const holds = (groupId: string) => doc.channels.some((channel) => channel.group === groupId);
  const pageOfEmpty = new Map<string, number>();
  doc.groups.forEach((group, index) => {
    if (holds(group.id)) return;
    const next = doc.groups.slice(index + 1).find((candidate) => holds(candidate.id));
    const first = next && doc.channels.find((channel) => channel.group === next.id);
    const page = first ? pages.findIndex((channels) => channels.includes(first)) : pages.length - 1;
    pageOfEmpty.set(group.id, Math.max(0, page));
  });
  return pages.map((channels, page) => ({
    ...doc,
    channels,
    groups: doc.groups.filter((group) => channels.some((channel) => channel.group === group.id) || pageOfEmpty.get(group.id) === page),
  }));
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
  /** Headings of what is listed under the diagram, where it starts on this page. */
  headings: { text: string; x: number; y: number }[];
}

export async function buildPdf(source: Doc, options: PdfOptions): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);

  // without its comments, the diagram is exported as if it had none
  const doc = options.comments === false && source.comments.length > 0 ? { ...source, comments: [] } : source;
  // text the bundled font cannot draw would come out as gaps, so such a diagram goes in as images
  const asImage = !isCovered(pictureText(doc));
  const fonts = asImage ? { css: embeddedFontCss() } : { font: pdfFont };
  const whole = renderPicture(doc, { scale: options.scale, ...fonts });
  // every page of a long diagram gets the same column widths as the whole, and its pins the numbers they have in the whole
  const numbered = numberedComments(doc);
  const render = (part: Doc): Picture =>
    renderPicture(part, { scale: options.scale, labelWidth: whole.labelWidth, numbered, ...fonts });
  let pdf: InstanceType<typeof jsPDF>;
  let pageSize: { width: number; height: number };
  const pages: PdfPageContent[] = [];

  if (options.page === 'fit') {
    // just the picture, on a page of its own size: made for placing into other documents.
    // It carries the list of comments, like a picture file does.
    const picture = renderPicture(doc, { scale: options.scale, comments: 'list', ...fonts });
    pageSize = { width: picture.width * PT, height: picture.height * PT };
    pdf = new jsPDF({
      orientation: pageSize.width >= pageSize.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pageSize.width, pageSize.height],
      compress: true,
    });
    pages.push({ drawings: [{ drawing: picture, x: 0, y: 0, ...pageSize }], headings: [] });
  } else {
    pageSize = PAPER[options.page];
    pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.page, compress: true });
    const availableWidth = pageSize.width - 2 * PAGE_MARGIN;
    const bottom = pageSize.height - PAGE_MARGIN - FOOTER;
    const availableHeight = bottom - PAGE_MARGIN;

    // the diagram: never enlarged, shrunk to the page width, continued on further pages lane by lane
    const zoom = Math.min(1, availableWidth / (whole.width * PT));
    const lanesHeight = layoutLanes(doc).height;
    const split = paginate(doc, whole.height - lanesHeight, availableHeight / (PT * zoom));
    for (const part of pageParts(doc, split)) {
      const picture = split.length === 1 ? whole : render(part);
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
        headings: [],
      });
    }

    // what is listed: under the diagram when there is room, otherwise on the next page
    const limits = {
      maxWidth: (availableWidth - 2 * PICTURE_MARGIN * PT * zoom) / PT,
      maxHeight: (availableHeight - TABLE_HEADING) / PT,
      ...fonts,
    };
    const sections = [
      { heading: 'Values', drawings: renderValueTables(doc, limits) },
      { heading: 'Phases', drawings: renderPhaseTables(doc, limits) },
      { heading: 'Comments', drawings: renderCommentBlocks(doc, limits) },
    ].filter((section) => section.drawings.length > 0);

    let page = pages[pages.length - 1]!;
    const last = page.drawings[page.drawings.length - 1]!;
    let y = last.y + last.height + TABLE_GAP;
    const newPage = () => {
      page = { drawings: [], headings: [] };
      pages.push(page);
      y = PAGE_MARGIN;
    };
    // in line with the frame of the diagram, which sits inside the picture's own margin
    const left = PAGE_MARGIN + PICTURE_MARGIN * PT * zoom;
    for (const section of sections) {
      // a heading stays with the first block under it
      if (y + TABLE_HEADING + section.drawings[0]!.height * PT > bottom && y > PAGE_MARGIN) newPage();
      page.headings.push({ text: section.heading, x: left, y: y + 9 });
      y += TABLE_HEADING;
      for (const [index, drawing] of section.drawings.entries()) {
        const height = drawing.height * PT;
        if (index > 0 && y + height > bottom && y > PAGE_MARGIN) newPage();
        page.drawings.push({ drawing, x: left, y, width: drawing.width * PT, height });
        y += height + TABLE_BLOCK_GAP;
      }
      y += TABLE_GAP - TABLE_BLOCK_GAP;
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
      for (const heading of page.headings) {
        pdf.setFont(PDF_FONTS.sans600.family, 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(20, 24, 31);
        pdf.text(heading.text, heading.x, heading.y);
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
