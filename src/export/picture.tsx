/**
 * The diagram as a finished picture: the same drawing as on screen, plus the
 * channel names and the title, without anything that only makes sense while
 * editing. Every export starts from this.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import type { Doc } from '../model/types';
import { PAD_LEFT, PAD_RIGHT, computeLayout, crisp, type Layout } from '../render/layout';
import { GuideLines, LaneGrid, MarkerPill, RulerScale, Waveform } from '../render/parts';
import { LIGHT, channelColor, webFont, type DiagramTheme, type FontResolver } from '../render/theme';

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

/** Width of the column with the channel names, from the longest name. */
function labelColumnWidth(doc: Doc): number {
  const longest = doc.channels.reduce((length, channel) => Math.max(length, channel.name.length), 0);
  return Math.round(Math.min(300, Math.max(110, 46 + longest * 6.9)));
}

function PictureSvg({
  doc,
  layout,
  theme,
  font,
  showTitle,
  css,
  labels,
}: {
  doc: Doc;
  layout: Layout;
  theme: DiagramTheme;
  font: FontResolver;
  showTitle: boolean;
  css?: string;
  labels: number;
}) {
  const top = MARGIN + (showTitle ? TITLE_HEIGHT : 0);
  const lanesTop = top + layout.rulerHeight;
  const plotLeft = MARGIN + labels;
  const width = plotLeft + layout.width + MARGIN;
  const height = lanesTop + layout.lanesHeight + MARGIN;
  const maxCharacters = Math.floor((labels - 40) / 6.6);
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
      </g>

      <g transform={`translate(${plotLeft} ${lanesTop})`}>
        <LaneGrid layout={layout} theme={theme} />
        <GuideLines layout={layout} theme={theme} />
        {layout.rows.map((row) => (
          <Waveform key={row.channel.id} doc={doc} row={row} layout={layout} theme={theme} font={font} />
        ))}
      </g>

      <text x={plotLeft - 10} y={top + 16} textAnchor="end" {...font('sans400')} fontSize={11} fill={theme.textMuted}>
        {unit ? `Time (${unit})` : 'Time'}
      </text>
      {layout.rows.map((row) => {
        const { channel } = row;
        const middle = lanesTop + row.top + row.height / 2;
        const caption = channel.kind === 'analog' ? channel.unit.trim() : '';
        return (
          <g key={channel.id}>
            {row.index > 0 && (
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
              {clip(channel.name, maxCharacters)}
            </text>
            {caption && (
              <text x={MARGIN + 30} y={middle + 12} {...font('sans400')} fontSize={11} fill={theme.textMuted}>
                {clip(caption, maxCharacters)}
              </text>
            )}
          </g>
        );
      })}
      <path
        d={`M${crisp(plotLeft)} ${top}V${lanesTop + layout.lanesHeight}`}
        fill="none"
        stroke={theme.axis}
        strokeWidth={1}
      />
      <rect {...frame} fill="none" stroke={theme.axis} strokeWidth={1} />
    </svg>
  );
}

/** Draws the diagram as a standalone SVG picture. */
export function renderPicture(doc: Doc, options: PictureOptions = {}): Picture {
  const theme = options.theme ?? LIGHT;
  const layout = computeLayout(doc, pictureScale(doc, options.scale));
  const showTitle = (options.showTitle ?? true) && doc.title.trim() !== '';
  const labels = options.labelWidth ?? labelColumnWidth(doc);
  const width = MARGIN + labels + layout.width + MARGIN;
  const lanesTop = MARGIN + (showTitle ? TITLE_HEIGHT : 0) + layout.rulerHeight;
  const height = lanesTop + layout.lanesHeight + MARGIN;
  const svg = renderToStaticMarkup(
    <PictureSvg
      doc={doc}
      layout={layout}
      theme={theme}
      font={options.font ?? webFont}
      showTitle={showTitle}
      css={options.css}
      labels={labels}
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
  return [doc.title, doc.time.unit, ...doc.channels.flatMap((channel) => [channel.name, channel.unit])].join('\n');
}
