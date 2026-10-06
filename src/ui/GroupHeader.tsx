/** The left end of the title bar of a group: grip, fold arrow, title and menu. */

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { duplicateGroup, groupIndex, moveGroup, removeGroup, renameGroup } from '../model/groups';
import { GROUP_BAR, layoutLanes, type Band } from '../render/layout';
import { useStore } from '../state/store';
import { addChannelOfKind } from './actions';
import { startDrag } from './drag';
import { TextField } from './fields';
import { focusGiven, focusWhenShown, isFocusWanted } from './focus';
import { ChevronDownIcon, ChevronRightIcon, CopyIcon, GripIcon, MoreIcon, PhaseIcon, RampIcon, RowsIcon, StepIcon, TrashIcon } from './icons';
import { MenuButton, MenuDivider, MenuItem } from './menus';
import { addPhaseInFirstGap } from './PhaseLayer';
import { groupDrop } from './reorder';

function GroupMenu({ band, channels }: { band: Band; channels: number }) {
  const { group } = band;
  const id = group.id;
  const only = useStore((state) => state.doc.groups.length === 1);

  const duplicate = () => {
    useStore.getState().change((doc) => {
      const copy = duplicateGroup(doc, id);
      focusWhenShown(copy.id);
      return copy.doc;
    });
  };
  const remove = (keepChannels: boolean) => {
    const { change, notify } = useStore.getState();
    change((doc) => removeGroup(doc, id, keepChannels));
    notify(keepChannels ? `Group “${group.title}” removed, its channels kept.` : `Group “${group.title}” deleted.`, 'info', true);
  };

  return (
    <>
      <MenuItem autoFocus icon={<StepIcon size={16} />} title="Add a digital channel" onSelect={() => addChannelOfKind('digital', id)} />
      <MenuItem icon={<RampIcon size={16} />} title="Add an analog channel" onSelect={() => addChannelOfKind('analog', id)} />
      <MenuItem icon={<PhaseIcon />} title="Add a phase" onSelect={() => addPhaseInFirstGap(id)} />
      <MenuDivider />
      <MenuItem
        icon={<CopyIcon />}
        title="Duplicate group"
        description="Same channels and values, as a start for another state"
        onSelect={duplicate}
      />
      <MenuItem
        icon={<RowsIcon />}
        title="Remove group, keep channels"
        description={only ? 'The diagram is without groups again' : 'They move into the neighbouring group'}
        onSelect={() => remove(true)}
      />
      <MenuItem
        icon={<TrashIcon />}
        title="Delete group"
        description={channels > 0 ? 'With its channels, phases and comments' : 'With its phases and comments'}
        onSelect={() => remove(false)}
      />
    </>
  );
}

interface GroupHeaderProps {
  band: Band;
  /** Number of channels in the group, also while they are folded away. */
  channels: number;
  /** Pins of the comments on the group. */
  pins?: ReactNode;
  /** A comment is about to be put on the group. */
  dropHere?: boolean;
}

export function GroupHeader({ band, channels, pins, dropHere }: GroupHeaderProps) {
  const { group } = band;
  const id = group.id;
  const rename = useRef(isFocusWanted(id)).current;

  useEffect(() => {
    if (rename) focusGiven(id);
  }, [rename, id]);

  /** Drag the grip: the group changes places with a neighbour once the pointer passes the middle of it. */
  const beginReorder = (event: PointerEvent<HTMLButtonElement>) => {
    const column = event.currentTarget.closest('.stage-headers');
    if (!column) return;
    startDrag(event, {
      cursor: 'grabbing',
      onStart: () => useStore.getState().beginGesture(),
      onMove: (_dx, _dy, move) => {
        const { doc, folded, change } = useStore.getState();
        const y = move.clientY - column.getBoundingClientRect().top;
        const drop = groupDrop(layoutLanes(doc, new Set(folded)), id, y);
        if (drop) change(drop);
      },
      onEnd: (dragged) => {
        if (dragged) useStore.getState().endGesture();
      },
    });
  };

  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = event.key === 'ArrowUp' ? -1 : 1;
    useStore.getState().change((doc) => moveGroup(doc, id, groupIndex(doc, id) + step));
    // the bar moves in the page, which drops the focus; pick it up again
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus());
  };

  return (
    <div className="group" data-group={id} data-folded={band.folded || undefined} data-drop={dropHere || undefined} style={{ height: GROUP_BAR }}>
      <button
        type="button"
        className="channel-grip"
        data-grip={id}
        aria-label={`Reorder group ${group.title}: drag, or use the arrow keys`}
        title="Drag to reorder"
        onPointerDown={beginReorder}
        onKeyDown={onGripKey}
      >
        <GripIcon />
      </button>
      <button
        type="button"
        className="group-toggle"
        aria-expanded={!band.folded}
        aria-label={band.folded ? `Unfold group ${group.title}` : `Fold group ${group.title} away`}
        title={band.folded ? 'Show the channels' : 'Fold away'}
        onClick={() => useStore.getState().setFolded(id, !band.folded)}
      >
        {band.folded ? <ChevronRightIcon /> : <ChevronDownIcon />}
      </button>
      <TextField
        className="field group-title"
        ariaLabel="Group title"
        value={group.title}
        required
        maxLength={80}
        autoFocus={rename}
        onCommit={(title) => useStore.getState().change((doc) => renameGroup(doc, id, title))}
      />
      {pins}
      {band.folded && (
        <span className="group-count" title={channels === 1 ? '1 channel is folded away' : `${channels} channels are folded away`}>
          {channels}
        </span>
      )}
      <MenuButton
        name={`group-${id}`}
        className="icon-button group-menu"
        ariaLabel={`Menu of group ${group.title}`}
        title="Add to the group, duplicate or remove it"
        menu={() => <GroupMenu band={band} channels={channels} />}
      >
        <MoreIcon />
      </MenuButton>
    </div>
  );
}
