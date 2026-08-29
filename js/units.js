/* units.js — everything in the model is stored in INCHES (float).
   These helpers convert to/from the feet-and-inches strings people actually read. */
window.FP = window.FP || {};

(function (FP) {
  'use strict';

  /* 198 -> 16'-6"   |  180 -> 15'-0"  */
  function ft(inches, opts) {
    opts = opts || {};
    var neg = inches < 0;
    var v = Math.abs(inches);
    // round to the nearest 1/8" so we never print 11.999"
    v = Math.round(v * 8) / 8;
    var f = Math.floor(v / 12);
    var i = v - f * 12;
    var whole = Math.floor(i + 1e-9);
    var frac = i - whole;
    var fracTxt = '';
    if (frac > 1e-9) {
      var n = Math.round(frac * 8), d = 8;
      while (n % 2 === 0 && d > 1) { n /= 2; d /= 2; }
      fracTxt = ' ' + n + '/' + d;
    }
    var s;
    if (opts.short) {
      s = f + "'" + (whole || fracTxt ? '-' + whole + fracTxt + '"' : '');
    } else {
      s = f + "'-" + whole + fracTxt + '"';
    }
    return (neg ? '-' : '') + s;
  }

  /* compact form for tight spots: 16'-6"  ->  16'6" */
  function ftShort(inches) { return ft(inches).replace("'-", "'"); }

  /* Accepts:  16   16'   16'6"   16'-6"   16 6   16.5'   198"   16ft 6in
     Returns inches, or NaN. Bare numbers are read as FEET (what novices type). */
  function parse(str) {
    if (typeof str === 'number') return str;
    if (!str) return NaN;
    var s = String(str).toLowerCase().trim()
      .replace(/feet|foot|ft\.?/g, "'")
      .replace(/inches|inch|in\.?/g, '"')
      .replace(/[’ʼ]/g, "'")
      .replace(/[”″]/g, '"');

    // pure number => feet
    if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s) * 12;
    // pure inches: 198"
    var m = s.match(/^(-?\d*\.?\d+)\s*"$/);
    if (m) return parseFloat(m[1]);
    // "12 6" / "12-6" / "12 6 1/2"  => feet then inches, no marks typed
    var fi = s.match(/^(-?\d+)\s*[-\s]\s*(\d*\.?\d+)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*$/);
    if (fi && (fi[2] || fi[3])) {
      var sign = fi[1][0] === '-' ? -1 : 1;
      var v = Math.abs(parseFloat(fi[1])) * 12 + (fi[2] ? parseFloat(fi[2]) : 0);
      if (fi[3] && fi[4]) v += parseInt(fi[3], 10) / parseInt(fi[4], 10);
      return sign * v;
    }

    var neg = s[0] === '-';
    s = s.replace(/^-/, '');
    var total = 0, matched = false;

    var fm = s.match(/(\d*\.?\d+)\s*'/);
    if (fm) { total += parseFloat(fm[1]) * 12; matched = true; s = s.slice(fm.index + fm[0].length); }

    // remaining inches, with optional fraction: 6 1/2"
    var im = s.match(/(\d*\.?\d+)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?\s*$/);
    if (im && (im[1] || im[2])) {
      if (im[1]) { total += parseFloat(im[1]); matched = true; }
      if (im[2] && im[3]) { total += parseInt(im[2], 10) / parseInt(im[3], 10); matched = true; }
    }
    if (!matched) return NaN;
    return neg ? -total : total;
  }

  /* square inches -> square feet, rounded */
  function sqft(sqIn) { return Math.round(sqIn / 144); }
  function areaTxt(sqIn) { return sqft(sqIn).toLocaleString() + ' sq ft'; }

  /* "12' x 14'" style room size caption from clear (inside) dimensions */
  function sizeTxt(w, h) { return ftShort(w) + ' x ' + ftShort(h); }

  function round(v, snap) { return snap > 0 ? Math.round(v / snap) * snap : v; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  FP.U = { ft: ft, ftShort: ftShort, parse: parse, sqft: sqft, areaTxt: areaTxt,
           sizeTxt: sizeTxt, round: round, clamp: clamp };
})(window.FP);
