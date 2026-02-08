import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function resolveElectronCommand() {
  if (process.env.MOLTBOT_ELECTRON_BIN) {
    return process.env.MOLTBOT_ELECTRON_BIN;
  }
  return process.platform === "win32" ? "electron.cmd" : "electron";
}

const electronCmd = resolveElectronCommand();
const mainPath = fileURLToPath(new URL("./main.mjs", import.meta.url));
const child = spawn(electronCmd, [mainPath], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(
    `[windows-shell] Failed to start Electron (${electronCmd}). ` +
      "Provide Electron via PATH or set MOLTBOT_ELECTRON_BIN.",
    error
  );
  process.exit(1);
});
