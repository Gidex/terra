'use strict';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (x, y, seed) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
const mulberry32 = a => () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
}
function fractal(x, y, seed) { let sum = 0, amp = .52, freq = 1, norm = 0; for (let i = 0; i < 5; i++) { sum += noise(x * freq, y * freq, seed + i * 311) * amp; norm += amp; amp *= .52; freq *= 2.03; } return sum / norm; }
function distToPath(x, y, pts) {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y; const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy + 1e-8)); min = Math.min(min, Math.hypot(x - a.x - dx * t, y - a.y - dy * t)); }
  return min;
}
function generate({ id, size, seed, terrain, rough, erosion, islandSize, canyonWidth, ridgeStrength }) {
  const heights = new Float32Array(size * size), seedR = mulberry32(seed);
  const centers = Array.from({ length: 5 }, () => ({ x: .2 + seedR() * .6, y: .2 + seedR() * .6, r: .08 + seedR() * .17, h: .35 + seedR() * .65 }));
  const ridgeA = { x: .1 + seedR() * .15, y: .1 + seedR() * .8 }, ridgeB = { x: .75 + seedR() * .2, y: .1 + seedR() * .8 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / (size - 1), ny = y / (size - 1), dx = nx - .5, dy = ny - .5, r = Math.hypot(dx, dy) * 1.414;
    const n = fractal(nx * (4 + rough * 5), ny * (4 + rough * 5), seed), detail = (n - .49) * (.08 + rough * .25); let base = .36, mask = 1;
    switch (terrain) {
      case 'island': case 'archipelago': { let land = Math.max(0, 1 - smooth(.38 / islandSize, .98 / islandSize, r)); if (terrain === 'archipelago') { land = 0; for (const c of centers) land = Math.max(land, c.h * (1 - smooth(c.r * islandSize * .55, c.r * islandSize * 1.55, Math.hypot(nx - c.x, ny - c.y)))); } base = .02 + land * (.52 + .27 * n) + detail; break; }
      case 'canyon': { const d = distToPath(nx, ny, [ridgeA, { x: .42, y: .45 }, { x: .67, y: .55 }, ridgeB]); base = .24 + smooth(canyonWidth, canyonWidth * 3.2, d) * .62 + detail * 1.2 - .22 * (1 - smooth(canyonWidth * .6, canyonWidth * 1.5, d)); break; }
      case 'highland': { const rim = smooth(.24, .7, r) * (.2 + ridgeStrength * .55), basin = .32 - .16 * (1 - smooth(.04, .36, r)); base = .3 + rim + basin + detail; break; }
      case 'volcanic': { const crater = Math.exp(-Math.pow(r / .28, 2)); base = .31 + .42 * smooth(.27, .62, r) - .25 * crater + detail; break; }
      case 'coastal': { base = .1 + smooth(.08, .9, nx) * .32 + smooth(.2, .75, ny) * .16 + detail; mask = smooth(.02, .2, nx); base *= mask; break; }
      case 'plateau': { base = .32 + .31 * smooth(.08, .35, n) + .04 * (n - .5) + detail * .55 - .18 * smooth(.65, 1, r); break; }
      case 'valley': { const d = Math.abs(ny - (.49 + .09 * Math.sin(nx * 5.4) + .035 * Math.sin(nx * 14))); base = .6 + detail + .2 * n - .33 * (1 - smooth(.025, .21, d)); break; }
      case 'mesa': { let mesas = 0; for (const c of centers) mesas = Math.max(mesas, c.h * (1 - smooth(c.r * .78, c.r * 1.08, Math.hypot(nx - c.x, ny - c.y)))); base = .13 + mesas * .68 + detail * .7; break; }
      case 'dunes': { const ridge = Math.abs(Math.sin(nx * 35 + ny * 8 + fractal(nx * 2, ny * 2, seed) * 5)); base = .34 + (1 - ridge) * .25 + Math.sin(nx * 8 + ny * 12) * .025 + detail * .3; break; }
      case 'fjord': { const inlet = Math.abs(nx - (.49 + .08 * Math.sin(ny * 5.4) + .025 * Math.sin(ny * 14))); base = .2 + smooth(.012, .115, inlet) * .68 + detail * 1.1; break; }
    }
    let h = clamp((base + detail * .45) * mask); h = lerp(h, smooth(.18, .86, h), erosion * .22); heights[y * size + x] = h;
  }
  return { id, heights };
}
self.onmessage = event => { try { const result = generate(event.data); self.postMessage(result, [result.heights.buffer]); } catch (error) { self.postMessage({ id: event.data?.id, error: error.message }); } };
