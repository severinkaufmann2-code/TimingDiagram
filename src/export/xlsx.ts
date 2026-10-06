/**
 * The diagram as an Excel workbook: a picture, the values exactly as defined,
 * and the waveforms as chart-ready data.
 */

import type { Workbook, Worksheet } from 'exceljs';
import { decimalsOf } from '../model/numbers';
import type { Doc } from '../model/types';
import { channelLabel, plotRows, timeLabel } from './data';

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

/** One row per transition point; per channel the value set there and how it is reached. */
function addValuesSheet(workbook: Workbook, doc: Doc): void {
  const sheet = workbook.addWorksheet('Values', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
  const columns = 2 + doc.channels.length * 2;
  const timeFormat = numberFormat(Math.max(decimalsOf(doc.time.snap), ...doc.points.map((point) => decimalsOf(point.time)), 0));

  sheet.getRow(1).values = ['Point', timeLabel(doc), ...doc.channels.flatMap((channel) => [channelLabel(channel), null])];
  sheet.getRow(2).values = [null, null, ...doc.channels.flatMap(() => ['Value', 'Transition'])];
  doc.channels.forEach((_, index) => sheet.mergeCells(1, 3 + index * 2, 1, 4 + index * 2));
  sheet.mergeCells(1, 1, 2, 1);
  sheet.mergeCells(1, 2, 2, 2);
  styleHeader(sheet, 1, columns);
  styleHeader(sheet, 2, columns);

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
    const row = sheet.getRow(3 + index);
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

  const note = sheet.getCell(rows.length + 4, 1);
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

  sheet.getRow(3).values = [timeLabel(doc), ...doc.channels.map(channelLabel)];
  styleHeader(sheet, 3, columns);
  rows.forEach((plotRow, index) => {
    const row = sheet.getRow(4 + index);
    row.values = [plotRow.time, ...plotRow.values];
    for (let column = 1; column <= columns; column++) row.getCell(column).border = CELL_BORDER;
    row.getCell(1).numFmt = timeFormat;
  });

  sheet.getColumn(1).width = 12;
  doc.channels.forEach((channel, index) => {
    sheet.getColumn(2 + index).width = Math.max(11, channelLabel(channel).length + 3);
  });
}

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

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
