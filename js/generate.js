/* generate.js — turns (bedrooms, bathrooms, stories, square feet) into a real
 * plan: a wing-based template, room sizes solved from target areas, then doors,
 * windows, porch and patio placed automatically from room adjacency.
 */
window.FP = window.FP || {};

(function (FP) {
  'use strict';
  var M = FP.M, U = FP.U;

  /* Rooms that stretch to soak up extra square footage. Bedrooms and baths
     stay near their ideal size instead of ballooning with the house. */
  var ELASTIC = { great: 1, living: 1, loft: 1, office: 1 };

  /* a bedroom with its reach-in closet across the front wall */
  function bed(n) {
    return M.chain('h', [
      M.room('bedroom', { name: 'BEDROOM ' + n }),
      M.room('closet', { name: 'CLOSET', area: 26, minH: 30, maxH: 96, maxW: Infinity })
    ]);
  }
  function bath(n) { return M.room('bath', { name: 'BATH ' + n }); }

  /* ── footprint from square footage ──────────────────────────────────
     Depth is the number that decides whether the plan feels like a house.
     Two rooms deep is 26–42 ft; past that you need a third band or a
     hallway, so the depth is capped and the extra area goes into width —
     which is exactly what real ranch plans do. */
  function footprint(sqft, opts) {
    opts = opts || {};
    var sqIn = sqft * 144;
    var minD = (opts.minDepth || 26) * 12, maxD = (opts.maxDepth || 42) * 12;
    var d = U.clamp(Math.sqrt(sqIn / (opts.ratio || 1.6)), minD, maxD);
    d = Math.round(d / 6) * 6;
    var w = Math.round((sqIn / d) / 6) * 6;
    return { w: w, h: d };
  }

  /* ── target-area fitting ─────────────────────────────────────────
     Scale the room targets so they sum to the requested area, but cap how much
     the "rigid" rooms grow so a 4,000 sq ft house gets a big great room, not a
     comically large bathroom. */
  function fitTargets(root, sqft) {
    var ls = M.leaves(root);
    var rigid = 0, elastic = 0;
    ls.forEach(function (r) { (ELASTIC[r.type] ? (elastic += r.target) : (rigid += r.target)); });
    var total = rigid + elastic;
    if (total <= 0) return;
    var s = sqft / total;

    if (s <= 1) {                                   // house is tight: shrink all
      ls.forEach(function (r) { r.target *= s; });
      return;
    }
    var rigidScale = Math.min(s, 1.6);
    var rigidArea = rigid * rigidScale;
    var elasticArea = Math.max(sqft - rigidArea, elastic);
    var eScale = elastic > 0 ? elasticArea / elastic : 1;
    ls.forEach(function (r) { r.target *= (ELASTIC[r.type] ? eScale : rigidScale); });
  }

  /* how much elastic stretch a program would need — used to decide whether to
     add bonus rooms rather than inflate the living space past reason */
  function elasticStretch(root, sqft) {
    var rigid = 0, elastic = 0;
    M.leaves(root).forEach(function (r) { (ELASTIC[r.type] ? (elastic += r.target) : (rigid += r.target)); });
    if (!elastic) return 1;
    return (sqft - Math.min(sqft / (rigid + elastic), 1.6) * rigid) / elastic;
  }

  /* ── wings ───────────────────────────────────────────────────────── */
  /* Deep house: bedroom over bath over closet (three shallow bands).
     Shallow house: bedroom over a bath-and-closet pair. */
  function primarySuite(deep) {
    // deep footprint: bedroom / bath+closet / laundry — three shallow bands,
    // which is also where the laundry belongs in a real farmhouse plan
    if (deep) return M.chain('h', [
      M.room('primary_bed'),
      M.chain('v', [M.room('primary_bath'), M.room('wic')]),
      M.room('laundry')
    ]);
    return M.chain('h', [
      M.room('primary_bed'),
      M.chain('v', [M.room('primary_bath'), M.room('wic')])
    ]);
  }

  /* Secondary bedrooms stacked behind a corridor, so every bedroom gets its
     own door off a hall instead of opening straight into the living room. */
  function vHall() { return M.room('hall', { name: 'HALL', maxW: 66, maxH: Infinity, minW: 44, minH: 60 }); }
  function hHall() { return M.room('hall', { name: 'HALL', maxH: 66, maxW: Infinity, minH: 44, minW: 60 }); }
  function stackMin(n) { return M.minExt(n, 'h'); }

  function bedWing(nBeds, nBaths, opts) {
    opts = opts || {};
    var list = [], bi = opts.startAt || 2, ba = opts.bathStart || 2, i;
    if (opts.includePrimary) list.push(primarySuite(false));   // ranch: all sleeping rooms together
    for (i = 0; i < nBeds; i++) {
      list.push(bed(bi++));
      if (nBaths > 0 && (i < nBeds - 1 || nBeds === 1)) { list.push(bath(ba++)); nBaths--; }
    }
    while (nBaths-- > 0) list.push(bath(ba++));
    if ((nBeds < 2 && !opts.includePrimary) || opts.noHall) return M.chain('h', list);

    var need = list.reduce(function (s, n) { return s + stackMin(n); }, 0);
    var depth = opts.depth || 1e9;

    // Everything fits in one column: a single corridor down the side of it.
    if (need <= depth * 0.92) return M.chain('v', [vHall(), M.chain('h', list)]);

    // Too many rooms for one column, so split into two and run a proper
    // double-loaded corridor: a band across the back reaching the living
    // space, and a stem between the columns so every room opens onto it.
    var run = 0, cut = 1, bestDiff = Infinity;         // cut for the best balance
    for (i = 0; i < list.length - 1; i++) {
      run += stackMin(list[i]);
      var diff = Math.abs(run - (need - run));
      if (diff < bestDiff) { bestDiff = diff; cut = i + 1; }
    }
    var colA = M.chain('h', list.slice(0, cut)), colB = M.chain('h', list.slice(cut));
    return M.chain('h', [hHall(), M.chain('v', [colA, vHall(), colB])]);
  }

  /* Public core as two columns rather than two bands:
        great room over the entry     |     dining over the kitchen
     Coupling dining to the kitchen this way is what makes the open
     kitchen/dining/living sequence actually work, and it leaves the back of
     the plan as living space so the bedroom hall opens straight off it. */
  function core(o) {
    var entry = [];
    if (o.bonus) entry.push(M.room('office'));
    if (!o.laundryInSuite) entry.push(M.room('laundry'));
    if (o.powder) entry.push(M.room('powder'));
    if (o.stairs) entry.push(M.room('stairs', { minW: 40, minH: 132, maxW: 72, maxH: 216 }));
    entry.push(M.room('foyer'));
    return M.chain('v', [
      M.chain('h', [M.room('great'), M.chain('v', entry)]),
      M.chain('h', [M.room('dining'), M.room('kitchen'),
                    M.chain('v', [M.room('pantry'), M.room('mud')])])
    ]);
  }

  /* ── whole-level programs ────────────────────────────────────────── */
  function singleStory(o, deep, bonus) {
    var fullB = Math.floor(o.baths), powder = (o.baths % 1) >= 0.5;
    var secBeds = Math.max(0, o.beds - 1);
    var secBaths = Math.max(secBeds > 0 ? 1 : 0, fullB - 1);

    var parts;
    if (o.style === 'ranch') {
      // every bedroom in one wing, all the living space at the other end
      var mid1 = core({ powder: powder, bonus: bonus, laundryInSuite: false });
      parts = [mid1, bedWing(secBeds, secBaths, { depth: o.depth, includePrimary: true })];
    } else {
      // split bedroom: the primary suite sits opposite the secondary bedrooms,
      // with the living space between them. 'split' mirrors the whole plan.
      var left = primarySuite(deep);
      var mid = core({ powder: powder, bonus: bonus, laundryInSuite: deep });
      var right = secBeds > 0 ? bedWing(secBeds, secBaths, { depth: o.depth }) : null;
      parts = o.style === 'split' ? [right, mid, left] : [left, mid, right];
    }
    if (o.garage) parts.push(M.room('garage'));
    return M.chain('v', parts);
  }

  function twoStoryMain(o, deep) {
    var powder = (o.baths % 1) >= 0.5;
    var left = o.primaryMain ? primarySuite(deep) : M.chain('h', [M.room('office'), M.room('living')]);
    var mid = core({ powder: powder, stairs: true, bonus: false, laundryInSuite: deep && o.primaryMain });
    var parts = [left, mid];
    if (o.garage) parts.push(M.room('garage'));
    return M.chain('v', parts);
  }

  function twoStoryUpper(o, deep) {
    var fullB = Math.floor(o.baths);
    var upBeds = o.primaryMain ? Math.max(1, o.beds - 1) : o.beds;
    var upBaths = Math.max(1, fullB - (o.primaryMain ? 1 : 0));
    var parts = [];
    if (!o.primaryMain) {
      parts.push(primarySuite(deep));
      upBeds = Math.max(1, upBeds - 1); upBaths = Math.max(1, upBaths - 1);
    }
    parts.push(M.chain('h', [M.room('stairs', { minW: 40, minH: 132, maxW: 156, maxH: 216 }), M.room('loft')]));
    parts.push(bedWing(upBeds, upBaths, { depth: o.depth }));
    return M.chain('v', parts);
  }

  /* ── automatic doors ─────────────────────────────────────────────── */
  var GRP = function (t) { return (M.CATALOG[t] || M.CATALOG.room).group; };
  var PUBLIC = { living: 1, circ: 1 };

  function linkStyle(a, b, openConcept) {
    var ga = GRP(a), gb = GRP(b);
    var pair = [ga, gb].sort().join('|');
    if (ga === 'living' && gb === 'living') return openConcept ? 'none' : 'opening';
    if (pair === 'living|service' && (a === 'kitchen' || b === 'kitchen')) return openConcept ? 'none' : 'opening';
    if (a === 'hall' || b === 'hall') {                 // corridor: doors off it
      var other = a === 'hall' ? b : a, og = GRP(other);
      if (other === 'hall') return 'none';
      return (og === 'private' || og === 'wet' || og === 'storage' || og === 'service') ? 'door' : 'opening';
    }
    if (pair === 'circ|living') return 'none';
    if (ga === 'circ' && gb === 'circ') return 'none';
    if (a === 'stairs' || b === 'stairs') return 'none';
    if (ga === 'wet' || gb === 'wet') return 'door';
    if (ga === 'storage' || gb === 'storage') return 'door';
    if (ga === 'private' || gb === 'private') return (PUBLIC[ga] || PUBLIC[gb]) ? 'door' : 'wall';
    if (ga === 'service' || gb === 'service') return (PUBLIC[ga] || PUBLIC[gb] || ga === 'service' && gb === 'service') ? 'door' : 'wall';
    return 'wall';
  }

  /* put the door where someone would actually walk through: nearest the more
     public of the two rooms, nudged toward a corner like a real plan */
  function doorOffset(wall) {
    var A = wall.roomA, B = wall.roomB;
    var pub = (PUBLIC[GRP(A.type)] ? A : PUBLIC[GRP(B.type)] ? B : (A.rect.w * A.rect.h > B.rect.w * B.rect.h ? A : B));
    var c = wall.dir === 'v' ? pub.rect.y + pub.rect.h / 2 : pub.rect.x + pub.rect.w / 2;
    var len = wall.a1 - wall.a0;
    var t = U.clamp(c - wall.a0, 0, len);
    var pull = 0.22 * len;                       // slide toward the closer end
    t = t < len / 2 ? Math.max(t - pull, 0) : Math.min(t + pull, len);
    return U.clamp(t, 24, len - 24);
  }

  /* doors swing into the more private of the two rooms... */
  var PRIV = { wet: 3, private: 3, storage: 3, service: 2, living: 1, circ: 0, outdoor: 0 };
  function swingInto(w) {
    var pa = PRIV[GRP(w.roomA.type)] || 1, pb = PRIV[GRP(w.roomB.type)] || 1;
    var target = pa >= pb ? w.roomA : w.roomB;
    var onMinus = w.dir === 'v' ? (target.rect.x + target.rect.w <= w.pos + 1)
                                : (target.rect.y + target.rect.h <= w.pos + 1);
    return onMinus ? -1 : 1;
  }
  /* ...and hinge on the end nearest a corner, like a real plan */
  function hingeEnd(w) {
    var mid = doorOffset(w), len = w.a1 - w.a0;
    return mid < len / 2 ? 1 : -1;
  }

  /* How much a room "wants" to be entered from a particular neighbour.
     Higher wins. This is what stops a bathroom from getting three doors. */
  var ENTRY_PREF = {
    wic:          { primary_bed: 10, primary_bath: 8, hall: 6, bedroom: 6 },
    closet:       { bedroom: 10, primary_bed: 10, hall: 5 },
    pantry:       { kitchen: 10, mud: 5, hall: 4, foyer: 3 },
    primary_bath: { primary_bed: 10, hall: 4, wic: 3 },
    bath:         { hall: 10, foyer: 8, great: 6, living: 6, dining: 5, mud: 3, bedroom: 2 },
    powder:       { hall: 10, foyer: 9, mud: 7, great: 5, dining: 4 },
    laundry:      { hall: 9, mud: 9, foyer: 8, kitchen: 7, office: 6, primary_bath: 5, great: 4, wic: 3 },
    mud:          { garage: 10, foyer: 7, kitchen: 7, hall: 6, laundry: 6, great: 3 },
    garage:       { mud: 10, foyer: 5, laundry: 5 },
    bedroom:      { hall: 10, foyer: 7, great: 5, living: 5, stairs: 6, loft: 6 },
    primary_bed:  { hall: 9, foyer: 7, great: 8, living: 8 },
    office:       { hall: 8, foyer: 9, great: 7, living: 7, dining: 4 },
    stairs:       { hall: 8, foyer: 9, great: 7, loft: 8 }
  };
  /* rooms that need exactly one private entry door */
  var NEEDS_ENTRY = { wic: 1, closet: 1, pantry: 1, primary_bath: 1, bath: 1, powder: 1,
                      laundry: 1, mud: 1, garage: 1, bedroom: 1, primary_bed: 1, office: 1 };

  function autoInterior(level, openConcept) {
    var ws = M.walls(level).filter(function (w) { return w.type === 'int'; });
    var handled = {};

    // 1. open the walls that should not be there at all
    ws.forEach(function (w) {
      if (linkStyle(w.roomA.type, w.roomB.type, openConcept) === 'none') {
        M.setWallStyle(level, w.key, 'none');
        handled[w.key] = 'none';
      }
    });

    // 2. one door per private room, through its best neighbour
    var byRoom = {};
    ws.forEach(function (w) {
      if (handled[w.key]) return;
      (byRoom[w.roomA.id] = byRoom[w.roomA.id] || []).push({ w: w, other: w.roomB });
      (byRoom[w.roomB.id] = byRoom[w.roomB.id] || []).push({ w: w, other: w.roomA });
    });

    M.leaves(level.root).forEach(function (r) {
      if (!NEEDS_ENTRY[r.type]) return;
      var cands = (byRoom[r.id] || []).filter(function (c) { return c.w.a1 - c.w.a0 >= 40; });
      if (!cands.length) return;
      var table = ENTRY_PREF[r.type] || {};
      cands.sort(function (p, q) {
        var dp = (table[q.other.type] || 0) - (table[p.other.type] || 0);
        if (dp) return dp;
        return (q.w.a1 - q.w.a0) - (p.w.a1 - p.w.a0);
      });
      var best = cands[0];
      if (handled[best.w.key] === 'door') return;      // neighbour already opened it
      var d = M.addOpening(level, best.w, doorOffset(best.w), 'door');
      d.swing = swingInto(best.w);                     // swing into the private room
      d.flip = hingeEnd(best.w);
      handled[best.w.key] = 'door';
    });

    // 3. cased openings where two public rooms meet but stay separate
    ws.forEach(function (w) {
      if (handled[w.key]) return;
      if (linkStyle(w.roomA.type, w.roomB.type, openConcept) !== 'opening') return;
      var len = w.a1 - w.a0;
      if (len < 48) return;
      M.addOpening(level, w, len / 2, 'opening');
      handled[w.key] = 'opening';
    });

    // 4. safety net: nothing should be sealed off with no way in
    M.leaves(level.root).forEach(function (r) {
      var mine = (byRoom[r.id] || []);
      var open = mine.some(function (c) {
        return handled[c.w.key] || M.openingsFor(level, c.w.key).length;
      });
      var extDoor = false;                              // a garage/porch door counts
      M.walls(level).forEach(function (w) {
        if (w.type === 'ext' && w.room === r)
          extDoor = extDoor || M.openingsFor(level, w.key).some(function (o) { return o.type !== 'window'; });
      });
      if (open || extDoor || !mine.length) return;
      var w2 = mine.sort(function (p, q) { return (q.w.a1 - q.w.a0) - (p.w.a1 - p.w.a0); })[0].w;
      var d2 = M.addOpening(level, w2, doorOffset(w2), 'door');
      d2.swing = swingInto(w2); d2.flip = hingeEnd(w2);
      handled[w2.key] = 'door';
    });
  }

  /* ── automatic windows + entries ─────────────────────────────────── */
  var WIN = {
    living: { w: 54, per: 96 }, private: { w: 44, per: 108 }, circ: { w: 36, per: 132 },
    wet: { w: 28, per: 160 }, service: { w: 32, per: 150 }, storage: null, outdoor: null
  };

  function autoExterior(level, opts) {
    var ws = M.walls(level), fronts = [];
    ws.forEach(function (w) {
      if (w.type !== 'ext') return;
      var r = w.room, g = GRP(r.type), spec = WIN[g];
      if (r.type === 'garage') return;
      if (w.side === 'front') fronts.push(w);
      if (!spec) return;
      var len = w.a1 - w.a0 - 36;                       // keep off the corners
      if (len < spec.w + 12) return;
      var n = U.clamp(Math.floor(len / spec.per), 1, 3);
      if (g === 'wet' || g === 'circ') n = 1;
      for (var i = 0; i < n; i++) {
        var off = 18 + len * ((i + 0.5) / n);
        var o = M.addOpening(level, w, off, 'window');
        o.w = spec.w;
      }
    });

    // front door on the foyer (or the most public room on the front wall).
    // Upper floors pass entry:false — no front door on the second storey.
    var entry = opts.entry === false ? null :
                fronts.filter(function (w) { return w.room.type === 'foyer'; })[0] ||
                fronts.filter(function (w) { return PUBLIC[GRP(w.room.type)]; })[0] || fronts[0];
    if (entry) {
      stripWindows(level, entry.key);
      var d = M.addOpening(level, entry, (entry.a1 - entry.a0) / 2, 'door');
      d.w = 40; d.entry = true;
    }
    // rear slider from the living/dining space to the patio
    var back = opts.entry === false ? null : ws.filter(function (w) {
      return w.type === 'ext' && w.side === 'back' && (w.room.type === 'dining' || w.room.type === 'great' || w.room.type === 'living');
    }).sort(function (a, b) { return (b.a1 - b.a0) - (a.a1 - a.a0); })[0];
    if (back) {
      var s = M.addOpening(level, back, (back.a0 + back.a1) / 2 - back.a0, 'slider');
      s.w = 72;
    }
    // side entry from the mudroom, the way people actually come in
    var mw = ws.filter(function (w) {
      return w.type === 'ext' && w.room.type === 'mud' && (w.a1 - w.a0) > 60;
    }).sort(function (a, b) { return (b.a1 - b.a0) - (a.a1 - a.a0); })[0];
    if (mw) { stripWindows(level, mw.key); M.addOpening(level, mw, (mw.a1 - mw.a0) / 2, 'door').w = 36; }

    // garage door — cars come in from the front, so prefer that wall
    var gws = ws.filter(function (w) { return w.type === 'ext' && w.room.type === 'garage' && (w.a1 - w.a0) > 120; })
                .sort(function (a, b) { return (b.a1 - b.a0) - (a.a1 - a.a0); });
    var gw = gws.filter(function (w) { return w.side === 'front'; })[0] || gws[0];
    if (gw) { var g2 = M.addOpening(level, gw, (gw.a1 - gw.a0) / 2, 'garage'); g2.w = Math.min(192, (gw.a1 - gw.a0) - 36); }
    return { entry: entry, back: back };
  }

  function stripWindows(level, key) {
    level.openings = level.openings.filter(function (o) { return !(o.wall === key && o.type === 'window'); });
  }

  /* ── porch & patio ───────────────────────────────────────────────── */
  function outdoors(level, hooks, opts) {
    level.outdoor = [];
    if (opts.porch && hooks.entry) {
      var e = hooks.entry, c = (e.a0 + e.a1) / 2;
      var half = Math.min(Math.max((e.a1 - e.a0) * 1.6, 240), 336) / 2;
      level.outdoor.push({ id: M.nid('od'), type: 'porch', side: 'front',
        a0: U.clamp(c - half, 0, level.width), a1: U.clamp(c + half, 0, level.width),
        depth: 96, label: 'COVERED FRONT PORCH' });
    }
    if (opts.patio && hooks.back) {
      var b = hooks.back, cb = (b.a0 + b.a1) / 2;
      var hb = Math.min(Math.max((b.a1 - b.a0) * 1.1, 240), 420) / 2;
      level.outdoor.push({ id: M.nid('od'), type: 'patio', side: 'back',
        a0: U.clamp(cb - hb, 0, level.width), a1: U.clamp(cb + hb, 0, level.width),
        depth: 144, label: 'PATIO' });
    }
  }

  /* ── entry point ─────────────────────────────────────────────────── */
  function generate(opts) {
    var o = {
      style: opts.style || 'farmhouse',
      beds: +opts.beds || 3, baths: +opts.baths || 2,
      stories: +opts.stories || 1, sqft: +opts.sqft || 2000,
      open: opts.open !== false, porch: !!opts.porch, patio: !!opts.patio,
      garage: !!opts.garage, primaryMain: opts.primaryMain !== false
    };
    var plan = { name: 'My Floor Plan', created: new Date().toISOString(),
                 opts: o, levels: [], activeLevel: 0 };

    // A garage is not heated square footage, so it is extra floor area on top
    // of what the user asked for rather than a slice taken out of it.
    var GARAGE_SQFT = 480, gx = o.garage ? GARAGE_SQFT : 0;

    if (o.stories === 1) {
      var fp = footprint(o.sqft + gx, { ratio: 1.6, minDepth: 26, maxDepth: 42 });
      var deep = fp.h > 32 * 12; o.depth = fp.h;
      var root = singleStory(o, deep, false);
      // a very large program for this bedroom count gets flex space rather
      // than a great room the size of a tennis court
      if (elasticStretch(root, o.sqft) > 2.1) root = singleStory(o, deep, true);
      fitTargets(root, o.sqft + gx);
      var lv = M.newLevel('Main Floor', fp.w, fp.h, root);
      finish(lv, o);
      plan.levels.push(lv);
    } else {
      var a0 = Math.round(o.sqft * 0.56), a1 = o.sqft - a0;
      var f0 = footprint(a0 + gx, { ratio: 1.5, minDepth: 26, maxDepth: 40 });
      var deep0 = f0.h > 32 * 12; o.depth = f0.h;
      var r0 = twoStoryMain(o, deep0);
      fitTargets(r0, a0 + gx);
      var L0 = M.newLevel('Main Floor', f0.w, f0.h, r0);
      finish(L0, o);

      var r1 = twoStoryUpper(o, deep0);
      fitTargets(r1, a1);
      var w1 = Math.round((a1 * 144 / L0.height) / 6) * 6;
      var L1 = M.newLevel('Upper Floor', Math.min(w1, L0.width), L0.height, r1);
      finish(L1, { open: o.open, porch: false, patio: false, entry: false });

      // an upper floor may not overhang the one holding it up
      if (L1.width > L0.width || L1.height > L0.height) {
        L0.width = Math.max(L0.width, L1.width);
        L0.height = Math.max(L0.height, L1.height);
        M.bake(L0);
      }
      plan.levels.push(L0, L1);
    }
    return plan;
  }

  /* A program can simply need more room than the square footage asked for
     (four bedrooms in 1,400 sq ft). Rather than quietly squeezing rooms below
     a usable size, grow the footprint — the readout then reports the honest
     number, which is what the user is really asking to know. */
  function enforceMin(level) {
    var mw = M.minExt(level.root, 'w'), mh = M.minExt(level.root, 'h');
    if (level.width < mw) level.width = Math.ceil(mw / 6) * 6;
    if (level.height < mh) level.height = Math.ceil(mh / 6) * 6;
    return level;
  }

  function finish(level, o) {
    M.resolveRatios(level.root);
    enforceMin(level);
    M.bake(level);       // solve with the max-dimension rules, then lock it in
    level.openings = [];
    level.styles = {};
    autoInterior(level, o.open !== false);
    var hooks = autoExterior(level, o);
    outdoors(level, hooks, o);
    return level;
  }

  /* Glaze a newly created bump-out: a bay with no window in it looks wrong,
     and these are exactly the walls people push out to get light. */
  function glazeBump(level, bump) {
    var far = M.walls(level).filter(function (w) {
      return w.bump && w.bump.id === bump.id && w.part === 'far';
    })[0];
    if (!far) return 0;
    if (M.openingsFor(level, far.key).length) return 0;   // a window already moved out here
    var room = far.room, spec = WIN[GRP(room.type)];
    if (!spec || room.type === 'garage') return 0;
    var len = far.a1 - far.a0 - 24;
    if (len < spec.w + 8) return 0;
    var n = U.clamp(Math.floor(len / spec.per), 1, 3);
    for (var i = 0; i < n; i++) {
      var o = M.addOpening(level, far, 12 + len * ((i + 0.5) / n), 'window');
      o.w = Math.min(spec.w, len / n - 8);
    }
    return n;
  }

  FP.G = { generate: generate, footprint: footprint, fitTargets: fitTargets,
           finish: finish, linkStyle: linkStyle, glazeBump: glazeBump };
})(window.FP);
