(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DEFAULT_BIOMES = [
    { name: 'Tundra', color: '#b5c5ba', tempMin: -20, tempMax: 5, moistureMin: .12, moistureMax: .82, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Taiga', color: '#527b64', tempMin: -10, tempMax: 15, moistureMin: .32, moistureMax: .95, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Temperate forest', color: '#587b54', tempMin: 5, tempMax: 23, moistureMin: .4, moistureMax: .96, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Rainforest', color: '#28775b', tempMin: 18, tempMax: 36, moistureMin: .72, moistureMax: 1, elevationMin: 0, elevationMax: .9, enabled: true },
    { name: 'Grassland', color: '#a7ad64', tempMin: 3, tempMax: 30, moistureMin: .2, moistureMax: .62, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Savanna', color: '#c1a65b', tempMin: 18, tempMax: 38, moistureMin: .12, moistureMax: .55, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Desert', color: '#c89c65', tempMin: 12, tempMax: 45, moistureMin: 0, moistureMax: .34, elevationMin: 0, elevationMax: 1, enabled: true },
    { name: 'Wetlands', color: '#508b83', tempMin: 2, tempMax: 32, moistureMin: .78, moistureMax: 1, elevationMin: 0, elevationMax: .72, enabled: true },
    { name: 'Mediterranean', color: '#9c9b5c', tempMin: 10, tempMax: 34, moistureMin: .28, moistureMax: .7, elevationMin: 0, elevationMax: .82, enabled: true },
    { name: 'Alpine', color: '#d0d4cd', tempMin: -25, tempMax: 12, moistureMin: 0, moistureMax: 1, elevationMin: .58, elevationMax: 1, enabled: true },
    { name: 'Ocean', color: '#315a67', tempMin: -30, tempMax: 45, moistureMin: 0, moistureMax: 1, elevationMin: 0, elevationMax: 1, enabled: true }
  ];
  function createSeed() { const value = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296); return `TERRA-${value.toString(16).toUpperCase().padStart(8, '0')}`; }
  const state = { size: 2017, seed: createSeed(), terrain: 'island', view: 'height', biomes: structuredClone(DEFAULT_BIOMES), distribution: 'natural', climateOffset: 0, temperatureUnit: 'C', features: { rivers: 0, lakes: 0, roads: 0, cities: 0, villages: 0, peaks: 0 }, drawn: [], drawType: 'river', brush: 3, grid: true, zoom: 1, height: null, wet: null, temp: null, biomeMap: null, hoverPoint: null, elevation: null, time: 0, mapName: 'Untitled landscape' };
  const canvas = $('#mapCanvas'), ctx = canvas.getContext('2d', { alpha: false });
  const overlay = $('#overlayCanvas'), octx = overlay.getContext('2d');
  const prof = $('#profileCanvas'), pctx = prof.getContext('2d');
  let SIZE = 384, generationToken = 0, workerRequestId = 0;
  let terrainWorker = null, workerUnavailable = typeof Worker === 'undefined';
  try { if (!workerUnavailable) terrainWorker = new Worker(new URL('terrain-worker.js', document.currentScript.src)); } catch (error) { console.warn('Terrain worker unavailable; using local generation.', error); workerUnavailable = true; }
  const workerWaiters = new Map();
  if (terrainWorker) {
    terrainWorker.addEventListener('message', event => { const waiter = workerWaiters.get(event.data.id); if (!waiter) return; workerWaiters.delete(event.data.id); event.data.error ? waiter.reject(new Error(event.data.error)) : waiter.resolve(event.data.heights); });
    terrainWorker.addEventListener('error', event => { workerUnavailable = true; for (const waiter of workerWaiters.values()) waiter.reject(event.error || new Error(event.message)); workerWaiters.clear(); });
  }
  function workerTerrain(params) {
    return new Promise((resolve, reject) => { const id = ++workerRequestId; workerWaiters.set(id, { resolve, reject }); terrainWorker.postMessage({ ...params, id }); });
  }
  function generateTerrainFallback({ size, seed, terrain, rough, erosion, islandSize, canyonWidth, ridgeStrength }) {
    const heights = new Float32Array(size * size), rng = mulberry32(seed);
    const centers = Array.from({ length: 5 }, () => ({ x: .2 + rng() * .6, y: .2 + rng() * .6, r: .08 + rng() * .17, h: .35 + rng() * .65 }));
    const a = { x: .1 + rng() * .15, y: .1 + rng() * .8 }, b = { x: .75 + rng() * .2, y: .1 + rng() * .8 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = x / (size - 1), ny = y / (size - 1), r = Math.hypot(nx - .5, ny - .5) * 1.414, n = fractal(nx * (4 + rough * 5), ny * (4 + rough * 5), seed), detail = (n - .49) * (.08 + rough * .25); let base = .36, mask = 1;
      switch (terrain) {
        case 'island': case 'archipelago': { let land = Math.max(0, 1 - smooth(.38 / islandSize, .98 / islandSize, r)); if (terrain === 'archipelago') { land = 0; for (const c of centers) land = Math.max(land, c.h * (1 - smooth(c.r * islandSize * .55, c.r * islandSize * 1.55, Math.hypot(nx - c.x, ny - c.y)))); } base = .02 + land * (.52 + .27 * n) + detail; break; }
        case 'canyon': { const d = distToPath(nx, ny, [a, { x: .42, y: .45 }, { x: .67, y: .55 }, b]); base = .24 + smooth(canyonWidth, canyonWidth * 3.2, d) * .62 + detail * 1.2 - .22 * (1 - smooth(canyonWidth * .6, canyonWidth * 1.5, d)); break; }
        case 'highland': base = .3 + smooth(.24, .7, r) * (.2 + ridgeStrength * .55) + .32 - .16 * (1 - smooth(.04, .36, r)) + detail; break;
        case 'volcanic': base = .31 + .42 * smooth(.27, .62, r) - .25 * Math.exp(-Math.pow(r / .28, 2)) + detail; break;
        case 'coastal': base = (.1 + smooth(.08, .9, nx) * .32 + smooth(.2, .75, ny) * .16 + detail) * (mask = smooth(.02, .2, nx)); break;
        case 'plateau': base = .32 + .31 * smooth(.08, .35, n) + .04 * (n - .5) + detail * .55 - .18 * smooth(.65, 1, r); break;
        case 'valley': { const d = Math.abs(ny - (.49 + .09 * Math.sin(nx * 5.4) + .035 * Math.sin(nx * 14))); base = .6 + detail + .2 * n - .33 * (1 - smooth(.025, .21, d)); break; }
        case 'mesa': { let m = 0; for (const c of centers) m = Math.max(m, c.h * (1 - smooth(c.r * .78, c.r * 1.08, Math.hypot(nx - c.x, ny - c.y)))); base = .13 + m * .68 + detail * .7; break; }
        case 'dunes': { const ridge = Math.abs(Math.sin(nx * 35 + ny * 8 + fractal(nx * 2, ny * 2, seed) * 5)); base = .34 + (1 - ridge) * .25 + Math.sin(nx * 8 + ny * 12) * .025 + detail * .3; break; }
        case 'fjord': { const inlet = Math.abs(nx - (.49 + .08 * Math.sin(ny * 5.4) + .025 * Math.sin(ny * 14))); base = .2 + smooth(.012, .115, inlet) * .68 + detail * 1.1; break; }
      }
      const h = clamp((base + detail * .45) * mask); heights[y * size + x] = lerp(h, smooth(.18, .86, h), erosion * .22);
    }
    return heights;
  }
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hashText = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry32 = (a) => () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = (x, y, seed) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
  }
  function fractal(x, y, seed) { let sum = 0, amp = .52, freq = 1, norm = 0; for (let i = 0; i < 5; i++) { sum += noise(x * freq, y * freq, seed + i * 311) * amp; norm += amp; amp *= .52; freq *= 2.03; } return sum / norm; }
  function readSettings() {
    return { peak: +$('#elevation').value, rough: +$('#roughness').value / 100, erosion: +$('#erosion').value / 100, sea: +$('#seaLevel').value / 100, flatten: $('#flattenSettlements').checked, auto: $('#autoFeatures').checked, islandSize: +$('#islandSize').value / 100, canyonWidth: +$('#canyonWidth').value / 100, ridgeStrength: +$('#ridgeStrength').value / 100, quality: +$('#quality').value, climateOffsetC: state.climateOffset, temperatureUnit: state.temperatureUnit };
  }
  const drawHistory = { undo: [], redo: [] };
  function saveDrawHistory() { drawHistory.undo.push(structuredClone(state.drawn)); if (drawHistory.undo.length > 40) drawHistory.undo.shift(); drawHistory.redo.length = 0; syncDrawHistory(); }
  function syncDrawHistory() {
    const undo = $('#undoDraw'), redo = $('#redoDraw'), del = $('#deleteLastDraw');
    if (undo) undo.disabled = !drawHistory.undo.length; if (redo) redo.disabled = !drawHistory.redo.length; if (del) del.disabled = !state.drawn.length;
    const list = $('#drawnFeatureList'); if (list) { list.replaceChildren(); state.drawn.forEach((feature, index) => { const row = document.createElement('div'), label = document.createElement('span'), remove = document.createElement('button'); row.className = 'drawn-feature-row'; label.textContent = `${feature.type} ${index + 1}`; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Delete this drawn feature'; remove.addEventListener('click', () => { saveDrawHistory(); state.drawn.splice(index, 1); syncDrawHistory(); generate(); }); row.append(label, remove); list.appendChild(row); }); }
  }
  function restoreDrawHistory(from, to) { if (!from.length) return; to.push(structuredClone(state.drawn)); state.drawn = from.pop(); syncDrawHistory(); generate(); }
  function distToPath(x, y, pts) {
    let min = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy + 1e-8));
      const px = a.x + dx * t, py = a.y + dy * t;
      min = Math.min(min, Math.hypot(x - px, y - py));
    }
    return min;
  }
  function simplifyPath(points, minDistance = .006) {
    if (points.length <= 2) return points;
    const out = [points[0]]; let last = points[0];
    for (let i = 1; i < points.length - 1; i++) if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistance) { out.push(points[i]); last = points[i]; }
    out.push(points.at(-1)); return out;
  }
  function buildDrainage(height, sea) {
    const count = height.length, filled = new Float32Array(count), parent = new Int32Array(count), seen = new Uint8Array(count);
    parent.fill(-1);
    const heapIds = [], heapLevels = [];
    const push = (id, level) => { let i = heapIds.length; heapIds.push(id); heapLevels.push(level); while (i > 0) { const p = (i - 1) >> 1; if (heapLevels[p] <= level) break; heapIds[i] = heapIds[p]; heapLevels[i] = heapLevels[p]; i = p; } heapIds[i] = id; heapLevels[i] = level; };
    const pop = () => { const id = heapIds[0], level = heapLevels[0], lastId = heapIds.pop(), lastLevel = heapLevels.pop(); if (heapIds.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= heapIds.length) break; if (c + 1 < heapIds.length && heapLevels[c + 1] < heapLevels[c]) c++; if (heapLevels[c] >= lastLevel) break; heapIds[i] = heapIds[c]; heapLevels[i] = heapLevels[c]; i = c; } heapIds[i] = lastId; heapLevels[i] = lastLevel; } return [id, level]; };
    const addOutlet = id => { if (seen[id]) return; seen[id] = 1; filled[id] = Math.min(height[id], sea); push(id, filled[id]); };
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 || height[y * SIZE + x] < sea) addOutlet(y * SIZE + x);
    while (heapIds.length) {
      const [id, level] = pop(), x = id % SIZE, y = (id / SIZE) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue; const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const next = ny * SIZE + nx; if (seen[next]) continue;
        seen[next] = 1; filled[next] = Math.max(height[next], level + .00001); parent[next] = id; push(next, filled[next]);
      }
    }
    return parent;
  }
  function buildRiverPaths(seed, height, sea, terrain, requested = 3) {
    const parent = buildDrainage(height, sea), rand = mulberry32(seed ^ 0x71d3a9), candidates = [];
    const cutoff = Math.min(.88, sea + (terrain === 'dunes' ? .55 : .18));
    for (let y = 3; y < SIZE - 3; y += 2) for (let x = 3; x < SIZE - 3; x += 2) {
      const id = y * SIZE + x, h = height[id]; if (h < cutoff) continue;
      let peak = true; for (let oy = -1; oy <= 1 && peak; oy++) for (let ox = -1; ox <= 1; ox++) if (height[(y + oy) * SIZE + x + ox] > h) { peak = false; break; }
      if (peak) candidates.push({ id, h, rank: rand() });
    }
    candidates.sort((a, b) => b.h - a.h || a.rank - b.rank);
    const paths = [], sources = [], usedCells = new Uint8Array(SIZE * SIZE), desired = requested;
    for (const candidate of candidates) {
      const sx = candidate.id % SIZE, sy = (candidate.id / SIZE) | 0;
      if (sources.some(p => Math.hypot(p.x - sx, p.y - sy) < SIZE * .19)) continue;
      let id = candidate.id, path = [], pathCells = [], steps = 0;
      while (id >= 0 && steps++ < SIZE * 2) {
        const x = id % SIZE, y = (id / SIZE) | 0; path.push({ x: x / (SIZE - 1), y: y / (SIZE - 1) });
        pathCells.push(id);
        if (usedCells[id] && path.length >= 18) break;
        if (height[id] < sea || parent[id] < 0) break;
        id = parent[id];
      }
      if (path.length < 18) continue;
      sources.push({ x: sx, y: sy });
      path.reverse(); const smoothPath = simplifyPath(path, .009);
      paths.push({ type: 'river', pts: smoothPath, width: .0045 + rand() * .0025 });
      for (const cell of pathCells) usedCells[cell] = 1;
      if (paths.length >= desired) break;
    }
    return paths;
  }
  function findDryCell(height, sea, x, y) {
    let best = null, bestCost = Infinity;
    const gx = clamp(Math.round(x * 63), 0, 63), gy = clamp(Math.round(y * 63), 0, 63);
    for (let radius = 0; radius < 22; radius++) for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (radius && Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
      const cx = gx + ox, cy = gy + oy; if (cx < 0 || cy < 0 || cx >= 64 || cy >= 64) continue;
      const wx = cx / 63, wy = cy / 63, ix = Math.round(wx * (SIZE - 1)), iy = Math.round(wy * (SIZE - 1));
      if (height[iy * SIZE + ix] < sea + .025) continue;
      const cost = Math.hypot(wx - x, wy - y) + Math.abs(height[iy * SIZE + ix] - height[Math.round(clamp(y) * (SIZE - 1)) * SIZE + Math.round(clamp(x) * (SIZE - 1))]) * .08;
      if (cost < bestCost) { bestCost = cost; best = { x: wx, y: wy, cx, cy }; }
    }
    return best;
  }
  function routeRoad(height, sea, from, to, seed = 1, avoidAreas = [], rivers = [], allowRiverCrossing = false) {
    const N = 64, total = N * N;
    const areaBlocked = (x, y) => avoidAreas.some(a => !a.hidden && ['lake', 'mountain'].includes(a.type) && Math.hypot(x - a.x, y - a.y) < a.radius * (a.type === 'mountain' ? 1.7 : 1.45) + .012);
    const findRoadCell = (point) => {
      const gx = Math.round(clamp(point.x) * (N - 1)), gy = Math.round(clamp(point.y) * (N - 1));
      for (let radius = 0; radius < N; radius++) {
        let best = null, bestDistance = Infinity;
        for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
          if (radius && Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
          const x = gx + ox, y = gy + oy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const wx = x / 63, wy = y / 63, h = height[Math.round(wy * (SIZE - 1)) * SIZE + Math.round(wx * (SIZE - 1))];
          if (h < sea + .025 || areaBlocked(wx, wy)) continue;
          const d = Math.hypot(ox, oy); if (d < bestDistance) { best = { x: wx, y: wy, cx: x, cy: y }; bestDistance = d; }
        }
        if (best) return best;
      }
      return null;
    };
    const start = findRoadCell(from), goal = findRoadCell(to);
    if (!start || !goal) return [];
    const riverDistance = (x, y) => { let d = Infinity; for (const river of rivers) d = Math.min(d, distToPath(x, y, river.pts)); return d; };
    const source = start.cy * N + start.cx, target = goal.cy * N + goal.cx;
    const cost = new Float32Array(total); cost.fill(Infinity); const parent = new Int32Array(total); parent.fill(-1); const closed = new Uint8Array(total);
    const heap = [], priority = [];
    const heuristic = id => Math.hypot(id % N - target % N, Math.floor(id / N) - Math.floor(target / N));
    const push = (id, score) => { let i = heap.length; heap.push(id); priority.push(score); while (i > 0) { const p = (i - 1) >> 1; if (priority[p] <= score) break; heap[i] = heap[p]; priority[i] = priority[p]; i = p; } heap[i] = id; priority[i] = score; };
    const pop = () => { const id = heap[0], score = priority[0], last = heap.pop(), lastScore = priority.pop(); if (heap.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && priority[c + 1] < priority[c]) c++; if (priority[c] >= lastScore) break; heap[i] = heap[c]; priority[i] = priority[c]; i = c; } heap[i] = last; priority[i] = lastScore; } return [id, score]; };
    cost[source] = 0; push(source, heuristic(source));
    while (heap.length) {
      const [id] = pop(); if (closed[id]) continue; if (id === target) break; closed[id] = 1;
      const x = id % N, y = (id / N) | 0, ix = Math.round(x / 63 * (SIZE - 1)), iy = Math.round(y / 63 * (SIZE - 1)), h0 = height[iy * SIZE + ix];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue; const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const next = ny * N + nx, sx = Math.round(nx / 63 * (SIZE - 1)), sy = Math.round(ny / 63 * (SIZE - 1)), h1 = height[sy * SIZE + sx];
        if (h1 < sea + .01 || closed[next] || areaBlocked(nx / 63, ny / 63)) continue;
        const step = Math.hypot(ox, oy), slope = Math.abs(h1 - h0);
        // Small seeded terrain roughness breaks up the geometric shortest path
        // while preserving a preference for gentle slopes and dry ground.
        const wx = nx / 63, wy = ny / 63, wander = noise(wx * 8, wy * 8, seed) * 2.1;
        const riverClearance = riverDistance(wx, wy);
        if (!allowRiverCrossing && riverClearance < .009) continue;
        const riverPenalty = riverClearance < .018 ? (1 - riverClearance / .018) * (allowRiverCrossing ? 65 : 28) : 0;
        const exposedPeak = h1 > sea + .7 ? (h1 - sea - .7) * 34 : 0;
        const nextCost = cost[id] + step * (1 + slope * 28 + Math.max(0, h1 - h0) * 16 + wander + riverPenalty + exposedPeak);
        if (nextCost < cost[next]) { cost[next] = nextCost; parent[next] = id; push(next, nextCost + heuristic(next)); }
      }
    }
    if (source !== target && parent[target] < 0) return [];
    const path = []; let id = target, guard = 0;
    while (id >= 0 && guard++ < total) { path.push({ x: (id % N) / 63, y: Math.floor(id / N) / 63 }); if (id === source) break; id = parent[id]; }
    if (path.length < 2 || id < 0) return [];
    path.reverse();
    const curved = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      curved.push({ x: lerp(a.x, b.x, .25), y: lerp(a.y, b.y, .25) }, { x: lerp(a.x, b.x, .75), y: lerp(a.y, b.y, .75) });
    }
    curved.push(path.at(-1));
    const valid = point => {
      const ix = Math.round(point.x * (SIZE - 1)), iy = Math.round(point.y * (SIZE - 1));
      return height[iy * SIZE + ix] >= sea + .01 && !areaBlocked(point.x, point.y) && (allowRiverCrossing || riverDistance(point.x, point.y) >= .009);
    };
    let smoothValid = true;
    for (let i = 1; i < curved.length && smoothValid; i++) for (let step = 0; step <= 3; step++) {
      const t = step / 3, point = { x: lerp(curved[i - 1].x, curved[i].x, t), y: lerp(curved[i - 1].y, curved[i].y, t) };
      if (!valid(point)) { smoothValid = false; break; }
    }
    return simplifyPath(smoothValid ? curved : path, .004);
  }
  function buildRoadPaths(seed, height, sea, areas, requested = 1, rivers = []) {
    const rand = mulberry32(seed ^ 0x8b12f3), settlements = areas.filter(a => !a.hidden && ['city', 'village'].includes(a.type));
    const planRoad = (from, to, routeSeed) => routeRoad(height, sea, from, to, routeSeed, areas, rivers) || [];
    const safeRoad = (from, to, routeSeed) => {
      const clear = planRoad(from, to, routeSeed);
      return clear.length ? clear : routeRoad(height, sea, from, to, routeSeed, areas, rivers, true);
    };
    if (!requested) return [];
    if (settlements.length < 2) {
      const loops = [];
      for (let loop = 0; loop < requested; loop++) {
        const anchor = settlements[0] || null, sites = anchor ? [anchor] : [];
        const cx = anchor?.x ?? (.5 + (rand() - .5) * .24), cy = anchor?.y ?? (.5 + (rand() - .5) * .24);
        for (let i = 0; i < 240 && sites.length < 4; i++) {
          const angle = (sites.length / 4) * Math.PI * 2 + rand() * .3, radius = .12 + rand() * .17;
          const x = clamp(cx + Math.cos(angle) * radius, .08, .92), y = clamp(cy + Math.sin(angle) * radius, .08, .92), p = findDryCell(height, sea, x, y);
          if (p && !sites.some(s => Math.hypot(s.x - p.x, s.y - p.y) < .17)) sites.push(p);
        }
        if (sites.length < 4) continue;
        const pts = [];
        for (let i = 0; i < sites.length; i++) {
          const part = safeRoad(sites[i], sites[(i + 1) % sites.length], seed ^ (loop * 977 + i * 131));
          if (!part.length) { pts.length = 0; break; }
          pts.push(...(i ? part.slice(1) : part));
        }
        if (pts.length > 4) loops.push({ type: 'road', pts, width: .0035 });
      }
      return loops;
    }
    const connected = [settlements[0]], remaining = settlements.slice(1), paths = [], linked = new Set();
    while (remaining.length) {
      let choice = -1, nearest = null, best = Infinity;
      for (let i = 0; i < remaining.length; i++) for (const candidate of connected) {
        const d = Math.hypot(remaining[i].x - candidate.x, remaining[i].y - candidate.y);
        if (d < best) { best = d; choice = i; nearest = candidate; }
      }
      const site = remaining.splice(choice, 1)[0];
      const pts = safeRoad(nearest, site, seed ^ paths.length * 977);
      if (pts.length) {
        paths.push({ type: 'road', pts, width: .0035 }); connected.push(site);
        linked.add([nearest, site].map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).sort().join('|'));
      }
    }
    const extraTarget = Math.max(0, requested - paths.length), pairs = [];
    for (let i = 0; i < settlements.length; i++) for (let j = i + 1; j < settlements.length; j++) {
      const key = [settlements[i], settlements[j]].map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).sort().join('|');
      if (!linked.has(key)) pairs.push({ a: settlements[i], b: settlements[j], key, distance: Math.hypot(settlements[i].x - settlements[j].x, settlements[i].y - settlements[j].y) });
    }
    pairs.sort((a, b) => a.distance - b.distance);
    for (const pair of pairs.slice(0, extraTarget)) {
      const pts = safeRoad(pair.a, pair.b, seed ^ (paths.length + 1) * 1973);
      if (pts.length) paths.push({ type: 'road', pts, width: .0035 });
    }
    return paths;
  }
  function makeAutoFeatures(seed) {
    const rand = mulberry32(seed ^ 0x454343);
    const areas = [];
    const nCities = state.features.cities, nVillages = state.features.villages;
    for (let i = 0; i < nCities + nVillages; i++) {
      const village = i >= nCities;
      const x = .22 + rand() * .56, y = .22 + rand() * .56;
      areas.push({ type: village ? 'village' : 'city', x, y, radius: village ? .025 + rand() * .01 : .046 + rand() * .018 });
    }
    for (let i = 0; i < state.features.lakes; i++) areas.push({ type: 'lake', x: .23 + rand() * .54, y: .2 + rand() * .6, radius: .015 + rand() * .018 });
    for (let i = 0; i < state.features.peaks; i++) areas.push({ type: 'mountain', x: .17 + rand() * .66, y: .17 + rand() * .66, radius: .018 + rand() * .025 });
    return { areas };
  }
  function generate() {
    const started = performance.now();
    $('#loading').style.display = 'flex'; $('#statusText').textContent = 'GENERATING';
    const request = ++generationToken;
    requestAnimationFrame(async () => {
      if (request !== generationToken) return;
      const cfg = readSettings(), seed = hashText($('#seed').value || 'TERRA'); state.seed = $('#seed').value || 'TERRA';
      const generationSize = +$('#quality').value;
      const auto = cfg.auto ? makeAutoFeatures(seed) : { areas: [] };
      const features = [...state.drawn]; const areas = [...auto.areas, ...state.drawn.filter(x => ['lake', 'city', 'village', 'mountain'].includes(x.type)).map(x => ({ type: x.type, x: x.x, y: x.y, radius: x.radius || .025 }))];
      const terrainParams = { size: generationSize, seed, terrain: state.terrain, rough: cfg.rough, erosion: cfg.erosion, islandSize: cfg.islandSize, canyonWidth: cfg.canyonWidth, ridgeStrength: cfg.ridgeStrength };
      let heights;
      try { heights = terrainWorker && !workerUnavailable ? await workerTerrain(terrainParams) : generateTerrainFallback(terrainParams); }
      catch (error) { console.warn('Terrain worker failed; retrying locally.', error); try { heights = generateTerrainFallback(terrainParams); workerUnavailable = true; } catch (fallbackError) { if (request === generationToken) { $('#loading').style.display = 'none'; $('#statusText').textContent = 'GENERATION FAILED'; showToast(fallbackError.message || 'Terrain generation failed'); } return; } }
      if (request !== generationToken) return;
      SIZE = generationSize;
      const moisture = new Float32Array(SIZE * SIZE), temp = new Float32Array(SIZE * SIZE);
      const sampleBase = (x, y) => heights[Math.round(clamp(y) * (SIZE - 1)) * SIZE + Math.round(clamp(x) * (SIZE - 1))];
      const isDry = (x, y) => sampleBase(x, y) > cfg.sea + .025;
      const settlements = [], placedAreas = [];
      for (const a of areas) {
        const needsLand = ['city', 'village', 'mountain', 'lake'].includes(a.type);
        const conflicts = (x, y) => placedAreas.some(b => Math.hypot(b.x - x, b.y - y) < (b.radius + a.radius) * 1.22);
        if (!needsLand) continue;
        if (isDry(a.x, a.y) && !conflicts(a.x, a.y)) { placedAreas.push(a); if (['city', 'village'].includes(a.type)) settlements.push(a); continue; }
        let found = null;
        for (let radius = .012; radius <= .85 && !found; radius += .012) {
          const steps = Math.max(16, Math.ceil(radius * SIZE * 6));
          for (let step = 0; step < steps; step++) { const angle = step / steps * Math.PI * 2, x = a.x + Math.cos(angle) * radius, y = a.y + Math.sin(angle) * radius; if (x <= .02 || x >= .98 || y <= .02 || y >= .98 || !isDry(x, y) || conflicts(x, y)) continue; found = { x, y }; break; }
        }
        if (found) { a.x = found.x; a.y = found.y; placedAreas.push(a); if (['city', 'village'].includes(a.type)) settlements.push(a); }
        else a.hidden = true;
      }
      const generatedRivers = cfg.auto && state.features.rivers ? buildRiverPaths(seed, heights, cfg.sea, state.terrain, state.features.rivers) : [];
      features.push(...generatedRivers);
      let generatedRoads = [];
      if (cfg.auto && state.features.roads) {
        generatedRoads = buildRoadPaths(seed, heights, cfg.sea, areas, state.features.roads, features.filter(feature => feature.type === 'river'));
        features.push(...generatedRoads);
      }
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const nx = x / (SIZE - 1), ny = y / (SIZE - 1), idx = y * SIZE + x; let h = heights[idx];
        if (h > cfg.sea) for (const a of areas) {
          if (a.hidden) continue;
          const d = Math.hypot(nx - a.x, ny - a.y), t = Math.exp(-Math.pow(d / a.radius, 2));
          if (a.type === 'mountain') h = clamp(h + t * .28);
          if ((a.type === 'city' || a.type === 'village') && cfg.flatten && t > .01) h = lerp(h, Math.min(.92, Math.max(cfg.sea + .04, .32 + fractal(nx * 4, ny * 4, seed) * .025)), t * .96);
          if (a.type === 'lake' && d < a.radius && !settlements.some(s => Math.hypot(nx - s.x, ny - s.y) < s.radius * 1.25)) h = Math.min(h, cfg.sea * .93);
        }
        if (h > cfg.sea) for (const f of features) if (f.type === 'river') { const d = distToPath(nx, ny, f.pts); const width = f.width || .006; if (d < width * 2.4) { const cut = 1 - smooth(width * .35, width * 2.4, d); h = Math.min(h, lerp(cfg.sea + .015, h, 1 - cut * .8)); } }
        heights[idx] = h;
        moisture[idx] = clamp(.55 + (fractal(nx * 4 + 30, ny * 4 - 9, seed ^ 719) - .5) * .9 - nx * .13);
        temp[idx] = clamp(.92 - Math.abs(ny - .5) * .9 - h * .45 + (fractal(nx * 2, ny * 2, seed ^ 493) - .5) * .12);
      }
      state.height = heights; state.wet = moisture; state.temp = temp; state.featuresGenerated = features; state.areasGenerated = areas; state.elevation = cfg.peak;
      const placedTypeCount = type => auto.areas.filter(a => a.type === type && !a.hidden).length;
      $('#featureStatus').textContent = cfg.auto ? `Placed: rivers ${generatedRivers.length}/${state.features.rivers}, roads ${generatedRoads.length}/${state.features.roads}, lakes ${placedTypeCount('lake')}/${state.features.lakes}, peaks ${placedTypeCount('mountain')}/${state.features.peaks}, cities ${placedTypeCount('city')}/${state.features.cities}, villages ${placedTypeCount('village')}/${state.features.villages}.` : 'Automatic placement is off.';
      assignBiomes(cfg.sea); render(); drawOverlays(); drawProfile(); updateStats();
      state.time = performance.now() - started; $('#generationTime').textContent = `${(state.time / 1000).toFixed(1)}s`; $('#statusText').textContent = 'WORLD READY'; $('#loading').style.display = 'none';
    });
  }
  function assignBiomes(sea) {
    const enabled = state.biomes.filter(b => b.enabled), oceanBiome = enabled.find(b => b.name === 'Ocean'), landBiomes = enabled.filter(b => b.name !== 'Ocean');
    state.biomeMap = new Uint8Array(SIZE * SIZE);
    if (!enabled.length) { state.biomeMap.fill(0); return; }
    const waterIndex = state.biomes.indexOf(oceanBiome || enabled[0]);
    if (state.distribution === 'balanced') {
      const land = [];
      for (let i = 0; i < state.biomeMap.length; i++) {
        if (state.height[i] < sea) state.biomeMap[i] = Math.max(0, waterIndex);
        else land.push(i);
      }
      if (landBiomes.length) {
        const ranked = land.map(i => ({ i, score: (state.temp[i] * 55 - 20 + state.climateOffset) * .42 + state.wet[i] * 25 + (state.height[i] - sea) / Math.max(.01, 1 - sea) * 10 })).sort((a, b) => a.score - b.score);
        const indices = landBiomes.map(b => state.biomes.indexOf(b));
        ranked.forEach((item, rank) => { state.biomeMap[item.i] = indices[Math.min(indices.length - 1, Math.floor(rank / ranked.length * indices.length))]; });
      }
      return;
    }
    for (let i = 0; i < state.biomeMap.length; i++) {
      const h = state.height[i];
      if (h < sea) { state.biomeMap[i] = Math.max(0, waterIndex); continue; }
      const candidates = landBiomes.length ? landBiomes : enabled, tempC = state.temp[i] * 55 - 20 + state.climateOffset, moisture = state.wet[i], landElevation = clamp((h - sea) / Math.max(.01, 1 - sea));
      let bestIndex = state.biomes.indexOf(candidates[0]), bestScore = Infinity;
      for (const biome of candidates) {
        const score = scoreBiomeProfile(biome, tempC, moisture, landElevation);
        if (score < bestScore) { bestScore = score; bestIndex = state.biomes.indexOf(biome); }
      }
      state.biomeMap[i] = Math.max(0, bestIndex);
    }
  }
  const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  function rangeScore(value, min, max, minimumHalfRange) { const center = (min + max) * .5, half = Math.max(minimumHalfRange, (max - min) * .5); return Math.pow((value - center) / half, 2); }
  function scoreBiomeProfile(biome, tempC, moisture, landElevation) {
    const t0 = Number.isFinite(biome.tempMin) ? biome.tempMin : -20, t1 = Number.isFinite(biome.tempMax) ? biome.tempMax : 35;
    const m0 = Number.isFinite(biome.moistureMin) ? biome.moistureMin : 0, m1 = Number.isFinite(biome.moistureMax) ? biome.moistureMax : 1;
    const e0 = Number.isFinite(biome.elevationMin) ? biome.elevationMin : 0, e1 = Number.isFinite(biome.elevationMax) ? biome.elevationMax : 1;
    return rangeScore(tempC, t0, t1, 4) + rangeScore(moisture, m0, m1, .08) * .7 + rangeScore(landElevation, e0, e1, .12) * .85;
  }
  function moistureColor(value) {
    const stops = [[154, 112, 70], [202, 178, 112], [132, 165, 101], [75, 147, 137], [48, 100, 153]], v = clamp(value) * (stops.length - 1), lo = Math.floor(v), hi = Math.min(stops.length - 1, lo + 1), t = v - lo;
    return stops[lo].map((channel, i) => Math.round(channel + (stops[hi][i] - channel) * t));
  }
  function temperatureColor(celsius) {
    const stops = [[42, 63, 140], [55, 137, 180], [93, 166, 126], [199, 194, 103], [222, 136, 70], [174, 66, 54]];
    const shifted = clamp((celsius - (-20 + state.climateOffset)) / 55) * (stops.length - 1), lower = Math.floor(shifted), upper = Math.min(stops.length - 1, lower + 1), t = shifted - lower;
    return stops[lower].map((channel, i) => Math.round(channel + (stops[upper][i] - channel) * t));
  }
  function syncClimateLegend() {
    const isMoisture = state.view === 'moisture', unit = state.temperatureUnit;
    $('#climateLabel').textContent = isMoisture ? 'MOISTURE' : 'TEMPERATURE';
    $('#climateRamp').classList.toggle('moisture-ramp', isMoisture);
    $('#climateRamp').setAttribute('aria-label', isMoisture ? 'Moisture color scale from dry to wet' : 'Temperature color scale from cold to hot');
    $('#climateMin').textContent = isMoisture ? '0%' : `${Math.round(displayTemperature(-20 + state.climateOffset))}°${unit}`;
    $('#climateMax').textContent = isMoisture ? '100%' : `${Math.round(displayTemperature(35 + state.climateOffset))}°${unit}`;
    $('#climateEndLabels').innerHTML = isMoisture ? '<span>Dry</span><span>Wet</span>' : '<span>Cold</span><span>Hot</span>';
  }
  function heightmapValue(elevation, sea) {
    if (sea <= 0) return elevation;
    if (elevation < sea) return .02 + .09 * clamp(elevation / sea);
    return .13 + .87 * clamp((elevation - sea) / Math.max(.0001, 1 - sea));
  }
  function render() {
    if (!state.height) return;
    const mode = state.view, w = canvas.width, h = canvas.height, image = ctx.createImageData(w, h), data = image.data;
    const pal = state.biomes.map(b => hexRgb(b.color)), sea = readSettings().sea, waterLayer = $('[data-layer="water"]').checked, contoursOn = $('[data-layer="contours"]').checked;
    const sun = [-.52, -.34, .78];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / w * SIZE), sy = Math.floor(y / h * SIZE), idx = sy * SIZE + sx, elevation = state.height[idx], biomeIdx = state.biomeMap[idx] || 0;
      const hi = state.height[Math.min(SIZE - 1, sy + 1) * SIZE + sx], hj = state.height[sy * SIZE + Math.min(SIZE - 1, sx + 1)];
      const nx = -(hj - elevation) * 70, ny = -(hi - elevation) * 70, nz = 1, norm = Math.hypot(nx, ny, nz), hillshade = clamp((nx * sun[0] + ny * sun[1] + nz * sun[2]) / norm, .27, 1.3), shade = clamp(.72 + hillshade * .42, .5, 1.15);
      let color;
      if (mode === 'climate') color = temperatureColor(state.temp[idx] * 55 - 20 + state.climateOffset);
      else if (mode === 'moisture') color = moistureColor(state.wet[idx]);
      else if (mode === 'height') { const v = Math.round(heightmapValue(elevation, sea) * 255); color = [v, v, v]; }
      else if (mode === 'biomes') color = pal[biomeIdx] || [90, 120, 90];
      else if (mode === 'texture') {
        if (elevation < sea && waterLayer) color = elevation < sea * .65 ? [37, 76, 93] : [55, 111, 123];
        else color = pal[biomeIdx] || [120, 137, 79];
        const grain = (hash(sx, sy, 9) - .5) * 12; color = color.map(c => clamp((c + grain) * shade, 0, 255));
      } else if (mode === 'relief' && elevation >= sea) {
        color = (pal[biomeIdx] || [120, 137, 79]).map(c => clamp(c * clamp(.56 + hillshade * .72, .52, 1.28), 0, 255));
        if (contoursOn && Math.floor(elevation * 72) !== Math.floor(Math.max(0, elevation - .003) * 72)) color = color.map(c => c * .72);
      } else if (elevation < sea && waterLayer) {
        const depth = clamp(elevation / Math.max(sea, .01)); color = [Math.round(25 + depth * 22), Math.round(60 + depth * 45), Math.round(76 + depth * 49)];
        color = color.map(c => clamp(c * (mode === 'relief' ? .72 + hillshade * .42 : shade), 0, 255));
      } else {
        const v = Math.round(clamp((elevation - sea) / (1 - sea)) * 210 + 34); color = [v, v, v].map(c => clamp(c * shade, 0, 255));
      }
      const p = (y * w + x) * 4; data[p] = color[0]; data[p + 1] = color[1]; data[p + 2] = color[2]; data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const titles = { height: 'HEIGHT FIELD · SEA LEVEL IN GRAYSCALE', relief: 'SHADED RELIEF', biomes: 'BIOME DISTRIBUTION', climate: 'AIR TEMPERATURE', moisture: 'MOISTURE FIELD', texture: 'TERRAIN PREVIEW', profile: 'SIDE PROFILE' };
    $('#captionTitle').textContent = titles[mode];
    $('#climateLegend').hidden = !['climate', 'moisture'].includes(mode);
    syncClimateLegend();
    if (mode === 'profile') drawProfileLarge();
    if (state.hoverPoint) updateBiomeInspector(state.hoverPoint.x, state.hoverPoint.y);
    renderDistribution();
  }
  function updateBiomeInspector(nx, ny) {
    if (!state.height || !state.wet || !state.temp || !state.biomeMap) return;
    const x = Math.round(clamp(nx) * (SIZE - 1)), y = Math.round(clamp(ny) * (SIZE - 1)), index = y * SIZE + x;
    const sea = readSettings().sea, height = state.height[index], tempC = state.temp[index] * 55 - 20 + state.climateOffset, moisture = state.wet[index], elevation = clamp((height - sea) / Math.max(.01, 1 - sea));
    const biomeIndex = state.biomeMap[index] || 0, biome = state.biomes[biomeIndex];
    const swatch = $('#sampleBiome').querySelector('.sample-swatch'); swatch.style.background = biome?.color || '#777';
    $('#sampleBiome').lastElementChild.textContent = biome?.name || 'Unassigned';
    $('#sampleTemperature').textContent = `${Math.round(displayTemperature(tempC))}°${state.temperatureUnit}`;
    $('#sampleMoisture').textContent = `${Math.round(moisture * 100)}%`;
    $('#sampleElevation').textContent = height < sea ? 'Below sea level' : `${Math.round(elevation * 100)}% above sea`;
    $('#sampleHint').textContent = `X ${Math.round(nx * 100)}% · Y ${Math.round(ny * 100)}%`;
    let reason;
    if (height < sea) reason = state.biomes.some(b => b.enabled && b.name === 'Ocean') ? 'Ocean is assigned to every point below the sea-level threshold, regardless of its climate profile.' : 'Ocean is disabled, so below-sea points use the first enabled biome.';
    else if (state.distribution === 'balanced') reason = 'Balanced mode ranks land by temperature, moisture, and elevation, then assigns even shares across the enabled land biomes. This point’s biome follows that quota, not just its closest climate profile.';
    else {
      const candidates = state.biomes.map((candidate, i) => ({ candidate, i, score: scoreBiomeProfile(candidate, tempC, moisture, elevation) })).filter(item => item.candidate.enabled && item.candidate.name !== 'Ocean').sort((a, b) => a.score - b.score);
      const selected = candidates.find(item => item.i === biomeIndex), rank = candidates.findIndex(item => item.i === biomeIndex), next = candidates.find(item => item.i !== biomeIndex);
      reason = selected ? `Natural mode picked the closest enabled land profile. Fit score ${selected.score.toFixed(2)}${next ? `; next closest ${next.candidate.name} (${next.score.toFixed(2)})` : ''}. Lower scores mean a closer match across temperature, moisture, and relative elevation.` : 'This point uses the closest enabled land-biome profile.';
      if (rank > 0 && selected) reason += ` ${rank + 1} of ${candidates.length} by profile fit.`;
    }
    $('#biomeReason').textContent = reason;
    $('#sampleHudBiome').textContent = biome?.name || 'Unassigned';
    $('#sampleHudPosition').textContent = `X ${Math.round(nx * 100)}% · Y ${Math.round(ny * 100)}%`;
    $('#sampleHudTemperature').textContent = `${Math.round(displayTemperature(tempC))}°${state.temperatureUnit}`;
    $('#sampleHudMoisture').textContent = `${Math.round(moisture * 100)}% moisture`;
    $('#sampleHudElevation').textContent = height < sea ? 'Below sea' : `${Math.round(elevation * 100)}% above sea`;
    $('#sampleHudReason').textContent = reason;
    $('#sampleHud').hidden = false;
  }
  function drawProfile() {
    const w = prof.width, h = prof.height; pctx.clearRect(0, 0, w, h); pctx.fillStyle = '#19211b'; pctx.fillRect(0, 0, w, h);
    pctx.strokeStyle = '#344136'; pctx.lineWidth = 1;
    for (let j = 1; j <= 3; j++) { const y = j * h / 4; pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(w, y); pctx.stroke(); }
    const sea = readSettings().sea, plotHeight = h - 12, seaY = h - sea * plotHeight - 4; pctx.fillStyle = '#365966'; pctx.fillRect(0, seaY, w, h - seaY - 4);
    pctx.beginPath();
    for (let x = 0; x < w; x++) { const mapx = Math.floor(x / w * SIZE), value = state.height[Math.floor(SIZE / 2) * SIZE + mapx], y = h - value * plotHeight - 4; x ? pctx.lineTo(x, y) : pctx.moveTo(x, y); }
    pctx.lineTo(w, h); pctx.lineTo(0, h); pctx.closePath(); pctx.fillStyle = '#68866166'; pctx.fill(); pctx.strokeStyle = '#accb91'; pctx.lineWidth = 1.5; pctx.beginPath();
    for (let x = 0; x < w; x++) { const mapx = Math.floor(x / w * SIZE), value = state.height[Math.floor(SIZE / 2) * SIZE + mapx], y = h - value * plotHeight - 4; x ? pctx.lineTo(x, y) : pctx.moveTo(x, y); } pctx.stroke();
    pctx.save(); pctx.setLineDash([4, 4]); pctx.strokeStyle = '#8eb8c1'; pctx.beginPath(); pctx.moveTo(0, seaY); pctx.lineTo(w, seaY); pctx.stroke(); pctx.restore();
    $('#profileMax').textContent = `${state.elevation.toLocaleString()} m`;
  }
  function drawProfileLarge() {
    const w = canvas.width, h = canvas.height, img = ctx.createImageData(w, h), d = img.data;
    d.fill(0); for (let i = 0; i < w * h; i++) { d[i * 4 + 3] = 255; }
    const sea = readSettings().sea, center = Math.floor(SIZE / 2);
    for (let x = 0; x < w; x++) {
      const raw = state.height[center * SIZE + Math.floor(x / w * SIZE)], v = clamp(raw), yline = Math.floor((1 - v) * (h - 48) + 20);
      for (let y = yline; y < h - 25; y++) { const p = (y * w + x) * 4; d[p] = 94 + Math.min(40, Math.round(v * 40)); d[p + 1] = 128 + Math.min(45, Math.round(v * 45)); d[p + 2] = 86; }
      const p = (yline * w + x) * 4; d[p] = 192; d[p + 1] = 220; d[p + 2] = 166;
    }
    const waterY = Math.floor((1 - sea) * (h - 48) + 20); for (let y = waterY; y < h - 25; y++) for (let x = 0; x < w; x++) { const v = state.height[center * SIZE + Math.floor(x / w * SIZE)]; if (v < sea) { const p = (y * w + x) * 4; d[p] = 47; d[p + 1] = 104; d[p + 2] = 122; } }
    ctx.putImageData(img, 0, 0); ctx.save(); ctx.strokeStyle = '#6c8b71'; ctx.beginPath(); ctx.moveTo(0, h - 24); ctx.lineTo(w, h - 24); ctx.stroke(); ctx.setLineDash([7, 5]); ctx.strokeStyle = '#a9ced4'; ctx.beginPath(); ctx.moveTo(0, waterY); ctx.lineTo(w, waterY); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#d4e3df'; ctx.font = '10px sans-serif'; ctx.fillText('SEA LEVEL', 12, Math.max(14, waterY - 6)); ctx.restore();
  }
  function drawOverlays() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (!state.featuresGenerated || state.view === 'profile') return;
    if (state.grid) {
      octx.strokeStyle = '#d4e4d22c'; octx.lineWidth = 1; octx.setLineDash([3, 5]);
      for (let i = 1; i < 4; i++) { const p = overlay.width * i / 4; octx.beginPath(); octx.moveTo(p, 0); octx.lineTo(p, overlay.height); octx.stroke(); octx.beginPath(); octx.moveTo(0, p); octx.lineTo(overlay.width, p); octx.stroke(); }
      octx.setLineDash([]); octx.strokeStyle = '#d4e4d247'; octx.strokeRect(.5, .5, overlay.width - 1, overlay.height - 1);
    }
    const landSegments = (pts) => {
      const segments = []; let active = null;
      const land = p => { const x = Math.round(clamp(p.x) * (SIZE - 1)), y = Math.round(clamp(p.y) * (SIZE - 1)); return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && state.height[y * SIZE + x] >= readSettings().sea; };
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * SIZE * 1.5));
        for (let j = 0; j <= steps; j++) { const t = j / steps, p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; if (land(p)) { if (!active) { active = [p]; segments.push(active); } else active.push(p); } else active = null; }
      }
      return segments.filter(segment => segment.length > 1);
    };
    // Feature colors are annotations for terrain-style previews only. Keep the
    // height field grayscale and biome classification unobstructed.
    const showFeatures = ['relief', 'texture'].includes(state.view) && $('[data-layer="features"]').checked;
    if (showFeatures) for (const f of state.featuresGenerated) {
      if (!f.pts || f.pts.length < 2) continue;
      const segments = f.type === 'river' || f.type === 'road' ? landSegments(f.pts) : [f.pts];
      for (const segment of segments) { octx.beginPath(); segment.forEach((p, i) => i ? octx.lineTo(p.x * overlay.width, p.y * overlay.height) : octx.moveTo(p.x * overlay.width, p.y * overlay.height));
        if (f.type === 'river') { octx.strokeStyle = '#74bcd4e8'; octx.lineWidth = Math.max(2, (f.width || .006) * overlay.width * 1.8); octx.lineCap = 'round'; octx.stroke(); }
        if (f.type === 'road') { octx.lineCap = 'round'; octx.lineJoin = 'round'; octx.setLineDash([]); octx.strokeStyle = '#24251edb'; octx.lineWidth = Math.max(4, f.width * overlay.width + 2); octx.stroke(); octx.strokeStyle = '#d4b788e8'; octx.lineWidth = Math.max(1.5, f.width * overlay.width); octx.stroke(); }
      }
    }
    if (showFeatures) for (const a of state.areasGenerated || []) {
      if (a.hidden) continue;
      const x = a.x * overlay.width, y = a.y * overlay.height, r = a.radius * overlay.width;
      if (a.type === 'lake') { octx.fillStyle = '#65a9cbbb'; octx.beginPath(); octx.ellipse(x, y, r * 1.2, r * .85, -.35, 0, Math.PI * 2); octx.fill(); }
      if (a.type === 'city' || a.type === 'village') { octx.fillStyle = a.type === 'city' ? '#dab782' : '#b8c98b'; octx.strokeStyle = '#18231ae0'; octx.lineWidth = 2; octx.beginPath(); octx.arc(x, y, Math.max(4, r * .36), 0, Math.PI * 2); octx.fill(); octx.stroke(); }
      if (a.type === 'mountain') { octx.fillStyle = '#d7d4c3b8'; octx.beginPath(); octx.moveTo(x, y - r * .75); octx.lineTo(x - r * .55, y + r * .4); octx.lineTo(x + r * .55, y + r * .4); octx.closePath(); octx.fill(); }
    }
  }
  function updateStats() {
    const sea = readSettings().sea, total = SIZE * SIZE, water = state.height.reduce((n, v) => n + (v < sea ? 1 : 0), 0) / total;
    const sideKm = ({ 505: 1, 1009: 2, 2017: 4, 4033: 8 })[state.size] || 4;
    const rawPeak = state.height.reduce((max, value) => Math.max(max, value), 0), exportedPeak = Math.round(heightmapValue(rawPeak, sea) * state.elevation);
    $('#heightStat').textContent = `${exportedPeak.toLocaleString()} m`; $('#profileMax').textContent = `${exportedPeak.toLocaleString()} m`; $('#waterStat').textContent = `${Math.round(water * 100)}%`; $('#areaStat').textContent = `${(sideKm * sideKm * (1 - water)).toFixed(1)} km²`; $('#seedStat').textContent = state.seed; $('#captionDimensions').textContent = `${state.size} × ${state.size} px`;
    renderDistribution();
  }
  function renderDistribution() {
    if (!state.biomeMap) return;
    const counts = new Array(state.biomes.length).fill(0); for (const id of state.biomeMap) counts[id]++;
    const total = state.biomeMap.length; const list = $('#distributionList'); list.innerHTML = '';
    state.biomes.forEach((b, i) => { const pct = counts[i] / total * 100; const badge = $(`#biomePct${i}`); if (badge) badge.textContent = `${Math.round(pct)}%`; if (!b.enabled) return; const row = document.createElement('div'); row.className = 'distribution-row'; row.innerHTML = `<span class="distribution-swatch" style="background:${b.color}"></span><span>${b.name}</span><span class="distribution-percent">${Math.round(pct)}%</span>`; list.appendChild(row); });
  }
  function displayTemperature(celsius) { return state.temperatureUnit === 'C' ? celsius : celsius * 9 / 5 + 32; }
  function refreshBiomeProfile(index) {
    const biome = state.biomes[index], profile = $$('.biome-profile')[index];
    if (!biome || !profile) return;
    const shown = {
      tempMin: Math.round(displayTemperature(biome.tempMin)), tempMax: Math.round(displayTemperature(biome.tempMax)),
      moistureMin: Math.round(biome.moistureMin * 100), moistureMax: Math.round(biome.moistureMax * 100),
      elevationMin: Math.round(biome.elevationMin * 100), elevationMax: Math.round(biome.elevationMax * 100)
    };
    for (const [field, value] of Object.entries(shown)) profile.querySelector(`[data-profile="${field}"]`).value = value;
    for (const [group, minField, maxField, lower, upper] of [
      ['temperature', 'tempMin', 'tempMax', state.temperatureUnit === 'C' ? -80 : -112, state.temperatureUnit === 'C' ? 55 : 131],
      ['moisture', 'moistureMin', 'moistureMax', 0, 100], ['elevation', 'elevationMin', 'elevationMax', 0, 100]
    ]) {
      const pair = profile.querySelector(`[data-range-pair="${group}"]`), minInput = pair.querySelector(`[data-profile="${minField}"]`), maxInput = pair.querySelector(`[data-profile="${maxField}"]`);
      minInput.value = shown[minField]; maxInput.value = shown[maxField];
      minInput.min = maxInput.min = lower; minInput.max = maxInput.max = upper;
      const range = Math.max(1, upper - lower);
      pair.style.setProperty('--range-start', `${(shown[minField] - lower) / range * 100}%`);
      pair.style.setProperty('--range-end', `${(shown[maxField] - lower) / range * 100}%`);
      const suffix = group === 'temperature' ? `°${state.temperatureUnit}` : '%';
      pair.closest('.profile-range-group').querySelector('.profile-range-heading output').textContent = `${shown[minField]}${suffix} – ${shown[maxField]}${suffix}`;
    }
    profile.querySelector('summary').textContent = `${shown.tempMin}°–${shown.tempMax}°${state.temperatureUnit} · ${shown.moistureMin}–${shown.moistureMax}% moisture`;
  }
  function setBiomeProfileValue(field, index, value) {
    const biome = state.biomes[index];
    if (!biome || !Number.isFinite(value)) return false;
    biome[field] = field.startsWith('temp') ? (state.temperatureUnit === 'C' ? value : (value - 32) * 5 / 9) : value / 100;
    if (field === 'tempMin' && biome.tempMin > biome.tempMax) biome.tempMax = biome.tempMin;
    if (field === 'tempMax' && biome.tempMax < biome.tempMin) biome.tempMin = biome.tempMax;
    if (field === 'moistureMin' && biome.moistureMin > biome.moistureMax) biome.moistureMax = biome.moistureMin;
    if (field === 'moistureMax' && biome.moistureMax < biome.moistureMin) biome.moistureMin = biome.moistureMax;
    if (field === 'elevationMin' && biome.elevationMin > biome.elevationMax) biome.elevationMax = biome.elevationMin;
    if (field === 'elevationMax' && biome.elevationMax < biome.elevationMin) biome.elevationMin = biome.elevationMax;
    return true;
  }
  function syncBiomeCollapseButton() {
    const profiles = $$('.biome-profile'), allOpen = profiles.length > 0 && profiles.every(profile => profile.open), button = $('#collapseBiomes');
    button.textContent = allOpen ? 'Collapse all' : 'Expand all'; button.setAttribute('aria-expanded', String(allOpen));
  }
  function buildBiomeControls() {
    const list = $('#biomeList'), openProfiles = new Set([...list.querySelectorAll('.biome-profile')].flatMap((profile, index) => profile.open ? [index] : []));
    list.replaceChildren();
    const activeCount = state.biomes.filter(b => b.enabled).length;
    state.biomes.forEach((b, i) => {
      const entry = document.createElement('div'), row = document.createElement('div'); entry.className = 'biome-entry'; row.className = 'biome-row';
      row.innerHTML = `<input type="color" aria-label="${b.name} biome color" value="${b.color}" data-color="${i}"><span class="biome-name">${b.name}</span><span class="biome-percent" id="biomePct${i}">—</span><input class="biome-enabled" type="checkbox" aria-label="Enable ${b.name}" title="${b.enabled && activeCount === 1 ? 'At least one biome must stay enabled' : ''}" ${b.enabled ? 'checked' : ''} ${b.enabled && activeCount === 1 ? 'disabled' : ''} data-enabled="${i}">${state.biomes.length > 1 ? `<button class="remove-biome" title="Remove ${b.name}" data-remove="${i}">×</button>` : '<span></span>'}`;
      const t0 = Math.round(displayTemperature(Number.isFinite(b.tempMin) ? b.tempMin : -20)), t1 = Math.round(displayTemperature(Number.isFinite(b.tempMax) ? b.tempMax : 35));
      const tempMin = state.temperatureUnit === 'C' ? -80 : -112, tempMax = state.temperatureUnit === 'C' ? 55 : 131;
      const profile = document.createElement('details'); profile.className = 'biome-profile'; profile.open = openProfiles.has(i);
      profile.innerHTML = `<summary>${t0}°–${t1}°${state.temperatureUnit} · ${Math.round((b.moistureMin ?? 0) * 100)}–${Math.round((b.moistureMax ?? 1) * 100)}% moisture</summary><div class="biome-profile-grid"><div class="profile-range-group"><div class="profile-range-heading"><span>Temperature</span><output>${t0}°–${t1}°${state.temperatureUnit}</output></div><div class="biome-range-pair" data-range-pair="temperature"><input type="range" class="range-min" aria-label="${b.name} minimum temperature" min="${tempMin}" max="${tempMax}" step="1" data-profile="tempMin" data-index="${i}" value="${t0}"><input type="range" class="range-max" aria-label="${b.name} maximum temperature" min="${tempMin}" max="${tempMax}" step="1" data-profile="tempMax" data-index="${i}" value="${t1}"></div><div class="range-endpoints"><span>${tempMin}°${state.temperatureUnit}</span><span>${tempMax}°${state.temperatureUnit}</span></div></div><div class="profile-range-group"><div class="profile-range-heading"><span>Moisture</span><output>${Math.round((b.moistureMin ?? 0) * 100)}–${Math.round((b.moistureMax ?? 1) * 100)}%</output></div><div class="biome-range-pair" data-range-pair="moisture"><input type="range" class="range-min" aria-label="${b.name} minimum moisture" min="0" max="100" step="1" data-profile="moistureMin" data-index="${i}" value="${Math.round((b.moistureMin ?? 0) * 100)}"><input type="range" class="range-max" aria-label="${b.name} maximum moisture" min="0" max="100" step="1" data-profile="moistureMax" data-index="${i}" value="${Math.round((b.moistureMax ?? 1) * 100)}"></div><div class="range-endpoints"><span>0%</span><span>100%</span></div></div><div class="profile-range-group"><div class="profile-range-heading"><span>Elevation</span><output>${Math.round((b.elevationMin ?? 0) * 100)}–${Math.round((b.elevationMax ?? 1) * 100)}%</output></div><div class="biome-range-pair" data-range-pair="elevation"><input type="range" class="range-min" aria-label="${b.name} minimum elevation" min="0" max="100" step="1" data-profile="elevationMin" data-index="${i}" value="${Math.round((b.elevationMin ?? 0) * 100)}"><input type="range" class="range-max" aria-label="${b.name} maximum elevation" min="0" max="100" step="1" data-profile="elevationMax" data-index="${i}" value="${Math.round((b.elevationMax ?? 1) * 100)}"></div><div class="range-endpoints"><span>0%</span><span>100%</span></div></div></div>`;
      profile.addEventListener('toggle', syncBiomeCollapseButton);
      entry.append(row, profile); list.appendChild(entry);
      refreshBiomeProfile(i);
    });
    $('#biomeCount').textContent = `${activeCount} active`;
    $('#addBiome').disabled = state.biomes.length >= 32;
    syncBiomeCollapseButton();
    let biomeRenderTimer;
    list.oninput = e => {
      const colorIndex = e.target.dataset.color;
      if (colorIndex !== undefined) { state.biomes[+colorIndex].color = e.target.value; if (state.height) { assignBiomes(readSettings().sea); render(); } return; }
      const field = e.target.dataset.profile, index = +e.target.dataset.index;
      if (!field || !Number.isFinite(index) || !setBiomeProfileValue(field, index, +e.target.value)) return;
      refreshBiomeProfile(index);
      clearTimeout(biomeRenderTimer); biomeRenderTimer = setTimeout(() => { if (state.height) { assignBiomes(readSettings().sea); render(); } }, 90);
    };
    list.onchange = e => {
      const en = e.target.dataset.enabled;
      if (en !== undefined) { state.biomes[+en].enabled = e.target.checked; buildBiomeControls(); if (state.height) { assignBiomes(readSettings().sea); render(); } return; }
    };
    list.onclick = e => { const rm = e.target.dataset.remove; if (rm !== undefined && state.biomes.length > 1) { state.biomes.splice(+rm, 1); buildBiomeControls(); if (state.height) { assignBiomes(readSettings().sea); render(); } } };
  }
  function syncSliders() {
    const v = { elevation: [`${(+$('#elevation').value).toLocaleString()} m`, 500, 4500], roughness: [`${$('#roughness').value}%`, 5, 100], erosion: [`${$('#erosion').value}%`, 0, 100], seaLevel: [`${$('#seaLevel').value}%`, 0, 65], islandSize: [`${$('#islandSize').value}%`, 65, 145], canyonWidth: [`${$('#canyonWidth').value}%`, 5, 20], ridgeStrength: [`${$('#ridgeStrength').value}%`, 0, 100] };
    for (const [id, [label, min, max]] of Object.entries(v)) { $(`#${id}Value`).textContent = label; const el = $(`#${id}`); el.style.setProperty('--fill', `${(+el.value - min) / (max - min) * 100}%`); }
    $('#sizeValue').textContent = `${state.size} × ${state.size}`;
  }
  function syncClimateControl() {
    const input = $('#climateTemp'), displayValue = displayTemperature(state.climateOffset), unit = state.temperatureUnit;
    input.min = unit === 'C' ? -15 : -27; input.max = unit === 'C' ? 15 : 27; input.step = unit === 'C' ? 1 : 1; input.value = Math.round(displayValue);
    $('#climateTempValue').textContent = `${displayValue > 0 ? '+' : ''}${Math.round(displayValue)} °${unit} shift`;
    $('#temperatureUnit').textContent = `°${unit}`; input.style.setProperty('--fill', `${((+input.value - +input.min) / (+input.max - +input.min)) * 100}%`);
  }
  let regenerateTimer;
  function scheduleGenerate() { clearTimeout(regenerateTimer); regenerateTimer = setTimeout(generate, 180); }
  function normalizeSeed() { const input = $('#seed'); input.value = input.value.trim().replace(/\s+/g, '-').slice(0, 48) || 'TERRA-000001'; return input.value; }
  function randomizeSeed() { $('#seed').value = createSeed(); generate(); }
  async function copySeed() {
    const value = normalizeSeed();
    if (value !== state.seed) generate();
    try { await navigator.clipboard.writeText(value); showToast('Seed copied'); }
    catch { const input = $('#seed'); input.focus(); input.select(); document.execCommand('copy'); input.setSelectionRange(input.value.length, input.value.length); showToast('Seed copied'); }
  }
  function showToast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => t.classList.remove('show'), 2400); }
  function pointerPos(e) { const r = overlay.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }; }
  let drawing = false, currentStroke = null, movingDraw = null;
  overlay.addEventListener('pointerdown', e => {
    if (!$('#drawPanel').classList.contains('open')) return;
    const point = pointerPos(e);
    if (state.drawType === 'select') {
      let best = -1, distance = .035;
      state.drawn.forEach((feature, index) => { const d = Number.isFinite(feature.x) && Number.isFinite(feature.y) ? Math.hypot(point.x - feature.x, point.y - feature.y) : distToPath(point.x, point.y, feature.pts || []); const limit = Math.max(distance, feature.radius || feature.width || 0); if (d <= limit) { best = index; distance = d; } });
      if (best >= 0) { movingDraw = { index: best, last: point, snapshot: structuredClone(state.drawn), changed: false }; overlay.setPointerCapture(e.pointerId); drawing = true; }
      return;
    }
    drawing = true; overlay.setPointerCapture(e.pointerId); currentStroke = { type: state.drawType, pts: [point], width: state.brush / 100, radius: state.brush / 100 * .7 }; if (['lake', 'city', 'village', 'mountain'].includes(state.drawType)) { currentStroke.x = point.x; currentStroke.y = point.y; currentStroke.pts.push({ ...point }); } drawCurrent();
  });
  overlay.addEventListener('pointermove', e => {
    if (!drawing) return; const p = pointerPos(e);
    if (movingDraw) { const feature = state.drawn[movingDraw.index], dx = p.x - movingDraw.last.x, dy = p.y - movingDraw.last.y; if (dx || dy) movingDraw.changed = true; if (Number.isFinite(feature.x)) { feature.x = clamp(feature.x + dx); feature.y = clamp(feature.y + dy); } feature.pts = (feature.pts || []).map(pt => ({ x: clamp(pt.x + dx), y: clamp(pt.y + dy) })); movingDraw.last = p; drawOverlays(); return; }
    if (!currentStroke) return;
    if (['lake', 'city', 'village', 'mountain'].includes(currentStroke.type)) { const start = currentStroke.pts[0]; currentStroke.radius = Math.max(.012, Math.hypot(start.x - p.x, start.y - p.y)); currentStroke.x = start.x; currentStroke.y = start.y; } else currentStroke.pts.push(p); drawCurrent();
  });
  overlay.addEventListener('pointerup', () => {
    if (!drawing) return; drawing = false;
    if (movingDraw) { if (movingDraw.changed) { drawHistory.undo.push(movingDraw.snapshot); drawHistory.redo.length = 0; syncDrawHistory(); generate(); } movingDraw = null; return; }
    if (!currentStroke) return; if (currentStroke.pts.length < 2) currentStroke.pts.push({ ...currentStroke.pts[0] }); saveDrawHistory(); state.drawn.push(currentStroke); currentStroke = null; syncDrawHistory(); generate();
  });
  function drawCurrent() { drawOverlays(); if (!currentStroke || !['relief', 'texture'].includes(state.view)) return; const f = currentStroke; octx.beginPath(); f.pts.forEach((p, i) => i ? octx.lineTo(p.x * overlay.width, p.y * overlay.height) : octx.moveTo(p.x * overlay.width, p.y * overlay.height)); if (f.pts.length === 1) { const p = f.pts[0]; octx.arc(p.x * overlay.width, p.y * overlay.height, f.radius * overlay.width, 0, Math.PI * 2); octx.fillStyle = '#b5d5a480'; octx.fill(); } else { octx.strokeStyle = f.type === 'river' ? '#74bcd4' : '#d4b788'; octx.lineWidth = Math.max(3, f.width * overlay.width); octx.lineCap = 'round'; octx.stroke(); } }

  async function compress(data) { const cs = new CompressionStream('deflate'); const writer = cs.writable.getWriter(); writer.write(data); writer.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  function crc32(buf) { let c = -1; for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ -1) >>> 0; }
  function be32(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
  function chunk(type, bytes) { const name = new TextEncoder().encode(type), crcInput = new Uint8Array(name.length + bytes.length); crcInput.set(name); crcInput.set(bytes, name.length); return new Uint8Array([...be32(bytes.length), ...name, ...bytes, ...be32(crc32(crcInput))]); }
  async function png16(width, height, pixels) {
    const raw = new Uint8Array(height * (1 + width * 2)); let q = 0;
    for (let y = 0; y < height; y++) { raw[q++] = 0; for (let x = 0; x < width; x++) { const v = pixels[y * width + x]; raw[q++] = v >> 8; raw[q++] = v & 255; } }
    const compressed = await compress(raw), ihdr = new Uint8Array([...be32(width), ...be32(height), 16, 0, 0, 0, 0]);
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())], { type: 'image/png' });
  }
  async function png24(width, height, pixels) {
    const raw = new Uint8Array(height * (1 + width * 3)); let q = 0;
    for (let y = 0; y < height; y++) { raw[q++] = 0; for (let x = 0; x < width; x++) { const src = (y * width + x) * 3; raw[q++] = pixels[src]; raw[q++] = pixels[src + 1]; raw[q++] = pixels[src + 2]; } }
    const compressed = await compress(raw), ihdr = new Uint8Array([...be32(width), ...be32(height), 8, 2, 0, 0, 0]);
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())], { type: 'image/png' });
  }
  async function png8Gray(width, height, pixels) {
    const raw = new Uint8Array(height * (1 + width)); let q = 0;
    for (let y = 0; y < height; y++) { raw[q++] = 0; raw.set(pixels.subarray(y * width, (y + 1) * width), q); q += width; }
    const compressed = await compress(raw), ihdr = new Uint8Array([...be32(width), ...be32(height), 8, 0, 0, 0, 0]);
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())], { type: 'image/png' });
  }
  function rasterFeatureMask(feature, width, height, pixels = new Uint8Array(width * height)) {
    const stamp = (cx, cy, rx, ry = rx) => {
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(width - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(height - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.pow((x - cx) / Math.max(1, rx), 2) + Math.pow((y - cy) / Math.max(1, ry), 2) <= 1) pixels[y * width + x] = 255;
    };
    if (['river', 'road'].includes(feature.type) && feature.pts?.length > 1) {
      const radius = Math.max(1, (feature.width || (feature.type === 'river' ? .006 : .0035)) * width * (feature.type === 'river' ? 2.4 : .5));
      for (let i = 1; i < feature.pts.length; i++) {
        const a = feature.pts[i - 1], b = feature.pts[i], ax = a.x * (width - 1), ay = a.y * (height - 1), bx = b.x * (width - 1), by = b.y * (height - 1);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let step = 0; step <= steps; step++) { const t = step / steps; stamp(ax + (bx - ax) * t, ay + (by - ay) * t, radius); }
      }
    } else if (Number.isFinite(feature.x) && Number.isFinite(feature.y)) {
      const rx = Math.max(1, (feature.radius || .025) * width), ry = Math.max(1, (feature.radius || .025) * height);
      stamp(feature.x * (width - 1), feature.y * (height - 1), rx, ry);
    }
    return pixels;
  }
  function assetSlug(value) { return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer'; }
  async function biomeMaskFiles(width, height, base) {
    const files = [], pixelBiomes = new Uint8Array(width * height), present = new Set();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const index = y * width + x, biomeIndex = sampleBiome(x, y); pixelBiomes[index] = biomeIndex; present.add(biomeIndex); }
    for (const biomeIndex of present) {
      const biome = state.biomes[biomeIndex], mask = new Uint8Array(width * height);
      for (let i = 0; i < pixelBiomes.length; i++) if (pixelBiomes[i] === biomeIndex) mask[i] = 255;
      const name = `${base}-mask-biome-${assetSlug(biome.name)}-${width}x${height}.png`;
      files.push({ blob: await png8Gray(width, height, mask), name, manifest: { file: name, kind: 'biome-weight-mask', biome: biome.name, color: biome.color, bitDepth: 8, channels: 'grayscale; 0=outside, 255=inside', width, height } });
    }
    return files;
  }
  async function featureMaskFiles(width, height, base) {
    const features = [
      ...(state.featuresGenerated || []).filter(f => ['river', 'road'].includes(f.type)),
      ...(state.areasGenerated || []).filter(f => !f.hidden && ['lake', 'mountain', 'city', 'village'].includes(f.type))
    ];
    const byType = new Map();
    for (const feature of features) {
      if (!byType.has(feature.type)) byType.set(feature.type, []);
      byType.get(feature.type).push(feature);
    }
    const files = [];
    for (const [type, instances] of byType) {
      const combined = new Uint8Array(width * height);
      for (const feature of instances) rasterFeatureMask(feature, width, height, combined);
      const name = `${base}-mask-${type}-${width}x${height}.png`;
      files.push({ blob: await png8Gray(width, height, combined), name, manifest: { file: name, kind: 'feature-mask', featureType: type, bitDepth: 8, channels: 'grayscale; 0=outside, 255=inside', instancesCombined: instances.length, width, height } });
    }
    return files;
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  async function zipStore(files) {
    const enc = new TextEncoder(), chunks = [], central = []; let offset = 0;
    const u16 = n => [n & 255, n >>> 8 & 255], u32 = n => [n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255];
    for (const file of files) {
      const name = enc.encode(file.name), data = new Uint8Array(await file.blob.arrayBuffer()), crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data]); chunks.push(local);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
      offset += local.length;
    }
    const centralSize = central.reduce((n, x) => n + x.length, 0), end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }
  function sampleHeight(x, y) { const fx = x / (state.size - 1) * (SIZE - 1), fy = y / (state.size - 1) * (SIZE - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(SIZE - 1, x0 + 1), y1 = Math.min(SIZE - 1, y0 + 1), tx = fx - x0, ty = fy - y0; return lerp(lerp(state.height[y0 * SIZE + x0], state.height[y0 * SIZE + x1], tx), lerp(state.height[y1 * SIZE + x0], state.height[y1 * SIZE + x1], tx), ty); }
  function sampleBiome(x, y) { const ix = Math.floor(x / (state.size - 1) * (SIZE - 1)), iy = Math.floor(y / (state.size - 1) * (SIZE - 1)); return state.biomeMap[iy * SIZE + ix] || 0; }
  async function exportFiles() {
    if (!$('#exportHeight').checked && !$('#exportBiome').checked && !$('#exportMasks').checked && !$('#exportConfig').checked && !$('#exportUnreal').checked) { showToast('Choose at least one file to export'); return; }
    const w = state.size, h = w, base = (state.mapName || 'landscape').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'landscape'; $('#statusText').textContent = 'EXPORTING'; $('#confirmExport').disabled = true;
    try {
      const files = [];
      if ($('#exportHeight').checked) { const pixels = new Uint16Array(w * h), sea = readSettings().sea, linear = $('#linearHeight').checked, name = `${base}-height-${linear ? 'linear-' : ''}${w}x${h}.png`; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const elevation = sampleHeight(x, y); pixels[y * w + x] = Math.round((linear ? elevation : heightmapValue(elevation, sea)) * 65535); } files.push({ blob: await png16(w, h, pixels), name, manifest: { file: name, kind: 'heightmap', bitDepth: 16, channels: 'grayscale', encoding: linear ? 'linear normalized terrain elevation 0..1' : 'sea-emphasized display elevation', width: w, height: h } }); }
      if ($('#exportBiome').checked) { const rgb = new Uint8Array(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = hexRgb(state.biomes[sampleBiome(x, y)]?.color || '#777777'), i = (y * w + x) * 3; rgb.set(c, i); } const name = `${base}-biomes-${w}x${h}.png`; files.push({ blob: await png24(w, h, rgb), name, manifest: { file: name, kind: 'biome-color-map', bitDepth: 24, channels: 'RGB; biome colors listed in biomePalette', width: w, height: h } }); }
      if ($('#exportMasks').checked) {
        files.push(...await biomeMaskFiles(w, h, base));
        files.push(...await featureMaskFiles(w, h, base));
      }
      if ($('#exportConfig').checked) { const cfg = { name: state.mapName, seed: state.seed, size: w, terrain: state.terrain, distribution: state.distribution, settings: readSettings(), biomes: state.biomes, features: state.features, drawnFeatures: state.drawn }; files.push({ blob: new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), name: `${base}-settings.json`, manifest: { file: `${base}-settings.json`, kind: 'world-settings', width: w, height: h } }); }
      if ($('#exportUnreal').checked) {
        const quads = w - 1, sectionSizeQuads = 63, sectionsPerComponent = 4, componentQuads = sectionSizeQuads * 2, componentsPerSide = quads / componentQuads;
        const worldKm = ({ 505: 1, 1009: 2, 2017: 4, 4033: 8 })[w] || 4, worldWidthM = worldKm * 1000, xyScaleCm = worldWidthM * 100 / quads;
        let minNormalizedHeight = 1, maxNormalizedHeight = 0;
        for (const value of state.height) { if (value < minNormalizedHeight) minNormalizedHeight = value; if (value > maxNormalizedHeight) maxNormalizedHeight = value; }
        const linearHeight = $('#linearHeight').checked, seaLevel = readSettings().sea;
        const exportedMinHeight = linearHeight ? minNormalizedHeight : heightmapValue(minNormalizedHeight, seaLevel), exportedMaxHeight = linearHeight ? maxNormalizedHeight : heightmapValue(maxNormalizedHeight, seaLevel);
        const verticalRangeMeters = (exportedMaxHeight - exportedMinHeight) * state.elevation, zScale = verticalRangeMeters * 100 / 512;
        const biomePalette = state.biomes.map((b, index) => ({ index, name: b.name, color: b.color, enabled: b.enabled }));
        const preset = { schemaVersion: 1, application: 'Terra Heightmap Studio', unreal: { landscapeResolution: `${w}x${h}`, sectionSizeQuads, sectionsPerComponent, components: `${componentsPerSide}x${componentsPerSide}`, totalComponents: componentsPerSide * componentsPerSide, scaleCm: { x: xyScaleCm, y: xyScaleCm, z: zScale }, worldSizeMeters: { x: worldWidthM, y: worldWidthM }, normalizedHeightRange: { min: exportedMinHeight, max: exportedMaxHeight }, verticalRangeMeters, heightmapEncoding: linearHeight ? 'linear-normalized-16bit-grayscale' : 'sea-emphasized-16bit-grayscale', zScaleFormula: '(maxExportHeight - minExportHeight) * configuredPeakElevationMeters * 100 / 512' }, biomePalette, files: files.map(file => file.manifest).filter(Boolean), source: { seed: state.seed, terrain: state.terrain, climateOffsetC: state.climateOffset, seaLevelNormalized: seaLevel }, references: ['https://dev.epicgames.com/documentation/unreal-engine/importing-and-exporting-landscape-heightmaps-in-unreal-engine', 'https://dev.epicgames.com/documentation/unreal-engine/landscape-technical-guide-in-unreal-engine'] };
        const presetName = `${base}-unreal-import.json`;
        files.push({ blob: new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }), name: presetName });
        const heightmapName = `${base}-height-${$('#linearHeight').checked ? 'linear-' : ''}${w}x${h}.png`;
        const heightInstruction = $('#exportHeight').checked ? `2. Select the matching **${heightmapName}** 16-bit grayscale PNG.` : '2. Include the 16-bit heightmap in the export and select it here.';
        const guide = `# Unreal Engine Landscape Import\n\nGenerated for **${state.mapName}** (${w} × ${h} vertices).\n\n## Heightmap import\n\n1. Open Landscape mode and choose **Import from File**.\n${heightInstruction} Keep **Flip Y Axis** off initially; enable it only if your project needs the opposite north/south orientation.\n3. The suggested Landscape layout is ${sectionSizeQuads} quads per section, 4 sections per component (2 × 2), and ${componentsPerSide} × ${componentsPerSide} components. Unreal can also auto-select a compatible layout from the heightmap resolution.\n4. Set X and Y scale to **${xyScaleCm.toFixed(2)} cm** per vertex for an approximately ${worldKm} km × ${worldKm} km landscape.\n5. Set Z scale to **${zScale.toFixed(2)}** for an approximately ${verticalRangeMeters.toFixed(1)} m vertical range. Unreal centers imported height values around the Landscape origin; adjust the Landscape Z location to place sea level or another datum where desired.\n6. Import, then verify the visible dimensions and elevation against your level scale.\n\n## Biome and feature layers\n\nThe matching grayscale masks use 0 outside and 255 inside each layer. Biome masks are generated only for biomes present in the map. Feature masks are combined by feature type. Create matching Landscape material layer names and import/paint the masks as layer data; these files do not create a material automatically. The RGB biome map is a visual palette reference.\n\n## Height values\n\nThis preset records **${preset.unreal.heightmapEncoding}**. Linear mode preserves normalized terrain height and is recommended for Unreal. Sea-emphasized mode changes the grayscale mapping around sea level for visual readability, so its vertical values are not linear.\n\nThe companion **${presetName}** lists the selected rasters, resolution, mask meaning, biome colors, and suggested Landscape settings.\n\n## Epic documentation\n\n- [Importing and Exporting Landscape Heightmaps](https://dev.epicgames.com/documentation/unreal-engine/importing-and-exporting-landscape-heightmaps-in-unreal-engine)\n- [Landscape Technical Guide](https://dev.epicgames.com/documentation/unreal-engine/landscape-technical-guide-in-unreal-engine)\n`;
        files.push({ blob: new Blob([guide], { type: 'text/markdown' }), name: `${base}-unreal-import-guide.md` });
      }
      if ($('#exportBundle').checked) download(await zipStore(files), `${base}-export.zip`); else files.forEach(file => download(file.blob, file.name));
      $('#exportDialog').close(); showToast('Export complete — files downloaded');
    } catch (e) { console.error(e); showToast(`Export failed: ${e.message || 'browser compression unavailable'}`); }
    finally { $('#confirmExport').disabled = false; $('#statusText').textContent = 'WORLD READY'; }
  }
  function csvExport() { const rows = ['Biome,Color,Area percent']; const counts = new Array(state.biomes.length).fill(0); for (const i of state.biomeMap) counts[i]++; state.biomes.forEach((b, i) => { if (b.enabled) rows.push(`${JSON.stringify(b.name)},${b.color},${(counts[i] / state.biomeMap.length * 100).toFixed(2)}%`); }); download(new Blob([rows.join('\n')], { type: 'text/csv' }), 'biome-distribution.csv'); showToast('Biome distribution exported as CSV'); }

  // Controls and interactions
  function selectView(view) {
    if (!['relief', 'texture'].includes(view) && $('#drawPanel').classList.contains('open')) {
      $('#drawPanel').classList.remove('open'); $('#drawBtn').classList.remove('active'); $('#mapStage').classList.remove('draw-enabled');
    }
    state.view = view;
    $$('.view-tab').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    render(); drawOverlays();
    $('#captionTitle').textContent = ({ height: 'HEIGHT FIELD · SEA LEVEL IN GRAYSCALE', relief: 'ELEVATION + HILLSHADE', biomes: 'BIOME DISTRIBUTION', climate: 'AIR TEMPERATURE', moisture: 'MOISTURE FIELD', texture: 'TERRAIN PREVIEW', profile: 'EAST—WEST CROSS SECTION' })[view];
  }
  $$('.view-tab').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
  $('#mapStage').addEventListener('pointermove', e => {
    const rect = $('#mapStage').getBoundingClientRect();
    state.hoverPoint = { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
    updateBiomeInspector(state.hoverPoint.x, state.hoverPoint.y);
  });
  $('#mapStage').addEventListener('pointerleave', () => {
    state.hoverPoint = null;
    $('#sampleHud').hidden = true;
    $('#sampleHint').textContent = 'HOVER OVER MAP'; $('#sampleBiome').lastElementChild.textContent = 'Move pointer over map';
    $('#sampleTemperature').textContent = '—'; $('#sampleMoisture').textContent = '—'; $('#sampleElevation').textContent = '—';
    $('#biomeReason').textContent = state.distribution === 'balanced' ? 'Balanced mode ranks land by temperature, moisture, and elevation, then assigns even shares across enabled land biomes. Ocean is assigned below sea level.' : 'Natural mode assigns each land point to the enabled biome whose temperature, moisture, and elevation ranges are the closest match. Ocean is assigned below sea level.';
  });
  $('#terrainType').addEventListener('change', e => { state.terrain = e.target.value; syncShapeControls(); generate(); });
  $('#mapSize').addEventListener('change', e => { state.size = +e.target.value; syncSliders(); generate(); });
  $('#quality').addEventListener('change', () => generate());
  ['elevation', 'roughness', 'erosion', 'seaLevel', 'islandSize', 'canyonWidth', 'ridgeStrength'].forEach(id => $(`#${id}`).addEventListener('input', () => { syncSliders(); scheduleGenerate(); }));
  $('#climateTemp').addEventListener('input', e => {
    const shown = +e.target.value; state.climateOffset = state.temperatureUnit === 'C' ? shown : shown * 5 / 9;
    syncClimateControl(); if (state.height) { assignBiomes(readSettings().sea); render(); }
  });
  $('#temperatureUnit').addEventListener('click', () => { state.temperatureUnit = state.temperatureUnit === 'C' ? 'F' : 'C'; syncClimateControl(); syncClimateLegend(); buildBiomeControls(); if (state.hoverPoint) updateBiomeInspector(state.hoverPoint.x, state.hoverPoint.y); });
  $('#collapseBiomes').addEventListener('click', () => { const expand = !$$('.biome-profile').every(profile => profile.open); $$('.biome-profile').forEach(profile => { profile.open = expand; }); syncBiomeCollapseButton(); });
  function setControlsOpen(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sidebarScrim').hidden = !open;
    $('#controlsBtn').setAttribute('aria-expanded', String(open));
  }
  $('#controlsBtn').addEventListener('click', () => setControlsOpen(!$('#sidebar').classList.contains('open')));
  $('#sidebarScrim').addEventListener('click', () => setControlsOpen(false));
  function syncShapeControls() { $$('.shape-specific').forEach(el => el.hidden = !el.dataset.shapes.split(',').includes(state.terrain)); }
  syncShapeControls();
  $('#seedBtn').addEventListener('click', randomizeSeed); $('#randomizeBtn').addEventListener('click', randomizeSeed);
  $('#seed').addEventListener('change', () => { normalizeSeed(); generate(); });
  $('#seed').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); normalizeSeed(); generate(); e.target.blur(); } });
  $('#copySeedBtn').addEventListener('click', copySeed);
  function syncFeatureCounts() {
    for (const [name, count] of Object.entries(state.features)) {
      const output = $(`[data-count="${name}"]`), row = $(`[data-feature-row="${name}"]`);
      if (output) output.textContent = count;
      if (row) row.classList.toggle('active', count > 0);
      const remove = $(`.feature-step[data-feature="${name}"][data-delta="-1"]`);
      if (remove) remove.disabled = count <= 0;
    }
  }
  $$('.feature-step').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.feature, delta = +b.dataset.delta;
    state.features[k] = clamp(state.features[k] + delta, 0, 20);
    syncFeatureCounts(); generate();
  }));
  syncFeatureCounts();
  $('#autoFeatures').addEventListener('change', generate); $('#flattenSettlements').addEventListener('change', generate);
  $$('.segmented button').forEach(b => b.addEventListener('click', () => { $$('.segmented button').forEach(x => x.classList.toggle('active', x === b)); state.distribution = b.dataset.distribution; if (state.height) { assignBiomes(readSettings().sea); render(); } }));
  $('#addBiome').addEventListener('click', () => {
    if (state.biomes.length >= 32) return;
    const presets = DEFAULT_BIOMES.filter(b => b.name !== 'Ocean'), used = new Set(state.biomes.map(b => b.name));
    const preset = presets.find(b => !used.has(b.name)) || presets[0], biome = structuredClone(preset);
    let serial = 2, name = preset.name; while (used.has(name)) name = `${preset.name} ${serial++}`;
    biome.name = name; biome.enabled = true;
    state.biomes.splice(Math.max(0, state.biomes.findIndex(b => b.name === 'Ocean')), 0, biome);
    buildBiomeControls(); assignBiomes(readSettings().sea); render();
  });
  $('#gridBtn').classList.toggle('active', state.grid);
  $('#gridBtn').addEventListener('click', () => { state.grid = !state.grid; $('#gridBtn').classList.toggle('active', state.grid); drawOverlays(); });
  $$('.collapse-button').forEach(button => button.addEventListener('click', () => {
    const collapsed = button.closest('.section-block').classList.toggle('collapsed');
    button.setAttribute('aria-expanded', String(!collapsed)); button.textContent = collapsed ? '+' : '−';
  }));
  $('#profileViewBtn').addEventListener('click', () => selectView('profile'));
  $('#drawBtn').addEventListener('click', () => {
    const open = !$('#drawPanel').classList.contains('open');
    if (open && !['relief', 'texture'].includes(state.view)) selectView('texture');
    $('#drawPanel').classList.toggle('open', open); $('#drawBtn').classList.toggle('active', open); $('#mapStage').classList.toggle('draw-enabled', open);
  });
  $('#closeDraw').addEventListener('click', () => { $('#drawPanel').classList.remove('open'); $('#drawBtn').classList.remove('active'); $('#mapStage').classList.remove('draw-enabled'); });
  $$('.draw-tool').forEach(b => b.addEventListener('click', () => { $$('.draw-tool').forEach(x => x.classList.toggle('active', x === b)); state.drawType = b.dataset.draw; }));
  $('#brushSize').addEventListener('input', e => { state.brush = +e.target.value; $('#brushValue').textContent = `${state.brush}%`; });
  $('#clearDraw').addEventListener('click', () => { if (!state.drawn.length) return; saveDrawHistory(); state.drawn = []; syncDrawHistory(); generate(); });
  $('#undoDraw').addEventListener('click', () => restoreDrawHistory(drawHistory.undo, drawHistory.redo));
  $('#redoDraw').addEventListener('click', () => restoreDrawHistory(drawHistory.redo, drawHistory.undo));
  $('#deleteLastDraw').addEventListener('click', () => { if (!state.drawn.length) return; saveDrawHistory(); state.drawn.pop(); syncDrawHistory(); generate(); });
  $('#zoomIn').addEventListener('click', () => { state.zoom = Math.min(1.5, state.zoom + .1); $('#mapStage').style.transform = `scale(${state.zoom})`; $('#zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`; });
  $('#zoomOut').addEventListener('click', () => { state.zoom = Math.max(.7, state.zoom - .1); $('#mapStage').style.transform = `scale(${state.zoom})`; $('#zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`; });
  $('#fullscreenBtn').addEventListener('click', () => { document.body.classList.toggle('fullscreen'); setTimeout(() => { canvas.width = canvas.width; overlay.width = overlay.width; render(); drawOverlays(); }, 100); });
  $('#saveBtn').addEventListener('click', () => { const cfg = { name: state.mapName, seed: state.seed, size: state.size, terrain: state.terrain, distribution: state.distribution, settings: readSettings(), biomes: state.biomes, features: state.features, drawnFeatures: state.drawn }; download(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), 'terra-world.json'); showToast('World settings saved'); });
  $('#importSettingsBtn').addEventListener('click', () => $('#importSettings').click());
  $('#importSettings').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const cfg = JSON.parse(await file.text()); if (!cfg || typeof cfg !== 'object') throw new Error('Invalid settings file');
      state.mapName = String(cfg.name || 'Imported landscape'); $('#projectTitle').textContent = state.mapName;
      if (typeof cfg.seed === 'string') $('#seed').value = cfg.seed.slice(0, 80);
      const importedSize = +cfg.size === 513 ? 505 : +cfg.size;
      if ([505, 1009, 2017, 4033].includes(importedSize)) { state.size = importedSize; $('#mapSize').value = String(importedSize); }
      if (['island','canyon','highland','volcanic','coastal','plateau','archipelago','valley','mesa','dunes','fjord'].includes(cfg.terrain)) { state.terrain = cfg.terrain; $('#terrainType').value = cfg.terrain; }
      if (cfg.distribution === 'natural' || cfg.distribution === 'balanced') state.distribution = cfg.distribution;
      const settings = cfg.settings || {};
      if (Number.isFinite(+settings.climateOffsetC)) state.climateOffset = clamp(+settings.climateOffsetC, -15, 15);
      if (settings.temperatureUnit === 'C' || settings.temperatureUnit === 'F') state.temperatureUnit = settings.temperatureUnit;
      for (const [key, id, scale, min, max] of [['peak','elevation',1,500,4500],['rough','roughness',100,5,100],['erosion','erosion',100,0,100],['sea','seaLevel',100,0,65],['islandSize','islandSize',100,65,145],['canyonWidth','canyonWidth',100,5,20],['ridgeStrength','ridgeStrength',100,0,100]]) if (Number.isFinite(+settings[key])) $(`#${id}`).value = clamp(Math.round(+settings[key] * scale), min, max);
      if ([384, 512, 768].includes(+settings.quality)) $('#quality').value = String(settings.quality);
      if (Array.isArray(cfg.biomes) && cfg.biomes.length) state.biomes = cfg.biomes.slice(0, 32).map(item => {
        const b = item && typeof item === 'object' ? item : {}, template = DEFAULT_BIOMES.find(p => p.name === b.name) || {};
        const finite = (key, fallback) => Number.isFinite(+b[key]) ? +b[key] : (Number.isFinite(+template[key]) ? +template[key] : fallback);
        return { name: String(b.name || 'Biome').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 30) || 'Biome', color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#777777', tempMin: finite('tempMin', -20), tempMax: finite('tempMax', 35), moistureMin: finite('moistureMin', 0), moistureMax: finite('moistureMax', 1), elevationMin: finite('elevationMin', 0), elevationMax: finite('elevationMax', 1), enabled: b.enabled !== false };
      });
      if (cfg.features && typeof cfg.features === 'object') for (const k of Object.keys(state.features)) if (Number.isFinite(+cfg.features[k])) state.features[k] = clamp(Math.round(+cfg.features[k]), 0, 20);
      if (typeof settings.auto === 'boolean') $('#autoFeatures').checked = settings.auto;
      if (typeof settings.flatten === 'boolean') $('#flattenSettlements').checked = settings.flatten;
      if (Array.isArray(cfg.drawnFeatures)) { saveDrawHistory(); state.drawn = cfg.drawnFeatures.filter(f => f && ['river','road','lake','city','village','mountain'].includes(f.type)).slice(0, 500); }
      buildBiomeControls(); syncFeatureCounts(); syncSliders(); syncClimateControl(); syncShapeControls(); syncDrawHistory(); $$('.segmented button').forEach(b => b.classList.toggle('active', b.dataset.distribution === state.distribution)); $('#exportDialog').close(); generate(); showToast('Settings imported');
    } catch (error) { showToast(`Import failed: ${error.message}`); }
    e.target.value = '';
  });
  $('#renameBtn').addEventListener('click', () => { const n = prompt('Name this landscape', state.mapName); if (n && n.trim()) { state.mapName = n.trim(); $('#projectTitle').textContent = state.mapName; } });
  $('#exportBtn').addEventListener('click', () => $('#exportDialog').showModal()); $('#confirmExport').addEventListener('click', e => { e.preventDefault(); exportFiles(); }); $('#biomeExportBtn').addEventListener('click', csvExport);
  $('#layersToggle').addEventListener('click', e => { const hidden = e.currentTarget.dataset.hidden !== 'true'; e.currentTarget.dataset.hidden = hidden ? 'true' : 'false'; e.currentTarget.textContent = hidden ? '›' : '⌄'; $('#layerList').style.display = hidden ? 'none' : 'flex'; });
  $$('.layer-row input').forEach(c => c.addEventListener('change', () => { if (c.dataset.layer === 'features') drawOverlays(); if (c.dataset.layer === 'water' || c.dataset.layer === 'contours') render(); }));
  $('#mapStage').addEventListener('dblclick', () => { state.zoom = state.zoom === 1 ? 1.25 : 1; $('#mapStage').style.transform = `scale(${state.zoom})`; $('#zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`; });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restoreDrawHistory(e.shiftKey ? drawHistory.redo : drawHistory.undo, e.shiftKey ? drawHistory.undo : drawHistory.redo); } if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate(); if (e.key === 'Escape' && $('#exportDialog').open) $('#exportDialog').close(); if (e.key === 'Escape' && $('#sidebar').classList.contains('open')) setControlsOpen(false); });
  $('#seed').value = state.seed;
  buildBiomeControls(); syncSliders(); syncClimateControl(); syncDrawHistory(); generate();
})();
