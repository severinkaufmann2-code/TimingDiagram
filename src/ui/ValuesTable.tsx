/**
 * Every number of the diagram in one table: a row per channel, a column per
 * transition point. It edits the same data as the drawing above it.
 */

import { Fragment, useRef, type KeyboardEvent } from 'react';
import { clearValue, removePoint, setMode, setPointTime, setValue } from '../model/doc';
import { decimalsOf } from '../model/numbers';
import { INITIAL, type Channel, type Column } from '../model/types';
import { DARK, LIGHT, channelColor } from '../render/theme';
import { useStore } from '../state/store';
import { addPointAtEnd } from './actions';
import { NumberField } from './fields';
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CloseIcon, PlusIcon, RampIcon, StepIcon } from './icons';

export function ValuesTable() {
  const doc = useStore((state) => state.doc);
  const selection = useStore((state) => state.selection);
  const open = useStore((state) => state.tableOpen);
  const folded = useStore((state) => state.folded);
  const themeName = useStore((state) => state.theme);
  const change = useStore((state) => state.change);
  const theme = themeName === 'dark' ? DARK : LIGHT;
  const table = useRef<HTMLTableElement>(null);

  const timeDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const unit = doc.time.unit.trim();
  const selectedPointId =
    selection.kind === 'point' ? selection.pointId : selection.kind === 'cell' && selection.column !== INITIAL ? selection.column : null;
  const isSelectedCell = (channelId: string, column: Column) =>
    selection.kind === 'cell' && selection.channelId === channelId && selection.column === column;

  const notANumber = (text: string) => useStore.getState().notify(`“${text}” is not a number.`, 'error');

  const focusCell = (row: number, col: number): boolean => {
    const field = table.current?.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
    if (!field) return false;
    field.focus();
    return true;
  };

  /** Arrow up and down walk through a column, like in a spreadsheet. */
  const walk = (event: KeyboardEvent<HTMLInputElement>, row: number, col: number): boolean => {
    if (event.key === 'ArrowUp') return focusCell(row - 1, col);
    if (event.key === 'ArrowDown') return focusCell(row + 1, col);
    return false;
  };

  const channelRow = (channel: Channel, row: number) => (
    <tr key={channel.id} data-selected={(selection.kind === 'cell' && selection.channelId === channel.id) || undefined}>
      <th scope="row" className="values-channel">
        <span className="values-name">
          <span className="values-swatch" style={{ background: channelColor(theme, channel.color) }} aria-hidden="true" />
          <span className="values-name-text">{channel.name}</span>
          {channel.kind === 'analog' && channel.unit && <span className="values-unit">{channel.unit}</span>}
        </span>
      </th>
      <td className="values-initial" data-selected={isSelectedCell(channel.id, INITIAL) || undefined}>
        <div className="values-cell">
          <NumberField
            className="field field-number"
            ariaLabel={`Initial value of ${channel.name}`}
            value={channel.initial}
            data={{ row, col: 0 }}
            onFocus={() => useStore.getState().select({ kind: 'cell', channelId: channel.id, column: INITIAL })}
            onCommit={(value) => change((d) => setValue(d, channel.id, INITIAL, value))}
            onInvalid={notANumber}
            onEnter={() => focusCell(row + 1, 0)}
            onKey={(event) => walk(event, row, 0)}
          />
        </div>
      </td>
      {doc.points.map((point, index) => {
        const cell = channel.cells[point.id];
        const col = index + 1;
        return (
          <td key={point.id} data-selected={isSelectedCell(channel.id, point.id) || undefined} data-column={point.id === selectedPointId || undefined}>
            <div className="values-cell">
              <button
                type="button"
                className="mode-toggle"
                style={{ visibility: cell ? 'visible' : 'hidden' }}
                aria-label={cell?.mode === 'ramp' ? 'Ramp. Switch to step' : 'Step. Switch to ramp'}
                title={
                  cell?.mode === 'ramp'
                    ? 'Ramp: changes gradually from the previous point. Click for step.'
                    : 'Step: keeps the previous value, then jumps. Click for ramp.'
                }
                tabIndex={-1}
                onClick={() => change((d) => setMode(d, channel.id, point.id, cell?.mode === 'ramp' ? 'step' : 'ramp'))}
              >
                {cell?.mode === 'ramp' ? <RampIcon /> : <StepIcon />}
              </button>
              <NumberField
                className="field field-number"
                ariaLabel={`${channel.name} at transition point ${col}`}
                value={cell?.value ?? null}
                placeholder="–"
                data={{ row, col }}
                onFocus={() => useStore.getState().select({ kind: 'cell', channelId: channel.id, column: point.id })}
                onCommit={(value) => change((d) => setValue(d, channel.id, point.id, value))}
                onClear={() => change((d) => clearValue(d, channel.id, point.id))}
                onInvalid={notANumber}
                onEnter={() => focusCell(row + 1, col)}
                onKey={(event) => {
                  const key = event.key.toLowerCase();
                  if ((key === 's' || key === 'r') && !event.ctrlKey && !event.metaKey) {
                    change((d) => setMode(d, channel.id, point.id, key === 's' ? 'step' : 'ramp'));
                    return true;
                  }
                  return walk(event, row, col);
                }}
              />
            </div>
          </td>
        );
      })}
      <td className="values-add" />
    </tr>
  );

  let shownRows = 0;

  return (
    <section className="values" aria-label="Values">
      <div className="values-head">
        <button
          type="button"
          className="values-toggle"
          aria-expanded={open}
          onClick={() => useStore.getState().setTableOpen(!open)}
        >
          {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
          <h2>Values</h2>
        </button>
        <span className="values-hint">One column per transition point. An empty cell keeps the previous value.</span>
      </div>
      {open && (
        <div className="values-scroll">
          <table className="values-table" ref={table}>
            <thead>
              <tr>
                <th scope="col" className="values-channel">
                  Channel
                </th>
                <th scope="col" className="values-initial">
                  Initial value
                </th>
                {doc.points.map((point, index) => (
                  <th key={point.id} scope="col" className="values-point" data-selected={point.id === selectedPointId || undefined}>
                    <div className="values-time">
                      <NumberField
                        className="field field-number"
                        ariaLabel={`Time of transition point ${index + 1}${unit ? ` in ${unit}` : ''}`}
                        value={point.time}
                        minDecimals={timeDecimals}
                        data={{ row: -1, col: index + 1 }}
                        onFocus={() => useStore.getState().select({ kind: 'point', pointId: point.id })}
                        onCommit={(time) => change((d) => setPointTime(d, point.id, time))}
                        onInvalid={notANumber}
                        onKey={(event) => walk(event, -1, index + 1)}
                      />
                      {unit && <span className="values-unit">{unit}</span>}
                      <button
                        type="button"
                        className="icon-button small values-remove"
                        aria-label={`Delete transition point ${index + 1}`}
                        title="Delete this transition point"
                        tabIndex={-1}
                        onClick={() => change((d) => removePoint(d, point.id))}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </th>
                ))}
                <th scope="col" className="values-add">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Add a transition point"
                    title="Add a transition point"
                    onClick={addPointAtEnd}
                  >
                    <PlusIcon />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.groups.length === 0
                ? doc.channels.map(channelRow)
                : doc.groups.map((group) => {
                    const isFolded = folded.includes(group.id);
                    const channels = doc.channels.filter((channel) => channel.group === group.id);
                    // the rows of the table are counted without the folded ones, for the arrow keys
                    const firstRow = shownRows;
                    if (!isFolded) shownRows += channels.length;
                    return (
                      <Fragment key={group.id}>
                        <tr className="values-group" data-group={group.id}>
                          <th scope="rowgroup" className="values-channel">
                            <span className="values-name">
                              <button
                                type="button"
                                className="values-fold"
                                aria-expanded={!isFolded}
                                aria-label={isFolded ? `Unfold group ${group.title}` : `Fold group ${group.title} away`}
                                onClick={() => useStore.getState().setFolded(group.id, !isFolded)}
                              >
                                {isFolded ? <ChevronRightIcon /> : <ChevronDownIcon />}
                              </button>
                              <span className="values-name-text">{group.title}</span>
                              {isFolded && <span className="group-count">{channels.length}</span>}
                            </span>
                          </th>
                          <td colSpan={doc.points.length + 2} />
                        </tr>
                        {!isFolded && channels.map((channel, index) => channelRow(channel, firstRow + index))}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
