/* exporters.js — PNG, SVG, DXF, JSON, print.
   The DXF is real CAD output: inch units, layered, with wall faces broken
   around every door and window, so it opens sanely in AutoCAD/LibreCAD. */
window.FP = window.FP || {};

(function (FP) {
  'use strict';
  var M = FP.M, U = FP.U, R = FP.R;

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ── PNG (renders offscreen at print resolution) ─────────────────── */
  function png(st, scaleUp) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;left:-20000px;top:0;width:1800px;height:1300px';
    document.body.appendChild(cv);
    var level = st.plan.levels[st.plan.activeLevel];
    var tmp = {
      plan: st.plan, opts: Object.assign({}, st.opts, { grid: false }),
      view: R.fit(level, 1800, 1300, 130), sel: null, hover: null,
      tool: 'select', exporting: true
    };
    var dpr0 = window.devicePixelRatio;
    try {
      R.draw(cv, tmp);
      cv.toBlob(function (b) {
        download(fname(st, 'png'), b);
        cv.remove();
      }, 'image/png');
    } catch (e) { cv.remove(); throw e; }
  }

  function fname(st, ext) {
    var lv = st.plan.levels[st.plan.activeLevel];
    return (st.plan.name || 'floorplan').replace(/[^\w\-]+/g, '_') + '_' +
           lv.name.replace(/[^\w\-]+/g, '_') + '.' + ext;
  }

  /* ── geometry shared by SVG + DXF ────────────────────────────────── */
  function inward(side) { return (side === 'left' || side === 'back') ? 1 : -1; }

  /* every wall as {dir,pos,a0,a1,thick,key} including the exterior ring */
  function wallList(level) {
    return M.walls(level).filter(function (w) {
      return w.type === 'ext' || M.wallStyle(level, w.key) !== 'none';
    });
  }
  /* subtract opening intervals from [a0,a1] */
  function gaps(level, w) {
    var cuts = M.openingsFor(level, w.key).map(function (o) {
      var g = M.openingGeom(w, o); return [g.s, g.e];
    }).sort(function (p, q) { return p[0] - q[0]; });
    var out = [], cur = w.a0;
    cuts.forEach(function (c) {
      if (c[0] > cur) out.push([cur, c[0]]);
      cur = Math.max(cur, c[1]);
    });
    if (cur < w.a1) out.push([cur, w.a1]);
    return { solid: out, cuts: cuts };
  }

  /* ── SVG ─────────────────────────────────────────────────────────── */
  function svg(st) {
    var lv = st.plan.levels[st.plan.activeLevel];
    M.computeRects(lv);
    var b = R.bounds(lv), pad = 110;
    var W = (b.x1 - b.x0) + pad * 2, H = (b.y1 - b.y0) + pad * 2 + 60;
    var o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (b.x0 - pad) + ' ' + (b.y0 - pad) + ' ' + W + ' ' + H +
           '" width="' + Math.round(W * 1.1) + '" height="' + Math.round(H * 1.1) + '">');
    o.push('<style>text{font-family:"Segoe UI",Arial,sans-serif}' +
           '.rm{font-size:11px;font-weight:700;text-anchor:middle}' +
           '.sz{font-size:9.5px;fill:#6b7280;text-anchor:middle}' +
           '.dm{font-size:10px;fill:#4b5158;text-anchor:middle}</style>');
    o.push('<rect x="' + (b.x0 - pad) + '" y="' + (b.y0 - pad) + '" width="' + W + '" height="' + H + '" fill="#fff"/>');

    (lv.outdoor || []).forEach(function (od) {
      var r = R.odRect(lv, od);
      o.push('<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h +
             '" fill="#f0efe9" stroke="#b9b5ab" stroke-width="1.4" stroke-dasharray="8 5"/>');
      o.push('<text class="rm" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 - 2) + '" fill="#575d64">' + esc(od.label) + '</text>');
      o.push('<text class="sz" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + 12) + '">(' + U.sizeTxt(r.w, r.h) + ')</text>');
    });
    o.push('<rect x="0" y="0" width="' + lv.width + '" height="' + lv.height + '" fill="#fff"/>');
    M.bumpList(lv).forEach(function (g) {
      o.push('<rect x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '" fill="#fff"/>');
    });

    // exterior shell: outline and the same loop pushed one wall inward, filled
    // even-odd so bump-outs come through with correct corners
    var E = M.EXT_W;
    var ol = M.outline(lv);
    function d(pts) {
      return 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L') + 'Z';
    }
    o.push('<path d="' + d(ol.outer) + d(ol.inner) + '" fill="#26292e" fill-rule="evenodd"/>');

    var wr = [];
    wallList(lv).forEach(function (w) {
      if (w.type !== 'int') return;
      var t = w.thick, h = t / 2;
      if (w.dir === 'v') wr.push([w.pos - h, Math.max(w.a0 - h, E), t, Math.min(w.a1 + h, lv.height - E) - Math.max(w.a0 - h, E)]);
      else wr.push([Math.max(w.a0 - h, E), w.pos - h, Math.min(w.a1 + h, lv.width - E) - Math.max(w.a0 - h, E), t]);
    });
    wr.forEach(function (r) { o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" fill="#26292e"/>'); });

    // openings: punch + symbol
    wallList(lv).forEach(function (w) {
      M.openingsFor(lv, w.key).forEach(function (op) {
        var g = M.openingGeom(w, op), t = w.thick, h = t / 2;
        if (w.dir === 'v') o.push('<rect x="' + (w.pos - h) + '" y="' + g.s + '" width="' + t + '" height="' + g.w + '" fill="#fff"/>');
        else o.push('<rect x="' + g.s + '" y="' + (w.pos - h) + '" width="' + g.w + '" height="' + t + '" fill="#fff"/>');
        var st2 = 'fill="none" stroke="#26292e" stroke-width="1.2"';
        if (op.type === 'window') {
          if (w.dir === 'v') o.push('<path d="M' + (w.pos - h) + ' ' + g.s + 'V' + g.e + 'M' + (w.pos + h) + ' ' + g.s + 'V' + g.e + 'M' + w.pos + ' ' + g.s + 'V' + g.e + '" ' + st2 + '/>');
          else o.push('<path d="M' + g.s + ' ' + (w.pos - h) + 'H' + g.e + 'M' + g.s + ' ' + (w.pos + h) + 'H' + g.e + 'M' + g.s + ' ' + w.pos + 'H' + g.e + '" ' + st2 + '/>');
        } else if (op.type === 'door') {
          var sw = op.swing || 1, fl = op.flip || 1;
          if (w.dir === 'v') {
            var hy = fl > 0 ? g.s : g.e;
            o.push('<path d="M' + w.pos + ' ' + hy + 'L' + (w.pos + sw * g.w) + ' ' + hy +
                   '" ' + st2 + '/><path d="M' + (w.pos + sw * g.w) + ' ' + hy + 'A' + g.w + ' ' + g.w +
                   ' 0 0 ' + (sw * fl > 0 ? 1 : 0) + ' ' + w.pos + ' ' + (hy + fl * g.w) + '" fill="none" stroke="#6b7280" stroke-width="1"/>');
          } else {
            var hx = fl > 0 ? g.s : g.e;
            o.push('<path d="M' + hx + ' ' + w.pos + 'L' + hx + ' ' + (w.pos + sw * g.w) +
                   '" ' + st2 + '/><path d="M' + hx + ' ' + (w.pos + sw * g.w) + 'A' + g.w + ' ' + g.w +
                   ' 0 0 ' + (sw * fl > 0 ? 0 : 1) + ' ' + (hx + fl * g.w) + ' ' + w.pos + '" fill="none" stroke="#6b7280" stroke-width="1"/>');
          }
        }
      });
    });

    // labels
    M.leaves(lv.root).forEach(function (l) {
      var cd = M.clearDims(lv, l), r = l.rect;
      o.push('<text class="rm" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 - 2) + '">' + esc(l.name) + '</text>');
      o.push('<text class="sz" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + 12) + '">(' + U.sizeTxt(cd.w, cd.h) + ')</text>');
    });

    // overall dimensions
    var oy = b.y0 - 52, ox = b.x0 - 52;
    o.push('<path d="M0 ' + oy + 'H' + lv.width + '" stroke="#9aa1aa" stroke-width="1"/>');
    o.push('<text class="dm" x="' + lv.width / 2 + '" y="' + (oy - 5) + '">' + U.ft(lv.width) + '</text>');
    o.push('<path d="M' + ox + ' 0V' + lv.height + '" stroke="#9aa1aa" stroke-width="1"/>');
    o.push('<text class="dm" x="' + ox + '" y="' + lv.height / 2 + '" transform="rotate(-90 ' + ox + ' ' + lv.height / 2 + ')" dy="-5">' + U.ft(lv.height) + '</text>');
    var hb = R.houseBounds(lv);
    o.push('<text x="' + b.x1 + '" y="' + (b.y1 + 46) + '" text-anchor="end" font-size="14" font-weight="700">' +
           U.ft(hb.x1 - hb.x0) + '  x  ' + U.ft(hb.y1 - hb.y0) +
           (M.bumpList(lv).length ? '  OVERALL' : '') + '</text>');
    o.push('<text x="' + b.x1 + '" y="' + (b.y1 + 64) + '" text-anchor="end" font-size="12" fill="#6b7280">Approx. ' +
           U.sqft(M.levelArea(lv)).toLocaleString() + ' SQ FT</text>');
    o.push('</svg>');
    download(fname(st, 'svg'), new Blob([o.join('\n')], { type: 'image/svg+xml' }));
  }

  /* ── DXF (R12 ASCII, inches) ─────────────────────────────────────── */
  function dxf(st) {
    var lv = st.plan.levels[st.plan.activeLevel];
    M.computeRects(lv);
    var H = lv.height, out = [];
    function p(code, val) { out.push(code); out.push(val); }
    function line(x1, y1, x2, y2, layer) {
      p(0, 'LINE'); p(8, layer);
      p(10, r4(x1)); p(20, r4(H - y1)); p(30, '0.0');
      p(11, r4(x2)); p(21, r4(H - y2)); p(31, '0.0');
    }
    function txt(x, y, h, s, layer) {
      p(0, 'TEXT'); p(8, layer); p(10, r4(x)); p(20, r4(H - y)); p(30, '0.0');
      p(40, r4(h)); p(1, String(s)); p(72, '1'); p(11, r4(x)); p(21, r4(H - y)); p(31, '0.0');
    }
    function arcE(cx, cy, r, a0, a1, layer) {
      p(0, 'ARC'); p(8, layer); p(10, r4(cx)); p(20, r4(H - cy)); p(30, '0.0');
      p(40, r4(r)); p(50, r4(-a1 * 180 / Math.PI)); p(51, r4(-a0 * 180 / Math.PI));
    }
    function r4(n) { return (Math.round(n * 10000) / 10000).toFixed(4); }

    p(0, 'SECTION'); p(2, 'ENTITIES');

    wallList(lv).forEach(function (w) {
      var t = w.thick, h = t / 2, f1, f2, layer = 'A-WALL';
      if (w.type === 'ext') { f1 = w.pos - h; f2 = w.pos + h; }
      else { f1 = w.pos - h; f2 = w.pos + h; }
      var gp = gaps(lv, w);
      gp.solid.forEach(function (sg) {
        if (w.dir === 'v') { line(f1, sg[0], f1, sg[1], layer); line(f2, sg[0], f2, sg[1], layer); }
        else { line(sg[0], f1, sg[1], f1, layer); line(sg[0], f2, sg[1], f2, layer); }
      });
      // jambs at each opening
      gp.cuts.forEach(function (c) {
        if (w.dir === 'v') { line(f1, c[0], f2, c[0], 'A-DOOR'); line(f1, c[1], f2, c[1], 'A-DOOR'); }
        else { line(c[0], f1, c[0], f2, 'A-DOOR'); line(c[1], f1, c[1], f2, 'A-DOOR'); }
      });
      // wall ends
      if (w.type === 'int') {
        if (w.dir === 'v') { line(f1, w.a0, f2, w.a0, layer); line(f1, w.a1, f2, w.a1, layer); }
        else { line(w.a0, f1, w.a0, f2, layer); line(w.a1, f1, w.a1, f2, layer); }
      }
      // door leaf + swing
      M.openingsFor(lv, w.key).forEach(function (op) {
        var g = M.openingGeom(w, op);
        if (op.type === 'window') {
          if (w.dir === 'v') line(w.pos, g.s, w.pos, g.e, 'A-GLAZ');
          else line(g.s, w.pos, g.e, w.pos, 'A-GLAZ');
          return;
        }
        if (op.type !== 'door') return;
        var sw = op.swing || 1, fl = op.flip || 1;
        if (w.dir === 'v') {
          var hy = fl > 0 ? g.s : g.e;
          line(w.pos, hy, w.pos + sw * g.w, hy, 'A-DOOR');
          var a0 = sw > 0 ? 0 : Math.PI, a1 = fl > 0 ? Math.PI / 2 : -Math.PI / 2;
          arcE(w.pos, hy, g.w, Math.min(a0, a1), Math.max(a0, a1), 'A-DOOR');
        } else {
          var hx = fl > 0 ? g.s : g.e;
          line(hx, w.pos, hx, w.pos + sw * g.w, 'A-DOOR');
          var b0 = sw > 0 ? Math.PI / 2 : -Math.PI / 2, b1 = fl > 0 ? 0 : Math.PI;
          arcE(hx, w.pos, g.w, Math.min(b0, b1), Math.max(b0, b1), 'A-DOOR');
        }
      });
    });

    M.leaves(lv.root).forEach(function (l) {
      var cd = M.clearDims(lv, l), r = l.rect;
      txt(r.x + r.w / 2, r.y + r.h / 2 - 2, 8, l.name, 'A-ANNO-TEXT');
      txt(r.x + r.w / 2, r.y + r.h / 2 + 12, 6, U.sizeTxt(cd.w, cd.h), 'A-ANNO-TEXT');
    });
    (lv.outdoor || []).forEach(function (od) {
      var r = R.odRect(lv, od);
      line(r.x, r.y, r.x + r.w, r.y, 'A-FLOR-OTLN'); line(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 'A-FLOR-OTLN');
      line(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 'A-FLOR-OTLN'); line(r.x, r.y + r.h, r.x, r.y, 'A-FLOR-OTLN');
      txt(r.x + r.w / 2, r.y + r.h / 2, 8, od.label, 'A-ANNO-TEXT');
    });
    // the heated shell outline, inside and out, so bump-outs are real geometry
    var ol = M.outline(lv);
    [ol.outer, ol.inner].forEach(function (loop) {
      for (var i = 0; i < loop.length; i++) {
        var a = loop[i], b2 = loop[(i + 1) % loop.length];
        line(a[0], a[1], b2[0], b2[1], 'A-WALL-SHELL');
      }
    });
    var hbx = R.houseBounds(lv);
    txt(lv.width, lv.height + 40, 10,
        U.ft(hbx.x1 - hbx.x0) + ' x ' + U.ft(hbx.y1 - hbx.y0) + '  ~' +
        U.sqft(M.levelArea(lv)) + ' SQ FT', 'A-ANNO-TEXT');

    p(0, 'ENDSEC'); p(0, 'EOF');
    var body = '';
    for (var i = 0; i < out.length; i += 2) body += String(out[i]) + '\n' + out[i + 1] + '\n';
    download(fname(st, 'dxf'), new Blob([body], { type: 'application/dxf' }));
  }

  /* ── JSON project file ───────────────────────────────────────────── */
  function json(st) {
    var data = JSON.stringify({ app: 'floor-plan-builder', version: 1, plan: st.plan }, function (k, v) {
      return k === 'rect' ? undefined : v;
    }, 1);
    download((st.plan.name || 'floorplan').replace(/[^\w\-]+/g, '_') + '.json',
             new Blob([data], { type: 'application/json' }));
  }

  function print(st) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1150px';
    document.body.appendChild(cv);
    var level = st.plan.levels[st.plan.activeLevel];
    R.draw(cv, { plan: st.plan, opts: Object.assign({}, st.opts, { grid: false }),
                 view: R.fit(level, 1600, 1150, 130), sel: null, hover: null,
                 tool: 'select', exporting: true });
    var url = cv.toDataURL('image/png');
    cv.remove();
    var w = window.open('', '_blank');
    if (!w) return alert('Allow pop-ups to print.');
    w.document.write('<html><head><title>' + esc(st.plan.name || 'Floor Plan') +
      '</title><style>body{margin:0;display:flex;align-items:center;justify-content:center}' +
      'img{max-width:100%;max-height:100vh}@page{size:landscape;margin:10mm}</style></head><body>' +
      '<img src="' + url + '" onload="window.focus();window.print()"></body></html>');
    w.document.close();
  }

  FP.EX = { png: png, svg: svg, dxf: dxf, json: json, print: print, download: download };
})(window.FP);
