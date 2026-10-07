import "./style.css";
import { createAsciiLogo } from "./hero/asciiLogo.js";
import { createTextGlitch } from "./hero/textGlitch.js";

const heroCanvas = document.getElementById("hero-canvas");
const hero = createAsciiLogo(heroCanvas);

const wishlistTitle = document.querySelector(".wishlist-title");
const titleGlitch = wishlistTitle ? createTextGlitch(wishlistTitle) : null;

document.querySelectorAll(".corner-link, .btn-wishlist").forEach((link) => {
  link.addEventListener("pointerenter", () => {
    hero.triggerTear();
    titleGlitch?.trigger();
  });
});
