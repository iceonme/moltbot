import { app, BrowserWindow, Menu, shell } from "electron";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { defaultConfigTemplate } from "./config-template.mjs";

const GATEWAY_URL = "http://127.0.0.1:18789/";
const STATE_DIR = join(homedir(), ".clawdbot");
const CONFIG_PATH = join(STATE_DIR, "moltbot.json");
const ENV_PATH = join(STATE_DIR, ".env");
const LOG_PATH = join(STATE_DIR, "gateway-electron.log");
const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let gatewayProcess = null;

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function ensureEnvFile() {
  ensureParentDir(ENV_PATH);
  if (!existsSync(ENV_PATH)) {
    const token = randomBytes(24).toString("hex");
    const content = [
      `CLAWDBOT_GATEWAY_TOKEN=${token}`,
      "OPENROUTER_API_KEY=replace-with-your-openrouter-key"
    ].join("\n");
    writeFileSync(ENV_PATH, `${content}\n`, "utf8");
  }

  const envLines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  const envVars = {};
  for (const line of envLines) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    envVars[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return envVars;
}

function ensureConfigFile() {
  ensureParentDir(CONFIG_PATH);
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, defaultConfigTemplate, "utf8");
  }
}

function startGateway() {
  if (gatewayProcess && !gatewayProcess.killed) return;

  const extraEnv = ensureEnvFile();
  ensureConfigFile();

  const command = process.env.MOLTBOT_BIN ?? "moltbot";
  gatewayProcess = spawn(command, ["gateway", "run", "--bind", "loopback", "--port", "18789", "--force"], {
    cwd: homedir(),
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });

  ensureParentDir(LOG_PATH);
  const logStream = createWriteStream(LOG_PATH, { flags: "a" });
  gatewayProcess.stdout?.pipe(logStream);
  gatewayProcess.stderr?.pipe(logStream);
  gatewayProcess.on("exit", () => {
    gatewayProcess = null;
  });
}

function stopGateway() {
  if (!gatewayProcess) return;
  gatewayProcess.kill();
  gatewayProcess = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.mjs")
    }
  });

  void mainWindow.loadURL(GATEWAY_URL);

  const menu = Menu.buildFromTemplate([
    {
      label: "Moltbot",
      submenu: [
        {
          label: "Open Logs Folder",
          click: async () => shell.openPath(STATE_DIR)
        },
        {
          label: "Restart Gateway",
          click: () => {
            stopGateway();
            startGateway();
          }
        },
        { role: "quit" }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startGateway();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopGateway();
});
