import * as THREE from "three";
import { SCRAMBLE_GLYPHS } from "./font.js";

// '#' is included for free (it's already in SCRAMBLE_GLYPHS), plus one blank
// slot for the gap cells that resolve to empty space. 16 fits a clean 4x4 atlas.
export const ATLAS_CHARS = [...SCRAMBLE_GLYPHS, " "];
export const ATLAS_GRID_SIZE = 4;
const CELL_PX = 128;

export const BLANK_INDEX = ATLAS_CHARS.indexOf(" ");
export const HASH_INDEX = ATLAS_CHARS.indexOf("#");

export function randomScrambleIndex() {
  return Math.floor(Math.random() * SCRAMBLE_GLYPHS.length);
}

export function buildGlyphAtlas() {
  const size = CELL_PX * ATLAS_GRID_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${CELL_PX * 0.72}px "Share Tech Mono", ui-monospace, "SF Mono", Menlo, monospace`;

  ATLAS_CHARS.forEach((ch, i) => {
    if (ch === " ") return;
    const col = i % ATLAS_GRID_SIZE;
    const row = Math.floor(i / ATLAS_GRID_SIZE);
    const cx = col * CELL_PX + CELL_PX / 2;
    const cy = row * CELL_PX + CELL_PX / 2 + CELL_PX * 0.03;
    ctx.fillText(ch, cx, cy);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
