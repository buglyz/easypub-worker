import { build } from "esbuild";

await build({
  entryPoints: ["src/client/local-worker.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outfile: "src/static/local-worker.js",
  minify: true,
  sourcemap: false,
  legalComments: "none",
});
