/** The left column of the diagram: one header per channel, and the row that adds channels. */

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { addChannel, moveChannel, removeChannel, setAllModes, setChannelKind, updateChannel } from '../model/doc';
import { formatNumber } from '../model/numbers';
import type { Channel, ChannelKind } from '../model/types';
import { layoutRows, type Layout, type Row } from '../render/layout';
import { DARK, LIGHT } from '../render/theme';
import { useStore } from '../state/store';
import { startDrag } from './drag';
import { Segmented } from './editors';
import { NumberField, TextField } from './fields';
import { GripIcon, PlusIcon, RampIcon, StepIcon, TrashIcon } from './icons';
import { MenuButton, MenuItem } from './menus';
import { Popover } from './Popover';

const COLOR_NAMES = ['Blue', 'Orange', 'Green', 'Yellow', 'Pink', 'Dark green', 'Violet', 'Red'];

/** Channel whose name field takes the keyboard focus as soon as it appears. */
let renameOnMount: string | null = null;

/** Adds a channel at the bottom and puts the cursor into its name. */
export function addChannelOfKind(kind: ChannelKind): void {
  const { change, closePanel } = useStore.getState();
  change((doc) => {
    const added = addChannel(doc, kind);
    renameOnMount = added.id;
    return added.doc;
  });
  closePanel();
}

export function AddChannelItems() {
  return (
    <>
      <MenuItem
        autoFocus
        icon={<StepIcon size={16} />}
        title="Digital channel"
        description="Two levels, 0 and 1"
        onSelect={() => addChannelOfKind('digital')}
      />
      <MenuItem
        icon={<RampIcon size={16} />}
        title="Analog channel"
        description="Any value, with unit and range"
        onSelect={() => addChannelOfKind('analog')}
      />
    </>
  );
}

function describeKind(channel: Channel): string {
  if (channel.kind === 'digital') return 'Digital · 0 / 1';
  const unit = channel.unit ? ` ${channel.unit}` : '';
  return `Analog · ${formatNumber(channel.min)} to ${formatNumber(channel.max)}${unit}`;
}

interface ChannelHeaderProps {
  row: Row;
  layout: Layout;
  color: string;
  selected: boolean;
}

export function ChannelHeader({ row, layout, color, selected }: ChannelHeaderProps) {
  const { channel } = row;
  const id = channel.id;
  const settingsOpen = useStore((state) => state.panel?.type === 'channel' && state.panel.channelId === id);
  const kindButton = useRef<HTMLButtonElement>(null);
  const rename = useRef(renameOnMount === id).current;

  useEffect(() => {
    if (rename) renameOnMount = null;
  }, [rename]);

  const toggleSettings = () => {
    const { openPanel, closePanel } = useStore.getState();
    if (settingsOpen) closePanel();
    else openPanel({ type: 'channel', channelId: id });
  };

  /** Drag the grip: the channel changes places with a neighbour once the pointer passes its middle. */
  const beginReorder = (event: PointerEvent<HTMLButtonElement>) => {
    const column = event.currentTarget.closest('.stage-headers');
    if (!column) return;
    startDrag(event, {
      cursor: 'grabbing',
      onStart: () => useStore.getState().beginGesture(),
      onMove: (_dx, _dy, move) => {
        const { doc, change } = useStore.getState();
        const y = move.clientY - column.getBoundingClientRect().top;
        const rows = layoutRows(doc);
        const from = rows.findIndex((candidate) => candidate.channel.id === id);
        const over =
          rows.find((candidate) => y >= candidate.top && y < candidate.top + candidate.height) ??
          (y < 0 ? rows[0] : rows[rows.length - 1]);
        if (from < 0 || !over || over.index === from) return;
        const middle = over.top + over.height / 2;
        if ((over.index > from && y > middle) || (over.index < from && y < middle)) {
          change((d) => moveChannel(d, id, over.index));
        }
      },
      onEnd: (dragged) => {
        if (dragged) useStore.getState().endGesture();
      },
    });
  };

  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const target = row.index + (event.key === 'ArrowUp' ? -1 : 1);
    if (target < 0 || target >= layout.rows.length) return;
    useStore.getState().change((doc) => moveChannel(doc, id, target));
    // the row moves in the page, which drops the focus; pick it up again
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus());
  };

  const remove = () => {
    const { change, notify } = useStore.getState();
    change((doc) => removeChannel(doc, id));
    notify(`“${channel.name}” removed. Undo brings it back.`);
  };

  return (
    <div className="channel" data-channel={id} data-selected={selected || undefined} style={{ height: row.height }}>
      <button
        type="button"
        className="channel-grip"
        data-grip={id}
        aria-label={`Reorder ${channel.name}: drag, or use the arrow keys`}
        title="Drag to reorder"
        onPointerDown={beginReorder}
        onKeyDown={onGripKey}
      >
        <GripIcon />
      </button>
      <button
        type="button"
        className="channel-swatch"
        style={{ background: color }}
        aria-label={`Colour and settings of ${channel.name}`}
        title="Colour and settings"
        onClick={toggleSettings}
      />
      <div className="channel-text">
        <TextField
          className="field channel-name"
          ariaLabel="Channel name"
          value={channel.name}
          required
          autoFocus={rename}
          onCommit={(name) => useStore.getState().change((doc) => updateChannel(doc, id, { name }))}
        />
        <button
          ref={kindButton}
          type="button"
          className="channel-kind"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title="Type, colour, unit and range"
          onClick={toggleSettings}
        >
          {describeKind(channel)}
        </button>
      </div>
      <button
        type="button"
        className="icon-button channel-remove"
        aria-label={`Remove channel ${channel.name}`}
        title="Remove channel"
        onClick={remove}
      >
        <TrashIcon />
      </button>
      {settingsOpen && <ChannelSettings channel={channel} trigger={kindButton} />}
    </div>
  );
}

function ChannelSettings({ channel, trigger }: { channel: Channel; trigger: React.RefObject<HTMLButtonElement | null> }) {
  const themeName = useStore((state) => state.theme);
  const change = useStore((state) => state.change);
  const closePanel = useStore((state) => state.closePanel);
  const palette = (themeName === 'dark' ? DARK : LIGHT).channels;
  const id = channel.id;
  const notANumber = (text: string) => useStore.getState().notify(`“${text}” is not a number.`, 'error');

  return (
    <Popover
      anchor={() => trigger.current?.getBoundingClientRect() ?? null}
      trigger={trigger}
      side="bottom"
      align="start"
      label={`Settings of ${channel.name}`}
      onClose={closePanel}
    >
      <div className="settings">
        <div className="settings-row">
          <span className="settings-label">Type</span>
          <Segmented
            label="Type"
            value={channel.kind}
            options={[
              { value: 'digital', label: 'Digital', title: 'Two levels, 0 and 1' },
              { value: 'analog', label: 'Analog', title: 'Any value, with a unit and a range' },
            ]}
            onChange={(kind) => change((doc) => setChannelKind(doc, id, kind))}
          />
        </div>
        <div className="settings-row">
          <span className="settings-label">Colour</span>
          <div className="swatches" role="group" aria-label="Colour">
            {palette.map((hex, index) => (
              <button
                key={hex + index}
                type="button"
                className="swatch-option"
                style={{ background: hex }}
                aria-label={COLOR_NAMES[index] ?? `Colour ${index + 1}`}
                title={COLOR_NAMES[index]}
                aria-pressed={channel.color === index}
                onClick={() => change((doc) => updateChannel(doc, id, { color: index }))}
              />
            ))}
          </div>
        </div>
        {channel.kind === 'analog' && (
          <>
            <div className="settings-row">
              <span className="settings-label">Unit</span>
              <TextField
                className="field settings-unit"
                ariaLabel="Unit of the values"
                placeholder="e.g. mm"
                value={channel.unit}
                maxLength={12}
                onCommit={(unit) => change((doc) => updateChannel(doc, id, { unit }))}
              />
            </div>
            <div className="settings-row">
              <span className="settings-label">Range</span>
              <NumberField
                className="field field-number settings-range"
                ariaLabel="Lowest value shown"
                value={channel.min}
                onCommit={(min) => change((doc) => updateChannel(doc, id, { min }))}
                onInvalid={notANumber}
              />
              <span className="settings-to">to</span>
              <NumberField
                className="field field-number settings-range"
                ariaLabel="Highest value shown"
                value={channel.max}
                onCommit={(max) => change((doc) => updateChannel(doc, id, { max }))}
                onInvalid={notANumber}
              />
            </div>
          </>
        )}
        <div className="settings-row">
          <span className="settings-label">All transitions</span>
          <div className="button-pair">
            <button type="button" className="text-button outlined" onClick={() => change((doc) => setAllModes(doc, id, 'step'))}>
              <StepIcon /> Step
            </button>
            <button type="button" className="text-button outlined" onClick={() => change((doc) => setAllModes(doc, id, 'ramp'))}>
              <RampIcon /> Ramp
            </button>
          </div>
        </div>
      </div>
    </Popover>
  );
}

export function AddChannelRow({ height }: { height: number }) {
  return (
    <div className="channel-add" style={{ height }}>
      <MenuButton name="add-channel" className="add-channel-button" menu={() => <AddChannelItems />}>
        <PlusIcon /> Add channel
      </MenuButton>
    </div>
  );
}
