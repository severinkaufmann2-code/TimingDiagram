/** The bar across the top: title, undo, adding things, timeline settings, zoom, files and export. */

import { setTimeAxis, setTitle } from '../model/doc';
import { formatNumber, niceStep } from '../model/numbers';
import { useStore, type PdfPage } from '../state/store';
import { addGroupNow, addPointAtEnd, loadExample, newDiagram, openProject, runExport, saveCurrentProject, zoomBy } from './actions';
import { AddChannelItems } from './ChannelHeader';
import { Segmented } from './editors';
import { NumberField, TextField } from './fields';
import {
  ChevronDownIcon,
  CommentIcon,
  ExportIcon,
  FileIcon,
  FitIcon,
  FolderIcon,
  GroupIcon,
  HelpIcon,
  LogoIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  PointIcon,
  RedoIcon,
  SaveIcon,
  SunIcon,
  UndoIcon,
} from './icons';
import { MenuButton, MenuDivider, MenuItem } from './menus';

const UNIT_PRESETS = ['s', 'ms', 'µs', 'ns', 'min', '°'];

function notANumber(text: string) {
  useStore.getState().notify(`“${text}” is not a number.`, 'error');
}

/** Unit, range and snap grid of the time axis. */
function TimelinePanel() {
  const time = useStore((state) => state.doc.time);
  const change = useStore((state) => state.change);
  const span = time.end - time.start;
  const snapPresets = [0, niceStep(span / 1000), niceStep(span / 100), niceStep(span / 20), niceStep(span / 8)].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <div className="settings timeline-panel">
      <div className="settings-row">
        <span className="settings-label">Unit</span>
        <TextField
          className="field settings-unit"
          ariaLabel="Unit of the time axis"
          placeholder="none"
          maxLength={12}
          value={time.unit}
          onCommit={(unit) => change((doc) => setTimeAxis(doc, { unit }))}
        />
        <div className="chips" role="group" aria-label="Common units">
          {UNIT_PRESETS.map((unit) => (
            <button
              key={unit}
              type="button"
              className="chip"
              aria-pressed={time.unit === unit}
              onClick={() => change((doc) => setTimeAxis(doc, { unit }))}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Range</span>
        <NumberField
          className="field field-number settings-range"
          ariaLabel="Start of the timeline"
          value={time.start}
          onCommit={(start) => change((doc) => setTimeAxis(doc, { start }))}
          onInvalid={notANumber}
        />
        <span className="settings-to">to</span>
        <NumberField
          className="field field-number settings-range"
          ariaLabel="End of the timeline"
          value={time.end}
          onCommit={(end) => change((doc) => setTimeAxis(doc, { end }))}
          onInvalid={notANumber}
        />
        {time.unit && <span className="settings-to">{time.unit}</span>}
      </div>
      <div className="settings-row">
        <span className="settings-label">Snap</span>
        <NumberField
          className="field field-number settings-range"
          ariaLabel="Snap grid for dragged points"
          value={time.snap > 0 ? time.snap : null}
          placeholder="off"
          onCommit={(snap) => change((doc) => setTimeAxis(doc, { snap: Math.abs(snap) }))}
          onClear={() => change((doc) => setTimeAxis(doc, { snap: 0 }))}
          onInvalid={notANumber}
        />
        <div className="chips" role="group" aria-label="Common snap grids">
          {snapPresets.map((snap) => (
            <button
              key={snap}
              type="button"
              className="chip"
              aria-pressed={time.snap === snap}
              onClick={() => change((doc) => setTimeAxis(doc, { snap }))}
            >
              {snap === 0 ? 'off' : formatNumber(snap)}
            </button>
          ))}
        </div>
      </div>
      <p className="settings-note">Dragged points land on the snap grid. Hold Alt while dragging to place them freely.</p>
    </div>
  );
}

/** Everything that can be added to the diagram, in one menu: the toolbar has no room for a button each. */
function AddMenu() {
  return (
    <>
      <AddChannelItems />
      <MenuItem
        icon={<PointIcon />}
        title="Transition point"
        description="After the last one, ready for its exact time"
        onSelect={addPointAtEnd}
      />
      <MenuDivider />
      <MenuItem icon={<GroupIcon />} title="Group" description="A titled block of channels, e.g. one per state" onSelect={addGroupNow} />
    </>
  );
}

function ExportMenu() {
  const pdfPage = useStore((state) => state.pdfPage);
  const exportComments = useStore((state) => state.exportComments);
  const hasComments = useStore((state) => state.doc.comments.length > 0);
  return (
    <>
      <MenuItem
        autoFocus
        badge="XLSX"
        title="Excel workbook"
        description="Values table and a picture of the diagram"
        onSelect={() => void runExport('xlsx')}
      />
      <MenuItem badge="PDF" title="PDF document" description="Sharp at any zoom, ready to print" onSelect={() => void runExport('pdf')} />
      <MenuItem badge="HTML" title="Web page" description="One file that opens in any browser" onSelect={() => void runExport('html')} />
      <MenuDivider />
      <MenuItem badge="PNG" title="Picture" description="For documents and slides" onSelect={() => void runExport('png')} />
      <MenuItem badge="SVG" title="Vector picture" description="Scales without loss, editable in drawing tools" onSelect={() => void runExport('svg')} />
      <MenuDivider />
      <div className="menu-option">
        <span className="menu-option-label">PDF page</span>
        <Segmented<PdfPage>
          label="PDF page"
          value={pdfPage}
          options={[
            { value: 'a4', label: 'A4', title: 'A4 landscape, diagram fitted to the page' },
            { value: 'a3', label: 'A3', title: 'A3 landscape, diagram fitted to the page' },
            { value: 'fit', label: 'Exact size', title: 'A page exactly as large as the diagram' },
          ]}
          onChange={(page) => useStore.getState().setPdfPage(page)}
        />
      </div>
      {hasComments && (
        <div className="menu-option">
          <span className="menu-option-label">Comments</span>
          <Segmented<'show' | 'hide'>
            label="Comments in exports"
            value={exportComments ? 'show' : 'hide'}
            options={[
              { value: 'show', label: 'Show', title: 'Pins in the drawing, and the texts as a list' },
              { value: 'hide', label: 'Hide', title: 'A drawing without pins, and no list of comments' },
            ]}
            onChange={(choice) => useStore.getState().setExportComments(choice === 'show')}
          />
        </div>
      )}
    </>
  );
}

function HelpPanel() {
  return (
    <div className="help">
      <div className="help-examples">
        <button
          type="button"
          className="text-button outlined"
          onClick={() => {
            useStore.getState().closePanel();
            loadExample();
          }}
        >
          <LogoIcon /> Load the example diagram
        </button>
        <button
          type="button"
          className="text-button outlined"
          onClick={() => {
            useStore.getState().closePanel();
            loadExample(true);
          }}
        >
          <GroupIcon /> Load the example with groups
        </button>
      </div>
      <h3>Channels</h3>
      <ul>
        <li>
          <b>Add channel</b> under the lanes adds a digital (0 / 1) or an analog channel.
        </li>
        <li>Click a name to rename it. Click the line under the name for type, colour, unit and range.</li>
        <li>Drag the grip on the left to reorder. The bin removes the channel.</li>
      </ul>
      <h3>Transition points</h3>
      <ul>
        <li>Click the lane under the ruler to add a point.</li>
        <li>
          Drag a point to move it. Hold <kbd>Alt</kbd> to ignore the snap grid, <kbd>Shift</kbd> to move all later points along.
        </li>
        <li>Click a point to type its exact time, or to delete it.</li>
      </ul>
      <h3>Values</h3>
      <ul>
        <li>Move the pointer over a lane: every crossing with a point shows a dot. Drag it up or down, or click it and type.</li>
        <li>Double-click anywhere in a lane to put a transition right there.</li>
        <li>
          <b>Step</b> keeps the previous value and then jumps. <b>Ramp</b> changes gradually from the previous point.
        </li>
        <li>The table at the bottom shows and edits the same numbers.</li>
      </ul>
      <h3>Keyboard</h3>
      <dl>
        <dt>
          <kbd>Ctrl</kbd> <kbd>Z</kbd> / <kbd>Ctrl</kbd> <kbd>Y</kbd>
        </dt>
        <dd>Undo / redo</dd>
        <dt>
          <kbd>Ctrl</kbd> <kbd>S</kbd> / <kbd>Ctrl</kbd> <kbd>O</kbd>
        </dt>
        <dd>Save / open a project file</dd>
        <dt>
          <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
        </dt>
        <dd>Move the selected point, or change the selected value</dd>
        <dt>
          <kbd>S</kbd> / <kbd>R</kbd>
        </dt>
        <dd>Make the selected value a step / a ramp</dd>
        <dt>
          <kbd>Del</kbd>
        </dt>
        <dd>Delete the selected point or value</dd>
        <dt>
          <kbd>Ctrl</kbd> + wheel
        </dt>
        <dd>Zoom the timeline</dd>
      </dl>
    </div>
  );
}

export function Toolbar() {
  const title = useStore((state) => state.doc.title);
  const time = useStore((state) => state.doc.time);
  const canUndo = useStore((state) => state.past.length > 0);
  const canRedo = useStore((state) => state.future.length > 0);
  const zoom = useStore((state) => state.zoom);
  const theme = useStore((state) => state.theme);
  const placing = useStore((state) => state.placing);
  const { change, undo, redo, setZoom, setTheme, setPlacing } = useStore.getState();
  const unit = time.unit.trim();

  return (
    <header className="toolbar" role="toolbar" aria-label="Diagram tools">
      <div className="toolbar-group">
        <span className="logo" aria-hidden="true">
          <LogoIcon />
        </span>
        <TextField
          className="field title-field"
          ariaLabel="Diagram title"
          value={title}
          required
          onCommit={(next) => change((doc) => setTitle(doc, next))}
        />
      </div>

      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group tight">
        <button type="button" className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <RedoIcon />
        </button>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group">
        <MenuButton name="add" className="button" title="Add a channel, a transition point or a group" menu={() => <AddMenu />}>
          <PlusIcon /> Add <ChevronDownIcon />
        </MenuButton>
        <button
          type="button"
          className="button"
          aria-pressed={placing}
          title="Pin a comment to the diagram: click here, then where it belongs (C)"
          onClick={() => setPlacing(!placing)}
        >
          <CommentIcon /> Comment
        </button>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group">
        <MenuButton
          name="timeline"
          kind="panel"
          className="button"
          title="Unit, range and snap grid of the time axis"
          ariaLabel="Timeline settings"
          menu={() => <TimelinePanel />}
        >
          <span className="button-caption">Timeline</span>
          <span className="mono">
            {formatNumber(time.start)} – {formatNumber(time.end)}
            {unit ? ` ${unit}` : ''}
          </span>
          <span className="button-caption">Snap</span>
          <span className="mono">{time.snap > 0 ? formatNumber(time.snap) : 'off'}</span>
          <ChevronDownIcon />
        </MenuButton>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group tight">
        <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(-1)}>
          <MinusIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Fit the whole timeline"
          title="Fit the whole timeline into the window"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom('fit')}
        >
          <FitIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1)}>
          <PlusIcon />
        </button>
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-group">
        <button type="button" className="button compact" aria-label="New diagram" title="New diagram" onClick={newDiagram}>
          <FileIcon /> <span className="wide-only">New</span>
        </button>
        <button
          type="button"
          className="button compact"
          aria-label="Open a project file"
          title="Open a project file (Ctrl+O)"
          onClick={() => void openProject()}
        >
          <FolderIcon /> <span className="wide-only">Open</span>
        </button>
        <button
          type="button"
          className="button compact"
          aria-label="Save as a project file"
          title="Save the diagram as a project file (Ctrl+S)"
          onClick={saveCurrentProject}
        >
          <SaveIcon /> <span className="wide-only">Save</span>
        </button>
        <MenuButton name="export" className="button primary" align="end" title="Export" menu={() => <ExportMenu />}>
          <ExportIcon /> Export <ChevronDownIcon />
        </MenuButton>
      </div>

      <div className="toolbar-group tight">
        <button
          type="button"
          className="icon-button"
          aria-label={theme === 'dark' ? 'Switch to light colours' : 'Switch to dark colours'}
          title={theme === 'dark' ? 'Light colours' : 'Dark colours'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <MenuButton name="help" kind="panel" className="icon-button" align="end" ariaLabel="Help" title="How to use the editor" menu={() => <HelpPanel />}>
          <HelpIcon />
        </MenuButton>
      </div>
    </header>
  );
}
