// r128: where the frame goes on the two heaviest dreams, measured by switching one thing off at a
// time and playing the same beat again. Reports mean frameMs over ~4 s of playback per variant.
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', args.round || 'r128');
const jobs = (args.jobs ? String(args.jobs) : 'hall_female-365:1,norms-m-315:8,vietnam_vet-89:8').split(',').map(s => { const [id, b] = s.split(':'); return { id, beat: +b }; });

const VARIANTS = {
  base: () => { },
  noPointLights: () => { const S = window.__somnium.Stage; S.root.traverse(o => { if (o.isPointLight) { o.userData._i = o.intensity; o.intensity = 0; o.visible = false; } }); },
  noShadowMap: () => { const S = window.__somnium.Stage; S.r.shadowMap.enabled = false; S.r.shadowMap.needsUpdate = true; },
  noLabels: () => { const S = window.__somnium.Stage; S.labelsEl.style.display = 'none'; S._noLabels = true; if (S.labels) S.labels.length = 0; },
  noCrowdMembers: () => { const S = window.__somnium.Stage; for (const [, rec] of S.actors) { const m = rec.g.userData.members; if (m) m.forEach((p, i) => { if (i % 2) p.visible = false; }); } },
};
for (const job of jobs) {
  const p = path.join(OUT, job.id, 'raw.json'); const q = path.join(OUT, job.id, 'scene.json');
  let scene = null; if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) scene = r; } catch (e) { } }
  if (!scene) scene = JSON.parse(readFileSync(q, 'utf8'));
  let t0 = 0; for (let i = 0; i < job.beat - 1; i++) t0 += scene.beats[i].dur;
  console.log('=== ' + job.id + ' beat ' + job.beat + ' (t=' + t0 + ')');
  for (const [name, fn] of Object.entries(VARIANTS)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
    await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
    await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
    await page.evaluate(t => { const S = window.__somnium.Stage; S.setTime(t); S.playing = false; }, t0 + 0.5);
    await page.evaluate(fn);
    await page.evaluate(() => { const S = window.__somnium.Stage; S.frameTimes.length = 0; S.playing = true; });
    await page.waitForTimeout(4500);
    const m = await page.evaluate(() => { const S = window.__somnium.Stage; S.playing = false; return S.metrics(); });
    console.log('  ' + name.padEnd(16), 'frameMs', String(m.frameMs).padStart(6), ' tris', String(m.tris).padStart(7), ' calls', String(m.calls).padStart(4));
    await ctx.close();
  }
}
await browser.close(); server.close();
