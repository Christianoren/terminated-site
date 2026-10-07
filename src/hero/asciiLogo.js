import * as THREE from "three";
import { WORD, buildBanner } from "./font.js";
import {
  buildGlyphAtlas,
  ATLAS_GRID_SIZE,
  BLANK_INDEX,
  HASH_INDEX,
  randomScrambleIndex,
} from "./glyphAtlas.js";
import { vertexShader, fragmentShader } from "./shader.js";

const SCRAMBLE_TICK_MS = 50;
const INTRO_FADE_MS = 650;
const RESOLVE_START_DELAY_MS = 400;
const RESOLVE_SPAN_MS = 1500;
const RESOLVE_FLASH_MS = 380;

const SNAKE_TICK_MS = 45;
const SNAKE_TRAIL_LENGTH = 12;
const SNAKE_GLITCH_HEAD_COUNT = 3;

const AMBIENT_GLITCH_MIN_MS = 4000;
const AMBIENT_GLITCH_MAX_MS = 9000;
const AMBIENT_GLITCH_FLASH_MS = 90;

// Extra disturbance while the cursor is actively moving — cells elsewhere in
// the word flicker into noise and back, on top of whatever the snake head is
// already doing, so motion reads as disturbing the whole thing, not just the
// one cell being chased.
const MOVE_GLITCH_INTERVAL_MS = 100;
const MOVE_GLITCH_COUNT = 3;
const MOVE_GLITCH_FLASH_MS = 130;

const CURSOR_FOLLOW_TIMEOUT_MS = 2000;

// Hover-triggered screen tear — same shape as the game's own PlayScreenTear
// (DesktopShell.cs): a handful of hard-cut jitter steps with climbing
// amplitude, no easing (a tear is a snap, not a slide), then a snap back.
// The game slices a captured screenshot into horizontal bands and jitters
// each sideways; here the grid IS already row-based, so each row of glyphs
// gets its own random horizontal offset per step instead.
const TEAR_STEPS = [
  { atMs: 0, amplitude: 0.55 },
  { atMs: 70, amplitude: 0.85 },
  { atMs: 150, amplitude: 1.3 },
  { atMs: 230, amplitude: 0 },
];
const TEAR_GLITCH_BURST_COUNT = 18;
const TEAR_GLITCH_FLASH_MS = 160;

const BASE_COLOR = new THREE.Color(0xeae7de); // --ink
const ACCENT_COLOR = new THREE.Color(0xb47fe3); // --ai-accent

export function createAsciiLogo(container) {
  const { rows, rowCount, colCount, colsPerLetter } = buildBanner(WORD);
  const cellCount = rowCount * colCount;
  const letterCount = WORD.length;

  // --- scene / camera / renderer -------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 18);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const group = new THREE.Group();
  scene.add(group);

  // --- instanced glyph grid -------------------------------------------------
  const cellSize = 1.0;
  const spacingX = 0.92;
  const spacingY = 1.08;

  const geometry = new THREE.PlaneGeometry(cellSize, cellSize);
  const atlasTexture = buildGlyphAtlas();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uAtlasSize: { value: ATLAS_GRID_SIZE },
      uBaseColor: { value: BASE_COLOR },
      uAccentColor: { value: ACCENT_COLOR },
      uOpacity: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, cellCount);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const atlasIndexAttr = new THREE.InstancedBufferAttribute(new Float32Array(cellCount), 1);
  const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(cellCount), 1);
  geometry.setAttribute("aAtlasIndex", atlasIndexAttr);
  geometry.setAttribute("aGlow", glowAttr);

  const finalChar = new Array(cellCount);
  const isHash = new Array(cellCount);
  const resolved = new Array(cellCount).fill(false);
  const flashStartAt = new Array(cellCount).fill(-1);
  const baseX = new Float32Array(cellCount);
  const baseY = new Float32Array(cellCount);
  const rowOffsetX = new Float32Array(rowCount);

  const gridWidth = (colCount - 1) * spacingX;
  const gridHeight = (rowCount - 1) * spacingY;

  const dummy = new THREE.Object3D();
  const byLetter = Array.from({ length: letterCount }, () => []);

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const idx = r * colCount + c;
      const ch = rows[r][c];
      finalChar[idx] = ch;
      isHash[idx] = ch === "#";

      const x = c * spacingX - gridWidth / 2;
      const y = gridHeight / 2 - r * spacingY;
      baseX[idx] = x;
      baseY[idx] = y;
      dummy.position.set(x, y, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      atlasIndexAttr.array[idx] = randomScrambleIndex();
      glowAttr.array[idx] = 0;

      if (isHash[idx]) {
        const li = Math.floor(c / colsPerLetter);
        byLetter[li].push(idx);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  atlasIndexAttr.needsUpdate = true;

  // Reapplies baseX/baseY + the per-row tear offset to every instance —
  // called whenever rowOffsetX changes (tear steps), not every frame.
  function applyRowOffsets() {
    for (let r = 0; r < rowCount; r++) {
      const offset = rowOffsetX[r];
      for (let c = 0; c < colCount; c++) {
        const idx = r * colCount + c;
        dummy.position.set(baseX[idx] + offset, baseY[idx], 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- responsive framing ---------------------------------------------------
  // Tracked so pointer->grid mapping (below) can reason in the same world
  // space the grid is actually rendered in, not just raw viewport fractions.
  let visibleWidth = 1;
  let visibleHeight = 1;

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const fovRad = (camera.fov * Math.PI) / 180;
    visibleHeight = 2 * Math.tan(fovRad / 2) * camera.position.z;
    visibleWidth = visibleHeight * camera.aspect;

    // The word is ~12x wider than it is tall, so on a portrait phone the
    // WIDTH constraint always wins regardless of padding — there's no
    // amount of tuning that changes which dimension binds. What portrait
    // screens DO have is far more spare height than a desktop window, so
    // they can afford a much larger padding factor and still fit with
    // room to spare, instead of leaving most of the screen empty.
    const isPortrait = camera.aspect < 1;
    const paddingFactor = isPortrait ? 0.86 : 0.42;
    const scale = Math.min(
      (visibleWidth * paddingFactor) / gridWidth,
      (visibleHeight * paddingFactor) / gridHeight
    );
    // Floor is just a sanity backstop against a degenerate (near-zero)
    // viewport — NOT a "never go below this" target. The old 0.18 floor
    // was bigger than what narrow phones actually fit, forcing the grid
    // wider than the screen and clipping it at the edges.
    group.scale.setScalar(THREE.MathUtils.clamp(scale, 0.04, 1.1));
  }
  window.addEventListener("resize", resize);
  resize();

  // --- pointer parallax + grid-space tracking --------------------------------
  // The group is rotated (not just tilted on independent axes) toward a
  // point that slides opposite the camera from the logo as the cursor
  // moves — like the whole word turning its face to track the mouse,
  // pivoting through its own center rather than each corner swinging on
  // its own. LOOK_RANGE controls how far that point swings sideways,
  // LOOK_DEPTH how far away it sits (bigger = subtler turn).
  const pointer = { x: 0, y: 0, lastMoveAt: -Infinity };
  const LOOK_RANGE_X = 7;
  const LOOK_RANGE_Y = 5;
  const LOOK_DEPTH = 13;
  const desiredLookAt = new THREE.Vector3(0, 0, LOOK_DEPTH);
  const smoothedLookAt = desiredLookAt.clone();

  function onPointerMove(e) {
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointer.x = nx;
    pointer.y = ny;
    pointer.lastMoveAt = performance.now();
    desiredLookAt.set(nx * LOOK_RANGE_X, -ny * LOOK_RANGE_Y, LOOK_DEPTH);
  }
  window.addEventListener("pointermove", onPointerMove);

  // On touch devices there's no mouse to drive the look-at, so the phone's
  // own tilt takes over instead — same pointer/desiredLookAt plumbing, just
  // fed from the gyro. Calibrated against whatever orientation the phone is
  // in the moment it starts (not an absolute "flat on a table" zero), so it
  // reads as "tilt away from however you're already holding it" rather than
  // snapping to some arbitrary reference pose.
  const TILT_SENSITIVITY_DEG = 24;
  const orientationRef = { beta: null, gamma: null };

  function onDeviceOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    if (orientationRef.beta === null) {
      orientationRef.beta = e.beta;
      orientationRef.gamma = e.gamma;
    }
    const nx = THREE.MathUtils.clamp((e.gamma - orientationRef.gamma) / TILT_SENSITIVITY_DEG, -1, 1);
    const ny = THREE.MathUtils.clamp((e.beta - orientationRef.beta) / TILT_SENSITIVITY_DEG, -1, 1);
    pointer.x = nx;
    pointer.y = ny;
    pointer.lastMoveAt = performance.now();
    desiredLookAt.set(nx * LOOK_RANGE_X, -ny * LOOK_RANGE_Y, LOOK_DEPTH);
  }

  function enableDeviceOrientation() {
    window.addEventListener("deviceorientation", onDeviceOrientation);
  }

  const isTouchDevice = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const needsOrientationPermission =
    typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

  // An invisible auto-request (a tap anywhere counted as "the gesture")
  // gave zero feedback when it failed — and on iOS it silently resolves to
  // "denied" with no prompt at all if the user has Settings > Safari >
  // Motion & Orientation Access turned off, which just reads as "tilt does
  // nothing, no idea why." A real button means requestPermission() always
  // runs from an unambiguous click (not fighting a CTA link for the same
  // gesture) and lets us show the user what actually happened.
  let tiltButton = null;
  if (isTouchDevice && needsOrientationPermission) {
    tiltButton = document.createElement("button");
    tiltButton.type = "button";
    tiltButton.className = "tilt-enable-btn";
    tiltButton.textContent = "Enable tilt";
    tiltButton.addEventListener("click", () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === "granted") {
            enableDeviceOrientation();
            tiltButton.remove();
          } else {
            // Most likely cause: Settings > Safari > Motion & Orientation
            // Access is off device-wide — requestPermission() resolves to
            // "denied" with no system prompt at all in that case, so this
            // is often the only feedback the user ever gets.
            tiltButton.textContent = "Tilt blocked — check Settings > Safari > Motion & Orientation Access";
            tiltButton.classList.add("tilt-enable-btn-denied");
          }
        })
        .catch(() => {
          tiltButton.textContent = "Couldn't enable tilt";
          tiltButton.classList.add("tilt-enable-btn-denied");
        });
    });
    container.appendChild(tiltButton);
  } else if (isTouchDevice) {
    // No permission gate (Android and others) — no button needed, tilt
    // works the instant the page loads.
    enableDeviceOrientation();
  }

  function cellRowCol(idx) {
    return { r: Math.floor(idx / colCount), c: idx % colCount };
  }

  // Projects normalized pointer space into the SAME world space the grid is
  // actually laid out in (accounting for the responsive group.scale), then
  // finds the nearest lit cell — so vertical movement matters just as much
  // as horizontal, not just a left-right smear across the middle row.
  function nearestHashCellTo(nx, ny) {
    const worldX = (nx * visibleWidth) / 2;
    const worldY = (-ny * visibleHeight) / 2;
    const scale = group.scale.x || 1;
    const gx = (worldX / scale + gridWidth / 2) / spacingX;
    const gy = (gridHeight / 2 - worldY / scale) / spacingY;

    let best = -1;
    let bestDist = Infinity;
    for (let li = 0; li < letterCount; li++) {
      for (const idx of byLetter[li]) {
        const { r, c } = cellRowCol(idx);
        const d = (c - gx) * (c - gx) + (r - gy) * (r - gy);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      }
    }
    return best;
  }

  // --- animation state -------------------------------------------------------
  let startTime = -1;
  let allResolved = false;
  let lastScrambleTick = 0;
  let lastSnakeTick = 0;
  const letterResolvedAt = new Array(letterCount).fill(-1);

  let snakeLetter = Math.floor(Math.random() * letterCount);
  while (byLetter[snakeLetter].length === 0) snakeLetter = (snakeLetter + 1) % letterCount;
  let snakeCellIdx = byLetter[snakeLetter][Math.floor(Math.random() * byLetter[snakeLetter].length)];
  const trail = []; // most recent cell indices, head last

  function stepSnake(nowMs) {
    const cursorActive = nowMs - pointer.lastMoveAt < CURSOR_FOLLOW_TIMEOUT_MS;
    let nextIdx;

    if (cursorActive) {
      // Directly track the cursor every tick — the trail array below is
      // what turns this into a fading comet rather than a teleporting dot.
      nextIdx = nearestHashCellTo(pointer.x, pointer.y);
    } else {
      const roll = Math.random();
      if (roll < 0.72) {
        const cur = cellRowCol(snakeCellIdx);
        const candidates = byLetter[snakeLetter].filter((idx) => {
          const p = cellRowCol(idx);
          return (p.c - cur.c) ** 2 + (p.r - cur.r) ** 2 <= 4 && idx !== snakeCellIdx;
        });
        nextIdx = candidates.length
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : snakeCellIdx;
      } else if (roll < 0.92) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        let li = snakeLetter;
        for (let guard = 0; guard < letterCount; guard++) {
          li = THREE.MathUtils.clamp(li + dir, 0, letterCount - 1);
          if (byLetter[li].length > 0) break;
        }
        snakeLetter = li;
        nextIdx = byLetter[li][Math.floor(Math.random() * byLetter[li].length)];
      } else {
        let li = Math.floor(Math.random() * letterCount);
        for (let guard = 0; guard < letterCount && byLetter[li].length === 0; guard++) {
          li = (li + 1) % letterCount;
        }
        snakeLetter = li;
        nextIdx = byLetter[li][Math.floor(Math.random() * byLetter[li].length)];
      }
    }

    snakeCellIdx = nextIdx;
    const { c } = cellRowCol(nextIdx);
    snakeLetter = Math.floor(c / colsPerLetter);

    trail.push(nextIdx);
    if (trail.length > SNAKE_TRAIL_LENGTH) trail.shift();
  }

  let nextAmbientGlitchAt = -1;
  let lastMoveGlitchAt = -Infinity;
  function scheduleNextAmbientGlitch(nowMs) {
    nextAmbientGlitchAt =
      nowMs + AMBIENT_GLITCH_MIN_MS + Math.random() * (AMBIENT_GLITCH_MAX_MS - AMBIENT_GLITCH_MIN_MS);
  }

  const ambientGlitches = []; // { idx, revertAt }

  let tearStartAt = -1;
  let tearStepIndex = 0;

  function triggerTear() {
    if (!allResolved) return;
    tearStartAt = performance.now();
    tearStepIndex = 0;

    for (let i = 0; i < TEAR_GLITCH_BURST_COUNT; i++) {
      let idx = Math.floor(Math.random() * cellCount);
      for (let guard = 0; guard < cellCount && !isHash[idx]; guard++) idx = (idx + 1) % cellCount;
      ambientGlitches.push({ idx, revertAt: tearStartAt + TEAR_GLITCH_FLASH_MS + Math.random() * 120 });
      atlasIndexAttr.array[idx] = randomScrambleIndex();
    }
    atlasIndexAttr.needsUpdate = true;
  }

  function tick(nowMs) {
    if (startTime < 0) startTime = nowMs;
    const elapsed = nowMs - startTime;

    material.uniforms.uOpacity.value = THREE.MathUtils.clamp(elapsed / INTRO_FADE_MS, 0, 1);

    for (let li = 0; li < letterCount; li++) {
      if (letterResolvedAt[li] >= 0) continue;
      const dueAt =
        RESOLVE_START_DELAY_MS + (letterCount <= 1 ? 0 : (li * RESOLVE_SPAN_MS) / (letterCount - 1));
      if (elapsed >= dueAt) {
        letterResolvedAt[li] = elapsed;
        const start = li * colsPerLetter;
        for (let r = 0; r < rowCount; r++) {
          for (let c = start; c < start + colsPerLetter; c++) {
            const idx = r * colCount + c;
            resolved[idx] = true;
            atlasIndexAttr.array[idx] = isHash[idx] ? HASH_INDEX : BLANK_INDEX;
            flashStartAt[idx] = elapsed;
          }
        }
        atlasIndexAttr.needsUpdate = true;

        if (!allResolved && letterResolvedAt.every((t) => t >= 0)) {
          allResolved = true;
          scheduleNextAmbientGlitch(nowMs);
        }
      }
    }

    if (!allResolved && nowMs - lastScrambleTick >= SCRAMBLE_TICK_MS) {
      lastScrambleTick = nowMs;
      for (let idx = 0; idx < cellCount; idx++) {
        if (resolved[idx]) continue;
        atlasIndexAttr.array[idx] = randomScrambleIndex();
      }
      atlasIndexAttr.needsUpdate = true;
    }

    let glowDirty = false;
    for (let idx = 0; idx < cellCount; idx++) {
      let g = 0;
      if (flashStartAt[idx] >= 0) {
        const t = (elapsed - flashStartAt[idx]) / RESOLVE_FLASH_MS;
        if (t < 1) g = Math.max(g, 1 - t);
      }
      if (glowAttr.array[idx] !== g) {
        glowAttr.array[idx] = g;
        glowDirty = true;
      }
    }

    if (allResolved) {
      if (nowMs - lastSnakeTick >= SNAKE_TICK_MS) {
        lastSnakeTick = nowMs;
        stepSnake(nowMs);
      }
      for (let i = 0; i < trail.length; i++) {
        const idx = trail[i];
        const fromHead = trail.length - 1 - i;
        const trailGlow = 1 - fromHead / SNAKE_TRAIL_LENGTH;
        if (trailGlow > glowAttr.array[idx]) {
          glowAttr.array[idx] = trailGlow;
          glowDirty = true;
        }
        if (fromHead < SNAKE_GLITCH_HEAD_COUNT) {
          const showGlitch = Math.random() < 0.35;
          atlasIndexAttr.array[idx] = showGlitch ? randomScrambleIndex() : HASH_INDEX;
          atlasIndexAttr.needsUpdate = true;
        }
      }

      if (nowMs >= nextAmbientGlitchAt) {
        let idx = Math.floor(Math.random() * cellCount);
        for (let guard = 0; guard < cellCount && !isHash[idx]; guard++) idx = (idx + 1) % cellCount;
        ambientGlitches.push({ idx, revertAt: nowMs + AMBIENT_GLITCH_FLASH_MS });
        atlasIndexAttr.array[idx] = randomScrambleIndex();
        atlasIndexAttr.needsUpdate = true;
        scheduleNextAmbientGlitch(nowMs);
      }

      const cursorActive = nowMs - pointer.lastMoveAt < CURSOR_FOLLOW_TIMEOUT_MS;
      if (cursorActive && nowMs - lastMoveGlitchAt >= MOVE_GLITCH_INTERVAL_MS) {
        lastMoveGlitchAt = nowMs;
        for (let i = 0; i < MOVE_GLITCH_COUNT; i++) {
          let idx = Math.floor(Math.random() * cellCount);
          for (let guard = 0; guard < cellCount && !isHash[idx]; guard++) idx = (idx + 1) % cellCount;
          ambientGlitches.push({ idx, revertAt: nowMs + MOVE_GLITCH_FLASH_MS });
          atlasIndexAttr.array[idx] = randomScrambleIndex();
        }
        atlasIndexAttr.needsUpdate = true;
      }

      for (let i = ambientGlitches.length - 1; i >= 0; i--) {
        if (nowMs >= ambientGlitches[i].revertAt) {
          atlasIndexAttr.array[ambientGlitches[i].idx] = HASH_INDEX;
          atlasIndexAttr.needsUpdate = true;
          ambientGlitches.splice(i, 1);
        }
      }
    }

    // Tear steps — hard cuts, not eased, same cadence as PlayScreenTear.
    if (tearStartAt >= 0) {
      const tearElapsed = nowMs - tearStartAt;
      while (tearStepIndex < TEAR_STEPS.length && tearElapsed >= TEAR_STEPS[tearStepIndex].atMs) {
        const amplitude = TEAR_STEPS[tearStepIndex].amplitude;
        for (let r = 0; r < rowCount; r++) {
          rowOffsetX[r] = amplitude === 0 ? 0 : (Math.random() * 2 - 1) * amplitude;
        }
        applyRowOffsets();
        tearStepIndex++;
      }
      if (tearStepIndex >= TEAR_STEPS.length) tearStartAt = -1;
    }

    if (glowDirty) glowAttr.needsUpdate = true;

    smoothedLookAt.lerp(desiredLookAt, 0.08);
    group.lookAt(smoothedLookAt);

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(tick);

  function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("deviceorientation", onDeviceOrientation);
    tiltButton?.remove();
    geometry.dispose();
    material.dispose();
    atlasTexture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { dispose, triggerTear };
}
