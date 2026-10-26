// Read-only media probe for this app's ADB-forwarded WebView debugging socket.
// Usage: node scripts/probe.mjs --port 9222 --seconds 15 --out artifacts/playback.json
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const port = Number(option('--port', '9222'));
const seconds = Number(option('--seconds', '15'));
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
  throw new Error('Use a local port from 1024 to 65535 and a duration from 1 to 60 seconds.');
}
const output = resolve(option('--out', 'artifacts/playback.json'));
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
const target = targets.find(item => {
  try {
    const url = new URL(item.url);
    return item.type === 'page' && url.protocol === 'https:' && (url.hostname === 'douyin.com' || url.hostname.endsWith('.douyin.com'));
  } catch { return false; }
});
if (!target) throw new Error('No Douyin page found in the forwarded app WebView.');
const socketUrl = new URL(target.webSocketDebuggerUrl);
if (!['127.0.0.1', 'localhost'].includes(socketUrl.hostname) || socketUrl.protocol !== 'ws:') {
  throw new Error('Refusing a non-local debugging endpoint.');
}
const socket = new WebSocket(socketUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject, timeout } = pending.get(message.id);
  clearTimeout(timeout);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error('Page evaluation failed.');
  return response.result.value;
}
try {
  const environment = await evaluate(`({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight,
    devicePixelRatio, visibility: document.visibilityState, readyState: document.readyState })`);
  const script = await readFile(new URL('../app/src/main/assets/playback-diagnostics.js', import.meta.url), 'utf8');
  const samples = [];
  console.log(`Sampling app media state for ${seconds} seconds. No account data or media URLs are collected.`);
  for (let index = 0; index < seconds; index++) {
    samples.push({ at: new Date().toISOString(), ...JSON.parse(await evaluate(script)) });
    if (index + 1 < seconds) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const report = { capturedAt: new Date().toISOString(), environment, samples };
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved ${output}`);
} finally {
  socket.close();
}
