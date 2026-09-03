// Screenshots of the new screens, for the client critic and for the eye. Run: node test/shots.mjs
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as F from './fixtures.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test', 'out', 'shots');
mkdirSync(OUT, { recursive: true });
const server = createServer((req, res) => { try { res.end(readFileSync(path.join(ROOT, 'index.html'))); } catch (e) { res.statusCode = 404; res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(({ seed }) => {
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    const fake = async (input, opts) => { await new Promise(r => setTimeout(r, 30)); const text = 'The dream about him is not on the page. Twenty minutes went to the stone, and the hour in the car gets half a sentence. In the dream of June 20 you wrote: \'he says nothing, and I say nothing, and it is not unbearable.\'\n\nWas it the same nothing, on the phone and then in the car?'; opts?.onText?.({ text, delta: text }); return { text, truncated: false, modelTierApplied: 'complex' }; };
    fake.limits = async () => ({ maxPromptBytes: 65536 });
    window.claude = { use: name => Promise.resolve(name === 'sample' ? fake : null) };
  }, { seed: F.seed() });
  const page = await ctx.newPage(); await page.goto(url);
  await page.waitForFunction(() => document.documentElement.classList.contains('has-analyst'));
  await page.screenshot({ path: path.join(OUT, `home-${scheme}.png`), fullPage: true });
  await page.evaluate(turns => { const T = window.__tertium; T.S.talks = { at: Date.now(), items: [{ id: 'seed', at: Date.now(), kind: 'talk', turns: turns.slice(0, -1).map(x => ({ ...x, at: Date.now() })) }] }; T.setView({ name: 'talk' }); T.render(); }, F.talks.ongoing);
  await page.locator('#talk-in').fill(F.talks.ongoing.at(-1).text);
  await page.locator('[data-act="talk-send"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.talk .line.A:not(#talk-answer)').length === 2);
  await page.screenshot({ path: path.join(OUT, `talk-${scheme}.png`), fullPage: true });
  await page.evaluate(() => { const T = window.__tertium; T.setView({ name: 'liber' }); T.render(); });
  const mem = page.locator('.memory'); await mem.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `liber-memory-${scheme}.png`), clip: { x: 0, y: Math.max(0, (await mem.boundingBox()).y - 260), width: 400, height: 820 } });
  await page.evaluate(draft => { const T = window.__tertium, st = T.stepsOf(draft.practice).find(s => s.id === draft.step); T.S.draft = { ...T.newDraft(draft.practice), ...draft, mi: st.mi, si: st.si, analyst: { shadow: 'You have said where it is not, twice, and then offered kindness as proof; a reaction that strong to a flat sentence about a plan is not the reaction of someone who has none of it. The turn is not made yet. When did you last say "it has no idea in it yet", or its equivalent, to someone whose face you then watched?', shadowTier: 'answered by the deepest model' } }; T.setView({ name: 'session' }); T.render(); }, F.drafts.shadow);
  await page.screenshot({ path: path.join(OUT, `shadow-turn-${scheme}.png`), fullPage: true });
  await ctx.close();
}
await browser.close(); server.close(); console.log('shots written to test/out/shots');
