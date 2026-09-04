// Replays a round's stage scripts in the CURRENT build and reports, per beat, the distance
// the camera actually ends up at against the distance the script asked for, plus which of the
// beat's actors are on screen. Used to check a camera fix against the beats a critic flagged.
// usage: node harness/replay.mjs --round=harness/out/r6 [--ids=a,b] [--shots=norms-m-315:3,pegasus-1015:4]
import { createServer } from 'node:http'; import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path'; import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const round = args.round || path.join(HERE, 'out', 'r6');
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const shots = new Set(String(args.shots || '').split(',').filter(Boolean));
const outDir = path.join(HERE, 'out', 'replay'); mkdirSync(outDir, { recursive: true });
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
if (args.nolabels) await page.evaluate(() => { window.__somnium.Stage.labelsOn = false; });
const ids = args.ids ? String(args.ids).split(',') : JSON.parse(readFileSync(path.join(round, 'summary.json'), 'utf8')).filter(r => r.ok).map(r => r.id);
for (const id of ids) {
  const f = path.join(round, id, 'scene.json'); if (!existsSync(f)) continue;
  const scene = JSON.parse(readFileSync(f, 'utf8'));
  await page.evaluate(s => { const S = window.__somnium; const d = { id: 'replay', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); }, scene);
  const rows = [];
  for (let i = 0; i < scene.beats.length; i++) {
    const mid = scene.beats.slice(0, i).reduce((a, x) => a + x.dur, 0) + scene.beats[i].dur * 0.5;
    await page.evaluate(t => { window.__somnium.Stage.setTime(t); window.__somnium.Stage.playing = false; }, mid);
    if (args.nolabels) await page.evaluate(() => { window.__somnium.Stage.labelsOn = false; });
    await page.waitForTimeout(160);
    const m = await page.evaluate(() => window.__somnium.Stage.metrics());
    const want = scene.beats[i].camera.mode === 'fixed' && scene.beats[i].camera.pos
      ? null : (scene.beats[i].camera.distance || null);
    const got = Math.hypot(m.camera.pos[0] - m.camera.look[0], m.camera.pos[1] - m.camera.look[1], m.camera.pos[2] - m.camera.look[2]);
    const off = m.actors.filter(a => a.visible && !a.onScreen).map(a => a.id);
    rows.push({ beat: i + 1, mode: m.camera.mode, want, got: +got.toFixed(1), off, near: got < 3, ms: m.frameMs, calls: m.calls, tris: m.tris });
    if (shots.has(`${id}:${i + 1}`) || args.all) await page.screenshot({ path: path.join(outDir, `${id}-b${String(i + 1).padStart(2, '0')}.png`) });
  }
  if (args.speed) { // play each beat through and report the fastest unscripted camera move inside it
    for (let i = 0; i < scene.beats.length; i++) {
      const t0 = scene.beats.slice(0, i).reduce((a, x) => a + x.dur, 0);
      const peak = await page.evaluate(async ([start, dur]) => {
        const St = window.__somnium.Stage; St.setTime(start); St.playing = false;
        let prev = null, worst = 0, at = 0, t = start, a0 = null, aLast = 0, turned = 0;
        const stop = start + dur - 0.2;
        while (t < stop) { t += 1 / 30; St.time = t; St.evaluate(1 / 30, false);
          const p = St.cam.pos.clone();
          const L = St.cam.look.clone(); const o = p.clone().sub(L);
          if (prev && t - start > 1.2) {
            // a scripted orbit turns at ~18 deg/s and a follow shot travels with its subject:
            // a whip is what changes the radius, the height, or the bearing faster than that
            const r1 = prev.o.length(), r2 = o.length();
            const a1 = Math.atan2(prev.o.x, prev.o.z), a2 = Math.atan2(o.x, o.z);
            let da = Math.abs(((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            da = Math.max(0, da - 22 * Math.PI / 180 / 30);
            const v = (Math.abs(r2 - r1) + Math.abs(o.y - prev.o.y) + da * r2) * 30;
            if (v > worst) { worst = v; at = t - start; } }
          { const ab = Math.atan2(o.x, o.z); if (a0 === null) { a0 = ab; aLast = ab; }
            turned += Math.abs(((ab - aLast + Math.PI * 3) % (Math.PI * 2)) - Math.PI); aLast = ab; }
          prev = { o }; }
        return { worst: +worst.toFixed(1), at: +at.toFixed(2), turned: +(turned * 180 / Math.PI).toFixed(0) };
      }, [t0, scene.beats[i].dur]);
      rows[i].speed = peak.worst; rows[i].speedAt = peak.at;
      rows[i].turned = peak.turned - (scene.beats[i].camera.mode === 'orbit' ? Math.round(scene.beats[i].dur * 18) : 0);
    }
  }
  const bad = rows.filter(r => r.near || r.off.length);
  console.log(`\n== ${id} (${scene.beats.length} beats)`);
  for (const r of rows) console.log(`  b${String(r.beat).padStart(2, '0')} ${r.mode.padEnd(6)} want ${r.want === null ? 'fixed' : String(r.want).padStart(4)}  got ${String(r.got).padStart(5)}  ${String(r.ms).padStart(5)}ms ${String(r.calls).padStart(4)}calls${r.near ? '  << UNDER 3 m' : ''}${r.off.length ? '  offscreen: ' + r.off.join(',') : ''}${r.speed !== undefined ? `  peak ${String(r.speed).padStart(5)} m/s${r.speed > 3 ? ' <<' : ''}  turned ${String(Math.max(0, r.turned)).padStart(4)}°${r.turned > 90 ? ' <<' : ''}` : ''}`);
  console.log(`  ${bad.length} beat(s) with a problem`);
}
console.log('\nerrors:', errs); await b.close(); server.close();
