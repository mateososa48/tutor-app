// One command for the LiveKit voice path (branch `livekit`):
//
//   npm run livekit            (add --no-app when a dev server is already up)
//
// starts, in order, and prefixes each one's output:
//   lk      livekit-server --dev (brew install livekit), ws://127.0.0.1:7880
//   voice   Kokoro on this machine, only when LIVEKIT_TTS=kokoro
//   agent   the LiveKit voice agent (agent/main.ts)
//   app     next dev on :3350 (PORT=…)
// Ctrl+C stops all of them. Open http://localhost:3350/session?voice=livekit.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || "3350";
const noApp = process.argv.includes("--no-app");
const kokoro = process.env.LIVEKIT_TTS === "kokoro";
const colors = { lk: 35, voice: 32, agent: 36, app: 33 };
const children = [];

function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  const tag = `\x1b[${colors[name]}m${name.padEnd(5)}\x1b[0m`;
  const out = (buf) => {
    for (const line of String(buf).split("\n")) {
      if (!line.trim()) continue;
      // The agent's framework logs are noisy; keep ours, warnings and errors.
      if (name === "agent" && !/\[chalk|WARN|ERROR|[Ee]rror|registered worker/.test(line)) continue;
      if (name === "lk" && !/starting LiveKit|ERROR/.test(line)) continue;
      console.log(`${tag} ${line}`);
    }
  };
  child.stdout.on("data", out);
  child.stderr.on("data", out);
  child.on("exit", (code) => console.log(`${tag} exited (${code ?? "signal"})`));
  children.push(child);
  return child;
}

function waitFor(child, pattern) {
  return new Promise((resolve) => {
    const check = (buf) => {
      if (pattern.test(String(buf))) resolve();
    };
    child.stdout.on("data", check);
    child.stderr.on("data", check);
  });
}

if (!existsSync("agent/node_modules")) {
  console.log("First run: installing the agent's packages (cd agent && npm install)…");
  await new Promise((r) => spawn("npm", ["install"], { cwd: "agent", stdio: "inherit" }).on("exit", r));
}

const lk = run("lk", "livekit-server", ["--dev", "--bind", "127.0.0.1", "--node-ip", "127.0.0.1"]);
await waitFor(lk, /starting LiveKit server/);
if (kokoro) {
  const voice = run("voice", "npm", ["run", "voice"], { cwd: "agent" });
  await waitFor(voice, /\[kokoro\] ready/);
}
const agent = run("agent", "npm", ["run", "dev"], { cwd: "agent" });
await waitFor(agent, /registered worker/);
// The app starts last: a room opened before the agent registers gets no tutor.
if (!noApp) run("app", "npx", ["next", "dev", "-p", PORT]);
console.log(`\nLiveKit tutor ready: http://localhost:${PORT}/session?voice=livekit  (Ctrl+C stops everything)\n`);

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
