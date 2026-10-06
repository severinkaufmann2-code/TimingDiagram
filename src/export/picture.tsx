/**
 * The diagram as a finished picture: the same drawing as on screen, plus the
 * channel names and the title, without anything that only makes sense while
 * editing. Every export starts from this.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { numberedComments } from '../model/comments';
import { commentPlace } from '../model/describe';
import type { Comment, Doc } from '../model/types';
import { GROUP_BAR, PAD_LEFT, PAD_RIGHT, PIN_STEP, computeLayout, crisp, type Layout } from '../render/layout';
import { GroupBars, GuideLines, LaneGrid, MarkerPill, PhaseBars, PinMark, Pins, RulerScale, Waveform } from '../render/parts';
import { fitText, textWidth } from '../render/text';
import { LIGHT, channelColor, webFont, type DiagramTheme, type FontResolver } from '../render/theme';
import { CommentRows, layoutCommentList, type CommentList } from './commentList';

export interface PictureOptions {
  /** Pixels per unit of time. Without it the timeline is fitted to a comfortable width. */
  scale?: number;
  theme?: DiagramTheme;
  /** Write the diagram title above the drawing. */
  showTitle?: boolean;
  /** CSS placed inside the picture, e.g. embedded fonts. */
  css?: string;
  font?: FontResolver;
  /** Width of the column with the channel names. Without it, the longest name decides. */
  labelWidth?: number;
  /**
   * How much of the comments to show: nothing, their pins, or the pins and
   * the list of their texts under the drawing. Without it: the pins.
   */
  comments?: 'none' | 'pins' | 'list';
}

/** An SVG drawing and its size in pixels. */
export interface Drawing {
  svg: string;
  width: number;
  height: number;
}

export interface Picture extends Drawing {
  /** Width of the column with the channel names. */
  labelWidth: number;
  /** Where the timeline sits inside the picture. */
  plot: {
    /** x of the start of the timeline. */
    x0: number;
    /** Pixels per unit of time. */
    scale: number;
    /** Top and bottom edge of the lanes. */
    top: number;
    bottom: number;
  };
}

/** Width of the timeline in a picture when no zoom is asked for. */
const DEFAULT_PLOT_WIDTH = 1100;
const MIN_WIDTH = 480;
const MAX_WIDTH = 16000;
/** Empty space around the drawing. */
export const PICTURE_MARGIN = 16;
const MARGIN = PICTURE_MARGIN;
const TITLE_HEIGHT = 34;
/** Space between the drawing and the list of comments, and the height of the list's heading. */
const LIST_GAP = 22;
const LIST_HEAD = 20;

/** The scale a picture is drawn with: the wished one, kept within sane sizes. */
export function pictureScale(doc: Doc, wished?: number): number {
  const span = Math.max(doc.time.end - doc.time.start, Number.MIN_VALUE);
  const fit = (width: number) => (width - PAD_LEFT - PAD_RIGHT) / span;
  if (wished === undefined || !Number.isFinite(wished) || wished <= 0) return fit(DEFAULT_PLOT_WIDTH);
  return Math.min(Math.max(wished, fit(MIN_WIDTH)), fit(MAX_WIDTH));
}

function clip(text: string, maxCharacters: number): string {
  return text.length <= maxCharacters ? text : `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

const onWholeDiagram = (comment: Comment) => comment.on.kind === 'diagram' && !comment.on.at;
const onGroup = (groupId: string) => (comment: Comment) => comment.on.kind === 'group' && comment.on.group === groupId;
const onWholeChannel = (channelId: string) => (comment: Comment) =>
  comment.on.kind === 'channel' && comment.on.channel === channelId && !comment.on.at;

/** Room the pins next to a name take. */
function pinRoom(pins: number): number {
  return pins > 0 ? 6 + pins * PIN_STEP : 0;
}

/** Width of the column with the names: wide enough for the longest channel name, group title and the pins next to them. */
function labelColumnWidth(doc: Doc, numbered: readonly Comment[]): number {
  const longest = doc.channels.reduce((length, channel) => Math.max(length, channel.name.length), 0);
  let width = 46 + longest * 6.9;
  for (const channel of doc.channels) {
    const pins = numbered.filter(onWholeChannel(channel.id)).length;
    if (pins > 0) width = Math.max(width, 40 + textWidth(channel.name, 'sans600', 12) + pinRoom(pins));
  }
  for (const group of doc.groups) {
    const pins = numbered.filter(onGroup(group.id)).length;
    width = Math.max(width, 24 + textWidth(group.title, 'sans600', 12.5) + pinRoom(pins));
  }
  return Math.round(Math.min(300, Math.max(110, width)));
}

/** Height of the list of comments under the drawing, with the space above it. */
function listHeight(list: CommentList | undefined): number {
  return list ? LIST_GAP + LIST_HEAD + list.height : 0;
}

function PictureSvg({
  doc,
  layout,
  theme,
  font,
  showTitle,
  css,
  labels,
  numbered,
  list,
}: {
  doc: Doc;
  layout: Layout;
  theme: DiagramTheme;
  font: FontResolver;
  showTitle: boolean;
  css?: string;
  labels: number;
  /** The comments in the order of their numbers. */
  numbered: readonly Comment[];
  /** The list of comments to draw under the diagram, if any. */
  list?: CommentList;
}) {
  const top = MARGIN + (showTitle ? TITLE_HEIGHT : 0);
  const lanesTop = top + layout.rulerHeight;
  const plotLeft = MARGIN + labels;
  const width = plotLeft + layout.width + MARGIN;
  const height = lanesTop + layout.lanesHeight + MARGIN + listHeight(list);
  const maxCharacters = Math.floor((labels - 40) / 6.6);
  const numberOf = (comment: Comment) => numbered.indexOf(comment) + 1;
  const pinsInRuler = layout.pins.some((pin) => pin.where === 'ruler');
  const pinsInLanes = layout.pins.some((pin) => pin.where !== 'ruler');
  const unit = doc.time.unit.trim();
  const frame = {
    x: MARGIN + 0.5,
    y: top + 0.5,
    width: labels + layout.width - 1,
    height: layout.rulerHeight + layout.lanesHeight - 1,
  };

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      <title>{doc.title}</title>
      {css && (
        <defs>
          {/* raw, not escaped: the CSS only holds font data, and quotes must stay quotes */}
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </defs>
      )}
      <rect x={0} y={0} width={width} height={height} fill={theme.surface} />
      {showTitle && (
        <text x={MARGIN} y={MARGIN + 17} {...font('sans600')} fontSize={16} fill={theme.text}>
          {doc.title}
        </text>
      )}

      <g transform={`translate(${plotLeft} ${top})`}>
        <RulerScale layout={layout} theme={theme} font={font} />
        {layout.markers.map((marker) => (
          <MarkerPill key={marker.pointId} marker={marker} layout={layout} theme={theme} font={font} />
        ))}
        {pinsInRuler && <Pins layout={layout} theme={theme} font={font} ruler />}
      </g>

      <g transform={`translate(${plotLeft} ${lanesTop})`}>
        <LaneGrid layout={layout} theme={theme} />
        {layout.bands.length > 0 && <GroupBars layout={layout} theme={theme} />}
        <GuideLines layout={layout} theme={theme} />
        {layout.phases.length > 0 && <PhaseBars layout={layout} theme={theme} font={font} />}
        {layout.rows.map((row) => (
          <Waveform key={row.channel.id} doc={doc} row={row} layout={layout} theme={theme} font={font} />
        ))}
        {pinsInLanes && <Pins layout={layout} theme={theme} font={font} />}
      </g>

      <text x={plotLeft - 10} y={top + 16} textAnchor="end" {...font('sans400')} fontSize={11} fill={theme.textMuted}>
        {unit ? `Time (${unit})` : 'Time'}
      </text>
      {numbered.filter(onWholeDiagram).map((comment, nth) => (
        <PinMark key={comment.id} cx={MARGIN + 19 + nth * PIN_STEP} cy={top + 13} number={numberOf(comment)} theme={theme} font={font} />
      ))}
      {layout.bands.map((band) => {
        const y = lanesTop + band.top;
        const pins = numbered.filter(onGroup(band.group.id));
        const title = fitText(band.group.title, 'sans600', 12.5, labels - 22 - pinRoom(pins.length));
        return (
          <g key={band.group.id}>
            <rect x={MARGIN} y={y} width={labels} height={GROUP_BAR} fill={theme.markerLane} />
            {band.top > 0 && <path d={`M${MARGIN} ${y + 0.5}H${plotLeft}`} fill="none" stroke={theme.axis} strokeWidth={1} />}
            {band.rows.length > 0 && (
              <path d={`M${MARGIN} ${y + GROUP_BAR + 0.5}H${plotLeft}`} fill="none" stroke={theme.rule} strokeWidth={1} />
            )}
            <text x={MARGIN + 12} y={y + GROUP_BAR / 2 + 4.5} {...font('sans600')} fontSize={12.5} fill={theme.text}>
              {title}
            </text>
            {pins.map((comment, nth) => (
              <PinMark
                key={comment.id}
                cx={MARGIN + 12 + textWidth(title, 'sans600', 12.5) + 15 + nth * PIN_STEP}
                cy={y + GROUP_BAR / 2}
                number={numberOf(comment)}
                theme={theme}
                font={font}
              />
            ))}
          </g>
        );
      })}
      {layout.rows.map((row) => {
        const { channel } = row;
        const middle = lanesTop + row.top + row.height / 2;
        const caption = channel.kind === 'analog' ? channel.unit.trim() : '';
        const pins = numbered.filter(onWholeChannel(channel.id));
        // the first lane of a group has the line of the group's bar above it
        const underBar = layout.bands.some((band) => band.rows[0] === row);
        const name = pins.length > 0 ? fitText(channel.name, 'sans600', 12, labels - 40 - pinRoom(pins.length)) : clip(channel.name, maxCharacters);
        return (
          <g key={channel.id}>
            {row.index > 0 && !underBar && (
              <path
                d={`M${MARGIN} ${lanesTop + row.top + 0.5}H${plotLeft}`}
                fill="none"
                stroke={theme.rule}
                strokeWidth={1}
              />
            )}
            <rect
              x={MARGIN + 12}
              y={middle - (caption ? 12 : 5)}
              width={10}
              height={10}
              rx={3}
              fill={channelColor(theme, channel.color)}
            />
            <text x={MARGIN + 30} y={middle + (caption ? -3 : 4)} {...font('sans600')} fontSize={12} fill={theme.text}>
              {name}
            </text>
            {caption && (
              <text x={MARGIN + 30} y={middle + 12} {...font('sans400')} fontSize={11} fill={theme.textMuted}>
                {clip(caption, maxCharacters)}
              </text>
            )}
            {pins.map((comment, nth) => (
              <PinMark
                key={comment.id}
                cx={MARGIN + 30 + textWidth(name, 'sans600', 12) + 15 + nth * PIN_STEP}
                cy={middle + (caption ? -7 : 0)}
                number={numberOf(comment)}
                theme={theme}
                font={font}
              />
            ))}
          </g>
        );
      })}
      {layout.bands.length > 0 && (
        <path d={`M${MARGIN} ${lanesTop - 0.5}H${plotLeft}`} fill="none" stroke={theme.axis} strokeWidth={1} />
      )}
      <path
        d={`M${crisp(plotLeft)} ${top}V${lanesTop + layout.lanesHeight}`}
        fill="none"
        stroke={theme.axis}
        strokeWidth={1}
      />
      <rect {...frame} fill="none" stroke={theme.axis} strokeWidth={1} />
      {list && (
        <g transform={`translate(${MARGIN} ${lanesTop + layout.lanesHeight + LIST_GAP})`}>
          <text x={0} y={11} {...font('sans600')} fontSize={12} fill={theme.text}>
            Comments
          </text>
          <g transform={`translate(0 ${LIST_HEAD})`}>
            <CommentRows list={list} theme={theme} font={font} />
          </g>
        </g>
      )}
    </svg>
  );
}

/** Draws the diagram as a standalone SVG picture. */
export function renderPicture(source: Doc, options: PictureOptions = {}): Picture {
  const mode = options.comments ?? 'pins';
  // without its comments, the diagram is drawn as if it had none
  const doc = mode === 'none' && source.comments.length > 0 ? { ...source, comments: [] } : source;
  const theme = options.theme ?? LIGHT;
  const layout = computeLayout(doc, pictureScale(doc, options.scale));
  const numbered = numberedComments(doc);
  const showTitle = (options.showTitle ?? true) && doc.title.trim() !== '';
  const labels = options.labelWidth ?? labelColumnWidth(doc, numbered);
  const width = MARGIN + labels + layout.width + MARGIN;
  const list = mode === 'list' && numbered.length > 0 ? layoutCommentList(doc, width - 2 * MARGIN) : undefined;
  const lanesTop = MARGIN + (showTitle ? TITLE_HEIGHT : 0) + layout.rulerHeight;
  const height = lanesTop + layout.lanesHeight + MARGIN + listHeight(list);
  const svg = renderToStaticMarkup(
    <PictureSvg
      doc={doc}
      layout={layout}
      theme={theme}
      font={options.font ?? webFont}
      showTitle={showTitle}
      css={options.css}
      labels={labels}
      numbered={numbered}
      list={list}
    />,
  );
  return {
    svg,
    width,
    height,
    labelWidth: labels,
    plot: {
      x0: MARGIN + labels + PAD_LEFT,
      scale: layout.scale,
      top: lanesTop,
      bottom: lanesTop + layout.lanesHeight,
    },
  };
}

/** Every piece of text the picture contains, for checking whether a font can draw it. */
export function pictureText(doc: Doc): string {
  return [
    doc.title,
    doc.time.unit,
    ...doc.channels.flatMap((channel) => [channel.name, channel.unit]),
    ...doc.groups.flatMap((group) => [group.title, ...group.phases.map((phase) => phase.title)]),
    ...doc.comments.flatMap((comment) => [comment.text, commentPlace(doc, comment)]),
  ].join('\n');
}
