// pegasus b9 ("then we were down in the hold"): the lens sits outside the cave shell and every
// named actor reads occluded.  Walk the beat in story time and print, at each 0.4 s checkpoint,
// where the shot is, whether the hold survived, and what roomAround makes of it.
import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', args.round || 'r134');
const id = args.id || 'pegasus-1015', bi = +(args.beat === undefined ? 8 : args.beat);
const scene = JSON.parse(readFileSync(path.join(OUT, id, 'raw.json'), 'utf8'));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
const start = scene.beats.slice(0, bi).reduce((a, b) => a + b.dur, 0), dur = scene.beats[bi].dur;
console.log(`${id} b${bi} "${scene.beats[bi].text}"  start=${start} dur=${dur}`);
await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, start);
await page.waitForTimeout(150);
for (let k = 1; k * 0.4 < dur; k++) {
  const m = start + k * 0.4;
  await page.evaluate(async mm => { const S = window.__somnium.Stage; S.playing = true;
    for (let j = 0; j < 4000; j++) { if (S.time >= mm) break; await new Promise(r => requestAnimationFrame(r)); }
    S.playing = false; }, m);
  const o = await page.evaluate(() => { const S = window.__somnium.Stage;
    const p = S.camera.position, l = S.cam.look;
    const rmL = S.roomAround(l), rmP = S.roomAround(p);
    const f = n => +n.toFixed(1);
    const box = r => r ? [f(r.box.min.x), f(r.box.max.x), f(r.box.min.z), f(r.box.max.z), f(r.box.max.y)].join('/') : '-';
    return { t: +S.time.toFixed(2), pos: [f(p.x), f(p.y), f(p.z)], look: [f(l.x), f(l.y), f(l.z)],
      hold: S.shotHold ? { tick: S.shotHold.tick, weak: !!S.shotHold.weak } : null,
      pick: S.framePick ? { az: S.framePick.az, mul: S.framePick.mul, tier: S.framePick.tier, settled: !!S.framePick.settled } : null,
      shotOk: S._shotOk,
      roomLook: rmL ? rmL.rec.a.id + ' ' + box(rmL) : '-', roomPos: rmP ? rmP.rec.a.id : '-',
      fin: S._dbgFinal ? { held: S._dbgFinal.held, tick: S._dbgFinal.tick, pos: S._dbgFinal.pos.map(f), rm: S._dbgFinal.rm, saves: S._dbgFinal.saves } : null,
      dress: S._dbgDress ? { rm: S._dbgDress.rm, l: S._dbgDress.l.map(f), p: S._dbgDress.p.map(f) } : null,
      vis: S.metrics().actors.map(a => a.id + (a.onScreen ? '+' : a.occluded ? 'X' : '-')).join(' ') }; });
  console.log(JSON.stringify(o));
}
await browser.close(); server.close();
