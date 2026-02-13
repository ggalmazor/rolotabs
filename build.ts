/**
 * Build script: bundles TypeScript source into plain JS for the Chrome extension.
 *
 * Usage:
 *   deno run -A build.ts          # one-shot build
 *   deno run -A build.ts --watch  # rebuild on changes
 */

import * as esbuild from "esbuild";

const isWatch = Deno.args.includes("--watch");

const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  format: "iife" as const,
  target: "chrome114",
  outdir: "extension/dist",
  logLevel: "info",
};

const entryPoints = [
  { in: "src/background.ts", out: "background" },
  { in: "src/sidepanel.ts", out: "sidepanel" },
];

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context({
      ...commonOptions,
      entryPoints,
    });
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build({
      ...commonOptions,
      entryPoints,
    });
    esbuild.stop();
  }
}

build();
