/* ui.js — application state, panels, and the render loop. */
(function (FP) {
  'use strict';
  var M = FP.M, U = FP.U, R = FP.R, G = FP.G, I = FP.I, EX = FP.EX;
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv');

  /* ── state ───────────────────────────────────────────────────────── */
  var st = {
    plan: null,
    view: { scale: 0.1, tx: 0, ty: 0 },
    opts: { grid: true, dims: true, fixtures: true, labels: true, ghost: true,
            autoGrow: true, snap: 3 },
    tool: 'select', sel: null, hover: null,
    dragWall: null, swapTarget: null, dragTarget: false,
    splitPreview: null, openPreview: null, measure: null,
    history: [], future: [], altKey: false, cursor: { x: 0, y: 0 }
  };
  FP.app = st;                       // handy for the console / debugging
  var dirty = true;
  function invalidate(full) { dirty = true; if (full) { syncPanels(); } }
  st.toast = toast;
  st.setTool = setTool;
  st.fit = fit;

  function level() { return st.plan.levels[st.plan.activeLevel]; }

  /* ── autosave ────────────────────────────────────────────────────────
     A plan lives only in this browser tab, and the people this tool is for
     will not think to export one before closing it. Keep the current plan in
     browser storage and put it back on the next visit. It is a convenience,
     not a promise: storage can be unavailable (private windows, cleared site
     data), so every failure is swallowed and the project file remains the
     real way to keep something. */
  var SAVE_KEY = 'floorplanbuilder.plan.v1';
  var saveTimer = null;

  function saveNow() {
    try { localStorage.setItem(SAVE_KEY, I.serialize(st.plan)); } catch (e) { /* ignore */ }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 900);
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.levels || !p.levels.length || !p.levels[0].root) return null;
      return M.reindex(p);
    } catch (e) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e2) { /* ignore */ }
      return null;
    }
  }

  /* ── boot ────────────────────────────────────────────────────────── */
  function boot() {
    var saved = loadSaved();
    st.plan = saved || G.generate(readGenOpts());
    fit();
    I.attach(cv, st, invalidate);
    wireUI();
    syncPanels();
    loop();
    window.addEventListener('beforeunload', saveNow);
    toast(saved ? 'Picked up where you left off.'
                : 'Farmhouse plan ready — drag any wall to reshape it.');
  }

  function loop() {
    if (dirty) { dirty = false; R.draw(cv, st); paintStatus(); }
    requestAnimationFrame(loop);
  }

  function fit() {
    var r = cv.getBoundingClientRect();
    st.view = R.fit(level(), r.width || 900, r.height || 600);
    dirty = true;
  }

  /* ── toast ───────────────────────────────────────────────────────── */
  var toastT = null;
  function toast(msg, warn) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'on' + (warn ? ' warn' : '');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = ''; }, 2600);
  }

  function paintStatus() {
    var names = { select: 'Select', split: 'Add Wall', door: 'Add Door',
                  window: 'Add Window', erase: 'Remove Wall', measure: 'Measure' };
    $('stTool').textContent = names[st.tool] || st.tool;
    $('stCoord').textContent = 'x ' + U.ft(st.cursor.x) + '   y ' + U.ft(st.cursor.y);
    $('stScale').textContent = 'Zoom ' + (st.view.scale * 12).toFixed(1) + ' px / ft';
  }

  /* ── generation ──────────────────────────────────────────────────── */
  function readGenOpts() {
    return {
      style: $('genStyle').value,
      beds: +$('genBeds').value,
      baths: parseFloat($('genBaths').value),
      stories: +$('genStories').value,
      sqft: +$('genSqft').value,
      open: $('genOpen').checked,
      porch: $('genPorch').checked,
      patio: $('genPatio').checked,
      garage: $('genGarage').checked,
      primaryMain: $('genMain').checked
    };
  }

  function generate() {
    I.snap(st);
    st.plan = G.generate(readGenOpts());
    st.sel = null;
    fit(); syncPanels();
    toast('Generated: ' + st.plan.opts.beds + ' bed / ' + st.plan.opts.baths + ' bath, ' +
          (+st.plan.opts.sqft).toLocaleString() + ' sq ft');
  }

  /* ── panels ──────────────────────────────────────────────────────── */
  function syncPanels() {
    // level tabs
    var tabs = $('levelTabs'); tabs.innerHTML = '';
    st.plan.levels.forEach(function (l, i) {
      var b = document.createElement('button');
      b.textContent = l.name;
      b.className = i === st.plan.activeLevel ? 'active' : '';
      b.onclick = function () { st.plan.activeLevel = i; st.sel = null; fit(); syncPanels(); };
      tabs.appendChild(b);
    });
    if (st.plan.levels.length < 3) {
      var add = document.createElement('button');
      add.textContent = '+ Floor'; add.title = 'Add another floor';
      add.onclick = addFloor;
      tabs.appendChild(add);
    }

    var L = level();
    $('lvlW').value = U.ft(L.width);
    $('lvlH').value = U.ft(L.height);

    var garage = 0;
    st.plan.levels.forEach(function (l) {
      M.computeRects(l);
      M.leaves(l.root).forEach(function (r) { if (r.type === 'garage') garage += r.rect.w * r.rect.h; });
    });
    var per = st.plan.levels.map(function (l) {
      return l.name + ': <b>' + U.sqft(M.levelArea(l)).toLocaleString() + '</b>';
    }).join(' &middot; ');
    $('areaReadout').innerHTML =
      '<div class="big">' + U.sqft(M.planArea(st.plan) - garage).toLocaleString() + ' sq ft</div>' +
      '<div style="font-size:10.5px;color:#8b9099;margin-bottom:4px">heated area' +
        (garage ? ' &middot; plus ' + U.sqft(garage).toLocaleString() + ' sq ft garage' : '') + '</div>' +
      '<div>' + per + '</div>' +
      '<div style="margin-top:4px">Footprint <b>' + U.ft(L.width) + ' &times; ' + U.ft(L.height) + '</b>' +
      (M.bumpList(L).length ? (function () {
        var hb = R.houseBounds(L);
        return '<br>Overall <b>' + U.ft(hb.x1 - hb.x0) + ' &times; ' + U.ft(hb.y1 - hb.y0) +
               '</b> with ' + M.bumpList(L).length + ' bump-out' + (M.bumpList(L).length > 1 ? 's' : '');
      })() : '') + '</div>';

    // room list
    var rl = $('roomList'); rl.innerHTML = '';
    var ls = M.leaves(L.root).slice().sort(function (a, b) {
      return (b.rect.w * b.rect.h) - (a.rect.w * a.rect.h);
    });
    $('roomCount').textContent = '(' + ls.length + ')';
    ls.forEach(function (l) {
      var cd = M.clearDims(L, l);
      var row = document.createElement('div');
      row.className = 'roomrow' + (st.sel && st.sel.id === l.id ? ' sel' : '');
      row.innerHTML = '<span class="sw" style="background:' +
        (M.GROUP_COLOR[(M.CATALOG[l.type] || {}).group] || '#eee').replace('#f', '#d') +
        '"></span><span class="nm">' + escapeHTML(l.name) + '</span>' +
        '<span class="sz">' + U.sizeTxt(cd.w, cd.h) + '</span>';
      row.onclick = function () { st.sel = { kind: 'room', id: l.id }; invalidate(true); };
      rl.appendChild(row);
    });

    renderProps();
    scheduleSave();
    dirty = true;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── properties ──────────────────────────────────────────────────── */
  function renderProps() {
    var body = $('propBody'), title = $('propTitle'), L = level();
    if (!st.sel) {
      title.textContent = 'Properties';
      body.innerHTML = '<p class="hint">Click a room, a wall, a door or a window to edit it.' +
        '<br><br>Drag any wall to move it &mdash; the rooms on both sides resize live.</p>';
      return;
    }
    if (st.sel.kind === 'room') return propsRoom(body, title, L);
    if (st.sel.kind === 'wall') return propsWall(body, title, L);
    if (st.sel.kind === 'opening') return propsOpening(body, title, L);
    if (st.sel.kind === 'bump') return propsBump(body, title, L);
    if (st.sel.kind === 'outdoor') return propsOutdoor(body, title, L);
  }

  function propsRoom(body, title, L) {
    var r = M.indexOf(L.root).byId[st.sel.id];
    if (!r) { st.sel = null; return renderProps(); }
    var cd = M.clearDims(L, r);
    title.textContent = 'Room';
    var opts = Object.keys(M.CATALOG).map(function (k) {
      return '<option value="' + k + '"' + (k === r.type ? ' selected' : '') + '>' +
             M.CATALOG[k].label + '</option>';
    }).join('');
    body.innerHTML =
      '<label class="fld">Name<input id="pName" value="' + escapeHTML(r.name) + '"></label>' +
      '<label class="fld">Type<select id="pType">' + opts + '</select></label>' +
      '<div class="row2">' +
        '<label class="fld">Width<input class="dim" id="pW" value="' + escapeHTML(U.ft(cd.w)) + '"></label>' +
        '<label class="fld">Depth<input class="dim" id="pH" value="' + escapeHTML(U.ft(cd.h)) + '"></label>' +
      '</div>' +
      '<div class="proprow"><span>Inside area</span><b>' + U.areaTxt(cd.w * cd.h) + '</b></div>' +
      '<div class="proprow"><span>Wall-to-wall</span><b>' + U.sizeTxt(r.rect.w, r.rect.h) + '</b></div>' +
      '<div class="divider"></div>' +
      '<div class="row2">' +
        '<button class="ghost" id="pSplitV">Add wall &#9474;</button>' +
        '<button class="ghost" id="pSplitH">Add wall &#9472;</button>' +
      '</div>' +
      '<button class="ghost danger" id="pDelete">Delete this room</button>' +
      bumpButtons(L, r) +
      '<p class="hint">Typing a size moves the walls that control this room. With <b>Auto-grow</b> on, the house gets bigger if the room cannot fit.</p>';

    $('pName').onchange = function () { I.snap(st); r.name = this.value || r.name; invalidate(true); };
    $('pType').onchange = function () {
      I.snap(st);
      var wasDefault = r.name === (M.CATALOG[r.type] || {}).label;
      r.type = this.value;
      var c = M.CATALOG[r.type];
      if (wasDefault) r.name = c.label;
      r.minW = Math.min(r.minW, c.min); r.minH = Math.min(r.minH, c.min);
      r.target = c.area;
      invalidate(true);
    };
    bindDim($('pW'), cd.w, function (val) {
      I.snap(st); M.setLeafExtent(L, r.id, 'w', val + (r.rect.w - cd.w), st.opts.autoGrow); invalidate(true);
    });
    bindDim($('pH'), cd.h, function (val) {
      I.snap(st); M.setLeafExtent(L, r.id, 'h', val + (r.rect.h - cd.h), st.opts.autoGrow); invalidate(true);
    });
    $('pSplitV').onclick = function () { doSplit(r, 'v'); };
    $('pSplitH').onclick = function () { doSplit(r, 'h'); };
    wireBumpButtons(L, r);
    $('pDelete').onclick = function () { deleteRoom(r); };
  }

  /* "Push out" — the control that makes the footprint stop being a rectangle */
  var SIDE_LABEL = { back: 'Back', front: 'Front', left: 'Left', right: 'Right' };
  function bumpButtons(L, r) {
    var sides = M.bumpSides(L, r);
    if (!sides.length)
      return '<div class="divider"></div><p class="hint">This room is in the middle of the plan, so it has no outside wall to push out.</p>';
    return '<div class="divider"></div>' +
      '<div class="fld" style="margin-bottom:6px">Push this room out</div>' +
      '<div class="seg" id="pBump">' +
      sides.map(function (s) {
        return '<button data-side="' + s + '" title="Project this room past the outside wall">' +
               SIDE_LABEL[s] + '</button>';
      }).join('') + '</div>';
  }
  function wireBumpButtons(L, r) {
    var seg = $('pBump');
    if (!seg) return;
    Array.prototype.forEach.call(seg.children, function (b) {
      b.onclick = function () {
        I.snap(st);
        var res = M.addBump(L, r.id, b.dataset.side, 48);
        if (!res.ok) return toast(res.msg, true);
        G.glazeBump(L, res.bump);
        st.sel = { kind: 'bump', id: res.bump.id };
        invalidate(true);
        toast('Pushed out 4\'-0". Drag its walls, or type exact sizes.');
      };
    });
  }

  function propsBump(body, title, L) {
    var g = M.bumpList(L).filter(function (x) { return x.bump.id === st.sel.id; })[0];
    if (!g) { st.sel = null; return renderProps(); }
    var b = g.bump;
    title.textContent = 'Bump-Out';
    body.innerHTML =
      '<div class="proprow"><span>Part of</span><b>' + escapeHTML(g.room.name) + '</b></div>' +
      '<div class="proprow"><span>Side</span><b>' + SIDE_LABEL[b.side] + '</b></div>' +
      '<div class="row2">' +
        '<label class="fld">Width<input class="dim" id="bW" value="' + escapeHTML(U.ft(b.side === 'back' || b.side === 'front' ? g.w : g.h)) + '"></label>' +
        '<label class="fld">Projection<input class="dim" id="bD" value="' + escapeHTML(U.ft(b.side === 'back' || b.side === 'front' ? g.h : g.w)) + '"></label>' +
      '</div>' +
      '<div class="proprow"><span>Added floor</span><b>' + U.areaTxt(g.w * g.h) + '</b></div>' +
      '<div class="proprow"><span>Room total</span><b>' + U.areaTxt(M.roomArea(L, g.room)) + '</b></div>' +
      '<button class="ghost danger" id="bDel">Remove bump-out</button>' +
      '<p class="hint">It belongs to ' + escapeHTML(g.room.name) + ' &mdash; there is no wall between them, and it moves with the room when you drag walls. Drag its outer wall to change the projection, or its side walls to change the width.</p>';

    bindDim($('bW'), b.side === 'back' || b.side === 'front' ? g.w : g.h, function (v) {
      I.snap(st);
      var room = M.indexOf(L.root).byId[b.room];
      var along = (b.side === 'back' || b.side === 'front') ? room.rect.w : room.rect.h;
      var w = U.clamp(v, M.BUMP_MIN_W, along);
      var c = (b.off0 + b.off1) / 2;
      b.off0 = U.clamp(c - w / 2, 0, along - w); b.off1 = b.off0 + w;
      invalidate(true);
    });
    bindDim($('bD'), b.side === 'back' || b.side === 'front' ? g.h : g.w, function (v) {
      I.snap(st); b.depth = Math.max(M.BUMP_MIN_D, v); invalidate(true);
    });
    $('bDel').onclick = function () {
      I.snap(st); M.removeBump(L, b.id); M.pruneOpenings(L); M.pruneBumps(L); st.sel = null; invalidate(true);
    };
  }

  /* Delete a room and say plainly which room grew into the space, because the
     space has to go somewhere and it is not always the neighbour you expect. */
  function deleteRoom(r) {
    var L = level(), name = r.name;
    I.snap(st);
    var res = M.deleteRoom(L, r.id);
    if (!res.ok) return toast(res.msg, true);
    st.sel = null;
    invalidate(true);
    var names = res.takers.slice(0, 2).map(function (t) { return t.name; });
    var who = names.join(' and ') + (res.takers.length > 2 ? ' and others' : '');
    toast('Deleted ' + name + ' — ' + who + ' expanded to fill it.');
  }
  st.deleteRoom = deleteRoom;

  function doSplit(r, dir) {
    var L = level();
    I.snap(st);
    var nr = M.splitRoom(L, r.id, dir, 0.5);
    M.pruneOpenings(L); M.pruneBumps(L);
    if (nr) st.sel = { kind: 'room', id: nr.id };
    invalidate(true);
  }

  function propsWall(body, title, L) {
    var w = M.walls(L).filter(function (x) { return x.key === st.sel.key; })[0];
    if (!w) { st.sel = null; return renderProps(); }
    title.textContent = w.type === 'ext' ? 'Outside Wall' : 'Interior Wall';
    var style = M.wallStyle(L, w.key);
    var posLabel = w.dir === 'v' ? 'Distance from left' : 'Distance from top';
    var html =
      '<div class="proprow"><span>Runs</span><b>' + (w.dir === 'v' ? 'vertical' : 'horizontal') + '</b></div>' +
      '<div class="proprow"><span>Length</span><b>' + U.ft(w.a1 - w.a0) + '</b></div>' +
      '<div class="proprow"><span>Thickness</span><b>' + U.ft(w.thick) + '</b></div>' +
      '<label class="fld">' + posLabel + '<input class="dim" id="wPos" value="' + escapeHTML(U.ft(w.pos)) + '"></label>';

    if (w.type === 'int') {
      var ca = M.clearDims(L, w.roomA), cb2 = M.clearDims(L, w.roomB);
      html += '<div class="divider"></div>' +
        '<div class="proprow"><span>' + escapeHTML(w.roomA.name) + '</span><b>' + U.sizeTxt(ca.w, ca.h) + '</b></div>' +
        '<div class="proprow"><span>' + escapeHTML(w.roomB.name) + '</span><b>' + U.sizeTxt(cb2.w, cb2.h) + '</b></div>' +
        '<div class="divider"></div>' +
        '<div class="seg" id="wStyle">' +
          '<button data-s="full" class="' + (style === 'full' ? 'on' : '') + '">Wall</button>' +
          '<button data-s="none" class="' + (style === 'none' ? 'on' : '') + '">Open</button>' +
        '</div>' +
        '<div class="row2">' +
          '<button class="ghost" id="wDoor">+ Door</button>' +
          '<button class="ghost" id="wOpen">+ Cased opening</button>' +
        '</div>' +
        '<button class="ghost danger" id="wDel">Remove wall (combine rooms)</button>';
    } else {
      html += '<div class="divider"></div>' +
        '<div class="row2">' +
          '<button class="ghost" id="wWin">+ Window</button>' +
          '<button class="ghost" id="wDoor">+ Door</button>' +
        '</div>' +
        '<p class="hint">Drag this wall to make the house bigger or smaller. The square footage updates as you go.</p>';
    }
    body.innerHTML = html;

    bindDim($('wPos'), w.pos, function (val) {
      I.snap(st); M.moveWall(L, w, val, st.opts.autoGrow); invalidate(true);
    });
    var seg = $('wStyle');
    if (seg) Array.prototype.forEach.call(seg.children, function (b) {
      b.onclick = function () {
        I.snap(st); M.setWallStyle(L, w.key, b.dataset.s);
        if (b.dataset.s === 'none')
          L.openings = L.openings.filter(function (o) { return o.wall !== w.key; });
        invalidate(true);
      };
    });
    if ($('wDoor')) $('wDoor').onclick = function () {
      I.snap(st);
      var o = M.addOpening(L, w, (w.a1 - w.a0) / 2, 'door');
      o.swing = I.privateSide(w);
      st.sel = { kind: 'opening', id: o.id }; invalidate(true);
    };
    if ($('wOpen')) $('wOpen').onclick = function () {
      I.snap(st);
      var o = M.addOpening(L, w, (w.a1 - w.a0) / 2, 'opening');
      st.sel = { kind: 'opening', id: o.id }; invalidate(true);
    };
    if ($('wWin')) $('wWin').onclick = function () {
      I.snap(st);
      var o = M.addOpening(L, w, (w.a1 - w.a0) / 2, 'window');
      st.sel = { kind: 'opening', id: o.id }; invalidate(true);
    };
    if ($('wDel')) $('wDel').onclick = function () {
      I.snap(st);
      var res = M.mergeRooms(L, w);
      if (!res.ok) { M.setWallStyle(L, w.key, 'none');
        toast('Wall opened up so the spaces flow together. To remove a room entirely, select it and use Delete this room.', true); }
      else { M.pruneOpenings(L); M.pruneBumps(L); toast('Rooms combined.'); }
      st.sel = null; invalidate(true);
    };
  }

  var OPEN_TYPES = [['door', 'Door'], ['double', 'Double door'], ['pocket', 'Pocket door'],
                    ['slider', 'Slider'], ['opening', 'Cased opening'], ['window', 'Window'],
                    ['garage', 'Garage door']];

  function propsOpening(body, title, L) {
    var o = L.openings.filter(function (x) { return x.id === st.sel.id; })[0];
    if (!o) { st.sel = null; return renderProps(); }
    var w = M.walls(L).filter(function (x) { return x.key === o.wall; })[0];
    if (!w) { st.sel = null; return renderProps(); }
    title.textContent = o.type === 'window' ? 'Window' : 'Door';
    body.innerHTML =
      '<label class="fld">Type<select id="oType">' + OPEN_TYPES.map(function (t) {
        return '<option value="' + t[0] + '"' + (t[0] === o.type ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select></label>' +
      '<div class="row2">' +
        '<label class="fld">Width<input class="dim" id="oW" value="' + escapeHTML(U.ft(o.w)) + '"></label>' +
        '<label class="fld">From wall start<input class="dim" id="oOff" value="' + escapeHTML(U.ft(o.off)) + '"></label>' +
      '</div>' +
      '<div class="row2">' +
        '<button class="ghost" id="oSwing">Flip swing side</button>' +
        '<button class="ghost" id="oHinge">Flip hinge end</button>' +
      '</div>' +
      '<div class="proprow"><span>On wall</span><b>' + escapeHTML(w.type === 'ext' ? 'outside' : w.roomA.name + ' / ' + w.roomB.name) + '</b></div>' +
      '<button class="ghost danger" id="oDel">Delete</button>' +
      '<p class="hint">You can also just drag it along the wall.</p>';

    $('oType').onchange = function () {
      I.snap(st); o.type = this.value;
      o.w = M.OPENING_W[o.type] || o.w; invalidate(true);
    };
    bindDim($('oW'), o.w, function (v) { I.snap(st); o.w = U.clamp(v, 12, (w.a1 - w.a0) - 6); invalidate(true); });
    bindDim($('oOff'), o.off, function (v) {
      I.snap(st); o.off = U.clamp(v, o.w / 2 + 3, (w.a1 - w.a0) - o.w / 2 - 3); invalidate(true);
    });
    $('oSwing').onclick = function () { I.snap(st); o.swing = -(o.swing || 1); invalidate(true); };
    $('oHinge').onclick = function () { I.snap(st); o.flip = -(o.flip || 1); invalidate(true); };
    $('oDel').onclick = function () { I.snap(st); M.removeOpening(L, o.id); st.sel = null; invalidate(true); };
  }

  function propsOutdoor(body, title, L) {
    var od = L.outdoor.filter(function (x) { return x.id === st.sel.id; })[0];
    if (!od) { st.sel = null; return renderProps(); }
    title.textContent = 'Outdoor Space';
    body.innerHTML =
      '<label class="fld">Label<input id="dLabel" value="' + escapeHTML(od.label) + '"></label>' +
      '<div class="row2">' +
        '<label class="fld">Width<input class="dim" id="dW" value="' + escapeHTML(U.ft(od.a1 - od.a0)) + '"></label>' +
        '<label class="fld">Depth<input class="dim" id="dD" value="' + escapeHTML(U.ft(od.depth)) + '"></label>' +
      '</div>' +
      '<div class="proprow"><span>Area</span><b>' + U.areaTxt((od.a1 - od.a0) * od.depth) + '</b></div>' +
      '<p class="hint">Porches and patios sit outside the walls and are not counted in the heated square footage.</p>' +
      '<button class="ghost danger" id="dDel">Delete</button>';
    $('dLabel').onchange = function () { I.snap(st); od.label = this.value; invalidate(true); };
    bindDim($('dW'), od.a1 - od.a0, function (v) {
      I.snap(st); var c = (od.a0 + od.a1) / 2;
      od.a0 = c - v / 2; od.a1 = c + v / 2; invalidate(true);
    });
    bindDim($('dD'), od.depth, function (v) { I.snap(st); od.depth = Math.max(24, v); invalidate(true); });
    $('dDel').onclick = function () {
      I.snap(st);
      L.outdoor = L.outdoor.filter(function (x) { return x.id !== od.id; });
      st.sel = null; invalidate(true);
    };
  }

  /* feet-and-inches input that only fires when the value really changed */
  function bindDim(el, current, apply) {
    if (!el) return;
    el.onkeydown = function (e) { if (e.key === 'Enter') el.blur(); };
    el.onchange = function () {
      var v = U.parse(el.value);
      if (isNaN(v) || v <= 0) { el.value = U.ft(current); return toast('Try something like 12\' 6"', true); }
      if (Math.abs(v - current) < 0.05) { el.value = U.ft(current); return; }
      apply(v);
    };
  }

  /* ── floors ──────────────────────────────────────────────────────── */
  function addFloor() {
    I.snap(st);
    var base = st.plan.levels[st.plan.levels.length - 1];
    var o = Object.assign({}, st.plan.opts, { stories: 2 });
    var upper = G.generate(Object.assign({}, o, { sqft: Math.round(U.sqft(M.levelArea(base)) * 0.85) }));
    var lv = upper.levels[upper.levels.length - 1];
    lv.name = 'Upper Floor ' + st.plan.levels.length;
    lv.width = Math.min(lv.width, base.width);
    lv.height = base.height;
    M.computeRects(lv);
    lv.outdoor = [];
    st.plan.levels.push(lv);
    st.plan.activeLevel = st.plan.levels.length - 1;
    fit(); syncPanels();
    toast('Floor added. The floor below shows as a dashed outline.');
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  function setTool(t) {
    st.tool = t;
    st.splitPreview = null; st.openPreview = null;
    if (t !== 'measure') st.measure = null;
    Array.prototype.forEach.call(document.querySelectorAll('#toolbtns .tool'), function (b) {
      b.classList.toggle('active', b.dataset.tool === t);
    });
    dirty = true;
  }

  function wireUI() {
    Array.prototype.forEach.call(document.querySelectorAll('#toolbtns .tool'), function (b) {
      b.onclick = function () { setTool(b.dataset.tool); };
    });

    $('btnGenerate').onclick = generate;
    $('btnBalance').onclick = function () {
      I.snap(st); M.rebalance(level().root); M.bake(level());
      invalidate(true); toast('Room sizes re-balanced to their ideal proportions.');
    };
    $('btnAddRoom').onclick = function () {
      var L = level();
      var big = M.leaves(L.root).sort(function (a, b) { return b.rect.w * b.rect.h - a.rect.w * a.rect.h; })[0];
      if (big) doSplit(big, big.rect.w >= big.rect.h ? 'v' : 'h');
    };

    $('btnUndo').onclick = function () { if (I.undo(st)) invalidate(true); };
    $('btnRedo').onclick = function () { if (I.redo(st)) invalidate(true); };
    $('btnFit').onclick = fit;
    $('btnZoomIn').onclick = function () { zoomBy(1.2); };
    $('btnZoomOut').onclick = function () { zoomBy(1 / 1.2); };

    ['lvlW', 'lvlH'].forEach(function (id) {
      var el = $(id);
      el.onkeydown = function (e) { if (e.key === 'Enter') el.blur(); };
      el.onchange = function () {
        var L = level(), v = U.parse(el.value);
        if (isNaN(v) || v < 120) { syncPanels(); return toast('Enter a size like 48\'', true); }
        I.snap(st);
        // Same rule as dragging the outside wall: the change lands on the far
        // edge, so the rooms you already sized keep their sizes.
        var axis = id === 'lvlW' ? 'w' : 'h';
        var target = Math.max(v, M.minExt(L.root, axis));
        var delta = target - (axis === 'w' ? L.width : L.height);
        if (Math.abs(delta) > 0.01) M.resizeEdge(L, axis, 'far', delta);
        invalidate(true);
      };
    });

    // drawing options
    var map = { optGrid: 'grid', optDims: 'dims', optFix: 'fixtures',
                optLabels: 'labels', optGhost: 'ghost', optGrow: 'autoGrow' };
    Object.keys(map).forEach(function (id) {
      $(id).onchange = function () { st.opts[map[id]] = this.checked; dirty = true; };
    });
    $('optSnap').onchange = function () { st.opts.snap = +this.value; };

    // dropdown menus in the toolbar
    var menu = $('exportMenu'), hmenu = $('helpMenu');
    $('btnExport').onclick = function (e) {
      e.stopPropagation(); hmenu.classList.remove('open'); menu.classList.toggle('open');
    };
    $('btnHelp').onclick = function (e) {
      e.stopPropagation(); menu.classList.remove('open'); hmenu.classList.toggle('open');
    };
    document.addEventListener('click', function () {
      menu.classList.remove('open'); hmenu.classList.remove('open');
    });
    Array.prototype.forEach.call(hmenu.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        hmenu.classList.remove('open');
        FP.HELP.open(b.dataset.help || null);
      };
    });
    Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      b.onclick = function () {
        menu.classList.remove('open');
        try {
          if (b.dataset.ex === 'png') EX.png(st);
          else if (b.dataset.ex === 'svg') EX.svg(st);
          else if (b.dataset.ex === 'dxf') EX.dxf(st);
          else if (b.dataset.ex === 'json') EX.json(st);
          else if (b.dataset.ex === 'print') EX.print(st);
          toast('Exported ' + b.dataset.ex.toUpperCase() + '.');
        } catch (err) { toast('Export failed: ' + err.message, true); }
      };
    });

    $('btnImport').onclick = function () { $('fileInput').click(); };
    $('fileInput').onchange = function () {
      var f = this.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          var p = d.plan || d;
          if (!p.levels) throw new Error('not a floor plan file');
          I.snap(st);
          st.plan = M.reindex(p); st.sel = null;
          fit(); syncPanels(); toast('Plan opened.');
        } catch (e) { toast('Could not read that file.', true); }
      };
      fr.readAsText(f);
      this.value = '';
    };

    window.addEventListener('resize', function () { dirty = true; });
  }

  function zoomBy(f) {
    var r = cv.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
    var w0 = I.toWorld(st, cx, cy);
    st.view.scale = U.clamp(st.view.scale * f, 0.02, 3);
    st.view.tx = cx - w0.x * st.view.scale;
    st.view.ty = cy - w0.y * st.view.scale;
    dirty = true;
  }

  /* keep the properties panel in step with canvas selection changes */
  var lastSel = '';
  setInterval(function () {
    var k = st.sel ? st.sel.kind + ':' + (st.sel.id || st.sel.key) : '';
    if (k !== lastSel) { lastSel = k; syncPanels(); }
  }, 120);

  var booted = false;
  function bootOnce() { if (booted) return; booted = true; boot(); }
  document.addEventListener('DOMContentLoaded', bootOnce);
  if (document.readyState !== 'loading') bootOnce();
})(window.FP);
