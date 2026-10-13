'use strict';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mulberry32 = a => () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// 8 2D unit gradient vectors for smooth Perlin gradient noise
const GX = [1, -1, 0, 0, 0.70710678, -0.70710678, 0.70710678, -0.70710678];
const GY = [0, 0, 1, -1, 0.70710678, 0.70710678, -0.70710678, -0.70710678];

function gradNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  let n00 = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n00 = Math.imul(n00 ^ (n00 >>> 13), 1274126177);
  const g00 = (n00 >>> 29) & 7;
  const d00 = GX[g00] * fx + GY[g00] * fy;

  let n10 = Math.imul(ix + 1, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n10 = Math.imul(n10 ^ (n10 >>> 13), 1274126177);
  const g10 = (n10 >>> 29) & 7;
  const d10 = GX[g10] * (fx - 1) + GY[g10] * fy;

  let n01 = Math.imul(ix, 374761393) + Math.imul(iy + 1, 668265263) + Math.imul(seed, 1442695041);
  n01 = Math.imul(n01 ^ (n01 >>> 13), 1274126177);
  const g01 = (n01 >>> 29) & 7;
  const d01 = GX[g01] * fx + GY[g01] * (fy - 1);

  let n11 = Math.imul(ix + 1, 374761393) + Math.imul(iy + 1, 668265263) + Math.imul(seed, 1442695041);
  n11 = Math.imul(n11 ^ (n11 >>> 13), 1274126177);
  const g11 = (n11 >>> 29) & 7;
  const d11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);

  const nx0 = d00 + u * (d10 - d00);
  const nx1 = d01 + u * (d11 - d01);
  return (nx0 + v * (nx1 - nx0)) * 0.70710678 + 0.5;
}
const noise = gradNoise;

function fractal(x, y, seed, octaves = 5) {
  let sum = 0, amp = .52, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += gradNoise(x * freq, y * freq, seed + i * 311) * amp;
    norm += amp;
    amp *= .52;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridgedFractal(x, y, seed, octaves = 4) {
  let sum = 0, amp = .55, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = gradNoise(x * freq, y * freq, seed + i * 401);
    n = 1 - Math.abs(n * 2 - 1);
    n = n * n;
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return sum / norm;
}

function distToPath(x, y, pts) {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy + 1e-8));
    min = Math.min(min, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return min;
}

function generate({ id, size, seed, terrain, rough, erosion, islandSize, canyonWidth, ridgeStrength }) {
  const heights = new Float32Array(size * size), seedR = mulberry32(seed);
  const centers = Array.from({ length: 5 }, () => ({ x: .2 + seedR() * .6, y: .2 + seedR() * .6, r: .08 + seedR() * .17, h: .35 + seedR() * .65 }));
  const ridgeA = { x: .1 + seedR() * .15, y: .1 + seedR() * .8 }, ridgeB = { x: .75 + seedR() * .2, y: .1 + seedR() * .8 };
  const branchC = { x: .42 + seedR() * .15, y: .46 + seedR() * .1 }, branchD = { x: .32 + seedR() * .35, y: seedR() > 0.5 ? 0.85 : 0.15 };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / (size - 1), ny = y / (size - 1), dx = nx - .5, dy = ny - .5;
    // Domain warp offset for natural coastlines, bays, and organic landforms
    const wx = (fractal(nx * 2.5, ny * 2.5, seed ^ 0x51f, 3) - 0.5) * 0.35;
    const wy = (fractal(nx * 2.5 + 8.1, ny * 2.5 - 4.3, seed ^ 0x93c, 3) - 0.5) * 0.35;
    const rWarp = Math.hypot(dx + wx, dy + wy) * 1.414;
    const rPure = Math.hypot(dx, dy) * 1.414;

    const n = fractal(nx * (4 + rough * 5), ny * (4 + rough * 5), seed);
    const detail = (n - .49) * rough * .25;
    let base = .36, mask = 1;

    switch (terrain) {
      case 'island': {
        const land = Math.max(0, 1 - smooth(.38 / islandSize, .98 / islandSize, rWarp));
        const mountainRidge = ridgedFractal(nx * (3 + rough * 3), ny * (3 + rough * 3), seed ^ 0x777, 4);
        base = .02 + land * (.48 + .3 * rough * n + mountainRidge * land * .25) + detail;
        break;
      }
      case 'archipelago': {
        let land = 0;
        for (const c of centers) {
          const cDist = Math.hypot((nx + wx * 0.7) - c.x, (ny + wy * 0.7) - c.y);
          land = Math.max(land, c.h * (1 - smooth(c.r * islandSize * .55, c.r * islandSize * 1.55, cDist)));
        }
        base = .02 + land * (.52 + .27 * rough * n) + detail;
        break;
      }
      case 'canyon': {
        const dMain = distToPath(nx, ny, [ridgeA, { x: .42, y: .45 }, { x: .67, y: .55 }, ridgeB]);
        const dBranch = distToPath(nx, ny, [branchC, branchD]);
        const d = Math.min(dMain, dBranch * 1.35);
        const rawCanyon = smooth(canyonWidth, canyonWidth * 3.2, d) * .62;
        const terraced = Math.floor(rawCanyon * 6) / 6 + smooth(0.2, 0.8, (rawCanyon * 6) % 1) * (1 / 6);
        base = .24 + terraced + detail * 1.1 - .22 * (1 - smooth(canyonWidth * .6, canyonWidth * 1.5, d));
        break;
      }
      case 'highland': {
        const rim = smooth(.24, .7, rPure) * (.2 + ridgeStrength * .55);
        const basin = .32 - .16 * (1 - smooth(.04, .36, rPure));
        const ridges = ridgedFractal(nx * (3.5 + rough * 3), ny * (3.5 + rough * 3), seed ^ 0x89a, 4);
        base = .28 + rim + basin + detail * 0.6 + ridges * (0.22 + ridgeStrength * 0.38);
        break;
      }
      case 'volcanic': {
        const cone = smooth(0.04, 0.42, rPure);
        const rim = smooth(0.18, 0.32, rPure) * 0.45;
        const calderaDepression = Math.exp(-Math.pow(rPure / 0.22, 2)) * 0.36;
        const centralPeak = Math.exp(-Math.pow(rPure / 0.055, 2)) * 0.18;
        base = 0.25 + cone * 0.15 + rim - calderaDepression + centralPeak + detail;
        break;
      }
      case 'coastal': {
        const shelfWarp = nx + wy * 0.3;
        base = (.1 + smooth(.08, .9, shelfWarp) * .32 + smooth(.2, .75, ny) * .16 + detail);
        mask = smooth(.02, .2, shelfWarp);
        base *= mask;
        break;
      }
      case 'plateau': {
        const pNoise = fractal(nx * 3.5, ny * 3.5, seed);
        const stepped = smooth(.12, .42, pNoise);
        base = .32 + .32 * stepped + .04 * (n - .5) + detail * .55 - .18 * smooth(.65, 1, rWarp);
        break;
      }
      case 'valley': {
        const riverMeander = ny - (.49 + .09 * Math.sin(nx * 5.4 + wx * 2) + .035 * Math.sin(nx * 14));
        const d = Math.abs(riverMeander);
        base = .6 + detail + .2 * rough * n - .35 * (1 - smooth(.025, .22, d));
        break;
      }
      case 'mesa': {
        let mesas = 0;
        for (const c of centers) {
          const cDist = Math.hypot((nx + wx * 0.5) - c.x, (ny + wy * 0.5) - c.y);
          const rawMesa = 1 - smooth(c.r * .78, c.r * 1.08, cDist);
          const steppedMesa = smooth(0.35, 0.95, rawMesa);
          mesas = Math.max(mesas, c.h * steppedMesa);
        }
        base = .13 + mesas * .68 + detail * .7;
        break;
      }
      case 'dunes': {
        const dPhase = nx * 32 + ny * 8 + fractal(nx * 2, ny * 2, seed) * 4.5;
        const normPhase = (dPhase % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2);
        const ridge = Math.pow(Math.sin(normPhase * 0.5), 1.6);
        base = .34 + ridge * .25 + Math.sin(nx * 8 + ny * 12) * .025 + detail * .3;
        break;
      }
      case 'fjord': {
        const inlet = Math.abs((nx + wy * 0.25) - (.49 + .08 * Math.sin(ny * 5.4) + .025 * Math.sin(ny * 14)));
        base = .2 + smooth(.012, .115, inlet) * .68 + detail * 1.1;
        break;
      }
    }
    const h = clamp((base + detail * .45) * mask);
    heights[y * size + x] = h;
  }

  // Multi-pass thermal erosion relaxation
  if (erosion > 0) {
    const maxSlope = 0.055 - erosion * 0.035;
    const passes = Math.min(3, Math.max(1, Math.round(erosion * 2.5)));
    const rate = 0.25;
    for (let p = 0; p < passes; p++) {
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const i = y * size + x;
          const h = heights[i];
          const nT = heights[(y - 1) * size + x], nB = heights[(y + 1) * size + x];
          const nL = heights[y * size + (x - 1)], nR = heights[y * size + (x + 1)];
          const minN = Math.min(nT, nB, nL, nR);
          const diff = h - minN;
          if (diff > maxSlope) {
            const transfer = (diff - maxSlope) * rate;
            heights[i] -= transfer;
            if (minN === nT) heights[(y - 1) * size + x] += transfer;
            else if (minN === nB) heights[(y + 1) * size + x] += transfer;
            else if (minN === nL) heights[y * size + (x - 1)] += transfer;
            else heights[y * size + (x + 1)] += transfer;
          }
        }
      }
    }
  }

  return { id, heights };
}

self.onmessage = event => {
  try {
    const result = generate(event.data);
    self.postMessage(result, [result.heights.buffer]);
  } catch (error) {
    self.postMessage({ id: event.data?.id, error: error.message });
  }
};

