/* =====================================================================
   Somnium — a theatre for dreams.
   dream text → Claude (viewer's own subscription) → stage script (JSON)
   → this page performs it with three.js.
   ===================================================================== */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- the stage vocabulary (shared with the prompt) ---------------- */
const KINDS = ['person','crowd','animal','monster','ghost','skeleton','hand','eye','tooth',
  'house','building','tower','city','room','wall','door','window','stairs','corridor','bridge','road','path','fence','tent','grave','church','elevator','ladder',
  'tree','forest','bush','flower','field','mountain','hill','rock','cliff','cave','pit','water','river','cloud','moon','sun','star','fire','smoke','lamp','candle',
  'car','bus','truck','train','plane','helicopter','boat','bike',
  'bed','table','chair','sofa','desk','mirror','phone','book','sign','tv','computer','clock','key','ring','balloon','umbrella','food','bag','gun','knife','box','sphere','cylinder','pyramid','orb','portal','thing'];
const STATES = ['idle','walk','run','fly','fall','float','swim','sit','lie','shake','spin','grow','shrink','open','collapse','dance','wave','crawl','melt'];
const SKIES = ['night','dusk','dawn','day','overcast','void','underwater','storm'];
const GROUNDS = ['grass','sand','water','stone','road','floor','snow','soil','cloud','mud','none'];
const WEATHER = ['none','rain','snow','ash','fireflies','bubbles','leaves','sparks'];
const CAMERA_MODES = ['follow','fixed','orbit','pov','wide'];
const EFFECTS = ['flash','quake','blackout','pulse','blur','none'];

const DSL_DOC = `You are the stage director of Somnium, a small 3D theatre that performs dreams. You turn a dream report into a STAGE SCRIPT: a JSON object that a renderer (three.js, low-poly, procedural) performs as an animation with a moving camera and subtitles.

The renderer can only build the KINDS listed below out of simple shapes, and can only animate the STATES listed. It labels every actor with your "label" text floating above it, so the dreamer recognises "my mother" or "the man in the raincoat" even though the figure is a simple mannequin. Use that: labels carry identity, geometry carries scale, position, colour, motion.

STAGE SCRIPT FORMAT (all keys shown; hex colours like "#a1b2c3"; y is up; units are metres; ground is y = 0; a person is 1.8 tall at size 1):
{
 "title": "short evocative title",
 "mood": "one line on the feeling of the dream",
 "world": {
   "sky": one of ${JSON.stringify(SKIES)},
   "skyColor": hex, "horizonColor": hex, "fogColor": hex, "fogDensity": 0.0-0.08 (0.004 clear, 0.03 misty, 0.08 blind),
   "ground": one of ${JSON.stringify(GROUNDS)}, "groundColor": hex,
   "ambient": hex, "sunColor": hex, "sunIntensity": 0-3, "sunDir": [x,y,z],
   "weather": one of ${JSON.stringify(WEATHER)}, "stars": true|false
 },
 "actors": [
   { "id": "unique_snake_case", "kind": one of KINDS, "label": "what the dreamer would call it (empty string for scenery that needs no label)",
     "color": hex, "size": 0.2-40 (scale multiplier; 1 = life size for that kind), "pos": [x,y,z], "yaw": degrees (0 faces +z),
     "hidden": true|false (start invisible, appear later), "glow": true|false, "ghost": true|false (translucent),
     "detail": { optional, by kind: "species" for animal (dog,cat,horse,bird,fish,snake,wolf,bear,deer,cow,lion,spider,rat,chimp,rabbit,generic), "text" for sign, "count" for crowd/forest/city/flower/field (5-60), "radius" for forest/city/crowd/water/pit/field, "width"/"depth"/"height" for room/wall/building/corridor/bridge/road/river, "open" true for door, "second": hex for a second colour, "skin": hex for person skin, "hair": hex }
   }
 ],
 "beats": [
   { "dur": seconds 4-12,
     "text": "the exact words of the dream this beat performs (verbatim excerpt, in order; the beats together cover the whole dream)",
     "camera": { "mode": one of ${JSON.stringify(CAMERA_MODES)}, "target": actorId (for follow/orbit/pov/wide), "pos": [x,y,z] and "lookAt": [x,y,z] or actorId (for fixed), "distance": metres (follow/orbit, 3-40), "height": metres, "angle": degrees (follow: from which side; 180 = from behind) },
     "actions": [
       { "actor": actorId, "move": [x,y,z] (destination reached by the end of the beat), "path": "line"|"arc"|"circle", "yaw": degrees, "state": one of STATES,
         "appear": true, "vanish": true, "size": n, "color": hex, "say": "short line shown as a speech label", "at": 0-1 (fraction of the beat when the action starts, default 0), "for": 0-1 (fraction it lasts, default until the end) },
       { "world": { any of the world keys, changed gradually over the beat } },
       { "effect": one of ${JSON.stringify(EFFECTS)}, "at": 0-1 }
     ]
   }
 ]
}

KINDS: ${KINDS.join(', ')}.
STATES: ${STATES.join(', ')}.

Rules that matter:
1. Fidelity first. Every place, person, creature and thing the dream names is an actor with a recognisable label. Events happen in the order the dream tells them; nothing is invented that contradicts the text; where the dream is vague, choose the plainest reading. Emotions are staged through colour, light, fog, weather, camera distance and effect, not left out.
2. Cover the whole dream: 5 to 14 beats, each carrying a verbatim excerpt of the report in "text" (fix nothing, quote in order; the excerpts joined should reproduce the report). One clear event per beat.
3. The dreamer is an actor with id "me" (kind person, label "me") whenever the dream is in the first person; the camera usually follows "me" (mode follow, distance 6-10, height 2-4) and cuts to fixed or wide shots for big scenery, and to orbit for a moment to be looked at. Keep whoever acts in the beat inside the frame: look at them or follow them.
4. Space is real: put the actors of a beat within a few metres of each other; a person who walks moves 1.4 m per second, a run 4 m/s; scenery is around, not under, the people. Buildings are at least 6 m apart. Interiors: put a "room" actor around the people (width/depth/height) and set ground "floor".
5. Stage transitions of place as a beat with a "blackout" effect at 0 plus "world" changes and moves, or by having the old scenery vanish and the new appear.
6. Actors that are not yet in the story start hidden and get "appear"; actors that leave get "vanish". Hidden actors still need a pos.
7. Output ONLY the JSON object, no commentary, no markdown fences.`;

/* ---------------- scene normalisation (repairs whatever Claude sends) ---------------- */
const HEX = /^#[0-9a-f]{6}$/i;
function hex(v, d) { if (typeof v === 'string') { let s = v.trim(); if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; if (HEX.test(s)) return s.toLowerCase(); const c = CSS_COLORS[s.toLowerCase()]; if (c) return c; } return d; }
const CSS_COLORS = { red:'#c0392b', blue:'#2e5cb8', green:'#3c8d4a', yellow:'#e6c84a', white:'#f2f2f2', black:'#111111', grey:'#888888', gray:'#888888', brown:'#7a4a2b', orange:'#e07a2f', purple:'#7d4fb0', pink:'#e59ab3', gold:'#d4af37', silver:'#c0c0c0' };
function num(v, d, a = -1e6, b = 1e6) { v = +v; return Number.isFinite(v) ? clamp(v, a, b) : d; }
function vec(v, d) { return Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(x => Number.isFinite(+x)) ? v.slice(0, 3).map(x => clamp(+x, -500, 500)) : d.slice(); }
function oneOf(v, list, d) { v = String(v || '').toLowerCase().trim(); return list.includes(v) ? v : d; }
const KIND_ALIAS = { man:'person', woman:'person', boy:'person', girl:'person', child:'person', people:'crowd', friend:'person', mother:'person', father:'person', human:'person', figure:'person', soldier:'person', dog:'animal', cat:'animal', horse:'animal', bird:'animal', fish:'animal', snake:'animal', wolf:'animal', bear:'animal', deer:'animal', cow:'animal', lion:'animal', spider:'animal', rat:'animal', chimp:'animal', monkey:'animal', rabbit:'animal', creature:'monster', demon:'monster', beast:'monster', shop:'building', store:'building', school:'building', hotel:'building', hospital:'building', factory:'building', apartment:'building', office:'building', castle:'tower', temple:'church', street:'road', alley:'road', sidewalk:'path', trail:'path', lake:'water', pool:'water', sea:'water', ocean:'water', pond:'water', puddle:'water', stream:'river', woods:'forest', trees:'forest', jungle:'forest', garden:'field', beach:'field', meadow:'field', hole:'pit', manhole:'pit', tunnel:'corridor', hallway:'corridor', hall:'corridor', staircase:'stairs', steps:'stairs', vehicle:'car', taxi:'car', ship:'boat', airplane:'plane', jet:'plane', bicycle:'bike', couch:'sofa', cellphone:'phone', telephone:'phone', television:'tv', laptop:'computer', screen:'tv', crate:'box', chest:'box', ball:'sphere', globe:'sphere', pillar:'cylinder', column:'cylinder', light:'lamp', streetlamp:'lamp', streetlight:'lamp', torch:'candle', flame:'fire', bonfire:'fire', fog:'smoke', mist:'smoke', gate:'door', doorway:'door', object:'thing', item:'thing', stone:'rock', boulder:'rock', bones:'skeleton', spirit:'ghost', shadow:'ghost', teeth:'tooth', wave:'water', surf:'water', sand:'field', helicopter:'helicopter', chopper:'helicopter', mountains:'mountain', hills:'hill', wagon:'truck', cart:'truck', tank:'truck', bunk:'bed', mattress:'bed', bench:'sofa', counter:'table', drawer:'box', cabinet:'box', poster:'sign', picture:'sign', painting:'sign', flowers:'flower', axe:'knife', sword:'knife', rifle:'gun', pistol:'gun', flag:'sign', crown:'ring', necklace:'ring', star:'star', planet:'sphere', sunrise:'sun', moonlight:'moon' };
function normKind(k) { k = String(k || 'thing').toLowerCase().trim().replace(/\s+/g, '_'); if (KINDS.includes(k)) return k; if (KIND_ALIAS[k]) return KIND_ALIAS[k]; const s = k.replace(/s$/, ''); if (KINDS.includes(s)) return s; if (KIND_ALIAS[s]) return KIND_ALIAS[s]; return 'thing'; }

function normalizeScene(raw, dreamText) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  const w = s.world && typeof s.world === 'object' ? s.world : {};
  const world = normWorld(w, null);
  const ids = new Set();
  let actors = Array.isArray(s.actors) ? s.actors : [];
  actors = actors.filter(a => a && typeof a === 'object').map((a, i) => {
    let id = String(a.id || a.label || ('actor' + i)).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || ('actor' + i);
    while (ids.has(id)) id += '_' + i; ids.add(id);
    const kind = normKind(a.kind), d = a.detail && typeof a.detail === 'object' ? a.detail : {};
    return {
      id, kind, label: typeof a.label === 'string' ? a.label.slice(0, 60) : (kind === 'thing' ? id : ''),
      color: hex(a.color, DEFAULT_COLOR[kind] || '#9a9ab0'), size: num(a.size, 1, 0.05, 80), pos: vec(a.pos, [0, 0, 0]), yaw: num(a.yaw, 0),
      hidden: !!a.hidden, glow: !!a.glow, ghost: !!a.ghost,
      detail: { species: String(d.species || d.animal || '').toLowerCase(), text: typeof d.text === 'string' ? d.text.slice(0, 40) : '', count: num(d.count, 0, 1, 80), radius: num(d.radius, 0, 0.5, 300), width: num(d.width, 0, 0.3, 300), depth: num(d.depth, 0, 0.3, 300), height: num(d.height, 0, 0.3, 300), open: !!d.open, second: hex(d.second, null), skin: hex(d.skin, null), hair: hex(d.hair, null) }
    };
  });
  if (!actors.length) actors.push({ id: 'me', kind: 'person', label: 'me', color: '#6b7ba8', size: 1, pos: [0, 0, 0], yaw: 0, hidden: false, glow: false, ghost: false, detail: {} });
  let beats = Array.isArray(s.beats) ? s.beats.filter(b => b && typeof b === 'object') : [];
  const firstId = actors.find(a => a.id === 'me')?.id || actors[0].id;
  beats = beats.map(b => {
    const c = b.camera && typeof b.camera === 'object' ? b.camera : {};
    const mode = oneOf(c.mode, CAMERA_MODES, c.pos ? 'fixed' : 'follow');
    let target = typeof c.target === 'string' && ids.has(c.target) ? c.target : (typeof c.lookAt === 'string' && ids.has(c.lookAt) ? c.lookAt : firstId);
    const camera = { mode, target, pos: c.pos ? vec(c.pos, [0, 3, 10]) : null, lookAt: Array.isArray(c.lookAt) ? vec(c.lookAt, [0, 1, 0]) : (typeof c.lookAt === 'string' && ids.has(c.lookAt) ? c.lookAt : null), distance: num(c.distance, 8, 1.5, 120), height: num(c.height, 2.5, 0, 80), angle: num(c.angle, 160) };
    const actions = (Array.isArray(b.actions) ? b.actions : []).filter(x => x && typeof x === 'object').map(x => {
      if (x.world && typeof x.world === 'object') return { world: normWorld(x.world, world), at: num(x.at, 0, 0, 1), for: num(x.for, 1, 0.05, 1) };
      if (x.effect) return { effect: oneOf(x.effect, EFFECTS, 'none'), at: num(x.at, 0, 0, 1) };
      const actor = typeof x.actor === 'string' ? x.actor.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : '';
      if (!ids.has(actor)) return null;
      const a = { actor, at: num(x.at, 0, 0, 0.95), for: num(x.for, 1, 0.05, 1) };
      if (x.move !== undefined) a.move = vec(x.move, null) || null;
      if (a.move === null) delete a.move;
      if (x.path) a.path = oneOf(x.path, ['line', 'arc', 'circle'], 'line');
      if (x.yaw !== undefined && Number.isFinite(+x.yaw)) a.yaw = +x.yaw;
      if (x.state) a.state = oneOf(x.state, STATES, 'idle');
      if (x.appear) a.appear = true;
      if (x.vanish) a.vanish = true;
      if (x.size !== undefined && Number.isFinite(+x.size)) a.size = clamp(+x.size, 0.05, 80);
      if (x.color) { const h = hex(x.color, null); if (h) a.color = h; }
      if (typeof x.say === 'string' && x.say.trim()) a.say = x.say.trim().slice(0, 80);
      return a;
    }).filter(Boolean);
    return { dur: num(b.dur, 6, 2, 30), text: typeof b.text === 'string' ? b.text.trim() : '', camera, actions };
  });
  if (!beats.length) beats = [{ dur: 8, text: dreamText ? dreamText.slice(0, 200) : '', camera: { mode: 'orbit', target: firstId, pos: null, lookAt: null, distance: 10, height: 3, angle: 160 }, actions: [] }];
  let t = 0; for (const b of beats) { b.start = t; t += b.dur; }
  return { title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 80) : 'Untitled dream', mood: typeof s.mood === 'string' ? s.mood.slice(0, 200) : '', world, actors, beats, total: t };
}
function normWorld(w, base) {
  const b = base || { sky: 'night', skyColor: '#141a3a', horizonColor: '#3b3f6e', fogColor: '#1a1d3a', fogDensity: 0.012, ground: 'grass', groundColor: '#2f4a33', ambient: '#5a5f8a', sunColor: '#cfd6ff', sunIntensity: 0.9, sunDir: [0.4, 1, 0.3], weather: 'none', stars: true };
  const out = {};
  const has = k => w[k] !== undefined && w[k] !== null;
  out.sky = has('sky') ? oneOf(w.sky, SKIES, b.sky) : b.sky;
  const preset = base ? null : SKY_PRESET[out.sky];
  out.skyColor = has('skyColor') ? hex(w.skyColor, b.skyColor) : (preset ? preset.skyColor : b.skyColor);
  out.horizonColor = has('horizonColor') ? hex(w.horizonColor, b.horizonColor) : (preset ? preset.horizonColor : b.horizonColor);
  out.fogColor = has('fogColor') ? hex(w.fogColor, b.fogColor) : (preset ? preset.fogColor : out.horizonColor);
  out.fogDensity = has('fogDensity') ? num(w.fogDensity, b.fogDensity, 0, 0.12) : (preset ? preset.fogDensity : b.fogDensity);
  out.ground = has('ground') ? oneOf(w.ground, GROUNDS, b.ground) : b.ground;
  out.groundColor = has('groundColor') ? hex(w.groundColor, b.groundColor) : (base ? b.groundColor : (GROUND_COLOR[out.ground] || b.groundColor));
  out.ambient = has('ambient') ? hex(w.ambient, b.ambient) : (preset ? preset.ambient : b.ambient);
  out.sunColor = has('sunColor') ? hex(w.sunColor, b.sunColor) : (preset ? preset.sunColor : b.sunColor);
  out.sunIntensity = has('sunIntensity') ? num(w.sunIntensity, b.sunIntensity, 0, 4) : (preset ? preset.sunIntensity : b.sunIntensity);
  out.sunDir = has('sunDir') ? vec(w.sunDir, b.sunDir) : b.sunDir.slice();
  out.weather = has('weather') ? oneOf(w.weather, WEATHER, b.weather) : b.weather;
  out.stars = has('stars') ? !!w.stars : (preset ? preset.stars : b.stars);
  if (base) for (const k of Object.keys(out)) if (!has(k)) out[k] = undefined; // partial change: only keys given
  return out;
}
const SKY_PRESET = {
  night: { skyColor: '#0b1030', horizonColor: '#2a2f5c', fogColor: '#171b3d', fogDensity: 0.012, ambient: '#4a4f7a', sunColor: '#b9c4ff', sunIntensity: 0.6, stars: true },
  dusk: { skyColor: '#2b2350', horizonColor: '#c76b4a', fogColor: '#6a4a5a', fogDensity: 0.01, ambient: '#6a5a7a', sunColor: '#ffb27a', sunIntensity: 1.2, stars: false },
  dawn: { skyColor: '#5a6fb0', horizonColor: '#f0b28a', fogColor: '#c9a8a0', fogDensity: 0.014, ambient: '#8a8aa8', sunColor: '#ffd9b0', sunIntensity: 1.3, stars: false },
  day: { skyColor: '#5f93d8', horizonColor: '#cfe1f5', fogColor: '#c8d8ee', fogDensity: 0.006, ambient: '#9fb0cc', sunColor: '#fff4e0', sunIntensity: 2.0, stars: false },
  overcast: { skyColor: '#7a8494', horizonColor: '#b8bec8', fogColor: '#aab0ba', fogDensity: 0.016, ambient: '#9aa0aa', sunColor: '#e8ebf0', sunIntensity: 1.0, stars: false },
  void: { skyColor: '#000000', horizonColor: '#08080c', fogColor: '#050507', fogDensity: 0.02, ambient: '#303040', sunColor: '#8080a0', sunIntensity: 0.5, stars: false },
  underwater: { skyColor: '#04283c', horizonColor: '#0d6f80', fogColor: '#0a5a6c', fogDensity: 0.04, ambient: '#2a7a8a', sunColor: '#8fe0e8', sunIntensity: 0.8, stars: false },
  storm: { skyColor: '#1c1f2a', horizonColor: '#4c4f5c', fogColor: '#33363f', fogDensity: 0.02, ambient: '#4a4d5a', sunColor: '#9aa0b8', sunIntensity: 0.7, stars: false },
};
const GROUND_COLOR = { grass: '#2f4a33', sand: '#c9b27e', water: '#1f4d6e', stone: '#6d6d72', road: '#2a2a2e', floor: '#8a7358', snow: '#e8ecf2', soil: '#4a3826', cloud: '#d8dcea', mud: '#3f3224', none: '#000000' };
const DEFAULT_COLOR = { person: '#6b7ba8', crowd: '#7c7f96', animal: '#8a6a4a', monster: '#4a2a3a', ghost: '#dfe6ff', skeleton: '#e8e4d8', hand: '#e0b090', eye: '#f4f4f4', tooth: '#f6f3ea', house: '#b8a48a', building: '#8f9299', tower: '#7a7e8a', city: '#6e7280', room: '#c9c0b0', wall: '#a8a49c', door: '#6d4a2c', window: '#9fc8e8', stairs: '#8a8580', corridor: '#8c887f', bridge: '#7a6a55', road: '#2c2c31', path: '#8f8266', fence: '#7a6a50', tent: '#6f8f5a', grave: '#8a8a8a', church: '#bfb6a5', elevator: '#9a9ca6', ladder: '#8a6a3a', tree: '#3f7a3a', forest: '#2f5f33', bush: '#3f7a3a', flower: '#e07aa0', field: '#5a8a3a', mountain: '#6a6d78', hill: '#4f7a45', rock: '#6f6a66', cliff: '#7a6f66', cave: '#3a3532', pit: '#0a0a0c', water: '#1f4d6e', river: '#2a5a7a', cloud: '#e8ecf6', moon: '#f2f0e0', sun: '#ffd86a', star: '#ffffff', fire: '#ff7a2a', smoke: '#9a9aa0', lamp: '#ffe6a0', candle: '#fff0c0', car: '#b03a3a', bus: '#e0b030', truck: '#6a7a8a', train: '#4a5a6a', plane: '#d8dce8', helicopter: '#5a6a4a', boat: '#8a5a3a', bike: '#3a3a3a', bed: '#7a4a8a', table: '#8a6a4a', chair: '#8a6a4a', sofa: '#6a5a7a', desk: '#6a4a3a', mirror: '#cfd8e8', phone: '#222228', book: '#8a3a3a', sign: '#e8e0c0', tv: '#222228', computer: '#8a8f9a', clock: '#e8e0c0', key: '#d4af37', ring: '#d4af37', balloon: '#e03a3a', umbrella: '#3a3a8a', food: '#e0a050', bag: '#6a4a2a', gun: '#2a2a2a', knife: '#c0c4cc', box: '#a07a4a', sphere: '#9a9ab0', cylinder: '#9a9ab0', pyramid: '#c8b070', orb: '#a0e0ff', portal: '#8a4aff', thing: '#b0a0d0' };
