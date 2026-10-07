// Ported from TERMINATED/Assets/Scripts/UI/DesktopShell.cs — same hand-authored
// 5-row block font and scramble glyph set the in-game ASCII banner uses, so the
// web hero reads as the same object, not a lookalike.

export const WORD = "TERMINATED";

export const SCRAMBLE_GLYPHS = [
  "#", "%", "@", "$", "&", "*", "<", ">", "/", "\\", "+", "=", "~", "?", "^",
];

const FONT = {
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  A: [" ### ", "#   #", "#####", "#   #", "#   #"],
  D: ["#### ", "#   #", "#   #", "#   #", "#### "],
};

const ROWS = 5;
const COLS_PER_LETTER = 6; // 5 glyph columns + 1 gap column, always blank in the final art

export function buildBanner(word) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = "";
    for (const ch of word) {
      const glyph = FONT[ch];
      if (!glyph) continue;
      line += glyph[r] + " ";
    }
    rows.push(line);
  }
  return { rows, rowCount: ROWS, colCount: word.length * COLS_PER_LETTER, colsPerLetter: COLS_PER_LETTER };
}
