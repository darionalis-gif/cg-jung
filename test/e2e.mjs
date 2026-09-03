// Drives the built index.html in Chromium with a fake `sample` capability, walks every place the
// analyst is asked, and writes the exact prompts the page sent to test/out/. Run: node test/e2e.mjs
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as F from './fixtures.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'test', 'out');
mkdirSync(path.join(OUT, 'prompts'), { recursive: true });

const server = createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript'); res.end(readFileSync(f)); } catch (e) { res.statusCode = 404; res.end('no'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [], calls = {};
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok ' : 'FAIL'} ${msg}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
await ctx.addInitScript(({ seed, answer }) => {
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  window.__calls = []; window.__answer = answer;
  const fake = async (input, opts) => {
    window.__calls.push({ input, meta: { modelTier: opts?.modelTier, cache: opts?.cache, signal: !!opts?.signal, images: opts?.images ? opts.images.length : 0 } });
    await new Promise(r => setTimeout(r, 20));
    if (opts?.signal?.aborted) throw { code: 'cancelled', message: 'cancelled' };
    opts?.onText?.({ text: window.__answer, delta: window.__answer });
    return { text: window.__answer, truncated: false, modelTierApplied: 'complex' };
  };
  fake.limits = async () => ({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 20000000, mediaTypes: ['image/png'] } });
  fake.json = async () => ({});
  window.claude = { use: name => Promise.resolve(name === 'sample' ? fake : null) };
}, { seed: F.seed(), answer: 'The analyst answers here.' });
const page = await ctx.newPage();
page.on('pageerror', e => failures.push('page error: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => document.documentElement.classList.contains('has-analyst'), null, { timeout: 15000 });
check(await page.evaluate(() => !!window.__tertium.analyst()), 'the analyst module is created from the sample capability');
check(await page.evaluate(() => window.__tertium.S.sessions.length) === F.sessions.length, `the fixture opus loaded (${F.sessions.length} hours)`);

async function record(name, extra = {}) {
  const c = await page.evaluate(() => window.__calls.pop());
  if (!c) { check(false, `${name}: no call reached the sample capability`); return null; }
  const text = typeof c.input === 'string' ? c.input : c.input.map(m => `### ${m.role}\n${m.content}`).join('\n\n');
  const bytes = Buffer.byteLength(typeof c.input === 'string' ? c.input : c.input.map(m => m.content).join(''));
  writeFileSync(path.join(OUT, 'prompts', name + '.txt'), text);
  calls[name] = { ...c.meta, bytes, ...extra };
  check(bytes < 65536, `${name}: ${bytes} bytes under the 64 KiB cap`);
  check(text.includes('=== TASK ·'), `${name}: carries a task`);
  return text;
}
async function askInDraft(name, draft, kind) {
  await page.evaluate(({ draft, kind }) => {
    const T = window.__tertium, st = T.stepsOf(draft.practice).find(s => s.id === draft.step);
    if (!st) throw new Error('no step ' + draft.step + ' in ' + draft.practice);
    T.S.draft = { ...T.newDraft(draft.practice), ...draft, mi: st.mi, si: st.si, analyst: {} };
    T.setView({ name: 'session' }); T.render();
  }, { draft, kind });
  const btn = page.locator(`[data-act="ask"][data-kind="${kind}"]`);
  check(await btn.count() > 0, `${name}: the ask button for "${kind}" is on the screen`);
  await btn.first().click();
  if (kind === 'frame') await page.waitForFunction(() => [...document.querySelectorAll('.margin')].some(m => m.textContent.includes(window.__answer)), null, { timeout: 15000 }).catch(() => check(false, `${name}: the margin note did not appear in the dialogue`));
  else await page.waitForFunction(k => { const b = document.getElementById('an-' + k); return b && !b.hidden && b.querySelector('p')?.textContent === window.__answer; }, kind, { timeout: 15000 }).catch(() => check(false, `${name}: the answer did not appear in the box`));
  return record(name, { kind });
}

// the hour and its steps
let t = await askInDraft('constellation', F.drafts.constellation, 'constellation');
check(t?.includes('Protocol (word · answer · seconds') && t.includes('Interrogation:'), 'constellation: the protocol and the interrogation are handed over');
check(t?.includes('Earlier protocol') && !t.includes('[object Object]') && /interrogation:\n- /.test(t), 'constellation: earlier protocols are handed over with their interrogations as lines');
t = await askInDraft('frame', F.drafts.frame, 'frame');
check(calls.frame?.cache === false, 'frame: never cached');
check(t?.includes('the ferryman in The Hour'), 'frame: the figure\'s earlier hours are handed over');
check(await page.evaluate(() => (window.__tertium.S.draft.analyst.frames || []).length === 1), 'frame: the answer is kept as a margin note in the draft');
t = await askInDraft('amplification', F.drafts.amplification, 'amplification');
check(t?.includes('The third:') && t.includes('Earlier third'), 'amplification: the third and earlier thirds are handed over');
t = await askInDraft('closing', F.drafts.closing, 'closing');
check(t?.includes('The last third: alive') && t.includes('Promises:') && t.includes('Not me (separated'), 'closing: the returns are in the dossier');
check(t?.includes('WHAT CLAUDE REMEMBERS') && t.includes('cello') && t.includes('WHAT THE PERSON WANTS THIS VOICE TO KNOW') && t.includes('never been in analysis'), 'closing: the imported memory and the context are handed over');
t = await askInDraft('closingCrisis', F.drafts.closingCrisis, 'closing');
check(t?.includes('tripwire fired on words written in this hour') && t.includes('rule 0 and nothing else'), 'closingCrisis: the tripwire is stated as a fact and rule 0 put first in the task');
// dreams
t = await askInDraft('reading', F.drafts.reading, 'reading');
check(t?.includes('answer in English') && t.includes('Earlier dream'), 'reading: language hint and earlier dreams');
t = await askInDraft('readingDe', F.drafts.readingDe, 'reading');
check(t?.includes('answer in German'), 'readingDe: the German dream gets a German hint');
t = await askInDraft('readingRepetition', F.drafts.readingRepetition, 'reading');
check(t?.includes('A repetition of something that happened'), 'readingRepetition: the kind is handed over');
t = await askInDraft('series', F.drafts.series, 'series');
check((t?.match(/— Dream, /g) || []).length >= 5, 'series: the dreams are laid side by side');
t = await askInDraft('distill', F.drafts.distill, 'distill');
check(t?.includes('Caelum:') && t.includes('Separatio:') && t.includes('— Confession'), 'distill: the caelum and the whole file');
// shadow, mandala, inflation
t = await askInDraft('shadow', F.drafts.shadow, 'shadow');
check(t?.includes('Where it is in me: Nowhere'), 'shadow: the turn is handed over');
await askInDraft('shadowMade', F.drafts.shadowMade, 'shadow');
t = await askInDraft('mandala', F.drafts.mandala, 'mandala');
check(calls.mandala?.images === 1, 'mandala: the drawing is sent as a picture');
t = await askInDraft('inflation', F.drafts.inflation, 'closing');
check(t?.includes('chosen'), 'inflation: the inflated passage is in the hour');

// the Liber: memory import, the dossier as handed, the opus read
await page.evaluate(() => { const T = window.__tertium; T.S.draft = null; T.setView({ name: 'liber' }); T.render(); });
check(await page.locator('[data-mem="claude"]').count() === 1 && await page.locator('[data-mem="context"]').count() === 1, 'liber: the memory and context fields exist');
await page.locator('[data-mem="context"]').fill((await page.locator('[data-mem="context"]').inputValue()) + ' Also: I moved out of the shared office in August.');
check(await page.evaluate(() => window.__tertium.S.memory.context.includes('August')), 'liber: typing into the context field saves it');
check(await page.evaluate(() => window.__tertium.handedText().includes('August') && window.__tertium.handedText().includes('cello')), 'liber: the dossier as handed shows memory and context');
await page.locator('[data-act="ask"][data-kind="opus"]').click();
await page.waitForFunction(() => { const b = document.getElementById('an-opus'); return b && !b.hidden && b.querySelector('p')?.textContent === window.__answer; }, null, { timeout: 15000 }).catch(() => check(false, 'opus: the answer did not appear'));
t = await record('opus', { kind: 'opus' });
check(t?.includes('=== TASK · The opus, read ===') && t.includes('the last hours in full'), 'opus: task and full hours');
check(await page.evaluate(() => window.__tertium.S.talks.items.some(x => x.kind === 'opus')), 'opus: the reading is kept');

// conversations
async function talk(name, turns, opts = {}) {
  await page.evaluate(({ turns }) => { const T = window.__tertium; T.S.talks = { at: Date.now(), items: turns.length > 1 ? [{ id: 'seed', at: Date.now(), kind: 'talk', turns: turns.slice(0, -1).map(x => ({ ...x, at: Date.now() })) }] : [] }; T.setView({ name: 'talk' }); T.render(); }, { turns });
  await page.locator('#talk-in').fill(turns[turns.length - 1].text);
  await page.locator('[data-act="talk-send"]').click();
  if (opts.ground) { await page.waitForFunction(() => window.__tertium.view().name === 'ground', null, { timeout: 5000 }).catch(() => check(false, `${name}: did not reach the grounding screen`)); check(await page.evaluate(() => window.__calls.length === 0), `${name}: the page's tripwire stops the message before the analyst`); return null; }
  await page.waitForFunction(() => { const all = document.querySelectorAll('.talk .lines .line.A:not(#talk-answer)'), b = all[all.length - 1]; return b && b.querySelector('p')?.textContent === window.__answer; }, null, { timeout: 15000 }).catch(() => check(false, `${name}: the reply did not appear`));
  const text = await record(name, { kind: 'converse' });
  check(await page.evaluate(() => window.__tertium.S.talks.items.at(-1).turns.at(-1).who === 'A'), `${name}: the exchange is kept`);
  return text;
}
t = await talk('talkTransference', F.talks.transference);
check(t?.includes('### assistant') === false && t?.includes(F.talks.transference[0].text) && t?.trimEnd().endsWith('=== END MATERIAL ==='), 'talkTransference: a first message is one user turn after the lead, marked as material');
t = await talk('talkInterpretFirst', F.talks.interpretFirst);
t = await talk('talkGerman', F.talks.german);
check(t?.includes('answer in German'), 'talkGerman: the person\'s German message sets the language hint');
t = await talk('talkInjection', F.talks.injection);
t = await talk('talkOngoing', F.talks.ongoing);
check(t?.includes('### assistant\nWhat did you say first?'), 'talkOngoing: earlier turns are kept as turns');
await page.evaluate(() => { window.__calls = []; });
await talk('talkCrisisPage', F.talks.crisis, { ground: true });
// the crisis message as the module would hand it on, for the critics
const crisisTurns = await page.evaluate(turns => { const T = window.__tertium; return T.analyst().turns(turns, T.contextFor('converse', null)); }, F.talks.crisis);
writeFileSync(path.join(OUT, 'prompts', 'talkCrisis.txt'), crisisTurns.map(m => `### ${m.role}\n${m.content}`).join('\n\n'));
calls.talkCrisis = { kind: 'converse', bytes: Buffer.byteLength(crisisTurns.map(m => m.content).join('')), note: 'built directly; the page itself routes these words to the grounding screen first' };

// absence: without the capability nothing analyst-only shows
const ctx2 = await browser.newContext(); await ctx2.addInitScript(() => { window.claude = { use: () => Promise.resolve(null) }; });
const p2 = await ctx2.newPage(); await p2.goto(url);
await p2.waitForFunction(() => document.documentElement.classList.contains('no-analyst'), null, { timeout: 15000 });
check(await p2.locator('[data-act="talk"]:visible').count() === 0, 'without the capability the conversation button is hidden');
await ctx2.close();

writeFileSync(path.join(OUT, 'calls.json'), JSON.stringify(calls, null, 2));
await browser.close(); server.close();
console.log(`\n${Object.keys(calls).length} prompts written to test/out/prompts; ${failures.length} failure(s)`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
