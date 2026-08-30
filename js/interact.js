/* interact.js — pointer handling, hit testing, tools, undo/redo.
   The rule everywhere: drag = direct manipulation, and the model clamps the
   result, so the user can never produce a broken plan by dragging. */
window.FP = window.FP || {};

(function (FP) {
  'use strict';
  var M = FP.M, U = FP.U, R = FP.R;

  /* ── undo ────────────────────────────────────────────────────────── */
  function serialize(plan) {
    return JSON.stringify(plan, function (k, v) { return k === 'rect' ? undefined : v; });
  }
  function snap(st) {
    st.history.push(serialize(st.plan));
    if (st.history.length > 60) st.history.shift();
    st.future.length = 0;
  }
  function undo(st) {
    if (!st.history.length) return false;
    st.future.push(serialize(st.plan));
    st.plan = M.reindex(JSON.parse(st.history.pop()));
    st.sel = null; return true;
  }
  function redo(st) {
    if (!st.future.length) return false;
    st.history.push(serialize(st.plan));
    st.plan = M.reindex(JSON.parse(st.future.pop()));
    st.sel = null; return true;
  }

  /* ── coordinate helpers ──────────────────────────────────────────── */
  function toWorld(st, sx, sy) {
    return { x: (sx - st.view.tx) / st.view.scale, y: (sy - st.view.ty) / st.view.scale };
  }
  function tol(st, px) { return (px || 7) / st.view.scale; }

  function distToSeg(p, w) {
    if (w.dir === 'v') {
      var dy = p.y < w.a0 ? w.a0 - p.y : p.y > w.a1 ? p.y - w.a1 : 0;
      return Math.hypot(p.x - w.pos, dy);
    }
    var dx = p.x < w.a0 ? w.a0 - p.x : p.x > w.a1 ? p.x - w.a1 : 0;
    return Math.hypot(dx, p.y - w.pos);
  }

  /* ── hit test ────────────────────────────────────────────────────── */
  function hit(st, p) {
    var lv = st.plan.levels[st.plan.activeLevel];
    M.computeRects(lv);
    var ws = M.walls(lv), t = tol(st), i, j;

    // 0. corner scale handles — they sit on top of the exterior walls
    if (st.tool === 'select') {
      var cs = M.corners(lv), ct = tol(st, 9);
      for (i = 0; i < cs.length; i++) {
        if (Math.abs(p.x - cs[i].x) < ct && Math.abs(p.y - cs[i].y) < ct)
          return { kind: 'corner', corner: cs[i] };
      }
    }
    // 1. openings (drag handles win over the wall itself)
    for (i = 0; i < ws.length; i++) {
      var w = ws[i], ops = M.openingsFor(lv, w.key);
      for (j = 0; j < ops.length; j++) {
        var g = M.openingGeom(w, ops[j]);
        var along = w.dir === 'v' ? p.y : p.x, across = w.dir === 'v' ? p.x : p.y;
        if (along > g.s - 2 && along < g.e + 2 && Math.abs(across - w.pos) < w.thick / 2 + t)
          return { kind: 'opening', id: ops[j].id, opening: ops[j], wall: w };
      }
    }
    // 2. walls — interior first (they sit on top visually)
    var best = null, bd = t * 1.4;
    for (i = 0; i < ws.length; i++) {
      if (M.wallStyle(lv, ws[i].key) === 'none' && ws[i].type === 'int') continue;
      var d = distToSeg(p, ws[i]);
      var lim = ws[i].thick / 2 + t;
      if (d < lim && (!best || d < bd || (best.type === 'ext' && ws[i].type === 'int'))) { best = ws[i]; bd = d; }
    }
    if (best) return { kind: 'wall', wall: best, key: best.key };

    // 3. bump-out floor (its walls are already hit as ordinary walls above)
    var bl = M.bumpList(lv);
    for (i = 0; i < bl.length; i++) {
      var g = bl[i];
      if (p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h)
        return { kind: 'bump', id: g.bump.id, bump: g.bump, geom: g };
    }
    // 4. outdoor slabs (outer edge = resize handle)
    var od = (lv.outdoor || []);
    for (i = 0; i < od.length; i++) {
      var r = R.odRect(lv, od[i]);
      if (p.x > r.x - t && p.x < r.x + r.w + t && p.y > r.y - t && p.y < r.y + r.h + t) {
        var edge = null;
        if (od[i].side === 'front' && Math.abs(p.y - (r.y + r.h)) < t * 1.6) edge = 'depth';
        if (od[i].side === 'back' && Math.abs(p.y - r.y) < t * 1.6) edge = 'depth';
        if (od[i].side === 'left' && Math.abs(p.x - r.x) < t * 1.6) edge = 'depth';
        if (od[i].side === 'right' && Math.abs(p.x - (r.x + r.w)) < t * 1.6) edge = 'depth';
        if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h || edge)
          return { kind: 'outdoor', od: od[i], edge: edge };
      }
    }
    // 4. rooms
    var ls = M.leaves(lv.root);
    for (i = 0; i < ls.length; i++) {
      var q = ls[i].rect;
      if (p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h)
        return { kind: 'room', id: ls[i].id, room: ls[i] };
    }
    return null;
  }

  function roomAt(lv, p) {
    var ls = M.leaves(lv.root);
    for (var i = 0; i < ls.length; i++) {
      var q = ls[i].rect;
      if (p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h) return ls[i];
    }
    return null;
  }

  /* snap a wall coordinate: grid + alignment with other parallel walls */
  function snapPos(st, lv, dir, v, exceptKey) {
    var s = st.opts.snap;
    var out = st.altKey ? v : (s > 0 ? Math.round(v / s) * s : v);
    if (st.altKey) return out;
    var lim = tol(st, 6), bestD = lim, bestV = null;
    M.walls(lv).forEach(function (w) {
      if (w.dir !== dir || w.key === exceptKey) return;
      var d = Math.abs(w.pos - v);
      if (d < bestD) { bestD = d; bestV = w.pos; }
    });
    return bestV === null ? out : bestV;
  }

  /* ── attach ──────────────────────────────────────────────────────── */
  function attach(cv, st, cb) {
    var down = null, moved = false, panning = false, spaceDown = false;

    function lv() { return st.plan.levels[st.plan.activeLevel]; }
    function pt(e) {
      var r = cv.getBoundingClientRect();
      return toWorld(st, e.clientX - r.left, e.clientY - r.top);
    }
    function cursor(c) { cv.style.cursor = c; }

    /* ---- move ---- */
    cv.addEventListener('mousemove', function (e) {
      st.altKey = e.altKey; st.shiftKey = e.shiftKey;
      var p = pt(e), L = lv();
      st.cursor = p;

      if (panning && down) {
        st.view.tx += e.clientX - down.sx; st.view.ty += e.clientY - down.sy;
        down.sx = e.clientX; down.sy = e.clientY; return cb();
      }
      if (down && !moved) {
        var dd = Math.hypot(e.clientX - down.sx0, e.clientY - down.sy0);
        if (dd > 4) moved = true;
      }

      /* --- active drags --- */
      if (down && moved && down.mode === 'wall') {
        var w = down.wall;
        var raw = w.dir === 'v' ? p.x : p.y;
        var np = snapPos(st, L, w.dir, raw + down.grab, w.key);
        M.moveWall(L, w, np, st.opts.autoGrow, st.shiftKey);
        if (w.type === 'ext' && (w.side === 'left' || w.side === 'back')) {
          // The left/back faces are pinned at the origin, so growing there
          // really moves the far edge. Shift the view by the same amount and
          // the wall appears to follow the cursor, which is what it should do.
          var d2 = w.side === 'left' ? L.width - down.prevW : L.height - down.prevH;
          if (w.side === 'left') st.view.tx -= d2 * st.view.scale;
          else st.view.ty -= d2 * st.view.scale;
        }
        down.prevW = L.width; down.prevH = L.height;
        refreshDragWall(st, down);
        return cb();
      }
      if (down && down.mode === 'corner') {
        var cn = down.corner, sn = st.opts.snap;
        var nw = cn.farX ? p.x : L.width - p.x;
        var nh = cn.farY ? p.y : L.height - p.y;
        if (!st.altKey && sn > 0) {
          nw = Math.round(nw / sn) * sn; nh = Math.round(nh / sn) * sn;
        }
        if (st.shiftKey) {                       // lock the proportions
          var sx = nw / down.w0, sy = nh / down.h0;
          var k = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
          nw = down.w0 * k; nh = down.h0 * k;
        }
        M.scaleLevel(L, nw, nh);
        // the top and left faces are pinned at the origin, so growing there
        // moves the far side; shift the view to keep the corner under the cursor
        if (!cn.farX) st.view.tx -= (L.width - down.prevW) * st.view.scale;
        if (!cn.farY) st.view.ty -= (L.height - down.prevH) * st.view.scale;
        down.prevW = L.width; down.prevH = L.height;
        return cb();
      }
      if (down && moved && down.mode === 'opening') {
        var ow = down.wall, o = down.opening;
        var along = ow.dir === 'v' ? p.y : p.x;
        var s = st.opts.snap, val = along - ow.a0 + down.grab;
        if (!st.altKey && s > 0) val = Math.round((val + ow.a0) / s) * s - ow.a0;
        o.off = U.clamp(val, o.w / 2 + 3, (ow.a1 - ow.a0) - o.w / 2 - 3);
        return cb();
      }
      if (down && moved && down.mode === 'outdoor') {
        var od = down.od, r0 = down.r0;
        if (down.edge === 'depth') {
          var d = od.side === 'front' ? p.y - L.height : od.side === 'back' ? -p.y :
                  od.side === 'left' ? -p.x : p.x - L.width;
          od.depth = Math.max(24, st.altKey ? d : Math.round(d / (st.opts.snap || 1)) * (st.opts.snap || 1));
        } else {
          var dx = (od.side === 'front' || od.side === 'back') ? p.x - down.p0.x : p.y - down.p0.y;
          var span = r0.a1 - r0.a0, lim2 = (od.side === 'front' || od.side === 'back') ? L.width : L.height;
          od.a0 = U.clamp(r0.a0 + dx, 0, lim2 - span); od.a1 = od.a0 + span;
        }
        return cb();
      }
      if (down && moved && down.mode === 'room') {
        st.dragTarget = true;
        var target = roomAt(L, p);
        st.swapTarget = (target && target.id !== down.id) ? target : null;
        cursor(st.swapTarget ? 'copy' : 'move');
        return cb();
      }
      if (down && moved && down.mode === 'measure') {
        st.measure.b = snapPoint(st, p); return cb();
      }
      if (down && down.mode === 'wallDraw') {
        var rmd = down.room;
        var ddx = p.x - down.p0.x, ddy = p.y - down.p0.y;
        // drag sideways for a wall that runs sideways; with no drag, cut the
        // room across its longer dimension
        var horiz = Math.hypot(ddx, ddy) > tol(st, 6)
          ? Math.abs(ddx) > Math.abs(ddy)
          : rmd.rect.w < rmd.rect.h;
        var ddir = horiz ? 'h' : 'v';
        var dpos = snapPos(st, L, ddir, horiz ? p.y : p.x);
        st.splitPreview = horiz
          ? { dir: 'h', pos: dpos, a0: rmd.rect.x, a1: rmd.rect.x + rmd.rect.w, room: rmd }
          : { dir: 'v', pos: dpos, a0: rmd.rect.y, a1: rmd.rect.y + rmd.rect.h, room: rmd };
        return cb();
      }

      /* --- hover feedback --- */
      var h = hit(st, p);
      st.hover = h;
      st.splitPreview = null; st.openPreview = null;

      if (st.tool === 'split') {
        var rm = h && h.kind === 'room' ? h.room : roomAt(L, p);
        if (rm) {
          var vertical = e.shiftKey ? rm.rect.h >= rm.rect.w : rm.rect.w >= rm.rect.h;
          var pos = snapPos(st, L, vertical ? 'v' : 'h', vertical ? p.x : p.y);
          st.splitPreview = vertical
            ? { dir: 'v', pos: pos, a0: rm.rect.y, a1: rm.rect.y + rm.rect.h, room: rm }
            : { dir: 'h', pos: pos, a0: rm.rect.x, a1: rm.rect.x + rm.rect.w, room: rm };
          cursor('crosshair');
        } else cursor('default');
      } else if (st.tool === 'door' || st.tool === 'window') {
        var ww = h && (h.kind === 'wall' || h.kind === 'opening') ? h.wall : null;
        if (ww) {
          var wid = M.OPENING_W[st.tool === 'door' ? 'door' : 'window'];
          var al = ww.dir === 'v' ? p.y : p.x;
          var c = U.clamp(al, ww.a0 + wid / 2 + 3, ww.a1 - wid / 2 - 3);
          st.openPreview = { dir: ww.dir, pos: ww.pos, s: c - wid / 2, w: wid };
          cursor('crosshair');
        } else cursor('not-allowed');
      } else if (st.tool === 'erase') {
        cursor(h && h.kind === 'wall' ? 'crosshair' : 'default');
      } else if (st.tool === 'measure') {
        cursor('crosshair');
      } else {
        if (spaceDown) cursor('grab');
        else if (h && h.kind === 'corner') cursor(h.corner.id === 'tl' || h.corner.id === 'br' ? 'nwse-resize' : 'nesw-resize');
        else if (h && h.kind === 'opening') cursor('move');
        else if (h && h.kind === 'wall') cursor(h.wall.dir === 'v' ? 'ew-resize' : 'ns-resize');
        else if (h && h.kind === 'bump') cursor('pointer');
        else if (h && h.kind === 'outdoor') cursor(h.edge ? (h.od.side === 'front' || h.od.side === 'back' ? 'ns-resize' : 'ew-resize') : 'move');
        else if (h && h.kind === 'room') cursor('move');
        else cursor('default');
      }
      cb();
    });

    function snapPoint(st, p) {
      var s = st.opts.snap;
      if (st.altKey || !s) return p;
      return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
    }
    function refreshDragWall(st, down) {
      // walls are rebuilt every frame; re-find the one we are dragging
      var L = st.plan.levels[st.plan.activeLevel];
      var found = M.walls(L).filter(function (w) { return w.key === down.wall.key; })[0];
      if (found) { down.wall = found; st.dragWall = found; }
    }

    /* ---- down ---- */
    cv.addEventListener('mousedown', function (e) {
      cv.focus();
      var p = pt(e), L = lv();
      st.altKey = e.altKey; st.shiftKey = e.shiftKey;
      moved = false;

      if (e.button === 1 || spaceDown || (e.button === 0 && st.tool === 'pan')) {
        panning = true; down = { sx: e.clientX, sy: e.clientY, sx0: e.clientX, sy0: e.clientY };
        cursor('grabbing'); e.preventDefault(); return;
      }
      if (e.button !== 0) return;
      var h = hit(st, p);

      if (st.tool === 'measure') {
        var q = snapPoint(st, p);
        st.measure = { a: q, b: q };
        down = { mode: 'measure', sx0: e.clientX, sy0: e.clientY }; moved = true;
        return cb();
      }
      if (st.tool === 'split') {
        // Press starts the wall; dragging chooses which way it runs, and a
        // plain click just drops it. Committed on mouseup.
        var rm0 = (h && h.kind === 'room') ? h.room : roomAt(L, p);
        if (rm0) down = { mode: 'wallDraw', room: rm0, p0: p, sx0: e.clientX, sy0: e.clientY };
        else st.toast('Click inside a room to add a wall across it.', true);
        return cb();
      }
      if (st.tool === 'door' || st.tool === 'window') {
        // clicking over an existing opening still means "put one on this wall"
        var tw = h && (h.kind === 'wall' ? h.wall : h.kind === 'opening' ? h.wall : null);
        if (tw) {
          if (st.tool === 'window' && tw.type !== 'ext') { st.toast('Windows go on outside walls.', true); return cb(); }
          snap(st);
          var al2 = tw.dir === 'v' ? p.y : p.x;
          var o = M.addOpening(L, tw, al2 - tw.a0, st.tool === 'door' ? 'door' : 'window');
          if (tw.type === 'int') o.swing = privateSide(tw);
          st.sel = { kind: 'opening', id: o.id };
          st.setTool('select');
        } else st.toast('Click on a wall to place it.', true);
        return cb();
      }
      if (st.tool === 'erase') {
        if (h && h.kind === 'wall') {
          if (h.wall.type === 'ext') { st.toast('Outside walls cannot be removed — drag them to resize.', true); return cb(); }
          snap(st);
          var res = M.mergeRooms(L, h.wall);
          if (res.ok) { M.pruneOpenings(L); M.pruneBumps(L); M.pruneGroups(L); st.toast('Rooms combined.'); }
          else { M.setWallStyle(L, h.wall.key, 'none');
                 L.openings = L.openings.filter(function (x) { return x.wall !== h.wall.key; });
                 st.toast('Wall opened up. To remove a room entirely, select it and use Delete this room.'); }
          st.sel = null; st.setTool('select');
        }
        return cb();
      }

      /* select tool */
      if (h && h.kind === 'corner') {
        snap(st);
        down = { mode: 'corner', corner: h.corner, w0: L.width, h0: L.height,
                 prevW: L.width, prevH: L.height, sx0: e.clientX, sy0: e.clientY };
        st.dragCorner = h.corner.id;
        st.sel = null;
      } else if (h && h.kind === 'opening') {
        var g = M.openingGeom(h.wall, h.opening);
        var al3 = h.wall.dir === 'v' ? p.y : p.x;
        snap(st);
        down = { mode: 'opening', wall: h.wall, opening: h.opening, grab: g.mid - al3,
                 sx0: e.clientX, sy0: e.clientY };
        st.sel = { kind: 'opening', id: h.opening.id };
      } else if (h && h.kind === 'wall') {
        var raw = h.wall.dir === 'v' ? p.x : p.y;
        snap(st);
        down = { mode: 'wall', wall: h.wall, grab: h.wall.pos - raw,
                 prevW: L.width, prevH: L.height, sx0: e.clientX, sy0: e.clientY };
        st.dragWall = h.wall;
        st.sel = { kind: 'wall', key: h.wall.key };
      } else if (h && h.kind === 'outdoor') {
        snap(st);
        down = { mode: 'outdoor', od: h.od, edge: h.edge, p0: p,
                 r0: { a0: h.od.a0, a1: h.od.a1, depth: h.od.depth },
                 sx0: e.clientX, sy0: e.clientY };
        st.sel = { kind: 'outdoor', id: h.od.id };
      } else if (h && h.kind === 'bump') {
        st.sel = { kind: 'bump', id: h.bump.id };
        down = { mode: 'none', sx0: e.clientX, sy0: e.clientY };
      } else if (h && h.kind === 'room') {
        if (e.shiftKey) {
          // Shift builds up a set of rooms to join; no dragging in this mode
          var ids = (st.sel && st.sel.kind === 'rooms') ? st.sel.ids.slice()
                  : (st.sel && st.sel.kind === 'room') ? [st.sel.id] : [];
          var at = ids.indexOf(h.room.id);
          if (at >= 0) ids.splice(at, 1); else ids.push(h.room.id);
          st.sel = ids.length > 1 ? { kind: 'rooms', ids: ids }
                 : ids.length === 1 ? { kind: 'room', id: ids[0] } : null;
          down = { mode: 'none', sx0: e.clientX, sy0: e.clientY };
        } else {
          down = { mode: 'room', id: h.room.id, sx0: e.clientX, sy0: e.clientY };
          st.sel = { kind: 'room', id: h.room.id };
        }
      } else {
        st.sel = null;
        panning = true; down = { sx: e.clientX, sy: e.clientY, sx0: e.clientX, sy0: e.clientY };
        cursor('grabbing');
      }
      cb();
    });

    /* ---- up ---- */
    window.addEventListener('mouseup', function () {
      // A mouseup that did not begin on the canvas is not ours — most likely
      // the user is pressing a button in a side panel. Redrawing the panels
      // here would detach that button before the browser delivers its click,
      // which silently swallows the press.
      if (!down) return;
      if (down.mode === 'wallDraw' && st.splitPreview) {
        var sp = st.splitPreview, rm = sp.room, L2 = lv();
        snap(st);
        var ratio = sp.dir === 'v' ? (sp.pos - rm.rect.x) / rm.rect.w
                                   : (sp.pos - rm.rect.y) / rm.rect.h;
        var nr = M.splitRoom(L2, rm.id, sp.dir, U.clamp(ratio, 0.08, 0.92));
        M.pruneOpenings(L2); M.pruneBumps(L2);
        st.sel = nr ? { kind: 'room', id: nr.id } : null;
        st.splitPreview = null;
        st.toast('Wall added — name the new room on the right.');
        st.setTool('select');
      }
      if (down && down.mode === 'room' && moved && st.swapTarget) {
        snap(st);
        M.swapRooms(lv(), down.id, st.swapTarget.id);
        st.toast('Rooms swapped.');
      }
      if (down && !moved && down.mode === 'wall') { /* click-select only */ }
      down = null; moved = false; panning = false;
      st.dragWall = null; st.swapTarget = null; st.dragTarget = false; st.dragCorner = null;
      cursor('default');
      cb(true);
    });

    /* ---- wheel zoom at cursor ---- */
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      var w0 = toWorld(st, sx, sy);
      var f = Math.pow(1.0016, -e.deltaY);
      st.view.scale = U.clamp(st.view.scale * f, 0.02, 3);
      st.view.tx = sx - w0.x * st.view.scale;
      st.view.ty = sy - w0.y * st.view.scale;
      cb();
    }, { passive: false });

    /* ---- keys ---- */
    window.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      // the guide is a modal: only let Escape through while it is open
      if (FP.HELP && FP.HELP.isOpen()) {
        if (e.key === 'Escape') { FP.HELP.close(); e.preventDefault(); }
        return;
      }
      if (e.key === 'F1' || e.key === '?') {
        if (FP.HELP) { FP.HELP.open(); e.preventDefault(); }
        return;
      }
      if (e.code === 'Space') { spaceDown = true; cursor('grab'); e.preventDefault(); return; }
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey ? redo(st) : undo(st)) cb(true); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); if (redo(st)) cb(true); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (k === 'v') st.setTool('select');
      else if (k === 'w') st.setTool('split');
      else if (k === 'd') st.setTool('door');
      else if (k === 'n') st.setTool('window');
      else if (k === 'e') st.setTool('erase');
      else if (k === 'm') st.setTool('measure');
      else if (k === 'f') st.fit();
      else if (k === 'escape') { st.sel = null; st.measure = null; st.setTool('select'); }
      else if (k === 'delete' || k === 'backspace') {
        if (st.sel && st.sel.kind === 'opening') {
          snap(st); M.removeOpening(lv(), st.sel.id); st.sel = null; cb(true);
        } else if (st.sel && st.sel.kind === 'bump') {
          snap(st); M.removeBump(lv(), st.sel.id); M.pruneOpenings(lv()); M.pruneBumps(lv()); M.pruneGroups(lv()); st.sel = null; cb(true);
        } else if (st.sel && st.sel.kind === 'room' && st.deleteRoom) {
          var rm = M.indexOf(lv().root).byId[st.sel.id];
          if (rm) st.deleteRoom(rm);          // handles its own undo snapshot
        }
      } else return;
      cb(true);
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space') { spaceDown = false; cursor('default'); }
    });
  }

  /* which way a door should swing: into the more private room */
  var PRIV = { wet: 3, private: 3, storage: 3, service: 2, living: 1, circ: 0, outdoor: 0, other: 1 };
  function privateSide(w) {
    if (w.type !== 'int') return 1;
    var ga = PRIV[(M.CATALOG[w.roomA.type] || {}).group] || 1;
    var gb = PRIV[(M.CATALOG[w.roomB.type] || {}).group] || 1;
    var target = ga >= gb ? w.roomA : w.roomB;
    var minusSide = w.dir === 'v' ? (target.rect.x + target.rect.w <= w.pos + 1) : (target.rect.y + target.rect.h <= w.pos + 1);
    return minusSide ? -1 : 1;
  }

  FP.I = { attach: attach, hit: hit, snap: snap, undo: undo, redo: redo,
           serialize: serialize, toWorld: toWorld, privateSide: privateSide };
})(window.FP);
