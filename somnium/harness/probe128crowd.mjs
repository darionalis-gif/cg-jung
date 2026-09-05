// r128 technical review: does the merged crowd contact-disc mesh sit under the crowd members?
// The blob is built in the Stage constructor BEFORE the pass that pushes members clear of
// furniture and re-separates them, so the discs may be left at the pre-spread positions.
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
const OUT = path.join(HERE, 'out', args.round || 'r128');
const ids = (args.ids ? String(args.ids).split(',') : ['alta-263', 'hall_female-365', 'natural_scientist-203', 'norms-m-315', 'pegasus-1015', 'vietnam_vet-89']);
for (const id of ids) {
  const p = path.join(OUT, id, 'raw.json'); const q = path.join(OUT, id, 'scene.json');
  let scene = null; if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) scene = r; } catch (e) { } }
  if (!scene) scene = JSON.parse(readFileSync(q, 'utf8'));
  await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.setTime(0); }, scene);
  const res = await page.evaluate(() => {
    const S = window.__somnium.Stage; const T = window.THREE; const out = [];
    S.root.updateMatrixWorld(true);
    for (const [id, rec] of S.actors) {
      const mem = rec.g.userData.members; if (!mem || !mem.length) continue;
      // find the merged disc mesh: the child of rec.g flagged noShadow
      let blob = null; rec.g.children.forEach(c => { if (c.userData && c.userData.noShadow) blob = c; });
      if (!blob) { out.push({ id, n: mem.length, blob: false }); continue; }
      // disc centres: cluster the blob geometry's vertices into per-circle groups of 13 verts
      const pos = blob.geometry.attributes.position; const per = Math.round(pos.count / mem.length); const centres = [];
      for (let i = 0; i + per <= pos.count; i += per) {
        let sx = 0, sz = 0; for (let k = 0; k < per; k++) { sx += pos.getX(i + k); sz += pos.getZ(i + k); }
        const v = new T.Vector3(sx / per, 0, sz / per); blob.localToWorld(v); centres.push(v);
      }
      const wp = new T.Vector3(); const d = [];
      for (const m of mem) { m.getWorldPosition(wp); let best = 1e9; for (const c of centres) best = Math.min(best, Math.hypot(c.x - wp.x, c.z - wp.z)); d.push(+best.toFixed(2)); }
      // and the other way: how many discs have nobody standing on them
      let orphan = 0;
      for (const c of centres) { let best = 1e9; for (const m of mem) { m.getWorldPosition(wp); best = Math.min(best, Math.hypot(c.x - wp.x, c.z - wp.z)); } if (best > 0.6) orphan++; }
      d.sort((a, b) => a - b);
      out.push({ id, n: mem.length, discs: centres.length, medianOff: d[d.length >> 1], maxOff: d[d.length - 1], noDisc: d.filter(v => v > 0.6).length, orphanDiscs: orphan });
    }
    return out;
  });
  console.log(id, JSON.stringify(res));
}
await browser.close(); server.close();
