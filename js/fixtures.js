/* fixtures.js — automatic furniture & plumbing symbols.
 * Everything is drawn in world inches inside a room's CLEAR rectangle, so the
 * symbols stay dimensionally correct (a 60" tub is 60" on the plan) and
 * re-flow whenever the room is resized.
 */
window.FP = window.FP || {};

(function (FP) {
  'use strict';

  var LINE = '#8e949c', FILL = '#fbfbfa', SOFT = '#eef0f2';

  function fits(R, w, h) { return R.w >= w - 0.5 && R.h >= h - 0.5; }

  function box(c, x, y, w, h, fill) {
    c.beginPath(); c.rect(x, y, w, h);
    if (fill !== false) { c.fillStyle = fill || FILL; c.fill(); }
    c.strokeStyle = LINE; c.stroke();
  }
  function rbox(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
    c.fillStyle = fill || FILL; c.fill(); c.strokeStyle = LINE; c.stroke();
  }
  function ell(c, cx, cy, rx, ry) {
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = FILL; c.fill(); c.strokeStyle = LINE; c.stroke();
  }
  function seg(c, x1, y1, x2, y2) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = LINE; c.stroke();
  }

  /* ── individual symbols (x,y = corner against the wall) ──────────── */
  function toilet(c, x, y, along, dir) {          // along:'h' wall runs horizontal
    var w = 19, d = 28;
    if (along === 'h') {
      var yy = dir > 0 ? y : y - d;
      box(c, x, yy, w, 6);                        // tank
      ell(c, x + w / 2, yy + (dir > 0 ? 17 : 11), 7.5, 10);
    } else {
      var xx = dir > 0 ? x : x - d;
      box(c, xx, y, 6, w);
      ell(c, xx + (dir > 0 ? 17 : 11), y + w / 2, 10, 7.5);
    }
  }
  function vanity(c, x, y, len, along, dir, dbl) {
    var d = 21;
    if (along === 'h') {
      var yy = dir > 0 ? y : y - d;
      box(c, x, yy, len, d, SOFT);
      if (dbl && len > 54) { ell(c, x + len * 0.27, yy + d / 2, 8, 6); ell(c, x + len * 0.73, yy + d / 2, 8, 6); }
      else ell(c, x + len / 2, yy + d / 2, 8, 6);
    } else {
      var xx = dir > 0 ? x : x - d;
      box(c, xx, y, d, len, SOFT);
      if (dbl && len > 54) { ell(c, xx + d / 2, y + len * 0.27, 6, 8); ell(c, xx + d / 2, y + len * 0.73, 6, 8); }
      else ell(c, xx + d / 2, y + len / 2, 6, 8);
    }
  }
  function tub(c, x, y, w, h) {
    box(c, x, y, w, h, SOFT);
    rbox(c, x + 3, y + 3, w - 6, h - 6, 5, FILL);
    var horiz = w > h;
    if (horiz) ell(c, x + w - 9, y + h / 2, 1.8, 1.8); else ell(c, x + w / 2, y + h - 9, 1.8, 1.8);
  }
  function shower(c, x, y, w, h) {
    box(c, x, y, w, h, SOFT);
    seg(c, x, y, x + w, y + h); seg(c, x + w, y, x, y + h);
  }
  function counter(c, x, y, w, h) { box(c, x, y, w, h, SOFT); }
  function appliance(c, x, y, w, h, kind) {
    box(c, x, y, w, h, FILL);
    if (kind === 'range') {
      ell(c, x + w * 0.28, y + h * 0.3, 4, 4); ell(c, x + w * 0.72, y + h * 0.3, 4, 4);
      ell(c, x + w * 0.28, y + h * 0.7, 4, 4); ell(c, x + w * 0.72, y + h * 0.7, 4, 4);
    } else if (kind === 'sink') {
      rbox(c, x + 3, y + 3, w - 6, h - 6, 2, SOFT);
    } else if (kind === 'wd') {
      ell(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.3, Math.min(w, h) * 0.3);
    }
  }
  function bedSym(c, x, y, w, h, along) {
    box(c, x, y, w, h, FILL);
    if (along === 'h') { seg(c, x, y + h * 0.22, x + w, y + h * 0.22); }
    else { seg(c, x + w * 0.22, y, x + w * 0.22, y + h); }
  }
  function rod(c, x1, y1, x2, y2) {
    c.save(); c.setLineDash([6, 5]); seg(c, x1, y1, x2, y2); c.restore();
  }

  /* ── per-room layouts ────────────────────────────────────────────── */
  function drawBath(c, R, primary) {
    var wide = R.w >= R.h;
    if (primary && fits(R, 108, 84)) {
      if (wide) {
        tub(c, R.x, R.y, 60, 32);
        if (R.w > 108) shower(c, R.x + 62, R.y, Math.min(42, R.w - 64), 38);
        vanity(c, R.x + 4, R.y + R.h, Math.min(72, R.w - 30), 'h', -1, true);
        toilet(c, R.x + R.w - 21, R.y + R.h, 'h', -1);
      } else {
        tub(c, R.x, R.y, 32, 60);
        if (R.h > 108) shower(c, R.x, R.y + 62, 38, Math.min(42, R.h - 64));
        vanity(c, R.x + R.w, R.y + 4, Math.min(72, R.h - 30), 'v', -1, true);
        toilet(c, R.x + R.w, R.y + R.h - 21, 'v', -1);
      }
      return;
    }
    if (wide) {
      if (fits(R, 60, 30)) tub(c, R.x, R.y, 60, 30);
      if (fits(R, 84, 52)) vanity(c, R.x + R.w - Math.min(36, R.w * 0.4), R.y + R.h, Math.min(36, R.w * 0.4), 'h', -1);
      if (fits(R, 84, 52)) toilet(c, R.x + 4, R.y + R.h, 'h', -1);
    } else {
      if (fits(R, 30, 60)) tub(c, R.x, R.y, 30, 60);
      if (fits(R, 52, 84)) vanity(c, R.x + R.w, R.y + R.h - Math.min(36, R.h * 0.4), Math.min(36, R.h * 0.4), 'v', -1);
      if (fits(R, 52, 84)) toilet(c, R.x + R.w, R.y + 4, 'v', -1);
    }
  }
  function drawPowder(c, R) {
    if (R.w >= R.h) {
      if (fits(R, 40, 30)) { toilet(c, R.x + 3, R.y, 'h', 1); vanity(c, R.x + R.w - Math.min(30, R.w * 0.5), R.y, Math.min(30, R.w * 0.5), 'h', 1); }
    } else if (fits(R, 30, 40)) { toilet(c, R.x, R.y + 3, 'v', 1); vanity(c, R.x, R.y + R.h - Math.min(30, R.h * 0.5), Math.min(30, R.h * 0.5), 'v', 1); }
  }
  function drawKitchen(c, R) {
    var D = 25;
    if (!fits(R, 90, 78)) { if (fits(R, 60, 30)) counter(c, R.x, R.y, R.w, D); return; }
    counter(c, R.x, R.y, R.w, D);                              // back run
    appliance(c, R.x + R.w * 0.5 - 15, R.y + 2, 30, D - 4, 'sink');
    counter(c, R.x, R.y + D, D, Math.min(R.h - D, 96));        // return leg
    appliance(c, R.x + 2, R.y + D + 6, D - 4, 30, 'range');
    if (R.w > 150) appliance(c, R.x + R.w - 36, R.y + 1, 35, 30, 'fridge');
    // island if there is real floor left
    var iw = Math.min(84, R.w - D - 60), ih = 30;
    if (R.w - D > 96 && R.h - D > 84 && iw > 48)
      box(c, R.x + D + (R.w - D - iw) / 2, R.y + D + (R.h - D - ih) / 2 + 4, iw, ih, SOFT);
  }
  function drawLaundry(c, R) {
    if (!fits(R, 62, 32)) return;
    if (R.w >= R.h) { appliance(c, R.x + 2, R.y, 29, 29, 'wd'); appliance(c, R.x + 33, R.y, 29, 29, 'wd'); if (R.w > 96) counter(c, R.x + 64, R.y, R.w - 66, 25); }
    else { appliance(c, R.x, R.y + 2, 29, 29, 'wd'); appliance(c, R.x, R.y + 33, 29, 29, 'wd'); if (R.h > 96) counter(c, R.x, R.y + 64, 25, R.h - 66); }
  }
  function drawCloset(c, R, walkin) {
    var d = 24;
    if (R.w >= R.h) {
      counter(c, R.x, R.y, R.w, Math.min(d, R.h * 0.4)); rod(c, R.x + 2, R.y + 20, R.x + R.w - 2, R.y + 20);
      if (walkin && R.h > 70) { counter(c, R.x, R.y + R.h - Math.min(d, R.h * 0.35), R.w, Math.min(d, R.h * 0.35)); }
    } else {
      counter(c, R.x, R.y, Math.min(d, R.w * 0.4), R.h); rod(c, R.x + 20, R.y + 2, R.x + 20, R.y + R.h - 2);
      if (walkin && R.w > 70) counter(c, R.x + R.w - Math.min(d, R.w * 0.35), R.y, Math.min(d, R.w * 0.35), R.h);
    }
  }
  function drawPantry(c, R) {
    var d = Math.min(16, Math.min(R.w, R.h) * 0.35);
    counter(c, R.x, R.y, R.w, d);
    if (R.h > 50) { counter(c, R.x, R.y + d, d, R.h - d); }
  }
  function drawBed(c, R, primary) {
    var bw = primary ? 78 : 62, bl = primary ? 84 : 82;
    if (R.h >= R.w) {                       // bed against the top wall
      if (!fits(R, bw + 12, bl + 12)) return;
      var x = R.x + (R.w - bw) / 2;
      bedSym(c, x, R.y + 2, bw, bl, 'h');
      if (R.w > bw + 44) { box(c, x - 20, R.y + 2, 18, 18); box(c, x + bw + 2, R.y + 2, 18, 18); }
    } else {
      if (!fits(R, bl + 12, bw + 12)) return;
      var y = R.y + (R.h - bw) / 2;
      bedSym(c, R.x + 2, y, bl, bw, 'v');
      if (R.h > bw + 44) { box(c, R.x + 2, y - 20, 18, 18); box(c, R.x + 2, y + bw + 2, 18, 18); }
    }
  }
  function drawDining(c, R) {
    var tw = Math.min(78, R.w - 40), th = Math.min(42, R.h - 40);
    if (tw < 42 || th < 30) return;
    var x = R.x + (R.w - tw) / 2, y = R.y + (R.h - th) / 2;
    rbox(c, x, y, tw, th, 4, FILL);
    var n = tw > 66 ? 3 : 2, i;
    for (i = 0; i < n; i++) {
      var cx = x + tw * ((i + 0.5) / n);
      box(c, cx - 9, y - 20, 18, 17); box(c, cx - 9, y + th + 3, 18, 17);
    }
  }
  function drawStairs(c, R) {
    var vert = R.h >= R.w;
    var run = vert ? R.h : R.w, n = Math.max(3, Math.min(16, Math.floor(run / 10.5)));
    box(c, R.x, R.y, R.w, R.h, false);
    for (var i = 1; i < n; i++) {
      var t = i / n;
      if (vert) seg(c, R.x, R.y + R.h * t, R.x + R.w, R.y + R.h * t);
      else seg(c, R.x + R.w * t, R.y, R.x + R.w * t, R.y + R.h);
    }
    c.strokeStyle = '#6b7280';
    if (vert) { seg(c, R.x + R.w / 2, R.y + R.h - 6, R.x + R.w / 2, R.y + 6); arrow(c, R.x + R.w / 2, R.y + 6, 0, -1); }
    else { seg(c, R.x + 6, R.y + R.h / 2, R.x + R.w - 6, R.y + R.h / 2); arrow(c, R.x + R.w - 6, R.y + R.h / 2, 1, 0); }
  }
  function arrow(c, x, y, dx, dy) {
    var s = 7;
    c.beginPath(); c.moveTo(x, y);
    c.lineTo(x - dx * s + dy * s * 0.5, y - dy * s + dx * s * 0.5);
    c.moveTo(x, y);
    c.lineTo(x - dx * s - dy * s * 0.5, y - dy * s - dx * s * 0.5);
    c.stroke();
  }
  function drawGarage(c, R) {
    var vert = R.h >= R.w, cw = 84, cl = 190;
    var n = vert ? Math.floor(R.w / (cw + 24)) : Math.floor(R.h / (cw + 24));
    n = Math.max(1, Math.min(3, n));
    c.save(); c.setLineDash([9, 7]);
    for (var i = 0; i < n; i++) {
      if (vert) { var x = R.x + (R.w / n) * (i + 0.5) - cw / 2; if (R.h > cl) rbox(c, x, R.y + (R.h - cl) / 2, cw, cl, 22, 'rgba(0,0,0,0)'); }
      else { var y = R.y + (R.h / n) * (i + 0.5) - cw / 2; if (R.w > cl) rbox(c, R.x + (R.w - cl) / 2, y, cl, cw, 22, 'rgba(0,0,0,0)'); }
    }
    c.restore();
  }
  function drawMud(c, R) {
    if (R.w >= R.h) { counter(c, R.x, R.y, R.w, Math.min(18, R.h * 0.35)); }
    else counter(c, R.x, R.y, Math.min(18, R.w * 0.35), R.h);
  }
  function drawOffice(c, R) {
    if (!fits(R, 90, 70)) return;
    box(c, R.x + 8, R.y + 8, Math.min(60, R.w - 20), 28, SOFT);
    box(c, R.x + 8 + Math.min(60, R.w - 20) / 2 - 10, R.y + 40, 20, 18);
  }

  var MAP = {
    bath: function (c, R) { drawBath(c, R, false); },
    primary_bath: function (c, R) { drawBath(c, R, true); },
    powder: drawPowder, kitchen: drawKitchen, laundry: drawLaundry,
    wic: function (c, R) { drawCloset(c, R, true); },
    closet: function (c, R) { drawCloset(c, R, false); },
    pantry: drawPantry, dining: drawDining, stairs: drawStairs,
    garage: drawGarage, mud: drawMud, office: drawOffice,
    bedroom: function (c, R) { drawBed(c, R, false); },
    primary_bed: function (c, R) { drawBed(c, R, true); }
  };

  /* draw fixtures for one room; `inset` is the clear rectangle */
  function draw(ctx, type, clear, lw) {
    var fn = MAP[type];
    if (!fn) return;
    var R = { x: clear.x + 3, y: clear.y + 3, w: clear.w - 6, h: clear.h - 6 };
    if (R.w < 20 || R.h < 20) return;
    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    fn(ctx, R);
    ctx.restore();
  }

  FP.FX = { draw: draw, MAP: MAP };
})(window.FP);
