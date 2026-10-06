/**
 * The diagram itself: the ruler with the transition points on top, the names
 * of groups and channels on the left, and the lanes with the waveforms. Ruler
 * and names stay in view while the lanes scroll.
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { moveComment, numberedComments } from '../model/comments';
import { anchorAt } from '../model/moments';
import { INITIAL, type Comment, type CommentTarget } from '../model/types';
import { computeLayout, type Row } from '../render/layout';
import { DARK, LIGHT, channelColor } from '../render/theme';
import { effectiveScale, useStore } from '../state/store';
import { AddRow, ChannelHeader } from './ChannelHeader';
import { dropComment, openComment, placeComment } from './comments';
import { laneTarget, previewPin, rulerTarget, type PinPreview } from './commentTargets';
import { HEADER_WIDTH } from './constants';
import { startDrag } from './drag';
import { CellEditor, CommentEditor, PhaseEditor, PointEditor } from './editors';
import { GroupHeader } from './GroupHeader';
import { Lanes } from './Lanes';
import { PhaseLayer } from './PhaseLayer';
import { NamePins, PinLayer, type PinHandlers } from './PinLayer';
import { Ruler } from './Ruler';

/** Height of the row under the lanes that holds the buttons for adding a channel or a group. */
const FOOTER_HEIGHT = 46;

const onWholeDiagram = (comment: Comment) => comment.on.kind === 'diagram' && !comment.on.at;
const onGroup = (groupId: string) => (comment: Comment) => comment.on.kind === 'group' && comment.on.group === groupId;
const onWholeChannel = (channelId: string) => (comment: Comment) =>
  comment.on.kind === 'channel' && comment.on.channel === channelId && !comment.on.at;

export function Stage() {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const themeName = useStore((state) => state.theme);
  const scale = useStore(effectiveScale);
  const foldedIds = useStore((state) => state.folded);
  const placing = useStore((state) => state.placing);
  const theme = themeName === 'dark' ? DARK : LIGHT;
  const folded = useMemo(() => new Set(foldedIds), [foldedIds]);
  const layout = useMemo(() => computeLayout(doc, scale, { folded }), [doc, scale, folded]);
  const numbered = useMemo(() => numberedComments(doc), [doc]);

  const stage = useRef<HTMLDivElement>(null);
  const rulerSvg = useRef<SVGSVGElement>(null);
  const lanesSvg = useRef<SVGSVGElement>(null);
  /** Where a comment that is being placed or moved would land. */
  const [ghost, setGhost] = useState<PinPreview | null>(null);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => useStore.getState().setViewWidth(element.clientWidth - HEADER_WIDTH - 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!placing) setGhost(null);
  }, [placing]);

  const selectedPointId =
    selection.kind === 'point' ? selection.pointId : selection.kind === 'cell' && selection.column !== INITIAL ? selection.column : undefined;
  const selectedRow =
    selection.kind === 'cell' ? layout.rows.find((row) => row.channel.id === selection.channelId)?.index : undefined;
  const selectedCommentId = selection.kind === 'comment' ? selection.commentId : undefined;

  // ───────────── comments: what a position stands for ─────────────

  /** What lies under a position of the window, for a comment that is put or moved there. */
  const targetAt = (clientX: number, clientY: number, free: boolean): CommentTarget | null => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element || !stage.current?.contains(element)) return null;
    if (element.closest('.stage-headers')) {
      const channel = element.closest<HTMLElement>('.channel')?.dataset.channel;
      if (channel) return { kind: 'channel', channel };
      const group = element.closest<HTMLElement>('.group')?.dataset.group;
      return group ? { kind: 'group', group } : null;
    }
    if (element.closest('.stage-corner')) return { kind: 'diagram' };
    const ruler = rulerSvg.current;
    if (ruler?.contains(element)) return rulerTarget(doc, layout, clientX - ruler.getBoundingClientRect().left, free);
    const lanes = lanesSvg.current;
    if (lanes?.contains(element)) {
      const rect = lanes.getBoundingClientRect();
      return laneTarget(doc, layout, clientX - rect.left, clientY - rect.top, free);
    }
    return null;
  };

  const previewAt = (clientX: number, clientY: number, free: boolean, commentId?: string): PinPreview | null => {
    const on = targetAt(clientX, clientY, free);
    return on ? previewPin(doc, scale, { folded }, on, commentId) : null;
  };

  // While the comment tool is picked up, the next click in the diagram places a comment
  // and nothing else in the diagram reacts. The handlers sit on the way down to the
  // things in the diagram, so those never hear of the click.
  const swallow = (event: MouseEvent | PointerEvent) => {
    // not the frame itself: its scroll bars keep working
    if (event.target === event.currentTarget) return;
    event.stopPropagation();
    if (event.type !== 'pointerdown') event.preventDefault();
  };
  const placingHandlers = placing
    ? {
        onPointerMoveCapture: (event: PointerEvent) => setGhost(previewAt(event.clientX, event.clientY, event.altKey)),
        onPointerLeave: () => setGhost(null),
        onPointerDownCapture: swallow,
        onMouseDownCapture: swallow,
        onDoubleClickCapture: swallow,
        onClickCapture: (event: MouseEvent) => {
          swallow(event);
          const on = targetAt(event.clientX, event.clientY, event.altKey);
          if (!on) return;
          setGhost(null);
          placeComment(on);
        },
      }
    : {};

  // ───────────── comments: their pins ─────────────

  const pinHandlers: PinHandlers = {
    /** A click opens the comment; a drag takes its pin to another place. */
    onPinDown(event, comment) {
      event.stopPropagation();
      const id = comment.id;
      let target: CommentTarget | null = null;
      startDrag(event, {
        cursor: 'grabbing',
        onStart: () => useStore.getState().select({ kind: 'comment', commentId: id }),
        onMove: (_dx, _dy, move) => {
          target = targetAt(move.clientX, move.clientY, move.altKey);
          setGhost(target ? previewPin(doc, scale, { folded }, target, id) : null);
        },
        onEnd: (dragged) => {
          setGhost(null);
          if (!dragged) openComment(id);
          else if (target) {
            const on = target;
            useStore.getState().change((current) => moveComment(current, id, on));
          }
        },
      });
    },
    onPinKey(event, comment) {
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter' || event.key === ' ') openComment(comment.id);
      else if (event.key === 'Delete' || event.key === 'Backspace') dropComment(comment.id);
      else return;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  /** The C key on something that has the keyboard focus puts a comment right there. */
  const commentKey = (event: KeyboardEvent, on: CommentTarget): boolean => {
    if (event.key.toLowerCase() !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return false;
    placeComment(on);
    return true;
  };

  const namePins = (match: (comment: Comment) => boolean) => (
    <NamePins numbered={numbered} match={match} selectedId={selectedCommentId} {...pinHandlers} />
  );

  // ───────────── drawing ─────────────

  const unit = doc.time.unit.trim();
  const channelHeader = (row: Row) => (
    <ChannelHeader
      key={row.channel.id}
      row={row}
      color={channelColor(theme, row.channel.color)}
      selected={selectedRow === row.index}
      dropHere={ghost?.nameOf === row.channel.id}
      pins={namePins(onWholeChannel(row.channel.id))}
    />
  );

  return (
    <div className="stage" ref={stage} data-placing={placing || undefined} {...placingHandlers}>
      <div className="stage-grid" style={{ gridTemplateColumns: `${HEADER_WIDTH}px ${layout.width}px` }}>
        <div className="stage-corner" data-drop={ghost?.nameOf === 'diagram' || undefined} style={{ height: layout.rulerHeight }}>
          <span className="corner-pins">{namePins(onWholeDiagram)}</span>
          <span>{unit ? `Time (${unit})` : 'Time'}</span>
          <span>Transition points</span>
        </div>

        <div className="stage-ruler" style={{ height: layout.rulerHeight }}>
          <Ruler
            doc={doc}
            layout={layout}
            theme={theme}
            selectedPointId={selectedPointId}
            svgRef={rulerSvg}
            onPointKey={(event, pointId) => commentKey(event, { kind: 'diagram', at: { point: pointId } })}
          >
            <PinLayer
              pins={layout.pins.filter((pin) => pin.where === 'ruler')}
              theme={theme}
              selectedId={selectedCommentId}
              ghost={ghost?.pin?.where === 'ruler' ? ghost.pin : null}
              {...pinHandlers}
            />
          </Ruler>
        </div>

        <div className="stage-headers">
          {layout.bands.length === 0
            ? layout.rows.map(channelHeader)
            : layout.bands.map((band) => (
                <Fragment key={band.group.id}>
                  <GroupHeader
                    band={band}
                    channels={doc.channels.filter((channel) => channel.group === band.group.id).length}
                    dropHere={ghost?.nameOf === band.group.id}
                    pins={namePins(onGroup(band.group.id))}
                  />
                  {band.rows.map(channelHeader)}
                </Fragment>
              ))}
          <AddRow height={FOOTER_HEIGHT} />
        </div>

        <div className="stage-lanes">
          <Lanes
            doc={doc}
            layout={layout}
            theme={theme}
            selection={selection}
            selectedPointId={selectedPointId}
            selectedRow={selectedRow}
            svgRef={lanesSvg}
            onValueKey={(event, channelId, column) =>
              commentKey(event, {
                kind: 'channel',
                channel: channelId,
                at: column === INITIAL ? anchorAt(doc, doc.time.start) : { point: column },
              })
            }
            under={
              layout.bands.length > 0 && (
                <PhaseLayer
                  doc={doc}
                  layout={layout}
                  theme={theme}
                  selectedPhaseId={selection.kind === 'phase' ? selection.phaseId : undefined}
                  svgRef={lanesSvg}
                  onPhaseKey={(event, phaseId) => commentKey(event, { kind: 'phase', phase: phaseId })}
                />
              )
            }
          >
            <PinLayer
              pins={layout.pins.filter((pin) => pin.where !== 'ruler')}
              theme={theme}
              selectedId={selectedCommentId}
              ghost={ghost?.pin && ghost.pin.where !== 'ruler' ? ghost.pin : null}
              {...pinHandlers}
            />
          </Lanes>
          <div className="lanes-footer" style={{ height: FOOTER_HEIGHT }}>
            {doc.channels.length === 0 && <span>No channels yet. Add one to start drawing.</span>}
          </div>
        </div>
      </div>

      <CellEditor layout={layout} lanesSvg={lanesSvg} stage={stage} />
      <PointEditor layout={layout} rulerSvg={rulerSvg} stage={stage} />
      <PhaseEditor layout={layout} lanesSvg={lanesSvg} stage={stage} />
      <CommentEditor layout={layout} stage={stage} />
    </div>
  );
}
