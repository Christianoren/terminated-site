import "./style.css";
import { createAsciiLogo } from "./hero/asciiLogo.js";

const heroCanvas = document.getElementById("hero-canvas");
const hero = createAsciiLogo(heroCanvas);

document.querySelectorAll(".corner-link").forEach((link) => {
  link.addEventListener("pointerenter", () => hero.triggerTear());
});
