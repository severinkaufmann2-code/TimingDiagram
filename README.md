# TimingDiagram

An editor for timing diagrams that runs in the web browser, on Linux and Windows
alike. The whole application is one HTML file: nothing to install, works
offline, and your diagrams never leave your computer.

![The editor with the example diagram](docs/screenshots/editor.png)

- Channels stacked vertically on one shared time axis
- Transition points you can drag, or set to an exact time
- A value per point and channel, each reached by a **step** or by a gradual
  **ramp**, so digital and analog signals live in one diagram
- A table that shows and edits every number
- Export to **Excel**, **PDF** and **HTML**, plus PNG and SVG pictures
- Undo for everything, light and dark colours

## Getting it

**Ready to use:** download `TimingDiagram.html` from the
[latest release](../../releases/latest) and open it in Firefox, Chrome or Edge.
Double-click is enough.

**Or build it yourself** (needs [Node.js](https://nodejs.org) 20.19 or newer):

```sh
npm install
npm run build        # writes dist/index.html, the complete application
```

## Using it

The editor starts with a small example. **New** in the toolbar gives you an
empty diagram, and the **?** button shows this guide inside the app.

### Channels

| To … | do this |
|---|---|
| add a channel | **Add channel** under the lanes, then choose *Digital* (two levels, 0 and 1) or *Analog* (any value, with unit and range) |
| rename it | click the name and type |
| change type, colour, unit or range | click the line under the name (e.g. *Analog · 0 to 100 mm*) |
| reorder | drag the grip at the left edge of the lane |
| remove it | the bin at the right of the name |

### Transition points

Transition points belong to the timeline, not to a single channel: a point is
one vertical line through all lanes.

| To … | do this |
|---|---|
| add a point | click the lane under the ruler, at the time you want |
| move it | drag it. It snaps to a grid; hold **Alt** to place it freely, **Shift** to push all later points along |
| set an exact time | click the point and type the time |
| delete it | click the point, then **Delete** |

![Typing the exact time of a transition point](docs/screenshots/exact-time.png)

Unit, range and snap grid of the time axis are behind the **Timeline** button.

### Values

Where a point crosses a channel, the channel can get a value. Move the pointer
over a lane and every crossing shows a dot.

| To … | do this |
|---|---|
| set a value | drag the dot up or down, or click it and type the value |
| flip a digital channel | click the crossing |
| put a transition anywhere | double-click in the lane; a new point is created if none is there |
| choose step or ramp | click the dot, then **Step** or **Ramp** |
| remove a value | click the dot, then **×**. The channel then does not change at that point |

**Step** keeps the previous value up to the point and jumps there.
**Ramp** changes in a straight line from the channel's previous value. When you
make a value a ramp, the channel's level is fixed at the point before it, so the
ramp covers exactly the interval from the previous point to this one. Remove
that fixed value if the ramp should start further back.

Every channel also has an **initial value** at the start of the timeline (the
ring at the left edge).

The **Values** table under the diagram shows the same numbers and edits them
too: type into a cell, empty a cell to remove its value, click the small icon to
switch between step and ramp.

### Saving and exporting

**Save** writes the diagram as a `.timing.json` project file; **Open** reads it
back (or drop the file on the window). The editor also keeps the current
diagram in the browser, so closing the tab loses nothing.

The **Export** menu writes:

| Format | Contents |
|---|---|
| Excel workbook (`.xlsx`) | a picture of the diagram, the values with their transitions (one row per point), and a *Plot data* sheet that draws the exact waveforms as an XY chart |
| PDF document (`.pdf`) | the diagram as vector graphics and the values table, on A4 or A3 landscape; long diagrams continue on further pages. *Exact size* gives a page that is just the picture |
| Web page (`.html`) | one standalone page with the picture and the values table. Moving the pointer over the picture shows the time and all values. The page can be opened in the editor again |
| Picture (`.png`, `.svg`) | for documents and slides |

![The exported PDF](docs/screenshots/export-pdf.png)

A view that you zoomed by hand is exported at that zoom; the fitted view is
exported at a standard width.

### Keyboard

| Keys | Action |
|---|---|
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+S / Ctrl+O | save / open a project file |
| ← → | move the selected transition point by one grid step (Shift: ten) |
| ↑ ↓ | change the selected value (Shift: ten steps) |
| S / R | make the selected value a step / a ramp |
| Delete | delete the selected point or value |
| Ctrl + mouse wheel | zoom the timeline |

## Working on the code

```sh
npm run dev          # development server with live reload
npm test             # unit tests (data model, exports)
npm run test:e2e     # builds, then drives the real app in Chromium and Firefox
npm run typecheck
```

The end-to-end tests need the test browsers once: `npx playwright install chromium firefox`.
`e2e/requirements.spec.ts` has one test per requirement of [`Ideas.txt`](Ideas.txt).

| Folder | Contents |
|---|---|
| `src/model` | the diagram as data, and every way to change it (pure functions, no UI) |
| `src/render` | geometry and the SVG drawing, shared by screen and exports |
| `src/state` | the editor's state with undo history |
| `src/ui` | the editor: toolbar, lanes, panels, values table |
| `src/export` | Excel, PDF, HTML, PNG and SVG |
| `docs` | the [plan](docs/PLAN.md) and the [mockup](docs/mockup/index.html) the editor was built from |

Built with TypeScript, React and Vite. Excel files are written by ExcelJS, PDF by
jsPDF and svg2pdf.js. The bundled typeface is IBM Plex (SIL Open Font License,
see `src/assets/fonts/LICENSE-IBM-Plex.txt`).
