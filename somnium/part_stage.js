/* =====================================================================
   The stage: renderer, world, actors, timeline evaluation, camera.
   ===================================================================== */
const Stage = {
  ready: false, scene: null, time: 0, playing: false, actors: new Map(), cam: { pos: new THREE.Vector3(0, 3, 10), look: new THREE.Vector3(0, 1, 0), snap: true }, user: { on: false, theta: 0, phi: 0.4, dist: 8 }, fx: [], lastBeat: -1, frameTimes: [], onBeat: null, onTime: null, labelsOn: true,
  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25; r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r; this.three = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 1200);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true, uniforms: { top: { value: new THREE.Color('#0b1030') }, hor: { value: new THREE.Color('#2a2f5c') }, fogRaw: { value: new THREE.Vector3(0.09, 0.11, 0.24) } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top;\nuniform vec3 hor;\nuniform vec3 fogRaw;\nvarying vec3 vP;\nvoid main(){\n float h = normalize(vP).y;\n float t = smoothstep(0.04, 0.5, h);\n gl_FragColor = vec4(mix(hor, top, t), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogRaw, 1.0 - smoothstep(0.0, 0.16, h));\n}' }));
    this.three.add(this.sky);
    const sg = new THREE.BufferGeometry(); const sp = []; const rnd = seeded(42); for (let i = 0; i < 1600; i++) { const th = rnd() * 6.283, ph = Math.acos(rnd() * 0.95); sp.push(Math.sin(ph) * Math.cos(th) * 460, Math.cos(ph) * 460, Math.sin(ph) * Math.sin(th) * 460); } sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false })); this.three.add(this.stars);
    this.ambient = new THREE.HemisphereLight('#6a6f9a', '#202030', 1.2); this.three.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#cfd6ff', 1); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.near = 1; sc.far = 200; this.sun.shadow.bias = -0.0015; this.three.add(this.sun); this.three.add(this.sun.target);
    this.fill = new THREE.DirectionalLight('#dfe3ff', 0.8); this.fill.castShadow = false; this.three.add(this.fill); this.three.add(this.fill.target);
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#2f4a33', roughness: 1, stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1 }); this.ground = new THREE.Mesh(new THREE.CircleGeometry(600, 48), this.groundMat); this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.three.add(this.ground);
    this.waterGround = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 60, 60), waterMaterial('#1f4d6e')); this.waterGround.rotation.x = -Math.PI / 2; this.waterGround.visible = false; this.three.add(this.waterGround);
    this.three.fog = new THREE.FogExp2('#171b3d', 0.012);
    this.root = new THREE.Group(); this.three.add(this.root);
    this.initWeather(); this.initInput(canvas);
    this.labelsEl = $('#labels'); this.fxEl = $('#fx'); this.canvas = canvas;
    this.resize(); new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.ready = true; this.clock = performance.now(); requestAnimationFrame(() => this.frame());
  },
  resize() { const w = this.canvas.parentElement.clientWidth || 1, h = this.canvas.parentElement.clientHeight || 1; this.r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); },
  initWeather() {
    const n = 900; this.wN = n; const g = new THREE.BufferGeometry(); this.wPos = new Float32Array(n * 3); this.wVel = new Float32Array(n * 3); const rnd = seeded(7); for (let i = 0; i < n; i++) { this.wPos[i * 3] = (rnd() - 0.5) * 60; this.wPos[i * 3 + 1] = rnd() * 30; this.wPos[i * 3 + 2] = (rnd() - 0.5) * 60; this.wVel[i * 3] = rnd(); this.wVel[i * 3 + 1] = rnd(); this.wVel[i * 3 + 2] = rnd(); }
    g.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3)); this.weather = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, map: softSprite(), transparent: true, opacity: 0.8, depthWrite: false })); this.weather.visible = false; this.weather.frustumCulled = false; this.three.add(this.weather); this.weatherKind = 'none';
  },
  setWeather(k) { if (k === this.weatherKind) return; this.weatherKind = k; const m = this.weather.material; this.weather.visible = k !== 'none'; const cfg = { rain: ['#aec6ff', 0.09, 0.7, THREE.NormalBlending], snow: ['#ffffff', 0.22, 0.9, THREE.NormalBlending], ash: ['#9a9a9a', 0.16, 0.7, THREE.NormalBlending], fireflies: ['#ffe27a', 0.28, 0.9, THREE.AdditiveBlending], bubbles: ['#bfe8ff', 0.18, 0.6, THREE.AdditiveBlending], leaves: ['#c98a3a', 0.24, 0.9, THREE.NormalBlending], sparks: ['#ff9a3a', 0.16, 0.9, THREE.AdditiveBlending] }[k]; if (cfg) { m.color.set(cfg[0]); m.size = cfg[1]; m.opacity = cfg[2]; m.blending = cfg[3]; m.needsUpdate = true; } },
  updateWeather(dt, τ) {
    if (!this.weather.visible) return; const k = this.weatherKind, p = this.wPos, v = this.wVel, c = this.cam.look; const n = this.wN;
    for (let i = 0; i < n; i++) { const j = i * 3; let x = p[j], y = p[j + 1], z = p[j + 2];
      if (k === 'rain') { y -= dt * (18 + v[j] * 6); x += dt * 1.5; } else if (k === 'snow') { y -= dt * (1 + v[j]); x += Math.sin(τ + v[j + 2] * 6) * dt * 0.8; z += Math.cos(τ * 0.7 + v[j] * 6) * dt * 0.8; } else if (k === 'ash') { y -= dt * (0.6 + v[j]); x += Math.sin(τ * 0.5 + v[j + 2] * 6) * dt * 0.5; } else if (k === 'fireflies') { x += Math.sin(τ * 0.8 + v[j] * 9) * dt * 1.2; y += Math.cos(τ * 0.6 + v[j + 1] * 9) * dt * 0.6; z += Math.sin(τ * 0.7 + v[j + 2] * 9) * dt * 1.2; if (y > 6) y = 6; } else if (k === 'bubbles') { y += dt * (0.8 + v[j]); x += Math.sin(τ + v[j + 2] * 6) * dt * 0.4; } else if (k === 'leaves') { y -= dt * (0.8 + v[j]); x += dt * (1.5 + Math.sin(τ + v[j + 1] * 6)); z += Math.cos(τ + v[j] * 6) * dt; } else if (k === 'sparks') { y += dt * (3 + v[j] * 3); x += Math.sin(τ * 3 + v[j + 2] * 9) * dt; }
      if (y < 0) y = k === 'fireflies' ? 0.5 : 28; if (y > 30) y = 0.2; if (x - c.x > 30) x -= 60; if (x - c.x < -30) x += 60; if (z - c.z > 30) z -= 60; if (z - c.z < -30) z += 60; p[j] = x; p[j + 1] = y; p[j + 2] = z; }
    this.weather.geometry.attributes.position.needsUpdate = true;
  },
  initInput(canvas) {
    let drag = null; const u = this.user;
    const down = (x, y) => { drag = { x, y }; }; const move = (x, y) => { if (!drag) return; if (!u.on) { u.on = true; const d = this.cam.pos.clone().sub(this.cam.look); u.dist = Math.max(2, d.length()); u.theta = Math.atan2(d.x, d.z); u.phi = Math.asin(clamp(d.y / u.dist, -0.99, 0.99)); $('#resetCam').classList.add('primary'); } u.theta -= (x - drag.x) * 0.006; u.phi = clamp(u.phi + (y - drag.y) * 0.004, -0.2, 1.4); drag = { x, y }; };
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); }); canvas.addEventListener('pointermove', e => move(e.clientX, e.clientY)); canvas.addEventListener('pointerup', () => drag = null); canvas.addEventListener('pointercancel', () => drag = null);
    canvas.addEventListener('wheel', e => { e.preventDefault(); if (!u.on) { u.on = true; const d = this.cam.pos.clone().sub(this.cam.look); u.dist = d.length(); u.theta = Math.atan2(d.x, d.z); u.phi = Math.asin(clamp(d.y / u.dist, -0.99, 0.99)); $('#resetCam').classList.add('primary'); } u.dist = clamp(u.dist * (1 + e.deltaY * 0.0015), 1.5, 150); }, { passive: false });
  },
  resetCamera() { this.user.on = false; this.cam.snap = true; $('#resetCam').classList.remove('primary'); },
  load(scene) {
    this.scene = scene; this.root.clear(); this.actors.clear(); this.labelsEl.innerHTML = ''; this.lastBeat = -1; this.fx = []; this.time = 0; this.cam.snap = true; this.user.on = false; $('#resetCam').classList.remove('primary');
    for (const a of scene.actors) { const g = buildActor(a); g.position.set(a.pos[0], a.pos[1], a.pos[2]); g.rotation.y = a.yaw * Math.PI / 180; this.root.add(g); const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = a.label; lbl.hidden = !a.label; this.labelsEl.appendChild(lbl); this.actors.set(a.id, { a, g, lbl, st: null, mats: null }); }
    for (const rec of this.actors.values()) { if (rec.g.userData.shadow) { const r = rec.g.userData.shadow; const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; this.root.add(blob); rec.blob = blob; } const mats = []; const seen = new Map(); rec.g.traverse(o => { if (o.isMesh && !o.material.userData.water) { let m = seen.get(o.material); if (!m) { m = o.material.clone(); m.userData = { ...o.material.userData, baseOpacity: o.material.opacity, baseColor: o.material.color.clone(), baseEmissive: o.material.emissive ? o.material.emissive.clone() : null }; seen.set(o.material, m); mats.push(m); } o.material = m; } }); rec.mats = mats; }
    this.solids = []; this.waterMats = [this.waterGround.material]; this.root.traverse(o => { if (o.userData.solid) this.solids.push(o); if (o.isMesh && o.material && o.material.userData.water) this.waterMats.push(o.material); }); this.boxTick = 0; this._rooms = null;
    this.root.updateMatrixWorld(true);
    { const boxes = []; const FURNITURE = new Set(['table', 'bed', 'sofa', 'desk', 'grave', 'car', 'boat', 'fire', 'pit', 'water']);
      for (const rec of this.actors.values()) { if (!FURNITURE.has(rec.a.kind)) continue; const bx = new THREE.Box3().setFromObject(rec.g); if (bx.max.x - bx.min.x > 0.5 && bx.max.z - bx.min.z > 0.5) boxes.push(bx); }
      for (const o of this.solids) { if (o.material && o.material.side === THREE.BackSide) continue; if (o.userData.soft) continue; const bx = new THREE.Box3().setFromObject(o); if (bx.max.x - bx.min.x > 0.8 && bx.max.z - bx.min.z > 0.8) boxes.push(bx); }
      for (const rec of this.actors.values()) { if (!rec.g.userData.members) continue; const base = new THREE.Vector3();
        for (const m of rec.g.userData.members) { m.getWorldPosition(base); const wx = base.x, wz = base.z;
          for (const bx of boxes) { if (wx < bx.min.x - 0.3 || wx > bx.max.x + 0.3 || wz < bx.min.z - 0.3 || wz > bx.max.z + 0.3) continue;
            const cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2; const dx = wx - cx, dz = wz - cz;
            const outX = (bx.max.x - bx.min.x) / 2 + 0.55, outZ = (bx.max.z - bx.min.z) / 2 + 0.55;
            const sx = rec.g.scale.x || 1; if (Math.abs(dx) / outX > Math.abs(dz) / outZ) { const d = Math.sign(dx || 1) * outX - dx; if (Math.abs(d) < 2.5) m.position.x += d / sx; } else { const d = Math.sign(dz || 1) * outZ - dz; if (Math.abs(d) < 2.5) m.position.z += d / sx; }
            break; } } } } this.applyWorld(scene.world); const mid0 = scene.beats[0] ? scene.beats[0].dur * 0.5 : 0; this.setTime(mid0); this.aimSkyLive(); this.setTime(0); this.playing = true;
  },
  setTime(t) { this.time = clamp(t, 0, this.scene ? this.scene.total : 0); this.cam.snap = true; this.framePick = null; this.fx = []; this.quake = 0; this.canvas.style.filter = ''; this.evaluate(0, true); },
  beatAt(t) { const bs = this.scene.beats; for (let i = bs.length - 1; i >= 0; i--) if (t >= bs[i].start) return i; return 0; },
  /* ---- evaluate all actor and world state at this.time ---- */
  evalActors(t) {
    const out = new Map(); const S = this.scene;
    for (const a of S.actors) out.set(a.id, { pos: a.pos.slice(), yaw: a.yaw, size: a.size, color: a.color, op: a.hidden ? 0 : 1, state: 'idle', say: null, moving: 0, window: 0, colorC: null });
    for (const b of S.beats) { if (t < b.start) break; for (const x of b.actions) { if (!x.actor) continue; const st = out.get(x.actor); if (!st) continue; const a0 = b.start + x.at * b.dur, a1 = Math.min(b.start + b.dur, a0 + x.for * b.dur); const p = a1 > a0 ? clamp((t - a0) / (a1 - a0), 0, 1) : (t >= a0 ? 1 : 0); if (t < a0) continue; const e = easeInOut(p);
        if (x.move) { const from = st.pos, to = x.move; let np = [lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e)]; const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]); if (x.path === 'arc') np[1] += Math.sin(p * Math.PI) * Math.min(dist * 0.3, 6); if (x.path === 'circle') { const cx = (from[0] + to[0]) / 2, cz = (from[2] + to[2]) / 2, r = Math.hypot(from[0] - cx, from[2] - cz), a00 = Math.atan2(from[2] - cz, from[0] - cx); np[0] = cx + Math.cos(a00 + p * Math.PI) * r; np[2] = cz + Math.sin(a00 + p * Math.PI) * r; } if (p < 1 && dist > 0.05) { st.moving = dist / Math.max(0.5, a1 - a0); if (x.yaw === undefined && dist > 0.2) { const dx = (x.path === 'circle' ? np[0] - st.lastPos?.[0] : to[0] - from[0]) || 0, dz = (x.path === 'circle' ? np[2] - st.lastPos?.[2] : to[2] - from[2]) || 0; if (Math.hypot(dx, dz) > 0.01) st.yaw = Math.atan2(dx, dz) * 180 / Math.PI; } } else st.moving = 0; st.lastPos = np; if (p >= 1) st.pos = to.slice(); else st.pos = np; }
        if (x.yaw !== undefined) { const d = ((x.yaw - st.yaw + 540) % 360) - 180; st.yaw = st.yaw + d * e; }
        if (x.size !== undefined) st.size = lerp(st.size, x.size, e);
        if (x.color) { st.colorC = [st.color, x.color, e]; if (p >= 1) st.color = x.color; }
        if (x.appear) st.op = Math.max(st.op, p >= 1 ? 1 : Math.min(1, p * 2)); if (x.vanish) st.op = p >= 1 ? 0 : Math.min(st.op, 1 - Math.min(1, p * 2));
        if (x.state === 'grow' || x.state === 'shrink') { const base = (S.actors.find(q => q.id === x.actor) || {}).size || st.size; const tgt = x.state === 'grow' ? Math.min(st.size * 2.5, base * 1.6) : Math.max(st.size * 0.35, base * 0.5); st.size = lerp(st.size, tgt, e); } else if (x.state) { const transient = ['walk', 'run', 'limp', 'push', 'shake', 'spin', 'collapse', 'wave', 'dance', 'fall', 'open', 'grow', 'shrink'].includes(x.state); if (!transient || p < 1) { st.state = x.state; st.window = p; } else if (x.state === 'collapse') st.state = 'lie'; else if (x.state === 'fall') st.state = 'lie'; else if (x.state === 'open') st.state = 'open'; else if (x.state === 'grow' || x.state === 'shrink') st.state = 'idle'; }
        if (x.say && p < 1) st.say = x.say; }
    }
    // whoever shares a vehicle's destination in a beat travels in it, not behind it
    for (const b of S.beats) { if (t < b.start || t > b.start + b.dur) continue;
      const kindOf = id => (S.actors.find(q => q.id === id) || {}).kind;
      const vehicles = b.actions.filter(x => x.actor && x.move && VEHICLE.has(kindOf(x.actor)));
      if (!vehicles.length) continue;
      for (const x of b.actions) { if (!x.actor || !x.move || VEHICLE.has(kindOf(x.actor))) continue;
        const v = vehicles.find(q => Math.hypot(q.move[0] - x.move[0], q.move[2] - x.move[2]) < 3); if (!v) continue;
        const rider = out.get(x.actor), car = out.get(v.actor); if (!rider || !car) continue;
        const seat = SEAT[kindOf(v.actor)] || 1;
        rider.pos = [car.pos[0] + 0.6, car.pos[1] + seat, car.pos[2]]; rider.yaw = car.yaw;
        if (rider.state === 'idle' || rider.state === 'walk') rider.state = 'sit'; } }
    for (const a of S.actors) { if (!a.carriedBy) continue; const it = out.get(a.id), by = out.get(a.carriedBy); if (!it || !by) continue;
      const r = by.yaw * Math.PI / 180, side = 0.34 * (a.id.length % 2 ? 1 : -1);
      it.pos = [by.pos[0] + Math.cos(r) * side + Math.sin(r) * 0.18, by.pos[1] + 0.95 * (by.size || 1), by.pos[2] - Math.sin(r) * side + Math.cos(r) * 0.18];
      it.yaw = by.yaw; it.op = Math.min(it.op, by.op) > 0.02 ? Math.max(it.op, by.op * 0.999) : it.op; }
    for (const st of out.values()) if (st.moving && st.state === 'idle') st.state = st.moving > 2.5 ? 'run' : 'walk';
    return out;
  },
  evalWorld(t) {
    const S = this.scene; const w = { ...S.world };
    for (const b of S.beats) { if (t < b.start) break; for (const x of b.actions) { if (!x.world) continue; const a0 = b.start + x.at * b.dur, a1 = Math.min(b.start + b.dur, a0 + x.for * b.dur); if (t < a0) continue; const p = a1 > a0 ? clamp((t - a0) / (a1 - a0), 0, 1) : 1; for (const k of Object.keys(x.world)) { const v = x.world[k]; if (v === undefined) continue; if (typeof v === 'number') w[k] = lerp(w[k], v, p); else if (typeof v === 'string' && HEX.test(v)) w[k] = p >= 1 ? v : '#' + new THREE.Color(w[k]).lerp(new THREE.Color(v), p).getHexString(); else if (Array.isArray(v)) w[k] = w[k].map((q, i) => lerp(q, v[i], p)); else if (p > 0.5 || k === 'weather' && p > 0) w[k] = v; } } }
    return w;
  },
  applyWorld(w) {
    this.sky.material.uniforms.top.value.set(w.skyColor); this.sky.material.uniforms.hor.value.set(w.horizonColor); this.sky.material.uniforms.fogRaw.value.set(parseInt(w.fogColor.slice(1, 3), 16) / 255, parseInt(w.fogColor.slice(3, 5), 16) / 255, parseInt(w.fogColor.slice(5, 7), 16) / 255); this.three.fog.color.set(w.fogColor); this.three.fog.density = w.fogDensity; this.r.setClearColor(w.fogColor);
    const amb = new THREE.Color(w.ambient); const L = 0.2126 * amb.r + 0.7152 * amb.g + 0.0722 * amb.b; if (L < 0.26) amb.lerp(new THREE.Color('#8f93b4'), (0.26 - L) / 0.26 * 0.7);
    this.ambient.color.copy(amb); this.ambient.groundColor.set(shade(w.groundColor, 0.6)); this.ambient.intensity = w.sky === 'day' ? 2.4 : (w.sky === 'void' ? 1.4 : 2.0);
    this.sun.color.set(w.sunColor); this.sun.intensity = Math.max(0.8, w.sunIntensity * 2.4);
    this.fill.position.copy(this.camera.position); this.fill.target.position.copy(this.cam.look); this.fill.intensity = w.sky === 'day' ? 0.4 : 0.9; const d = new THREE.Vector3(...w.sunDir).normalize().multiplyScalar(80); this.sun.position.copy(this.cam.look).add(d); this.sun.target.position.copy(this.cam.look);
    this.stars.visible = !!w.stars && w.sky !== 'day';
    const water = w.ground === 'water'; this.waterGround.visible = water; this.ground.visible = !water && w.ground !== 'none'; if (water) this.waterGround.material.color.set(w.groundColor); else { const c = new THREE.Color(w.groundColor); this.groundMat.color.copy(c); const tex = noiseTexture(w.groundColor, w.ground === 'floor' || w.ground === 'road' ? 0.05 : 0.14, w.ground === 'floor' ? 120 : 60); this.groundMat.map = tex; this.groundMat.color.set('#ffffff'); this.groundMat.roughness = w.ground === 'snow' ? 0.7 : (w.ground === 'floor' ? 0.6 : 1); this.groundMat.needsUpdate = true; }
    this.setWeather(w.weather); this.worldNow = w;
  },
  /* ---- per-frame ---- */
  frame() {
    requestAnimationFrame(() => this.frame()); const now = performance.now(); let dt = Math.min(0.1, (now - this.clock) / 1000); this.clock = now; if (!this.scene) { this.r.render(this.three, this.camera); return; }
    if (this.playing) { this.time += dt; if (this.time >= this.scene.total) { this.time = this.scene.total; this.playing = false; if (this.onTime) this.onTime(this.time, true); } }
    this.evaluate(dt, false); const t1 = performance.now(); this.frameTimes.push(t1 - now); if (this.frameTimes.length > 240) this.frameTimes.shift();
  },
  evaluate(dt, snap) {
    const t = this.time, S = this.scene, τ = t; const states = this.evalActors(t); this.states = states; const w = this.evalWorld(t); this.applyWorld(w);
    const bi = this.beatAt(t); if (bi !== this.lastBeat) { const prev = this.lastBeat; this.lastBeat = bi; if (this.onBeat) this.onBeat(bi); if (prev >= 0 && !snap) this.camBlend = 0; }
    if (!snap && dt > 0) { for (const x of S.beats[bi].actions) { if (!x.effect || x.effect === 'none') continue; const at = S.beats[bi].start + x.at * S.beats[bi].dur; if (t - dt < at && t >= at) this.triggerEffect(x.effect); } }
    // actors
    for (const [id, rec] of this.actors) { const st = states.get(id), g = rec.g, a = rec.a, ud = g.userData; g.visible = st.op > 0.01; g.position.set(st.pos[0], st.pos[1] - (st.pos[1] > 0.25 && ud.propBase ? ud.propBase * (st.size / a.size) : 0), st.pos[2]); g.rotation.set(0, g.rotation.y, 0); const sc = ud.noScale ? 1 : st.size; g.scale.setScalar(sc); if (rec.blob) { rec.blob.visible = st.pos[1] > -0.5 && st.op > 0.05; rec.blob.visible = g.visible && st.pos[1] < 0.6 && !['fly', 'float', 'swim'].includes(st.state); rec.blob.position.set(st.pos[0], 0.02, st.pos[2]); rec.blob.scale.setScalar(sc); }
      for (const m of rec.mats) { const bo = m.userData.baseOpacity; const want = st.op * bo; if (Math.abs(m.opacity - want) > 0.001) { m.opacity = want; m.transparent = want < 0.999 || m.userData.baseOpacity < 0.999; m.needsUpdate = false; } if (st.colorC && !ud.noColor) { const bc = m.userData.baseColor; const from = new THREE.Color(st.colorC[0]), to = new THREE.Color(st.colorC[1]); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(from.clone().lerp(to, st.colorC[2]).multiply(ratio)); } else if (st.color !== a.color) { const bc = m.userData.baseColor; const from = new THREE.Color(a.color), to = new THREE.Color(st.color); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(to.multiply(ratio)); } }
      this.animate(rec, st, τ, dt, snap);
    }
    // ambient animations
    for (const rec of this.actors.values()) { const ud = rec.g.userData; if (ud.flames) { ud.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(τ * 11 + i * 2) * 0.25; f.scale.x = f.scale.z = 1 + Math.sin(τ * 9 + i) * 0.15; }); if (ud.light) ud.light.intensity = 30 + Math.sin(τ * 13) * 6; } if (ud.puffs) ud.puffs.forEach((p, i) => { p.position.y = 0.8 + ((τ * 0.6 + i * 0.9) % 5.4); p.scale.setScalar(0.6 + ((τ * 0.6 + i * 0.9) % 5.4) * 0.25); }); if (ud.rotor) ud.rotor.rotation.y = τ * 25; if (ud.spinPart) ud.spinPart.rotation.y = τ * 1.2; if (ud.drift) rec.g.position.x += Math.sin(τ * 0.05) * 0.0; if (ud.canopy) ud.canopy.forEach(c => c.rotation.z = Math.sin(τ * 0.8) * 0.02); if (ud.trees) ud.trees.forEach((tr, i) => tr.rotation.z = Math.sin(τ * 0.7 + i) * 0.02); if (ud.pulse) rec.mats.forEach(m => { if (m.emissiveIntensity) m.emissiveIntensity = 0.8 + Math.sin(τ * 3) * 0.4; }); }
    for (const m of this.waterMats) if (m.userData.sh) m.userData.sh.uniforms.uTime.value = τ;
    this.solidsNow = this.solids ? this.solids.filter(o => { let p = o; while (p) { if (p.visible === false) return false; p = p.parent; } return true; }) : [];
    if ((this.boxTick = (this.boxTick || 0) + 1) % 12 === 1 || !this.solidBoxes) { this.solidBoxes = []; for (const o of this.solidsNow) { if (o.material && o.material.side === THREE.BackSide) continue; if (o.geometry.type === 'CapsuleGeometry') continue; const bx = new THREE.Box3().setFromObject(o); if (bx.max.x - bx.min.x > 1.5 && bx.max.z - bx.min.z > 1.5) { bx.expandByScalar(0.4); this.solidBoxes.push(bx); } } }
    this.updateCamera(S.beats[bi], states, dt, snap || this.cam.snap); this.cam.snap = false;
    this.updateWeather(dt, τ); this.updateEffects(dt);
    this.fitSky(states); this.r.render(this.three, this.camera); this.updateLabels(states);
    if (this.onTime) this.onTime(t, false);
  },
  /* ---- humanoid posing: a target pose per state, blended over time ---- */
  poseHuman(g, L, s, τ, dt, size, window, phase, moving, lookYaw, snap) {
    const P = g.userData.pose || (g.userData.pose = { legs: [0, 0], shins: [0, 0], armsX: [0, 0], armsZ: [0, 0], fore: [0, 0], headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0, hipsZ: 0, y: 0, torsoS: 1, headS: 1 });
    const T = { legs: [0, 0], shins: [0, 0], armsX: [0, 0], armsZ: [0.08, -0.08], fore: [-0.25, -0.25], headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0, hipsZ: 0, y: 0, torsoS: 1, headS: 1 };
    const t = τ + phase; const run = s === 'run' || moving > 2.5; const sp = run ? 11 : (s === 'limp' ? 5 : 6.5); const φ = t * sp;
    let keepHead = true;
    if (s === 'walk' || s === 'run' || s === 'limp' || s === 'crawl') {
      const A = run ? 0.85 : 0.5; const sw = Math.sin(φ); const cs = Math.cos(φ);
      T.legs = [sw * A, -sw * A * (s === 'limp' ? 0.35 : 1)]; T.shins = [-Math.max(0, cs) * (run ? 1.2 : 0.8), -Math.max(0, -cs) * (run ? 1.2 : 0.8)];
      T.armsX = [-sw * A * 0.8, sw * A * 0.8]; T.fore = [-0.5 - Math.max(0, -sw) * 0.5, -0.5 - Math.max(0, sw) * 0.5]; T.armsZ = [0.12, -0.12];
      T.y = Math.abs(sw) * (run ? 0.06 : 0.03); T.bodyX = run ? 0.22 : 0.05; T.hipsZ = sw * 0.05;
      if (s === 'limp') { T.bodyZ = Math.sin(φ) * 0.1; T.y -= Math.max(0, sw) * 0.06; T.bodyX = 0.15; }
      if (s === 'crawl') { T.bodyX = -1.35; T.y = 0.4; T.armsX = [-1.6 + sw * 0.4, -1.6 - sw * 0.4]; T.fore = [-0.2, -0.2]; T.legs = [1.4 + sw * 0.3, 1.4 - sw * 0.3]; T.shins = [-1.4, -1.4]; }
    }
    else if (s === 'fly') { T.bodyX = 1.1; T.armsZ = [1.4, -1.4]; T.armsX = [-0.3, -0.3]; T.fore = [-0.1, -0.1]; T.legs = [0.15, 0.15]; T.headX = -0.8; T.y = Math.sin(t * 2) * 0.12; }
    else if (s === 'fall') { T.bodyX = -0.7 + Math.sin(t * 2) * 0.4; T.bodyZ = Math.sin(t * 1.5) * 0.5; T.armsX = [-2.7, -2.7]; T.armsZ = [0.6, -0.6]; T.legs = [0.6, -0.3]; T.shins = [-0.5, -0.2]; keepHead = false; }
    else if (s === 'float') { T.y = 0.4 + Math.sin(t * 1.3) * 0.25; T.armsZ = [0.7, -0.7]; T.armsX = [-0.4 + Math.sin(t) * 0.1, -0.4 - Math.sin(t) * 0.1]; T.legs = [0.15, -0.1]; T.headX = -0.2; }
    else if (s === 'swim') { T.bodyX = 1.45; T.y = 0.6; T.armsX = [-2.8 + Math.sin(t * 5) * 0.9, -2.8 - Math.sin(t * 5) * 0.9]; T.fore = [-0.3, -0.3]; T.legs = [Math.sin(t * 8) * 0.35, -Math.sin(t * 8) * 0.35]; T.headX = -1.0; }
    else if (s === 'sit') { T.legs = [-1.5, -1.5]; T.shins = [-1.45, -1.45]; T.y = -0.44; T.ground = true; T.armsX = [-0.6, -0.6]; T.fore = [-0.9, -0.9]; }
    else if (s === 'kneel') { T.legs = [1.5, 1.5]; T.shins = [-2.7, -2.7]; T.y = -0.52; T.ground = true; T.armsX = [-0.7, -0.7]; T.fore = [-0.8, -0.8]; T.bodyX = 0.2; }
    else if (s === 'lie') { T.bodyX = -1.5; T.y = 0.2 - 0.96 + 0.18; T.ground = true; T.armsX = [-0.2, -0.2]; T.armsZ = [0.25, -0.25]; T.headX = 0.2; keepHead = false; }
    else if (s === 'collapse') { const p = easeInOut(window); T.ground = p > 0.6; T.bodyX = -1.5 * p; T.y = (0.2 - 0.96 - 0.02) * p; T.legs = [0.5 * p, 0.2 * p]; T.shins = [-0.6 * p, -0.3 * p]; T.armsX = [-0.6 * p, -0.9 * p]; T.headX = 0.5 * p; keepHead = false; }
    else if (s === 'shake') { T.armsX = [-0.9 + Math.sin(t * 20) * 0.35, -0.9 - Math.sin(t * 20) * 0.35]; T.fore = [-1.2, -1.2]; T.armsZ = [0.3, -0.3]; T.bodyX = 0.18 + Math.sin(t * 9) * 0.1; T.headZ = Math.sin(t * 30) * 0.15; T.hipsZ = Math.sin(t * 25) * 0.04; }
    else if (s === 'push') { T.armsX = [-1.5, -1.5]; T.fore = [-0.1, -0.1]; T.bodyX = 0.2 + Math.max(0, Math.sin(t * 4)) * 0.15; T.legs = [0.3, -0.3]; T.shins = [-0.2, -0.5]; }
    else if (s === 'spin') { T.armsZ = [0.9, -0.9]; T.armsX = [-0.3, -0.3]; }
    else if (s === 'dance') { const v = 0.5 + 0.5 * Math.sin(phase * 3.7); T.y = Math.abs(Math.sin(t * 6)) * 0.12; T.armsZ = [1.1 + v * 1.3 + Math.sin(t * 6) * 0.5, -(0.9 + (1 - v) * 1.5) - Math.sin(t * 6 + 1) * 0.5]; T.fore = [-0.6, -0.6]; T.legs = [Math.sin(t * 6) * 0.2, -Math.sin(t * 6) * 0.2]; T.hipsZ = Math.sin(t * 6) * 0.12; }
    else if (s === 'wave') { T.armsZ = [0.08, -2.7]; T.armsX = [0, -0.2]; T.fore = [-0.25, -0.3 + Math.sin(t * 8) * 0.5]; T.headY = 0; }
    else if (s === 'melt') { const p = window; T.ground = true; T.torsoS = Math.max(0.05, 1 - p); T.y = -0.9 * p; T.armsZ = [0.8 * p, -0.8 * p]; }
    else if (s === 'fold') { const p = window; T.headS = Math.max(0.15, 1 - p * 0.85); T.headX = p * 1.1; T.headZ = Math.sin(p * 6) * 0.3 * p; T.armsX = [-1.6 * p, -1.6 * p]; T.fore = [-0.9 * p, -0.9 * p]; T.bodyX = 0.35 * p; keepHead = false; }
    else { /* idle: breathe, shift weight, look around */ T.armsX = [Math.sin(t * 1.1) * 0.05, Math.sin(t * 1.3 + 1) * 0.05]; T.fore = [-0.3, -0.3]; T.hipsZ = Math.sin(t * 0.6) * 0.03; T.bodyZ = -Math.sin(t * 0.6) * 0.02; T.headY = Math.sin(t * 0.45) * 0.25; T.torsoS = 1 + Math.sin(t * 1.6) * 0.015; }
    if (keepHead && lookYaw !== null && lookYaw !== undefined) { T.headY = clamp(lookYaw, -1.1, 1.1); T.headX = 0; }
    // blend toward the target pose
    const f = snap ? 1 : 1 - Math.exp(-dt * 12); const lp = (a, b) => a + (b - a) * f;
    for (const k of ['legs', 'shins', 'armsX', 'armsZ', 'fore']) { P[k][0] = lp(P[k][0], T[k][0]); P[k][1] = lp(P[k][1], T[k][1]); }
    for (const k of ['headX', 'headY', 'headZ', 'bodyX', 'bodyZ', 'hipsZ', 'y', 'torsoS', 'headS']) P[k] = lp(P[k], T[k]);
    // apply
    for (let i = 0; i < 2; i++) { L.legs[i].rotation.x = P.legs[i]; L.shins[i].rotation.x = P.shins[i]; L.arms[i].rotation.x = P.armsX[i]; L.arms[i].rotation.z = P.armsZ[i]; L.fore[i].rotation.x = P.fore[i]; }
    L.head.rotation.set(P.headX, P.headY, P.headZ); L.head.scale.set(1 + (1 - P.headS) * 0.5, P.headS, 1 + (1 - P.headS) * 0.3);
    L.torso.scale.set(1 + (1 - P.torsoS) * 0.5, P.torsoS, 1 + (1 - P.torsoS) * 0.5); L.hips.rotation.set(P.bodyX, 0, P.bodyZ + P.hipsZ); L.hips.position.y = 0.96 + P.y;
    // a pose that folds the limbs cannot know where they end up: measure the rig and set it on the ground
    if (T.ground) { g.updateMatrixWorld(true); const bb = this._bb || (this._bb = new THREE.Box3()); bb.setFromObject(L.hips); const foot = bb.min.y - g.position.y; if (Number.isFinite(foot)) L.hips.position.y += -foot + 0.03; }
  },
  headTarget(rec, st) {
    // who should this figure look at: the nearest other visible actor acting in this beat, within 7 m
    const b = this.scene.beats[this.lastBeat]; if (!b) return null; let best = null, bd = 7;
    for (const x of b.actions) { const id = x.actor; if (!id || id === rec.a.id) continue; const o = this.states.get(id); if (!o || o.op < 0.3) continue; const dx = o.pos[0] - st.pos[0], dz = o.pos[2] - st.pos[2]; const d = Math.hypot(dx, dz); if (d < bd && d > 0.3) { bd = d; best = Math.atan2(dx, dz); } }
    if (best === null) { const c = b.camera.target; if (c && c !== rec.a.id) { const o = this.states.get(c); if (o && o.op > 0.3) { const dx = o.pos[0] - st.pos[0], dz = o.pos[2] - st.pos[2]; const d = Math.hypot(dx, dz); if (d < 9 && d > 0.3) best = Math.atan2(dx, dz); } } }
    if (best === null) return null; let rel = best - st.yaw * Math.PI / 180; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); return Math.abs(rel) < 1.6 ? rel : null;
  },
  animate(rec, st, τ, dt, snap) {
    const g = rec.g, ud = g.userData, s = st.state, L = ud.limbs; const sp = st.moving > 2.5 ? 11 : 6; const kind = rec.a.kind;
    // smooth turning
    const wantYaw = st.yaw * Math.PI / 180; if (snap || ud.visYaw === undefined) ud.visYaw = wantYaw; else { let d = wantYaw - ud.visYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); ud.visYaw += d * (1 - Math.exp(-dt * 6)); } g.rotation.y = ud.visYaw;
    if (L) { const look = (s === 'idle' || s === 'sit' || s === 'kneel' || s === 'shake' || s === 'push' || s === 'wave' || s === 'walk' || s === 'limp') ? this.headTarget(rec, st) : null; this.poseHuman(g, L, s, τ, dt, st.size, st.window, g.id * 0.37, st.moving, look, snap); return; }
    if (ud.members) { const ms = (s === 'walk' || s === 'run' || s === 'limp' || s === 'crawl') ? s : (st.moving > 0.05 ? 'walk' : s); ud.members.forEach(m => { const base = m.userData.basePos || (m.userData.basePos = m.position.clone()); m.position.copy(base); m.scale.setScalar(1); if (st.moving > 0.05 || ms === 'walk' || ms === 'run') m.rotation.y = 0; else m.rotation.y = m.userData.baseYaw || 0; this.poseHuman(m, m.userData.limbs, ms, τ, dt, 1, st.window, m.userData.phase, st.moving, null, snap); }); return; }
    if (ud.legs) { const mv = st.moving > 0.05 || s === 'walk' || s === 'run'; const gsp = (st.moving > 2.5 || s === 'run') ? 12 : 7; const AP = ud.animPhase === undefined ? (ud.animPhase = 0) : ud.animPhase; ud.animPhase = mv ? AP + dt * gsp : AP; const φ = ud.animPhase;
      if (ud.shins) { // quadruped: diagonal gait with knee flex, a head bob and a tail
        const ph = [0, Math.PI, Math.PI, 0]; ud.legs.forEach((l, i) => { const want = mv ? Math.sin(φ + ph[i]) * 0.55 : 0; l.rotation.x += (want - l.rotation.x) * Math.min(1, dt * 12); const kw = mv ? -Math.max(0, Math.cos(φ + ph[i])) * 0.7 : 0; ud.shins[i].rotation.x += (kw - ud.shins[i].rotation.x) * Math.min(1, dt * 12); });
        if (ud.headG) { const bob = mv ? Math.sin(φ * 2) * 0.06 : Math.sin(τ * 0.8) * 0.05; ud.headG.rotation.x = bob; ud.headG.rotation.y = mv ? 0 : Math.sin(τ * 0.5) * 0.3; } if (ud.tailG) ud.tailG.rotation.y = Math.sin(τ * (mv ? 9 : 3)) * 0.35; g.position.y += mv ? Math.abs(Math.sin(φ)) * 0.03 * st.size : 0; }
      else ud.legs.forEach((l, i) => l.rotation.x = mv ? Math.sin(φ + (i % 2) * Math.PI) * 0.6 : (kind === 'animal' && rec.a.detail.species === 'spider' ? Math.sin(τ * 6 + i) * 0.15 : 0));
      if (s === 'lie') g.rotation.z = 1.5; if (s === 'shake') g.position.x += (Math.random() - 0.5) * 0.06; if (s === 'spin') g.rotation.y += τ * 5; if (s === 'fly' || s === 'float') g.position.y += (1 + Math.sin(τ * 2) * 0.3) * st.size; }
    if (ud.wings) { const flying = s === 'fly' || st.moving > 0.05 || st.pos[1] > 0.5; const flap = flying ? Math.sin(τ * 11) * 0.75 : Math.sin(τ * 1.5) * 0.06; ud.wings[0].rotation.z = flap; ud.wings[1].rotation.z = -flap; g.position.y += flying ? Math.sin(τ * 2.2) * 0.12 : 0; g.rotation.x = flying ? 0.15 + Math.sin(τ * 2.2) * 0.05 : 0; g.rotation.z = st.moving > 0.05 ? Math.sin(τ * 0.9) * 0.2 : 0; }
    if (ud.tail) ud.tail.rotation.y = Math.sin(τ * 6) * 0.5;
    if (ud.segs) ud.segs.forEach((sg, i) => sg.position.x = Math.sin(τ * 4 - i * 0.7) * 0.15 * (st.moving > 0.05 || s !== 'idle' ? 1 : 0.3));
    if (ud.wheels) { const spin = st.moving > 0.05 ? τ * 8 : 0; ud.wheels.forEach(w => w.rotation.x = spin); }
    if (ud.bob) g.position.y += Math.sin(τ * 1.4 + g.id) * 0.12 * st.size;
    if (ud.doorPivot) { const open = s === 'open' || rec.a.detail.open; const target = open ? -1.6 : 0; ud.doorPivot.rotation.y += (target - ud.doorPivot.rotation.y) * Math.min(1, dt * 4); }
    if (s === 'shake') { g.position.x += (Math.random() - 0.5) * 0.06 * st.size; g.position.z += (Math.random() - 0.5) * 0.06 * st.size; }
    if (s === 'spin') g.rotation.y += τ * 4; if (s === 'float' || s === 'fly') g.position.y += (0.6 + Math.sin(τ * 1.5) * 0.3) * st.size; if (s === 'fall') g.rotation.x = Math.sin(τ * 2) * 0.6;
    if (s === 'collapse' || s === 'melt') { g.scale.y *= Math.max(0.05, 1 - st.window); }
  },
  updateCamera(beat, states, dt, snap) {
    const f_isTarget = (id, cc) => id === cc.target;
    const c = beat.camera, tg = states.get(c.target) || states.values().next().value; const T = new THREE.Vector3(tg.pos[0], tg.pos[1], tg.pos[2]); const rec = this.actors.get(c.target); const hgt = rec ? rec.g.userData.baseHeight * (tg.size / rec.a.size) : 1.8; const eye = T.clone().add(new THREE.Vector3(0, Math.min(hgt * 0.6, 1.6), 0));
    let pos, look; const local = this.time - beat.start;
    // frame the whole group that acts in this beat, not only the target
    let groupC = null, groupR = 0; { const active = beat.actions.filter(x => x.actor && (x.move || x.say || x.appear || (x.state && x.state !== 'idle'))).map(x => x.actor); const ids = [...new Set(active.concat([c.target]))]; const pts = []; for (const id of ids) { const st = states.get(id); const r2 = this.actors.get(id); if (!st || st.op < 0.3 || !r2 || r2.g.userData.big || r2.g.userData.flat) continue; if (r2.g.userData.members && id !== c.target) continue; if (Math.abs(st.pos[1] - T.y) > 3) continue; pts.push(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])); } if (pts.length > 1) { groupC = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length); for (const p of pts) groupR = Math.max(groupR, Math.hypot(p.x - groupC.x, p.z - groupC.z)); if (groupR > 7 || groupR < 1.2) { groupC = null; groupR = 0; } } }
    const dirAt = (deg, d, h) => new THREE.Vector3(Math.sin(deg * Math.PI / 180) * d, h, Math.cos(deg * Math.PI / 180) * d);
    if (c.mode === 'fixed' && c.pos) { pos = new THREE.Vector3(...c.pos); look = Array.isArray(c.lookAt) ? new THREE.Vector3(...c.lookAt) : (typeof c.lookAt === 'string' && states.get(c.lookAt) ? new THREE.Vector3(...states.get(c.lookAt).pos).add(new THREE.Vector3(0, 1, 0)) : eye); }
    else if (c.mode === 'pov') { pos = T.clone().add(new THREE.Vector3(0, Math.max(0.5, hgt * 0.88), 0)); look = pos.clone().add(dirAt(tg.yaw, 10, -0.5)); }
    else if (c.mode === 'orbit') { const ang = c.angle + tg.yaw + local * 18; const dist = groupC ? Math.min(c.distance * 1.8, Math.max(c.distance, groupR * 1.8 + 3)) : c.distance; const ctr = groupC ? T.clone().lerp(groupC, 0.6) : T; pos = ctr.clone().add(dirAt(ang, dist, c.height + (dist - c.distance) * 0.2)); look = groupC ? new THREE.Vector3(ctr.x, eye.y, ctr.z) : eye; }
    else if (c.mode === 'wide') { const extent = Math.max(groupR * 2, (rec ? rec.g.userData.baseHeight : 1.8) * 2); const floorD = clamp(extent * 3.2, 12, 26); pos = T.clone().add(dirAt(c.angle + tg.yaw, Math.max(c.distance, floorD), Math.max(c.height, floorD * 0.32) + local * 0.2)); look = groupC ? new THREE.Vector3(groupC.x, eye.y, groupC.z) : eye; }
    else { const sm = this.smoothYaw === undefined ? tg.yaw : this.smoothYaw; const d = ((tg.yaw - sm + 540) % 360) - 180; this.smoothYaw = snap ? tg.yaw : sm + d * Math.min(1, dt * 1.5); const dist = groupC ? Math.min(c.distance * 1.8, Math.max(c.distance, groupR * 1.6 + 3)) : c.distance; pos = T.clone().add(dirAt(this.smoothYaw + c.angle, dist, c.height + local * 0.05 + (dist - c.distance) * 0.25)); look = groupC ? new THREE.Vector3(lerp(T.x, groupC.x, 0.5), eye.y, lerp(T.z, groupC.z, 0.5)) : eye; }
    const lookRec = typeof c.lookAt === 'string' ? this.actors.get(c.lookAt) : null;
    const selfs = [rec && rec.g, lookRec && lookRec.g].filter(Boolean);
    const settle = (p0, l0) => { let p = p0.clone(), look2 = l0.clone();
    // the subject is inside a room: keep the camera in there with them rather than outside a shell whose front faces are culled
    { const room = this.roomAround(look2); if (room) { const b = room.box; const pad = 0.45;
        if (p.x < b.min.x + pad || p.x > b.max.x - pad || p.z < b.min.z + pad || p.z > b.max.z - pad || p.y > b.max.y - 0.3) {
          const d = p.clone().sub(look2); const dl = d.length() || 1; d.divideScalar(dl);
          let t = dl; for (const [lo, hi, o, dd] of [[b.min.x + pad, b.max.x - pad, look2.x, d.x], [b.min.z + pad, b.max.z - pad, look2.z, d.z], [-1e6, b.max.y - 0.3, look2.y, d.y]]) { if (Math.abs(dd) < 1e-4) continue; const t1 = (hi - o) / dd, t2 = (lo - o) / dd; for (const tt of [t1, t2]) if (tt > 0.2 && tt < t) t = tt; }
          p = look2.clone().add(d.multiplyScalar(Math.max(1.2, t - 0.15)));
        } } }
    // part of the beat is happening below the ground: look2 down into the hole instead of across it
    { const low = [], high = []; for (const x of beat.actions) { if (!x.actor) continue; const st = states.get(x.actor); const r2 = this.actors.get(x.actor); if (!st || st.op < 0.3 || !r2 || r2.g.userData.flat || r2.g.userData.big) continue; const climbing = beat.actions.some(q => q.actor === x.actor && q.move && q.move[1] > -1); (st.pos[1] < -1 && !climbing ? low : high).push(st); }
      if (low.length && high.length) { const c0 = low.reduce((a, st) => a.add(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])), new THREE.Vector3()).divideScalar(low.length);
        look2 = new THREE.Vector3(c0.x, c0.y + 1.2, c0.z);
        const off = p.clone().sub(look2); const len = Math.max(3, off.length()); const flat = Math.hypot(off.x, off.z) || 0.001;
        const pitch = Math.PI / 180 * 58; p.set(look2.x + off.x / flat * len * Math.cos(pitch), look2.y + len * Math.sin(pitch), look2.z + off.z / flat * len * Math.cos(pitch)); } }
    // keep camera above ground and out of the target
    const minY = Math.min(0.4, T.y + 0.5); if (p.y < minY) p.y = minY;
    const look2Rec = typeof c.look2At === 'string' ? this.actors.get(c.look2At) : null;
    const selfs = [rec && rec.g, look2Rec && look2Rec.g].filter(Boolean);
    p = this.unblock(look2, p, selfs.length ? selfs : null);
      p = this.pushOffLens(p, look2, selfs);
      return { pos: p, look: look2 };
    };
    // frame the actors the sentence names, not only the camera's target: try the shot, then a few wider or turned variants
    const framed = [];
    const cut = beat.actions.some(x => x.effect === 'blackout');
    for (const x of beat.actions) { if (!x.actor) continue; if (cut && !x.appear && !x.say && !x.move) continue; const st2 = states.get(x.actor), r2 = this.actors.get(x.actor); if (!st2 || st2.op < 0.3 || !r2 || r2.g.userData.flat) continue; const weight = (x.say || x.move || (x.state && x.state !== 'idle')) ? 1 : 0.35; const prev = framed.find(q => q.id === x.actor); if (prev) { prev.w = Math.max(prev.w, weight); continue; } framed.push({ id: x.actor, g: r2.g, w: weight, faced: FACED.has(r2.a.kind), speaks: !!x.say, h: r2.g.userData.baseHeight * (st2.size / r2.a.size), p: new THREE.Vector3(st2.pos[0], st2.pos[1] + Math.min(r2.g.userData.baseHeight * (st2.size / r2.a.size) * 0.5, 6), st2.pos[2]) }); }
    const authored = c.mode === 'fixed' && !!c.pos;
    const facesMatter = FACED.has((rec && rec.a.kind) || '') && (tg.moving || 0) < 0.3 && beat.actions.some(x => x.actor === c.target && (x.say || (x.state && x.state !== 'idle' && !['walk', 'run', 'limp', 'fly', 'swim', 'crawl'].includes(x.state))));
    if (!authored && (snap || !this.framePick || this.framePick.beat !== this.lastBeat)) {
      let best = { az: 0, mul: 1, score: -1 };
      if (framed.length >= 1) {
        const azList = facesMatter ? [0, 26, -26, 55, -55, 90, -90, 140, -140, 180] : [0, 26, -26, 55, -55, 80, -80];
        for (const mul of [1, 1.35, 1.8]) for (const az of azList) {
          const cand = this.turnShot(pos, look, az, mul); const out = settle(cand, look);
          let n = 0, tgtSeen = false, tooSmall = false;
          let scenery = 0;
          for (const f of framed) { if (!this.inShot(out.pos, out.look, f.p, f.g)) continue; if (f.w < 1) { scenery = Math.min(0.7, scenery + f.w); } else n += f.w; if (f.id === c.target) { tgtSeen = true; n += 0.8; }
            if (f.w >= 1) { const apparent = (f.h || 1.8) / Math.max(1, f.p.distanceTo(out.pos)); if (apparent < 0.045) tooSmall = true; } }
          n += scenery; if (tooSmall) n -= 1.5;
          const toCam = out.pos.clone().sub(T); const facing = dirAt(tg.yaw, 1, 0); const front = (toCam.x * facing.x + toCam.z * facing.z) / (Math.hypot(toCam.x, toCam.z) || 1);
          let faceCost = 0; if (facesMatter) { const tf = framed.find(f => f.id === c.target); if (tf && this.inShot(out.pos, out.look, tf.p, tf.g)) faceCost = (1 - front) * 0.9;
            for (const f of framed) { if (!f.speaks || f.id === c.target) continue; if (!this.inShot(out.pos, out.look, f.p, f.g)) continue; const st3 = states.get(f.id); const fc = dirAt(st3.yaw, 1, 0); const v = out.pos.clone().sub(new THREE.Vector3(st3.pos[0], st3.pos[1], st3.pos[2])); const fr = (v.x * fc.x + v.z * fc.z) / (Math.hypot(v.x, v.z) || 1); faceCost += (1 - fr) * 0.3; } }
          const cost = Math.abs(az) / 900 + (mul - 1) * 0.9 + this.lensCrowding(out.pos, selfs) * 0.7 + Math.min(1.4, faceCost);
          const score = n - cost; if (score > best.score) best = { az, mul, score, n };
          if (n === framed.length && az === 0 && mul === 1 && this.lensCrowding(out.pos, selfs) === 0) break;
        }
      }
      this.framePick = { beat: this.lastBeat, az: best.az, mul: best.mul };
    } else if (authored) { this.framePick = { beat: this.lastBeat, az: 0, mul: 1 };
    }
    if (this.framePick.az || this.framePick.mul !== 1) pos = this.turnShot(pos, look, this.framePick.az, this.framePick.mul);
    { const out = settle(pos, look); pos = out.pos; look = out.look; }
    if (this.user.on) { const u = this.user; look = look.clone(); pos = look.clone().add(new THREE.Vector3(Math.sin(u.theta) * Math.cos(u.phi) * u.dist, Math.sin(u.phi) * u.dist, Math.cos(u.theta) * Math.cos(u.phi) * u.dist)); if (pos.y < minY) pos.y = minY; }
    if (snap) { this.cam.pos.copy(pos); this.cam.look.copy(look); } else { const k = this.user.on ? 8 : (c.mode === 'fixed' ? 2.2 : 3 + Math.min(9, (tg.moving || 0) * 0.3)); const f = 1 - Math.exp(-dt * k); this.cam.pos.lerp(pos, f); this.cam.look.lerp(look, f); }
    const hh = this.user.on ? 0 : 0.035; const drift = new THREE.Vector3(Math.sin(this.time * 0.7) * hh + Math.sin(this.time * 1.9) * hh * 0.4, Math.sin(this.time * 0.9 + 1) * hh * 0.7, Math.cos(this.time * 0.5) * hh);
    if (this.quake > 0) { this.quake -= dt; const q = Math.min(1, this.quake) * 0.25; this.camera.position.copy(this.cam.pos).add(new THREE.Vector3((Math.random() - 0.5) * q, (Math.random() - 0.5) * q, (Math.random() - 0.5) * q)); } else this.camera.position.copy(this.cam.pos).add(drift);
    const camDist = this.camera.position.distanceTo(this.cam.look); this.three.fog.density = Math.min(this.three.fog.density, 0.9 / Math.max(4, camDist));
    this.camera.lookAt(this.cam.look); this.sky.position.copy(this.camera.position); this.stars.position.copy(this.camera.position); this.ground.position.set(this.cam.look.x, 0, this.cam.look.z); this.waterGround.position.set(this.cam.look.x, 0, this.cam.look.z);
  },
  insideSolid(p, self) {
    if (!this.solidsNow) return false; const v = this._v || (this._v = new THREE.Vector3());
    for (const o of this.solidsNow) { if (o.userData.soft || (o.material && o.material.side === THREE.BackSide)) continue; if (self && this.isOwn(o, self)) continue; const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox); if (!bb) continue; v.copy(p); o.worldToLocal(v); const sx = o.getWorldScale(this._s || (this._s = new THREE.Vector3())); const m = 0.4 / Math.max(0.05, Math.max(sx.x, sx.y, sx.z)); if (v.x > bb.min.x - m && v.x < bb.max.x + m && v.y > bb.min.y - m && v.y < bb.max.y + m && v.z > bb.min.z - m && v.z < bb.max.z + m) return true; }
    return false;
  },
  isOwn(o, self) { if (!self) return false; if (Array.isArray(self)) { for (const q of self) if (q && this.isOwn(o, q)) return true; return false; } let p = o; while (p) { if (p === self) return true; p = p.parent; } return false; },
  clearDist(look, dir, len, self) {
    this._ray = this._ray || new THREE.Raycaster(); const r = this._ray; r.set(look, dir); r.near = 0.3; r.far = len; const hits = r.intersectObjects(this.solidsNow || [], false);
    for (const h of hits) { if (self && this.isOwn(h.object, self)) continue; if (h.object.userData.soft && len - h.distance > Math.max(1.2, len * 0.4)) continue; return h.distance; }
    return Infinity;
  },
  lensCrowding(pos, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return 0; const w = this._v3 || (this._v3 = new THREE.Vector3()); let n = 0; const seen = new Set();
    for (const o of sol) { if (this.isOwn(o, self)) continue; const owner = o.parent && o.parent.parent ? o.parent.parent : o.parent; if (seen.has(owner)) continue; o.getWorldPosition(w); if (w.distanceTo(pos) < 2.4) { seen.add(owner); n++; } }
    return n;
  },
  pushOffLens(pos, look, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return pos;
    const dir = pos.clone().sub(look); const len = dir.length(); if (len < 0.6) return pos; dir.divideScalar(len);
    const w = this._v2 || (this._v2 = new THREE.Vector3()); let extra = 0;
    for (let step = 0; step < 4; step++) {
      let hit = false;
      for (const o of sol) { if (this.isOwn(o, self)) continue; o.getWorldPosition(w); if (w.distanceTo(pos) < 1.45) { hit = true; break; } }
      if (!hit) break;
      pos = pos.clone().add(dir.clone().multiplyScalar(0.9)); extra += 0.9; if (extra > 3.6) break;
    }
    return pos;
  },
  turnShot(pos, look, azDeg, mul) {
    const off = pos.clone().sub(look); const r = azDeg * Math.PI / 180; const c = Math.cos(r), sn = Math.sin(r);
    const x = off.x * c - off.z * sn, z = off.x * sn + off.z * c;
    return look.clone().add(new THREE.Vector3(x, off.y, z).multiplyScalar(mul));
  },
  inShot(pos, look, point, own) {
    const c2 = this._cam2 || (this._cam2 = new THREE.PerspectiveCamera(50, 1, 0.1, 1200));
    c2.fov = this.camera.fov; c2.aspect = this.camera.aspect; c2.position.copy(pos); c2.up.set(0, 1, 0); c2.lookAt(look); c2.updateMatrixWorld(true); c2.updateProjectionMatrix();
    const v = point.clone().project(c2);
    if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.82) return false;
    return !this.occluded(pos, point, own);
  },
  roomAround(p) {
    if (!this._rooms) { this._rooms = []; for (const rec of this.actors.values()) { if (rec.a.kind !== 'room' && rec.a.kind !== 'corridor') continue; const box = new THREE.Box3().setFromObject(rec.g); this._rooms.push({ rec, box }); } }
    for (const r of this._rooms) { if (!r.rec.g.visible) continue; const b = r.box; if (p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y < b.max.y) return r; }
    return null;
  },
  unblock(look, pos, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return pos;
    const off = pos.clone().sub(look); const len = off.length(); if (len < 0.5) return pos;
    // how far out along `d` the camera may sit before something comes between it and the subject
    const reach = (d, want) => { const c = this.clearDist(look, d, want, self); return c === Infinity ? want : Math.max(0, c - 0.6); };
    const free = p => p.y >= 0.35 && !this.insideSolid(p, self);
    const dir0 = off.clone().divideScalar(len);
    if (reach(dir0, len) >= len - 0.05 && free(pos)) return pos;
    // sweep around the subject at the SAME radius, lifting the camera as the sweep widens
    const flat = new THREE.Vector3(off.x, 0, off.z); let fl = flat.length(); if (fl < 0.001) { flat.set(0, 0, 1); fl = 1; }
    const hx = flat.x / fl, hz = flat.z / fl; const el0 = Math.asin(clamp(off.y / len, -0.95, 0.95));
    let best = null, bestR = -1;
    for (const el of [el0, el0 + 0.22, el0 + 0.45, el0 + 0.75, 1.1]) {
      const ch = Math.cos(el), cy = Math.sin(el);
      for (const az of [0, 28, -28, 56, -56, 90, -90, 124, -124, 156, -156, 180]) {
        const r = az * Math.PI / 180; const rx = hx * Math.cos(r) - hz * Math.sin(r), rz = hx * Math.sin(r) + hz * Math.cos(r);
        const d = new THREE.Vector3(rx * ch, cy, rz * ch); const cand = look.clone().add(d.clone().multiplyScalar(len));
        if (cand.y < 0.35) continue;
        const rr = reach(d, len);
        if (rr >= len - 0.05 && free(cand)) return cand;
        if (rr > bestR) { bestR = rr; best = d; }
      }
    }
    // nothing is clear at the scripted radius: come in along the roomiest line, and only as far as the geometry forces
    const dir = best || dir0; const floor = Math.min(len, Math.max(2.5, len * 0.55));
    const use = bestR >= floor ? Math.min(len, bestR) : Math.max(1.2, bestR);
    const out = look.clone().add(dir.clone().multiplyScalar(use)); if (out.y < 0.35) out.y = 0.35;
    return out;
  },

  occluded(from, to, self) {
    if (!this.solids || !this.solids.length) return false; this._ray2 = this._ray2 || new THREE.Raycaster(); const r = this._ray2; const dir = to.clone().sub(from); const len = dir.length(); if (len < 0.5) return false; dir.divideScalar(len); r.set(from, dir); r.near = 0.2; r.far = len - 0.3; const hits = r.intersectObjects(this.solidsNow || this.solids, false); for (const h of hits) { let o = h.object, own = false; while (o) { if (o === self) { own = true; break; } o = o.parent; } if (!own) return true; } return false;
  },
  triggerEffect(k) { if (k === 'flash') this.fx.push({ k, t: 0.7 }); else if (k === 'blackout') { this.fx.push({ k, t: 1.4 }); this.cam.snap = true; } else if (k === 'quake') this.quake = 1.0; else if (k === 'blur') this.fx.push({ k, t: 1.6 }); else if (k === 'pulse') this.fx.push({ k, t: 2.4 }); },
  updateEffects(dt) {
    let white = 0, black = 0, blur = 0, pulse = 0; this.fx = this.fx.filter(f => (f.t -= dt) > 0); for (const f of this.fx) { if (f.k === 'flash') white = Math.max(white, f.t / 0.7); if (f.k === 'blackout') black = Math.max(black, Math.min(1, f.t / 1.0)); if (f.k === 'blur') blur = Math.max(blur, f.t / 1.6); if (f.k === 'pulse') pulse = Math.max(pulse, Math.sin(f.t * 8) * 0.5 + 0.5); }
    this.fxEl.style.background = black > white ? '#000' : '#fff'; this.fxEl.style.opacity = Math.max(white, black).toFixed(3); this.canvas.style.filter = blur > 0.01 ? `blur(${(blur * 6).toFixed(1)}px)` : ''; if (pulse > 0) this.three.fog.density = this.worldNow.fogDensity * (1 + pulse * 2);
  },
  aimSkyLive() {
    if (!this.scene) return; const sky = [...this.actors.values()].filter(r => r.g.userData.far && r.g.userData.centered); if (!sky.length) return;
    const cam = this.camera; cam.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const vhalf = cam.fov * Math.PI / 360; const rise = Math.tan(vhalf) * 0.2;
    for (const rec of sky) {
      const a = rec.a; if (a.hidden) continue; const D = Math.max(70, Math.hypot(a.pos[0], a.pos[2]));
      if (this.roomAround(new THREE.Vector3(a.pos[0], Math.min(a.pos[1], 2), a.pos[2]))) continue;
      const dir = fwd.clone().add(up.clone().multiplyScalar(rise)).normalize();
      const p = cam.position.clone().add(dir.multiplyScalar(D));
      if (p.y < 8) p.y = 8;
      // settle it into the upper third of the frame rather than on its edge
      for (let k = 0; k < 12; k++) { const ndc = p.clone().project(cam); if (ndc.y <= 0.55) break; p.y -= Math.max(1, (ndc.y - 0.5) * 22); if (p.y < 8) { p.y = 8; break; } }
      a.pos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      const st = this.states && this.states.get(a.id); if (st) st.pos = a.pos.slice();
      rec.g.position.set(a.pos[0], a.pos[1], a.pos[2]);
    }
  },

  fitSky(states) {
    if (!this.scene) return; const cam = this.camera;
    for (const [id, rec] of this.actors) { const ud = rec.g.userData; if (!ud.far || !ud.centered) continue; const st = states.get(id); if (!st) continue;
      const p = new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]); const d = p.distanceTo(cam.position);
      const half = Math.tan(cam.fov * Math.PI / 360) * d; const want = Math.min(st.size, half * 0.17 / 5);
      rec.g.scale.setScalar(Math.max(0.2, want)); }
  },
  updateLabels(states) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; const v = new THREE.Vector3(); const camPos = this.camera.position;
    const curBeat = this.scene.beats[this.lastBeat]; const povId = curBeat && curBeat.camera.mode === 'pov' && !this.user.on ? curBeat.camera.target : null; const curTarget = curBeat ? curBeat.camera.target : null;
    const acting = new Set(curBeat ? curBeat.actions.filter(x => x.actor).map(x => x.actor) : []);
    const placed = [], pts = [];
    for (const [id, rec] of this.actors) { const st = states.get(id); const lbl = rec.lbl; const text = st.say ? `${rec.a.label || rec.a.kind}: “${st.say}”` : rec.a.label; if (!this.labelsOn || !text || st.op < 0.05 || id === povId) { lbl.hidden = true; continue; } const top = rec.g.userData.centered ? rec.g.userData.baseHeight * (st.size / rec.a.size) + 1 : rec.g.userData.baseHeight * (st.size / rec.a.size) + 0.25; const under = st.pos[1] < -0.5; v.set(st.pos[0], st.pos[1] + (under ? Math.min(top, 12) * 0.45 : Math.min(top, 12)), st.pos[2]); const dist = v.distanceTo(camPos); const isTarget = id === curTarget; if (!rec.g.userData.far && !st.say && !isTarget && dist > 38) { lbl.hidden = true; continue; } if (!rec.g.userData.far && this.occluded(camPos, v, rec.g)) { lbl.hidden = true; continue; } v.project(this.camera); if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 || (dist > 90 && !rec.g.userData.far)) { lbl.hidden = true; continue; } if (v.y < -0.72 || v.y > 0.94) { lbl.hidden = true; continue; } v.x = clamp(v.x, -0.96, 0.96); v.y = clamp(v.y, -0.62, 0.86); lbl.hidden = false; lbl.textContent = text; const lw = lbl.offsetWidth || 60; lbl.style.left = clamp((v.x + 1) / 2 * W, lw / 2 + 6, W - lw / 2 - 6).toFixed(1) + 'px'; lbl.style.top = ((1 - v.y) / 2 * H).toFixed(1) + 'px'; lbl.style.opacity = (clamp(1.3 - dist / 70, 0.25, 1) * st.op).toFixed(2); lbl.style.background = st.say ? 'rgba(179,78,44,.85)' : 'rgba(8,9,22,.55)'; pts.push({ id, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }); placed.push({ lbl, id, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dist, rank: st.say ? 0 : (id === curTarget ? 1 : (acting.has(id) ? 2 : 3)) }); }
    // a crowded frame keeps the labels of whoever is acting; the scenery gives up its name
    placed.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
    const cap = 6; if (placed.length > cap) { for (const p of placed.slice(cap)) p.lbl.hidden = true; placed.length = cap; }
    const rects = [];
    for (const p of placed) { const w = p.lbl.offsetWidth || 60, h = p.lbl.offsetHeight || 20; let y = p.y, tries = 0;
      const clash = (xx, yy) => rects.some(r => Math.abs(r.x - xx) < (r.w + w) / 2 + 4 && Math.abs(r.y - yy) < h + 2)
        || pts.some(q => Math.abs(q.x - xx) < w / 2 + 12 && q.y > yy - h && q.y < yy + h * 1.7);
      let x = p.x, placedOk = !clash(x, y);
      for (const [dx, dy] of [[0, -1], [0, -2], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, -2], [-1, -2], [0, -3], [1.6, 0], [-1.6, 0]]) {
        if (placedOk) break; const nx = p.x + dx * (w / 2 + 16), ny = p.y + dy * (h + 4);
        if (nx < w / 2 + 6 || nx > W - w / 2 - 6 || ny < 30) continue;
        if (!clash(nx, ny)) { x = nx; y = ny; placedOk = true; }
      }
      if (!placedOk) { if (p.rank <= 1) { y = p.y; x = p.x; } else { p.lbl.hidden = true; continue; } }
      if (x !== p.x) p.lbl.style.left = x.toFixed(1) + 'px';
      p.x = x; if (y !== p.y) p.lbl.style.top = y.toFixed(1) + 'px'; rects.push({ x: p.x, y, w, h }); }
  },
  /* metrics for the harness: which actors of the current beat are on screen */
  metrics() {
    if (!this.scene) return null; const bi = this.beatAt(this.time), b = this.scene.beats[bi]; const ids = new Set(b.actions.filter(x => x.actor).map(x => x.actor)); ids.add(b.camera.target); if (b.camera.mode === 'pov') ids.delete(b.camera.target); const v = new THREE.Vector3(); const res = [];
    for (const id of ids) { const rec = this.actors.get(id), st = this.states.get(id); if (!rec || !st) continue; const top = rec.g.userData.baseHeight * (st.size / rec.a.size); v.set(st.pos[0], st.pos[1] + top / 2, st.pos[2]); const dist = v.distanceTo(this.camera.position); const occ = this.occluded(this.camera.position, v.clone(), rec.g); v.project(this.camera); res.push({ id, visible: st.op > 0.05, onScreen: st.op > 0.05 && !occ && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, occluded: occ, dist: +dist.toFixed(1), x: +v.x.toFixed(2), y: +v.y.toFixed(2) }); }
    const ft = this.frameTimes.slice(-120); const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0; return { beat: bi, time: +this.time.toFixed(2), camera: { pos: this.camera.position.toArray().map(q => +q.toFixed(1)), look: this.cam.look.toArray().map(q => +q.toFixed(1)), mode: b.camera.mode }, fog: +this.three.fog.density.toFixed(4), actors: res, frameMs: +avg.toFixed(1), tris: this.r.info.render.triangles, calls: this.r.info.render.calls };
  }
};
