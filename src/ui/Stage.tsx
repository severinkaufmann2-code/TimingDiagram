/**
 * The diagram itself: the ruler with the transition points on top, the names
 * of groups and channels on the left, and the lanes with the waveforms. Ruler
 * and names stay in view while the lanes scroll.
 */

import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { INITIAL } from '../model/types';
import { computeLayout } from '../render/layout';
import { Pins } from '../render/parts';
import { DARK, LIGHT, channelColor } from '../render/theme';
import { effectiveScale, useStore } from '../state/store';
import { AddRow, ChannelHeader } from './ChannelHeader';
import { HEADER_WIDTH } from './constants';
import { CellEditor, PhaseEditor, PointEditor } from './editors';
import { GroupHeader } from './GroupHeader';
import { Lanes } from './Lanes';
import { PhaseLayer } from './PhaseLayer';
import { Ruler } from './Ruler';

/** Height of the row under the lanes that holds the buttons for adding a channel or a group. */
const FOOTER_HEIGHT = 46;

export function Stage() {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const themeName = useStore((state) => state.theme);
  const scale = useStore(effectiveScale);
  const foldedIds = useStore((state) => state.folded);
  const theme = themeName === 'dark' ? DARK : LIGHT;
  const folded = useMemo(() => new Set(foldedIds), [foldedIds]);
  const layout = useMemo(() => computeLayout(doc, scale, { folded }), [doc, scale, folded]);

  const stage = useRef<HTMLDivElement>(null);
  const rulerSvg = useRef<SVGSVGElement>(null);
  const lanesSvg = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => useStore.getState().setViewWidth(element.clientWidth - HEADER_WIDTH - 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selectedPointId =
    selection.kind === 'point' ? selection.pointId : selection.kind === 'cell' && selection.column !== INITIAL ? selection.column : undefined;
  const selectedRow =
    selection.kind === 'cell' ? layout.rows.find((row) => row.channel.id === selection.channelId)?.index : undefined;

  const unit = doc.time.unit.trim();
  const channelHeader = (row: (typeof layout.rows)[number]) => (
    <ChannelHeader key={row.channel.id} row={row} color={channelColor(theme, row.channel.color)} selected={selectedRow === row.index} />
  );

  return (
    <div className="stage" ref={stage}>
      <div className="stage-grid" style={{ gridTemplateColumns: `${HEADER_WIDTH}px ${layout.width}px` }}>
        <div className="stage-corner" style={{ height: layout.rulerHeight }}>
          <span>{unit ? `Time (${unit})` : 'Time'}</span>
          <span>Transition points</span>
        </div>

        <div className="stage-ruler" style={{ height: layout.rulerHeight }}>
          <Ruler doc={doc} layout={layout} theme={theme} selectedPointId={selectedPointId} svgRef={rulerSvg}>
            <g pointerEvents="none">
              <Pins layout={layout} theme={theme} ruler />
            </g>
          </Ruler>
        </div>

        <div className="stage-headers">
          {layout.bands.length === 0
            ? layout.rows.map(channelHeader)
            : layout.bands.map((band) => (
                <Fragment key={band.group.id}>
                  <GroupHeader band={band} channels={doc.channels.filter((channel) => channel.group === band.group.id).length} />
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
            under={
              layout.bands.length > 0 && (
                <PhaseLayer
                  doc={doc}
                  layout={layout}
                  theme={theme}
                  selectedPhaseId={selection.kind === 'phase' ? selection.phaseId : undefined}
                  svgRef={lanesSvg}
                />
              )
            }
          >
            <g pointerEvents="none">
              <Pins layout={layout} theme={theme} />
            </g>
          </Lanes>
          <div className="lanes-footer" style={{ height: FOOTER_HEIGHT }}>
            {doc.channels.length === 0 && <span>No channels yet. Add one to start drawing.</span>}
          </div>
        </div>
      </div>

      <CellEditor layout={layout} lanesSvg={lanesSvg} stage={stage} />
      <PointEditor layout={layout} rulerSvg={rulerSvg} stage={stage} />
      <PhaseEditor layout={layout} lanesSvg={lanesSvg} stage={stage} />
    </div>
  );
}
