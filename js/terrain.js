/* Ödemark — demo map.
   Deterministic terrain + suitability computation, rendered on canvas.
   The production site swaps this synthetic elevation model for real
   Lantmäteriet tiles; the pipeline (factors → threshold → zones) is the same
   shape as the app's. No network, no tracking, no state leaves the page. */

(function () {
  "use strict";

  var stage = document.getElementById("demo-stage");
  if (!stage) return;

  var canvas = document.getElementById("terrain-canvas");
  var svg = document.getElementById("zones-svg");
  var logEl = document.getElementById("demo-log");
  var readout = document.getElementById("demo-readout");
  var emptyEl = document.getElementById("demo-empty");
  var input = document.getElementById("demo-place");
  var locBtn = document.getElementById("demo-locate");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-filter]"));
  var countEl = document.getElementById("demo-count");

  var I18N = window.ODEMARK_DEMO_I18N || {};
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Stockholms län — the only computed region for now. Stated plainly.
  var TOWNS = ["Stockholm", "Norrtälje", "Nynäshamn", "Södertälje", "Vaxholm",
    "Gustavsberg", "Åkersberga", "Märsta", "Hallstavik", "Rimbo", "Dalarö", "Grisslehamn"];
  var BBOX = { w: 17.2, e: 19.4, s: 58.7, n: 60.2 };

  var GRID_W = 132, GRID_H = 84;       // suitability grid
  var CELL_HA = 1.6;                    // pretend scale ≈ 126 m cells
  var seedName = TOWNS[0];
  var elev = null, wet = null;
  var zones = [];
  var running = false;

  // ——— deterministic PRNG / noise ———

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    var rnd = mulberry(seed);
    var P = 256, grid = new Float32Array(P * P);
    for (var i = 0; i < grid.length; i++) grid[i] = rnd();
    function at(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
      var x0 = xi & (P - 1), x1 = (xi + 1) & (P - 1);
      var y0 = yi & (P - 1), y1 = (yi + 1) & (P - 1);
      var a = grid[y0 * P + x0], b = grid[y0 * P + x1];
      var c = grid[y1 * P + x0], d = grid[y1 * P + x1];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    }
    return function (x, y) { // fbm, 5 octaves
      var v = 0, amp = 0.5, f = 1;
      for (var o = 0; o < 5; o++) { v += amp * at(x * f, y * f); amp *= 0.5; f *= 2; }
      return v;
    };
  }

  // ——— terrain fields ———

  function buildFields(name) {
    var s = hash(name.toLowerCase());
    var n1 = makeNoise(s), n2 = makeNoise(s ^ 0x9E3779B9);
    elev = new Float32Array(GRID_W * GRID_H);
    wet = new Float32Array(GRID_W * GRID_H);
    for (var y = 0; y < GRID_H; y++) {
      for (var x = 0; x < GRID_W; x++) {
        var u = x / GRID_W * 4.2, v = y / GRID_H * 2.8;
        elev[y * GRID_W + x] = n1(u, v);
        wet[y * GRID_W + x] = n2(u + 40, v + 40);
      }
    }
  }

  function sampleElev(gx, gy) { // bilinear, clamped
    gx = Math.max(0, Math.min(GRID_W - 1.001, gx));
    gy = Math.max(0, Math.min(GRID_H - 1.001, gy));
    var x0 = Math.floor(gx), y0 = Math.floor(gy);
    var fx = gx - x0, fy = gy - y0;
    var i = y0 * GRID_W + x0;
    return elev[i] * (1 - fx) * (1 - fy) + elev[i + 1] * fx * (1 - fy) +
           elev[i + GRID_W] * (1 - fx) * fy + elev[i + GRID_W + 1] * fx * fy;
  }

  function blur(field) { // 3×3 box, three passes — calm the field
    for (var pass = 0; pass < 3; pass++) {
      var out = new Float32Array(field.length);
      for (var y = 0; y < GRID_H; y++) {
        for (var x = 0; x < GRID_W; x++) {
          var sum = 0, n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var px = x + dx, py = y + dy;
              if (px < 0 || py < 0 || px >= GRID_W || py >= GRID_H) continue;
              sum += field[py * GRID_W + px]; n++;
            }
          }
          out[y * GRID_W + x] = sum / n;
        }
      }
      field = out;
    }
    return field;
  }

  var WATER = 0.36;

  function slopeAt(x, y) {
    var x0 = Math.max(x - 1, 0), x1 = Math.min(x + 1, GRID_W - 1);
    var y0 = Math.max(y - 1, 0), y1 = Math.min(y + 1, GRID_H - 1);
    var dx = elev[y * GRID_W + x1] - elev[y * GRID_W + x0];
    var dy = elev[y1 * GRID_W + x] - elev[y0 * GRID_W + x];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distToWater(x, y) { // coarse radial probe
    for (var r = 1; r < 14; r++) {
      for (var a = 0; a < 8; a++) {
        var px = Math.round(x + r * Math.cos(a * 0.785)), py = Math.round(y + r * Math.sin(a * 0.785));
        if (px < 0 || py < 0 || px >= GRID_W || py >= GRID_H) continue;
        if (elev[py * GRID_W + px] < WATER) return r;
      }
    }
    return 14;
  }

  // ——— render ———

  function render() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = Math.round(w * dpr / 2);   // half-res, CSS-scaled: soft like a dusk map
    canvas.height = Math.round(h * dpr / 2);
    var cw = canvas.width, ch = canvas.height;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(cw, ch);
    var d = img.data;

    var sx = (GRID_W - 1) / cw, sy = (GRID_H - 1) / ch;
    for (var py = 0; py < ch; py++) {
      var gy = py * sy;
      for (var px = 0; px < cw; px++) {
        var gx = px * sx;
        var e = sampleElev(gx, gy);
        var r, g, b;
        if (e < WATER) {
          r = 10; g = 15; b = 20;
          if (e > WATER - 0.012) { r = 16; g = 23; b = 28; } // shoreline
        } else {
          var t = (e - WATER) / (1 - WATER);
          // dark terrängkarta ramp: forest green-black → grey heights
          r = 18 + t * 26; g = 24 + t * 23; b = 18 + t * 26;
          var m = wet[Math.round(gy) * GRID_W + Math.round(gx)];
          if (m > 0.62 && t < 0.25) { r -= 3; g += 2; b += 1; } // damp ground, cooler
          // hillshade, light from NW — smooth bilinear gradient
          var ex = sampleElev(gx + 0.8, gy) - e;
          var ey = sampleElev(gx, gy + 0.8) - e;
          var sh = 1 + (ex + ey) * 9;
          sh = Math.max(0.7, Math.min(1.34, sh));
          r *= sh; g *= sh; b *= sh;
          // contours
          var c = (e * 26) % 1;
          if (c < 0.06 && t > 0.02) { r *= 0.84; g *= 0.84; b *= 0.84; }
        }
        var o = (py * cw + px) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ——— suitability + zones (marching squares) ———

  function suitability(filters) {
    var out = new Float32Array(GRID_W * GRID_H);
    for (var y = 0; y < GRID_H; y++) {
      for (var x = 0; x < GRID_W; x++) {
        var i = y * GRID_W + x;
        var e = elev[i];
        if (e < WATER + 0.01) { out[i] = 0; continue; }
        var sl = slopeAt(x, y);
        var slMax = filters.tent ? 0.045 : 0.065;
        var s = 1;
        s *= Math.max(0, 1 - sl / slMax);
        if (!filters.rainok) s *= Math.max(0, 1 - Math.max(0, wet[i] - 0.5) * 2.2);
        var dw = distToWater(x, y);
        if (filters.water) s *= dw <= 6 ? 1 : Math.max(0, 1 - (dw - 6) / 5);
        else s *= dw < 2 ? 0.4 : 1;                       // not in the reeds
        s *= 0.75 + 0.25 * Math.min(1, (e - WATER) * 6);  // dry ground preferred
        // edge margin — zones never touch the frame
        var mx = Math.min(x, GRID_W - 1 - x), my = Math.min(y, GRID_H - 1 - y);
        if (mx < 6 || my < 5) s *= Math.min(mx / 6, my / 5);
        out[i] = s;
      }
    }
    return out;
  }

  function marchingSquares(field, thr) {
    var visited = {};
    var paths = [];
    function key(x, y) { return x + "," + y; }
    function inside(x, y) {
      return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && field[y * GRID_W + x] >= thr;
    }
    // trace boundary of each blob with Moore neighbourhood
    for (var y = 0; y < GRID_H; y++) {
      for (var x = 0; x < GRID_W; x++) {
        if (!inside(x, y) || inside(x - 1, y) || visited[key(x, y)]) continue;
        var path = [], cx = x, cy = y, dir = 6, steps = 0;
        var DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
        do {
          visited[key(cx, cy)] = true;
          path.push([cx, cy]);
          var found = false;
          for (var t = 0; t < 8; t++) {
            var nd = (dir + 6 + t) % 8;
            var nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
            if (inside(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; }
          }
          if (!found) break;
          steps++;
        } while ((cx !== x || cy !== y) && steps < 900);
        if (path.length > 11) paths.push(path);
      }
    }
    return paths;
  }

  function blobArea(field, thr, path) {
    // flood-count cells ≥ thr from path seed (bounded)
    var minx = GRID_W, maxx = 0, miny = GRID_H, maxy = 0;
    path.forEach(function (p) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
    });
    var n = 0;
    for (var y = miny; y <= maxy; y++)
      for (var x = minx; x <= maxx; x++)
        if (field[y * GRID_W + x] >= thr) n++;
    return { cells: n, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
  }

  function smoothPath(path) {
    // resample + midpoint smoothing → quiet organic outline
    var pts = path.filter(function (_, i) { return i % 3 === 0; });
    if (pts.length < 6) pts = path;
    var d = "";
    var w = stage.clientWidth, h = stage.clientHeight;
    function X(p) { return (p[0] / (GRID_W - 1)) * w; }
    function Y(p) { return (p[1] / (GRID_H - 1)) * h; }
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var mx = (X(p) + X(q)) / 2, my = (Y(p) + Y(q)) / 2;
      if (i === 0) d += "M" + mx.toFixed(1) + " " + my.toFixed(1);
      else d += "Q" + X(p).toFixed(1) + " " + Y(p).toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    return d + "Z";
  }

  function computeZones(filters) {
    var field = blur(suitability(filters));
    // threshold at a percentile of viable ground — zone area stays honest
    var vals = [];
    for (var i = 0; i < field.length; i++) if (field[i] > 0.05) vals.push(field[i]);
    if (!vals.length) return [];
    vals.sort(function (a, b) { return a - b; });
    var thr = vals[Math.floor(vals.length * 0.8)];
    var paths = marchingSquares(field, thr), tries = 0;
    while (paths.length > 4 && tries < 5) {
      thr = thr + (vals[vals.length - 1] - thr) * 0.25;
      paths = marchingSquares(field, thr);
      tries++;
    }
    paths.sort(function (a, b) { return b.length - a.length; });
    paths = paths.slice(0, 4);
    return paths.map(function (p, i) {
      var meta = blobArea(field, thr, p);
      return { d: smoothPath(p), meta: meta, idx: i };
    }).filter(function (z) { return z.meta.cells >= 24; });
  }

  // ——— UI ———

  function filtersNow() {
    var f = {};
    chips.forEach(function (c) { f[c.dataset.filter] = c.getAttribute("aria-pressed") === "true"; });
    return f;
  }

  function fmtCoord(cx, cy) {
    var lat = BBOX.n - (cy / GRID_H) * (BBOX.n - BBOX.s);
    var lon = BBOX.w + (cx / GRID_W) * (BBOX.e - BBOX.w);
    return lat.toFixed(2) + "°N " + lon.toFixed(2) + "°E";
  }

  function showReadout(z) {
    var rnd = mulberry(hash(seedName) ^ (z.idx * 7919 + 13));
    var ha = Math.round(z.meta.cells * CELL_HA);
    var elevLo = 15 + Math.round(rnd() * 40), elevHi = elevLo + 8 + Math.round(rnd() * 30);
    var walk = (0.8 + rnd() * 2.6).toFixed(1);
    var grounds = I18N.grounds || [];
    var ground = grounds[Math.floor(rnd() * grounds.length)] || "";
    readout.innerHTML =
      '<span class="caption">' + (I18N.zoneLabel || "zon") + " " + String.fromCharCode(65 + z.idx) + "</span>" +
      "~" + ha + " ha · " + elevLo + "–" + elevHi + " m<br>" +
      ground + "<br>" +
      walk + " km " + (I18N.fromRoad || "") + "<br>" +
      fmtCoord(z.meta.cx, z.meta.cy);
    readout.classList.add("show");
  }

  function runLog(lines, done) {
    logEl.innerHTML = "";
    logEl.classList.add("show");
    var i = 0;
    var step = reduced ? 0 : 150;
    function next() {
      if (i > 0) {
        var prev = logEl.children[i - 1];
        prev.innerHTML += ' <span class="done">· ok</span>';
      }
      if (i >= lines.length) {
        setTimeout(function () { logEl.classList.remove("show"); done(); }, reduced ? 0 : 500);
        return;
      }
      var div = document.createElement("div");
      div.textContent = lines[i];
      logEl.appendChild(div);
      i++;
      setTimeout(next, step);
    }
    next();
  }

  function drawZones(list) {
    svg.classList.remove("zones-in");
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + stage.clientWidth + " " + stage.clientHeight);
    list.forEach(function (z) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", z.d);
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", (I18N.zoneLabel || "zon") + " " + String.fromCharCode(65 + z.idx));
      p.addEventListener("click", function () { showReadout(z); });
      p.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showReadout(z); }
      });
      svg.appendChild(p);
    });
    // zones fade in once, together — a survey result, not a reveal (p.09)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { svg.classList.add("zones-in"); });
    });
    if (countEl) {
      countEl.textContent = list.length + " " + (I18N.zones || "zoner");
    }
  }

  function compute(name) {
    if (running) return;
    running = true;
    readout.classList.remove("show");
    emptyEl.classList.remove("show");
    seedName = name;
    buildFields(name);
    render();
    svg.classList.remove("zones-in");
    svg.innerHTML = "";
    if (countEl) countEl.textContent = "…";
    runLog(I18N.log || [], function () {
      drawZones(computeZones(filtersNow()));
      running = false;
    });
  }

  function recompute() { // filter change: no full log, zones fade out/in
    if (running || !elev) return;
    readout.classList.remove("show");
    svg.classList.remove("zones-in");
    var list = computeZones(filtersNow());
    setTimeout(function () { drawZones(list); }, reduced ? 0 : 420);
  }

  function knownTown(v) {
    v = v.trim().toLowerCase();
    return TOWNS.find(function (t) { return t.toLowerCase() === v; });
  }

  function submitPlace() {
    var v = input.value.trim();
    if (!v) return;
    var t = knownTown(v);
    if (t) { compute(t); }
    else {
      svg.innerHTML = "";
      readout.classList.remove("show");
      if (countEl) countEl.textContent = "0 " + (I18N.zones || "zoner");
      emptyEl.classList.add("show");
    }
  }

  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submitPlace(); });
  input.addEventListener("change", submitPlace);

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
      recompute();
    });
  });

  if (locBtn) {
    locBtn.addEventListener("click", function () {
      if (!navigator.geolocation) return;
      locBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        locBtn.disabled = false;
        var la = pos.coords.latitude, lo = pos.coords.longitude;
        if (la >= BBOX.s && la <= BBOX.n && lo >= BBOX.w && lo <= BBOX.e) {
          input.value = "";
          compute(la.toFixed(2) + "," + lo.toFixed(2));
        } else {
          emptyEl.classList.add("show");
        }
      }, function () { locBtn.disabled = false; });
    });
  }

  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!elev) return;
      render();
      drawZones(computeZones(filtersNow()));
    }, 200);
  });

  // lazy start when the demo scrolls into view
  var started = false;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting && !started) {
        started = true;
        io.disconnect();
        compute(seedName);
      }
    });
  }, { rootMargin: "120px" });
  io.observe(stage);
})();
