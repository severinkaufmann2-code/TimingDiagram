/**
 * The diagram as an Excel workbook: a picture, the values exactly as defined,
 * the waveforms as chart-ready data, and the phases and comments as lists.
 */

import type { Workbook, Worksheet } from 'exceljs';
import { decimalsOf } from '../model/numbers';
import type { Doc } from '../model/types';
import { channelBlocks, channelLabel, commentLines, phaseRows, plotRows, qualifiedChannelLabel, timeLabel } from './data';

export interface WorkbookImage {
  /** PNG data, base64 encoded. */
  base64: string;
  /** Size to show the picture at, in pixels. */
  width: number;
  height: number;
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } } as const;
const BORDER = { style: 'thin', color: { argb: 'FFD9DDE3' } } as const;
const CELL_BORDER = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const MUTED = { color: { argb: 'FF5F6875' } };

/** Excel number format that shows as many decimals as the value needs, up to `max`. */
function numberFormat(max: number): string {
  return max > 0 ? `0.${'#'.repeat(max)}` : '0';
}

function styleHeader(sheet: Worksheet, rowNumber: number, columns: number): void {
  const row = sheet.getRow(rowNumber);
  for (let column = 1; column <= columns; column++) {
    const cell = row.getCell(column);
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: 'middle', horizontal: column === 1 ? 'left' : 'center' };
  }
}

function addDiagramSheet(workbook: Workbook, doc: Doc, image: WorkbookImage | undefined): void {
  const sheet = workbook.addWorksheet('Diagram', { views: [{ showGridLines: false }] });
  sheet.getCell('A1').value = doc.title;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  if (image) {
    const id = workbook.addImage({ base64: image.base64, extension: 'png' });
    sheet.addImage(id, { tl: { col: 0, row: 2 }, ext: { width: image.width, height: image.height } });
  } else {
    sheet.getCell('A3').value = 'The numbers of this diagram are on the sheets "Values" and "Plot data".';
    sheet.getCell('A3').font = MUTED;
  }
}

/**
 * One row per transition point; per channel the value set there and how it is
 * reached. In a diagram with groups, a row on top names the group above its channels.
 */
function addValuesSheet(workbook: Workbook, doc: Doc): void {
  // rows of the heading: the group if there are groups, the channel, and "Value | Transition"
  const head = doc.groups.length > 0 ? 3 : 2;
  const sheet = workbook.addWorksheet('Values', { views: [{ state: 'frozen', xSplit: 2, ySplit: head }] });
  const columns = 2 + doc.channels.length * 2;
  const timeFormat = numberFormat(Math.max(decimalsOf(doc.time.snap), ...doc.points.map((point) => decimalsOf(point.time)), 0));

  if (doc.groups.length > 0) {
    let column = 3;
    for (const block of channelBlocks(doc)) {
      if (block.channels.length === 0) continue;
      sheet.getCell(1, column).value = block.group!.title;
      sheet.mergeCells(1, column, 1, column + block.channels.length * 2 - 1);
      column += block.channels.length * 2;
    }
  }
  sheet.getRow(head - 1).values = [null, null, ...doc.channels.flatMap((channel) => [channelLabel(channel), null])];
  sheet.getRow(head).values = [null, null, ...doc.channels.flatMap(() => ['Value', 'Transition'])];
  doc.channels.forEach((_, index) => sheet.mergeCells(head - 1, 3 + index * 2, head - 1, 4 + index * 2));
  // the first two columns are headed over the full height
  sheet.getCell(1, 1).value = 'Point';
  sheet.getCell(1, 2).value = timeLabel(doc);
  sheet.mergeCells(1, 1, head, 1);
  sheet.mergeCells(1, 2, head, 2);
  for (let row = 1; row <= head; row++) styleHeader(sheet, row, columns);

  const rows: (string | number | null)[][] = [
    ['Initial', doc.time.start, ...doc.channels.flatMap((channel) => [channel.initial, null])],
    ...doc.points.map((point, index) => [
      index + 1,
      point.time,
      ...doc.channels.flatMap((channel) => {
        const cell = channel.cells[point.id];
        return cell ? [cell.value, cell.mode] : [null, null];
      }),
    ]),
  ];
  rows.forEach((values, index) => {
    const row = sheet.getRow(head + 1 + index);
    row.values = values;
    for (let column = 1; column <= columns; column++) {
      const cell = row.getCell(column);
      cell.border = CELL_BORDER;
      if (column === 1) cell.alignment = { horizontal: 'left' };
      else if (column === 2) cell.numFmt = timeFormat;
      else if (column % 2 === 0) {
        cell.font = MUTED;
        cell.alignment = { horizontal: 'left' };
      }
    }
  });

  sheet.getColumn(1).width = 9;
  sheet.getColumn(2).width = 12;
  doc.channels.forEach((channel, index) => {
    const width = Math.max(11, Math.ceil(channelLabel(channel).length / 2) + 3);
    sheet.getColumn(3 + index * 2).width = width;
    sheet.getColumn(4 + index * 2).width = width;
  });

  const note = sheet.getCell(rows.length + head + 2, 1);
  note.value =
    'step: the channel keeps its previous value up to this point, then jumps. ramp: it changes gradually from its previous value. Empty: no change at this point.';
  note.font = MUTED;
}

/** The waveforms as a table that an XY chart draws exactly. */
function addPlotSheet(workbook: Workbook, doc: Doc): void {
  const sheet = workbook.addWorksheet('Plot data', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
  const columns = 1 + doc.channels.length;
  const rows = plotRows(doc);
  const timeFormat = numberFormat(Math.max(...rows.map((row) => decimalsOf(row.time)), 0));

  const note = sheet.getCell('A1');
  note.value =
    'To draw the diagram, select this table and insert an XY (scatter) chart with straight lines. A time appears twice where a channel jumps.';
  note.font = MUTED;

  // with groups, the column title says which group: two groups often hold channels of the same name
  const labels = doc.channels.map((channel) => qualifiedChannelLabel(doc, channel));
  sheet.getRow(3).values = [timeLabel(doc), ...labels];
  styleHeader(sheet, 3, columns);
  rows.forEach((plotRow, index) => {
    const row = sheet.getRow(4 + index);
    row.values = [plotRow.time, ...plotRow.values];
    for (let column = 1; column <= columns; column++) row.getCell(column).border = CELL_BORDER;
    row.getCell(1).numFmt = timeFormat;
  });

  sheet.getColumn(1).width = 12;
  labels.forEach((label, index) => {
    sheet.getColumn(2 + index).width = Math.max(11, label.length + 3);
  });
}

/** The phases of all groups as a list: from when to when each of them lasts. */
function addPhasesSheet(workbook: Workbook, doc: Doc): void {
  const rows = phaseRows(doc);
  if (rows.length === 0) return;
  const sheet = workbook.addWorksheet('Phases', { views: [{ state: 'frozen', ySplit: 1 }] });
  const unit = doc.time.unit.trim();
  const inUnit = unit ? ` [${unit}]` : '';
  const timeFormat = numberFormat(Math.max(...rows.flatMap((row) => [decimalsOf(row.from), decimalsOf(row.to)]), decimalsOf(doc.time.snap), 0));

  sheet.getRow(1).values = ['Group', 'Phase', `From${inUnit}`, `To${inUnit}`, `Duration${inUnit}`];
  styleHeader(sheet, 1, 5);
  rows.forEach((phase, index) => {
    const row = sheet.getRow(2 + index);
    row.values = [phase.group, phase.phase, phase.from, phase.to, phase.duration];
    for (let column = 1; column <= 5; column++) {
      const cell = row.getCell(column);
      cell.border = CELL_BORDER;
      if (column > 2) cell.numFmt = timeFormat;
    }
  });
  sheet.getColumn(1).width = Math.max(12, ...rows.map((row) => row.group.length + 3));
  sheet.getColumn(2).width = Math.max(12, ...rows.map((row) => row.phase.length + 3));
  for (let column = 3; column <= 5; column++) sheet.getColumn(column).width = 14;
}

/** The comments as a list, with the numbers their pins have in the picture. */
function addCommentsSheet(workbook: Workbook, doc: Doc): void {
  const lines = commentLines(doc);
  if (lines.length === 0) return;
  const sheet = workbook.addWorksheet('Comments', { views: [{ state: 'frozen', ySplit: 1 }] });
  const unit = doc.time.unit.trim();
  const timeFormat = numberFormat(Math.max(...lines.map((line) => (line.time === null ? 0 : decimalsOf(line.time))), decimalsOf(doc.time.snap), 0));

  sheet.getRow(1).values = ['No.', 'Place', unit ? `Time [${unit}]` : 'Time', 'Comment'];
  styleHeader(sheet, 1, 4);
  lines.forEach((line, index) => {
    const row = sheet.getRow(2 + index);
    row.values = [line.number, line.place, line.time, line.text];
    for (let column = 1; column <= 4; column++) {
      const cell = row.getCell(column);
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: 'top', horizontal: column === 3 ? 'right' : 'left', wrapText: column === 4 };
    }
    row.getCell(3).numFmt = timeFormat;
  });
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = Math.min(60, Math.max(14, ...lines.map((line) => line.place.length + 3)));
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 90;
}

/**
 * Writes the workbook. The picture is drawn by the caller, in a browser. The
 * sheets "Phases" and "Comments" are written only when there is something to list.
 */
export async function buildWorkbook(doc: Doc, image?: WorkbookImage): Promise<ArrayBuffer> {
  const module = await import('exceljs');
  // the browser build exposes the library as the default export, the Node build as named exports
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timing Diagram';
  workbook.title = doc.title;
  workbook.created = new Date();

  addDiagramSheet(workbook, doc, image);
  addValuesSheet(workbook, doc);
  addPlotSheet(workbook, doc);
  addPhasesSheet(workbook, doc);
  addCommentsSheet(workbook, doc);

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
