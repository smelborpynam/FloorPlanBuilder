# Floor Plan Builder

A browser floor plan editor with CAD accuracy and a paint-program feel. Type in
bedrooms, bathrooms, stories and square footage, get a real floor plan, then
drag the walls around. No install, no build step, no internet needed.

## Run it

```bash
node server.js
```

Then open <http://localhost:5173>. (Opening `index.html` directly by
double-clicking also works — the server just avoids browser file:// quirks.)

## Deploying

The site is hosted on Netlify, deployed from this repository's `main` branch:
every push publishes automatically. There is no build step — `netlify.toml`
pins the publish directory to the repository root, where `index.html` lives, so
the setting cannot drift out of the Netlify UI.

To deploy anywhere else, upload these files and serve them statically:
`index.html`, `css/` and `js/`. Nothing else is required at runtime — `server.js`
is only for working locally.

Note that publishing from the repository root also serves `README.md` and
`server.js` at the public URL. Neither contains anything sensitive, and all of
`js/` is public by necessity in any browser app, but move the app into its own
publish folder if you would rather they were not reachable.

## Built-in help

**Help ▾** in the toolbar opens a full How-to-Use guide inside the app, with
sections for making a plan, changing the shape, bump-outs, saving and sharing,
and a keyboard-shortcut table. <kbd>F1</kbd> or <kbd>?</kbd> opens it too, and
it can be printed. The guide text lives in `js/help.js`.

## What it does

**Auto-generate.** Choose a style, bedroom and bathroom count, one or two
stories, and a square footage. The generator lays out wings — primary suite,
public core, bedroom wing — sizes every room from a target-area model, then
places doors, windows, closets, a front porch and a rear patio automatically.
The first example is a modern farmhouse: open kitchen/dining/great room, walk-in
pantry, laundry and mud room, bedrooms on their own hall, porch and patio.

Three layouts that actually differ:

| Style | Arrangement |
|---|---|
| Modern Farmhouse | Primary suite one end, secondary bedrooms the other, living between |
| Ranch | Every bedroom in one wing, all living space at the other end |
| Split Bedroom | Same as farmhouse, mirrored |

**Edit anything.**

- **Drag a wall** — the rooms on both sides resize live, with dimensions shown as you go.
- **Drag an outside wall** — the house gets bigger or smaller; the square footage follows.
  Only the rooms *along that edge* resize, so pulling a wall in does not disturb sizes you
  already set elsewhere. Hold <kbd>Shift</kbd> to stretch the whole plan proportionally instead.
- **Drag a corner handle** — scales the entire plan as a unit. Every room keeps exactly its
  share, and doors, windows, bump-outs, porch and patio scale with it. Hold <kbd>Shift</kbd>
  to keep the house's proportions while resizing.
- **Drag a room onto another** — they swap places.
- **Join rooms** — click one room, Shift-click others that touch it, then *Join into one room*
  and name it. The walls between them go and they become a single, possibly L-shaped room.
  The tree still holds rectangles underneath, so tiling and safe dragging are unaffected.
- **Type exact sizes** — every room, wall position, door width and porch depth accepts real
  numbers: `12`, `12'`, `12'6"`, `12 6`, `150"`, `12' 6 1/2"`.
- **Push a room out** — select a room touching an outside wall and pick a side. That part
  of the house projects past the footprint, so the plan stops being a plain rectangle:
  a bedroom pushed out, a dining bay, a nook. The bump-out belongs to its room (no wall
  between them), gets its own windows, and travels with the room when you drag walls.
  Drag its outer wall to change the projection, its side walls to change the width.
- **Lock a room's size** — tick *Lock this size* and the room holds its dimensions against
  everything: neighbouring wall drags, house resizes, corner scaling. The rest of the plan
  works around it. Typing an exact size still overrides the lock and re-locks at the new value.
- **Turn a room into outdoor space** — set *Counts as* to *Outdoor* and the room stops counting
  toward the heated square footage. It is drawn open to the air with posts, the wall to the
  house becomes an insulated exterior wall, and a door onto it is added. Porch, screened porch,
  patio and deck types are available.
- **Delete a room** removes it and the neighbouring room grows into the space; the app names
  which room absorbed it. Works on any room, unlike merging.
- **Add Wall** draws a new wall across a room; drag to choose which way it runs.
  **Remove Wall** merges two rooms, or opens the wall up
  so the spaces flow together.
- **Door / Window** tools place openings; drag them along the wall, flip the swing or hinge.
- Undo/redo, snap (off / 1" / 3" / 6" / 1'), grid, pan, zoom, tape measure.

**Auto-grow.** If you drag a wall past the point where the room beyond it can
still fit, the outside wall moves out instead by exactly that amount, and the
square footage goes up. Turn it off in the Drawing panel to make rooms stop at
their minimums instead.

**It remembers your plan.** The current plan is saved to browser storage as you
work and restored on your next visit, so closing the tab does not throw the work
away. That copy is per-browser: it does not follow you to another machine and
clearing site data erases it, so a project file is still the way to keep
something. Storage failures (private windows, full quota) are swallowed
silently — autosave is a convenience, never a guarantee.

**Export.** PNG, SVG, DXF (real CAD — inch units, layered `A-WALL` / `A-DOOR` /
`A-GLAZ` / `A-ANNO-TEXT`, wall faces broken around every opening), a `.json`
project file you can reopen later, and Print.

## How it stays accurate

Everything is stored in **inches** as exact numbers. Feet-and-inches strings are
only a display format. Exterior walls are 6", interior 4½", and room captions
report **clear inside dimensions** — the number you would measure with a tape.
The house dimension and square footage are gross, measured to the outside face,
the way houses are actually quoted.

A level is a **slicing tree**: the footprint is recursively cut by vertical and
horizontal lines, each leaf is a room, each internal node is a wall. Rooms
therefore always tile the footprint exactly — no gaps, no overlaps, no
self-intersecting walls — and moving a wall is just changing one split ratio.
That is why dragging can never produce a broken plan, which is what makes the
editor safe to hand to someone who has never used CAD. Verified by stress test:
200 extreme random wall drags leave zero overlaps, zero gaps and zero
undersized rooms.

Each room type carries a minimum dimension (a hard limit — bedrooms never go
below 9 ft) and a maximum sensible dimension used only while generating, so
surplus square footage flows into the great room rather than producing a
22-foot-deep closet. If a program genuinely needs more space than the square
footage you asked for — four bedrooms in 1,400 sq ft — the footprint grows and
the readout tells you the honest number rather than quietly squeezing rooms.
A garage is counted as extra area, not part of the heated square footage.

## Files

```
index.html        UI shell
css/app.css       styling
js/units.js       inches <-> feet-and-inches parsing and formatting
js/model.js       slicing tree, walls, openings, all editing operations
js/generate.js    layout templates, room programme, automatic doors & windows
js/fixtures.js    furniture and plumbing symbols, drawn to real sizes
js/render.js      canvas drawing: walls, openings, labels, dimension strings
js/exporters.js   PNG / SVG / DXF / JSON / print
js/interact.js    hit testing, dragging, tools, undo
js/ui.js          panels, properties, wiring
server.js         static file server for local use
```

## Non-rectangular footprints

The slicing tree tiles one rectangle, which is what keeps dragging safe — so the
outline is a separate layer on top of it. A **bump-out** is heated floor that
projects past the footprint from one room's outside wall. It is stored as an
offset along that room's *own* edge rather than in level coordinates, so when
you drag walls it stays glued to its room instead of drifting off it.

The shell is then drawn from an outline walked around the base rectangle with
every bump spliced into the correct edge, plus the same loop pushed one wall
thickness inward — one even-odd fill, so any number of corners comes out right
at both the outside corners and the reflex ones a bump creates. The same
outline drives the SVG and DXF exports.

## Known limits

- A bump-out belongs to one room. A whole wing containing several rooms is a
  bigger change than this and is not supported.
- A room is built from rectangular cells. L- and T-shapes come from joining cells
  together, not from dragging a corner into an arbitrary polygon.
- On a two-storey plan the stairs are not automatically aligned between floors.
  The floor below shows as a dashed outline so you can line them up by dragging.
- Furniture is placed automatically and is not individually movable; toggle it
  off in the Drawing panel.
- This is a design tool, not a construction document. No structural, code or
  energy checking.
