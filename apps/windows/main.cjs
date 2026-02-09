const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");

let mainWindow;
let gatewayProcess;
let gatewayToken = "";
let gatewayConfigPath = "";
let gatewayStateDir = "";
let gatewayPort = 18789;
let controlUiUrl = "";
let uiRetries = 0;

function resolveRootDir() {
  if (!app.isPackaged) {
    return path.join(__dirname, "../..");
  }
  return process.resourcesPath;
}

function ensureLogStream() {
  const logDir = app.getPath("userData");
  const logPath = path.join(logDir, "tixbot.log");
  fs.mkdirSync(logDir, { recursive: true });
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  const write = (level, msg) => {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    stream.write(line);
  };
  return { logPath, write };
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function buildMinimalGatewayConfig(token) {
  return {
    gateway: {
      mode: "local",
      bind: "loopback",
      port: gatewayPort,
      auth: {
        mode: "token",
        token,
      },
      controlUi: {
        enabled: true,
        allowInsecureAuth: true,
      },
    },
  };
}

function ensureGatewayConfig(log) {
  gatewayStateDir = app.getPath("userData");
  gatewayConfigPath = path.join(gatewayStateDir, "openclaw.json");
  fs.mkdirSync(gatewayStateDir, { recursive: true });

  let existingToken = "";
  if (fs.existsSync(gatewayConfigPath)) {
    try {
      const raw = fs.readFileSync(gatewayConfigPath, "utf8");
      const parsed = JSON.parse(raw);
      const token =
        parsed &&
        parsed.gateway &&
        parsed.gateway.auth &&
        typeof parsed.gateway.auth.token === "string" &&
        parsed.gateway.auth.token.trim()
          ? parsed.gateway.auth.token.trim()
          : "";
      existingToken = token;
    } catch (err) {
      log.write("warn", `Failed to parse config, regenerating: ${String(err)}`);
    }
  }

  gatewayToken = existingToken || generateToken();
  const nextConfig = buildMinimalGatewayConfig(gatewayToken);
  fs.writeFileSync(gatewayConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  log.write("info", `Wrote gateway config: ${gatewayConfigPath}`);
}

function startGateway(rootDir, log) {
  if (gatewayProcess) {
    return;
  }

  const entryPath = path.join(rootDir, "openclaw.mjs");
  log.write("info", `Starting gateway via Electron-as-Node: ${entryPath}`);
  log.write("info", `Gateway config: ${gatewayConfigPath}`);

  gatewayProcess = spawn(
    process.execPath,
    [
      entryPath,
      "gateway",
      "--allow-unconfigured",
      "--auth",
      "token",
      "--token",
      gatewayToken,
      "--port",
      String(gatewayPort),
      "--bind",
      "loopback",
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        OPENCLAW_NO_RESPAWN: "1",
        OPENCLAW_SKIP_CHANNELS: "1",
        OPENCLAW_SKIP_RUNTIME_GUARD: "1",
        OPENCLAW_STATE_DIR: gatewayStateDir,
        OPENCLAW_CONFIG_PATH: gatewayConfigPath,
        OPENCLAW_GATEWAY_TOKEN: gatewayToken,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    },
  );

  gatewayProcess.stdout.on("data", (data) => {
    log.write("info", `gateway stdout: ${String(data).trim()}`);
  });

  gatewayProcess.stderr.on("data", (data) => {
    log.write("error", `gateway stderr: ${String(data).trim()}`);
  });

  gatewayProcess.on("exit", (code, signal) => {
    log.write("error", `gateway exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
    gatewayProcess = null;
  });

  gatewayProcess.on("error", (err) => {
    log.write(
      "error",
      `gateway spawn error: ${err && err.stack ? err.stack : String(err)}`,
    );
    gatewayProcess = null;
  });
}

function buildControlUiUrl() {
  const baseUrl = `http://127.0.0.1:${gatewayPort}/`;
  const params = new URLSearchParams({ token: gatewayToken });
  return `${baseUrl}?${params.toString()}`;
}

function createWindow() {
  const log = ensureLogStream();
  log.write("info", "TIXBOT starting...");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "TIXBOT 智能票务助手",
    autoHideMenuBar: true,
  });

  const rootDir = resolveRootDir();
  log.write("info", `Root dir: ${rootDir}`);

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    log.write("error", `UI failed to load: ${errorCode} ${errorDescription} ${validatedURL}`);
    if (
      validatedURL &&
      validatedURL.startsWith("http://127.0.0.1") &&
      uiRetries < 20
    ) {
      uiRetries += 1;
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.loadURL(controlUiUrl);
        }
      }, 500);
    }
  });

  ensureGatewayConfig(log);
  startGateway(rootDir, log);

  controlUiUrl = buildControlUiUrl();
  log.write("info", `Loading UI: ${controlUiUrl}`);
  mainWindow.loadURL(controlUiUrl);

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (gatewayProcess) {
    gatewayProcess.kill();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});
