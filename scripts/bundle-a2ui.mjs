import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const hashFile = path.join(rootDir, "src", "canvas-host", "a2ui", ".bundle.hash");
const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
const rendererDir = path.join(rootDir, "vendor", "a2ui", "renderers", "lit");
const appDir = path.join(rootDir, "apps", "shared", "OpenClawKit", "Tools", "CanvasA2UI");

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(entryPath, files) {
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry), files);
    }
    return;
  }
  files.push(entryPath);
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

async function computeHash(inputPaths) {
  const files = [];
  for (const input of inputPaths) {
    await walk(input, files);
  }
  files.sort((a, b) => normalize(a).localeCompare(normalize(b)));
  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalize(path.relative(rootDir, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const main = async () => {
  const rendererExists = await exists(rendererDir);
  const appExists = await exists(appDir);
  if (!rendererExists || !appExists) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    return;
  }

  const inputPaths = [
    path.join(rootDir, "package.json"),
    path.join(rootDir, "pnpm-lock.yaml"),
    rendererDir,
    appDir,
  ];

  const currentHash = await computeHash(inputPaths);
  if (await exists(hashFile)) {
    const previousHash = (await fs.readFile(hashFile, "utf8")).trim();
    if (previousHash === currentHash && (await exists(outputFile))) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpmCmd, ["-s", "exec", "tsc", "-p", path.join(rendererDir, "tsconfig.json")]);
  run(pnpmCmd, [
    "-s",
    "exec",
    "rolldown",
    "-c",
    path.join(appDir, "rolldown.config.mjs"),
  ]);

  await fs.writeFile(hashFile, `${currentHash}\n`);
};

main().catch((err) => {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
  console.error(err);
  process.exit(1);
});
