// Re-renders a round's captures from its saved stage scripts in the CURRENT build, without
// asking Claude again. Use after a renderer fix, so the critics judge the fix rather than the
// build that happened to be live when the scripts were generated.
// usage: node harness/rerender.mjs --in=harness/out/r7 --out=harness/out/r7b
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const IN = args.in || path.join(HERE, 'out', 'r7');
const OUT = args.out || (IN + 'b'); mkdirSync(OUT, { recursive: true });
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const prev = JSON.parse(readFileSync(path.join(IN, 'summary.json'), 'utf8'));
const ids = args.ids ? String(args.ids).split(',') : prev.filter(r => r.ok).map(r => r.id);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const summary = [];

for (const id of ids) {
  const src = path.join(IN, id); if (!existsSync(path.join(src, 'scene.json'))) { log('skip', id); continue; }
  const dir = path.join(OUT, id); mkdirSync(dir, { recursive: true });
  for (const f of ['scene.json', 'raw.json', 'scene-after-edit.json']) if (existsSync(path.join(src, f))) copyFileSync(path.join(src, f), path.join(dir, f));
  // prefer what Claude actually answered: a normaliser fix cannot be judged against a scene the
  // old normaliser has already moved things in
  const rawF = path.join(src, 'raw.json');
  let scene = JSON.parse(readFileSync(path.join(src, 'scene.json'), 'utf8'));
  if (args.raw !== false && existsSync(rawF)) { try { const r0 = JSON.parse(readFileSync(rawF, 'utf8')); if (r0 && Array.isArray(r0.actors) && r0.actors.length) scene = r0; } catch (e) { } }
  const before = prev.find(r => r.id === id) || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  const load = async s => page.evaluate(x => { const S = window.__somnium; const d = { id: 'rr', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, s);
  // write down the scene that was actually performed, not the one the old build normalised: a
  // critic reading scene.json beside these screenshots has to be reading the same scene
  let usedScene = null;
  await load(scene);
  usedScene = await page.evaluate(() => window.__somnium.App.exportScene(window.__somnium.App.cur.scene));
  const beats = scene.beats; const shots = []; let t = 0;
  for (let i = 0; i < beats.length; i++) {
    const mid = t + beats[i].dur * 0.5;
    await page.evaluate(m => { window.__somnium.Stage.setTime(m); window.__somnium.Stage.playing = false; }, mid); await page.waitForTimeout(240);
    const settle = () => page.evaluate(async () => { const S = window.__somnium.Stage; let last = null;
      for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r));
        const now = S.camera.position.clone().add(S.cam.look);
        if (last && now.distanceTo(last) < 0.002) return k; last = now; } return -1; });
    // let the camera come to rest BEFORE the first sample too: motion used to be measured from a
    // frame taken while the shot was still being solved, so in the beats that solve slowly it was
    // reporting camera travel rather than anything the actors did
    const settled = await settle();
    const p1 = await page.evaluate(() => window.__somnium.pixels());
    await page.evaluate(() => { window.__somnium.Stage.playing = true; }); await page.waitForTimeout(700);
    const p2 = await page.evaluate(() => window.__somnium.pixels()); await page.evaluate(() => { window.__somnium.Stage.playing = false; });
    const diff = p1.reduce((s, v, k) => s + Math.abs(v - p2[k]), 0) / p1.length;
    // and NOT a second settle: with time frozen the lens goes on easing toward a pose the viewer
    // only reaches if the beat continues, so the still stopped being the frame anybody sees. What
    // is recorded instead is how far the lens still had to travel at the moment playback stopped.
    const settled2 = await page.evaluate(async () => { const S = window.__somnium.Stage;
      const a0 = S.camera.position.clone(); await new Promise(r => requestAnimationFrame(r));
      return +S.camera.position.distanceTo(a0).toFixed(3); });
    const m = await page.evaluate(() => window.__somnium.Stage.metrics());
    const file = `beat-${String(i + 1).padStart(2, '0')}.png`; await page.screenshot({ path: path.join(dir, file) });
    shots.push({ beat: i + 1, file, start: +t.toFixed(1), dur: beats[i].dur, text: beats[i].text, motion: +diff.toFixed(2), settleFrames: [settled, settled2], metrics: m });
    t += beats[i].dur;
  }
  let moveAt = 0.5; { let acc = 0; for (const b of beats) { if (b.actions.some(x => x.actor && (x.move || (x.state && x.state !== 'idle')))) { moveAt = acc + 0.4; break; } acc += b.dur; } }
  await page.evaluate(m => { window.__somnium.Stage.setTime(m); window.__somnium.Stage.playing = true; }, moveAt);
  for (let k = 0; k < 6; k++) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(dir, `play-${k + 1}.png`) }); }
  const fps = await page.evaluate(() => { const ft = window.__somnium.Stage.frameTimes.slice(-120); return ft.length ? +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1) : 0; });
  await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(dir, 'phone.png') }); await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
  let edit = null;
  const afterFile = path.join(src, 'scene-after-edit.json');
  if (existsSync(afterFile)) {
    await page.evaluate(() => { window.__somnium.Stage.setTime(0.5); window.__somnium.Stage.playing = false; }); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(dir, 'edit-before.png') });
    await load(JSON.parse(readFileSync(afterFile, 'utf8')));
    await page.evaluate(() => { window.__somnium.Stage.setTime(0.5); window.__somnium.Stage.playing = false; }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(dir, 'edit-after.png') });
    edit = before.edit ? { ...before.edit } : null;
  }
  const rec = { id, ok: true, title: scene.title, genSec: before.genSec, beats: beats.length, total: +beats.reduce((s, b) => s + b.dur, 0).toFixed(0), actors: scene.actors.length, fps, errors: [...new Set(errors)].slice(0, 20), shots, edit, rerenderedFrom: IN };
  if (usedScene) { copyFileSync(path.join(dir, 'scene.json'), path.join(dir, 'scene-as-given.json'));
    writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(usedScene, null, 1)); }
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify(rec, null, 1)); summary.push(rec);
  log('rendered', id, `${beats.length} beats, ${fps} fps, ${errors.length} console lines`);
  await ctx.close();
}
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
await browser.close(); server.close(); log('done ->', OUT);
