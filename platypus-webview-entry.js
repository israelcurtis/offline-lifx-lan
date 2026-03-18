#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const launcherPath = path.join(appRootDir, "src", "launcher.js");
const controllerUrl = "http://127.0.0.1:3000";

const child = spawn(process.execPath, [launcherPath], {
  cwd: appRootDir,
  stdio: "ignore",
  env: process.env
});

let shuttingDown = false;

function stopChild(signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));
process.on("exit", () => stopChild("SIGTERM"));

child.on("exit", () => {
  if (!shuttingDown) {
    process.exit(0);
  }
});

process.stdout.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LIFX LAN Controller</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        background: #efe7d8;
        color: #1f1a16;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(255, 232, 198, 0.9), transparent 40%),
          linear-gradient(180deg, #f4ede1 0%, #ebe2d2 100%);
      }

      main {
        width: min(560px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 28px;
        background: rgba(255, 251, 245, 0.86);
        border: 1px solid rgba(76, 61, 42, 0.12);
        box-shadow: 0 24px 80px rgba(114, 91, 56, 0.16);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 32px;
        line-height: 1.05;
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.5;
        color: rgba(31, 26, 22, 0.78);
      }

      .status {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(76, 61, 42, 0.1);
        font-weight: 600;
      }

      .actions {
        margin-top: 18px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      a,
      button {
        appearance: none;
        border: 1px solid rgba(76, 61, 42, 0.14);
        background: rgba(255, 255, 255, 0.92);
        color: #1f1a16;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }

      .note {
        margin-top: 16px;
        font-size: 14px;
        color: rgba(31, 26, 22, 0.6);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>LIFX LAN Controller</h1>
      <p>The local controller is starting. This window will switch to the live interface as soon as the server responds.</p>
      <div class="status" id="status">Starting local server…</div>
      <div class="actions">
        <a href="${controllerUrl}">Open Controller</a>
        <button type="button" id="retry">Retry Now</button>
      </div>
      <div class="note">If the controller is already running, this window should connect in a moment without starting a duplicate instance.</div>
    </main>
    <script>
      const controllerUrl = ${JSON.stringify(controllerUrl)};
      const statusEl = document.getElementById("status");
      const retryButton = document.getElementById("retry");
      let attempts = 0;

      async function tryConnect() {
        attempts += 1;
        statusEl.textContent = attempts === 1
          ? "Waiting for local server…"
          : \`Waiting for local server… (attempt \${attempts})\`;

        try {
          await fetch(\`\${controllerUrl}/api/status\`, { mode: "no-cors", cache: "no-store" });
          statusEl.textContent = "Controller ready. Opening interface…";
          window.location.replace(controllerUrl);
          return;
        } catch (error) {
          // Keep retrying until the local server is ready.
        }

        window.setTimeout(tryConnect, 750);
      }

      retryButton.addEventListener("click", () => {
        attempts = 0;
        void tryConnect();
      });

      void tryConnect();
    </script>
  </body>
</html>
`);
