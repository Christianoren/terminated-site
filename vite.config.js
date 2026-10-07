import { defineConfig } from "vite";

// Served at https://christianoren.github.io/terminated-site/ — GitHub Pages
// project sites live under a /<repo-name>/ subpath, so every asset reference
// needs that prefix. Switch this back to "/" (and add a public/CNAME file)
// if a custom domain is pointed at the repo instead.
export default defineConfig({
  base: "/terminated-site/",
});
