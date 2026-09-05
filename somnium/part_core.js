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
const KIND_INFO = {
  person: 'a mannequin 1.8 m tall (skin/hair via detail)', crowd: 'count people within radius (default 12 in 3 m)', animal: 'by detail.species; dog 0.5 m, horse 1.3 m, bird flies, fish swims, snake, spider', monster: 'a 2.8 m spiked figure with red eyes', ghost: 'a translucent glowing floating person', skeleton: 'a bone-white figure', hand: 'a 1 m hand', eye: 'a 1 m eyeball', tooth: 'a single tooth 0.14 m with two roots (size 2-3 so a falling tooth can be seen)',
  house: 'a one/two-storey house 8×7 m, 3.2 m walls and a roof (use for cottages, shops, huts, slum dwellings)', shop: 'a shopfront: a house with a big lit window and a sign (detail.text)', building: 'a multi-storey block 10×10×14 m with a window grid (apartment, hotel, school, factory, hospital, office)', tower: 'a round stone tower 22 m tall', castle: 'a small crenellated castle 4 m tall; a sand castle is size 0.12 so it stands knee-high beside the people building it', city: 'count skyline blocks scattered within radius (default 24 in 60 m); use only for a real city', room: 'an interior box width×depth×height (default 8×8×3) with a floor, a door, a window and a ceiling lamp; put the people inside it', wall: 'a wall width×height', door: 'a door 2.2 m in a frame; state open swings it', window: 'a window 1.4 m', stairs: 'ten steps rising detail.height (3 m)', corridor: 'a lit corridor width×depth×height (3×30×3)', bridge: 'a footbridge width×depth (3×20)', road: 'a road strip width×depth (8×120) with a centre line, flat on the ground', path: 'a footpath strip (2×60)', grating: 'a flat metal grating you can see through, width×depth (2.2×2.2), lying on the ground; put it at the same pos as a pit so the hole is in it', fence: 'a wooden fence width (8 m)', tent: 'a canvas tent 2.4 m (size 1-2; an aid station or a big tent is a house)', grave: 'a headstone', church: 'a church 14 m with a spire', elevator: 'an elevator car', ladder: 'a ladder detail.height (4 m)',
  tree: 'a tree 5-7 m', forest: 'count trees within radius (30 in 25 m)', bush: 'a bush 1.3 m', flower: 'count flowers within radius', field: 'a flat patch radius (30 m) with tufts; also a beach, a lawn, a meadow', mountain: 'three snow-capped peaks 40-80 m (place 150+ m away)', hill: 'a rounded hill radius (20 m); put forests and houses beside it, not on it', rock: 'a boulder 1.3 m', cliff: 'a rock face width×height×depth (40×30×20)', cave: 'a dark cave mouth 6 m in a rock shell; put the actors in front of or inside the mouth', pit: 'a hole in the ground radius (1.5 m) and detail.height deep (4 m), dimly lit inside; people at its bottom stand at y = -height and are only seen from a camera looking steeply down (orbit with height larger than distance)', water: 'a round pool/lake radius (15 m), flat, animated; an ocean or a sea is water with detail.open true, placed on the waterline with yaw pointing from the land out to sea, and then runs to the horizon instead of being a pond', river: 'a water strip width×depth (8×120)', cloud: 'a cloud at 12 m up, drifting', moon: 'a glowing disc exactly at pos (use y 25-60, 60-150 m away; never fogged)', sun: 'a bright disc exactly at pos', star: 'a small glowing star at pos', fire: 'a fire 1.6 m with light and flames', smoke: 'a column of smoke 6 m', lamp: 'a street lamp detail.height (4 m) with light', candle: 'a candle with a small flame',
  car: 'a car 4.2 m (wheels turn when it moves)', bus: 'a bus 10 m', truck: 'a truck 7 m (also wagon, cart)', train: 'a four-car train', plane: 'an airliner 12 m span (fly it 30+ m up)', helicopter: 'a helicopter with a spinning rotor', boat: 'a sailing boat 6 m', bike: 'a bicycle',
  bed: 'a bed 2.1 m', table: 'a table width×depth (1.6×0.9); an extremely long table is detail.width 8-14 at size 1 (beyond that it stops reading as a table), never a big size; put food, a candle or a book on one when people are sitting at it', chair: 'a chair', sofa: 'a sofa 2 m', desk: 'a desk', mirror: 'a standing mirror 1.7 m', phone: 'a phone held at 1 m', book: 'a book', sign: 'a signpost 3 m whose board shows detail.text', tv: 'a television', computer: 'a computer', clock: 'a wall clock', key: 'a key', ring: 'a ring', balloon: 'a balloon on a string', umbrella: 'an umbrella', food: 'a plate of food', bag: 'a bag', gun: 'a rifle 0.9 m held at 1.2 m', knife: 'a blade (also axe, sword)', lens: 'a camera lens: a barrel with a glass front (size 0.2-0.4); use it for a lens or a telescope so it does not read as another box', box: 'a box width×height×depth (1×1×1)', sphere: 'a sphere 1.2 m', cylinder: 'a column detail.height (3 m)', pyramid: 'a pyramid detail.height (3 m)', orb: 'a glowing floating orb', portal: 'a glowing ring 3 m', thing: 'a generic object 0.6 m on the ground, only for what no other kind can carry; the label does the work'
};
const KINDS = Object.keys(KIND_INFO);
const STATES = ['idle','walk','run','fly','fall','float','swim','sit','kneel','lie','shake','spin','grow','shrink','open','collapse','dance','wave','crawl','limp','push','melt','fold','pockets','yell','throw','grieve'];
const WEAR = new Set(['coat', 'raincoat', 'jacket', 'uniform', 'cloak', 'dress', 'skirt', 'gown', 'hat', 'cap']);
const FACE_STATE = new Set(['yell', 'grieve', 'wave', 'fold', 'shake', 'pockets']);
const AIRBORNE_STATES = new Set(['fly', 'float', 'fall', 'swim']);
const FACED = new Set(['person', 'crowd', 'animal', 'monster', 'ghost', 'skeleton']);
const VEHICLE = new Set(['car', 'bus', 'truck', 'train', 'plane', 'helicopter', 'boat', 'bike']);
const SEAT = { car: 0.9, bus: 1.2, truck: 1.4, train: 1.3, plane: 2.6, helicopter: 1.7, boat: 0.9, bike: 0.8 };
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
   "skyColor": hex, "horizonColor": hex, "fogColor": hex, "fogDensity": 0.0-0.05 (0.004 clear, 0.015 hazy, 0.03 misty; beyond about 2/fogDensity metres nothing is visible),
   "ground": one of ${JSON.stringify(GROUNDS)}, "groundColor": hex,
   "ambient": hex, "sunColor": hex, "sunIntensity": 0-3, "sunDir": [x,y,z],
   "weather": one of ${JSON.stringify(WEATHER)}, "stars": true|false
 },
 "actors": [
   { "id": "unique_snake_case", "kind": one of KINDS, "label": "what the dreamer would call it (empty string for scenery that needs no label)",
     "color": hex, "size": 0.05-40 (scale multiplier on the kind's base size given in the KINDS list; 1 = that base size), "pos": [x,y,z] (where the actor touches the ground: y is 0 for anything standing on the ground and the builder adds its own height; a window, a sign board, a moon are placed at their pos), "yaw": degrees (0 faces +z),
     "detail": {"wear": "coat"|"raincoat"|"jacket"|"uniform"|"cloak"|"dress"|"skirt"|"hat"|"cap", "wearColor": "#rrggbb"} on a person the report describes by their clothes, "hidden": true|false (start invisible, appear later), "glow": true|false, "ghost": true|false (translucent), "carriedBy": actorId (a thing held or carried: it rides in that person's hand and needs no move of its own),
     "detail": { optional, by kind: "species" for animal (dog,cat,horse,bird,fish,snake,wolf,bear,deer,cow,lion,spider,rat,chimp,rabbit,generic), "text" for sign, "count" for crowd (4-30; obey the report's own scale word: "some people" or "a few" is 3-5, "many" or "a crowd" is 12-30, and an "almost-empty" street holds 3 at most) and forest/city/flower/field (5-60), "radius" for forest/city/crowd/water/pit/field, "width"/"depth"/"height" for room/wall/building/corridor/bridge/road/river, "open" true for door, "second": hex for a second colour, "skin": hex for person skin, "hair": hex }. A child is smaller AND stands no nearer the camera than the adults in the same beat, or the child reads as the biggest figure in the frame and the one fact the sentence gives is inverted. Whatever the report says a person looks like must be built, not only written in the label: skin and hair for colouring, size for a child (0.6-0.8) or a big man (1.15), wear for what they have on. A "middle-aged black medic" needs a dark skin and a uniform, not a default body with a long label.
   }
 ],
 "beats": [
   { "dur": seconds 4-12,
     "text": "the exact words of the dream this beat performs (verbatim excerpt, in order; the beats together cover the whole dream)",
     "camera": { "mode": one of ${JSON.stringify(CAMERA_MODES)}, "target": actorId (for follow/orbit/pov/wide), "pos": [x,y,z] and "lookAt": [x,y,z] or actorId (for fixed), "distance": metres (follow/orbit, 3-40), "height": metres, "angle": degrees, measured from the target's own facing (0 = in front of them, so their face is seen; 90 = from their left; 180 = from behind); used by follow, orbit and wide },
     "actions": [
       { "actor": actorId, "move": [x,y,z] (destination reached by the end of the beat), "path": "line"|"arc"|"circle", "yaw": degrees, "state": one of STATES,
         "appear": true, "vanish": true, "size": n, "color": hex, "say": "short line shown as a speech label; only words the report quotes or reports", "at": 0-1 (fraction of the beat when the action starts, default 0), "for": 0-1 (fraction it lasts, default until the end) },
       { "world": { any of the world keys, changed gradually over the beat } },
       { "effect": one of ${JSON.stringify(EFFECTS)}, "at": 0-1 }
     ]
   }
 ]
}

KINDS (base size at size 1): ${KINDS.map(k => k + ' = ' + KIND_INFO[k]).join('; ')}.
STATES: ${STATES.join(', ')}. Use 'yell' for shouting, arguing or angry speech (and give the words as a say), 'push' for shoving, pushing or striking someone (put the two within 1 m of each other), 'pockets' for someone standing with their hands in their pockets or arms folded, 'throw' for throwing or casting something (give the thrown thing its own move in the same beat, to where it lands), 'grieve' for sadness, dejection or despair.

Rules that matter:
1. Fidelity first. Every place, person, creature and thing the dream names is an actor with a recognisable label. Events happen in the order the dream tells them; nothing is invented that contradicts the text; where the dream is vague, choose the plainest reading. Emotions are staged through colour, light, fog, weather, camera distance and effect, not left out. "say" carries only words the report quotes or reports; when the report says someone yelled, shouted or argued without saying what, use the state yell and no invented words.
2. Cover the whole dream: 5 to 14 beats, each carrying a verbatim excerpt of the report in "text" (fix nothing, quote in order; the excerpts joined should reproduce the report). One clear event per beat, and the thing the sentence is about must be on screen and legible in that beat.
3. The dreamer is an actor with id "me" (kind person, label "me") whenever the dream is in the first person; the camera usually follows "me" (mode follow, distance 6-10, height 2-4) and cuts to fixed or wide shots for big scenery, and to orbit for a moment to be looked at. Keep whoever acts in the beat inside the frame: look at them or follow them. A fixed camera position must be outside every building, room, hill and wall and at least 3 m from any person or crowd; never look at a scene through a wall. States: melt flattens a whole figure, fold crumples only the head and face, collapse drops a figure to the ground, kneel and sit need no seat.
4. Space is real: put the actors of a beat within a few metres of each other; a person who walks moves 1.4 m per second, a run 4 m/s; scenery is around, not under, the people. Buildings are at least 6 m apart and never straddle the road. A small town, a village, a suburb or a slum is made of house and shop actors, not building or city. Interiors: put a "room" actor around the people (width/depth/height) and set ground "floor"; when the people leave a room, vanish the room in that beat or cut to a camera outside. Underground (a cave, a hold, a cellar): keep ground "soil" or "stone" at y 0 with the people on it, sky "void", a cave actor around them, and a lamp, candle or fire for light; do not put people below y 0 except at the bottom of a pit. People stand on sand or grass next to water, never inside a water disc unless they swim. Anything the report says a person holds, carries, wears or has in their hand MUST be given carriedBy: that person's id, and then gets no pos and no move of its own — it rides in their hand wherever they go. "He had a rifle in his hand" is a gun with carriedBy the man; "the big lens on my camera" is a box with carriedBy the dreamer; a bag of money, a lamp, a rock about to be dropped, a book, an umbrella: all carriedBy. A prop with a pos of its own is a thing lying on the ground, so use pos only when the report leaves it lying somewhere. Do not stand one person directly between the camera's target and the lens, and do not put a wall, a headboard or a tall prop between them either. Someone whose face a beat is about (they speak, yell, grieve, shake or fold) needs the camera's distance in clear space in front of them: keep them at least that far from any wall of the room they are in, near the middle of the floor, not backed against the far side. People "crowded around" a table stand within 1 m of its long sides, on both sides, not in a clump beside it. Something that falls from a person standing at a table falls on the camera's side of it, not behind the top: put the person at the near long side and the camera outside the table, or the fall is hidden by the tabletop. A grating, a lid or a cover over a hole shares the pit's x and z, so the hole is in it; a fence set beside a pit reads as a fence next to a hole. Visitors at a bedside stand along the open side of the bed, within 1.5 m of the person lying in it, not across the room. Someone the report says is ill, injured, hospitalised or in bed IS the person in the bed: give them the bed's own x and z, y 0.6, and state lie -- not a standing figure a few metres away, and never a position outside the walls of the room they are in. A person lying in a bed needs a colour that separates them from it. If an actor carries the label that names where a beat happens (a mountain range called Antarctica, a hospital, a cave), some beat must actually frame it: put it within about 40 m of the people and give it a beat whose camera can see it, or leave it out. Whoever the sentence says speaks, asks, tells, answers or shouts gets a say in that beat, in their own words from the report: a person standing idle while the sentence has them talking is a person the stage cannot show is talking. Whoever the sentence says speaks, asks, tells, answers or shouts gets a say in that beat, in their own words from the report: a person left idle while the sentence has them talking is a person the stage cannot show is talking. Anything the report dwells on is its own labelled actor, not a word inside another actor's label: the big lens on the camera, the dishes, the money, the teeth. Use the base sizes: a sand castle is castle at size 0.12, a tooth is tooth at size 1-2 (0.14 m at size 1; past 2 it reads as a stone, not a tooth), a puddle is water at size 0.1, a lens or a camera is box at size 0.2 with a label. People riding in a vehicle move with it: give them the same move in the same beat, with y about 1 for a car and 1.2 for a helicopter, and state sit. An aircraft that flies over a place must end its move above that place, inside the radius of the forest, field or water that names it, not somewhere else on the map. A helicopter or plane flying over scenery the report names flies at y 12-20, never 40: higher than that and the woods, the town or the water it is flying over cannot be in the same shot as the aircraft.
5. The audience must always be able to see the actors, even in a night or underground scene: keep ambient at or above a dim grey-blue like #3a4060, sunIntensity at or above 0.4, fogDensity at or below 0.03 unless the sentence is about not being able to see, and never below-black skies. Darkness is a mood, not a blindfold.
6. Stage transitions of place as a beat with a "blackout" effect at 0 plus "world" changes and moves, or by having the old scenery vanish and the new appear. Whatever the beat is about must be on stage for most of it: give an "appear" an "at" of 0.15 or less. Actors that are not yet in the story start hidden and get "appear"; actors that leave get "vanish" (both happen within about a quarter of the beat unless you give "for"). Hidden actors still need a pos. A crowd's yaw turns its members: point a crowd at whatever it is watching, crowded around or complaining at, not at the scenery behind it. A named person who stands among a crowd of the same kind must be told apart from it: give them a different color, a different wear or wearColor, or stand them a couple of metres clear. A moon or sun is a disc at exactly its pos: put it 60-150 m away, only 15-40 m up so it hangs low over the horizon, and on the side the camera of the beats that show it will be facing (for a follow camera that is behind the actor, so a moon the dreamer walks toward goes in front of them).
7. Output ONLY the JSON object, no commentary, no markdown fences.`;

/* ---------------- scene normalisation (repairs whatever Claude sends) ---------------- */
const HEX = /^#[0-9a-f]{6}$/i;
function hex(v, d) { if (typeof v === 'string') { let s = v.trim(); if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; if (HEX.test(s)) return s.toLowerCase(); const c = CSS_COLORS[s.toLowerCase()]; if (c) return c; } return d; }
const CSS_COLORS = { red:'#c0392b', blue:'#2e5cb8', green:'#3c8d4a', yellow:'#e6c84a', white:'#f2f2f2', black:'#111111', grey:'#888888', gray:'#888888', brown:'#7a4a2b', orange:'#e07a2f', purple:'#7d4fb0', pink:'#e59ab3', gold:'#d4af37', silver:'#c0c0c0' };
function aimSky(scene) {
  const b = scene.beats[0]; if (!b) return null; const c = b.camera;
  if (c.mode === 'fixed' && c.pos) { const l = Array.isArray(c.lookAt) ? c.lookAt : (scene.actors.find(a => a.id === (typeof c.lookAt === 'string' ? c.lookAt : c.target)) || {}).pos; if (!l) return null; const d = [l[0] - c.pos[0], l[2] - c.pos[2]]; const n = Math.hypot(d[0], d[1]); return n > 0.1 ? [d[0] / n, d[1] / n] : null; }
  const t = scene.actors.find(a => a.id === c.target); if (!t) return null;
  // the camera sits at dirAt(target yaw + angle) and looks back at the target, so it faces the opposite way
  if (c.mode === 'pov') { const r = t.yaw * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }
  const r = (t.yaw + c.angle) * Math.PI / 180; return [-Math.sin(r), -Math.cos(r)];
}
function insideAnyRoom(raw, p) {
  const list = Array.isArray(raw && raw.actors) ? raw.actors : [];
  for (const r of list) { if (normKind(r && r.kind) !== 'room') continue; const q = vec(r.pos, [0, 0, 0]); const d = (r.detail || {});
    const w = (+d.width || 8) * (+r.size || 1) / 2 + 1, dp = (+d.depth || 8) * (+r.size || 1) / 2 + 1;
    if (Math.abs(p[0] - q[0]) < w && Math.abs(p[2] - q[2]) < dp) return true; }
  return false;
}
function skyPos(p, inRoom) { let [x, y, z] = p; if (inRoom) return [x, y, z]; let h = Math.hypot(x, z); if (h < 25) { const k = 25 / Math.max(0.001, h); x *= k; z *= k; h = 25; } if (h > 200) { const k = 200 / h; x *= k; z *= k; h = 200; } if (h * 0.13 < 8) { const k = 8 / (h * 0.13); x *= k; z *= k; h *= k; }
  return [x, clamp(y, 8, Math.max(8, h * 0.13)), z]; }
function opt(v, a, b) { v = +v; return Number.isFinite(v) && v > 0 ? clamp(v, a, b) : 0; }
function num(v, d, a = -1e6, b = 1e6) { v = +v; return Number.isFinite(v) ? clamp(v, a, b) : d; }
function vec(v, d) { return Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(x => Number.isFinite(+x)) ? v.slice(0, 3).map(x => clamp(+x, -500, 500)) : d.slice(); }
function oneOf(v, list, d) { v = String(v || '').toLowerCase().trim(); return list.includes(v) ? v : d; }
const KIND_ALIAS = { man:'person', woman:'person', boy:'person', girl:'person', child:'person', people:'crowd', friend:'person', mother:'person', father:'person', human:'person', figure:'person', soldier:'person', dog:'animal', cat:'animal', horse:'animal', bird:'animal', fish:'animal', snake:'animal', wolf:'animal', bear:'animal', deer:'animal', cow:'animal', lion:'animal', spider:'animal', rat:'animal', chimp:'animal', monkey:'animal', rabbit:'animal', creature:'monster', demon:'monster', beast:'monster', shop:'shop', store:'shop', bakery:'shop', cafe:'shop', diner:'shop', bar:'shop', restaurant:'shop', hut:'house', cottage:'house', cabin:'house', bunkhouse:'house', shack:'house', shed:'house', barn:'house', home:'house', school:'building', hotel:'building', hospital:'building', factory:'building', apartment:'building', office:'building', sandcastle:'castle', fortress:'castle', temple:'church', street:'road', alley:'road', sidewalk:'path', trail:'path', lake:'water', pool:'water', sea:'water', ocean:'water', pond:'water', puddle:'water', stream:'river', woods:'forest', trees:'forest', jungle:'forest', garden:'field', beach:'field', meadow:'field', hole:'pit', manhole:'pit', tunnel:'corridor', hallway:'corridor', hall:'corridor', staircase:'stairs', steps:'stairs', vehicle:'car', taxi:'car', ship:'boat', airplane:'plane', jet:'plane', bicycle:'bike', couch:'sofa', cellphone:'phone', telephone:'phone', television:'tv', laptop:'computer', screen:'tv', crate:'box', chest:'box', ball:'sphere', globe:'sphere', pillar:'cylinder', column:'cylinder', light:'lamp', streetlamp:'lamp', streetlight:'lamp', torch:'candle', flame:'fire', bonfire:'fire', fog:'smoke', mist:'smoke', gate:'door', doorway:'door', object:'thing', item:'thing',  dishes:'food', plate:'food', camera:'box', suitcase:'box', luggage:'box', pillow:'box', blanket:'box', paper:'book', letter:'book', money:'book', wallet:'bag', purse:'bag', stone:'rock', boulder:'rock', bones:'skeleton', spirit:'ghost', shadow:'ghost', teeth:'tooth', wave:'water', surf:'water', sand:'field', helicopter:'helicopter', chopper:'helicopter', mountains:'mountain', hills:'hill', wagon:'truck', cart:'truck', tank:'truck', bunk:'bed', mattress:'bed', bench:'sofa', counter:'table', drawer:'box', cabinet:'box', poster:'sign', picture:'sign', painting:'sign', flowers:'flower', axe:'knife', sword:'knife', rifle:'gun', pistol:'gun', flag:'sign', crown:'ring', necklace:'ring', star:'star', planet:'sphere', sunrise:'sun', moonlight:'moon' };
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
      hidden: !!a.hidden, glow: !!a.glow, ghost: !!a.ghost, carriedBy: typeof a.carriedBy === 'string' ? a.carriedBy.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : '', ...((kind === 'moon' || kind === 'sun') ? { pos: skyPos(vec(a.pos, [0, 30, -110]), insideAnyRoom(raw, vec(a.pos, [0, 30, -110]))) } : {}),
      detail: { species: String(d.species || d.animal || '').toLowerCase(), text: typeof d.text === 'string' ? d.text.slice(0, 40) : '', count: opt(d.count, 1, 90), radius: opt(d.radius, 0.5, 300), width: opt(d.width, 0.3, 300), depth: opt(d.depth, 0.3, 300), height: opt(d.height, 0.3, 300), open: !!d.open, wear: WEAR.has(String(d.wear || '').toLowerCase()) ? String(d.wear).toLowerCase() : '', wearColor: hex(d.wearColor, null), second: hex(d.second, null), skin: hex(d.skin, null), hair: hex(d.hair, null) }
    };
  });
  // open water covers the half-plane ahead of its waterline: nobody stands out at sea unless they swim
  // whatever these passes shove sideways, the beats that walk that actor somewhere have to follow it,
  // or the scene is staged fifty metres from where it is played
  const shifted = new Map();
  const shove = (a, ox, oz) => { a.pos[0] += ox; a.pos[2] += oz; const d = shifted.get(a.id) || [0, 0]; shifted.set(a.id, [d[0] + ox, d[1] + oz]); };
  for (const w of actors) { if (w.kind !== 'water' || !w.detail.open) continue;
    const r = w.yaw * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const R0 = (w.detail.radius || 30) * w.size, REACH = Math.max(60, R0 * 1.5);
    for (const a of actors) { if (a === w || a.kind === 'water' || a.kind === 'river' || a.kind === 'boat' || a.kind === 'moon' || a.kind === 'sun' || a.kind === 'cloud' || a.kind === 'star') continue;
      const dx = a.pos[0] - w.pos[0], dz = a.pos[2] - w.pos[2];
      // the sea is a shoreline, not a half of the world: something a few hundred metres inland of
      // it is somewhere else in the dream and is not standing in the water
      if (Math.hypot(dx, dz) > REACH) continue;
      const fwd = dx * sn + dz * cs; if (fwd <= 1.5) continue;
      shove(a, -sn * (fwd + 1.5), -cs * (fwd + 1.5)); } }
  // someone at the bottom of a pit has to be inside its mouth: outside it they are in solid ground
  for (const p of actors) { if (p.kind !== 'pit') continue; const R = (p.detail.radius || 1.5) * p.size;
    for (const a of actors) { if (a === p || a.pos[1] > -0.5) continue;
      const dx = a.pos[0] - p.pos[0], dz = a.pos[2] - p.pos[2]; const d = Math.hypot(dx, dz);
      const lim = Math.max(0.15, R * 0.45); if (d <= lim) continue;
      const k = lim / d; a.pos[0] = p.pos[0] + dx * k; a.pos[2] = p.pos[2] + dz * k; } }
  // "heavily wooded timberland" written as 55 trees over a 60 m radius is one tree per two hundred
  // square metres, which renders as parkland. Fill it to a wood's density, and if that would take
  // more trees than the frame can carry, draw the same trees over less ground.
  for (const a of actors) { if (a.kind !== 'forest') continue;
    const R = a.detail.radius || 25; let n = a.detail.count || 30;
    const want = Math.PI * R * R / 55;
    if (n < want) n = Math.min(90, Math.round(want));
    a.detail.count = n;
    const fit = Math.sqrt(n * 55 / Math.PI);
    if (fit < R) a.detail.radius = Math.round(fit * 10) / 10; }
  const SIZE_CAP = { tooth: 2, flower: 3, candle: 2, mirror: 2, book: 2, key: 3, ring: 3, phone: 2, gun: 1.6, knife: 2 };
  for (const a of actors) { const cap = SIZE_CAP[a.kind]; if (cap && a.size > cap) a.size = cap;
    if (a.kind === 'table' && a.detail.width > 14) a.detail.width = 14; }
  for (const a of actors) { if (a.carriedBy && (a.carriedBy === a.id || !actors.some(q => q.id === a.carriedBy))) a.carriedBy = ''; }
  if (!actors.length) actors.push({ id: 'me', kind: 'person', label: 'me', color: '#6b7ba8', size: 1, pos: [0, 0, 0], yaw: 0, hidden: false, glow: false, ghost: false, detail: {} });
  let beats = Array.isArray(s.beats) ? s.beats.filter(b => b && typeof b === 'object') : [];
  const firstId = actors.find(a => a.id === 'me')?.id || actors[0].id;
  beats = beats.map(b => {
    const c = b.camera && typeof b.camera === 'object' ? b.camera : {};
    const mode = oneOf(c.mode, CAMERA_MODES, c.pos ? 'fixed' : 'follow');
    let target = typeof c.target === 'string' && ids.has(c.target) ? c.target : (typeof c.lookAt === 'string' && ids.has(c.lookAt) ? c.lookAt : firstId);
    const camera = { mode, target, pos: c.pos ? vec(c.pos, [0, 3, 10]) : null, lookAt: Array.isArray(c.lookAt) ? vec(c.lookAt, [0, 1, 0]) : (typeof c.lookAt === 'string' && ids.has(c.lookAt) ? c.lookAt : null), distance: num(c.distance, mode === 'wide' ? 22 : 8, 1.5, 120), height: num(c.height, 2.5, 0, 80), angle: num(c.angle, 160) };
    const actions = (Array.isArray(b.actions) ? b.actions : []).filter(x => x && typeof x === 'object').map(x => {
      if (x.world && typeof x.world === 'object') return { world: normWorld(x.world, world), at: num(x.at, 0, 0, 1), for: num(x.for, 1, 0.05, 1) };
      if (x.effect) return { effect: oneOf(x.effect, EFFECTS, 'none'), at: num(x.at, 0, 0, 1) };
      const actor = typeof x.actor === 'string' ? x.actor.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : '';
      if (!ids.has(actor)) return null;
      const a = { actor, at: num(x.at, 0, 0, 0.95), for: num(x.for, (x.appear || x.vanish) && x.move === undefined && !x.say ? 0.25 : 1, 0.05, 1) };
      if (x.move !== undefined) a.move = vec(x.move, null) || null;
      if (a.move === null) delete a.move;
      if (x.path) a.path = oneOf(x.path, ['line', 'arc', 'circle'], 'line');
      if (x.yaw !== undefined && Number.isFinite(+x.yaw)) a.yaw = +x.yaw;
      if (x.state) a.state = oneOf(x.state, STATES, 'idle');
      if (x.glow !== undefined) a.glow = !!x.glow;
      if (x.appear) a.appear = true;
      if (x.vanish) a.vanish = true;
      if (x.size !== undefined && Number.isFinite(+x.size)) a.size = clamp(+x.size, 0.05, 80);
      if (x.color) { const h = hex(x.color, null); if (h) a.color = h; }
      if (typeof x.say === 'string' && x.say.trim()) a.say = x.say.trim().slice(0, 80);
      return a;
    }).filter(Boolean);
    return { dur: num(b.dur, 6, 2, 30), text: typeof b.text === 'string' ? b.text.trim() : '', camera, actions };
  });
  // put any moon or sun in the half of the sky the opening shot faces, so what the page says is there can be seen
  { const view = aimSky({ beats, actors, world }); if (view) for (const a of actors) { if (a.kind !== 'moon' && a.kind !== 'sun') continue; const h = Math.hypot(a.pos[0], a.pos[2]) || 90; if ((a.pos[0] / h) * view[0] + (a.pos[2] / h) * view[1] < -0.1) a.pos = [view[0] * h, a.pos[1], view[1] * h]; } }
  if (!beats.length) beats = [{ dur: 8, text: dreamText ? dreamText.slice(0, 200) : '', camera: { mode: 'orbit', target: firstId, pos: null, lookAt: null, distance: 10, height: 3, angle: 160 }, actions: [] }];
  // an actor that had to be shoved ashore or back into its room takes its own moves with it
  if (shifted.size) for (const b of beats) for (const x of b.actions) { const d = x.actor && shifted.get(x.actor); if (!d || !x.move) continue; x.move = [x.move[0] + d[0], x.move[1], x.move[2] + d[1]]; }
  // and no move may walk anyone but a swimmer out past the waterline
  for (const w of actors) { if (w.kind !== 'water' || !w.detail.open) continue;
    const r = w.yaw * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const R1 = (w.detail.radius || 30) * w.size, REACH1 = Math.max(60, R1 * 1.5);
    for (const b of beats) for (const x of b.actions) { if (!x.move) continue; const ac = actors.find(q => q.id === x.actor);
      // only people are kept out of the sea: a stone cast back into the surf belongs in the water
      if (!ac || !['person', 'crowd', 'animal', 'monster'].includes(ac.kind)) continue;
      if (Math.hypot(x.move[0] - w.pos[0], x.move[2] - w.pos[2]) > REACH1) continue;
      if (x.state === 'swim' || x.state === 'fly' || x.state === 'float') continue;
      const fwd = (x.move[0] - w.pos[0]) * sn + (x.move[2] - w.pos[2]) * cs; if (fwd <= 1.5) continue;
      x.move = [x.move[0] - sn * (fwd + 1.5), x.move[1], x.move[2] - cs * (fwd + 1.5)]; } }
  // nothing that stands on the ground belongs across the mouth of a hole
  { const pits = actors.filter(a => a.kind === 'pit');
    for (const p of pits) { const r = (p.detail.radius || 1.5) * p.size;
      const COVERS = new Set(['fence', 'road', 'path', 'field', 'water', 'sign', 'bridge', 'flower', 'fire', 'smoke', 'bush']);
      const LID = a2 => a2.pos[1] < 0.6 && ((a2.detail.height || 0) < 0.6 || a2.kind === 'box');
      for (const a2 of actors) { if (a2 === p || !['box', 'fence', 'thing'].includes(a2.kind)) continue;
        if (!LID(a2)) continue; if (Math.hypot(a2.pos[0] - p.pos[0], a2.pos[2] - p.pos[2]) > r + 1.2) continue;
        a2.kind = 'grating'; a2.detail.width = clamp(a2.detail.width || r * 2.2, 1, 8); a2.detail.depth = clamp(a2.detail.depth || r * 2.2, 1, 8); }
      for (const a of actors) { if (a === p || a.pos[1] < -0.5) continue; if (a.kind === 'pit' || COVERS.has(a.kind) || LID(a)) continue;
        const dx = a.pos[0] - p.pos[0], dz = a.pos[2] - p.pos[2]; const d = Math.hypot(dx, dz);
        const own = (a.detail.radius || 0) * a.size; if (d < r + own + 0.4) { const n = d > 0.01 ? [dx / d, dz / d] : [1, 0]; const out = r + own + 1.1; a.pos = [p.pos[0] + n[0] * out, a.pos[1], p.pos[2] + n[1] * out]; } } } }
  // the camera for a beat about somebody's face has to stand in front of that face. When the script
  // puts the other people there instead, every shot of the face is a shot of somebody's back.
  for (const b of beats) {
    const tid = b.camera.target; const t = actors.find(q => q.id === tid);
    if (!t || t.kind !== 'person') continue;
    if (!b.actions.some(x => x.actor === tid && (x.say || FACE_STATE.has(x.state)))) continue;
    const fx = Math.sin(t.yaw * Math.PI / 180), fz = Math.cos(t.yaw * Math.PI / 180);
    for (const x of b.actions) { if (!x.actor || x.actor === tid) continue;
      const a = actors.find(q => q.id === x.actor); if (!a || a.kind !== 'person') continue;
      const dx = a.pos[0] - t.pos[0], dz = a.pos[2] - t.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.1 || d > 4.2) continue;
      const cosA = (dx * fx + dz * fz) / d; if (cosA < 0.86) continue; // outside a thirty-degree wedge
      const side = (dx * fz - dz * fx) >= 0 ? 1 : -1, ang = t.yaw * Math.PI / 180 + side * 0.96;
      a.pos[0] = t.pos[0] + Math.sin(ang) * d; a.pos[2] = t.pos[2] + Math.cos(ang) * d; } }
  for (const b of beats) for (const x of b.actions) if (x.appear && x.at > 0.82) x.at = 0.7;
  let t = 0; for (const b of beats) { b.start = t; t += b.dur; }
  // a flight over the timberland has to end above the timberland
  { const GROUNDY = new Set(['forest', 'field', 'water', 'city', 'hill']);
    for (const b of beats) { const air = b.actions.filter(x => x.move && x.move[1] > 8);
      if (!air.length) continue;
      const named = b.actions.map(x => actors.find(a => a.id === x.actor)).filter(a => a && GROUNDY.has(a.kind));
      if (!named.length) continue;
      for (const x of air) {
        // aim at the nearest of the places the beat names, not at the middle of all of them, which
        // for two woods is the gap between the two woods
        let best = named[0], bd = 1e9;
        for (const g of named) { const d0 = Math.hypot(x.move[0] - g.pos[0], x.move[2] - g.pos[2]); if (d0 < bd) { bd = d0; best = g; } }
        const reach = (best.detail.radius || 25) * best.size * 0.7;
        if (bd <= reach) continue;
        const k = reach / bd; x.move[0] = best.pos[0] + (x.move[0] - best.pos[0]) * k; x.move[2] = best.pos[2] + (x.move[2] - best.pos[2]) * k; } } }
  // someone the script lays down belongs on the bed it wrote for them
  { const beds = actors.filter(a => a.kind === 'bed');
    if (beds.length) for (const b of beats) for (const x of b.actions) {
      if (x.state !== 'lie' || !x.actor) continue; const a = actors.find(q => q.id === x.actor); if (!a || a.kind !== 'person') continue;
      let best = null, bd = 1e9;
      for (const bed of beds) { const d = Math.hypot(a.pos[0] - bed.pos[0], a.pos[2] - bed.pos[2]); if (d < bd) { bd = d; best = bed; } }
      // the mattress is at 0.65 of a bed's own height and a lying body sits a little above its own
      // origin: 0.62 floated her clear of it. And the pillow end is the head end.
      if (best && bd > 0.8 * best.size) { a.pos[0] = best.pos[0]; a.pos[2] = best.pos[2] - 0.3 * best.size; a.pos[1] = Math.max(a.pos[1], best.pos[1] + 0.44 * best.size); a.yaw = best.yaw; a.size = Math.min(a.size, 0.94); } } }
  // an aircraft above about 22 m cannot share a frame with the ground it flies over
  { const low = actors.some(a => ['forest', 'field', 'water', 'city', 'hill', 'road', 'river'].includes(a.kind) && a.pos[1] < 6);
    if (low) { const CAP = 22;
      for (const a of actors) if (a.pos[1] > CAP) a.pos[1] = CAP;
      for (const b of beats) for (const x of b.actions) if (x.move && x.move[1] > CAP) x.move[1] = CAP; } }
  // a person written just outside the room the scene is happening in stands behind its wall and is
  // in no shot of it. The room is in use if anyone stands in it OR walks into it during the dream,
  // and whoever is pulled inside takes the moves that end out there with them.
  for (const rm of actors) { if (rm.kind !== 'room' && rm.kind !== 'corridor') continue;
    const hw = (rm.detail.width || 8) * rm.size / 2, hd = (rm.detail.depth || (rm.kind === 'corridor' ? 30 : 8)) * rm.size / 2;
    const inRoom = q => Math.abs(q[0] - rm.pos[0]) < hw && Math.abs(q[2] - rm.pos[2]) < hd;
    let used = false;
    for (const a of actors) { if (a.kind !== 'person' && a.kind !== 'crowd') continue;
      if (inRoom(a.pos)) { used = true; break; } }
    if (!used) for (const b of beats) { for (const x of b.actions) { if (!x.actor || !x.move) continue;
      const a = actors.find(q => q.id === x.actor); if (!a || (a.kind !== 'person' && a.kind !== 'crowd')) continue;
      if (inRoom(x.move)) { used = true; break; } } if (used) break; }
    if (!used) continue;
    const pull = q => { const dx = q[0] - rm.pos[0], dz = q[2] - rm.pos[2];
      const ox = Math.abs(dx) - hw, oz = Math.abs(dz) - hd;
      if (ox < 0 && oz < 0) return null; if (ox > 4 || oz > 4) return null; const pad = 0.7;
      return [ox >= 0 ? rm.pos[0] + Math.sign(dx || 1) * Math.max(0, hw - pad) : q[0], q[1],
              oz >= 0 ? rm.pos[2] + Math.sign(dz || 1) * Math.max(0, hd - pad) : q[2]]; };
    for (const a of actors) { if (a.kind !== 'person' && a.kind !== 'crowd') continue; const q = pull(a.pos); if (q) a.pos = q; }
    for (const b of beats) for (const x of b.actions) { if (!x.actor || !x.move) continue;
      const a = actors.find(q => q.id === x.actor); if (!a || (a.kind !== 'person' && a.kind !== 'crowd')) continue;
      const q = pull(x.move); if (q) x.move = q; } }
  // somebody calling down a hole is standing at the hole. When a beat has people at the bottom of
  // a pit and people above, the ones above belong on its rim: written thirty metres up the street
  // they drag the shot away from the hole and neither half of the sentence is in it.
  { const pits = actors.filter(a => a.kind === 'pit');
    if (pits.length) for (const b of beats) {
      const ids = new Set(b.actions.filter(x => x.actor).map(x => x.actor));
      let deep = null;
      for (const id of ids) { const a = actors.find(q => q.id === id); if (!a || a.pos[1] > -1) continue;
        for (const p of pits) if (Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) < (p.detail.radius || 1.5) * p.size + 2) deep = p; }
      if (!deep) continue;
      const R = (deep.detail.radius || 1.5) * deep.size, rim = R + 0.9;
      for (const id of ids) { const a = actors.find(q => q.id === id);
        if (!a || a.kind !== 'person' || a.pos[1] < -0.5) continue;
        const dx = a.pos[0] - deep.pos[0], dz = a.pos[2] - deep.pos[2], d = Math.hypot(dx, dz);
        if (d <= rim + 1.6) continue;
        const k = rim / (d || 1), to = [deep.pos[0] + dx * k, a.pos[1], deep.pos[2] + dz * k];
        // walk them there in this beat rather than rewriting where they stand for the whole dream:
        // the opening of the dream had them somewhere else, and it is still true
        const mine = b.actions.find(x => x.actor === id && x.move);
        if (mine) mine.move = to;
        else { const own = b.actions.find(x => x.actor === id) || {};
          b.actions.push({ actor: id, at: 0, for: Math.min(0.55, own.at !== undefined ? Math.max(0.2, own.at) : 0.4), move: to, path: 'line' }); } } } }
  // a rider goes where the machine goes. The vocabulary asks for the same move on both, and when
  // the script gives the helicopter one destination and the two men in it another forty metres
  // away, the beat plays with the cabin empty and its passengers hanging in the air beside it.
  // Someone off the ground in a seated state is in the vehicle, whatever coordinates were written;
  // someone seated at ground level is on a chair and is left alone.
  for (const b of beats) {
    const vs = []; for (const x of b.actions) { if (!x.actor || !x.move) continue; const v = actors.find(q => q.id === x.actor); if (v && VEHICLE.has(v.kind)) vs.push(x.move); }
    if (vs.length !== 1) continue; const to = vs[0];
    const riders = b.actions.filter(x => { if (!x.actor || !x.move) return false; const a = actors.find(q => q.id === x.actor);
      if (!a || (a.kind !== 'person' && a.kind !== 'animal')) return false;
      // the seated state has to be on this very action: a beat that walks a man to the helicopter
      // and then seats him carries both, and only the second of them is a ride
      if (x.state !== 'sit' && x.state !== 'lie') return false;
      return x.move[1] >= 0.8 || to[1] >= 3; });
    riders.forEach((x, k) => { const dx = (k - (riders.length - 1) / 2) * 0.8;
      x.move = [Math.round((to[0] + dx) * 1000) / 1000, Math.round((to[1] + 0.2) * 1000) / 1000, Math.round(to[2] * 1000) / 1000]; });
  }
  // a named person standing inside a crowd of their own colour cannot be found in the frame
  { const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    // the ring has to be wide enough to hold its own count without the members inside each other,
    // and the radius has to be written down, or the builder and everything that reasons about the
    // crowd disagree about where it reaches
    for (const cw of actors) { if (cw.kind !== 'crowd') continue; const n0 = Math.min(cw.detail.count || 12, 26);
      let want0 = Math.max(cw.detail.radius || 0, 2, Math.sqrt(n0) * 0.9, Math.sqrt(n0 / 2.2));
      // but not so far that it swallows a table the people are meant to be standing round
      for (const f of actors) { if (!['table', 'bed', 'desk', 'sofa', 'car', 'truck', 'bus'].includes(f.kind)) continue;
        const half = Math.max((f.detail.width || 1.6) * f.size, (f.detail.depth || 0.9) * f.size) / 2 + 0.7;
        const d0 = Math.hypot(f.pos[0] - cw.pos[0], f.pos[2] - cw.pos[2]);
        if (d0 - half > 2) want0 = Math.min(want0, d0 - half); }
      cw.detail.radius = Math.round(want0 * 100) / 100; }
    for (const cw of actors) { if (cw.kind !== 'crowd') continue; const R = (cw.detail.radius || 5) * cw.size;
      for (const a of actors) { if (a.kind !== 'person') continue;
        const dx = a.pos[0] - cw.pos[0], dz = a.pos[2] - cw.pos[2]; const d = Math.hypot(dx, dz);
        // standing just outside a crowd of your own colour is as anonymous as standing in it: the
        // medic among sixteen identical green backs is a named man nobody can pick out
        if (d > R + 3) continue;
        if (d > R + 0.5) { const A2 = hex2(a.color), B2 = hex2(cw.color);
          if (Math.abs(A2[0] - B2[0]) + Math.abs(A2[1] - B2[1]) + Math.abs(A2[2] - B2[2]) < 90) {
            const mix2 = (v, t) => Math.round(v + (t - v) * 0.55).toString(16).padStart(2, '0');
            a.color = '#' + mix2(A2[0], 235) + mix2(A2[1], 210) + mix2(A2[2], 60);
            if (a.detail.wear && a.detail.wearColor) { const W2 = hex2(a.detail.wearColor);
              a.detail.wearColor = '#' + mix2(W2[0], 235) + mix2(W2[1], 205) + mix2(W2[2], 55); } }
          continue; }
        // a named person inside the ring is behind somebody from most bearings whatever colour they
        // are, and the camera that goes looking for them ends up inside the crowd, shooting backs.
        // They stand at its edge instead: near enough to be with it, outside enough to be seen.
        const out0 = R + 1.8;
        // and out of the OTHER crowd too: pushing them clear of one ring straight into the next
        // moved them again on the next pass, and where they ended up depended on the order the
        // crowds happened to be declared in
        const rings = actors.filter(q => q.kind === 'crowd').map(q => ({ x: q.pos[0], z: q.pos[2], r: (q.detail.radius || 5) * q.size + 0.5 }));
        const free = (px, pz) => !rings.some(q => Math.hypot(px - q.x, pz - q.z) < q.r);
        const a0 = d < 0.05 ? 0 : Math.atan2(dx, dz);
        let px = cw.pos[0] + Math.sin(a0) * out0, pz = cw.pos[2] + Math.cos(a0) * out0;
        if (!free(px, pz)) for (let step = 1; step <= 12; step++) { let done = false;
          for (const sg of [1, -1]) { const ang = a0 + sg * step * (Math.PI / 12);
            const qx = cw.pos[0] + Math.sin(ang) * out0, qz = cw.pos[2] + Math.cos(ang) * out0;
            if (free(qx, qz)) { px = qx; pz = qz; done = true; break; } }
          if (done) break; }
        a.pos[0] = px; a.pos[2] = pz;
        // and if they were the crowd's own colour, give them one a viewer can tell apart
        const A = hex2(a.color), B = hex2(cw.color);
        if (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]) < 90) {
          const mix = (v, t) => Math.round(v + (t - v) * 0.55).toString(16).padStart(2, '0');
          a.color = '#' + mix(A[0], 235) + mix(A[1], 210) + mix(A[2], 60);
          // and a coat covers the body colour entirely, so it has to be told too
          if (a.detail.wear && a.detail.wearColor) { const W = hex2(a.detail.wearColor);
            a.detail.wearColor = '#' + mix(W[0], 235) + mix(W[1], 205) + mix(W[2], 55); } } } } }
  // a beat that arrives somewhere should show the place, not spend itself on the journey
  const PLACE = new Set(['room', 'corridor', 'house', 'shop', 'building', 'church', 'cave', 'city', 'tower']);
  { const cur = new Map(actors.map(a => [a.id, a.pos.slice()]));
    for (const b of beats) {
      const jump = b.actions.some(x => x.effect === 'blackout') || b.actions.some(x => x.world && x.world.ground !== undefined)
        || b.actions.some(x => x.appear && PLACE.has((actors.find(q => q.id === x.actor) || {}).kind));
      for (const x of b.actions) { if (!x.actor || !x.move) continue; const from = cur.get(x.actor); if (!from) continue;
        if (jump) { const far = Math.hypot(x.move[0] - from[0], x.move[2] - from[2]), drop = Math.abs(x.move[1] - from[1]);
          if ((far > 15 || drop > 5) && x.for > 0.4) x.for = 0.3; }
        cur.set(x.actor, x.move.slice()); } } }
  // an appear so late in its beat that it cannot be seen is a mistake; one at 0.4 or 0.6 is a
  // sequence -- one by one each tooth fell out -- and dragging them all to the front destroys it
  // a pass that reads its own output has to see the same numbers: round everything the passes
  // above may have arrived at by a slightly different route
  { const r4 = v => Math.round(v * 10000) / 10000;
    for (const a of actors) a.pos = a.pos.map(r4);
    for (const b of beats) for (const x of b.actions) { if (x.move) x.move = x.move.map(r4); if (x.actor && x.at !== undefined) x.at = Math.round(x.at * 10000) / 10000; } }
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
  out.fogDensity = has('fogDensity') ? num(w.fogDensity, b.fogDensity, 0, 0.06) : (preset ? preset.fogDensity : b.fogDensity);
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
const DEFAULT_COLOR = { shop: '#c9b59a', castle: '#c9b27e', person: '#6b7ba8', crowd: '#7c7f96', animal: '#8a6a4a', monster: '#4a2a3a', ghost: '#dfe6ff', skeleton: '#e8e4d8', hand: '#e0b090', eye: '#f4f4f4', tooth: '#f6f3ea', house: '#b8a48a', building: '#8f9299', tower: '#7a7e8a', city: '#6e7280', room: '#c9c0b0', wall: '#a8a49c', door: '#6d4a2c', window: '#9fc8e8', stairs: '#8a8580', corridor: '#8c887f', bridge: '#7a6a55', road: '#2c2c31', path: '#8f8266', fence: '#7a6a50', tent: '#6f8f5a', grave: '#8a8a8a', church: '#bfb6a5', elevator: '#9a9ca6', ladder: '#8a6a3a', tree: '#3f7a3a', forest: '#2f5f33', bush: '#3f7a3a', flower: '#e07aa0', field: '#5a8a3a', mountain: '#6a6d78', hill: '#4f7a45', rock: '#6f6a66', cliff: '#7a6f66', cave: '#3a3532', pit: '#0a0a0c', water: '#1f4d6e', river: '#2a5a7a', cloud: '#e8ecf6', moon: '#f2f0e0', sun: '#ffd86a', star: '#ffffff', fire: '#ff7a2a', smoke: '#9a9aa0', lamp: '#ffe6a0', candle: '#fff0c0', car: '#b03a3a', bus: '#e0b030', truck: '#6a7a8a', train: '#4a5a6a', plane: '#d8dce8', helicopter: '#5a6a4a', boat: '#8a5a3a', bike: '#3a3a3a', bed: '#7a4a8a', table: '#8a6a4a', chair: '#8a6a4a', sofa: '#6a5a7a', desk: '#6a4a3a', mirror: '#cfd8e8', phone: '#222228', book: '#8a3a3a', sign: '#e8e0c0', tv: '#222228', computer: '#8a8f9a', clock: '#e8e0c0', key: '#d4af37', ring: '#d4af37', balloon: '#e03a3a', umbrella: '#3a3a8a', food: '#e0a050', bag: '#6a4a2a', gun: '#2a2a2a', knife: '#c0c4cc', box: '#a07a4a', sphere: '#9a9ab0', cylinder: '#9a9ab0', pyramid: '#c8b070', orb: '#a0e0ff', portal: '#8a4aff', thing: '#b0a0d0' };
