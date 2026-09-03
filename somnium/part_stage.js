/* =====================================================================
   The stage: renderer, world, actors, timeline evaluation, camera.
   ===================================================================== */
const Stage = {
  ready: false, scene: null, time: 0, playing: false, actors: new Map(), cam: { pos: new THREE.Vector3(0, 3, 10), look: new THREE.Vector3(0, 1, 0), snap: true }, user: { on: false, theta: 0, phi: 0.4, dist: 8 }, fx: [], lastBeat: -1, frameTimes: [], onBeat: null, onTime: null, labelsOn: true,
  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25; r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r; this.three = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 1200);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color('#0b1030') }, hor: { value: new THREE.Color('#2a2f5c') }, fogc: { value: new THREE.Color('#171b3d') } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 fogc; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 low = mix(fogc, hor, smoothstep(0.0, 0.14, h)); float t = smoothstep(0.04, 0.5, h); gl_FragColor = vec4(mix(low, top, t), 1.0); }' }));
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
    for (const rec of this.actors.values()) { if (rec.g.userData.shadow) { const r = rec.g.userData.shadow; const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; this.root.add(blob); rec.blob = blob; } const mats = []; rec.g.traverse(o => { if (o.isMesh && !o.material.userData.water) { o.material = o.material.clone(); o.material.userData.baseOpacity = o.material.opacity; o.material.userData.baseColor = o.material.color.clone(); o.material.userData.baseEmissive = o.material.emissive ? o.material.emissive.clone() : null; mats.push(o.material); } }); rec.mats = mats; }
    this.solids = []; this.root.traverse(o => { if (o.userData.solid) this.solids.push(o); }); this.applyWorld(scene.world); this.setTime(0); this.playing = true;
  },
  setTime(t) { this.time = clamp(t, 0, this.scene ? this.scene.total : 0); this.cam.snap = true; this.fx = []; this.quake = 0; this.canvas.style.filter = ''; this.evaluate(0, true); },
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
        if (x.state === 'grow' || x.state === 'shrink') { st.size = lerp(st.size, st.size * (x.state === 'grow' ? 2.5 : 0.35), e); } else if (x.state) { const transient = ['walk', 'run', 'limp', 'push', 'shake', 'spin', 'collapse', 'wave', 'dance', 'fall', 'open', 'grow', 'shrink'].includes(x.state); if (!transient || p < 1) { st.state = x.state; st.window = p; } else if (x.state === 'collapse') st.state = 'lie'; else if (x.state === 'fall') st.state = 'lie'; else if (x.state === 'open') st.state = 'open'; else if (x.state === 'grow' || x.state === 'shrink') st.state = 'idle'; }
        if (x.say && p < 1) st.say = x.say; }
    }
    for (const st of out.values()) if (st.moving && st.state === 'idle') st.state = st.moving > 2.5 ? 'run' : 'walk';
    return out;
  },
  evalWorld(t) {
    const S = this.scene; const w = { ...S.world };
    for (const b of S.beats) { if (t < b.start) break; for (const x of b.actions) { if (!x.world) continue; const a0 = b.start + x.at * b.dur, a1 = Math.min(b.start + b.dur, a0 + x.for * b.dur); if (t < a0) continue; const p = a1 > a0 ? clamp((t - a0) / (a1 - a0), 0, 1) : 1; for (const k of Object.keys(x.world)) { const v = x.world[k]; if (v === undefined) continue; if (typeof v === 'number') w[k] = lerp(w[k], v, p); else if (typeof v === 'string' && HEX.test(v)) w[k] = p >= 1 ? v : '#' + new THREE.Color(w[k]).lerp(new THREE.Color(v), p).getHexString(); else if (Array.isArray(v)) w[k] = w[k].map((q, i) => lerp(q, v[i], p)); else if (p > 0.5 || k === 'weather' && p > 0) w[k] = v; } } }
    return w;
  },
  applyWorld(w) {
    this.sky.material.uniforms.top.value.set(w.skyColor); this.sky.material.uniforms.hor.value.set(w.horizonColor); this.sky.material.uniforms.fogc.value.set(w.fogColor); this.three.fog.color.set(w.fogColor); this.three.fog.density = w.fogDensity; this.r.setClearColor(w.fogColor);
    const amb = new THREE.Color(w.ambient); const L = 0.2126 * amb.r + 0.7152 * amb.g + 0.0722 * amb.b; if (L < 0.4) amb.lerp(new THREE.Color('#9a9ec0'), (0.4 - L) / 0.4 * 0.85);
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
    for (const [id, rec] of this.actors) { const st = states.get(id), g = rec.g, a = rec.a, ud = g.userData; g.visible = st.op > 0.01; g.position.set(st.pos[0], st.pos[1], st.pos[2]); g.rotation.set(0, g.rotation.y, 0); const sc = ud.noScale ? 1 : st.size; g.scale.setScalar(sc); if (rec.blob) { rec.blob.visible = g.visible && st.pos[1] < 0.6 && !['fly', 'float', 'swim'].includes(st.state); rec.blob.position.set(st.pos[0], 0.02, st.pos[2]); rec.blob.scale.setScalar(sc); }
      for (const m of rec.mats) { const bo = m.userData.baseOpacity; const want = st.op * bo; if (Math.abs(m.opacity - want) > 0.001) { m.opacity = want; m.transparent = want < 0.999 || m.userData.baseOpacity < 0.999; m.needsUpdate = false; } if (st.colorC && !ud.noColor) { const bc = m.userData.baseColor; const from = new THREE.Color(st.colorC[0]), to = new THREE.Color(st.colorC[1]); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(from.clone().lerp(to, st.colorC[2]).multiply(ratio)); } else if (st.color !== a.color) { const bc = m.userData.baseColor; const from = new THREE.Color(a.color), to = new THREE.Color(st.color); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(to.multiply(ratio)); } }
      this.animate(rec, st, τ, dt, snap);
    }
    // ambient animations
    for (const rec of this.actors.values()) { const ud = rec.g.userData; if (ud.flames) { ud.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(τ * 11 + i * 2) * 0.25; f.scale.x = f.scale.z = 1 + Math.sin(τ * 9 + i) * 0.15; }); if (ud.light) ud.light.intensity = 30 + Math.sin(τ * 13) * 6; } if (ud.puffs) ud.puffs.forEach((p, i) => { p.position.y = 0.8 + ((τ * 0.6 + i * 0.9) % 5.4); p.scale.setScalar(0.6 + ((τ * 0.6 + i * 0.9) % 5.4) * 0.25); }); if (ud.rotor) ud.rotor.rotation.y = τ * 25; if (ud.spinPart) ud.spinPart.rotation.y = τ * 1.2; if (ud.drift) rec.g.position.x += Math.sin(τ * 0.05) * 0.0; if (ud.canopy) ud.canopy.forEach(c => c.rotation.z = Math.sin(τ * 0.8) * 0.02); if (ud.trees) ud.trees.forEach((tr, i) => tr.rotation.z = Math.sin(τ * 0.7 + i) * 0.02); if (ud.pulse) rec.mats.forEach(m => { if (m.emissiveIntensity) m.emissiveIntensity = 0.8 + Math.sin(τ * 3) * 0.4; }); }
    for (const o of [this.waterGround]) if (o.material.userData.sh) o.material.userData.sh.uniforms.uTime.value = τ; this.root.traverse(o => { if (o.isMesh && o.material.userData.sh) o.material.userData.sh.uniforms.uTime.value = τ; });
    this.solidsNow = this.solids ? this.solids.filter(o => { let p = o; while (p) { if (p.visible === false) return false; p = p.parent; } return true; }) : [];
    this.solidBoxes = []; for (const o of this.solidsNow) { if (o.material && o.material.side === THREE.BackSide) continue; if (o.geometry.type === 'CapsuleGeometry') continue; const bx = new THREE.Box3().setFromObject(o); if (bx.max.x - bx.min.x > 1.5 && bx.max.z - bx.min.z > 1.5) { bx.expandByScalar(0.4); this.solidBoxes.push(bx); } }
    this.updateCamera(S.beats[bi], states, dt, snap || this.cam.snap); this.cam.snap = false;
    this.updateWeather(dt, τ); this.updateEffects(dt);
    this.r.render(this.three, this.camera); this.updateLabels(states);
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
    else if (s === 'sit') { T.legs = [-1.5, -1.5]; T.shins = [-1.45, -1.45]; T.y = -0.44; T.armsX = [-0.6, -0.6]; T.fore = [-0.9, -0.9]; }
    else if (s === 'kneel') { T.legs = [1.5, 1.5]; T.shins = [-2.7, -2.7]; T.y = -0.52; T.armsX = [-0.7, -0.7]; T.fore = [-0.8, -0.8]; T.bodyX = 0.2; }
    else if (s === 'lie') { T.bodyX = -1.5; T.y = 0.2 - 0.96 + 0.18; T.armsX = [-0.2, -0.2]; T.armsZ = [0.25, -0.25]; T.headX = 0.2; keepHead = false; }
    else if (s === 'collapse') { const p = easeInOut(window); T.bodyX = -1.5 * p; T.y = (0.2 - 0.96 + 0.18) * p; T.legs = [0.5 * p, 0.2 * p]; T.shins = [-0.6 * p, -0.3 * p]; T.armsX = [-0.6 * p, -0.9 * p]; T.headX = 0.5 * p; keepHead = false; }
    else if (s === 'shake') { T.armsX = [-0.9 + Math.sin(t * 20) * 0.35, -0.9 - Math.sin(t * 20) * 0.35]; T.fore = [-1.2, -1.2]; T.armsZ = [0.3, -0.3]; T.bodyX = 0.18 + Math.sin(t * 9) * 0.1; T.headZ = Math.sin(t * 30) * 0.15; T.hipsZ = Math.sin(t * 25) * 0.04; }
    else if (s === 'push') { T.armsX = [-1.5, -1.5]; T.fore = [-0.1, -0.1]; T.bodyX = 0.2 + Math.max(0, Math.sin(t * 4)) * 0.15; T.legs = [0.3, -0.3]; T.shins = [-0.2, -0.5]; }
    else if (s === 'spin') { T.armsZ = [0.9, -0.9]; T.armsX = [-0.3, -0.3]; }
    else if (s === 'dance') { T.y = Math.abs(Math.sin(t * 6)) * 0.12; T.armsZ = [2.4 + Math.sin(t * 6) * 0.4, -2.4 - Math.sin(t * 6 + 1) * 0.4]; T.fore = [-0.6, -0.6]; T.legs = [Math.sin(t * 6) * 0.2, -Math.sin(t * 6) * 0.2]; T.hipsZ = Math.sin(t * 6) * 0.12; }
    else if (s === 'wave') { T.armsZ = [0.08, -2.7]; T.armsX = [0, -0.2]; T.fore = [-0.25, -0.3 + Math.sin(t * 8) * 0.5]; T.headY = 0; }
    else if (s === 'melt') { const p = window; T.torsoS = Math.max(0.05, 1 - p); T.y = -0.9 * p; T.armsZ = [0.8 * p, -0.8 * p]; }
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
    if (ud.legs) { const mv = st.moving > 0.05 || s === 'walk' || s === 'run'; ud.legs.forEach((l, i) => l.rotation.x = mv ? Math.sin(τ * sp + (i % 2) * Math.PI) * 0.6 : (kind === 'animal' && rec.a.detail.species === 'spider' ? Math.sin(τ * 6 + i) * 0.15 : 0)); if (s === 'lie') g.rotation.z = 1.5; if (s === 'shake') g.position.x += (Math.random() - 0.5) * 0.06; if (s === 'spin') g.rotation.y += τ * 5; if (s === 'fly' || s === 'float') g.position.y += (1 + Math.sin(τ * 2) * 0.3) * st.size; }
    if (ud.wings) { const flap = (s === 'fly' || st.moving > 0.05 || s === 'idle') ? Math.sin(τ * 12) * 0.7 : 0; ud.wings[0].rotation.z = flap; ud.wings[1].rotation.z = -flap; g.position.y += Math.sin(τ * 2) * 0.1; }
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
    const c = beat.camera, tg = states.get(c.target) || states.values().next().value; const T = new THREE.Vector3(tg.pos[0], tg.pos[1], tg.pos[2]); const rec = this.actors.get(c.target); const hgt = rec ? rec.g.userData.baseHeight * (tg.size / rec.a.size) : 1.8; const eye = T.clone().add(new THREE.Vector3(0, Math.min(hgt * 0.6, 1.6), 0));
    let pos, look; const local = this.time - beat.start;
    // frame the whole group that acts in this beat, not only the target
    let groupC = null, groupR = 0; { const ids = [...new Set(beat.actions.filter(x => x.actor).map(x => x.actor).concat([c.target]))]; const pts = []; for (const id of ids) { const st = states.get(id); const r2 = this.actors.get(id); if (!st || st.op < 0.3 || !r2 || r2.g.userData.big || r2.g.userData.flat) continue; pts.push(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])); } if (pts.length > 1) { groupC = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length); for (const p of pts) groupR = Math.max(groupR, p.distanceTo(groupC)); if (groupR > 14) { groupC = null; groupR = 0; } } }
    const dirAt = (deg, d, h) => new THREE.Vector3(Math.sin(deg * Math.PI / 180) * d, h, Math.cos(deg * Math.PI / 180) * d);
    if (c.mode === 'fixed' && c.pos) { pos = new THREE.Vector3(...c.pos); look = Array.isArray(c.lookAt) ? new THREE.Vector3(...c.lookAt) : (typeof c.lookAt === 'string' && states.get(c.lookAt) ? new THREE.Vector3(...states.get(c.lookAt).pos).add(new THREE.Vector3(0, 1, 0)) : eye); }
    else if (c.mode === 'pov') { pos = T.clone().add(new THREE.Vector3(0, Math.max(0.5, hgt * 0.88), 0)); look = pos.clone().add(dirAt(tg.yaw, 10, -0.5)); }
    else if (c.mode === 'orbit') { const ang = c.angle + local * 18; const dist = groupC ? Math.min(30, Math.max(c.distance, groupR * 1.8 + 3)) : c.distance; const ctr = groupC ? T.clone().lerp(groupC, 0.6) : T; pos = ctr.clone().add(dirAt(ang, dist, c.height + (dist - c.distance) * 0.2)); look = groupC ? new THREE.Vector3(ctr.x, eye.y, ctr.z) : eye; }
    else if (c.mode === 'wide') { pos = T.clone().add(dirAt(c.angle, Math.max(c.distance, 24), Math.max(c.height, 8) + local * 0.2)); look = eye; }
    else { const sm = this.smoothYaw === undefined ? tg.yaw : this.smoothYaw; const d = ((tg.yaw - sm + 540) % 360) - 180; this.smoothYaw = snap ? tg.yaw : sm + d * Math.min(1, dt * 1.5); const dist = groupC ? Math.min(30, Math.max(c.distance, groupR * 1.6 + 3)) : c.distance; pos = T.clone().add(dirAt(this.smoothYaw + c.angle, dist, c.height + local * 0.05 + (dist - c.distance) * 0.25)); look = groupC ? new THREE.Vector3(lerp(T.x, groupC.x, 0.5), eye.y, lerp(T.z, groupC.z, 0.5)) : eye; }
    // keep camera above ground and out of the target
    const minY = Math.min(0.4, T.y + 0.5); if (pos.y < minY) pos.y = minY;
    if (c.mode !== 'pov') pos = this.unblock(look, pos, rec ? rec.g : null);
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
  isOwn(o, self) { let p = o; while (p) { if (p === self) return true; p = p.parent; } return false; },
  clearDist(look, dir, len, self) {
    this._ray = this._ray || new THREE.Raycaster(); const r = this._ray; r.set(look, dir); r.near = 0.3; r.far = len; const hits = r.intersectObjects(this.solidsNow || [], false);
    for (const h of hits) { if (self && this.isOwn(h.object, self)) continue; if (h.object.userData.soft && len - h.distance > 1.2) continue; return h.distance; }
    return Infinity;
  },
  unblock(look, pos, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return pos; const off = pos.clone().sub(look); const len = off.length(); if (len < 0.5) return pos; const dir = off.clone().divideScalar(len);
    let d0 = this.clearDist(look, dir, len, self); const inside = d0 === Infinity && this.insideSolid(pos, self); if (inside) d0 = Math.max(0.8, len * 0.3); if (d0 === Infinity) return pos;
    if (d0 - 0.6 >= 1.5) return look.clone().add(dir.multiplyScalar(d0 - 0.6));
    // the blocker is almost touching the target: try the other sides, then from above, keep the best
    let best = look.clone().add(dir.clone().multiplyScalar(Math.max(0.8, d0 - 0.6))), bestD = d0;
    const flat = new THREE.Vector3(off.x, 0, off.z); const up = Math.max(off.y, 1.5);
    for (const a of [Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75]) { const c = new THREE.Vector3(flat.x * Math.cos(a) - flat.z * Math.sin(a), up, flat.x * Math.sin(a) + flat.z * Math.cos(a)); const cl = c.length(); if (cl < 0.5) continue; const cd = c.clone().divideScalar(cl); const d = this.clearDist(look, cd, cl, self); const cand = look.clone().add(c); if (d === Infinity && !this.insideSolid(cand, self)) return cand; if (d > bestD) { bestD = d; best = look.clone().add(cd.multiplyScalar(Math.max(0.8, d - 0.6))); } }
    const th = clamp(len * 0.7, 3, 7); const top = new THREE.Vector3(off.x * 0.25, th, off.z * 0.25); const tl = top.length(); const td = this.clearDist(look, top.clone().divideScalar(tl), tl, self); const tc = look.clone().add(top); if (td === Infinity && !this.insideSolid(tc, self)) return tc;
    return best;
  },
  occluded(from, to, self) {
    if (!this.solids || !this.solids.length) return false; this._ray2 = this._ray2 || new THREE.Raycaster(); const r = this._ray2; const dir = to.clone().sub(from); const len = dir.length(); if (len < 0.5) return false; dir.divideScalar(len); r.set(from, dir); r.near = 0.2; r.far = len - 0.3; const hits = r.intersectObjects(this.solidsNow || this.solids, false); for (const h of hits) { let o = h.object, own = false; while (o) { if (o === self) { own = true; break; } o = o.parent; } if (!own) return true; } return false;
  },
  triggerEffect(k) { if (k === 'flash') this.fx.push({ k, t: 0.7 }); else if (k === 'blackout') { this.fx.push({ k, t: 1.4 }); this.cam.snap = true; } else if (k === 'quake') this.quake = 1.0; else if (k === 'blur') this.fx.push({ k, t: 1.6 }); else if (k === 'pulse') this.fx.push({ k, t: 2.4 }); },
  updateEffects(dt) {
    let white = 0, black = 0, blur = 0, pulse = 0; this.fx = this.fx.filter(f => (f.t -= dt) > 0); for (const f of this.fx) { if (f.k === 'flash') white = Math.max(white, f.t / 0.7); if (f.k === 'blackout') black = Math.max(black, Math.min(1, f.t / 1.0)); if (f.k === 'blur') blur = Math.max(blur, f.t / 1.6); if (f.k === 'pulse') pulse = Math.max(pulse, Math.sin(f.t * 8) * 0.5 + 0.5); }
    this.fxEl.style.background = black > white ? '#000' : '#fff'; this.fxEl.style.opacity = Math.max(white, black).toFixed(3); this.canvas.style.filter = blur > 0.01 ? `blur(${(blur * 6).toFixed(1)}px)` : ''; if (pulse > 0) this.three.fog.density = this.worldNow.fogDensity * (1 + pulse * 2);
  },
  updateLabels(states) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; const v = new THREE.Vector3(); const camPos = this.camera.position;
    const curBeat = this.scene.beats[this.lastBeat]; const povId = curBeat && curBeat.camera.mode === 'pov' && !this.user.on ? curBeat.camera.target : null; const curTarget = curBeat ? curBeat.camera.target : null;
    const placed = [];
    for (const [id, rec] of this.actors) { const st = states.get(id); const lbl = rec.lbl; const text = st.say ? `${rec.a.label || rec.a.kind}: “${st.say}”` : rec.a.label; if (!this.labelsOn || !text || st.op < 0.05 || id === povId) { lbl.hidden = true; continue; } const top = rec.g.userData.centered ? rec.g.userData.baseHeight * (st.size / rec.a.size) + 1 : rec.g.userData.baseHeight * (st.size / rec.a.size) + 0.25; v.set(st.pos[0], st.pos[1] + Math.min(top, 12), st.pos[2]); const dist = v.distanceTo(camPos); const isTarget = id === curTarget; if (!rec.g.userData.far && !st.say && !isTarget && dist > 38) { lbl.hidden = true; continue; } if (!rec.g.userData.far && this.occluded(camPos, v, rec.g)) { lbl.hidden = true; continue; } v.project(this.camera); if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 || (dist > 90 && !rec.g.userData.far)) { lbl.hidden = true; continue; } v.x = clamp(v.x, -0.96, 0.96); v.y = clamp(v.y, -0.62, 0.86); lbl.hidden = false; lbl.textContent = text; const lw = lbl.offsetWidth || 60; lbl.style.left = clamp((v.x + 1) / 2 * W, lw / 2 + 6, W - lw / 2 - 6).toFixed(1) + 'px'; lbl.style.top = ((1 - v.y) / 2 * H).toFixed(1) + 'px'; lbl.style.opacity = (clamp(1.3 - dist / 70, 0.25, 1) * st.op).toFixed(2); lbl.style.background = st.say ? 'rgba(179,78,44,.85)' : 'rgba(8,9,22,.55)'; placed.push({ lbl, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dist }); }
    placed.sort((a, b) => a.dist - b.dist); const rects = [];
    for (const p of placed) { const w = p.lbl.offsetWidth || 60, h = p.lbl.offsetHeight || 20; let y = p.y, tries = 0; const overlaps = yy => rects.some(r => Math.abs(r.x - p.x) < (r.w + w) / 2 + 4 && Math.abs(r.y - yy) < h + 2); while (overlaps(y) && tries++ < 6) y -= h + 3; if (y !== p.y) p.lbl.style.top = y.toFixed(1) + 'px'; rects.push({ x: p.x, y, w, h }); }
  },
  /* metrics for the harness: which actors of the current beat are on screen */
  metrics() {
    if (!this.scene) return null; const bi = this.beatAt(this.time), b = this.scene.beats[bi]; const ids = new Set(b.actions.filter(x => x.actor).map(x => x.actor)); ids.add(b.camera.target); if (b.camera.mode === 'pov') ids.delete(b.camera.target); const v = new THREE.Vector3(); const res = [];
    for (const id of ids) { const rec = this.actors.get(id), st = this.states.get(id); if (!rec || !st) continue; const top = rec.g.userData.baseHeight * (st.size / rec.a.size); v.set(st.pos[0], st.pos[1] + top / 2, st.pos[2]); const dist = v.distanceTo(this.camera.position); const occ = this.occluded(this.camera.position, v.clone(), rec.g); v.project(this.camera); res.push({ id, visible: st.op > 0.05, onScreen: st.op > 0.05 && !occ && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, occluded: occ, dist: +dist.toFixed(1), x: +v.x.toFixed(2), y: +v.y.toFixed(2) }); }
    const ft = this.frameTimes.slice(-120); const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0; return { beat: bi, time: +this.time.toFixed(2), camera: { pos: this.camera.position.toArray().map(q => +q.toFixed(1)), look: this.cam.look.toArray().map(q => +q.toFixed(1)), mode: b.camera.mode }, fog: +this.three.fog.density.toFixed(4), actors: res, frameMs: +avg.toFixed(1), tris: this.r.info.render.triangles, calls: this.r.info.render.calls };
  }
};
