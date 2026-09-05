/* =====================================================================
   The app: dreams, Claude (the director), script pane, transport, chat.
   ===================================================================== */
const EXAMPLES = /*__EXAMPLES__*/[];
const STORE = 'somnium.v1';
const App = {
  dreams: [], cur: null, sample: null, busy: false, undo: [],
  async init() {
    Stage.init($('#stage')); Stage.onBeat = i => this.highlightBeat(i); Stage.onTime = (t, ended) => this.tick(t, ended);
    try { this.dreams = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { this.dreams = []; }
    this.renderExamples(); this.renderLib(); this.renderPicker(); this.bind();
    const last = this.dreams.find(d => d.id === localStorage.getItem(STORE + '.cur')) || this.dreams.find(d => d.scene);
    const builtIn = EXAMPLES.find(e => e.scene);
    if (last && last.scene) this.open(last); else if (builtIn) this.openExample(builtIn); else { this.tab('write'); $('#stageTitle').textContent = ''; }
    try { this.sample = window.claude?.use ? await window.claude.use('sample') : null; } catch (e) { this.sample = null; }
    if (!this.sample) { $('#writeHint').innerHTML = 'To stage a new dream, open this page inside the Claude app or on claude.ai, where it can ask Claude on your subscription. Here it can only perform dreams that were staged before.'; $('#stageIt').disabled = true; $('#chatSend').disabled = true; $('#chatInput').placeholder = 'The director is only available inside Claude.'; }
  },
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.dreams.map(d => ({ id: d.id, title: d.title, text: d.text, scene: d.scene, chat: d.chat.slice(-20), src: d.src, at: d.at })))); if (this.cur) localStorage.setItem(STORE + '.cur', this.cur.id); } catch (e) { console.warn('save failed', e); } },
  /* ---- opening dreams ---- */
  open(d) { this.cur = d; this.undo = []; Stage.load(d.scene); $('#stageTitle').textContent = d.scene.title; this.renderScript(); this.renderChat(); this.renderLib(); this.renderPicker(); this.tab('script'); this.save(); },
  openExample(e) { if (e.scene) { const d = { id: 'ex-' + e.id, title: e.scene.title, text: e.text, scene: normalizeScene(e.scene, e.text), chat: [], src: e, at: Date.now() }; this.cur = d; this.undo = []; Stage.load(d.scene); $('#stageTitle').textContent = d.title; this.renderScript(); this.renderChat(); this.renderPicker(); this.tab('script'); } else { this.useText(e.text, e); } },
  useText(text, src) { $('#dreamText').value = text; this.pendingSrc = src || null; this.tab('write'); $('#dreamText').focus(); $('#writeErr').hidden = true; },
  /* ---- Claude ---- */
  genPrompt(text) { return DSL_DOC + '\n\nTHE DREAM REPORT:\n<<<\n' + text + '\n>>>\n\nWrite the stage script for this dream. JSON only.'; },
  editPrompt(d, request) { const hist = d.chat.slice(-8).map(m => (m.role === 'user' ? 'DREAMER: ' : 'DIRECTOR: ') + m.text).join('\n'); return DSL_DOC + '\n\nTHE DREAM REPORT:\n<<<\n' + d.text + '\n>>>\n\nTHE CURRENT STAGE SCRIPT (JSON):\n' + JSON.stringify(this.exportScene(d.scene)) + (hist ? '\n\nCONVERSATION SO FAR:\n' + hist : '') + '\n\nTHE DREAMER NOW ASKS:\n' + request + '\n\nRevise the stage script to honour the request. Change only what the request needs: keep every id, every beat and its text, every colour, size and position you were not asked to touch exactly as they are (the dreamer will compare before and after). If the dream is staged indoors (a room around the people, ground floor), a change to the sky, the fog or a moon will not be seen at all: change the light in the room, its colours and what is in it instead, and say so plainly. A moon or sun is not drawn at all while the camera is inside a room, so never tell the dreamer a moon can be seen in a beat that happens indoors; and if you also thicken the fog, say whether it will still be visible through it. A moon or sun you add is aimed into frame by the stage at every outdoor cut, so say it can be seen in the beats that are outdoors and say nothing about where in the frame it sits or which beat it opens; never promise the dreamer a picture you have not put in the script, and never say a thing you add is in frame "in every beat" or "throughout" -- name at most the kind of beat it should show up in, and say plainly that you cannot see the result. Asked for a moon low over the horizon, give it a y of about 12-20, not 60. Anything else you add must actually be visible from the cameras of the beats it appears in (a moon within 150 m and inside the fog range, a figure inside the frame). Answer with one JSON object and nothing else: {"reply": "one or two sentences to the dreamer, in plain words, on what changed and where it can be seen; claim nothing that is not on screen", "scene": <the complete revised stage script>}.'; },
  exportScene(s) { const cleanDetail = d => { const o = {}; for (const k of Object.keys(d || {})) { const v = d[k]; if (v === 0 || v === '' || v === null || v === false || v === undefined) continue; o[k] = v; } return o; }; const cleanCam = c => { const o = { mode: c.mode, target: c.target }; if (c.pos) o.pos = c.pos; if (c.lookAt) o.lookAt = c.lookAt; if (c.mode !== 'fixed' && c.mode !== 'pov') { o.distance = c.distance; o.height = c.height; o.angle = c.angle; } return o; }; const cleanWorld = w => { const o = {}; for (const k of Object.keys(w)) if (w[k] !== undefined) o[k] = w[k]; return o; }; return { title: s.title, mood: s.mood, world: cleanWorld(s.world), actors: s.actors.map(a => { const o = { id: a.id, kind: a.kind, label: a.label, color: a.color, size: a.size, pos: a.pos, yaw: a.yaw }; if (a.carriedBy) o.carriedBy = a.carriedBy; if (a.hidden) o.hidden = true; if (a.glow) o.glow = true; if (a.ghost) o.ghost = true; const d = cleanDetail(a.detail); if (Object.keys(d).length) o.detail = d; return o; }), beats: s.beats.map(b => ({ dur: b.dur, text: b.text, camera: cleanCam(b.camera), actions: b.actions.map(x => { const o = {}; const AK = ['actor', 'at', 'for', 'move', 'path', 'yaw', 'state', 'say', 'appear', 'vanish', 'size', 'color', 'glow', 'effect', 'world'];
        // a fixed key order, or a scene serialises differently depending on which pass happened to
        // add a yaw last -- and a scene that does not normalise to itself is one the director breaks
        const keys = Object.keys(x).sort((p1, q1) => { const i = AK.indexOf(p1), j = AK.indexOf(q1); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (p1 < q1 ? -1 : 1); });
        for (const k of keys) { if (k === 'world') o.world = cleanWorld(x.world); else if (k === 'at' && x.at === 0) continue; else if (k === 'for' && x.for === 1) continue; else o[k] = x[k]; } return o; }) })) }; },
  async ask(prompt, tier) {
    if (!this.sample) throw { code: 'not_granted', message: 'Claude is not available here.' };
    const opts = { modelTier: tier || $('#tier').value, cache: false };
    try { return await this.sample.json(prompt, opts); } catch (e) { if (e && typeof e.text === 'string' && e.text) { const j = extractJSON(e.text); if (j) return j; } throw e; }
  },
  async generate(text, src) {
    text = (text || '').trim(); if (!text) { this.showErr('Write the dream first.'); return null; }
    if (this.busy) return null; this.busy = true; this.setBusy('Staging the dream…', 'Claude is reading the dream and writing a stage script for it: places, figures, beats, camera. Usually under a minute.');
    try { const raw = await this.ask(this.genPrompt(text)); const scene = normalizeScene(raw, text); const d = { id: uid(), title: scene.title, text, scene, chat: [], src: src ? { id: src.id, seriesName: src.seriesName, num: src.num } : null, at: Date.now(), raw }; this.dreams.unshift(d); this.open(d); this.chatSystem('The dream is staged. Ask for changes here: what should look different, who is missing, what happens too fast.'); return d; }
    catch (e) { console.warn(e); this.showErr(this.errText(e)); return null; }
    finally { this.busy = false; this.setBusy(null); }
  },
  async direct(request) {
    const d = this.cur; if (!d || this.busy) return null; request = request.trim(); if (!request) return null; this.busy = true;
    d.chat.push({ role: 'user', text: request }); this.renderChat(); this.setBusy('Revising the staging…', 'Claude is rewriting the stage script with your request. The stage will change when it answers.');
    try { let out = null, sceneRaw = null;
      for (let attempt = 0; attempt < 2 && !sceneRaw; attempt++) {
        const extra = attempt ? '\n\nYour last answer could not be read. Answer with ONE JSON object and nothing else: no prose before or after it, no code fence.' : '';
        try { out = await this.ask(this.editPrompt(d, request) + extra); } catch (err) { if (attempt || (err && (err.code === 'not_granted' || err.code === 'rate_limited' || err.code === 'cancelled'))) throw err; continue; }
        sceneRaw = out && out.scene ? out.scene : (out && out.beats ? out : null); }
      if (!sceneRaw) throw { code: 'bad_reply', message: 'no scene in the reply' }; this.undo.push(d.scene); const t = Stage.time; d.scene = normalizeScene(sceneRaw, d.text); d.title = d.scene.title; const reply = typeof out.reply === 'string' && out.reply.trim() ? out.reply.trim() : 'Changed.'; d.chat.push({ role: 'director', text: reply }); Stage.load(d.scene); Stage.setTime(Math.min(t, d.scene.total)); Stage.playing = true; $('#stageTitle').textContent = d.title; this.renderScript(); this.renderChat(); this.renderLib(); this.save(); return d; }
    catch (e) { console.warn(e); d.chat.push({ role: 'system', text: this.errText(e) }); this.renderChat(); return null; }
    finally { this.busy = false; this.setBusy(null); }
  },
  undoLast() { const d = this.cur; if (!d || !this.undo.length) return; d.scene = this.undo.pop(); d.title = d.scene.title; Stage.load(d.scene); this.chatSystem('Went back to the previous staging.'); this.renderScript(); this.save(); },
  errText(e) { const c = e && e.code; if (c === 'not_granted') return 'Claude is not available in this view. Open the page inside the Claude app or on claude.ai.'; if (c === 'rate_limited') return 'Claude is rate-limited right now. Wait a minute and try again.'; if (c === 'cancelled') return 'Cancelled.'; if (c === 'invalid_json' || c === 'bad_reply') return 'The director answered in a form the stage could not read. Try once more, or ask for a smaller change.'; return 'The director could not answer: ' + (e && e.message ? e.message : String(e)); },
  showErr(t) { const el = $('#writeErr'); el.textContent = t; el.hidden = false; },
  setBusy(what, sub) { const b = $('#busy'); if (!what) { b.hidden = true; return; } $('#busyWhat').textContent = what; $('#busySub').textContent = sub || ''; b.hidden = false; },
  chatSystem(t) { if (!this.cur) return; this.cur.chat.push({ role: 'system', text: t }); this.renderChat(); },
  /* ---- rendering ---- */
  tab(name) { $$('#side .tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name))); $$('#side .pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name)); },
  renderScript() {
    const d = this.cur, s = d.scene, el = $('#scriptPane'); const byId = Object.fromEntries(s.actors.map(a => [a.id, a]));
    const beats = s.beats.map((b, i) => { const who = [...new Set(b.actions.filter(x => x.actor && !(x.vanish && !x.move && !x.say && !x.state && !x.appear)).map(x => x.actor).concat([b.camera.target]))].map(id => byId[id]).filter(a => a && a.label).slice(0, 5); return `<div class="beat" data-i="${i}" role="button" tabindex="0"><div class="tc">${tc(b.start)}</div><div><div class="tx">${esc(b.text || '(no words)')}</div><div class="who">${who.map(a => `<span class="chip">${esc(a.label)}</span>`).join('')}</div></div></div>`; }).join('');
    el.innerHTML = `<p class="eyebrow">Stage script · ${s.beats.length} beats · ${tc(s.total)}</p><h2>${esc(s.title)}</h2>${s.mood ? `<p class="mood">${esc(s.mood)}</p>` : ''}${beats}<div class="script-src">${d.src ? `Dream report from DreamBank (dreambank.net), series “${esc(d.src.seriesName || d.src.series || '')}”, dream #${d.src.num}.` : 'Your own dream, kept on this device.'}<br><details style="margin-top:6px"><summary>The whole report</summary><p style="font-size:13px;color:var(--muted)">${esc(d.text)}</p></details><details><summary>The stage script as JSON</summary><pre class="json">${esc(JSON.stringify(this.exportScene(s), null, 1))}</pre></details></div>`;
    $$('.beat', el).forEach(b => { const go = () => { Stage.setTime(s.beats[+b.dataset.i].start); Stage.playing = true; this.syncPlay(); }; b.addEventListener('click', go); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
    const sc = $('#scrub'); $$('.tick', sc).forEach(t => t.remove()); s.beats.slice(1).forEach(b => { const t = document.createElement('div'); t.className = 'tick'; t.style.left = (b.start / s.total * 100) + '%'; sc.appendChild(t); });
    this.highlightBeat(Stage.lastBeat); this.syncPlay();
  },
  highlightBeat(i) { const d = this.cur; if (!d) return; $$('#scriptPane .beat').forEach(b => b.classList.toggle('now', +b.dataset.i === i)); const now = $('#scriptPane .beat.now'); if (now && $('[data-pane="script"]').classList.contains('on')) now.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); $('#subtitle').textContent = d.scene.beats[i] ? d.scene.beats[i].text : ''; },
  tick(t, ended) { const s = this.cur && this.cur.scene; if (!s) return; const p = s.total ? t / s.total : 0; $('#scrub .fill').style.width = (p * 100) + '%'; $('#scrub .knob').style.left = (p * 100) + '%'; $('#time').textContent = tc(t) + ' / ' + tc(s.total); if (ended) this.syncPlay(); },
  syncPlay() { $('#playBtn').textContent = Stage.playing ? '❚❚' : '▶'; },
  renderChat() { const d = this.cur, el = $('#chatLog'); if (!d) { el.innerHTML = ''; return; } el.innerHTML = (d.chat.length ? '' : '<div class="msg system">Ask the director for changes to this staging. Every request is sent with the dream and the current script, and the stage is rebuilt from the answer.</div>') + d.chat.map(m => `<div class="msg ${m.role}">${m.role === 'director' ? '<div class="from">Director</div>' : ''}${esc(m.text)}</div>`).join('') + (this.undo.length ? '<div class="msg system"><button class="btn small" id="undoBtn">Undo the last change</button></div>' : ''); el.scrollTop = el.scrollHeight; const u = $('#undoBtn'); if (u) u.addEventListener('click', () => this.undoLast()); },
  renderExamples() { $('#examples').innerHTML = EXAMPLES.map((e, i) => `<button data-i="${i}"><b>${esc(e.seriesName)} · #${e.num}${e.scene ? ' · staged' : ''}</b>${esc(e.text.slice(0, 110))}…</button>`).join(''); $$('#examples button').forEach(b => b.addEventListener('click', () => this.openExample(EXAMPLES[+b.dataset.i]))); },
  renderLib() { const el = $('#lib'); el.innerHTML = this.dreams.length ? this.dreams.map(d => `<button data-id="${d.id}" class="${this.cur && this.cur.id === d.id ? 'cur' : ''}"><div class="t">${esc(d.title)}</div><div class="d">${new Date(d.at).toLocaleDateString()} · ${d.scene ? d.scene.beats.length + ' beats' : 'not staged'} · ${esc(d.text.slice(0, 60))}…</div></button>`).join('') : '<p class="hint">None yet. Dreams you stage are kept in this browser.</p>'; $$('#lib button').forEach(b => b.addEventListener('click', () => { const d = this.dreams.find(x => x.id === b.dataset.id); if (d) this.open(d); })); },
  renderPicker() { const p = $('#dreamPick'); const cur = this.cur ? this.cur.id : '';
    const known = this.dreams.some(d => d.id === cur) || EXAMPLES.some(e => 'ex-' + e.id === cur);
    const orphan = !known && this.cur ? `<option value="" selected>${esc(this.cur.scene.title)}</option>` : ''; p.innerHTML = orphan + (this.dreams.length ? `<optgroup label="Your dreams">${this.dreams.map(d => `<option value="d:${d.id}" ${d.id === cur ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</optgroup>` : '') + `<optgroup label="Real dreams (DreamBank)">${EXAMPLES.map(e => `<option value="e:${e.id}" ${'ex-' + e.id === cur ? 'selected' : ''}>${esc((e.scene && e.scene.title) || (e.seriesName + ' #' + e.num))}${e.scene ? '' : ' (not yet staged)'}</option>`).join('')}</optgroup>`; },
  bind() {
    $$('#side .tabs button').forEach(b => b.addEventListener('click', () => this.tab(b.dataset.tab)));
    $('#newDream').addEventListener('click', () => { $('#dreamText').value = ''; this.pendingSrc = null; this.tab('write'); $('#dreamText').focus(); });
    $('#stageIt').addEventListener('click', () => this.generate($('#dreamText').value, this.pendingSrc));
    $('#dreamPick').addEventListener('change', e => { const v = e.target.value; if (v.startsWith('d:')) { const d = this.dreams.find(x => x.id === v.slice(2)); if (d) this.open(d); } else { const ex = EXAMPLES.find(x => x.id === v.slice(2)); if (ex) this.openExample(ex); } });
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const t = $('#chatInput').value; if (!t.trim()) return; $('#chatInput').value = ''; this.direct(t); });
    $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
    $('#playBtn').addEventListener('click', () => { if (!Stage.scene) return; if (!Stage.playing && Stage.time >= Stage.scene.total - 0.01) Stage.setTime(0); Stage.playing = !Stage.playing; this.syncPlay(); });
    $('#prevBtn').addEventListener('click', () => { const s = Stage.scene; if (!s) return; const i = Stage.beatAt(Stage.time); const b = s.beats[i]; Stage.setTime(Stage.time - b.start > 1.5 ? b.start : (s.beats[i - 1] ? s.beats[i - 1].start : 0)); });
    $('#nextBtn').addEventListener('click', () => { const s = Stage.scene; if (!s) return; const i = Stage.beatAt(Stage.time); if (s.beats[i + 1]) Stage.setTime(s.beats[i + 1].start); });
    const sc = $('#scrub'); let scrubbing = false; const seek = e => { const r = sc.getBoundingClientRect(); const p = clamp((e.clientX - r.left) / r.width, 0, 1); if (Stage.scene) Stage.setTime(p * Stage.scene.total); }; sc.addEventListener('pointerdown', e => { scrubbing = true; sc.setPointerCapture(e.pointerId); seek(e); }); sc.addEventListener('pointermove', e => { if (scrubbing) seek(e); }); sc.addEventListener('pointerup', () => scrubbing = false);
    $('#toggleLabels').addEventListener('click', e => { Stage.labelsOn = !Stage.labelsOn; e.currentTarget.setAttribute('aria-pressed', String(Stage.labelsOn)); });
    $('#resetCam').addEventListener('click', () => Stage.resetCamera());
    $('#fullBtn').addEventListener('click', () => { const w = $('#stageWrap'); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen(); });
    document.addEventListener('keydown', e => { if (e.target.matches('textarea, input, select')) return; if (e.key === ' ') { e.preventDefault(); $('#playBtn').click(); } if (e.key === 'ArrowRight') $('#nextBtn').click(); if (e.key === 'ArrowLeft') $('#prevBtn').click(); });
  }
};
function tc(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function extractJSON(text) { if (!text) return null; let s = text.trim(); const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) s = fence[1]; const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) return null; s = s.slice(a, b + 1); try { return JSON.parse(s); } catch (e) { try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; } } }
window.__somnium = { App, Stage, normalizeScene, DSL_DOC, EXAMPLES, pixels() { const r = Stage.r, gl = r.getContext(); r.render(Stage.three, Stage.camera); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); const N = 48, out = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const px = Math.floor((x + 0.5) / N * w), py = Math.floor((y + 0.5) / N * h); const i = (py * w + px) * 4; out.push(Math.round((buf[i] + buf[i + 1] + buf[i + 2]) / 3)); } return out; } };
App.init();
</script>
<!-- ARTIFACT-END -->
