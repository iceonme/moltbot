# Moltbot Windows Shell (x64)

Electron shell for a simplified Windows desktop experience:

- Runs Moltbot Gateway in **local mode** (`loopback`, port `18789`)
- Opens the built-in Control UI at `http://127.0.0.1:18789/`
- Generates first-run defaults under `~/.clawdbot/`
- Preseeds model config with `openrouter/deepseek/deepseek-r1:free`

## First run

1. Install Moltbot CLI (`moltbot` must be on `PATH`) or set `MOLTBOT_BIN`.
2. Provide Electron via PATH (e.g. `electron`) or set `MOLTBOT_ELECTRON_BIN`.
3. Run:

```bash
pnpm --filter @moltbot/windows-shell start
```

4. Edit `~/.clawdbot/.env` and set `OPENROUTER_API_KEY`.

## Why this package has no npm dependencies

Some environments block direct fetches from `registry.npmjs.org`.
This package avoids hard dependencies so workspace installs can still succeed in restricted environments.

## Notes

- This package targets Windows x64 as the first delivery.
- The shell intentionally keeps the backend service local-only.
