/**
 * The comments as a drawn list: number, place and text, the text broken into
 * lines. Pictures carry it under the diagram; the PDF places it as blocks.
 */

import { numberedComments } from '../model/comments';
import { commentPlace } from '../model/describe';
import type { Doc } from '../model/types';
import { PinMark } from '../render/parts';
import { fitText, textWidth, wrapText } from '../render/text';
import { webFont, type DiagramTheme, type FontResolver } from '../render/theme';

const FONT_SIZE = 11.5;
const LINE_HEIGHT = 16;
/** Air under each comment. */
const ROW_GAP = 5;
/** Room for the pin left of the place. */
const PIN_COLUMN = 28;
const COLUMN_GAP = 16;

export interface CommentRow {
  number: number;
  place: string;
  lines: string[];
  /** Height of the row, with the air under it. */
  height: number;
  /** True for the rest of a comment that began in the block before: it is drawn without number and place. */
  continued?: boolean;
}

export interface CommentList {
  rows: CommentRow[];
  /** x of the text column. */
  textX: number;
  width: number;
  height: number;
}

/** Works out the lines of every comment for a list of a given width. */
export function layoutCommentList(doc: Doc, width: number): CommentList {
  const comments = numberedComments(doc);
  const places = comments.map((comment) => commentPlace(doc, comment));
  const widest = places.reduce((max, place) => Math.max(max, textWidth(place, 'sans600', FONT_SIZE)), 0);
  // the place gets what it needs, but never more than about a third of the list
  const placeWidth = Math.ceil(Math.min(widest, Math.max(60, (width - PIN_COLUMN) * 0.36)));
  const textX = PIN_COLUMN + placeWidth + COLUMN_GAP;
  const textWidthAvailable = Math.max(80, width - textX);

  const rows = comments.map((comment, index) => {
    const lines = wrapText(comment.text.trim(), 'sans400', FONT_SIZE, textWidthAvailable);
    return {
      number: index + 1,
      place: fitText(places[index]!, 'sans600', FONT_SIZE, placeWidth),
      lines,
      height: Math.max(1, lines.length) * LINE_HEIGHT + ROW_GAP,
    };
  });
  return { rows, textX, width, height: rows.reduce((sum, row) => sum + row.height, 0) };
}

/** Draws rows of a comment list from y = 0 downwards. */
export function CommentRows({
  list,
  rows = list.rows,
  theme,
  font = webFont,
}: {
  list: CommentList;
  /** The rows to draw; a part of the list when it continues elsewhere. */
  rows?: readonly CommentRow[];
  theme: DiagramTheme;
  font?: FontResolver;
}) {
  let top = 0;
  return (
    <g>
      {rows.map((row) => {
        const y = top;
        top += row.height;
        return (
          <g key={`${row.number}${row.continued ? ' continued' : ''}`}>
            {!row.continued && <PinMark cx={row.number > 9 ? 10 : 7} cy={y + 8} number={row.number} theme={theme} font={font} />}
            {!row.continued && (
              <text x={PIN_COLUMN} y={y + 12} {...font('sans600')} fontSize={FONT_SIZE} fill={theme.text}>
                {row.place}
              </text>
            )}
            {row.lines.map((line, index) => (
              <text key={index} x={list.textX} y={y + 12 + index * LINE_HEIGHT} {...font('sans400')} fontSize={FONT_SIZE} fill={theme.text}>
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}
