import { SCRAMBLE_GLYPHS } from "./font.js";

// Same hard-cut, escalating-intensity cadence as the logo's hover tear
// (asciiLogo.js TEAR_STEPS / the game's own PlayScreenTear) — applied to a
// plain text node instead of the glyph grid, so DOM headings can join the
// same "something just destabilized" moment on hover.
const STEPS = [
  { atMs: 0, intensity: 0.35 },
  { atMs: 70, intensity: 0.65 },
  { atMs: 150, intensity: 0.95 },
  { atMs: 230, intensity: 0 },
];

function randomGlyph() {
  return SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
}

export function createTextGlitch(element) {
  const original = element.textContent;
  let timeouts = [];

  function render(intensity) {
    element.textContent =
      intensity === 0
        ? original
        : original
            .split("")
            .map((ch) => (ch === " " ? ch : Math.random() < intensity ? randomGlyph() : ch))
            .join("");
  }

  function trigger() {
    timeouts.forEach(clearTimeout);
    timeouts = STEPS.map((step) => setTimeout(() => render(step.intensity), step.atMs));
  }

  return { trigger };
}
