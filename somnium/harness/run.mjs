// Somnium end-to-end harness: serves the app with a mocked `claude.use('sample')`
// that routes every prompt to the real Claude (via the `claude -p` CLI), drives the
// page over real DreamBank dreams with Playwright, and records screenshots + metrics.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const HTML = args.html || path.join(HERE, '..', 'index.html');
const OUT = args.out || path.join(HERE, 'out'); mkdirSync(OUT, { recursive: true });
const MODEL = args.model || 'opus';
const EXAMPLES = JSON.parse(readFileSync(args.examples || path.join(HERE, 'examples.json'), 'utf8'));
const IDS = args.dreams ? String(args.dreams).split(',') : EXAMPLES.slice(0, 6).map(e => e.id);
const EDIT = args.edit === undefined ? 'Make the whole scene feel more threatening: darker sky, heavier fog, and put a large red moon low over the horizon.' : (args.edit || null);
const CWD = path.join(OUT, '_cli'); mkdirSync(CWD, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let spend = 0;

function askOnce(prompt) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'json', '--session-id', randomUUID(), '--effort', args.effort || 'high'], { cwd: CWD, env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', code => { let j = null; try { j = JSON.parse(out); } catch (e) {} if (!j) return reject(new Error('claude exited ' + code + ': ' + (err || out).slice(0, 300))); if (j.is_error) return reject(Object.assign(new Error('api: ' + String(j.result).slice(0, 200)), { retryable: true })); spend += j.total_cost_usd || 0; log(`claude answered in ${((Date.now() - t0) / 1000).toFixed(0)}s, $${(j.total_cost_usd || 0).toFixed(3)}, total $${spend.toFixed(2)}`); resolve(j.result || ''); });
    p.stdin.write(prompt); p.stdin.end();
  });
}
async function askClaude(prompt) {
  for (let i = 0; i < 4; i++) { try { return await askOnce(prompt); } catch (e) { log('claude call failed:', e.message); if (!e.retryable || i === 3) throw e; await new Promise(r => setTimeout(r, 45000 * (i + 1))); } }
}
const html = readFileSync(HTML, 'utf8');
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); return; }
  let body = ''; req.on('data', d => body += d); req.on('end', async () => { try { const { input } = JSON.parse(body); const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\n'); const text = await askClaude(prompt); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text })); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); } });
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const summary = [];
for (const id of IDS) {
  const ex = EXAMPLES.find(e => e.id === id); if (!ex) { log('unknown dream', id); continue; }
  const dir = path.join(OUT, id); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errors = [], logs = [];
  page.on('console', m => { const t = m.type() + ': ' + m.text(); logs.push(t); if (m.type() === 'error' || m.type() === 'warning') errors.push(t); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    const sample = async (input, opts = {}) => { const r = await fetch('/sample', { method: 'POST', body: JSON.stringify({ input }) }); const j = await r.json(); if (j.error) throw { code: 'error', message: j.error }; opts.onText && opts.onText({ text: j.text, delta: j.text }); return { text: j.text, truncated: false, modelTierApplied: opts.modelTier || 'default' }; };
    sample.json = async (input, opts) => { const { text } = await sample(input, opts); let s = text.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1]; const a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw { code: 'invalid_json', message: 'not json', text }; } };
    sample.limits = async () => ({ inputBytes: 400000 });
    window.claude = { use: async name => name === 'sample' ? sample : null };
  });
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: new URL('./vendor/three.min.js', import.meta.url).pathname, contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready);
  log('generating', id); const t0 = Date.now();
  const d = await page.evaluate(async ([text, src]) => { const d = await window.__somnium.App.generate(text, src); return d ? { scene: window.__somnium.App.exportScene(d.scene), raw: d.raw } : null; }, [ex.text, { id: ex.id, seriesName: ex.seriesName, num: ex.num }]);
  if (!d) { summary.push({ id, ok: false, errors }); log('generation failed', id, errors.slice(-3)); await ctx.close(); continue; }
  writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(d.scene, null, 1)); writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(d.raw, null, 1));
  const genSec = (Date.now() - t0) / 1000; const beats = d.scene.beats; const shots = [];
  await page.evaluate(() => { window.__somnium.Stage.playing = false; });
  let t = 0; const motion = [];
  for (let i = 0; i < beats.length; i++) {
    const mid = t + beats[i].dur * 0.5;
    await page.evaluate(m => { window.__somnium.Stage.setTime(m); window.__somnium.Stage.playing = false; }, mid); await page.waitForTimeout(250);
    const p1 = await page.evaluate(() => window.__somnium.pixels());
    await page.evaluate(() => { window.__somnium.Stage.playing = true; }); await page.waitForTimeout(700);
    const p2 = await page.evaluate(() => window.__somnium.pixels()); await page.evaluate(() => { window.__somnium.Stage.playing = false; });
    const diff = p1.reduce((s, v, k) => s + Math.abs(v - p2[k]), 0) / p1.length;
    const m = await page.evaluate(() => window.__somnium.Stage.metrics());
    const file = `beat-${String(i + 1).padStart(2, '0')}.png`; await page.screenshot({ path: path.join(dir, file) });
    shots.push({ beat: i + 1, file, start: +t.toFixed(1), dur: beats[i].dur, text: beats[i].text, motion: +diff.toFixed(2), metrics: m });
    t += beats[i].dur;
  }
  // a few frames of the first beat while playing, to judge the animation itself
  await page.evaluate(() => { window.__somnium.Stage.setTime(0.5); window.__somnium.Stage.playing = true; });
  for (let k = 0; k < 3; k++) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(dir, `play-${k + 1}.png`) }); }
  const fps = await page.evaluate(() => { const ft = window.__somnium.Stage.frameTimes.slice(-120); return ft.length ? +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1) : 0; });
  // phone layout
  await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(dir, 'phone.png') }); await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
  let edit = null;
  if (EDIT) { log('director request', id); const before = JSON.stringify(d.scene); await page.evaluate(() => { window.__somnium.Stage.setTime(0.5); window.__somnium.Stage.playing = false; }); await page.screenshot({ path: path.join(dir, 'edit-before.png') });
    const r = await page.evaluate(async req => { const d = await window.__somnium.App.direct(req); return d ? { scene: window.__somnium.App.exportScene(d.scene), reply: d.chat[d.chat.length - 1].text } : { error: window.__somnium.App.cur.chat.slice(-1)[0].text }; }, EDIT);
    await page.evaluate(() => { window.__somnium.Stage.setTime(0.5); window.__somnium.Stage.playing = false; }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(dir, 'edit-after.png') });
    edit = { request: EDIT, reply: r.reply || null, error: r.error || null, changed: r.scene ? JSON.stringify(r.scene) !== before : false, worldAfter: r.scene ? r.scene.world : null }; if (r.scene) writeFileSync(path.join(dir, 'scene-after-edit.json'), JSON.stringify(r.scene, null, 1)); }
  const rec = { id, ok: true, title: d.scene.title, genSec: +genSec.toFixed(0), beats: beats.length, total: +beats.reduce((s, b) => s + b.dur, 0).toFixed(0), actors: d.scene.actors.length, fps, errors: [...new Set(errors)].slice(0, 20), shots, edit };
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify(rec, null, 1)); summary.push(rec); log('done', id, `${beats.length} beats, ${d.scene.actors.length} actors, ${fps} fps, errors ${errors.length}`);
  await ctx.close();
}
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
log('spend $' + spend.toFixed(2)); await browser.close(); server.close();
