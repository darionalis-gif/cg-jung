// why the search elects the back of the head it is supposed to be avoiding: dump every candidate
// the sweep scored on one beat, with the verdict flags, at the instant the still is taken.
import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const OUT = path.join(HERE, 'out', args.round || 'r140a');
const id = args.id, bi = +args.beat;
const scene = JSON.parse(readFileSync(path.join(OUT, id, 'raw.json'), 'utf8'));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
const start = scene.beats.slice(0, bi).reduce((a, b) => a + b.dur, 0), dur = scene.beats[bi].dur;
const at = start + dur * (args.f ? +args.f : 0.55);
await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, start);
await page.waitForTimeout(120);
await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true;
  for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, at);
const pre = await page.evaluate(id2 => { const S = window.__somnium.Stage; const rec = S.actors.get(id2); const st = S.states.get(id2);
  const p = S.camera.position, l = S.cam.look;
  const toCam = { x: p.x - st.pos[0], z: p.z - st.pos[2] }; const L = Math.hypot(toCam.x, toCam.z) || 1;
  const fy = S.faceYaw(id2, st) * Math.PI / 180; const fc = { x: Math.sin(fy), z: Math.cos(fy) };
  return { stYaw: +st.yaw.toFixed(1), visYaw: +(rec.g.userData.visYaw * 180 / Math.PI).toFixed(1), faceYaw: +S.faceYaw(id2, st).toFixed(1),
    front: +((toCam.x * fc.x + toCam.z * fc.z) / L).toFixed(3), t: +S.time.toFixed(2),
    cam: [p.x, p.y, p.z].map(x => +x.toFixed(1)), look: [l.x, l.y, l.z].map(x => +x.toFixed(1)), hold: !!S.shotHold, pick: S.framePick && { az: S.framePick.az, smAz: +(S.framePick.smAz || 0).toFixed(1), mul: S.framePick.mul } }; }, args.who || 'me');
console.log('AT RENDER', JSON.stringify(pre));
if (args.az !== undefined) await page.evaluate(a => { window.__azf = +a; }, args.az);
const o = await page.evaluate(() => { const S = window.__somnium.Stage;
  S.debugFrames = true; S.shotHold = null; S.framePick = null; S._authPick = null; S.evaluate(0, false); S.debugFrames = false;
  let sc = (S.frameScan || []).slice(); if (window.__azf !== undefined) sc = sc.filter(q => q.az === window.__azf); sc.sort((a, b) => (b.score || -1e9) - (a.score || -1e9));
  return { t: +S.time.toFixed(2), n: (S.frameScan || []).length, top: sc.slice(0, 14), dbg: S.saveDbg,
    cam: S.camera.position.toArray().map(x => +x.toFixed(1)), look: S.cam.look.toArray().map(x => +x.toFixed(1)) }; });
console.log(id, 'b' + bi, 't=' + o.t, 'candidates', o.n);
console.log('cam', o.cam, '->', o.look, 'guarantee', JSON.stringify(o.dbg));
for (const c of o.top) console.log(' ', JSON.stringify(c));
await browser.close(); server.close();
