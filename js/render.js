/* render.js — canvas drawing.
 *
 * Shapes are drawn in world space (inches) via a canvas transform, but every
 * piece of text is drawn in screen space at a fixed pixel size, so labels and
 * dimensions stay readable at any zoom — the thing that makes CAD feel awkward
 * to novices when it is done the other way.
 */
window.FP = window.FP || {};

(function (FP) {
  'use strict';
  var M = FP.M, U = FP.U, FX = FP.FX;

  var C = {
    paper: '#f3f1ec', sheet: '#ffffff', grid: '#e4e1da', grid5: '#d5d1c8',
    wall: '#26292e', wallSoft: '#6b7280',
    room: '#ffffff', roomSel: '#e8f1ff', roomHot: '#f4f8ff',
    text: '#1d1f22', text2: '#6b7280',
    accent: '#1f6feb', accentSoft: 'rgba(31,111,235,.22)',
    dim: '#9aa1aa', dimText: '#4b5158',
    fixture: '#8e949c', ghost: '#d8d5ce', outdoor: '#f0efe9', outdoorLine: '#b9b5ab'
  };

  function R() { }
  R.prototype = {};

  /* ── view helpers ────────────────────────────────────────────────── */
  function bounds(level) {
    var b = { x0: 0, y0: 0, x1: level.width, y1: level.height };
    M.bumpList(level).forEach(function (g) {
      b.x0 = Math.min(b.x0, g.x); b.y0 = Math.min(b.y0, g.y);
      b.x1 = Math.max(b.x1, g.x + g.w); b.y1 = Math.max(b.y1, g.y + g.h);
    });
    (level.outdoor || []).forEach(function (o) {
      if (o.side === 'front') b.y1 = Math.max(b.y1, level.height + o.depth);
      if (o.side === 'back') b.y0 = Math.min(b.y0, -o.depth);
      if (o.side === 'left') b.x0 = Math.min(b.x0, -o.depth);
      if (o.side === 'right') b.x1 = Math.max(b.x1, level.width + o.depth);
    });
    return b;
  }

  /* the heated shell only — base rectangle plus bumps, without porch or patio */
  function houseBounds(level) {
    var b = { x0: 0, y0: 0, x1: level.width, y1: level.height };
    M.bumpList(level).forEach(function (g) {
      b.x0 = Math.min(b.x0, g.x); b.y0 = Math.min(b.y0, g.y);
      b.x1 = Math.max(b.x1, g.x + g.w); b.y1 = Math.max(b.y1, g.y + g.h);
    });
    return b;
  }

  function fit(level, cw, ch, pad) {
    var b = bounds(level);
    pad = pad === undefined ? 96 : pad;                 // 8 ft of margin for dims
    var w = (b.x1 - b.x0) + pad * 2, h = (b.y1 - b.y0) + pad * 2;
    var s = Math.min(cw / w, ch / h);
    return { scale: s, tx: cw / 2 - (b.x0 + b.x1) / 2 * s, ty: ch / 2 - (b.y0 + b.y1) / 2 * s };
  }

  /* ── main draw ───────────────────────────────────────────────────── */
  function draw(cv, st) {
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = st.exporting ? '#ffffff' : C.paper;
    ctx.fillRect(0, 0, cw, ch);

    var plan = st.plan, level = plan.levels[plan.activeLevel];
    if (!level) return;
    M.computeRects(level);

    var v = st.view, s = v.scale;
    var world = function () { ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * v.tx, dpr * v.ty); };
    var screen = function () { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    var px = function (n) { return n / s; };            // n screen px in world units
    var X = function (wx) { return wx * s + v.tx; };
    var Y = function (wy) { return wy * s + v.ty; };

    var api = { ctx: ctx, world: world, screen: screen, px: px, X: X, Y: Y, st: st, level: level, s: s };

    if (st.opts.grid && !st.exporting) drawGrid(api, cw, ch);
    if (st.opts.ghost && plan.activeLevel > 0) drawGhost(api, plan.levels[plan.activeLevel - 1]);

    drawOutdoor(api);
    drawRooms(api);
    if (st.opts.fixtures) drawFixtures(api);
    drawWalls(api);
    drawOutdoorEdges(api);
    drawOpenings(api);
    if (st.opts.labels) drawLabels(api);
    if (st.opts.dims) drawDims(api);
    drawOverlay(api);
    drawCorners(api);
  }

  /* ── grid ────────────────────────────────────────────────────────── */
  function drawGrid(a, cw, ch) {
    var ctx = a.ctx, s = a.s, v = a.st.view;
    var step = 12, big = 60;
    if (step * s < 5) { step = 60; big = 600; }
    if (step * s < 5) return;
    var x0 = Math.floor((-v.tx / s) / step) * step, x1 = (cw - v.tx) / s;
    var y0 = Math.floor((-v.ty / s) / step) * step, y1 = (ch - v.ty) / s;
    a.screen();
    ctx.lineWidth = 1;
    for (var x = x0; x < x1; x += step) {
      ctx.strokeStyle = (Math.round(x) % big === 0) ? C.grid5 : C.grid;
      var sx = Math.round(a.X(x)) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, ch); ctx.stroke();
    }
    for (var y = y0; y < y1; y += step) {
      ctx.strokeStyle = (Math.round(y) % big === 0) ? C.grid5 : C.grid;
      var sy = Math.round(a.Y(y)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cw, sy); ctx.stroke();
    }
  }

  /* ── ghost of the level below ────────────────────────────────────── */
  function drawGhost(a, low) {
    if (!low) return;
    M.computeRects(low);
    var ctx = a.ctx; a.world();
    ctx.save();
    ctx.strokeStyle = C.ghost; ctx.lineWidth = a.px(1.5); ctx.setLineDash([a.px(7), a.px(6)]);
    ctx.strokeRect(0, 0, low.width, low.height);
    M.leaves(low.root).forEach(function (l) { ctx.strokeRect(l.rect.x, l.rect.y, l.rect.w, l.rect.h); });
    ctx.restore();
  }

  /* ── outdoor slabs ───────────────────────────────────────────────── */
  function odRect(level, o) {
    if (o.side === 'front') return { x: o.a0, y: level.height, w: o.a1 - o.a0, h: o.depth };
    if (o.side === 'back') return { x: o.a0, y: -o.depth, w: o.a1 - o.a0, h: o.depth };
    if (o.side === 'left') return { x: -o.depth, y: o.a0, w: o.depth, h: o.a1 - o.a0 };
    return { x: level.width, y: o.a0, w: o.depth, h: o.a1 - o.a0 };
  }
  function drawOutdoor(a) {
    var ctx = a.ctx, lv = a.level; a.world();
    (lv.outdoor || []).forEach(function (o) {
      var r = odRect(lv, o);
      ctx.fillStyle = C.outdoor; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.save();
      ctx.strokeStyle = C.outdoorLine; ctx.lineWidth = a.px(1.4); ctx.setLineDash([a.px(8), a.px(5)]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      // porch posts
      if (o.type === 'porch') {
        var n = Math.max(2, Math.round((o.a1 - o.a0) / 96));
        ctx.fillStyle = C.wall;
        for (var i = 0; i <= n; i++) {
          var pxp = r.x + (r.w) * (i / n) - 4;
          ctx.fillRect(U.clamp(pxp, r.x, r.x + r.w - 8), r.y + r.h - 8, 8, 8);
        }
      }
    });
  }

  /* ── rooms ───────────────────────────────────────────────────────── */
  function drawRooms(a) {
    var ctx = a.ctx, lv = a.level, st = a.st; a.world();
    var selIds = {};
    if (st.sel && st.sel.kind === 'room')
      M.roomCells(lv, M.indexOf(lv.root).byId[st.sel.id]).forEach(function (c) { selIds[c.id] = 1; });
    if (st.sel && st.sel.kind === 'rooms')
      st.sel.ids.forEach(function (id) {
        M.roomCells(lv, M.indexOf(lv.root).byId[id]).forEach(function (c) { selIds[c.id] = 1; });
      });

    M.leaves(lv.root).forEach(function (l) {
      var R = l.rect;
      var sel = !!selIds[l.id];
      var hot = st.hover && st.hover.kind === 'room' && st.hover.id === l.id && st.tool === 'select';
      ctx.fillStyle = sel ? C.roomSel
                    : M.isOutdoor(l) ? C.outdoor
                    : (hot && st.dragTarget ? C.roomHot : C.room);
      ctx.fillRect(R.x, R.y, R.w, R.h);
    });
    // bump-out floors: part of their host room, so no wall between them
    M.bumpList(lv).forEach(function (g) {
      var selB = st.sel && st.sel.kind === 'bump' && st.sel.id === g.bump.id;
      var selR = st.sel && st.sel.kind === 'room' && st.sel.id === g.room.id;
      ctx.fillStyle = (selB || selR) ? C.roomSel : C.room;
      ctx.fillRect(g.x, g.y, g.w, g.h);
      if (selB) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = a.px(2);
        ctx.strokeRect(g.x, g.y, g.w, g.h);
      }
    });
    if (st.swapTarget) {
      var t = st.swapTarget.rect;
      ctx.fillStyle = C.accentSoft; ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = C.accent; ctx.lineWidth = a.px(2);
      ctx.strokeRect(t.x, t.y, t.w, t.h);
    }
  }

  function drawFixtures(a) {
    var lv = a.level; a.world();
    M.leaves(lv.root).forEach(function (l) {
      // one set of furniture per room, centred on the biggest rectangle that
      // actually fits inside it — for an L-shape that is not the bounding box
      if (l.group && M.groupAnchor(lv, l.group) !== l) return;
      FX.draw(a.ctx, l.type, M.innerClear(lv, l), a.px(1));
    });
  }

  /* ── walls ───────────────────────────────────────────────────────── */
  function poly(ctx, pts) {
    if (!pts.length) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawWalls(a) {
    var ctx = a.ctx, lv = a.level; a.world();
    var E = M.EXT_W;
    // Exterior ring as one even-odd fill between the outline and the same
    // outline pushed a wall inward. Works for a plain rectangle and for any
    // number of bump-outs, with correct corners at both convex and reflex turns.
    var ol = M.outline(lv);
    ctx.fillStyle = C.wall;
    ctx.beginPath();
    poly(ctx, ol.outer);
    poly(ctx, ol.inner);
    ctx.fill('evenodd');

    a.walls = M.walls(lv);
    a.walls.forEach(function (w) {
      if (w.type !== 'int') return;
      if (M.wallStyle(lv, w.key) === 'none') return;
      var t = w.thick, h = t / 2;
      if (w.dir === 'v') {
        var y0 = U.clamp(w.a0 - h, E, lv.height - E), y1 = U.clamp(w.a1 + h, E, lv.height - E);
        ctx.fillRect(w.pos - h, y0, t, y1 - y0);
      } else {
        var x0 = U.clamp(w.a0 - h, E, lv.width - E), x1 = U.clamp(w.a1 + h, E, lv.width - E);
        ctx.fillRect(x0, w.pos - h, x1 - x0, t);
      }
    });
  }

  /* An outdoor room sits inside the footprint but outside the heated shell,
     so the solid exterior wall is cut away where it faces the open air and
     replaced with posts — the way a tucked-in porch is actually built. The
     insulated wall between it and the house is already drawn at exterior
     thickness by the wall pass. */
  function drawOutdoorEdges(a) {
    var ctx = a.ctx, lv = a.level, E = M.EXT_W;
    var rooms = M.leaves(lv.root).filter(M.isOutdoor);
    if (!rooms.length) return;
    a.world();
    rooms.forEach(function (l) {
      var R = l.rect, bands = [];
      if (R.x < 0.6) bands.push({ x: R.x, y: R.y, w: E, h: R.h, dir: 'v' });
      if (Math.abs(R.x + R.w - lv.width) < 0.6)
        bands.push({ x: R.x + R.w - E, y: R.y, w: E, h: R.h, dir: 'v' });
      if (R.y < 0.6) bands.push({ x: R.x, y: R.y, w: R.w, h: E, dir: 'h' });
      if (Math.abs(R.y + R.h - lv.height) < 0.6)
        bands.push({ x: R.x, y: R.y + R.h - E, w: R.w, h: E, dir: 'h' });

      bands.forEach(function (b) {
        ctx.fillStyle = C.outdoor;                  // cut the shell open
        ctx.fillRect(b.x - 0.3, b.y - 0.3, b.w + 0.6, b.h + 0.6);

        ctx.save();                                 // roof edge above
        ctx.strokeStyle = C.outdoorLine;
        ctx.lineWidth = a.px(1.4);
        ctx.setLineDash([a.px(8), a.px(5)]);
        ctx.beginPath();
        if (b.dir === 'v') {
          var x = (R.x < 0.6) ? b.x + E / 2 : b.x + E / 2;
          ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h);
        } else {
          var y = b.y + E / 2;
          ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y);
        }
        ctx.stroke();
        ctx.restore();

        var run = b.dir === 'v' ? b.h : b.w;        // posts along the opening
        var n = Math.max(2, Math.round(run / 96));
        ctx.fillStyle = C.wall;
        for (var i = 0; i <= n; i++) {
          var t = i / n, s = 8;
          if (b.dir === 'v') ctx.fillRect(b.x + (E - s) / 2, U.clamp(b.y + b.h * t - s / 2, b.y, b.y + b.h - s), s, s);
          else ctx.fillRect(U.clamp(b.x + b.w * t - s / 2, b.x, b.x + b.w - s), b.y + (E - s) / 2, s, s);
        }
      });
    });
  }

  /* ── openings ────────────────────────────────────────────────────── */
  function drawOpenings(a) {
    var ctx = a.ctx, lv = a.level, st = a.st;
    var byKey = {}; (a.walls || M.walls(lv)).forEach(function (w) { byKey[w.key] = w; });
    a.world();
    lv.openings.forEach(function (o) {
      var w = byKey[o.wall];
      if (!w) return;
      if (w.type === 'int' && M.wallStyle(lv, o.wall) === 'none') return;
      var g = M.openingGeom(w, o), t = w.thick, h = t / 2;
      // punch the hole
      ctx.fillStyle = C.sheet;
      if (w.dir === 'v') ctx.fillRect(w.pos - h - 0.3, g.s, t + 0.6, g.w);
      else ctx.fillRect(g.s, w.pos - h - 0.3, g.w, t + 0.6);

      ctx.strokeStyle = C.wall; ctx.lineWidth = a.px(1.3);
      if (o.type === 'window') drawWindow(a, w, g, t);
      else if (o.type === 'opening') drawCased(a, w, g, t);
      else if (o.type === 'slider') drawSlider(a, w, g, t);
      else if (o.type === 'garage') drawGarageDoor(a, w, g, t);
      else drawDoor(a, w, g, t, o);

      if (st.sel && st.sel.kind === 'opening' && st.sel.id === o.id) {
        ctx.save();
        ctx.strokeStyle = C.accent; ctx.lineWidth = a.px(2.5);
        if (w.dir === 'v') ctx.strokeRect(w.pos - h - 2, g.s - 2, t + 4, g.w + 4);
        else ctx.strokeRect(g.s - 2, w.pos - h - 2, g.w + 4, t + 4);
        ctx.restore();
      }
    });
  }

  function drawWindow(a, w, g, t) {
    var ctx = a.ctx, h = t / 2, i;
    ctx.beginPath();
    if (w.dir === 'v') {
      [w.pos - h, w.pos - t * 0.16, w.pos + t * 0.16, w.pos + h].forEach(function (x) {
        ctx.moveTo(x, g.s); ctx.lineTo(x, g.e);
      });
      ctx.moveTo(w.pos - h, g.s); ctx.lineTo(w.pos + h, g.s);
      ctx.moveTo(w.pos - h, g.e); ctx.lineTo(w.pos + h, g.e);
    } else {
      [w.pos - h, w.pos - t * 0.16, w.pos + t * 0.16, w.pos + h].forEach(function (y) {
        ctx.moveTo(g.s, y); ctx.lineTo(g.e, y);
      });
      ctx.moveTo(g.s, w.pos - h); ctx.lineTo(g.s, w.pos + h);
      ctx.moveTo(g.e, w.pos - h); ctx.lineTo(g.e, w.pos + h);
    }
    ctx.stroke();
  }
  function jambs(a, w, g, t) {
    var ctx = a.ctx, h = t / 2;
    ctx.beginPath();
    if (w.dir === 'v') {
      ctx.moveTo(w.pos - h, g.s); ctx.lineTo(w.pos + h, g.s);
      ctx.moveTo(w.pos - h, g.e); ctx.lineTo(w.pos + h, g.e);
    } else {
      ctx.moveTo(g.s, w.pos - h); ctx.lineTo(g.s, w.pos + h);
      ctx.moveTo(g.e, w.pos - h); ctx.lineTo(g.e, w.pos + h);
    }
    ctx.stroke();
  }
  function drawCased(a, w, g, t) { jambs(a, w, g, t); }

  function drawDoor(a, w, g, t, o) {
    var ctx = a.ctx, sw = o.swing || 1, fl = o.flip || 1;
    jambs(a, w, g, t);
    var hx, hy, lx, ly, a0, a1;
    if (w.dir === 'v') {
      hy = fl > 0 ? g.s : g.e; hx = w.pos;
      lx = hx + sw * g.w; ly = hy;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(lx, ly); ctx.stroke();
      a0 = Math.atan2(0, sw);
      a1 = Math.atan2(fl > 0 ? 1 : -1, 0);
    } else {
      hx = fl > 0 ? g.s : g.e; hy = w.pos;
      lx = hx; ly = hy + sw * g.w;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(lx, ly); ctx.stroke();
      a0 = Math.atan2(sw, 0);
      a1 = Math.atan2(0, fl > 0 ? 1 : -1);
    }
    ctx.save();
    ctx.strokeStyle = C.wallSoft; ctx.lineWidth = a.px(1);
    ctx.beginPath();
    ctx.arc(hx, hy, g.w, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    ctx.restore();
  }
  function drawSlider(a, w, g, t) {
    var ctx = a.ctx, h = t / 2;
    jambs(a, w, g, t);
    ctx.beginPath();
    if (w.dir === 'v') {
      ctx.moveTo(w.pos - h * 0.5, g.s); ctx.lineTo(w.pos - h * 0.5, g.s + g.w * 0.55);
      ctx.moveTo(w.pos + h * 0.5, g.e); ctx.lineTo(w.pos + h * 0.5, g.e - g.w * 0.55);
    } else {
      ctx.moveTo(g.s, w.pos - h * 0.5); ctx.lineTo(g.s + g.w * 0.55, w.pos - h * 0.5);
      ctx.moveTo(g.e, w.pos + h * 0.5); ctx.lineTo(g.e - g.w * 0.55, w.pos + h * 0.5);
    }
    ctx.stroke();
  }
  function drawGarageDoor(a, w, g, t) {
    var ctx = a.ctx, n = 5, i;
    jambs(a, w, g, t);
    ctx.save(); ctx.strokeStyle = C.wallSoft; ctx.lineWidth = a.px(1);
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      var f = i / n;
      if (w.dir === 'v') { ctx.moveTo(w.pos - t / 2, g.s + g.w * f); ctx.lineTo(w.pos + t / 2, g.s + g.w * f); }
      else { ctx.moveTo(g.s + g.w * f, w.pos - t / 2); ctx.lineTo(g.s + g.w * f, w.pos + t / 2); }
    }
    ctx.stroke(); ctx.restore();
  }

  /* ── text in screen space ────────────────────────────────────────── */
  function text(a, str, wx, wy, o) {
    o = o || {};
    var ctx = a.ctx; a.screen();
    ctx.font = (o.weight || 600) + ' ' + (o.size || 11) + 'px "Segoe UI",Inter,system-ui,sans-serif';
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    var x = a.X(wx), y = a.Y(wy);
    if (o.rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0; }
    if (o.halo !== false) {
      ctx.lineWidth = 3.5; ctx.strokeStyle = o.haloColor || 'rgba(255,255,255,.92)';
      ctx.lineJoin = 'round'; ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || C.text;
    ctx.fillText(str, x, y);
    if (o.rot) ctx.restore();
  }
  function textW(a, str, size, weight) {
    var ctx = a.ctx; a.screen();
    ctx.font = (weight || 600) + ' ' + (size || 11) + 'px "Segoe UI",Inter,system-ui,sans-serif';
    return ctx.measureText(str).width;
  }

  /* ── room labels ─────────────────────────────────────────────────── */
  function drawLabels(a) {
    var lv = a.level, s = a.s;
    M.leaves(lv.root).forEach(function (l) {
      // one label per joined room, sitting in its biggest cell
      if (l.group && M.groupAnchor(lv, l.group) !== l) return;
      var cd = M.clearDims(lv, l), R = l.rect;
      // a joined room's label goes on the largest rectangle inside it, so it
      // never lands in the notch of an L
      if (l.group) R = M.innerRect(lv, l);
      var wpx = R.w * s, hpx = R.h * s;
      if (wpx < 34 || hpx < 20) return;
      var cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      var name = l.name || (M.CATALOG[l.type] || {}).label || 'ROOM';
      // a joined room is not a rectangle, so quote its area rather than W x D
      var sizeStr = l.group ? '(' + U.areaTxt(M.groupArea(lv, l.group)) + ')'
                            : '(' + U.sizeTxt(cd.w, cd.h) + ')';
      var nw = textW(a, name, 11, 700);
      var vertical = hpx > wpx * 1.7 && wpx < nw + 14;
      if (vertical) {
        text(a, name, cx, cy, { size: 10.5, weight: 700, rot: -Math.PI / 2, color: C.text });
        return;
      }
      if (wpx < nw + 10) {                                     // too tight: shrink
        if (wpx < 46) { text(a, shorten(name), cx, cy, { size: 9, weight: 700 }); return; }
        text(a, name, cx, cy, { size: 9, weight: 700 });
        return;
      }
      var two = hpx > 46 && wpx > textW(a, sizeStr, 10, 500) + 10;
      text(a, name, cx, two ? cy - 7 : cy, { size: 11, weight: 700 });
      if (two) text(a, sizeStr, cx, cy + 7, { size: 10, weight: 500, color: C.text2 });
      // a locked room says so on the drawing, not just in the panel
      if (l.locked && wpx > 34 && hpx > 30)
        text(a, '🔒', R.x + R.w - a.px(11), R.y + a.px(11), { size: 10, halo: false });
    });

    // outdoor labels
    (lv.outdoor || []).forEach(function (o) {
      var r = odRect(lv, o);
      if (r.w * s < 40) return;
      text(a, o.label, r.x + r.w / 2, r.y + r.h / 2 - 6, { size: 10.5, weight: 700, color: '#575d64' });
      text(a, '(' + U.sizeTxt(r.w, r.h) + ')', r.x + r.w / 2, r.y + r.h / 2 + 7, { size: 9.5, weight: 500, color: C.text2 });
    });

    // title block, bottom-right of the footprint
    var b = bounds(lv);
    var ab = M.areaBreakdown(lv);
    var sub = 'Approx. ' + U.sqft(ab.heated).toLocaleString() + ' SQ FT' +
              (ab.garage ? ' + ' + U.sqft(ab.garage).toLocaleString() + ' SQ FT GARAGE' : '') +
              (ab.outdoor ? ' + ' + U.sqft(ab.outdoor).toLocaleString() + ' SQ FT OUTDOOR' : '');
    var hb = houseBounds(lv), over = M.bumpList(lv).length ? '  OVERALL' : '';
    text(a, U.ft(hb.x1 - hb.x0) + '  x  ' + U.ft(hb.y1 - hb.y0) + over, b.x1, b.y1 + 74,
         { size: 13, weight: 700, align: 'right' });
    text(a, sub, b.x1, b.y1 + 92, { size: 12, weight: 500, align: 'right', color: C.text2 });
  }
  function shorten(n) {
    return n.replace('BEDROOM', 'BED').replace('PRIMARY', 'PRIM').replace('WALK-IN ', '')
            .replace('LAUNDRY/UTILITY', 'LAUN').replace('MUDROOM', 'MUD').split(' ')[0];
  }

  /* ── dimensions ──────────────────────────────────────────────────── */
  function dimLine(a, x1, y1, x2, y2, label, o) {
    o = o || {};
    var ctx = a.ctx; a.world();
    ctx.strokeStyle = o.color || C.dim; ctx.lineWidth = a.px(1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // slash ticks
    var horiz = Math.abs(y2 - y1) < 0.01, k = a.px(4);
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(x1 - k, y1 + k); ctx.lineTo(x1 + k, y1 - k);
      ctx.moveTo(x2 - k, y2 + k); ctx.lineTo(x2 + k, y2 - k);
    } else {
      ctx.moveTo(x1 - k, y1 - k); ctx.lineTo(x1 + k, y1 + k);
      ctx.moveTo(x2 - k, y2 - k); ctx.lineTo(x2 + k, y2 + k);
    }
    ctx.stroke();
    var len = horiz ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
    if (len * a.s < 26) return;
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    text(a, label || U.ft(len), mx, my, {
      size: o.size || 10, weight: 600, color: o.textColor || C.dimText,
      rot: horiz ? 0 : -Math.PI / 2
    });
  }
  function witness(a, x1, y1, x2, y2) {
    var ctx = a.ctx; a.world();
    ctx.save();
    ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = a.px(0.8); ctx.setLineDash([a.px(4), a.px(3)]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function drawDims(a) {
    var lv = a.level, b = bounds(lv), s = a.s;
    var gap = Math.max(20, 26 / s);
    var chainY = b.y0 - gap, overY = b.y0 - gap - Math.max(26, 34 / s);
    var chainX = b.x0 - gap, overX = b.x0 - gap - Math.max(26, 34 / s);

    var ls = M.leaves(lv.root);
    // chain across the top: rooms touching the back wall
    var top = ls.filter(function (l) { return l.rect.y < 0.6; })
                .sort(function (p, q) { return p.rect.x - q.rect.x; });
    top.forEach(function (l) {
      witness(a, l.rect.x, 0, l.rect.x, chainY);
      dimLine(a, l.rect.x, chainY, l.rect.x + l.rect.w, chainY);
    });
    if (top.length) witness(a, lv.width, 0, lv.width, chainY);

    var left = ls.filter(function (l) { return l.rect.x < 0.6; })
                 .sort(function (p, q) { return p.rect.y - q.rect.y; });
    left.forEach(function (l) {
      witness(a, 0, l.rect.y, chainX, l.rect.y);
      dimLine(a, chainX, l.rect.y, chainX, l.rect.y + l.rect.h);
    });
    if (left.length) witness(a, 0, lv.height, chainX, lv.height);

    // overall
    dimLine(a, 0, overY, lv.width, overY, U.ft(lv.width), { size: 11, textColor: C.text });
    dimLine(a, overX, 0, overX, lv.height, U.ft(lv.height), { size: 11, textColor: C.text });
  }

  /* ── interaction overlay ─────────────────────────────────────────── */
  function drawOverlay(a) {
    var ctx = a.ctx, st = a.st, lv = a.level;
    var hi = st.dragWall || (st.hover && st.hover.kind === 'wall' ? st.hover.wall : null);
    if (hi && (st.tool === 'select' || st.tool === 'erase' || st.tool === 'door' || st.tool === 'window')) {
      a.world();
      ctx.save();
      ctx.lineCap = 'round';
      // A wall is a slice line. The piece between these two rooms may be part
      // of a longer cut, and dragging moves all of it — so show the whole cut
      // faintly behind the piece under the cursor, rather than letting the
      // highlight promise something smaller than what will actually move.
      var full = M.wallSpan(lv, hi);
      if (full.a1 - full.a0 > (hi.a1 - hi.a0) + 1 && st.tool === 'select') {
        ctx.strokeStyle = 'rgba(31,111,235,.25)';
        ctx.lineWidth = a.px(3.5);
        ctx.beginPath();
        if (hi.dir === 'v') { ctx.moveTo(hi.pos, full.a0); ctx.lineTo(hi.pos, full.a1); }
        else { ctx.moveTo(full.a0, hi.pos); ctx.lineTo(full.a1, hi.pos); }
        ctx.stroke();
      }
      ctx.strokeStyle = st.tool === 'erase' ? '#dc2626' : C.accent;
      ctx.lineWidth = a.px(3.5);
      ctx.beginPath();
      if (hi.dir === 'v') { ctx.moveTo(hi.pos, hi.a0); ctx.lineTo(hi.pos, hi.a1); }
      else { ctx.moveTo(hi.a0, hi.pos); ctx.lineTo(hi.a1, hi.pos); }
      ctx.stroke(); ctx.restore();
    }
    // live dimensions of the two rooms while dragging a wall
    if (st.dragWall) {
      var w = st.dragWall;
      if (w.type === 'int') {
        [w.roomA, w.roomB].forEach(function (r) {
          var cd = M.clearDims(lv, r);
          text(a, U.sizeTxt(cd.w, cd.h), r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2 + 22,
               { size: 11, weight: 700, color: C.accent });
        });
      }
    }
    // ghost preview of a new wall (split tool)
    if (st.splitPreview) {
      var p = st.splitPreview; a.world();
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = a.px(3); ctx.setLineDash([a.px(9), a.px(6)]);
      ctx.beginPath();
      if (p.dir === 'v') { ctx.moveTo(p.pos, p.a0); ctx.lineTo(p.pos, p.a1); }
      else { ctx.moveTo(p.a0, p.pos); ctx.lineTo(p.a1, p.pos); }
      ctx.stroke(); ctx.restore();
    }
    // opening placement preview
    if (st.openPreview) {
      var q = st.openPreview; a.world();
      ctx.save(); ctx.fillStyle = C.accent; ctx.globalAlpha = 0.55;
      if (q.dir === 'v') ctx.fillRect(q.pos - 3, q.s, 6, q.w); else ctx.fillRect(q.s, q.pos - 3, q.w, 6);
      ctx.restore();
    }
    // tape measure
    if (st.measure && st.measure.b) {
      var m = st.measure; a.world();
      ctx.save();
      ctx.strokeStyle = '#b45309'; ctx.lineWidth = a.px(1.6);
      ctx.beginPath(); ctx.moveTo(m.a.x, m.a.y); ctx.lineTo(m.b.x, m.b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(m.a.x, m.a.y, a.px(3), 0, 7); ctx.fillStyle = '#b45309'; ctx.fill();
      ctx.beginPath(); ctx.arc(m.b.x, m.b.y, a.px(3), 0, 7); ctx.fill();
      ctx.restore();
      var d = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
      text(a, U.ft(d), (m.a.x + m.b.x) / 2, (m.a.y + m.b.y) / 2 - 12,
           { size: 12, weight: 700, color: '#92400e' });
    }
  }

  /* Corner grab handles. Drawn last so they sit above the walls, and only with
     the Select tool, where they can actually be used. */
  function drawCorners(a) {
    var st = a.st;
    if (st.exporting || st.tool !== 'select') return;
    var ctx = a.ctx, lv = a.level;
    a.world();
    var s = a.px(5);
    M.corners(lv).forEach(function (c) {
      var hot = (st.hover && st.hover.kind === 'corner' && st.hover.corner.id === c.id) ||
                st.dragCorner === c.id;
      ctx.beginPath();
      ctx.rect(c.x - s, c.y - s, s * 2, s * 2);
      ctx.fillStyle = hot ? C.accent : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = a.px(1.5);
      ctx.stroke();
    });
    // while scaling, show what the house is becoming
    if (st.dragCorner) {
      var b = houseBounds(lv);
      text(a, U.ft(lv.width) + '  x  ' + U.ft(lv.height) + '   ·   ' +
              U.sqft(M.levelArea(lv)).toLocaleString() + ' sq ft',
           (b.x0 + b.x1) / 2, b.y0 - 40,
           { size: 13, weight: 700, color: C.accent });
    }
  }

  FP.R = { draw: draw, fit: fit, bounds: bounds, houseBounds: houseBounds, odRect: odRect, C: C };
})(window.FP);
