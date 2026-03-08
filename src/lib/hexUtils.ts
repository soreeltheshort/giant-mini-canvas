import { HexData, hexKey } from "./mapTypes";

// Pointy-top hex geometry
const SQRT3 = Math.sqrt(3);

// Convert offset (x, y) odd-r to pixel center
export function hexToPixel(x: number, y: number, size: number): [number, number] {
  const px = size * SQRT3 * (x + 0.5 * (y & 1));
  const py = size * 1.5 * y;
  return [px, py];
}

// Convert pixel to offset coordinates (odd-r, pointy-top)
export function pixelToHex(px: number, py: number, size: number): [number, number] {
  // Fractional axial
  const q = (px * SQRT3 / 3 - py / 3) / size;
  const r = (py * 2 / 3) / size;

  // Round axial to offset
  let cube_x = q;
  let cube_z = r;
  let cube_y = -cube_x - cube_z;

  let rx = Math.round(cube_x);
  let ry = Math.round(cube_y);
  let rz = Math.round(cube_z);

  const x_diff = Math.abs(rx - cube_x);
  const y_diff = Math.abs(ry - cube_y);
  const z_diff = Math.abs(rz - cube_z);

  if (x_diff > y_diff && x_diff > z_diff) {
    rx = -ry - rz;
  } else if (y_diff > z_diff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  // Axial to odd-r offset
  const col = rx + (rz - (rz & 1)) / 2;
  const row = rz;

  return [col, row];
}

// Get pointy-top hex corners
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return corners;
}

// Odd-r neighbors
export function getNeighbors(x: number, y: number): [number, number][] {
  const parity = y & 1;
  if (parity === 0) {
    return [
      [x + 1, y], [x, y - 1], [x - 1, y - 1],
      [x - 1, y], [x - 1, y + 1], [x, y + 1],
    ];
  } else {
    return [
      [x + 1, y], [x + 1, y - 1], [x, y - 1],
      [x - 1, y], [x, y + 1], [x + 1, y + 1],
    ];
  }
}

// Offset to cube coords
export function offsetToCube(x: number, y: number): [number, number, number] {
  const cx = x - (y - (y & 1)) / 2;
  const cz = y;
  const cy = -cx - cz;
  return [cx, cy, cz];
}

// Cube distance
export function cubeDistance(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

// Get hexes within a brush radius (cube distance)
export function getHexesInRadius(
  cx: number, cy: number, radius: number, hexes: Map<string, HexData>
): HexData[] {
  const [cubex, cubey, cubez] = offsetToCube(cx, cy);
  const result: HexData[] = [];
  for (const hex of hexes.values()) {
    const [hx, hy, hz] = offsetToCube(hex.x, hex.y);
    if (cubeDistance(cubex, cubey, cubez, hx, hy, hz) <= radius) {
      result.push(hex);
    }
  }
  return result;
}

// Flood fill: get all connected hexes with same classification
export function floodFill(
  startX: number, startY: number,
  classification: string,
  hexes: Map<string, HexData>
): HexData[] {
  const visited = new Set<string>();
  const result: HexData[] = [];
  const queue: [number, number][] = [[startX, startY]];

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const key = hexKey(x, y);
    if (visited.has(key)) continue;
    visited.add(key);

    const hex = hexes.get(key);
    if (!hex || hex.classification !== classification) continue;

    result.push(hex);
    for (const [nx, ny] of getNeighbors(x, y)) {
      if (!visited.has(hexKey(nx, ny))) {
        queue.push([nx, ny]);
      }
    }
  }
  return result;
}

// Brush radius mapping
export function brushRadius(size: 1 | 7 | 19): number {
  if (size === 1) return 0;
  if (size === 7) return 1;
  return 2;
}
