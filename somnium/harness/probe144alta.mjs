// r144 technical review: why does alta-263 b9 land 19.6 m apart between the harness capture
// (seek to 1.6 s before the cut, play in) and a continuous playthrough?  Steps both passes frame
// by frame across the b8->b9 cut and dumps the shot-election state at every frame.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const OUT = path.join(HERE, 'out', args.round || 'r144');
const id = args.id || 'alta-263';
const CUT = +(args.cut || 61);          // story time of the beat boundary under test
const SAMPLE = +(args.sample || 64.53); // the time the shipped still was taken at
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rawOf = i => { const p = path.join(OUT, i, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return JSON.parse(readFileSync(path.join(OUT, i, 'scene.json'), 'utf8')); };
const scene = rawOf(id);
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
  return { ctx, page };
};
const dump = page => page.evaluate(() => { const S = window.__somnium.Stage;
  const v = q => q ? [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3)] : null;
  const st = {}; for (const [k, s] of S.states) st[k] = { p: s.pos.map(q => +q.toFixed(3)), yaw: +(+s.yaw).toFixed(2), op: +(+s.op).toFixed(3), st: s.state, mv: +(s.moving || 0).toFixed(3), sz: s.size };
  const vy = {}; for (const [k, rec] of S.actors) if (rec.g.userData.visYaw !== undefined) vy[k] = +rec.g.userData.visYaw.toFixed(4);
  return { t: +S.time.toFixed(4), beat: S.lastBeat, cam: v(S.camera.position), look: v(S.cam.look), fov: +S.camera.fov.toFixed(2),
    framePick: S.framePick ? { beat: S.framePick.beat, tick: S.framePick.tick, az: S.framePick.az, mul: S.framePick.mul, score: +(S.framePick.score || 0).toFixed(3), settled: !!S.framePick.settled, saves: S.framePick.saves || 0, smAz: S.framePick.smAz, smMul: S.framePick.smMul } : null,
    shotHold: S.shotHold ? { beat: S.shotHold.beat, tick: S.shotHold.tick, rel: S.shotHold.rel, weak: !!S.shotHold.weak, off: v(S.shotHold.off), lookOff: v(S.shotHold.lookOff) } : null,
    authPick: S._authPick || null, nearAuthored: S.nearAuthored, snap: S.cam.snap, rush: S._rush, smoothYaw: S.smoothYaw === undefined ? null : +S.smoothYaw.toFixed(3), states: st, visYaw: vy }; });

const run = async (label, seekTo) => {
  const { ctx, page } = await newPage();
  await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, seekTo);
  await page.evaluate(async () => { for (let k = 0; k < 3; k++) await new Promise(r => requestAnimationFrame(r)); });
  // play up to 0.5 s before the cut without recording
  await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true; for (let k = 0; k < 8000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, CUT - 0.5);
  const rows = [{ tag: 'pre', ...(await dump(page)) }];
  // then frame by frame across the cut
  for (let k = 0; k < 12; k++) {
    await page.evaluate(async () => { const S = window.__somnium.Stage; S.playing = true; await new Promise(r => requestAnimationFrame(r)); S.playing = false; });
    rows.push({ tag: 'f' + k, ...(await dump(page)) });
  }
  await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true; for (let k = 0; k < 8000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, SAMPLE);
  rows.push({ tag: 'sample', ...(await dump(page)) });
  await page.screenshot({ path: path.join(HERE, 'out', `probe144alta-${label}.png`) });
  await ctx.close();
  return rows;
};
const A = await run('A', args.seekA !== undefined ? +args.seekA : Math.max(0, CUT - 1.6));
const B = await run('B', 0);
const keep = r => ({ t: r.t, beat: r.beat, cam: r.cam, look: r.look, fov: r.fov, fp: r.framePick, sh: r.shotHold, ap: r.authPick, na: r.nearAuthored, sy: r.smoothYaw });
for (let i = 0; i < A.length; i++) {
  const a = A[i], b = B[i];
  console.log('--- ' + a.tag);
  console.log('  A', JSON.stringify(keep(a)));
  console.log('  B', JSON.stringify(keep(b)));
  const diffs = [];
  for (const k of Object.keys(a.states)) { const x = JSON.stringify(a.states[k]), y = JSON.stringify(b.states[k]); if (x !== y) diffs.push(k + ' A' + x + ' B' + y); }
  for (const k of Object.keys(a.visYaw)) if (Math.abs(a.visYaw[k] - b.visYaw[k]) > 0.002) diffs.push('visYaw ' + k + ' A' + a.visYaw[k] + ' B' + b.visYaw[k]);
  if (diffs.length) console.log('  state diffs: ' + diffs.join(' | '));
}
writeFileSync(path.join(HERE, 'out', 'probe144alta.json'), JSON.stringify({ A, B }, null, 1));
await browser.close(); server.close();
