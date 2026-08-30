/* help.js — the built-in "How to Use" guide.
 *
 * Kept as its own file so the documentation can be edited without touching the
 * app, and shown as an in-app dialog rather than a separate page: a plan lives
 * only in the browser tab, so navigating away from it would throw work away.
 */
window.FP = window.FP || {};

(function (FP) {
  'use strict';

  var SECTIONS = [
    ['g-start',    'Start here'],
    ['g-generate', 'Make a plan'],
    ['g-shape',    'Change the shape'],
    ['g-rooms',    'Rooms'],
    ['g-doors',    'Doors & windows'],
    ['g-push',     'Bump-outs'],
    ['g-read',     'Reading the drawing'],
    ['g-move',     'Getting around'],
    ['g-save',     'Saving & sharing'],
    ['g-keys',     'Keyboard shortcuts'],
    ['g-limits',   'What it cannot do']
  ];

  var BODY = [

    '<section id="g-start">',
    '<h2>Start here</h2>',
    '<p class="lead">Floor Plan Builder draws real, measured floor plans. Everything on screen is at true size &mdash; a 60&quot; bathtub really is five feet long &mdash; but you shape the plan by dragging, not by typing coordinates.</p>',
    '<p>There are only three things you need to know to be productive:</p>',
    '<ol class="big-steps">',
    '<li><b>A plan is already there when you open the app.</b> Change the settings on the left and press <b>Generate Floor Plan</b> to get a different one.</li>',
    '<li><b>Drag any wall to move it.</b> The rooms on both sides resize as you drag. You cannot break the plan by dragging &mdash; rooms always stay sealed together with no gaps or overlaps.</li>',
    '<li><b>Click anything to edit it.</b> Click a room, a wall, a door or a window and its settings appear in the panel on the right, where you can also type exact sizes.</li>',
    '</ol>',
    '<p class="callout"><b>Your plan is remembered.</b> It saves itself in this browser as you work, so closing the page and coming back later picks up where you left off. To keep a copy you can move to another computer, send to someone, or come back to after clearing your browser, use <b>Export &rarr; Project file (.json)</b>.</p>',
    '</section>',

    '<section id="g-generate">',
    '<h2>Make a plan automatically</h2>',
    '<p>The <b>Auto-Generate</b> panel on the left builds a complete plan from a few choices. Set what you want and press <b>Generate Floor Plan</b>.</p>',
    '<dl>',
    '<dt>Style</dt><dd><b>Modern Farmhouse</b> puts the primary suite at one end and the other bedrooms at the far end, with the living space between them. <b>Ranch</b> groups every bedroom into one wing. <b>Split Bedroom</b> is the farmhouse layout mirrored.</dd>',
    '<dt>Bedrooms / Bathrooms</dt><dd>A half bath (2.5, 3.5) adds a powder room. Bedrooms get their own closets and open off a hall rather than off the living room.</dd>',
    '<dt>Stories</dt><dd>Two-story plans get a main floor and an upper floor, with a staircase on each. Switch floors with the tabs in the <b>Levels</b> panel.</dd>',
    '<dt>Square Feet</dt><dd>The target size. If the rooms you asked for genuinely need more space than that &mdash; four bedrooms in 1,400 sq ft, say &mdash; the house is made bigger rather than squeezing rooms below a usable size, and the readout shows you the real number.</dd>',
    '<dt>Open concept</dt><dd>Removes the walls between the kitchen, dining and living space so they read as one room.</dd>',
    '</dl>',
    '<p><b>Re-balance room sizes</b> resets every room to its ideal proportions, undoing size changes you made by dragging. It keeps the rooms themselves.</p>',
    '<p class="callout"><b>Generating replaces the whole plan.</b> If you did it by accident, press <kbd>Ctrl</kbd>+<kbd>Z</kbd>.</p>',
    '</section>',

    '<section id="g-shape">',
    '<h2>Changing the shape</h2>',
    '<h3>Move a wall</h3>',
    '<p>Point at any wall &mdash; it highlights blue &mdash; then drag. The rooms on both sides resize live and their dimensions are shown while you drag.</p>',
    '<h3>Make the house bigger or smaller</h3>',
    '<p>Drag one of the four <b>outside</b> walls. The house grows or shrinks and the square footage follows. You can also type exact numbers into <b>House Width</b> and <b>House Depth</b> in the Levels panel.</p>',
    '<p>Only the rooms <b>along the wall you dragged</b> change size. Everything else keeps the size you gave it, so pulling a wall in does not undo the rest of your work. Pull the right-hand wall in by two feet and the rooms down that side lose two feet; nothing else moves.</p>',
    '<p>If a room on that edge cannot get any smaller, the rooms behind it start giving up space instead, so the wall still goes where you put it.</p>',
    '<h3>Scale the whole plan from a corner</h3>',
    '<p>There is a small square handle at each <b>corner of the house</b>. Drag one and the entire plan grows or shrinks together: every room keeps exactly its share, and the doors, windows, bump-outs, porch and patio all scale with it. Use this when the layout is right but the house wants to be bigger or smaller overall.</p>',
    '<p>Hold <kbd>Shift</kbd> while dragging a corner to keep the house the <b>same shape</b>, so width and depth grow by the same percentage.</p>',
    '<p>Holding <kbd>Shift</kbd> while dragging an outside <b>wall</b> does the same proportional stretch along that one direction. <b>Re-balance room sizes</b> is different again: it throws away your sizing and resets every room to its ideal proportions.</p>',
    '<h3>When a room will not get any smaller</h3>',
    '<p>Every room has a minimum size, so a bedroom can never be dragged down to two feet wide. When you push a wall past that point and <b>Auto-grow house</b> is on (it is by default), the outside wall moves out instead by exactly the amount needed, and the square footage goes up. Turn Auto-grow off in the <b>Drawing</b> panel if you would rather the wall simply stopped.</p>',
    '<h3>Type an exact size</h3>',
    '<p>Click a room and type into <b>Width</b> or <b>Depth</b>. The walls move to hit that number exactly. All of these mean the same thing:</p>',
    '<p class="fmt"><code>12</code> <code>12\'</code> <code>12\'6&quot;</code> <code>12-6</code> <code>12 6</code> <code>150&quot;</code> <code>12\' 6 1/2&quot;</code></p>',
    '<p>A plain number is read as <b>feet</b>. Put a <code>&quot;</code> after it if you mean inches.</p>',
    '</section>',

    '<section id="g-rooms">',
    '<h2>Working with rooms</h2>',
    '<dl>',
    '<dt>Rename or change a room</dt><dd>Click it, then edit <b>Name</b> or pick a different <b>Type</b>. The type decides the furniture drawn in it and its minimum size.</dd>',
    '<dt>Swap two rooms</dt><dd>Drag one room on top of another and let go. They trade places, keeping the spaces the same shape.</dd>',
    '<dt>Add a wall</dt><dd>Pick the <b>Add Wall</b> tool and click inside a room &mdash; a wall appears across it, dividing it in two. To choose which way the wall runs, press and drag: drag sideways for a wall that runs sideways, up and down for one that runs up and down. The <b>Add wall</b> buttons in the room panel do the same thing. A wall always runs the full width or depth of the room it is in; a part-wall would leave rooms that do not seal together.</dd>',
    '<dt>Join rooms into one L-shaped room</dt><dd>Click one room, then hold <kbd>Shift</kbd> and click the others you want joined to it. They all have to touch each other. Press <b>Join into one room</b> and give it a name: the walls between them are removed, they share a single label, and the size is quoted as a total area because the shape is no longer a rectangle. This is how you get an L-shaped or T-shaped room. <b>Split back into separate rooms</b> undoes it.</dd>',
    '<dt>Lock a room\'s size</dt><dd>Once a room is the size you want, tick <b>Lock this size</b>. It then holds those dimensions no matter what happens around it &mdash; moving other walls, resizing the house, scaling from a corner. The plan works around it instead. A padlock shows on the room. Typing a size in <b>Width</b> or <b>Depth</b> still changes it, because that is a deliberate instruction, and it re-locks at the new size.<br><br>A lock can only be honoured while the plan still has somewhere to put the space. In a plan squeezed so tight that the other rooms are already at their smallest, a locked room will give way rather than leave a gap in the floor.</dd>',
    '<dt>Turn a room into outdoor space</dt><dd>Click a room on the outside of the plan and set <b>Counts as</b> to <b>Outdoor</b>. It stops counting toward the square footage and is drawn open to the air with posts, the way a porch tucked under the main roof is really built. The wall between it and the house becomes a proper insulated outside wall, and you get a door onto it. Use the <b>Type</b> list to make it a covered porch, screened porch, patio or deck. Switch back to <b>Heated space</b> at any time.</dd>',
    '<dt>Delete a room</dt><dd>Click the room and press <b>Delete this room</b>, or select it and press <kbd>Del</kbd>. Every part of the floor has to belong to some room, so the space cannot just become empty &mdash; the room next to it grows to fill the gap, and a message tells you which one did. If that is not the room you wanted, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> and drag the walls instead.</dd>',
    '<dt>Combine two rooms</dt><dd>Use the <b>Remove Wall</b> tool and click the wall between them. Where the two rooms can become a single room they are merged; otherwise the wall is opened up so the spaces flow together as one area while keeping both labels. To end up with one label, delete the room you do not want.</dd>',
    '<dt>Open up a wall without deleting it</dt><dd>Click the wall and choose <b>Open</b> in the properties panel. This is how the kitchen, dining and living space are joined in an open-concept plan.</dd>',
    '</dl>',
    '</section>',

    '<section id="g-doors">',
    '<h2>Doors and windows</h2>',
    '<p>Generated plans already have doors and windows in sensible places: one door per private room, off a hall wherever there is one, and windows on the outside walls of rooms that want daylight.</p>',
    '<ul>',
    '<li><b>Add one</b> &mdash; pick the <b>Door</b> or <b>Window</b> tool and click a wall. Windows only go on outside walls.</li>',
    '<li><b>Move one</b> &mdash; drag it along its wall.</li>',
    '<li><b>Change one</b> &mdash; click it, then set the type (single, double, pocket, slider, cased opening, garage), the width, or the exact distance from the start of the wall.</li>',
    '<li><b>Turn a door around</b> &mdash; <b>Flip swing side</b> changes which room it opens into; <b>Flip hinge end</b> moves the hinges to the other side.</li>',
    '<li><b>Delete one</b> &mdash; select it and press <kbd>Del</kbd>.</li>',
    '</ul>',
    '</section>',

    '<section id="g-push">',
    '<h2>Making the house stop being a rectangle</h2>',
    '<p>A generated plan starts as a rectangle. To push part of the house out &mdash; a bedroom that projects, a dining bay, a nook:</p>',
    '<ol>',
    '<li>Click a room that touches an outside wall.</li>',
    '<li>In the properties panel find <b>Push this room out</b> and choose a side.</li>',
    '</ol>',
    '<p>That part of the house now projects past the footprint. The bump-out belongs to its room &mdash; there is no wall between them &mdash; it gets its own window, and it travels with the room when you drag walls elsewhere.</p>',
    '<p>Drag its <b>outer wall</b> to change how far it projects, or its <b>side walls</b> to change how wide it is. Click inside it to type exact numbers or remove it. Rooms in the middle of the plan have no outside wall, so they cannot be pushed out.</p>',
    '</section>',

    '<section id="g-read">',
    '<h2>Reading the drawing</h2>',
    '<dl>',
    '<dt>Room sizes</dt><dd>The size under each room name is the <b>clear inside</b> dimension &mdash; wall face to wall face, what you would measure with a tape. It is not the wall-to-wall centre distance.</dd>',
    '<dt>House size and square footage</dt><dd>Measured to the <b>outside face</b> of the outside walls, which is how houses are normally quoted. The headline number is <b>heated space</b>. A garage is reported separately, and so is any room you set to Outdoor &mdash; a porch or patio inside the footprint takes up the rectangle but is not heated, so it is listed apart rather than counted.</dd>',
    '<dt>Dimension strings</dt><dd>The chains along the top and left break the house into the rooms along those edges. The outer line is the overall size.</dd>',
    '<dt>Dashed outlines</dt><dd>Porches and patios are dashed because they are outside the walls. On an upper floor, the dashed outline is the floor below, so you can line the two up.</dd>',
    '<dt>Wall thickness</dt><dd>Outside walls are drawn 6&quot; thick, inside walls 4&frac12;&quot;, which is what a real 2x6 and 2x4 wall measure once finished.</dd>',
    '</dl>',
    '</section>',

    '<section id="g-move">',
    '<h2>Getting around the drawing</h2>',
    '<ul>',
    '<li><b>Zoom</b> &mdash; scroll the mouse wheel. It zooms towards the pointer.</li>',
    '<li><b>Pan</b> &mdash; hold <kbd>Space</kbd> and drag, drag with the middle mouse button, or drag from an empty area outside the house.</li>',
    '<li><b>Fit everything on screen</b> &mdash; press <kbd>F</kbd> or the <b>Fit</b> button.</li>',
    '<li><b>Measure anything</b> &mdash; the <b>Measure</b> tool draws a tape between two points.</li>',
    '</ul>',
    '<h3>Snapping</h3>',
    '<p>Walls snap to a grid as you drag &mdash; 3 inches by default, set it in the <b>Drawing</b> panel. They also snap to line up with other walls nearby. Hold <kbd>Alt</kbd> while dragging to ignore snapping entirely.</p>',
    '<h3>Turning things off</h3>',
    '<p>The <b>Drawing</b> panel hides the grid, dimensions, furniture, room labels and the floor below. Turning off furniture and the grid gives you a clean drawing for printing.</p>',
    '</section>',

    '<section id="g-save">',
    '<h2>Saving, printing and sharing</h2>',
    '<p class="callout"><b>The plan you are working on saves itself</b> in this browser, so you can close the page and come back to it. That copy lives in this browser on this computer only &mdash; it does not travel with you, and clearing your browsing data erases it. For anything you care about, export a project file as well.</p>',
    '<dl>',
    '<dt>Keep a plan you can edit later</dt><dd><b>Export &rarr; Project file (.json)</b> saves everything &mdash; rooms, walls, doors, bump-outs &mdash; into a file you can store, back up or send to someone. <b>Open&hellip;</b> loads it back exactly as it was. This is the one to use for work you want to keep.</dd>',
    '<dt>Send someone a picture</dt><dd><b>Export &rarr; PNG image</b>.</dd>',
    '<dt>Send a builder or designer a drawing</dt><dd><b>Export &rarr; SVG</b> for a sharp vector drawing that scales to any size, or <b>Export &rarr; DXF</b> to open it in CAD software with real inch measurements and proper layers.</dd>',
    '<dt>Print it</dt><dd><b>Export &rarr; Print</b> opens a printable page. Landscape works best.</dd>',
    '</dl>',
    '</section>',

    '<section id="g-keys">',
    '<h2>Keyboard shortcuts</h2>',
    '<table class="keys-table">',
    '<tr><th>Tools</th><th></th></tr>',
    '<tr><td><kbd>V</kbd></td><td>Select and move</td></tr>',
    '<tr><td><kbd>W</kbd></td><td>Add a wall</td></tr>',
    '<tr><td><kbd>D</kbd></td><td>Add a door</td></tr>',
    '<tr><td><kbd>N</kbd></td><td>Add a window</td></tr>',
    '<tr><td><kbd>E</kbd></td><td>Remove a wall</td></tr>',
    '<tr><td><kbd>M</kbd></td><td>Tape measure</td></tr>',
    '<tr><th>Working</th><th></th></tr>',
    '<tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>',
    '<tr><td><kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>',
    '<tr><td><kbd>Del</kbd></td><td>Delete the selected room, door, window or bump-out</td></tr>',
    '<tr><td><kbd>Esc</kbd></td><td>Deselect, and go back to the Select tool</td></tr>',
    '<tr><th>View</th><th></th></tr>',
    '<tr><td><kbd>F</kbd></td><td>Fit the plan on screen</td></tr>',
    '<tr><td><kbd>Space</kbd>+drag</td><td>Pan around</td></tr>',
    '<tr><td>Scroll</td><td>Zoom in and out</td></tr>',
    '<tr><td><kbd>Alt</kbd>+drag</td><td>Ignore snapping</td></tr>',
    '<tr><td>Drag a corner handle</td><td>Scale the whole plan, everything in proportion</td></tr>',
    '<tr><td><kbd>Shift</kbd>+drag a corner</td><td>Scale it but keep the house the same shape</td></tr>',
    '<tr><td><kbd>Shift</kbd>+drag outside wall</td><td>Stretch the whole plan instead of just that edge</td></tr>',
    '<tr><td><kbd>Shift</kbd></td><td>Flip which way the wall runs, while using Add Wall</td></tr>',
    '<tr><td><kbd>F1</kbd> or <kbd>?</kbd></td><td>Open this guide</td></tr>',
    '</table>',
    '</section>',

    '<section id="g-limits">',
    '<h2>What it cannot do</h2>',
    '<p>Being straight with you about the edges of the tool:</p>',
    '<ul>',
    '<li><b>Rooms are rectangles.</b> To get an L-shaped room, remove the wall between two rectangles.</li>',
    '<li><b>A bump-out holds one room.</b> A whole wing with several rooms in it is not supported.</li>',
    '<li><b>Stairs are not aligned between floors automatically.</b> The floor below is drawn as a dashed outline so you can line them up by dragging.</li>',
    '<li><b>Furniture is placed automatically</b> and cannot be moved individually. Turn it off in the Drawing panel if it is in the way.</li>',
    '<li><b>The built-in save is per browser.</b> It does not follow you to another computer or survive clearing your browsing data. Export a project file for anything you want to keep.</li>',
    '<li><b>This is a design tool, not a construction document.</b> It does not check building codes, structure, plumbing runs or energy requirements. Have a licensed professional review anything you intend to build.</li>',
    '</ul>',
    '</section>'
  ].join('');

  var el = null;

  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'guideOverlay';
    el.setAttribute('hidden', '');
    el.innerHTML =
      '<div id="guide" role="dialog" aria-modal="true" aria-labelledby="guideTitle" tabindex="-1">' +
        '<header id="guideHead">' +
          '<h1 id="guideTitle">How to Use Floor Plan Builder</h1>' +
          '<button id="guideClose" aria-label="Close">&#10005;</button>' +
        '</header>' +
        '<div id="guideCols">' +
          '<nav id="guideNav">' +
            SECTIONS.map(function (s) {
              return '<a href="#' + s[0] + '" data-go="' + s[0] + '">' + s[1] + '</a>';
            }).join('') +
            '<button id="guidePrint" class="ghost">Print this guide</button>' +
          '</nav>' +
          '<div id="guideBody">' + BODY + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('#guideClose').onclick = close;
    el.querySelector('#guidePrint').onclick = function () { window.print(); };
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    Array.prototype.forEach.call(el.querySelectorAll('#guideNav a'), function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        show(a.dataset.go, true);
      };
    });
    return el;
  }

  /* Scroll a section into view and mark its nav entry. Measured with
     getBoundingClientRect rather than offsetTop, which depends on which
     ancestor happens to be positioned. */
  function show(id, smooth) {
    var body = el.querySelector('#guideBody');
    var target = id && el.querySelector('#' + id);
    var top = 0;
    if (target) {
      top = body.scrollTop + (target.getBoundingClientRect().top - body.getBoundingClientRect().top) - 10;
    }
    if (body.scrollTo) body.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    else body.scrollTop = Math.max(0, top);
    Array.prototype.forEach.call(el.querySelectorAll('#guideNav a'), function (a) {
      a.classList.toggle('on', a.dataset.go === id);
    });
  }

  function open(section) {
    build();
    el.removeAttribute('hidden');
    document.body.classList.add('guide-open');
    show(section);
    el.querySelector('#guide').focus();
  }
  function close() {
    if (!el) return;
    el.setAttribute('hidden', '');
    document.body.classList.remove('guide-open');
  }
  function isOpen() { return !!el && !el.hasAttribute('hidden'); }
  function toggle(section) { isOpen() ? close() : open(section); }

  FP.HELP = { open: open, close: close, toggle: toggle, isOpen: isOpen, SECTIONS: SECTIONS };
})(window.FP);
