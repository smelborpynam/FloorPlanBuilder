/* model.js — the geometry engine.
 *
 * A level is a "slicing tree": the footprint is recursively cut by vertical or
 * horizontal lines. Every leaf is a room, every internal node is a wall line.
 * Because of that, rooms ALWAYS tile the footprint exactly — no gaps, no
 * overlaps, no self-intersecting walls, no matter how the user drags. Moving a
 * wall is just changing one split ratio, which is why dragging can never
 * produce an invalid plan.
 *
 * All lengths are inches. The level rectangle is the OUTSIDE face of the
 * exterior walls, so width x height is the gross square footage the way houses
 * are actually measured.
 */
window.FP = window.FP || {};

(function (FP) {
  'use strict';
  var U = FP.U;

  var EXT_W = 6;      // exterior wall: 2x6 + sheathing + drywall
  var INT_W = 4.5;    // interior wall: 2x4 + drywall both sides

  /* ── room catalog ────────────────────────────────────────────────────
     area = ideal size in SQUARE FEET (drives the auto-layout proportions)
     min  = smallest usable dimension in INCHES (drag clamps to this)
     max  = largest sensible dimension in INCHES. This is what keeps the
            generator from producing a 22-foot-deep closet when the house is
            big: surplus depth flows to the rooms that can actually use it. */
  var INF = Infinity;
  var CATALOG = {
    great:        { label: 'GREAT ROOM',      area: 400, min: 144, max: 432, group: 'living' },
    living:       { label: 'LIVING AREA',     area: 320, min: 132, max: INF, group: 'living' },
    dining:       { label: 'DINING SPACE',    area: 190, min: 108, max: 360, group: 'living' },
    kitchen:      { label: 'KITCHEN',         area: 210, min: 108, max: 252, group: 'service' },
    pantry:       { label: 'WALK-IN PANTRY',  area: 42,  min: 48,  max: 168, group: 'service' },
    foyer:        { label: 'FOYER',           area: 84,  min: 60,  max: 192, group: 'circ' },
    hall:         { label: 'HALL',            area: 90,  min: 42,  max: 66,  group: 'circ' },
    mud:          { label: 'MUDROOM',         area: 52,  min: 60,  max: 168, group: 'service' },
    laundry:      { label: 'LAUNDRY/UTILITY', area: 66,  min: 72,  max: 192, group: 'service' },
    primary_bed:  { label: 'PRIMARY BEDROOM', area: 224, min: 132, max: 264, group: 'private' },
    primary_bath: { label: 'PRIMARY BATH',    area: 122, min: 90,  max: 204, group: 'wet' },
    wic:          { label: 'WIC',             area: 72,  min: 54,  max: 156, group: 'storage' },
    bedroom:      { label: 'BEDROOM',         area: 134, min: 108, max: 216, group: 'private' },
    bath:         { label: 'BATH',            area: 62,  min: 60,  max: 168, group: 'wet' },
    powder:       { label: 'POWDER',          area: 26,  min: 42,  max: 108, group: 'wet' },
    closet:       { label: 'CLOSET',          area: 18,  min: 28,  max: 96,  group: 'storage' },
    office:       { label: 'OFFICE / FLEX',   area: 140, min: 108, max: 252, group: 'private' },
    loft:         { label: 'LOFT',            area: 200, min: 120, max: INF, group: 'living' },
    stairs:       { label: 'STAIRS',          area: 52,  min: 40,  max: 192, group: 'circ' },
    garage:       { label: 'GARAGE',          area: 460, min: 216, max: INF, group: 'service' },
    porch:        { label: 'COVERED PORCH',   area: 190, min: 60,  max: INF, group: 'outdoor' },
    patio:        { label: 'PATIO',           area: 300, min: 60,  max: INF, group: 'outdoor' },
    deck:         { label: 'DECK',            area: 260, min: 60,  max: INF, group: 'outdoor' },
    screened:     { label: 'SCREENED PORCH',  area: 240, min: 72,  max: INF, group: 'outdoor' },
    room:         { label: 'NEW ROOM',        area: 120, min: 60,  max: INF, group: 'living' }
  };

  var GROUP_COLOR = {
    living: '#f2f5f9', service: '#f4f3ee', circ: '#f6f4f0',
    private: '#f7f6f2', wet: '#eef4f6', storage: '#f4f2ee',
    outdoor: '#f0f2ec', other: '#f7f7f5'
  };

  var uid = 1;
  function nid(p) { return p + (uid++) + '_' + Math.floor(Math.random() * 1296).toString(36); }

  /* ── node constructors ─────────────────────────────────────────────── */
  function room(type, opts) {
    opts = opts || {};
    var c = CATALOG[type] || CATALOG.room;
    return {
      id: nid('r'), kind: 'room', type: type,
      name: opts.name || c.label,
      target: opts.area || c.area,          // sq ft — drives auto proportions
      minW: opts.minW || opts.min || c.min,
      minH: opts.minH || opts.min || c.min,
      maxW: opts.maxW || opts.max || c.max || INF,
      maxH: opts.maxH || opts.max || c.max || INF,
      locked: false
    };
  }
  function split(dir, a, b, ratio) {
    return { id: nid('s'), kind: 'split', dir: dir, a: a, b: b,
             ratio: (ratio === undefined ? null : ratio) };
  }
  /* right-associated chain of splits; ratios resolve from target areas */
  function chain(dir, nodes) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return null;
    if (nodes.length === 1) return nodes[0];
    return split(dir, nodes[0], chain(dir, nodes.slice(1)));
  }

  /* ── tree walking ──────────────────────────────────────────────────── */
  function walk(n, fn, parent) {
    if (!n) return;
    fn(n, parent);
    if (n.kind === 'split') { walk(n.a, fn, n); walk(n.b, fn, n); }
  }
  function leaves(n) { var out = []; walk(n, function (x) { if (x.kind === 'room') out.push(x); }); return out; }
  function indexOf(root) {
    var byId = {}, parent = {};
    walk(root, function (n, p) { byId[n.id] = n; if (p) parent[n.id] = p; });
    return { byId: byId, parent: parent };
  }
  function pathTo(root, id) {
    var res = null;
    (function rec(n, acc) {
      if (!n || res) return;
      var a = acc.concat([n]);
      if (n.id === id) { res = a; return; }
      if (n.kind === 'split') { rec(n.a, a); rec(n.b, a); }
    })(root, []);
    return res;
  }
  function lca(root, idA, idB) {
    var pa = pathTo(root, idA), pb = pathTo(root, idB);
    if (!pa || !pb) return null;
    var best = null;
    for (var i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i].id === pb[i].id) best = pa[i]; else break;
    }
    return best;
  }

  /* ── sizing ────────────────────────────────────────────────────────── */
  function targetArea(n) {
    if (!n) return 0;
    if (n.kind === 'room') return n.target;
    return targetArea(n.a) + targetArea(n.b);
  }
  function resolveRatios(n) {
    if (!n || n.kind !== 'split') return;
    if (n.ratio === null || n.ratio === undefined) {
      var ta = targetArea(n.a), tb = targetArea(n.b);
      n.ratio = (ta + tb) > 0 ? ta / (ta + tb) : 0.5;
    }
    resolveRatios(n.a); resolveRatios(n.b);
  }
  /* re-derive every ratio from the target areas (the "re-balance" button) */
  function rebalance(n) {
    if (!n || n.kind !== 'split') return;
    n.ratio = null; resolveRatios(n);
  }
  function minExt(n, axis) {              // axis: 'w' | 'h'
    if (!n) return 0;
    if (n.kind === 'room') {
      if (n.locked) return (axis === 'w' ? n.lockW : n.lockH) || (axis === 'w' ? n.minW : n.minH);
      return axis === 'w' ? n.minW : n.minH;
    }
    var along = (n.dir === 'v' && axis === 'w') || (n.dir === 'h' && axis === 'h');
    var a = minExt(n.a, axis), b = minExt(n.b, axis);
    return along ? a + b : Math.max(a, b);
  }

  /* A locked room reports the same value as its minimum AND its maximum, which
     pins it: it cannot be squeezed or stretched by anything happening around
     it. Unlike the catalog maximums this is enforced during normal editing,
     not just while generating. Infinity means "no lock in here". */
  function lockExt(n, axis) {
    if (!n) return INF;
    if (n.kind === 'room')
      return n.locked ? ((axis === 'w' ? n.lockW : n.lockH) || INF) : INF;
    var along = (n.dir === 'v' && axis === 'w') || (n.dir === 'h' && axis === 'h');
    var a = lockExt(n.a, axis), b = lockExt(n.b, axis);
    return along ? a + b : Math.min(a, b);
  }

  function setRoomLock(level, roomId, on) {
    computeRects(level);
    var r = indexOf(level.root).byId[roomId];
    if (!r || r.kind !== 'room') return false;
    r.locked = !!on;
    if (on) { r.lockW = r.rect.w; r.lockH = r.rect.h; }
    else { delete r.lockW; delete r.lockH; }
    computeRects(level);
    return true;
  }
  function maxExt(n, axis) {
    if (!n) return INF;
    if (n.kind === 'room') return (axis === 'w' ? n.maxW : n.maxH) || INF;
    var along = (n.dir === 'v' && axis === 'w') || (n.dir === 'h' && axis === 'h');
    var a = maxExt(n.a, axis), b = maxExt(n.b, axis);
    return along ? a + b : Math.min(a, b);
  }

  /* How much of `span` goes to child A. Honours both children's minimums and
     their sensible maximums; when the two cannot both be satisfied it spreads
     the overflow in proportion rather than dumping it all on one room. */
  function solveSplit(node, axis, span, useMax) {
    var ma = minExt(node.a, axis), mb = minExt(node.b, axis);
    if (!useMax) {
      if (ma + mb >= span) return span * (ma / (ma + mb || 1));
      // locked rooms hold their size against whatever is happening around them
      var la = lockExt(node.a, axis), lb = lockExt(node.b, axis);
      var llo = Math.max(ma, span - lb), lhi = Math.min(la, span - mb);
      if (llo > lhi) return U.clamp(span * node.ratio, ma, span - mb);
      return U.clamp(span * node.ratio, llo, lhi);
    }
    var xa = maxExt(node.a, axis), xb = maxExt(node.b, axis);
    if (ma + mb >= span) return span * (ma / (ma + mb || 1));   // too tight for mins
    var lo = Math.max(ma, span - xb), hi = Math.min(xa, span - mb);
    if (lo > hi) {                                              // maxes too small
      if (xa < INF && xb < INF && xa + xb > 0) return span * (xa / (xa + xb));
      return U.clamp(span * node.ratio, ma, span - mb);
    }
    return U.clamp(span * node.ratio, lo, hi);
  }

  /* Assign .rect {x,y,w,h} to every node.
     useMax is on only while generating — once the plan exists the user is in
     charge, and a dragged wall must never spring back to a "sensible" size. */
  function computeRects(level, useMax) {
    (function rec(n, x, y, w, h) {
      if (!n) return;
      n.rect = { x: x, y: y, w: w, h: h };
      if (n.kind !== 'split') return;
      if (n.dir === 'v') {
        var wa = solveSplit(n, 'w', w, useMax);
        rec(n.a, x, y, wa, h); rec(n.b, x + wa, y, w - wa, h);
      } else {
        var ha = solveSplit(n, 'h', h, useMax);
        rec(n.a, x, y, w, ha); rec(n.b, x, y + ha, w, h - ha);
      }
    })(level.root, 0, 0, level.width, level.height);
    return level;
  }

  /* Solve once with the max constraints, then write the resulting proportions
     back into the ratios so plain editing reproduces the same layout. */
  function bake(level) {
    computeRects(level, true);
    walk(level.root, function (n) {
      if (n.kind !== 'split') return;
      var span = n.dir === 'v' ? n.rect.w : n.rect.h;
      var ca = n.dir === 'v' ? n.a.rect.w : n.a.rect.h;
      n.ratio = span > 0 ? U.clamp(ca / span, 0.02, 0.98) : 0.5;
    });
    return computeRects(level);
  }

  /* ── walls ─────────────────────────────────────────────────────────
     Derived fresh from the leaf rectangles every frame. Interior walls come
     from adjacent leaf pairs, exterior walls from leaves touching the edge. */
  var EPS = 0.6;
  function ov(a0, a1, b0, b1) {
    var s = Math.max(a0, b0), e = Math.min(a1, b1);
    return e - s > 12 ? [s, e] : null;   // ignore slivers under 1'
  }
  function ikey(a, b) { return 'iw:' + (a < b ? a + '~' + b : b + '~' + a); }
  /* a wall separating heated space from an outdoor room is a real outside
     wall, so it is drawn at exterior thickness */
  function envelope(a, b) { return isOutdoor(a) !== isOutdoor(b); }

  function walls(level) {
    var ls = leaves(level.root), out = [], i, j;
    for (i = 0; i < ls.length; i++) {
      for (j = i + 1; j < ls.length; j++) {
        // cells joined into one room have no wall between them
        if (sameGroup(ls[i], ls[j])) continue;
        var A = ls[i].rect, B = ls[j].rect, o;
        // vertical shared edge
        if (Math.abs(A.x + A.w - B.x) < EPS || Math.abs(B.x + B.w - A.x) < EPS) {
          o = ov(A.y, A.y + A.h, B.y, B.y + B.h);
          if (o) out.push({ key: ikey(ls[i].id, ls[j].id), type: 'int', dir: 'v',
                            pos: Math.abs(A.x + A.w - B.x) < EPS ? A.x + A.w : B.x + B.w,
                            a0: o[0], a1: o[1], roomA: ls[i], roomB: ls[j],
                            thick: envelope(ls[i], ls[j]) ? EXT_W : INT_W });
        }
        // horizontal shared edge
        if (Math.abs(A.y + A.h - B.y) < EPS || Math.abs(B.y + B.h - A.y) < EPS) {
          o = ov(A.x, A.x + A.w, B.x, B.x + B.w);
          if (o) out.push({ key: ikey(ls[i].id, ls[j].id), type: 'int', dir: 'h',
                            pos: Math.abs(A.y + A.h - B.y) < EPS ? A.y + A.h : B.y + B.h,
                            a0: o[0], a1: o[1], roomA: ls[i], roomB: ls[j],
                            thick: envelope(ls[i], ls[j]) ? EXT_W : INT_W });
        }
      }
    }
    // exterior: one segment per room per touching side, broken around any
    // bump-out, since the wall is not there where the room pushes through
    var He = EXT_W / 2;
    var cuts = {};                                   // roomId|side -> [[s0,s1]]
    var bl = bumpList(level);
    bl.forEach(function (g) {
      var k = g.room.id + '|' + g.side;
      var s0 = alongSide(g.side) === 'w' ? g.x : g.y;
      (cuts[k] = cuts[k] || []).push([s0, s0 + (alongSide(g.side) === 'w' ? g.w : g.h)]);
    });
    function emit(room, side, dir, pos, a0, a1) {
      var list = (cuts[room.id + '|' + side] || []).slice().sort(function (p, q) { return p[0] - q[0]; });
      if (!list.length) { out.push(ext(room.id, side, dir, pos, a0, a1, room)); return; }
      var cur = a0, n = 0;
      list.forEach(function (c) {
        if (c[0] - cur > 12) out.push(ext(room.id, side, dir, pos, cur, c[0], room, n++));
        cur = Math.max(cur, c[1]);
      });
      if (a1 - cur > 12) out.push(ext(room.id, side, dir, pos, cur, a1, room, n++));
    }
    for (i = 0; i < ls.length; i++) {
      var R = ls[i].rect;
      // pos is the wall CENTERLINE (half a wall in from the outer face) so that
      // openings punch and draw exactly the same way as on interior walls.
      if (R.x < EPS) emit(ls[i], 'left', 'v', He, R.y, R.y + R.h);
      if (Math.abs(R.x + R.w - level.width) < EPS)
        emit(ls[i], 'right', 'v', level.width - He, R.y, R.y + R.h);
      if (R.y < EPS) emit(ls[i], 'back', 'h', He, R.x, R.x + R.w);
      if (Math.abs(R.y + R.h - level.height) < EPS)
        emit(ls[i], 'front', 'h', level.height - He, R.x, R.x + R.w);
    }
    // the bump's own three outside walls — draggable and window-ready
    bl.forEach(function (g) {
      var b = g.bump, R = { x: g.x, y: g.y, w: g.w, h: g.h };
      function bw(part, side, dir, pos, a0, a1) {
        out.push({ key: 'bw:' + b.id + ':' + part, type: 'ext', side: side, dir: dir,
                   pos: pos, a0: a0, a1: a1, room: g.room, thick: EXT_W, bump: b, part: part });
      }
      if (g.side === 'back' || g.side === 'front') {
        var far = g.side === 'back' ? R.y + He : R.y + R.h - He;
        bw('far', g.side, 'h', far, R.x, R.x + R.w);
        bw('s0', 'left', 'v', R.x + He, R.y, R.y + R.h);
        bw('s1', 'right', 'v', R.x + R.w - He, R.y, R.y + R.h);
      } else {
        var farx = g.side === 'left' ? R.x + He : R.x + R.w - He;
        bw('far', g.side, 'v', farx, R.y, R.y + R.h);
        bw('s0', 'back', 'h', R.y + He, R.x, R.x + R.w);
        bw('s1', 'front', 'h', R.y + R.h - He, R.x, R.x + R.w);
      }
    });
    return out;
  }
  /* piece index is appended only when a wall is actually split, so plans saved
     before bump-outs existed keep their opening keys */
  function ext(id, side, dir, pos, a0, a1, rm, piece) {
    return { key: 'ew:' + id + ':' + side + (piece === undefined ? '' : ':' + piece),
             type: 'ext', side: side, dir: dir,
             pos: pos, a0: a0, a1: a1, room: rm, thick: EXT_W };
  }
  /* How much of the plan a wall drag really moves.
     A wall is a slice line, not an independent segment: the piece you see
     between two rooms can be part of a much longer cut, and dragging it moves
     the whole cut. This returns that full extent so the UI can show it before
     the user commits to the drag. */
  function wallSpan(level, wall) {
    if (!wall || wall.type !== 'int') return { a0: wall.a0, a1: wall.a1 };
    var node = lca(level.root, wall.roomA.id, wall.roomB.id);
    if (!node || node.kind !== 'split' || node.dir !== wall.dir)
      return { a0: wall.a0, a1: wall.a1 };
    var R = node.rect;
    return wall.dir === 'v' ? { a0: R.y, a1: R.y + R.h } : { a0: R.x, a1: R.x + R.w };
  }

  function wallStyle(level, key) { return (level.styles && level.styles[key]) || 'full'; }
  function setWallStyle(level, key, s) {
    level.styles = level.styles || {};
    if (s === 'full') delete level.styles[key]; else level.styles[key] = s;
  }

  /* clear (inside face to inside face) dimensions of a room */
  function clearDims(level, leaf) {
    var R = leaf.rect;
    var l = R.x < EPS ? EXT_W : INT_W / 2;
    var r = Math.abs(R.x + R.w - level.width) < EPS ? EXT_W : INT_W / 2;
    var t = R.y < EPS ? EXT_W : INT_W / 2;
    var b = Math.abs(R.y + R.h - level.height) < EPS ? EXT_W : INT_W / 2;
    return { w: R.w - l - r, h: R.h - t - b, l: l, t: t,
             rect: { x: R.x + l, y: R.y + t, w: R.w - l - r, h: R.h - t - b } };
  }

  /* ── bump-outs ────────────────────────────────────────────────────────
     A bump-out is real heated floor that projects past the footprint from one
     room's outside wall, so the house stops being a plain rectangle. It is
     stored as an offset along the HOST ROOM's own edge rather than in level
     coordinates, so when walls are dragged the bump travels with its room
     instead of drifting away from it. Geometry is derived every frame. */
  var BUMP_MIN_D = 24, BUMP_MIN_W = 36;

  function bumps(level) { return level.bumps || (level.bumps = []); }
  function alongSide(side) { return (side === 'back' || side === 'front') ? 'w' : 'h'; }

  /* can this room carry a bump on that side? only if it touches that edge */
  function bumpValid(level, side, room) {
    if (!room || !room.rect) return false;
    var R = room.rect;
    if (side === 'back') return R.y < EPS;
    if (side === 'front') return Math.abs(R.y + R.h - level.height) < EPS;
    if (side === 'left') return R.x < EPS;
    if (side === 'right') return Math.abs(R.x + R.w - level.width) < EPS;
    return false;
  }

  /* absolute rectangle of a bump, clamped to whatever its room can carry */
  function bumpGeomFor(level, b, room) {
    var R = room.rect;
    var along = alongSide(b.side) === 'w' ? R.w : R.h;
    var w = Math.min(Math.max(b.off1 - b.off0, BUMP_MIN_W), along);
    var s = U.clamp(b.off0, 0, Math.max(0, along - w));
    var d = Math.max(BUMP_MIN_D, b.depth);
    if (b.side === 'back') return { x: R.x + s, y: -d, w: w, h: d, side: b.side, bump: b };
    if (b.side === 'front') return { x: R.x + s, y: level.height, w: w, h: d, side: b.side, bump: b };
    if (b.side === 'left') return { x: -d, y: R.y + s, w: d, h: w, side: b.side, bump: b };
    return { x: level.width, y: R.y + s, w: d, h: w, side: b.side, bump: b };
  }

  /* every live bump with its geometry and host room */
  function bumpList(level) {
    var byId = {};
    leaves(level.root).forEach(function (l) { byId[l.id] = l; });
    return bumps(level).map(function (b) {
      var rm = byId[b.room];
      if (!rm || !bumpValid(level, b.side, rm)) return null;
      var g = bumpGeomFor(level, b, rm);
      g.room = rm;
      return g;
    }).filter(Boolean);
  }
  function bumpArea(level) {
    return bumpList(level).reduce(function (s, g) { return s + g.w * g.h; }, 0);
  }
  /* total floor of one room including anything bumped out of it */
  function roomArea(level, leaf) {
    var a = leaf.rect.w * leaf.rect.h;
    bumpList(level).forEach(function (g) { if (g.room.id === leaf.id) a += g.w * g.h; });
    return a;
  }

  /* Rectilinear outline of the heated footprint: the base rectangle with every
     bump inserted into the correct edge, walked clockwise. `inner` is the same
     loop pushed one wall thickness inward, so the whole wall ring — however
     many corners it now has — is a single even-odd fill. */
  function outline(level) {
    var W = level.width, H = level.height;
    var list = bumpList(level), pts = [];
    function P(x, y) {
      var last = pts[pts.length - 1];
      if (!last || Math.abs(last[0] - x) > 0.01 || Math.abs(last[1] - y) > 0.01) pts.push([x, y]);
    }
    function on(side, cmp) { return list.filter(function (g) { return g.side === side; }).sort(cmp); }
    var byX = function (a, b) { return a.x - b.x; }, byXr = function (a, b) { return b.x - a.x; };
    var byY = function (a, b) { return a.y - b.y; }, byYr = function (a, b) { return b.y - a.y; };

    P(0, 0);
    on('back', byX).forEach(function (g) {
      P(g.x, 0); P(g.x, g.y); P(g.x + g.w, g.y); P(g.x + g.w, 0);
    });
    P(W, 0);
    on('right', byY).forEach(function (g) {
      P(W, g.y); P(g.x + g.w, g.y); P(g.x + g.w, g.y + g.h); P(W, g.y + g.h);
    });
    P(W, H);
    on('front', byXr).forEach(function (g) {
      P(g.x + g.w, H); P(g.x + g.w, g.y + g.h); P(g.x, g.y + g.h); P(g.x, H);
    });
    P(0, H);
    on('left', byYr).forEach(function (g) {
      P(0, g.y + g.h); P(g.x, g.y + g.h); P(g.x, g.y); P(0, g.y);
    });
    return { outer: pts, inner: offsetIn(pts, EXT_W) };
  }

  /* Offset a closed rectilinear loop inward. For axis-aligned edges the inner
     corner is exactly the vertex plus both edges' inward normals, which lands
     correctly on convex AND reflex corners — the ones a bump creates. */
  function offsetIn(pts, t) {
    var n = pts.length, out = [], i;
    for (i = 0; i < n; i++) {
      var p = pts[i], pv = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
      var d0 = unit(p[0] - pv[0], p[1] - pv[1]), d1 = unit(nx[0] - p[0], nx[1] - p[1]);
      out.push([p[0] + t * (-d0[1] - d1[1]), p[1] + t * (d0[0] + d1[0])]);
    }
    return out;
  }
  function unit(x, y) { var m = Math.hypot(x, y) || 1; return [x / m, y / m]; }

  /* Pushing a room out splits the wall it sat on, which changes that wall's
     key. Carry the existing windows and doors across to whichever new piece
     they land on, instead of silently losing them. */
  function sideWalls(level, roomId, side) {
    return walls(level).filter(function (w) {
      return w.type === 'ext' && !w.bump && w.room && w.room.id === roomId && w.side === side;
    });
  }
  function captureSide(level, roomId, side) {
    var carried = [];
    sideWalls(level, roomId, side).forEach(function (w) {
      openingsFor(level, w.key).forEach(function (o) {
        carried.push({ o: o, mid: openingGeom(w, o).mid });
      });
    });
    return carried;
  }
  function restoreSide(level, roomId, side, carried, fallbackKey) {
    var post = sideWalls(level, roomId, side);
    var fb = fallbackKey ? walls(level).filter(function (w) { return w.key === fallbackKey; })[0] : null;
    carried.forEach(function (c) {
      var host = null;
      for (var i = 0; i < post.length; i++) {
        var w = post[i];
        if (c.mid > w.a0 + c.o.w / 2 + 2 && c.mid < w.a1 - c.o.w / 2 - 2) { host = w; break; }
      }
      // swallowed by the bump: it travels out to the new outer wall, which is
      // physically what happens to a window when you push the wall past it
      if (!host && fb && (fb.a1 - fb.a0) > c.o.w + 6) host = fb;
      if (!host) { removeOpening(level, c.o.id); return; }
      c.o.wall = host.key;
      c.o.off = U.clamp(c.mid - host.a0, c.o.w / 2 + 3, (host.a1 - host.a0) - c.o.w / 2 - 3);
    });
  }

  function addBump(level, roomId, side, depth) {
    var byId = indexOf(level.root).byId, rm = byId[roomId];
    if (!rm || !bumpValid(level, side, rm)) return { ok: false, msg: 'That room does not reach an outside wall on that side.' };
    var along = alongSide(side) === 'w' ? rm.rect.w : rm.rect.h;
    if (along < BUMP_MIN_W + 12) return { ok: false, msg: 'That wall is too short to push out.' };
    var w = Math.min(Math.max(BUMP_MIN_W, along * 0.62), along - 12);
    var b = { id: nid('b'), room: roomId, side: side,
              off0: (along - w) / 2, off1: (along - w) / 2 + w,
              depth: Math.max(BUMP_MIN_D, depth || 48) };
    var clash = bumps(level).some(function (o) {
      return o.room === roomId && o.side === side && !(o.off1 <= b.off0 || o.off0 >= b.off1);
    });
    if (clash) return { ok: false, msg: 'This wall already has a bump-out there.' };
    var carried = captureSide(level, roomId, side);
    bumps(level).push(b);
    restoreSide(level, roomId, side, carried, 'bw:' + b.id + ':far');
    return { ok: true, bump: b };
  }
  function removeBump(level, id) {
    var gone = bumps(level).filter(function (b) { return b.id === id; })[0];
    if (!gone) return;
    // Carry back both what is on the remaining wall stubs and what is on the
    // bay's own outer wall, so pulling a bump-out back in returns its window
    // to the flat wall instead of destroying it.
    var carried = captureSide(level, gone.room, gone.side);
    var far = walls(level).filter(function (w) { return w.key === 'bw:' + id + ':far'; })[0];
    if (far) openingsFor(level, far.key).forEach(function (o) {
      carried.push({ o: o, mid: openingGeom(far, o).mid });
    });
    level.bumps = bumps(level).filter(function (b) { return b.id !== id; });
    restoreSide(level, gone.room, gone.side, carried);   // wall pieces merge back
    pruneOpenings(level);                                // side walls are gone
  }
  /* drop bumps whose room was merged away or no longer reaches that wall */
  function pruneBumps(level) {
    var byId = indexOf(level.root).byId;
    level.bumps = bumps(level).filter(function (b) {
      return byId[b.room] && bumpValid(level, b.side, byId[b.room]);
    });
  }
  /* which sides a room could still be pushed out on */
  function bumpSides(level, room) {
    return ['back', 'front', 'left', 'right'].filter(function (s) { return bumpValid(level, s, room); });
  }

  /* ── editing operations ────────────────────────────────────────────── */

  /* Grow the house by exactly `delta` on one axis and steer all of that new
     space into one subtree, leaving every other room the size it already was.
     This is what makes "auto-grow" feel right: the wall goes where you dragged
     it, the squeezed room keeps its minimum, and only the outside wall moves. */
  function growInto(level, path, axis, delta) {
    var sibs = [], i;
    for (i = 0; i < path.length - 1; i++) {
      var n = path[i];
      if (n.kind !== 'split') continue;
      if (axis === 'w' ? n.dir !== 'v' : n.dir !== 'h') continue;
      var onA = path[i + 1].id === n.a.id, sib = onA ? n.b : n.a;
      sibs.push({ node: n, onA: onA, ext: axis === 'w' ? sib.rect.w : sib.rect.h });
    }
    if (axis === 'w') level.width += delta; else level.height += delta;
    computeRects(level);
    sibs.forEach(function (s) {                       // top-down; order matters
      var span = axis === 'w' ? s.node.rect.w : s.node.rect.h;
      if (span <= 0) return;
      s.node.ratio = U.clamp((s.onA ? span - s.ext : s.ext) / span, 0.01, 0.99);
      computeRects(level);
    });
  }

  /* Move an interior wall to an absolute coordinate.
     autoGrow: when the room on the far side is already at its minimum, push the
     outside wall out instead — the house simply gets bigger, which is what the
     square-footage readout then reports. */
  function moveWall(level, wall, newPos, autoGrow, scale) {
    if (wall.bump) return moveBumpWall(level, wall, newPos);
    if (wall.type === 'ext') return moveExtWall(level, wall, newPos, scale);
    var node = lca(level.root, wall.roomA.id, wall.roomB.id);
    if (!node || node.kind !== 'split' || node.dir !== wall.dir) return false;

    var axis = wall.dir === 'v' ? 'w' : 'h';
    var R = node.rect;
    var base = wall.dir === 'v' ? R.x : R.y;
    var span = wall.dir === 'v' ? R.w : R.h;
    var ma = minExt(node.a, axis), mb = minExt(node.b, axis);
    var want = newPos - base;                        // desired extent of child a

    // Only enlarging past what the house can hold needs growth; trying to push
    // a room below its minimum is simply refused.
    if (autoGrow && want > span - mb && want <= span * 4) {
      growInto(level, pathTo(level.root, node.id) || [node], axis, want - (span - mb));
      R = node.rect;
      base = wall.dir === 'v' ? R.x : R.y;
      span = wall.dir === 'v' ? R.w : R.h;
      want = newPos - base;
    }
    var a = U.clamp(want, ma, Math.max(ma, span - mb));
    node.ratio = a / span;
    computeRects(level);
    return true;
  }

  /* Dragging a bump's outer wall changes how far it projects; dragging either
     side wall changes how wide it is. Same gesture as every other wall. */
  function moveBumpWall(level, wall, newPos) {
    var b = wall.bump, He = EXT_W / 2;
    var room = indexOf(level.root).byId[b.room];
    if (!room) return false;
    var along = alongSide(b.side) === 'w' ? room.rect.w : room.rect.h;
    var base = alongSide(b.side) === 'w' ? room.rect.x : room.rect.y;

    if (wall.part === 'far') {
      var d;
      if (b.side === 'back') d = He - newPos;
      else if (b.side === 'front') d = newPos - level.height + He;
      else if (b.side === 'left') d = He - newPos;
      else d = newPos - level.width + He;
      b.depth = Math.max(BUMP_MIN_D, d);
      return true;
    }
    var v = newPos - base + (wall.part === 's0' ? -He : He);
    if (wall.part === 's0') b.off0 = U.clamp(v, 0, b.off1 - BUMP_MIN_W);
    else b.off1 = U.clamp(v, b.off0 + BUMP_MIN_W, along);
    return true;
  }

  /* Resize one edge of the house and absorb the whole change in the rooms
   * along THAT edge, leaving every other room exactly the size it was.
   *
   * Without this, changing level.width simply re-runs the ratios and every
   * room in the plan scales, which quietly undoes any sizing the user has
   * already done. Walking down from the root and re-pinning each split so the
   * side away from the dragged edge keeps its current absolute extent confines
   * the change to where the wall actually moved.
   */
  function resizeEdge(level, axis, side, delta) {
    computeRects(level);
    var prev = {};
    walk(level.root, function (n) { prev[n.id] = axis === 'w' ? n.rect.w : n.rect.h; });

    if (axis === 'w') level.width += delta; else level.height += delta;
    computeRects(level);

    (function rec(n) {
      if (!n || n.kind !== 'split') return;
      var along = (n.dir === 'v' && axis === 'w') || (n.dir === 'h' && axis === 'h');
      if (!along) { rec(n.a); rec(n.b); return; }   // both children span this axis
      var span = axis === 'w' ? n.rect.w : n.rect.h;
      if (span <= 0) return;
      var far = (side === 'far');
      var keep = prev[(far ? n.a : n.b).id];        // the untouched side holds still
      n.ratio = U.clamp(far ? keep / span : (span - keep) / span, 0.01, 0.99);
      computeRects(level);
      rec(far ? n.b : n.a);                         // follow the edge downwards
    })(level.root);
    return level;
  }

  /* ── heated vs unheated space ─────────────────────────────────────────
     A room inside the footprint can be outdoor: a porch or patio tucked under
     the same roof. It still occupies the rectangle, but it is not heated
     space, so it comes out of the square footage and the building's insulated
     envelope runs around it rather than through it. */
  function isOutdoor(r) {
    return !!r && (CATALOG[r.type] || {}).group === 'outdoor';
  }
  function outdoorTypes() {
    return Object.keys(CATALOG).filter(function (k) { return CATALOG[k].group === 'outdoor'; });
  }

  /* gross floor split into what is heated and what is not */
  function areaBreakdown(level) {
    computeRects(level);
    var extra = {};
    bumpList(level).forEach(function (g) {
      extra[g.room.id] = (extra[g.room.id] || 0) + g.w * g.h;
    });
    var garage = 0, outdoor = 0;
    leaves(level.root).forEach(function (r) {
      var a = r.rect.w * r.rect.h + (extra[r.id] || 0);
      if (r.type === 'garage') garage += a;
      else if (isOutdoor(r)) outdoor += a;
    });
    var gross = levelArea(level);
    return { gross: gross, garage: garage, outdoor: outdoor,
             heated: gross - garage - outdoor };
  }

  /* Change a room's type, handling what that implies. Crossing the
     indoor/outdoor line moves the thermal envelope, so any windows on what
     was an outside wall no longer belong to a wall that exists. */
  function setRoomType(level, roomId, type) {
    var r = indexOf(level.root).byId[roomId];
    if (!r) return false;
    var c = CATALOG[type] || CATALOG.room;
    var wasOutdoor = isOutdoor(r);
    var wasDefaultName = r.name === (CATALOG[r.type] || {}).label;

    r.type = type;
    if (wasDefaultName) r.name = c.label;
    r.minW = Math.min(r.minW, c.min);
    r.minH = Math.min(r.minH, c.min);
    r.target = c.area;

    if (isOutdoor(r) !== wasOutdoor) {
      var drop = {};
      walls(level).forEach(function (w) {
        if (w.type === 'ext' && w.room === r) drop[w.key] = 1;
      });
      level.openings = level.openings.filter(function (o) { return !drop[o.wall]; });

      // The envelope now runs between this room and the house, so a wall that
      // was opened up for an open-concept layout has to come back — otherwise
      // the living space is left flowing straight into the weather.
      var env = walls(level).filter(function (w) {
        return w.type === 'int' && (w.roomA === r || w.roomB === r) &&
               isOutdoor(w.roomA) !== isOutdoor(w.roomB);
      });
      env.forEach(function (w) { setWallStyle(level, w.key, 'full'); });

      // ...and then there has to be a way out onto it
      if (isOutdoor(r) && env.length &&
          !env.some(function (w) { return openingsFor(level, w.key).length; })) {
        var best = env.slice().sort(function (p, q) { return (q.a1 - q.a0) - (p.a1 - p.a0); })[0];
        if (best.a1 - best.a0 > 48) {
          var o = addOpening(level, best, (best.a1 - best.a0) / 2, 'slider');
          o.w = Math.min(72, (best.a1 - best.a0) - 12);
        }
      }
    }
    return true;
  }

  /* ── joined rooms ─────────────────────────────────────────────────────
   * A room does not have to be one rectangle. Several touching cells can be
   * joined into a single room: the tree still holds only rectangles, so tiling
   * and safe dragging are untouched, but the walls between members stop being
   * emitted, the members share one name and type, and the space reads as one
   * L- or T-shaped room with a single label and a single area.
   */
  function sameGroup(a, b) { return !!(a && b && a.group && a.group === b.group); }
  function groupMembers(level, gid) {
    if (!gid) return [];
    return leaves(level.root).filter(function (r) { return r.group === gid; });
  }
  function groupArea(level, gid) {
    return groupMembers(level, gid).reduce(function (s, r) { return s + r.rect.w * r.rect.h; }, 0);
  }
  /* the biggest cell — where the one label goes, and the only cell that gets
     furniture, so a joined room does not end up with two beds in it */
  function groupAnchor(level, gid) {
    return groupMembers(level, gid).sort(function (a, b) {
      return (b.rect.w * b.rect.h) - (a.rect.w * a.rect.h);
    })[0];
  }
  /* every cell the room covers, whether or not it is joined */
  function roomCells(level, leaf) {
    return leaf && leaf.group ? groupMembers(level, leaf.group) : (leaf ? [leaf] : []);
  }

  /* Do these cells form one connected patch? Walking the adjacency graph
     stops someone joining two rooms at opposite ends of the house. */
  function touching(a, b) {
    var A = a.rect, B = b.rect;
    if (!A || !B) return false;
    if ((Math.abs(A.x + A.w - B.x) < EPS || Math.abs(B.x + B.w - A.x) < EPS) &&
        Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 12) return true;
    return (Math.abs(A.y + A.h - B.y) < EPS || Math.abs(B.y + B.h - A.y) < EPS) &&
           Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 12;
  }

  /* Measured off the rectangles rather than off the wall list, because cells
     already joined into a room have no wall between them — deriving it from
     walls would report a group as disconnected from itself. */
  function contiguous(level, ids) {
    if (!ids || ids.length < 2) return true;
    computeRects(level);
    var byId = indexOf(level.root).byId;
    var cells = ids.map(function (i) { return byId[i]; }).filter(Boolean);
    if (cells.length !== ids.length) return false;
    var seen = {}, stack = [cells[0]], n = 0;
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur.id]) continue;
      seen[cur.id] = 1; n++;
      cells.forEach(function (c) { if (!seen[c.id] && touching(cur, c)) stack.push(c); });
    }
    return n === cells.length;
  }

  function joinRooms(level, ids, name, type) {
    computeRects(level);
    var byId = indexOf(level.root).byId;
    ids = (ids || []).filter(function (id) { return byId[id] && byId[id].kind === 'room'; });
    if (ids.length < 2) return { ok: false, msg: 'Pick at least two rooms to join.' };
    if (!contiguous(level, ids))
      return { ok: false, msg: 'Those rooms do not all touch each other, so they cannot become one room.' };

    // joining a room that is already joined absorbs its whole group
    var all = {};
    ids.forEach(function (id) {
      roomCells(level, byId[id]).forEach(function (c) { all[c.id] = 1; });
    });
    var members = Object.keys(all);
    var gid = nid('g');
    var t = type || byId[ids[0]].type;
    var nm = name || byId[ids[0]].name;
    members.forEach(function (id) {
      var r = byId[id];
      r.group = gid; r.name = nm; r.type = t;
      delete r.locked; delete r.lockW; delete r.lockH;   // the parts move as one now
    });
    pruneOpenings(level);        // walls between members no longer exist
    return { ok: true, group: gid, cells: members.length };
  }

  function ungroupRooms(level, gid) {
    var n = 0;
    groupMembers(level, gid).forEach(function (r) { delete r.group; n++; });
    return n;
  }

  /* Keep groups honest after structural edits. Deleting a room elsewhere can
     shuffle rectangles enough to pull a joined room apart, so any group that is
     no longer one connected patch is split into its actual pieces, and a piece
     left on its own stops being a group at all. */
  function pruneGroups(level) {
    computeRects(level);
    var byGroup = {};
    leaves(level.root).forEach(function (r) {
      if (r.group) (byGroup[r.group] = byGroup[r.group] || []).push(r);
    });
    Object.keys(byGroup).forEach(function (g) {
      var remaining = byGroup[g].slice(), comps = [];
      while (remaining.length) {
        var stack = [remaining.shift()], comp = [];
        while (stack.length) {
          var cur = stack.pop();
          comp.push(cur);
          for (var i = remaining.length - 1; i >= 0; i--) {
            if (touching(cur, remaining[i])) { stack.push(remaining[i]); remaining.splice(i, 1); }
          }
        }
        comps.push(comp);
      }
      comps.forEach(function (comp, idx) {
        if (comp.length < 2) { comp.forEach(function (r) { delete r.group; }); return; }
        if (idx === 0) return;                     // the first piece keeps the id
        var ng = nid('g');
        comp.forEach(function (r) { r.group = ng; });
      });
    });
  }

  /* the four grab handles at the corners of the footprint */
  function corners(level) {
    return [
      { id: 'tl', x: 0, y: 0, farX: false, farY: false },
      { id: 'tr', x: level.width, y: 0, farX: true, farY: false },
      { id: 'br', x: level.width, y: level.height, farX: true, farY: true },
      { id: 'bl', x: 0, y: level.height, farX: false, farY: true }
    ];
  }

  /* Scale the whole level to new outside dimensions, keeping everything in
     proportion. Split ratios are untouched so rooms keep their share, and
     doors, windows, bump-outs and the porch are carried along by the same
     factor — otherwise they would stay put while the walls moved past them. */
  function scaleLevel(level, w, h) {
    computeRects(level);
    var w0 = level.width, h0 = level.height;
    var nw = Math.max(minExt(level.root, 'w'), w);
    var nh = Math.max(minExt(level.root, 'h'), h);
    var kx = w0 > 0 ? nw / w0 : 1, ky = h0 > 0 ? nh / h0 : 1;

    var dirOf = {};
    walls(level).forEach(function (wl) { dirOf[wl.key] = wl.dir; });
    level.openings.forEach(function (o) {
      var d = dirOf[o.wall];
      if (d === 'v') o.off *= ky; else if (d === 'h') o.off *= kx;
    });
    (level.bumps || []).forEach(function (b) {
      var alongX = (b.side === 'back' || b.side === 'front');
      var k = alongX ? kx : ky;
      b.off0 *= k; b.off1 *= k;
      b.depth *= alongX ? ky : kx;
    });
    (level.outdoor || []).forEach(function (o) {
      var alongX = (o.side === 'front' || o.side === 'back');
      var k = alongX ? kx : ky;
      o.a0 *= k; o.a1 *= k;
      o.depth *= alongX ? ky : kx;
    });

    level.width = nw; level.height = nh;
    computeRects(level);
    return level;
  }

  function moveExtWall(level, wall, newPos, scale) {
    var He = EXT_W / 2;
    var axis = (wall.side === 'left' || wall.side === 'right') ? 'w' : 'h';
    var cur = axis === 'w' ? level.width : level.height;
    var far = (wall.side === 'right' || wall.side === 'front');
    var target = far ? newPos + He : cur - (newPos - He);
    target = Math.max(minExt(level.root, axis), target);
    var delta = target - cur;
    if (Math.abs(delta) < 0.01) return true;

    if (scale) {                       // Shift: stretch the whole plan instead
      if (axis === 'w') scaleLevel(level, target, level.height);
      else scaleLevel(level, level.width, target);
      return true;
    }
    resizeEdge(level, axis, far ? 'far' : 'near', delta);
    return true;
  }

  /* Set one room's exact width or height by adjusting the ancestor split that
     controls that axis. This is the "type a real number" CAD path. */
  /* Typing an exact size is a deliberate instruction, so it overrides a lock
     and then re-locks the room at whatever it ended up. */
  function setLeafExtent(level, leafId, axis, target, autoGrow) {
    var lf = indexOf(level.root).byId[leafId];
    if (!lf || !lf.locked) return setLeafExtentRaw(level, leafId, axis, target, autoGrow);
    lf.locked = false;
    delete lf.lockW; delete lf.lockH;        // stale values would re-pin it
    var ok = setLeafExtentRaw(level, leafId, axis, target, autoGrow);
    computeRects(level);
    lf.lockW = lf.rect.w; lf.lockH = lf.rect.h;   // record before re-locking
    lf.locked = true;
    computeRects(level);
    return ok;
  }

  function setLeafExtentRaw(level, leafId, axis, target, autoGrow) {
    var path = pathTo(level.root, leafId);
    if (!path) return false;
    var dir = axis === 'w' ? 'v' : 'h';
    var node = null, childIsA = false;
    for (var i = path.length - 2; i >= 0; i--) {
      if (path[i].kind === 'split' && path[i].dir === dir) {
        node = path[i]; childIsA = (path[i].a.id === path[i + 1].id); break;
      }
    }
    var leaf = path[path.length - 1];
    var cur = axis === 'w' ? leaf.rect.w : leaf.rect.h;
    if (!node) {                       // room spans the whole house on this axis
      if (axis === 'w') level.width += (target - cur); else level.height += (target - cur);
      computeRects(level); return true;
    }
    var child = childIsA ? node.a : node.b;
    var childExt = axis === 'w' ? child.rect.w : child.rect.h;
    var span = axis === 'w' ? node.rect.w : node.rect.h;
    // the leaf is a fixed fraction of its child subtree (inner ratios unchanged)
    var wantChild = childExt + (target - cur);
    var ma = minExt(node.a, axis), mb = minExt(node.b, axis);
    var wantA = childIsA ? wantChild : span - wantChild;

    if (autoGrow && (wantA > span - mb || wantA < ma)) {
      var need = wantA > span - mb ? wantA - (span - mb) : (ma - wantA);
      growInto(level, pathTo(level.root, node.id) || [node], axis, need);
      span = axis === 'w' ? node.rect.w : node.rect.h;
      childExt = axis === 'w' ? child.rect.w : child.rect.h;
      cur = axis === 'w' ? leaf.rect.w : leaf.rect.h;
      wantChild = childExt + (target - cur);
      wantA = childIsA ? wantChild : span - wantChild;
    }
    node.ratio = U.clamp(wantA, ma, Math.max(ma, span - mb)) / span;
    computeRects(level);
    return true;
  }

  /* Divide a room in two with a new wall. */
  function splitRoom(level, leafId, dir, at) {
    var idx = indexOf(level.root), leaf = idx.byId[leafId], p = idx.parent[leafId];
    if (!leaf || leaf.kind !== 'room') return null;
    var nr = room('room');
    nr.target = leaf.target / 2; leaf.target = leaf.target / 2;
    nr.minW = Math.min(nr.minW, 36); nr.minH = Math.min(nr.minH, 36);
    var ratio = at === undefined ? 0.5 : at;
    var sp = split(dir, leaf, nr, ratio);
    if (!p) level.root = sp;
    else if (p.a === leaf) p.a = sp; else p.b = sp;
    computeRects(level);
    return nr;
  }

  /* Remove a wall between two sibling rooms, merging them into one space. */
  function mergeRooms(level, wall) {
    if (wall.type !== 'int') return { ok: false, msg: 'That is an outside wall — drag it to resize the house.' };
    var node = lca(level.root, wall.roomA.id, wall.roomB.id);
    if (!node || node.a.kind !== 'room' || node.b.kind !== 'room')
      return { ok: false, msg: 'These two rooms cannot be combined into a single room.' };
    var idx = indexOf(level.root), p = idx.parent[node.id];
    var keep = node.a.target >= node.b.target ? node.a : node.b;
    var drop = keep === node.a ? node.b : node.a;
    keep.target += drop.target;
    if (!p) level.root = keep; else if (p.a === node) p.a = keep; else p.b = keep;
    computeRects(level);
    return { ok: true, kept: keep };
  }

  /* Delete a room outright.
   *
   * Every point in the footprint has to belong to some room, so a deleted room
   * cannot leave a hole — its space goes to whatever sits next to it in the
   * tree, which expands to fill the gap. Unlike mergeRooms this works on ANY
   * room, because detaching a leaf and promoting its sibling is always a valid
   * slicing tree; mergeRooms needs the two rooms to be sibling leaves, which
   * is rarely true in a real plan.
   */
  function deleteRoom(level, leafId) {
    var idx = indexOf(level.root), leaf = idx.byId[leafId];
    if (!leaf || leaf.kind !== 'room') return { ok: false, msg: 'Select a room first.' };
    var p = idx.parent[leafId];
    if (!p) return { ok: false, msg: 'This is the only room on this floor, so it cannot be deleted.' };

    var sib = (p.a === leaf) ? p.b : p.a;
    var gp = idx.parent[p.id];
    if (!gp) level.root = sib;
    else if (gp.a === p) gp.a = sib;
    else gp.b = sib;

    // hand the freed target area to whatever grew into it, so a later
    // re-balance keeps the same proportions
    var takers = leaves(sib);
    var total = takers.reduce(function (s, r) { return s + r.target; }, 0);
    takers.forEach(function (r) {
      r.target += leaf.target * (total > 0 ? r.target / total : 1 / takers.length);
    });

    computeRects(level);
    pruneOpenings(level);
    pruneBumps(level);
    pruneGroups(level);
    return { ok: true, removed: leaf, takers: takers };
  }

  /* Swap two rooms' identities (drag a room onto another). */
  function swapRooms(level, idA, idB) {
    var idx = indexOf(level.root), A = idx.byId[idA], B = idx.byId[idB];
    if (!A || !B || A === B) return false;
    var keys = ['type', 'name', 'target', 'minW', 'minH', 'locked'];
    keys.forEach(function (k) { var t = A[k]; A[k] = B[k]; B[k] = t; });
    return true;
  }

  /* ── openings (doors / windows) ────────────────────────────────────── */
  var OPENING_W = { door: 32, double: 60, slider: 72, pocket: 32, opening: 60, garage: 108, window: 42 };

  function addOpening(level, wall, offset, type) {
    var w = OPENING_W[type] || 32;
    var len = wall.a1 - wall.a0;
    if (len < w + 8) w = Math.max(18, len - 8);
    var o = { id: nid('o'), wall: wall.key, off: U.clamp(offset, w / 2 + 3, len - w / 2 - 3),
              w: w, type: type, swing: 1, flip: 1 };
    level.openings.push(o);
    return o;
  }
  function openingsFor(level, key) {
    return level.openings.filter(function (o) { return o.wall === key; });
  }
  function removeOpening(level, id) {
    level.openings = level.openings.filter(function (o) { return o.id !== id; });
  }
  /* absolute geometry of an opening given its wall */
  function openingGeom(wall, o) {
    var len = wall.a1 - wall.a0;
    var w = Math.min(o.w, Math.max(12, len - 6));
    var off = U.clamp(o.off, w / 2 + 2, len - w / 2 - 2);
    var s = wall.a0 + off - w / 2, e = s + w;
    return { s: s, e: e, w: w, mid: wall.a0 + off };
  }
  /* drop openings whose wall no longer exists (after a merge, etc.) */
  function pruneOpenings(level) {
    var live = {}; walls(level).forEach(function (w) { live[w.key] = 1; });
    level.openings = level.openings.filter(function (o) { return live[o.wall]; });
  }

  /* ── level / plan ──────────────────────────────────────────────────── */
  function newLevel(name, w, h, root) {
    var lv = { id: nid('L'), name: name, width: w, height: h, root: root,
               openings: [], styles: {}, outdoor: [], bumps: [] };
    resolveRatios(lv.root); computeRects(lv);
    return lv;
  }
  function levelArea(lv) { return lv.width * lv.height + bumpArea(lv); }
  function planArea(plan) {
    return plan.levels.reduce(function (s, l) { return s + levelArea(l); }, 0);
  }
  function clone(plan) { return JSON.parse(JSON.stringify(plan)); }
  function reindex(plan) {                 // after load: recompute rects
    plan.levels.forEach(function (l) {
      l.styles = l.styles || {}; l.outdoor = l.outdoor || []; l.bumps = l.bumps || [];
      computeRects(l);
    });
    return plan;
  }

  FP.M = {
    EXT_W: EXT_W, INT_W: INT_W, CATALOG: CATALOG, GROUP_COLOR: GROUP_COLOR,
    nid: nid, room: room, split: split, chain: chain,
    walk: walk, leaves: leaves, indexOf: indexOf, pathTo: pathTo, lca: lca,
    targetArea: targetArea, resolveRatios: resolveRatios, rebalance: rebalance,
    minExt: minExt, maxExt: maxExt, computeRects: computeRects, bake: bake,
    walls: walls, wallSpan: wallSpan, wallStyle: wallStyle, setWallStyle: setWallStyle, clearDims: clearDims,
    BUMP_MIN_D: BUMP_MIN_D, BUMP_MIN_W: BUMP_MIN_W,
    bumps: bumps, bumpList: bumpList, bumpArea: bumpArea, bumpSides: bumpSides,
    roomArea: roomArea, outline: outline, addBump: addBump, removeBump: removeBump,
    pruneBumps: pruneBumps,
    moveWall: moveWall, moveExtWall: moveExtWall, resizeEdge: resizeEdge,
    corners: corners, scaleLevel: scaleLevel, setLeafExtent: setLeafExtent,
    isOutdoor: isOutdoor, outdoorTypes: outdoorTypes, areaBreakdown: areaBreakdown,
    sameGroup: sameGroup, groupMembers: groupMembers, groupArea: groupArea,
    groupAnchor: groupAnchor, roomCells: roomCells, contiguous: contiguous,
    joinRooms: joinRooms, ungroupRooms: ungroupRooms, pruneGroups: pruneGroups,
    lockExt: lockExt, setRoomLock: setRoomLock,
    setRoomType: setRoomType,
    splitRoom: splitRoom, mergeRooms: mergeRooms, deleteRoom: deleteRoom, swapRooms: swapRooms,
    OPENING_W: OPENING_W, addOpening: addOpening, openingsFor: openingsFor,
    removeOpening: removeOpening, openingGeom: openingGeom, pruneOpenings: pruneOpenings,
    newLevel: newLevel, levelArea: levelArea, planArea: planArea, clone: clone, reindex: reindex
  };
})(window.FP);
