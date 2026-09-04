/* =====================================================================
   The stage: renderer, world, actors, timeline evaluation, camera.
   ===================================================================== */
const Stage = {
  ready: false, scene: null, time: 0, playing: false, actors: new Map(), cam: { pos: new THREE.Vector3(0, 3, 10), look: new THREE.Vector3(0, 1, 0), snap: true }, user: { on: false, theta: 0, phi: 0.4, dist: 8 }, fx: [], lastBeat: -1, frameTimes: [], onBeat: null, onTime: null, labelsOn: true,
  init(canvas) {
    // on a machine with no GPU acceleration the multisample buffer alone costs a quarter of every
    // frame, and nothing else here is the bottleneck: ask the driver what it is before deciding
    let soft = false;
    try { const g0 = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const ext = g0 && g0.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(g0.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      soft = /swiftshader|llvmpipe|software|mesa offscreen/i.test(name); } catch (e) { }
    this.softGL = soft;
    const r = new THREE.WebGLRenderer({ canvas, antialias: !soft, powerPreference: 'high-performance' });
    r.setPixelRatio(soft ? 1 : Math.min(devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25; r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r; this.three = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 1200);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true, uniforms: { top: { value: new THREE.Color('#0b1030') }, hor: { value: new THREE.Color('#2a2f5c') }, fogRaw: { value: new THREE.Vector3(0.09, 0.11, 0.24) } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top;\nuniform vec3 hor;\nuniform vec3 fogRaw;\nvarying vec3 vP;\nvoid main(){\n float h = normalize(vP).y;\n float t = smoothstep(0.04, 0.5, h);\n gl_FragColor = vec4(mix(hor, top, t), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogRaw, 1.0 - smoothstep(0.0, 0.16, h));\n}' }));
    this.three.add(this.sky);
    const sg = new THREE.BufferGeometry(); const sp = []; const rnd = seeded(42); for (let i = 0; i < 1600; i++) { const th = rnd() * 6.283, ph = Math.acos(rnd() * 0.95); sp.push(Math.sin(ph) * Math.cos(th) * 460, Math.cos(ph) * 460, Math.sin(ph) * Math.sin(th) * 460); } sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false })); this.three.add(this.stars);
    this.ambient = new THREE.HemisphereLight('#6a6f9a', '#202030', 1.2); this.three.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#cfd6ff', 1); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024); const sc = this.sun.shadow.camera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.near = 1; sc.far = 200; this.sun.shadow.bias = -0.0015; this.three.add(this.sun); this.three.add(this.sun.target);
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
    for (const rec of this.actors.values()) { if (rec.g.userData.shadow) { const r = rec.g.userData.shadow; const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; this.root.add(blob); rec.blob = blob; } const mats = []; const seen = new Map(); rec.g.traverse(o => { if (o.isMesh && !o.material.userData.water && !o.material.isShaderMaterial) { let m = seen.get(o.material); if (!m) { m = o.material.clone(); m.userData = { ...o.material.userData, baseOpacity: o.material.opacity, baseColor: o.material.color.clone(), baseEmissive: o.material.emissive ? o.material.emissive.clone() : null }; seen.set(o.material, m); mats.push(m); } o.material = m; } }); rec.mats = mats; }
    this.solids = []; this.waterMats = [this.waterGround.material]; this.root.traverse(o => { if (o.userData.solid) this.solids.push(o); if (o.isMesh && o.material && o.material.userData.water) this.waterMats.push(o.material); }); this.boxTick = 0; this._rooms = null;
    this.pits = []; for (const r of this.actors.values()) { if (r.a.kind !== 'pit') continue; this.pits.push({ x: r.a.pos[0], z: r.a.pos[2], r: (r.a.detail.radius || 1.5) * r.a.size + 0.2 }); }
    this.root.updateMatrixWorld(true);
    { const boxes = []; const FURNITURE = new Set(['table', 'bed', 'sofa', 'desk', 'grave', 'car', 'boat', 'fire', 'pit', 'water']);
      for (const rec of this.actors.values()) { if (!FURNITURE.has(rec.a.kind)) continue; const bx = new THREE.Box3().setFromObject(rec.g); if (bx.max.x - bx.min.x > 0.5 && bx.max.z - bx.min.z > 0.5) boxes.push(bx); }
      for (const o of this.solids) { if (o.material && o.material.side === THREE.BackSide) continue; if (o.userData.soft) continue; const bx = new THREE.Box3().setFromObject(o); if (bx.max.x - bx.min.x > 0.8 && bx.max.z - bx.min.z > 0.8) boxes.push(bx); }
      for (const rec of this.actors.values()) { if (!rec.g.userData.members) continue; const base = new THREE.Vector3();
        for (const m of rec.g.userData.members) { m.getWorldPosition(base); const wx = base.x, wz = base.z;
          for (const bx of boxes) { if (wx < bx.min.x - 0.3 || wx > bx.max.x + 0.3 || wz < bx.min.z - 0.3 || wz > bx.max.z + 0.3) continue;
            const cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2; const dx = wx - cx, dz = wz - cz;
            const outX = (bx.max.x - bx.min.x) / 2 + 0.55, outZ = (bx.max.z - bx.min.z) / 2 + 0.55;
            const needX = Math.sign(dx || 1) * outX - dx, needZ = Math.sign(dz || 1) * outZ - dz;
            const wantW = new THREE.Vector3(base.x + (Math.abs(needX) <= Math.abs(needZ) ? needX : 0), base.y, base.z + (Math.abs(needX) <= Math.abs(needZ) ? 0 : needZ));
            if (Math.min(Math.abs(needX), Math.abs(needZ)) < 6) { rec.g.worldToLocal(wantW); m.position.x = wantW.x; m.position.z = wantW.z; }
            break; } }
        // every member pushed off the same box lands on one line: spread them along it again
        const ms = rec.g.userData.members, MIN = 1.05;
        for (let pass = 0; pass < 6; pass++) { let moved = false;
          for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
            const a1 = ms[i].position, b1 = ms[j].position;
            let dx = b1.x - a1.x, dz = b1.z - a1.z; let d = Math.hypot(dx, dz);
            if (d >= MIN) continue;
            if (d < 1e-3) { const ang = (i * 2.399 + j); dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
            const push = (MIN - d) / 2 / d;
            a1.x -= dx * push; a1.z -= dz * push; b1.x += dx * push; b1.z += dz * push; moved = true; }
          if (!moved) break; } }
      // standalone figures need the same room from each other and from the furniture
      { const solo = [];
        for (const [id, r2] of this.actors) { if (r2.g.userData.members || !['person', 'monster', 'skeleton', 'ghost'].includes(r2.a.kind)) continue; solo.push(r2); }
        // a named figure standing inside a member of a crowd is drawn through them and hidden by
        // them: crowds were separated from crowds and soloists from soloists, never one from the other
        const members = []; { const wp = new THREE.Vector3();
          for (const [, r3] of this.actors) { const mem = r3.g.userData.members; if (!mem) continue;
            for (const m of mem) { r3.g.updateMatrixWorld(true); m.getWorldPosition(wp); members.push({ rec: r3, m, x: wp.x, z: wp.z }); } } }
        for (let pass = 0; pass < 5; pass++) { let moved = false;
          for (const A of solo) { if (A.a.pos[1] < -0.5) continue;
            for (const q of members) { let dx = A.a.pos[0] - q.x, dz = A.a.pos[2] - q.z; let d = Math.hypot(dx, dz);
              const MIN2 = 0.95 * A.a.size; if (d >= MIN2) continue;
              if (d < 1e-3) { dx = 1; dz = 0; d = 1; }
              const k2 = (MIN2 - d) / d; A.a.pos[0] += dx * k2; A.a.pos[2] += dz * k2; moved = true; } }
          for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) {
            const A = solo[i], B = solo[j]; if (Math.abs(A.a.pos[1] - B.a.pos[1]) > 1.2) continue;
            let dx = B.a.pos[0] - A.a.pos[0], dz = B.a.pos[2] - A.a.pos[2]; let d = Math.hypot(dx, dz);
            const MIN = 0.95 * Math.max(A.a.size, B.a.size); if (d >= MIN) continue;
            if (d < 1e-3) { const ang = i * 2.399 + j; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
            const push = (MIN - d) / 2 / d;
            A.a.pos[0] -= dx * push; A.a.pos[2] -= dz * push; B.a.pos[0] += dx * push; B.a.pos[2] += dz * push; moved = true; }
          for (const A of solo) { if (A.a.pos[1] < -0.5) continue;
            for (const bx of boxes) { if (bx.max.y < 0.25) continue;
              // somebody lying on a bed is not standing inside the scenery. This pass was shoving
              // every hospital patient off their own mattress and several metres across the ward,
              // which is where "the woman is nowhere near her bed" came from.
              if (A.a.pos[1] > 0.35 || A.a.pos[1] >= bx.max.y - 0.25) continue;
              const wx = A.a.pos[0], wz = A.a.pos[2];
              if (wx < bx.min.x - 0.25 || wx > bx.max.x + 0.25 || wz < bx.min.z - 0.25 || wz > bx.max.z + 0.25) continue;
              const cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
              const dx2 = wx - cx, dz2 = wz - cz;
              const nx = Math.sign(dx2 || 1) * ((bx.max.x - bx.min.x) / 2 + 0.5) - dx2;
              const nz = Math.sign(dz2 || 1) * ((bx.max.z - bx.min.z) / 2 + 0.5) - dz2;
              if (Math.min(Math.abs(nx), Math.abs(nz)) > 5) break;
              if (Math.abs(nx) <= Math.abs(nz)) A.a.pos[0] += nx; else A.a.pos[2] += nz;
              moved = true; break; } }
          if (!moved) break; }
        for (const r2 of solo) r2.g.position.set(r2.a.pos[0], r2.a.pos[1], r2.a.pos[2]); }
      } this.applyWorld(scene.world); const mid0 = scene.beats[0] ? scene.beats[0].dur * 0.5 : 0; this.setTime(mid0); this.aimSkyLive(); this.setTime(0); this.playing = true;
  },
  setTime(t) { this.time = clamp(t, 0, this.scene ? this.scene.total : 0); this.cam.snap = true; this.framePick = null; this.fx = []; this.quake = 0; this.canvas.style.filter = ''; this.evaluate(0, true); },
  beatAt(t) { const bs = this.scene.beats; for (let i = bs.length - 1; i >= 0; i--) if (t >= bs[i].start) return i; return 0; },
  /* ---- evaluate all actor and world state at this.time ---- */
  evalActors(t) {
    const out = new Map(); const S = this.scene;
    for (const a of S.actors) out.set(a.id, { pos: a.pos.slice(), yaw: a.yaw, size: a.size, color: a.color, op: a.hidden ? 0 : 1, state: 'idle', say: null, moving: 0, window: 0, colorC: null });
    for (const b of S.beats) { if (t < b.start) break; for (const x of b.actions) { if (!x.actor) continue; const st = out.get(x.actor); if (!st) continue; const a0 = b.start + x.at * b.dur, a1 = Math.min(b.start + b.dur, a0 + x.for * b.dur); const p = a1 > a0 ? clamp((t - a0) / (a1 - a0), 0, 1) : (t >= a0 ? 1 : 0); if (t < a0) continue; const e = easeInOut(p);
        if (x.move) { const from = st.pos, to = x.move; let np = [lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e)]; const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]); if (x.path === 'arc' && (((this.actors.get(x.actor) || {}).a || {}).kind !== 'person' || AIRBORNE_STATES.has(x.state || st.state))) np[1] += Math.sin(p * Math.PI) * Math.min(dist * 0.3, 6); if (x.path === 'circle') { const cx = (from[0] + to[0]) / 2, cz = (from[2] + to[2]) / 2, r = Math.hypot(from[0] - cx, from[2] - cz), a00 = Math.atan2(from[2] - cz, from[0] - cx); np[0] = cx + Math.cos(a00 + p * Math.PI) * r; np[2] = cz + Math.sin(a00 + p * Math.PI) * r; } if (p < 1 && dist > 0.05) { st.moving = dist / Math.max(0.5, a1 - a0); if (x.yaw === undefined && dist > 0.2) { const dx = (x.path === 'circle' ? np[0] - st.lastPos?.[0] : to[0] - from[0]) || 0, dz = (x.path === 'circle' ? np[2] - st.lastPos?.[2] : to[2] - from[2]) || 0; if (Math.hypot(dx, dz) > 0.01) st.yaw = Math.atan2(dx, dz) * 180 / Math.PI; } } else st.moving = 0; st.lastPos = np; if (p >= 1) st.pos = to.slice(); else st.pos = np; }
        if (x.yaw !== undefined) { const d = ((x.yaw - st.yaw + 540) % 360) - 180; st.yaw = st.yaw + d * e; }
        if (x.size !== undefined) st.size = lerp(st.size, x.size, e);
        if (x.color) { st.colorC = [st.color, x.color, e]; if (p >= 1) st.color = x.color; }
        if (x.appear) st.op = Math.max(st.op, p >= 1 ? 1 : Math.min(1, p * 2)); if (x.vanish) st.op = p >= 1 ? 0 : Math.min(st.op, 1 - Math.min(1, p * 2));
        if (x.state === 'grow' || x.state === 'shrink') { const a0 = S.actors.find(q => q.id === x.actor) || {}; const base = a0.size || st.size; const lim = a0.kind === 'castle' ? 1.9 : 1.6; const tgt = x.state === 'grow' ? Math.min(st.size * 2.5, base * lim) : Math.max(st.size * 0.35, base * 0.5); st.size = lerp(st.size, tgt, e); } else if (x.state) { const transient = ['walk', 'run', 'limp', 'push', 'shake', 'spin', 'collapse', 'wave', 'dance', 'fall', 'open', 'grow', 'shrink'].includes(x.state); if (!transient || p < 1) { st.state = x.state; st.window = p; } else if (x.state === 'collapse') st.state = 'lie'; else if (x.state === 'fall') st.state = 'lie'; else if (x.state === 'open') st.state = 'open'; else if (x.state === 'grow' || x.state === 'shrink') st.state = 'idle'; }
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
    { const held = new Map(); for (const a of S.actors) if (a.carriedBy) { const l = held.get(a.carriedBy) || []; l.push(a.id); held.set(a.carriedBy, l); }
    for (const [id, rec] of this.actors) { const ai = rec.g.userData.aimed; if (!ai) continue; const st0 = out.get(id); if (st0) st0.pos = ai.slice(); }
    for (const a of S.actors) { if (!a.carriedBy) continue; const it = out.get(a.id), by = out.get(a.carriedBy); if (!it || !by) continue;
      const slot = (held.get(a.carriedBy) || []).indexOf(a.id);
      const POSE_DROP = { kneel: 0.35, sit: 0.44, lie: 0.62, crawl: 0.55, throw: 0.05 };
      const drop = POSE_DROP[by.state] || 0;
      const r = by.yaw * Math.PI / 180, side = [0.36, -0.36, 0.14, -0.14][slot % 4], fwd = [0.22, 0.22, 0.42, 0.42][slot % 4];
      it.pos = [by.pos[0] + Math.cos(r) * side + Math.sin(r) * fwd, by.pos[1] + (0.92 - drop + (slot > 1 ? 0.22 : 0)) * (by.size || 1), by.pos[2] - Math.sin(r) * side + Math.cos(r) * fwd];
      it.yaw = by.yaw; it.op = Math.min(it.op, by.op) > 0.02 ? Math.max(it.op, by.op * 0.999) : it.op; } }
    // a person lying where a bed stands lies on it, not on the floor under it
    for (const a of S.actors) { const st = out.get(a.id); if (!st || a.kind !== 'person') continue;
      // only someone already on the mattress stays lying: a visitor standing beside the bed is a visitor
      if (st.state !== 'lie') { for (const b3 of S.actors) { if (b3.kind !== 'bed') continue; const bs3 = out.get(b3.id); if (!bs3 || bs3.op < 0.3) continue;
        if (st.pos[1] > bs3.pos[1] + 0.4 * bs3.size && Math.abs(st.pos[0] - bs3.pos[0]) < 0.8 * bs3.size && Math.abs(st.pos[2] - bs3.pos[2]) < 1.1 * bs3.size) { st.state = 'lie'; break; } } }
      if (st.state !== 'lie') continue;
      for (const b2 of S.actors) { if (b2.kind !== 'bed') continue; const bs = out.get(b2.id); if (!bs || bs.op < 0.3) continue;
        const w = 1.7 * bs.size, d = 2.2 * bs.size;
        if (Math.abs(st.pos[0] - bs.pos[0]) < w && Math.abs(st.pos[2] - bs.pos[2]) < d && st.pos[1] < bs.pos[1] + 0.6 * bs.size) { const r2 = bs.yaw * Math.PI / 180, cs = Math.cos(r2), sn = Math.sin(r2);
          let lx = (st.pos[0] - bs.pos[0]) * cs - (st.pos[2] - bs.pos[2]) * sn;
          let lz = (st.pos[0] - bs.pos[0]) * sn + (st.pos[2] - bs.pos[2]) * cs;
          lx = clamp(lx, -0.25 * bs.size, 0.25 * bs.size); lz = clamp(lz, -0.2 * bs.size, 0.2 * bs.size);
          st.pos = [bs.pos[0] + lx * cs + lz * sn, bs.pos[1] + 0.62 * bs.size, bs.pos[2] - lx * sn + lz * cs]; st.yaw = bs.yaw; } } }
    // people riding a vehicle are inside its hull, so only their labels show: seat them so their
    // head and shoulders clear the body of it
    for (const a of S.actors) { const st = out.get(a.id); if (!st || a.kind !== 'person' || st.state !== 'sit') continue;
      for (const v of S.actors) { if (!VEHICLE.has(v.kind)) continue; const vs = out.get(v.id); if (!vs || vs.op < 0.3) continue;
        const rr = 2.4 * vs.size; if (Math.hypot(st.pos[0] - vs.pos[0], st.pos[2] - vs.pos[2]) > rr) continue;
        const top = vs.pos[1] + ((SEAT[v.kind] || 1) + (['helicopter', 'plane', 'boat', 'truck'].includes(v.kind) ? 0.55 : 0.15)) * vs.size;
        // fan riders across the cabin instead of stacking them all on one point
        const riders = S.actors.filter(q => q.kind === 'person' && (out.get(q.id) || {}).state === 'sit'
          && Math.hypot((out.get(q.id) || st).pos[0] - vs.pos[0], (out.get(q.id) || st).pos[2] - vs.pos[2]) <= rr);
        const seat = Math.max(0, riders.indexOf(a)); const rv = vs.yaw * Math.PI / 180;
        const sx = ((seat % 2) ? 0.45 : -0.45) * vs.size, sz = -Math.floor(seat / 2) * 0.7 * vs.size;
        st.pos = [vs.pos[0] + Math.cos(rv) * sx + Math.sin(rv) * sz, Math.max(st.pos[1], top), vs.pos[2] - Math.sin(rv) * sx + Math.cos(rv) * sz];
        { const ar = this.actors.get(a.id), vr = this.actors.get(v.id); if (ar && vr) ar.g.userData.ridesIn = vr.g; } } }
    // a figure in a ground state stands on what is under it, not in the air above it
    for (const a of S.actors) { const st = out.get(a.id); if (!st || a.kind !== 'person') continue;
      if (AIRBORNE_STATES.has(st.state) || st.pos[1] < -0.5 || st.pos[1] <= 0.06) continue;
      { const rr2 = this.actors.get(a.id); if (rr2 && rr2.g.userData.ridesIn) continue; }
      let floor = 0;
      for (const f of S.actors) { if (!['bed', 'sofa', 'table', 'stairs', 'bridge'].includes(f.kind)) continue;
        const fs = out.get(f.id); if (!fs || fs.op < 0.3) continue;
        if (Math.abs(st.pos[0] - fs.pos[0]) > 1.8 * fs.size || Math.abs(st.pos[2] - fs.pos[2]) > 2.2 * fs.size) continue;
        floor = Math.max(floor, fs.pos[1] + 0.62 * fs.size); }
      if (st.pos[1] > floor + 0.06) st.pos = [st.pos[0], floor, st.pos[2]]; }
    this.faceEachOther(S, out);
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
    this.ambient.color.copy(amb); this.ambient.groundColor.set(shade(w.groundColor, 0.6)); this.ambient.intensity = w.sky === 'day' ? 2.4 : (w.sky === 'void' ? 2.1 : 2.0);
    this.sun.color.set(w.sunColor); this.sun.intensity = Math.max(w.sky === 'void' ? 1.15 : 0.8, w.sunIntensity * 2.4);
    this.fill.position.copy(this.camera.position); this.fill.target.position.copy(this.cam.look); this.fill.intensity = w.sky === 'day' ? 0.4 : 0.9; const d = new THREE.Vector3(...w.sunDir).normalize().multiplyScalar(80); this.sun.position.copy(this.cam.look).add(d); this.sun.target.position.copy(this.cam.look);
    this.stars.visible = !!w.stars && w.sky !== 'day';
    const water = w.ground === 'water'; this.waterGround.visible = water; this.ground.visible = !water && w.ground !== 'none'; if (water) this.waterGround.material.color.set(w.groundColor); else { const c = new THREE.Color(w.groundColor); this.groundMat.color.copy(c); const tex = noiseTexture(w.groundColor, w.ground === 'floor' || w.ground === 'road' ? 0.05 : 0.14, w.ground === 'floor' ? 120 : 60); this.groundMat.map = tex; this.groundMat.color.set('#ffffff'); this.groundMat.roughness = w.ground === 'snow' ? 0.7 : (w.ground === 'floor' ? 0.6 : 1); this.groundMat.needsUpdate = true; }
    this.setWeather(w.weather); this.worldNow = w;
  },
  /* ---- per-frame ---- */
  frame() {
    requestAnimationFrame(() => this.frame()); const now = performance.now(); let dt = Math.min(0.1, (now - this.clock) / 1000); this.clock = now; if (!this.scene) { this.r.render(this.three, this.camera); return; }
    if (this.playing) { this.time += dt; if (this.time >= this.scene.total) { this.time = this.scene.total; this.playing = false; if (this.onTime) this.onTime(this.time, true); } }
    this.evaluate(dt, false);
    if (this.lastFrameAt !== undefined) { const gap = now - this.lastFrameAt; if (gap > 0 && gap < 2000) { this.frameTimes.push(gap); if (this.frameTimes.length > 240) this.frameTimes.shift(); } }
    this.lastFrameAt = now;
    this.submitTimes = this.submitTimes || []; this.submitTimes.push(performance.now() - now); if (this.submitTimes.length > 240) this.submitTimes.shift();
  },
  evaluate(dt, snap) {
    const t = this.time, S = this.scene, τ = t; const states = this.evalActors(t); this.states = states; const w = this.evalWorld(t); this.applyWorld(w);
    const bi = this.beatAt(t); if (bi !== this.lastBeat) { const prev = this.lastBeat; this.lastBeat = bi; if (this.onBeat) this.onBeat(bi); if (prev >= 0 && !snap) this.camBlend = 0; this.reaimSky = true; }
    if (!snap && dt > 0) { for (const x of S.beats[bi].actions) { if (!x.effect || x.effect === 'none') continue; const at = S.beats[bi].start + x.at * S.beats[bi].dur; if (t - dt < at && t >= at) this.triggerEffect(x.effect); } }
    // actors
    for (const [id, rec] of this.actors) { const st = states.get(id), g = rec.g, a = rec.a, ud = g.userData; g.visible = st.op > 0.01; g.position.set(st.pos[0], st.pos[1] - (st.pos[1] > 0.25 && ud.propBase && !a.carriedBy ? ud.propBase * (st.size / a.size) : 0), st.pos[2]);
      if (a.carriedBy) { if (ud.centerY) g.position.y -= ud.centerY * (st.size / a.size);

        { const cr0 = this.actors.get(a.carriedBy); if (cr0) { g.userData.carrier = cr0.g; g.userData.heldBy = cr0.g; } }
        const cr = this.actors.get(a.carriedBy); const sw = cr && cr.g.userData.armSwing; if (sw) { const ang = sw[a.id.length % 2 ? 1 : 0]; const r0 = st.yaw * Math.PI / 180, reach = 0.5 * (states.get(a.carriedBy) || st).size;
        g.position.x += Math.sin(r0) * -Math.sin(ang) * reach; g.position.z += Math.cos(r0) * -Math.sin(ang) * reach; g.position.y += (1 - Math.cos(ang)) * reach * 0.6; } } g.rotation.set(a.carriedBy && ud.carryTilt ? ud.carryTilt[0] : 0, g.rotation.y, a.carriedBy && ud.carryTilt ? ud.carryTilt[1] : 0);
      // the tilt has to turn the prop about the hand, not about a group origin that centerY has
      // put a metre below it, or the rifle swings out of the grip and lands on the floor
      if (a.carriedBy && ud.carryTilt && ud.centerY) { const sc0 = ud.noScale ? 1 : st.size / a.size;
        const piv = new THREE.Vector3(0, ud.centerY * sc0, 0); const moved = piv.clone().applyEuler(g.rotation);
        g.position.add(piv.sub(moved)); }
      const sc = ud.noScale ? 1 : st.size; g.scale.setScalar(sc); if (rec.blob) { rec.blob.visible = g.visible && st.pos[1] > -0.5 && st.pos[1] < 0.6 && !['fly', 'float', 'swim'].includes(st.state); rec.blob.position.set(st.pos[0], 0.055, st.pos[2]); rec.blob.scale.setScalar(sc); }
      for (const m of rec.mats) { const bo = m.userData.baseOpacity; const want = st.op * bo; if (Math.abs(m.opacity - want) > 0.001) { m.opacity = want; m.transparent = want < 0.999 || m.userData.baseOpacity < 0.999; m.needsUpdate = false; } if (st.colorC && !ud.noColor) { const bc = m.userData.baseColor; const from = new THREE.Color(st.colorC[0]), to = new THREE.Color(st.colorC[1]); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(from.clone().lerp(to, st.colorC[2]).multiply(ratio)); } else if (st.color !== a.color) { const bc = m.userData.baseColor; const from = new THREE.Color(a.color), to = new THREE.Color(st.color); const ratio = bc.clone().multiply(new THREE.Color(1 / Math.max(0.05, from.r), 1 / Math.max(0.05, from.g), 1 / Math.max(0.05, from.b))); m.color.copy(to.multiply(ratio)); } }
      this.animate(rec, st, τ, dt, snap);
    }
    // ambient animations
    for (const rec of this.actors.values()) { const ud = rec.g.userData; if (ud.flames) { ud.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(τ * 11 + i * 2) * 0.25; f.scale.x = f.scale.z = 1 + Math.sin(τ * 9 + i) * 0.15;
        // a flame leans and wanders; scaling it about its base is only breathing
        f.rotation.z = Math.sin(τ * 3.1 + i * 1.9) * 0.17 + Math.sin(τ * 7.3 + i) * 0.06;
        f.rotation.x = Math.sin(τ * 2.7 + i * 2.4) * 0.12;
        const h = f.userData.home; if (h) f.position.set(h.x + Math.sin(τ * 4.1 + i * 2.2) * 0.05, h.y + Math.sin(τ * 5.5 + i) * 0.03, h.z + Math.cos(τ * 3.7 + i * 1.4) * 0.045); });
        if (ud.light) ud.light.intensity = 30 + Math.sin(τ * 13) * 6 + Math.sin(τ * 31 + 1) * 3; }
      if (ud.hazeMats) { const dd = rec.g.position.distanceTo(this.camera.position); const k = Math.min(0.22, 1 - Math.exp(-(this.three.fog.density || 0) * dd * 0.55));
        for (const mm of ud.hazeMats) { mm.uniforms.uHaze.value.copy(this.three.fog.color); mm.uniforms.uHazeK.value = k; } } if (ud.puffs) ud.puffs.forEach((p, i) => { const t = (τ * 0.5 + i * 0.9) % 5.4; p.position.y = 0.8 + t; p.scale.setScalar(0.35 + t * 0.1); if (p.material.opacity !== undefined) p.material.opacity = Math.max(0, 0.3 * (1 - t / 5.4)); }); if (ud.rotor) ud.rotor.rotation.y = τ * 25; if (ud.spinPart) ud.spinPart.rotation.y = τ * 1.2; if (ud.drift) rec.g.position.x += Math.sin(τ * 0.05) * 0.0; if (ud.canopy) ud.canopy.forEach(c => c.rotation.z = Math.sin(τ * 0.8) * 0.02); if (ud.trees) ud.trees.forEach((tr, i) => tr.rotation.z = Math.sin(τ * 0.7 + i) * 0.02); if (ud.pulse) rec.mats.forEach(m => { if (m.emissiveIntensity) m.emissiveIntensity = 0.8 + Math.sin(τ * 3) * 0.4; }); }
    WATER_UNIFORMS.uTime.value = τ; FLAME_UNIFORMS.uTime.value = τ;
    this.solidsNow = this.solids ? this.solids.filter(o => { let p = o; while (p) { if (p.visible === false) return false; p = p.parent; } return true; }) : [];
    if ((this.boxTick = (this.boxTick || 0) + 1) % 12 === 1 || !this.solidBoxes) { this.solidBoxes = []; for (const o of this.solidsNow) { if (o.material && o.material.side === THREE.BackSide) continue; if (o.geometry.type === 'CapsuleGeometry') continue; const bx = new THREE.Box3().setFromObject(o); if (bx.max.x - bx.min.x > 1.5 && bx.max.z - bx.min.z > 1.5) { bx.expandByScalar(0.4); this.solidBoxes.push(bx); } } }
    this.updateCamera(S.beats[bi], states, dt, snap || this.cam.snap); this.cam.snap = false;
    this.updateWeather(dt, τ); this.updateEffects(dt);
    { const inside = this.roomAround(this.camera.position); for (const rec of this.actors.values()) { const cl = rec.g.userData.ceiling; if (cl) cl.visible = !!inside && inside.rec === rec; } }
    // a disc aimed once, at the middle of beat 1, is nailed to that world point and has left the
    // frame by beat 3: re-aim it at every cut, when the new beat's camera has been solved
    if (this.reaimSky) { this.reaimSky = false; this.aimSkyLive(); }
    // every point light in the scene is evaluated for every fragment of a full-screen ground and
    // sky. Five street lamps and a fire put a 400 ms floor under a beat with ten thousand
    // triangles in it; the lamps at the far end of the road contribute nothing to what is on
    // screen, so only the strongest few near the shot stay lit.
    { const ls = this._pointLights || (this._pointLights = (() => { const out = []; this.root.traverse(o => { if (o.isPointLight) out.push(o); }); return out; })());
      if (ls.length > 4) { const w0 = new THREE.Vector3(); const scored = [];
        for (const l of ls) { l.getWorldPosition(w0); scored.push({ l, k: (l.intensity || 1) / Math.max(2, w0.distanceTo(this.cam.look)) }); }
        scored.sort((a, b) => b.k - a.k);
        scored.forEach((q, i) => { const on = i < 4; if (q.l.visible !== on) q.l.visible = on; }); } }
    this.fitSky(states); this.root.traverse(o => { if (o.userData.billboard) o.quaternion.copy(this.camera.quaternion); }); this.r.render(this.three, this.camera); this.updateLabels(states);
    if (this.onTime) this.onTime(t, false);
  },
  /* ---- humanoid posing: a target pose per state, blended over time ---- */
  poseHuman(g, L, s, τ, dt, size, window, phase, moving, lookYaw, snap) {
    const P = g.userData.pose || (g.userData.pose = { legs: [0, 0], shins: [0, 0], armsX: [0, 0], armsZ: [0, 0], fore: [0, 0], headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0, hipsZ: 0, y: 0, torsoS: 1, headS: 1 });
    const T = { legs: [0, 0], shins: [0, 0], armsX: [0, 0], armsZ: [0.08, -0.08], fore: [-0.25, -0.25], headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0, hipsZ: 0, y: 0, torsoS: 1, headS: 1 };
    const t = τ + phase; const run = s === 'run' || moving > 2.5; const sp = run ? 11 : (s === 'limp' ? 5 : clamp(2.2 + moving * 3.4, 2.4, 8.5)); const φ = t * sp;
    let keepHead = true;
    if (s === 'walk' || s === 'run' || s === 'limp' || s === 'crawl') {
      const A = run ? 0.85 : 0.5; const sw = Math.sin(φ); const cs = Math.cos(φ);
      T.legs = [sw * A, -sw * A * (s === 'limp' ? 0.35 : 1)]; T.shins = [-Math.max(0, cs) * (run ? 1.2 : 0.8), -Math.max(0, -cs) * (run ? 1.2 : 0.8)];
      T.armsX = [-sw * A * 1.5, sw * A * 1.5]; T.fore = [-0.5 - Math.max(0, -sw) * 0.5, -0.5 - Math.max(0, sw) * 0.5]; T.armsZ = [0.12, -0.12];
      T.y = Math.abs(sw) * (run ? 0.06 : 0.03); T.bodyX = run ? 0.22 : 0.05; T.hipsZ = sw * 0.05;
      if (s === 'limp') { T.bodyZ = Math.sin(φ) * 0.1; T.y -= Math.max(0, sw) * 0.06; T.bodyX = 0.15; }
      if (s === 'crawl') { T.bodyX = -1.35; T.y = 0.4; T.armsX = [-1.6 + sw * 0.4, -1.6 - sw * 0.4]; T.fore = [-0.2, -0.2]; T.legs = [1.4 + sw * 0.3, 1.4 - sw * 0.3]; T.shins = [-1.4, -1.4]; }
    }
    else if (s === 'fly') { T.bodyX = 1.1; T.armsZ = [1.4, -1.4]; T.armsX = [-0.3, -0.3]; T.fore = [-0.1, -0.1]; T.legs = [0.15, 0.15]; T.headX = -0.8; T.y = Math.sin(t * 2) * 0.12; }
    else if (s === 'fall') { T.bodyX = -0.7 + Math.sin(t * 2) * 0.4; T.bodyZ = Math.sin(t * 1.5) * 0.5; T.armsX = [-2.7, -2.7]; T.armsZ = [0.6, -0.6]; T.legs = [0.6, -0.3]; T.shins = [-0.5, -0.2]; keepHead = false; }
    else if (s === 'float') { T.y = 0.4 + Math.sin(t * 1.3) * 0.25; T.armsZ = [0.7, -0.7]; T.armsX = [-0.4 + Math.sin(t) * 0.1, -0.4 - Math.sin(t) * 0.1]; T.legs = [0.15, -0.1]; T.headX = -0.2; }
    else if (s === 'swim') { T.bodyX = 1.45; T.y = 0.6; T.armsX = [-2.8 + Math.sin(t * 5) * 0.9, -2.8 - Math.sin(t * 5) * 0.9]; T.fore = [-0.3, -0.3]; T.legs = [Math.sin(t * 8) * 0.35, -Math.sin(t * 8) * 0.35]; T.headX = -1.0; }
    else if (s === 'sit') { const br = Math.sin(t * 1.1) * 0.03;
      T.legs = [-1.5, -1.42]; T.shins = [-1.45, -1.52]; T.y = -0.44; T.ground = true;
      T.armsX = [-0.62 + br, -0.5 - br]; T.armsZ = [0.18, -0.24]; T.fore = [-0.95, -0.75];
      T.headY = Math.sin(t * 0.42) * 0.2; T.torsoS = 1 + Math.sin(t * 1.5) * 0.012; T.hipsZ = br * 0.4; }
    else if (s === 'kneel') { const br = Math.sin(t * 1.2) * 0.035;
      T.legs = [-0.05, 1.5]; T.shins = [-2.5, -1.5]; T.y = -0.35; T.ground = true;
      T.armsX = [-0.78 + br, -0.55 - br * 0.6]; T.armsZ = [0.2, -0.3]; T.fore = [-0.95, -0.6];
      T.bodyX = 0.22 + br * 0.5; T.hipsZ = 0.05; T.headY = Math.sin(t * 0.5) * 0.22; T.torsoS = 1 + Math.sin(t * 1.5) * 0.014; }
    else if (s === 'lie') { const br = Math.sin(t * 0.9) * 0.03;
      T.bodyX = -1.5; T.y = 0.2 - 0.96 + 0.18; T.ground = true;
      T.legs = [0.06, -0.09]; T.shins = [0, -0.05];
      T.armsX = [-0.18 + br, -0.34 - br]; T.armsZ = [0.12, -0.1]; T.fore = [-0.12, -0.22];
      T.headX = 0.24; T.headZ = 0.12; T.torsoS = 1 + Math.sin(t * 1.2) * 0.016; keepHead = false; }
    else if (s === 'collapse') { const p = easeInOut(window); T.ground = p > 0.6; T.bodyX = -1.5 * p; T.y = (0.2 - 0.96 - 0.02) * p; T.legs = [0.5 * p, 0.2 * p]; T.shins = [-0.6 * p, -0.3 * p]; T.armsX = [-0.6 * p, -0.9 * p]; T.headX = 0.5 * p; keepHead = false; }
    else if (s === 'shake') { T.armsX = [-0.9, -0.9]; T.fore = [-1.2, -1.2]; T.armsZ = [0.3, -0.3]; T.bodyX = 0.18; T.legs = [0.12, -0.12]; T.shins = [-0.15, -0.15]; }
    else if (s === 'push') { T.armsX = [-1.5, -1.5]; T.fore = [-0.1, -0.1]; T.bodyX = 0.2 + Math.max(0, Math.sin(t * 4)) * 0.15; T.legs = [0.3, -0.3]; T.shins = [-0.2, -0.5]; }
    else if (s === 'spin') { T.armsZ = [0.9, -0.9]; T.armsX = [-0.3, -0.3]; }
    else if (s === 'dance') { const v = 0.5 + 0.5 * Math.sin(phase * 3.7); T.y = Math.abs(Math.sin(t * 6)) * 0.12; T.armsZ = [1.1 + v * 1.3 + Math.sin(t * 6) * 0.5, -(0.9 + (1 - v) * 1.5) - Math.sin(t * 6 + 1) * 0.5]; T.fore = [-0.6, -0.6]; T.legs = [Math.sin(t * 6) * 0.2, -Math.sin(t * 6) * 0.2]; T.hipsZ = Math.sin(t * 6) * 0.12; }
    else if (s === 'wave') { T.armsZ = [0.08, 2.55]; T.armsX = [0, -0.2]; T.fore = [-0.25, -0.3 + Math.sin(t * 8) * 0.5]; T.headY = 0; }
    else if (s === 'melt') { const p = window; T.ground = true; T.torsoS = Math.max(0.05, 1 - p); T.y = -0.9 * p; T.armsZ = [0.8 * p, -0.8 * p]; }
    else if (s === 'fold') { const p = window; T.headS = Math.max(0.45, 1 - p * 0.55); T.headX = p * 0.28; T.headZ = Math.sin(p * 6) * 0.3 * p; T.armsX = [-1.6 * p, -1.6 * p]; T.fore = [-0.9 * p, -0.9 * p]; T.bodyX = 0.35 * p; keepHead = false; }
    else if (s === 'throw') { // wind up, cast, then recover: the pose must not freeze once the stone is gone
      const c0 = clamp(window * 2.4, 0, 1), sw2 = c0 < 0.4 ? c0 / 0.4 : 1 - (c0 - 0.4) / 0.6;
      const rec0 = clamp((window - 0.45) / 0.35, 0, 1), k = 1 - rec0, br = Math.sin(t * 1.2) * 0.04;
      T.armsX = [(-2.5 + c0 * 3.6) * k + br, (-0.5 + sw2 * 0.5) * k - br]; T.fore = [(-0.4 - sw2 * 0.7) * k - 0.3 * rec0, -0.5 * k - 0.3 * rec0];
      T.armsZ = [0.2, -0.3]; T.bodyX = (-0.2 + c0 * 0.55) * k; T.hipsZ = (0.1 - c0 * 0.2) * k + br * 0.6;
      T.legs = [(0.35 - c0 * 0.5) * k, (-0.3 + c0 * 0.4) * k]; T.shins = [-0.2 * k, -0.25 * k];
      T.headX = -0.1 * k; T.headY = Math.sin(t * 0.5) * 0.2 * rec0; T.torsoS = 1 + Math.sin(t * 1.6) * 0.015; }
    else if (s === 'grieve') { // head down, shoulders in, a slow rock: dejection with a body to it
      const br = Math.sin(t * 0.8) * 0.05;
      T.headX = 0.55 + br; T.headZ = Math.sin(t * 0.45) * 0.08;
      T.armsX = [-0.25 + br, -0.3 - br]; T.armsZ = [0.34, -0.34]; T.fore = [-0.6, -0.55];
      T.bodyX = 0.3; T.bodyZ = Math.sin(t * 0.5) * 0.05; T.torsoS = 0.97 + Math.sin(t * 0.9) * 0.02;
      T.legs = [0.05, -0.05]; keepHead = false; }
    else if (s === 'pockets') { // hands in pockets: arms down and pinned back, weight on one hip, no swing
      T.armsX = [0.12, 0.12]; T.armsZ = [0.3, -0.3]; T.fore = [-0.95, -0.95];
      T.hipsZ = 0.05 + Math.sin(t * 0.5) * 0.02; T.bodyZ = -0.04; T.legs = [0.06, -0.06];
      T.headY = Math.sin(t * 0.4) * 0.18; T.torsoS = 1 + Math.sin(t * 1.6) * 0.012; }
    else if (s === 'yell') { // shouting: chin up, chest out, a jabbing arm on the beat of the words
      const j = Math.sin(t * 4.5);
      T.headX = -0.22 + j * 0.07; T.bodyX = -0.12; T.torsoS = 1.05 + j * 0.03;
      T.armsX = [-0.5 - Math.max(0, j) * 0.9, -0.15]; T.fore = [-1.1 + Math.max(0, j) * 0.7, -0.6];
      T.armsZ = [0.28, -0.22]; T.hipsZ = j * 0.03; T.legs = [0.14, -0.1]; }
    else { /* idle: breathe, shift weight, look around */ T.armsX = [Math.sin(t * 1.1) * 0.05, Math.sin(t * 1.3 + 1) * 0.05]; T.fore = [-0.3, -0.3]; T.hipsZ = Math.sin(t * 0.6) * 0.03; T.bodyZ = -Math.sin(t * 0.6) * 0.02; T.headY = Math.sin(t * 0.45) * 0.25; T.torsoS = 1 + Math.sin(t * 1.6) * 0.015; }
    if (keepHead && lookYaw !== null && lookYaw !== undefined) { T.headY = clamp(lookYaw, -1.1, 1.1); T.headX = 0; }
    g.userData.headYaw = P.headY;
    // blend toward the target pose
    const f = snap ? 1 : 1 - Math.exp(-dt * 12); const lp = (a, b) => a + (b - a) * f;
    for (const k of ['legs', 'shins', 'armsX', 'armsZ', 'fore']) { P[k][0] = lp(P[k][0], T[k][0]); P[k][1] = lp(P[k][1], T[k][1]); }
    for (const k of ['headX', 'headY', 'headZ', 'bodyX', 'bodyZ', 'hipsZ', 'y', 'torsoS', 'headS']) P[k] = lp(P[k], T[k]);
    // apply
    for (let i = 0; i < 2; i++) { L.legs[i].rotation.x = P.legs[i]; L.shins[i].rotation.x = P.shins[i]; L.arms[i].rotation.x = P.armsX[i]; L.arms[i].rotation.z = P.armsZ[i]; L.fore[i].rotation.x = P.fore[i]; }
    g.userData.armSwing = [P.armsX[0], P.armsX[1]];
    L.head.rotation.set(P.headX, P.headY, P.headZ); { const sq = P.headS, wx = 1 + (1 - sq) * 0.35, wz = 1 + (1 - sq) * 0.2;
      if (L.skull) { L.skull.scale.set(wx, sq, wz);
        if (L.hair) { L.hair.scale.set(wx, sq * 0.72, wz); L.hair.position.y = 0.12 + (0.175 - 0.12) * sq; }
        if (L.face) for (const f of L.face) { const b = f.userData.base || (f.userData.base = f.position.clone());
          f.position.set(b.x * wx, 0.12 + (b.y - 0.12) * sq, b.z * wz); f.scale.set(1, Math.max(0.5, sq), 1); }
        L.head.scale.set(1, 1, 1);
      } else L.head.scale.set(wx, sq, wz); }
    L.torso.scale.set(1 + (1 - P.torsoS) * 0.5, P.torsoS, 1 + (1 - P.torsoS) * 0.5); L.hips.rotation.set(P.bodyX, 0, P.bodyZ + P.hipsZ); L.hips.position.y = 0.96 + P.y;
    if (s === 'shake') { // a tremor the blend cannot swallow: arms, head and hips out of step
      const q = t * 19, jitter = Math.sin(q) * 0.42, roll = Math.sin(q * 0.62 + 1.1) * 0.1;
      L.arms[0].rotation.x += jitter; L.arms[1].rotation.x -= jitter;
      L.arms[0].rotation.z += roll; L.arms[1].rotation.z += roll;
      L.fore[0].rotation.x += jitter * 0.5; L.fore[1].rotation.x -= jitter * 0.5;
      L.head.rotation.z += Math.sin(q * 1.4) * 0.13; L.head.rotation.y += Math.sin(q * 0.9 + 2) * 0.1;
      L.hips.rotation.z += Math.sin(q * 0.5) * 0.07; L.hips.rotation.y = Math.sin(q * 0.33) * 0.06;
      g.position.y += Math.abs(Math.sin(q * 0.5)) * 0.02 * size;
    }
    // a pose that folds the limbs cannot know where they end up: measure the rig and set it on the ground
    // a forward lean about the hip swings the feet up behind: whenever the body is tipped at all,
    // put the lowest point of it back on the floor
    if (T.ground || (Math.abs(P.bodyX) > 0.04 && !['fly', 'float', 'fall', 'swim'].includes(s))) { g.updateMatrixWorld(true); const bb = this._bb || (this._bb = new THREE.Box3()); bb.setFromObject(L.hips); const foot = bb.min.y - g.position.y; if (Number.isFinite(foot)) L.hips.position.y += -foot + 0.03; }
  },
  faceYaw(id, st) {
    const rec = this.actors.get(id); if (!rec) return st.yaw;
    const hy = rec.g.userData.headYaw; return hy === undefined ? st.yaw : st.yaw + hy * 180 / Math.PI;
  },
  faceEachOther(S, out) {
    // two people in a conversation should be facing each other, not standing back to back
    const beat = this.scene.beats[this.lastBeat]; if (!beat) return;
    const said = beat.actions.filter(x => x.say && x.actor).map(x => x.actor);
    if (!said.length) return;
    const set = new Set(beat.actions.filter(x => x.actor).map(x => x.actor));
    for (const sp of said) { const a = S.actors.find(q => q.id === sp); if (!a || a.kind !== 'person') continue;
      const ss = out.get(sp); if (!ss) continue;
      let best = null, bd = 9;
      for (const b of S.actors) { if (b.id === sp || !FACED.has(b.kind)) continue; if (!set.has(b.id)) continue;
        const bs = out.get(b.id); if (!bs || bs.op < 0.3) continue;
        const d = Math.hypot(bs.pos[0] - ss.pos[0], bs.pos[2] - ss.pos[2]); if (d < bd) { bd = d; best = bs; } }
      if (!best || bd < 0.4) continue;
      const want = Math.atan2(best.pos[0] - ss.pos[0], best.pos[2] - ss.pos[2]) * 180 / Math.PI;
      const rel = ((want - ss.yaw + 540) % 360) - 180;
      if (Math.abs(rel) > 70) ss.yaw = want;
      const br = ((ss.yaw + 180 - best.yaw + 540) % 360) - 180;
      if (Math.abs(br) > 110 && !said.includes(best.id === undefined ? '' : '')) best.yaw = ss.yaw + 180; }
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
    if (L) { const look = (s === 'idle' || s === 'sit' || s === 'kneel' || s === 'shake' || s === 'push' || s === 'wave' || s === 'walk' || s === 'limp' || s === 'pockets' || s === 'yell') ? this.headTarget(rec, st) : null; this.poseHuman(g, L, s, τ, dt, st.size, st.window, g.id * 0.37, st.moving, look, snap); return; }
    if (ud.members) { const ms = (s === 'walk' || s === 'run' || s === 'limp' || s === 'crawl') ? s : (st.moving > 0.05 ? 'walk' : s); ud.members.forEach(m => { const base = m.userData.basePos || (m.userData.basePos = m.position.clone()); m.position.copy(base); m.scale.setScalar(1); if (st.moving > 0.05 || ms === 'walk' || ms === 'run') m.rotation.y = 0; else m.rotation.y = m.userData.baseYaw || 0; this.poseHuman(m, m.userData.limbs, ms, τ, dt, 1, st.window, m.userData.phase, st.moving, null, snap); }); return; }
    if (ud.legs) { const mv = st.moving > 0.05 || s === 'walk' || s === 'run'; const gsp = (st.moving > 2.5 || s === 'run') ? 12 : 7; const AP = ud.animPhase === undefined ? (ud.animPhase = 0) : ud.animPhase; ud.animPhase = mv ? AP + dt * gsp : AP; const φ = ud.animPhase;
      if (ud.shins) { // quadruped: diagonal gait with knee flex, a head bob and a tail
        const ph = [0, Math.PI, Math.PI, 0]; ud.legs.forEach((l, i) => { const want = mv ? Math.sin(φ + ph[i]) * 0.55 : 0; l.rotation.x += (want - l.rotation.x) * Math.min(1, dt * 12); const kw = mv ? -Math.max(0, Math.cos(φ + ph[i])) * 0.7 : 0; ud.shins[i].rotation.x += (kw - ud.shins[i].rotation.x) * Math.min(1, dt * 12); });
        if (ud.headG) { const bob = mv ? Math.sin(φ * 2) * 0.06 : Math.sin(τ * 0.8) * 0.05; ud.headG.rotation.x = bob; ud.headG.rotation.y = mv ? 0 : Math.sin(τ * 0.5) * 0.3; } if (ud.tailG) ud.tailG.rotation.y = Math.sin(τ * (mv ? 9 : 3)) * 0.35; g.position.y += mv ? Math.abs(Math.sin(φ)) * 0.03 * st.size : 0; }
      else ud.legs.forEach((l, i) => l.rotation.x = mv ? Math.sin(φ + (i % 2) * Math.PI) * 0.6 : (kind === 'animal' && rec.a.detail.species === 'spider' ? Math.sin(τ * 6 + i) * 0.15 : 0));
      if (ud.skirt) ud.skirt.visible = s !== 'lie';
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
    { const sm0 = this.smoothYaw === undefined ? tg.yaw : this.smoothYaw; const d0 = ((tg.yaw - sm0 + 540) % 360) - 180; this.smoothYaw = snap ? tg.yaw : sm0 + d0 * Math.min(1, dt * 1.5); }
    const yawS = this.smoothYaw;
    if (c.mode === 'fixed' && c.pos) { pos = new THREE.Vector3(...c.pos); look = Array.isArray(c.lookAt) ? new THREE.Vector3(...c.lookAt) : (typeof c.lookAt === 'string' && states.get(c.lookAt) ? new THREE.Vector3(...states.get(c.lookAt).pos).add(new THREE.Vector3(0, 1, 0)) : eye); }
    else if (c.mode === 'pov') { pos = T.clone().add(new THREE.Vector3(0, Math.max(0.5, hgt * 0.88), 0)); look = pos.clone().add(dirAt(tg.yaw, 10, -0.5)); }
    else if (c.mode === 'orbit') { const ang = c.angle + yawS + local * 18; const dist = groupC ? Math.min(c.distance * 1.45, Math.max(c.distance, groupR * 1.8 + 3)) : c.distance; const ctr = groupC ? T.clone().lerp(groupC, 0.6) : T; pos = ctr.clone().add(dirAt(ang, dist, c.height + (dist - c.distance) * 0.2)); look = groupC ? new THREE.Vector3(ctr.x, eye.y, ctr.z) : eye; }
    else if (c.mode === 'wide') { const extent = Math.max(groupR * 2, (rec ? rec.g.userData.baseHeight : 1.8) * 2); const floorD = Math.min(clamp(extent * 2.6, 10, 22), c.distance * 1.15); pos = T.clone().add(dirAt(c.angle + yawS, Math.max(c.distance, floorD), Math.max(c.height, floorD * 0.32) + local * 0.2)); look = groupC ? new THREE.Vector3(groupC.x, eye.y, groupC.z) : eye; }
    else { const dist = groupC ? Math.min(c.distance * 1.45, Math.max(c.distance, groupR * 1.6 + 3)) : c.distance; pos = T.clone().add(dirAt(yawS + c.angle, dist, c.height + local * 0.05 + (dist - c.distance) * 0.25)); look = groupC ? new THREE.Vector3(lerp(T.x, groupC.x, 0.5), eye.y, lerp(T.z, groupC.z, 0.5)) : eye; }
    const lookRec = typeof c.lookAt === 'string' ? this.actors.get(c.lookAt) : null;
    const selfs = [rec && rec.g, lookRec && lookRec.g].filter(Boolean);
    const settle = (p0, l0) => { let p = p0.clone(), look2 = l0.clone(); let steep = false;
    // the subject is inside a room: keep the camera in there with them rather than outside a shell whose front faces are culled
    { const room = this.roomAround(look2); if (room) { const b = room.box; const pad = 0.45;
        if (p.x < b.min.x + pad || p.x > b.max.x - pad || p.z < b.min.z + pad || p.z > b.max.z - pad || p.y > b.max.y - 0.3) {
          const d = p.clone().sub(look2); const dl = d.length() || 1; d.divideScalar(dl);
          const reach = dir => { let t = dl; for (const [lo, hi, o, dd] of [[b.min.x + pad, b.max.x - pad, look2.x, dir.x], [b.min.z + pad, b.max.z - pad, look2.z, dir.z], [-1e6, b.max.y - 0.3, look2.y, dir.y]]) { if (Math.abs(dd) < 1e-4) continue; const t1 = (hi - o) / dd, t2 = (lo - o) / dd; for (const tt of [t1, t2]) if (tt > 0.2 && tt < t) t = tt; } return t; };
          let t = reach(d), dBest = d;
          // a wall behind the subject used to walk the camera into their back; swing round the room instead
          const near = Math.max(1.2, (rec ? rec.g.userData.baseHeight * 1.6 : 2.9));
          if (t - 0.15 < Math.min(dl, near * 1.35)) { const flat = Math.hypot(d.x, d.z) || 1e-4;
            for (let k = 1; k <= 7; k++) { const ang = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
              const cx = Math.cos(ang), sx = Math.sin(ang);
              const nd = new THREE.Vector3(d.x * cx - d.z * sx, d.y, d.x * sx + d.z * cx);
              const nt = reach(nd); if (nt > t + 0.25) { t = nt; dBest = nd; if (t - 0.15 >= Math.min(dl, near * 1.35)) break; } } }
          p = look2.clone().add(dBest.multiplyScalar(Math.max(near, t - 0.15)));
          this.wallSqueeze = Math.max(this.wallSqueeze || 0, clamp((near - (t - 0.15)) / 4, 0, 1));
        } } }
    // part of the beat is happening below the ground: look2 down into the hole instead of across it
    { const low = [], high = []; for (const x of beat.actions) { if (!x.actor) continue; const st = states.get(x.actor); const r2 = this.actors.get(x.actor); if (!st || st.op < 0.3 || !r2 || r2.g.userData.flat || r2.g.userData.big) continue; const climbing = beat.actions.some(q => q.actor === x.actor && q.move && q.move[1] > -1); (st.pos[1] < -1 && !climbing ? low : high).push(st); }
      if (low.length && high.length) { const c0 = low.reduce((a, st) => a.add(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])), new THREE.Vector3()).divideScalar(low.length);
        // how steeply the hole has to be looked into is a fact about the hole's own axis and the
        // people standing off it; measuring it against a look point already pulled toward the rim
        // made every pit read as unlookable and threw the person at the bottom out of the shot
        let depth = 4, rad = 1.6, ax = c0.x, az2 = c0.z;
        for (const rr of this.actors.values()) { if (rr.a.kind !== 'pit') continue; const q = rr.a.pos; if (Math.hypot(q[0] - c0.x, q[2] - c0.z) > 6) continue; depth = (rr.a.detail.height || 4) * rr.a.size; rad = (rr.a.detail.radius || 1.5) * rr.a.size; ax = q[0]; az2 = q[2]; }
        let strayed = 0; for (const st of low) strayed = Math.max(strayed, Math.hypot(st.pos[0] - ax, st.pos[2] - az2));
        const clear = rad - strayed;
        // a narrow deep hole is not unlookable, it just has to be looked into from nearly overhead:
        // giving up at eighty degrees left the two men at the bottom out of every shot of the beat
        // that is about them
        const need = Math.atan2(depth, Math.max(0.22, clear));
        const rimOnly = need > Math.PI / 180 * 86;
        const h0 = high.reduce((a, st) => a.add(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])), new THREE.Vector3()).divideScalar(high.length);
        const shown = [];
        // past 80 degrees the hole cannot be looked into at all: frame the rim instead
        if (rimOnly) { const h1 = high[0]; look2 = new THREE.Vector3(h1.pos[0], h1.pos[1] + 1.1, h1.pos[2]); shown.push(new THREE.Vector3(ax, 0, az2)); for (const st of high) shown.push(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])); }
        else { look2 = new THREE.Vector3(c0.x, c0.y + 1.2, c0.z);
          const want2 = new THREE.Vector3(h0.x, h0.y + 1, h0.z); const mix = facesMatter ? 0.5 : 0.3;
          // lean toward the people at the rim, but never so far that the mouth leaves the cone
          const reach = Math.hypot(want2.x - look2.x, want2.z - look2.z) * mix, room = Math.max(0.15, clear * 0.6);
          look2.lerp(want2, reach > room ? mix * (room / reach) : mix);
          for (const st of low.concat(high)) shown.push(new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2])); }
        const off = p.clone().sub(look2); const want = Math.hypot(c.distance || 8, c.height || 3);
        let span = 0; for (const q of shown) span = Math.max(span, look2.distanceTo(q));
        const len = clamp(Math.min(off.length(), want), Math.max(3, span * (facesMatter ? 2.6 : 2.1)), Math.max(3, want * 1.5)); const flat = Math.hypot(off.x, off.z) || 0.001;
        const pitch = rimOnly ? Math.PI / 180 * 52 : clamp(need + 0.12, Math.PI / 180 * 50, Math.PI / 180 * (need <= Math.PI / 180 * 62 ? 64 : 88));
        steep = !rimOnly;
        p.set(look2.x + off.x / flat * len * Math.cos(pitch), look2.y + len * Math.sin(pitch), look2.z + off.z / flat * len * Math.cos(pitch)); } }
    // a beat flying over something must show what it flies over, not empty sky
    { if (look2.y > 12) { let ground = false;
        for (const x of beat.actions) { if (!x.actor) continue; const r3 = this.actors.get(x.actor); const s4 = states.get(x.actor);
          if (!r3 || !s4 || s4.op < 0.3) continue; if (!(r3.g.userData.flat || r3.g.userData.big) || s4.pos[1] > 6) continue;
          ground = true; break; }
        // aim a little under the aircraft and lift the lens, so what it flies over fills the lower frame
        if (ground) { const drop = Math.min(6, (look2.y - 6) * 0.3); look2.y -= drop; p.y += drop * 1.4; } } }
    // keep camera above ground and out of the target
    const minY = Math.min(0.4, T.y + 0.5); if (p.y < minY) p.y = minY;
    const look2Rec = typeof c.look2At === 'string' ? this.actors.get(c.look2At) : null;
    const selfs = [rec && rec.g, look2Rec && look2Rec.g].filter(Boolean);
    p = this.unblock(look2, p, selfs.length ? selfs : null);
      p = this.pushOffLens(p, look2, selfs);
      // and neither of those may put the lens back outside the room it was just contained in
      { const rm = this.roomAround(look2); if (rm) { const b = rm.box, pad = 0.4;
        p.x = clamp(p.x, b.min.x + pad, b.max.x - pad); p.z = clamp(p.z, b.min.z + pad, b.max.z - pad);
        if (p.y > b.max.y - 0.3) p.y = b.max.y - 0.3; } }
      return { pos: p, look: look2, steep };
    };
    // frame the actors the sentence names, not only the camera's target: try the shot, then a few wider or turned variants
    const framed = [];
    const cut = beat.actions.some(x => x.effect === 'blackout');
    for (const x of beat.actions) { if (!x.actor) continue; if (cut && !x.appear && !x.say && !x.move) continue; const st2 = states.get(x.actor), r2 = this.actors.get(x.actor); if (!st2 || st2.op < 0.3 || !r2 || r2.g.userData.flat) continue; // somebody the sentence names is in the shot whether or not the script gave them something to
      // do: standing still was costing them every guarantee, which all key on a weight of 1
      let weight = (x.say || x.move || x.appear || (x.state && x.state !== 'idle') || FACED.has(r2.a.kind) || x.actor === c.target) ? 1 : 0.35; const prev = framed.find(q => q.id === x.actor); if (prev) { prev.w = Math.max(prev.w, weight); prev.speaks = prev.speaks || !!x.say || FACE_STATE.has(x.state); continue; } const shrink = ['sit', 'lie', 'crouch', 'kneel', 'crawl'].includes(st2.state) ? 0.55 : 1; framed.push({ id: x.actor, g: r2.g, w: weight, faced: FACED.has(r2.a.kind), speaks: !!x.say || FACE_STATE.has(x.state), h: r2.g.userData.baseHeight * (st2.size / r2.a.size) * shrink, p: new THREE.Vector3(st2.pos[0], st2.pos[1] + Math.min(r2.g.userData.baseHeight * (st2.size / r2.a.size) * 0.5, 6), st2.pos[2]) }); }
    for (const a2 of this.scene.actors) { if (!a2.carriedBy) continue; if (!framed.some(q => q.id === a2.carriedBy)) continue;
      if (framed.some(q => q.id === a2.id)) continue; const r4 = this.actors.get(a2.id), s5 = states.get(a2.id);
      if (!r4 || !s5 || s5.op < 0.3) continue;
      framed.push({ id: a2.id, g: r4.g, w: 0.7, faced: false, speaks: false, h: r4.g.userData.baseHeight * (s5.size / a2.size), p: new THREE.Vector3(s5.pos[0], s5.pos[1], s5.pos[2]) }); }
    const speakerHere = beat.actions.some(x => (x.say || FACE_STATE.has(x.state)) && FACED.has(((this.actors.get(x.actor) || {}).a || {}).kind));
    // the beat is ABOUT this face when the camera's own subject speaks or wears a face state; that
    // is when the face outranks keeping a bystander in shot, which "somebody somewhere speaks" is not
    // ...and it is the face ALONE when nobody else in the beat is doing anything: two people
    // grieving is a two-shot, and turning to one of their faces loses the other
    const bowed = beat.actions.some(x => x.actor === c.target && (x.state === 'fold' || x.state === 'grieve' || x.state === 'kneel'));
    const faceIsSubject = beat.actions.some(x => x.actor === c.target && (x.say || FACE_STATE.has(x.state))) && FACED.has((rec && rec.a.kind) || '')
      && !beat.actions.some(x => x.actor && x.actor !== c.target && (x.say || x.move || x.appear || (x.state && x.state !== 'idle')));
    const facesMatter = speakerHere || (FACED.has((rec && rec.a.kind) || '') && beat.actions.some(x => x.actor === c.target && (x.say || FACE_STATE.has(x.state) || ((tg.moving || 0) < 0.3 && x.state && x.state !== 'idle' && !['walk', 'run', 'limp', 'fly', 'swim', 'crawl'].includes(x.state)))));
    // the clamps a settled shot still has to pass. They used to run only on the pose finally chosen,
    // after the search had already scored a different one, so the search kept electing shots the
    // clamps then broke; every candidate is dressed the same way now and scored as it will be seen.
    const dress = out => { let p = out.pos, l = out.look;
      if (facesMatter && c.mode !== 'pov' && !out.steep) { const len0 = p.distanceTo(l);
        // a bowed head hides its own face from any lens above it: fold and grieve want the camera
        // almost level, not the usual half-rise
        const fl = Math.hypot(p.x - l.x, p.z - l.z); const up = l.y + (bowed ? Math.max(0.1, fl * 0.1) : Math.max(0.6, fl * 0.5));
        if (p.y > up) { // lower the lens but keep the range the shot was framed at
          p.y = up; const wantFlat = Math.sqrt(Math.max(0.25, len0 * len0 - (up - l.y) * (up - l.y)));
          const nowFlat = Math.hypot(p.x - l.x, p.z - l.z) || 0.001; const k = wantFlat / nowFlat;
          p.x = l.x + (p.x - l.x) * k; p.z = l.z + (p.z - l.z) * k; } }
      if (c.mode === 'fixed' && c.pos && !out.steep) { // the author's own range is the range to hold
        const reachA = Math.hypot(c.pos[0] - l.x, c.pos[1] - l.y, c.pos[2] - l.z), got1 = p.distanceTo(l);
        if (reachA > 0.5 && got1 > reachA * 1.4) p = l.clone().lerp(p, reachA * 1.4 / got1); }
      if (c.mode !== 'pov' && !out.steep && !(c.mode === 'fixed' && c.pos)) { const reach0 = Math.hypot(c.distance || 8, c.height || 3);
        // on a wide, the distance the director asked for IS the composition: hold the shot within
        // 15 % of it, and only let the guard dolly further out when that would lose a named actor
        const got0 = p.distanceTo(l);
        if (got0 > reach0 * 1.15) {
          const holds = q => { for (const f of framed) { if (f.w < 1) continue; if (!this.inShot(q, l, f.p, f.g)) return false; } return true; };
          const tight = l.clone().lerp(p, reach0 * 1.15 / got0);
          // and when the beat simply will not fit inside the director's range, the range gives way:
          // a bedside of three at 4 m does not become two visitors cropped off the bottom edge
          if (holds(tight)) p = tight;
          else if (got0 > reach0 * 1.35) { const wide = l.clone().lerp(p, reach0 * 1.35 / got0); if (holds(wide)) p = wide; } }
        const wantH = (c.distance || 8) * 1.3, minH = (c.distance || 8) * 0.7, gotH = Math.hypot(p.x - l.x, p.z - l.z);
        if (gotH > wantH) { const k = wantH / gotH; p.x = l.x + (p.x - l.x) * k; p.z = l.z + (p.z - l.z) * k; }
        else if (gotH > 0.05 && gotH < minH) { const k = minH / gotH; p.x = l.x + (p.x - l.x) * k; p.z = l.z + (p.z - l.z) * k; } }
      { const rm = this.roomAround(l); if (rm) { const b = rm.box, pad = 0.4;
          p.x = clamp(p.x, b.min.x + pad, b.max.x - pad); p.z = clamp(p.z, b.min.z + pad, b.max.z - pad);
          if (p.y > b.max.y - 0.3) p.y = b.max.y - 0.3; } }
      return { pos: p, look: l }; };
    let authored = c.mode === 'fixed' && !!c.pos;
    if (authored && framed.length) { const out0 = dress(settle(pos, look)); let seen = 0, fails = false;
      // whoever the sentence names, not only whoever it gives something to do -- the same rule the
      // weights use, or an authored shot keeps a framing the free search would have refused
      const mustSee = new Set(framed.filter(f => f.w >= 1).map(f => f.id));
      for (const f of framed) { const ok = f.w < 1 ? this.inShot(out0.pos, out0.look, f.p, f.g) : this.seenWell(out0.pos, out0.look, f);
        if (ok) seen++;
        if (!ok && (f.id === c.target || mustSee.has(f.id))) fails = true;
        if (ok && f.faced && (f.h || 0) > 1 && (f.h / Math.max(1, f.p.distanceTo(out0.pos))) < 0.06) fails = true;
        if (ok && f.speaks && FACED.has(((this.actors.get(f.id) || {}).a || {}).kind)) {
          const sA = states.get(f.id); const fcA = dirAt(this.faceYaw(f.id, sA), 1, 0);
          const vA = out0.pos.clone().sub(new THREE.Vector3(sA.pos[0], sA.pos[1], sA.pos[2]));
          if ((vA.x * fcA.x + vA.z * fcA.z) / (Math.hypot(vA.x, vA.z) || 1) < 0.2) fails = true; } }
      if (seen === 0 || fails) { this.nearAuthored = true;
        // the author chose this framing: look for the nearest variant of it that works before
        // handing the beat to a free search
        let rescued = null;
        for (const az of [20, -20, 40, -40, 60, -60, 0]) { for (const mu of [1, 1.15, 0.85, 1.3]) {
          if (az === 0 && mu === 1) continue;
          const t0 = dress(settle(this.turnShot(pos, look, az, mu), look));
          let ok2 = true;
          for (const f of framed) { const vis = f.w < 1 ? this.inShot(t0.pos, t0.look, f.p, f.g) : this.seenWell(t0.pos, t0.look, f);
            if (!vis && (f.id === c.target || mustSee.has(f.id))) { ok2 = false; break; }
            if (vis && f.faced && (f.h || 0) > 1 && (f.h / Math.max(1, f.p.distanceTo(t0.pos))) < 0.06) { ok2 = false; break; }
            // and the face test the guard rejected on, or the rescue just re-elects the same shot
            if (vis && f.speaks && FACED.has(((this.actors.get(f.id) || {}).a || {}).kind)) {
              const sB = states.get(f.id); const fcB = dirAt(this.faceYaw(f.id, sB), 1, 0);
              const vB = t0.pos.clone().sub(new THREE.Vector3(sB.pos[0], sB.pos[1], sB.pos[2]));
              if ((vB.x * fcB.x + vB.z * fcB.z) / (Math.hypot(vB.x, vB.z) || 1) < 0.2) { ok2 = false; break; } } }
          if (ok2) { rescued = { az, mu }; break; } }
          if (rescued) break; }
        if (rescued) { pos = this.turnShot(pos, look, rescued.az, rescued.mu); this.nearAuthored = false; }
        else { authored = false; this.nearAuthored = false;
          // the author aimed at a world point eighty metres from everyone the beat is about, and no
          // turn about that point can find them: keep the angle and the range that were written,
          // and move the whole shot onto the action
          const off0 = pos.clone().sub(look);
          look = groupC ? new THREE.Vector3(groupC.x, eye.y, groupC.z) : eye.clone();
          pos = look.clone().add(off0); } } }
      else this.nearAuthored = false;
    if (facesMatter && c.mode !== 'pov' && !(c.mode === 'fixed' && c.pos)) {
      const flat0 = Math.hypot(pos.x - look.x, pos.z - look.z); const maxUp = look.y + Math.max(0.6, flat0 * 0.21);
      if (pos.y > maxUp) pos.y = maxUp;
    }
    let drifted = false;
    if (this.framePick && this.framePick.settled && this.time - (this.framePick.at || 0) > 1.2) {
      const now = dress(settle(this.turnShot(pos, look, this.framePick.az, this.framePick.mul), look));
      if (Math.abs(now.pos.distanceTo(look) - this.framePick.settled) > this.framePick.settled * 0.3) drifted = true;
      else for (const f of framed) { if (f.w < 1) continue; if (!this.seenWell(now.pos, now.look, f, false)) { drifted = true; break; } }
    }
    if (!authored && (snap || !this.framePick || this.framePick.beat !== this.lastBeat || drifted)) {
      let best = { az: 0, mul: 1, score: -1 }; if (this.debugFrames) this.frameScan = [];
      const off0 = pos.distanceTo(look);
      const underground = framed.some(f => { const st3 = states.get(f.id); return st3 && st3.pos[1] < -1; });
      const azList = this.nearAuthored ? [0, 26, -26, 55, -55] : (facesMatter ? [0, 26, -26, 55, -55, 90, -90, 140, -140, 180] : [0, 26, -26, 55, -55, 80, -80]);
      let anyOk = false;
      // any person or crowd near the action can fill the lens, whether or not the beat names them;
      // a crowd is measured by its box, since its centre can be far from its nearest member
      const towards = []; for (const x of beat.actions) { if (!x.actor || !x.move) continue;
        const d0 = new THREE.Vector3(x.move[0], 0, x.move[2]); const st0 = states.get(x.actor); if (!st0) continue;
        const dir0 = d0.clone().sub(new THREE.Vector3(st0.pos[0], 0, st0.pos[2])); if (dir0.length() < 2.5) continue;
        towards.push(dir0.normalize()); }
      const bodies = []; { const bb0 = new THREE.Box3();
        for (const [bid, br] of this.actors) { if (!FACED.has(br.a.kind)) continue; const bs = states.get(bid); if (!bs || bs.op < 0.3) continue;
          if (Math.hypot(bs.pos[0] - look.x, bs.pos[2] - look.z) > 26) continue;
          bb0.setFromObject(br.g); if (!Number.isFinite(bb0.min.y)) continue;
          const mem = br.g.userData.members;
          if (mem && mem.length) { const h1 = Math.max(0.6, bb0.max.y - bb0.min.y); const wp = new THREE.Vector3();
            for (const m of mem.slice(0, 14)) { m.getWorldPosition(wp);
              const mb = new THREE.Box3(new THREE.Vector3(wp.x - 0.3, bb0.min.y, wp.z - 0.3), new THREE.Vector3(wp.x + 0.3, bb0.min.y + h1, wp.z + 0.3));
              bodies.push({ id: bid, box: mb, h: h1, yaw: bs.yaw }); } continue; }
          bodies.push({ id: bid, box: bb0.clone(), h: Math.max(0.6, bb0.max.y - bb0.min.y), yaw: bs.yaw }); }
        for (const o of (this.solidsNow || [])) { if ((o.userData.soft && !o.userData.opaque) || this.isOwn(o, selfs)) continue;
          const bx2 = this.solidBox(o); if (bx2.distanceToPoint(look) > 22) continue;
          const h2 = bx2.max.y - bx2.min.y; if (!(h2 > 0.5)) continue;
          const w2 = Math.max(bx2.max.x - bx2.min.x, bx2.max.z - bx2.min.z);
          bodies.push({ id: '#solid', box: bx2, h: Math.min(Math.max(h2, w2), 8), yaw: 0 }); } }
      // one sweep, three verdicts: a shot that keeps both the speaker's face and the target beats
      // one that keeps only the face, which beats whatever is left
      const tiers = [{ az: 0, mul: 1, lift: 0, score: -1e9, has: false }, { az: 0, mul: 1, lift: 0, score: -1e9, has: false }, { az: 0, mul: 1, lift: 0, score: -1e9, has: false }];
      let faceOnly = null;
      {
      if (framed.length >= 1) {
        const already = clamp(Math.hypot(pos.x - look.x, pos.z - look.z) / Math.max(0.1, c.distance || 1), 1, 3); const wantsClose = c.mode !== 'wide' && (facesMatter || framed.some(f => f.speaks && (f.h || 1.8) / Math.max(1, f.p.distanceTo(pos)) < 0.15)); const crowded = framed.length >= 5;
        const mulList = underground ? [1] : [...(wantsClose ? (crowded ? [0.7] : [0.6, 0.78]) : []), 1, ...(crowded ? [] : [1.2]), 1.45, 1.85].filter(m => m * already <= 1.9);
        let sawHog = false;
        for (const lift of [0, 1.3]) { if (lift && !sawHog) break; for (const mul of (mulList.length ? mulList : [1])) for (const az of azList) {
          const cand = this.turnShot(pos, look, az, mul); if (lift) cand.y += lift; const out = dress(settle(cand, look));
          let n = 0, tgtSeen = false, tooSmall = false, small = '', tinyTalk = 0, hog = 0, tiny = 0, wallAcross = false;
          let scenery = 0;
          for (const f of framed) f.seen = f.w < 1 ? this.inShot(out.pos, out.look, f.p, f.g) : this.seenWell(out.pos, out.look, f, f.id === c.target || (facesMatter && f.faced));
          for (const f of framed) { if (!f.seen) continue; if (f.w < 1) { scenery = Math.min(1.4, scenery + f.w); } else n += f.w; if (f.id === c.target) { tgtSeen = true; n += 0.8; }

            if (f.w >= 1) { const d0 = f.p.distanceTo(out.pos); const apparent = (f.h || 1.8) / Math.max(1, d0); if (f.speaks && apparent < 0.15) tinyTalk += 0.15 - apparent; if (f.faced && (f.h || 0) > 1 && apparent < 0.06) { tiny += 0.06 - apparent; if (this.debugFrames) small = f.id + ' small ' + apparent.toFixed(3) + ' @' + d0.toFixed(1); } if (d0 < 1.9) { tooSmall = true; if (this.debugFrames) small = f.id + ' near ' + d0.toFixed(1); } } }
          const lostTarget = !tgtSeen && framed.some(f => f.id === c.target && f.w >= 1);
          let lostNamed = 0; for (const f of framed) if (f.w >= 1 && !f.seen) lostNamed++;
          // somebody the sentence names, standing at the lens and cut off by the frame edge, is a
          // head across the bottom of the shot. It is a heavy cost and not a rejection: three
          // people two metres apart at a three-metre camera cannot all be held, and refusing every
          // such shot outright sent the camera a full half-circle round to the subject's back.
          let cropAtLens = 0; for (const f of framed) { if (f.w < 1 || f.seen) continue;
            if (f.p.distanceTo(out.pos) < Math.max(3.2, out.pos.distanceTo(out.look) * 0.55)) cropAtLens += 1; }
          for (const b of bodies) {
            const bc = b.box.getCenter(this._bc2 || (this._bc2 = new THREE.Vector3()));
            const fwd0 = out.look.clone().sub(out.pos); if (bc.sub(out.pos).dot(fwd0) <= 0) continue;
            const d1 = Math.max(0.6, b.box.distanceToPoint(out.pos)); const cov = b.h / d1 / 0.933; if (cov <= (b.id === c.target ? 0.5 : 0.22)) continue;
            const sp = framed.find(q => q.id === b.id && q.speaks);
            if (sp) { const fcb = dirAt(b.yaw, 1, 0); const vb = out.pos.clone().sub(b.box.getCenter(this._bc || (this._bc = new THREE.Vector3())));
              if ((vb.x * fcb.x + vb.z * fcb.z) / (Math.hypot(vb.x, vb.z) || 1) > 0.2) continue; }
            if (b.id !== c.target && cov > 1.2) wallAcross = true;
            const over = cov - (b.id === c.target ? 0.5 : 0.22); hog += over * 1.5 + over * over * 2.2; sawHog = true; }

          let stacked = 0;
          for (let i2 = 0; i2 < framed.length; i2++) { const f1 = framed[i2]; if (f1.w < 1 || !f1.seen) continue;
            for (let j2 = i2 + 1; j2 < framed.length; j2++) { const f2 = framed[j2]; if (f2.w < 1 || !f2.seen) continue;
              const v1 = f1.p.clone().sub(out.pos), v2 = f2.p.clone().sub(out.pos);
              const l1 = v1.length(), l2 = v2.length(); if (l1 < 0.1 || l2 < 0.1) continue;
              if (Math.abs(l1 - l2) < 1.2) continue;
              const cosA = v1.dot(v2) / (l1 * l2); if (cosA < 0.9976) continue;
              stacked += 1; } }
          let against = 0; if (towards.length) { const toCam0 = out.pos.clone().sub(out.look); toCam0.y = 0; toCam0.normalize();
            for (const t0 of towards) against = Math.max(against, Math.max(0, -(t0.x * toCam0.x + t0.z * toCam0.z))); }
          let backToLens = false;
          for (const f of framed) { if (f.w < 1 || !FACED.has(((this.actors.get(f.id) || {}).a || {}).kind)) continue; const s3 = states.get(f.id); if (!f.speaks && ((s3.moving || 0) > 0.3 || (f.id === c.target && !facesMatter) || ((this.actors.get(f.id) || {}).a || {}).kind === 'crowd')) continue; if (!f.seen) continue; const fc3 = dirAt(this.faceYaw(f.id, s3), 1, 0); const v3 = out.pos.clone().sub(new THREE.Vector3(s3.pos[0], s3.pos[1], s3.pos[2])); const fr3 = (v3.x * fc3.x + v3.z * fc3.z) / (Math.hypot(v3.x, v3.z) || 1); if (fr3 < (f.speaks ? 0.2 : (f.id === c.target ? 0.15 : -0.6))) backToLens = true; }
          if (tooSmall) { if (this.debugFrames) this.frameScan.push({ az, mul, lift, rejected: small }); continue; }
          anyOk = true;
          n += scenery; if (!tgtSeen && framed.some(f => f.id === c.target)) n -= 2;
          const toCam = out.pos.clone().sub(T); const facing = dirAt(tg.yaw, 1, 0); const front = (toCam.x * facing.x + toCam.z * facing.z) / (Math.hypot(toCam.x, toCam.z) || 1);
          let faceCost = 0; if (facesMatter) { const tf = framed.find(f => f.id === c.target); if (tf && tf.seen) faceCost = (1 - front) * 0.9;
            for (const f of framed) { if (!f.speaks || f.id === c.target || !f.seen) continue; const st3 = states.get(f.id); const fc = dirAt(this.faceYaw(f.id, st3), 1, 0); const v = out.pos.clone().sub(new THREE.Vector3(st3.pos[0], st3.pos[1], st3.pos[2])); const fr = (v.x * fc.x + v.z * fc.z) / (Math.hypot(v.x, v.z) || 1); faceCost += (1 - fr) * 0.6; } }
          const crowd = this.lensCrowding(out.pos, selfs);
          const cost = Math.abs(az) / 900 + lift * 0.16 + Math.abs(mul - 1) * (mul > 1 ? 2.2 : 0.9) + crowd * 0.7 + Math.min(1.4, faceCost) + (backToLens ? 0.8 : 0) + Math.min(1.2, tinyTalk * 6) + Math.min(12, hog * 2.4) + Math.min(3.5, tiny * 26) + against * 0.8 + Math.min(1.6, stacked * 0.9) + lostNamed * 3.2;
          const score = n - cost - cropAtLens * 1.6 - (wallAcross ? 25 : 0);
          if (faceIsSubject && front > 0.35 && tgtSeen && (!faceOnly || score > faceOnly.score)) faceOnly = { az, mul, lift, score, has: true }; if (this.debugFrames) this.frameScan.push({ az, mul, lift, n: +n.toFixed(2), backToLens, lostTarget, faceCost: +faceCost.toFixed(2), crop: cropAtLens, crowd, score: +score.toFixed(2) });
          const cand2 = { az, mul, lift, score, n, has: true };
          if (!backToLens && !lostTarget && score > tiers[0].score) tiers[0] = cand2;
          if (!backToLens) { const s1 = score - (lostTarget ? 1.3 : 0); if (s1 > tiers[1].score) tiers[1] = { ...cand2, score: s1 }; }
          { const s0 = score - (backToLens ? 1.1 : 0) - (lostTarget ? 1.3 : 0); if (s0 > tiers[2].score) tiers[2] = { ...cand2, score: s0 }; }
          if (n === framed.length && az === 0 && mul === 1 && !lift && crowd === 0 && !backToLens && !lostTarget) break;
        } }
      }
      }
      best = tiers.find(t => t.has) || best;
      // and when the shot that won shows the back of the head of the person whose face the beat is
      // about, take the face and pay for the body in the way
      if (faceOnly && faceIsSubject) { const o4 = dress(settle((() => { const q = this.turnShot(pos, look, best.az, best.mul); if (best.lift) q.y += best.lift; return q; })(), look));
        const tc2 = o4.pos.clone().sub(T), fc2 = dirAt(tg.yaw, 1, 0);
        const front2 = (tc2.x * fc2.x + tc2.z * fc2.z) / (Math.hypot(tc2.x, tc2.z) || 1);
        // ...but a face is not worth a wrecked shot: take it only when it costs little
        if (front2 < -0.15 && faceOnly.score > (best.score || -1e9) - 5) best = faceOnly; }
      if (drifted && this.framePick && this.framePick.beat === this.lastBeat) {
        const keep = this.frameScanScoreOf(tiers, this.framePick);
        if (keep !== null && best.score - keep < 0.5) { best = { az: this.framePick.az, mul: this.framePick.mul, lift: this.framePick.lift, score: keep, has: true }; } }
      if (!anyOk && framed.length) { best = { az: 0, mul: 1, score: -1 }; for (const az of azList) { const cand = this.turnShot(pos, look, az, 1); const out = dress(settle(cand, look)); let n = 0; for (const f of framed) if (this.inShot(out.pos, out.look, f.p, f.g)) n += f.w; if (n > best.score) best = { az, mul: 1, lift: 0, score: n }; } }
      // an open door leaf or a wall right beside the pair hides one of them from every bearing the
      // sweep tried: before settling for that, look from behind it
      const poseOf = (az, mul, lift) => { const cand = this.turnShot(pos, look, az, mul); if (lift) cand.y += lift; return dress(settle(cand, look)); };
      { const must = framed.filter(f => f.w >= 1);
        const lost = o => { let n = 0; for (const f of must) if (!this.seenWell(o.pos, o.look, f)) n++; return n; };
        // but not at the price of the face the beat is about: a bystander recovered by swinging a
        // half-circle round to the subject's back is not worth the subject's back
        const o5 = poseOf(best.az, best.mul, best.lift);
        let showsFace = false;
        if (faceIsSubject) { const tc3 = o5.pos.clone().sub(T), fc3 = dirAt(tg.yaw, 1, 0);
          showsFace = (tc3.x * fc3.x + tc3.z * fc3.z) / (Math.hypot(tc3.x, tc3.z) || 1) > 0.35; }
        let miss = must.length && !showsFace ? lost(o5) : 0;
        if (miss) for (const az of [115, -115, 150, -150, 180]) { const n3 = lost(poseOf(az, best.mul, best.lift));
          if (n3 < miss) { miss = n3; best = { ...best, az }; if (!n3) break; } } }
      this.framePick = { beat: this.lastBeat, az: best.az, mul: best.mul, lift: best.lift || 0, at: this.time };
      { const o2 = poseOf(best.az, best.mul, best.lift); this.framePick.settled = o2.pos.distanceTo(o2.look); }
    } else if (authored) { this.framePick = { beat: this.lastBeat, az: 0, mul: 1, lift: 0 };
    }
    { const sm = this.framePick; if (sm.smAz === undefined || snap || authored) { sm.smAz = sm.az; sm.smMul = sm.mul; sm.smLift = sm.lift || 0; }
      else { const kf = 1 - Math.exp(-dt * 2.2); sm.smAz += (((sm.az - sm.smAz + 540) % 360) - 180) * kf; sm.smMul += (sm.mul - sm.smMul) * kf; sm.smLift += ((sm.lift || 0) - sm.smLift) * kf; } }
    if (this.framePick.smAz || this.framePick.smMul !== 1) pos = this.turnShot(pos, look, this.framePick.smAz, this.framePick.smMul);
    if (this.framePick.smLift) pos = pos.clone().setY(pos.y + this.framePick.smLift);
    { const out = dress(settle(pos, look)); pos = out.pos; look = out.look; }
    // The last word, and the cheapest check in the file: the report already knows whether the
    // person the sentence is about ended up on screen. Ask it here, of the pose that is about to
    // be rendered, and if the answer is no, go and find one where it is yes.
    if (!this.user.on) {
      const must = framed.filter(f => f.w >= 1);
      const lost = (p1, l1) => { let n = 0; for (const f of must) if (!this.inShot(p1, l1, f.p, f.g)) n++; return n; };
      let bad = must.length ? lost(pos, look) : 0;
      if (this.debugFrames) this.saveDbg = { bad, n: must.length, ids: must.map(f => f.id + (this.inShot(pos, look, f.p, f.g) ? '+' : '-')), saves: this.framePick.saves || 0 };
      if (bad) {
        let bq = pos, bl = look, bb = bad, bAz = null, bMul = 1, bLift = 0;
        outer2: for (const mul of [1, 1.25, 1.6]) for (const lift of [0, 1.6]) for (const az of [0, 20, -20, 40, -40, 70, -70, 110, -110, 150, -150, 180]) {
          const cand = this.turnShot(pos, look, az, mul); if (lift) cand.y += lift;
          const o6 = dress(settle(cand, look)); const n6 = lost(o6.pos, o6.look);
          if (n6 < bb) { bb = n6; bq = o6.pos; bl = o6.look; bAz = az; bMul = mul; bLift = lift; if (!n6) break outer2; } }
        if (bAz !== null) { this.framePick.saves = (this.framePick.saves || 0) + 1;
          this.framePick.az = ((this.framePick.az + bAz + 540) % 360) - 180; this.framePick.mul *= bMul; this.framePick.lift = (this.framePick.lift || 0) + bLift;
          this.framePick.smAz = this.framePick.az; this.framePick.smMul = this.framePick.mul; this.framePick.smLift = this.framePick.lift;
          // and take it now rather than easing toward it across the beat: three of these per beat
          // at most, and the alternative is the subject missing from the shot the viewer sees
          // cut to it the first time in a beat; after that ease, so a subject who keeps walking is
          // kept in frame without the camera snapping at them every few frames
          pos = bq; look = bl; if ((this.framePick.saves || 0) <= 1) this._snapNow = true; } } }
    if (this.user.on) { const u = this.user; look = look.clone(); pos = look.clone().add(new THREE.Vector3(Math.sin(u.theta) * Math.cos(u.phi) * u.dist, Math.sin(u.phi) * u.dist, Math.cos(u.theta) * Math.cos(u.phi) * u.dist)); if (pos.y < minY) pos.y = minY; }
    { const rm2 = this.roomAround(look); if (rm2 && pos.y > rm2.box.max.y - 0.3) pos.y = rm2.box.max.y - 0.3; }
    { const wantFov = 50 + (this.wallSqueeze || 0) * 22; this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); this.wallSqueeze = 0; }
    if (!snap && this._lastAim && dt > 0) { const step = pos.distanceTo(this._lastAim); const cap = (2.5 + Math.min(tg.moving || 0, 8) * 0.8) * dt;
      if (step > cap) pos = this._lastAim.clone().lerp(pos, cap / step); }
    this._lastAim = (this._lastAim || new THREE.Vector3()).copy(pos);
    if (snap || this._snapNow) { this._snapNow = false; this.cam.pos.copy(pos); this.cam.look.copy(look); this._lastCamOff = null; this._lastOff = null; this._lastAim = (this._lastAim || new THREE.Vector3()).copy(pos); } else { const k = this.user.on ? 8 : (c.mode === 'fixed' ? 2.2 : 3 + Math.min(9, (tg.moving || 0) * 0.3)); const f = 1 - Math.exp(-dt * k);
      const was = this.cam.pos.clone(); this.cam.pos.lerp(pos, f); this.cam.look.lerp(look, f);
      if (local > 1 && dt > 0 && this._lastCamOff) { const o2 = this.cam.pos.clone().sub(this.cam.look);
        const moved = o2.distanceTo(this._lastCamOff), lim = 3.2 * dt;
        if (moved > lim) { o2.copy(this._lastCamOff).lerp(o2, lim / moved); this.cam.pos.copy(this.cam.look).add(o2); } }
      this._lastCamOff = (this._lastCamOff || new THREE.Vector3()).copy(this.cam.pos).sub(this.cam.look); }
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
  isOwn(o, self) { if (!self) return false; if (Array.isArray(self)) { for (const q of self) if (q && this.isOwn(o, q)) return true; return false; }
    let p = o; while (p) { if (p === self) return true; if (p.userData && p.userData.carrier && p.userData.carrier === self) return true; p = p.parent; }
    if (self && self.userData && self.userData.carrier === o.parent) return true;
    { let q = o; while (q) { if (q.userData && q.userData.heldBy && q.userData.heldBy === self) return true; q = q.parent; } }
    return false; },
  clearDist(look, dir, len, self) {
    this._ray = this._ray || new THREE.Raycaster(); const r = this._ray; r.set(look, dir); r.near = 0.3; r.far = len; const hits = r.intersectObjects(this.solidsNow || [], false);
    for (const h of hits) { if (self && this.isOwn(h.object, self)) continue; if (h.object.userData.soft && len - h.distance > Math.max(1.2, len * 0.4)) continue; return h.distance; }
    return Infinity;
  },
  frameScanScoreOf(tiers, pick) {
    for (const t of tiers) if (t.has && t.az === pick.az && t.mul === pick.mul && (t.lift || 0) === (pick.lift || 0)) return t.score;
    return null;
  },
  anyPointSeen(from, v, rec, st, lenient) {
    // a crowd or a row of houses is not hidden because its centre point is: sample the body
    const h = rec.g.userData.baseHeight * (st.size / rec.a.size) || 1.8;
    const q = this._aps || (this._aps = new THREE.Vector3());
    // a single body is hidden when its middle is: a head showing over a door leaf is not the man,
    // and a chip drawn from it lands on the door. A crowd or a row of houses is different -- it is
    // not hidden because its centre is -- so that keeps sampling.
    if (!rec.g.userData.members) { if (!lenient) return !this.occluded(from, v.clone(), rec.g);
      const h0 = rec.g.userData.baseHeight * (st.size / rec.a.size) || 1.8; const q0 = this._aps2 || (this._aps2 = new THREE.Vector3());
      for (const k of [0, 0.3, -0.3]) { q0.copy(v); q0.y += h0 * k; if (!this.occluded(from, q0, rec.g)) return true; }
      return false; }
    for (const k of [0, -0.35, 0.3]) { q.copy(v); q.y += h * k; if (!this.occluded(from, q, rec.g)) return true; }
    { const w = new THREE.Vector3();
      for (const m of rec.g.userData.members.slice(0, 8)) { m.getWorldPosition(w); w.y += h * 0.5; if (!this.occluded(from, w, rec.g)) return true; } }
    return false;
  },
  seenWell(pos, look, f, strictLow) {
    const h = Math.max(0.6, f.h || 1.8); const q = this._sw || (this._sw = new THREE.Vector3());
    if (!this.inShot(pos, look, f.p, f.g)) return false;
    let ok = 0; for (const k of [0.35, -0.2]) { q.copy(f.p); q.y = f.p.y + h * k; if (this.inShot(pos, look, q, f.g)) ok++; }
    return strictLow ? ok === 2 : ok > 0;
  },
  lensCrowding(pos, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return 0; let n = 0; const seen = new Set();
    for (const o of sol) { if (this.isOwn(o, self)) continue; let owner = o; while (owner.parent && owner.parent !== this.root) owner = owner.parent; if (seen.has(owner)) continue;
      if (this.solidBox(o).distanceToPoint(pos) < 2.4) { seen.add(owner); n++; } }
    return n;
  },
  solidBox(o) {
    const c = this._sbC || (this._sbC = new WeakMap());
    let e = c.get(o); if (e && e.tick === this.boxTick) return e.box;
    const box = new THREE.Box3().setFromObject(o); c.set(o, { tick: this.boxTick, box }); return box;
  },
  pushOffLens(pos, look, self) {
    const sol = this.solidsNow; if (!sol || !sol.length) return pos;
    const dir = pos.clone().sub(look); const len = dir.length(); if (len < 0.6) return pos; dir.divideScalar(len);
    const w = this._v2 || (this._v2 = new THREE.Vector3()); let extra = 0;
    for (let step = 0; step < 4; step++) {
      let hit = false;
      for (const o of sol) { if (this.isOwn(o, self)) continue; if (o.userData.soft && !o.userData.opaque) continue; if (this.solidBox(o).distanceToPoint(pos) < 1.45) { hit = true; break; } }
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
    { const prev = this._unblockDir; if (prev) { const cand = look.clone().add(prev.clone().multiplyScalar(len));
        if (cand.y >= 0.35 && reach(prev, len) >= len - 0.05 && free(cand)) return cand; } }
    for (const el of [el0, el0 + 0.22, el0 + 0.45, el0 + 0.75, 1.1]) {
      const ch = Math.cos(el), cy = Math.sin(el);
      for (const az of [0, 28, -28, 56, -56, 90, -90, 124, -124, 156, -156, 180]) {
        const r = az * Math.PI / 180; const rx = hx * Math.cos(r) - hz * Math.sin(r), rz = hx * Math.sin(r) + hz * Math.cos(r);
        const d = new THREE.Vector3(rx * ch, cy, rz * ch); const cand = look.clone().add(d.clone().multiplyScalar(len));
        if (cand.y < 0.35) continue;
        const rr = reach(d, len);
        if (rr >= len - 0.05 && free(cand)) { this._unblockDir = d.clone(); return cand; }
        if (rr > bestR) { bestR = rr; best = d; }
      }
    }
    // nothing is clear at the scripted radius: come in along the roomiest line, and only as far as the geometry forces
    const dir = best || dir0; const floor = Math.min(len, Math.max(2.5, len * 0.55));
    const use = bestR >= floor ? Math.min(len, bestR) : Math.max(1.2, bestR);
    let out = look.clone().add(dir.clone().multiplyScalar(use)); if (out.y < 0.35) out.y = 0.35;
    if (!free(out)) { // never stand inside the scenery: walk the radius, then try every bearing
      let fixed = null;
      for (const t of [0.85, 0.7, 0.55, 1.15, 1.3, 0.4]) { const q = look.clone().add(dir.clone().multiplyScalar(use * t)); if (q.y < 0.35) q.y = 0.35; if (free(q)) { fixed = q; break; } }
      if (!fixed) outer: for (const el2 of [el0, el0 + 0.3, el0 + 0.6, 1.0]) { const ch2 = Math.cos(el2), cy2 = Math.sin(el2);
        for (const az2 of [0, 28, -28, 56, -56, 90, -90, 124, -124, 156, -156, 180]) {
          const r2 = az2 * Math.PI / 180; const rx2 = hx * Math.cos(r2) - hz * Math.sin(r2), rz2 = hx * Math.sin(r2) + hz * Math.cos(r2);
          const d2 = new THREE.Vector3(rx2 * ch2, cy2, rz2 * ch2);
          for (const t of [1, 0.8, 0.6, 1.25]) { const q = look.clone().add(d2.clone().multiplyScalar(len * t)); if (q.y < 0.35) continue; if (free(q)) { fixed = q; break outer; } } } }
      if (fixed) out = fixed; }
    return out;
  },

  occluded(from, to, self) {
    { const outOf = (p, r) => { const b = r.box, pad = 1.2; return p.x < b.min.x - pad || p.x > b.max.x + pad || p.z < b.min.z - pad || p.z > b.max.z + pad; };
      const rt = this.roomAround(to); if (rt && outOf(from, rt)) return true;
      const rf = this.roomAround(from); if (rf && outOf(to, rf)) return true; }
    // a figure below the ground can only be seen down a hole: if the line of sight crosses
    // ground level outside every pit mouth, the earth (which is no collider) is in the way
    if (to.y < -0.3 && from.y > 0.15 && this.pits && this.pits.length) {
      const t = (0 - from.y) / (to.y - from.y);
      if (t > 0 && t < 1) { const cx = from.x + (to.x - from.x) * t, cz = from.z + (to.z - from.z) * t;
        let through = false; for (const q of this.pits) if (Math.hypot(cx - q.x, cz - q.z) <= q.r) { through = true; break; }
        if (!through) return true; } }
    if (!this.solids || !this.solids.length) return false; this._ray2 = this._ray2 || new THREE.Raycaster(); const r = this._ray2; const dir = to.clone().sub(from); const len = dir.length(); if (len < 0.5) return false; dir.divideScalar(len); r.set(from, dir); r.near = 0.2; r.far = len - 0.3; const hits = r.intersectObjects(this.solidsNow || this.solids, false); for (const h of hits) { if (this.isOwn(h.object, self)) continue;
      if (h.object.userData.cut && this.pits && this.pits.some(q => Math.hypot(h.point.x - q.x, h.point.z - q.z) <= q.r)) continue; if (self && self.userData && self.userData.ridesIn && this.isOwn(h.object, self.userData.ridesIn)) continue; return true; } return false;
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
      const camRoom = this.roomAround(cam.position);
      if (camRoom) { const b = camRoom.box; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
        let t = 1e6; for (const [lo, hi, o, dd] of [[b.min.x, b.max.x, cam.position.x, f.x], [b.min.z, b.max.z, cam.position.z, f.z]]) { if (Math.abs(dd) < 1e-4) continue; for (const tt of [(hi - o) / dd, (lo - o) / dd]) if (tt > 0.5 && tt < t) t = tt; }
        if (t < 1e5) { const q = cam.position.clone().add(f.multiplyScalar(Math.max(1.5, t - 0.6))); q.y = b.min.y + (b.max.y - b.min.y) * 0.55;
          const aq = [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; rec.g.userData.aimed = aq; const st2 = this.states && this.states.get(a.id); if (st2) st2.pos = aq.slice(); rec.g.position.copy(q); rec.g.userData.indoor = true; }
        continue; }
      if (this.roomAround(new THREE.Vector3(a.pos[0], Math.min(a.pos[1], 2), a.pos[2]))) continue;
      const dir = fwd.clone().add(up.clone().multiplyScalar(rise)).normalize();
      const p = cam.position.clone().add(dir.multiplyScalar(D));
      if (p.y < 8) p.y = 8;
      // settle it into the upper third of the frame rather than on its edge
      const flatF = fwd.clone(); flatF.y = 0; flatF.normalize();
      const drop = Math.tan(Math.atan2(cam.position.y - this.cam.look.y, Math.max(1, Math.hypot(cam.position.x - this.cam.look.x, cam.position.z - this.cam.look.z)))) * 900;
      const far = cam.position.clone().add(flatF.multiplyScalar(900)); far.y = cam.position.y - drop;
      const hy = far.project(cam).y; const lo = Math.min(0.5, hy + 0.04), hi = Math.max(lo + 0.05, Math.min(0.58, hy + 0.26));
      for (let k = 0; k < 16; k++) { const ndc = p.clone().project(cam); if (ndc.y >= lo && ndc.y <= hi) break; p.y += (ndc.y > hi ? -1 : 1) * Math.max(1.2, Math.abs(ndc.y - (ndc.y > hi ? hi : lo)) * 26); if (p.y < 8) { p.y = 8; break; } if (p.y > 260) { p.y = 260; break; } }
      const aimed = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      rec.g.userData.aimed = aimed;
      const st = this.states && this.states.get(a.id); if (st) st.pos = aimed.slice();
      rec.g.position.set(aimed[0], aimed[1], aimed[2]);
    }
  },

  fitSky(states) {
    // a sun or a moon has no business hanging over the wall of a room you are standing in
    { const inRoom = !!this.roomAround(this.cam.look);
      for (const [id, rec] of this.actors) { if (!rec.g.userData.far || !rec.g.userData.centered) continue;
        if (rec.g.userData.indoor) continue; rec.g.visible = !inRoom; } }
    if (!this.scene) return; const cam = this.camera;
    for (const [id, rec] of this.actors) { const ud = rec.g.userData; if (!ud.far || !ud.centered) continue; const st = states.get(id); if (!st) continue;
      const p = new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]); const d = p.distanceTo(cam.position);
      const half = Math.tan(cam.fov * Math.PI / 360) * d; const want = Math.min(st.size, half * (rec.g.userData.indoor ? 0.1 : 0.17) / 5);
      const sc2 = Math.max(0.2, want); rec.g.scale.setScalar(sc2);
      // a big low moon whose centre sits at 8 m has its bottom half buried: lift it clear of the horizon
      const rad = (ud.discR || 0) * sc2; if (rad > 0 && rec.g.position.y < rad * 1.15) rec.g.position.y = rad * 1.15; }
  },
  updateLabels(states) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; const v = new THREE.Vector3(); const camPos = this.camera.position;
    const curBeat = this.scene.beats[this.lastBeat]; const povId = curBeat && curBeat.camera.mode === 'pov' && !this.user.on ? curBeat.camera.target : null; const curTarget = curBeat ? curBeat.camera.target : null;
    const acting = new Set(curBeat ? curBeat.actions.filter(x => x.actor).map(x => x.actor) : []);
    const placed = [], pts = [];
    for (const [id, rec] of this.actors) { const st = states.get(id); const lbl = rec.lbl; const text = st.say ? `${rec.a.label || rec.a.kind}: “${st.say}”` : rec.a.label; if (!this.labelsOn || !text || st.op < 0.05 || id === povId) { lbl.hidden = true; continue; } const top = rec.a.carriedBy ? 0.45 : (rec.g.userData.centered ? rec.g.userData.baseHeight * (st.size / rec.a.size) + 1 : rec.g.userData.baseHeight * (st.size / rec.a.size) + 0.25); const under = st.pos[1] < -0.5; v.set(st.pos[0], st.pos[1] + (under ? Math.min(top, 12) * 0.45 : Math.min(top, 12)), st.pos[2]); const dist = v.distanceTo(camPos); const isTarget = id === curTarget; const rank = st.say ? 0 : (isTarget ? 1 : (acting.has(id) ? 2 : 3));
      if (!rec.g.userData.far && rank > 2 && dist > 38) { lbl.hidden = true; continue; }
      const body = new THREE.Vector3(st.pos[0], st.pos[1] + (rec.a.carriedBy ? 0.35 : Math.min(rec.g.userData.baseHeight * (st.size / rec.a.size) * 0.5, 6)), st.pos[2]);
      if (!rec.g.userData.far && !this.anyPointSeen(camPos, body, rec, st, rank <= 2)) { lbl.hidden = true; continue; } v.project(this.camera); if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1 || (dist > 90 && !rec.g.userData.far)) { lbl.hidden = true; continue; } if (v.y < -0.72 || v.y > 0.9) { lbl.hidden = true; continue; } const vx0 = v.x, vy0 = v.y; v.x = clamp(v.x, -0.96, 0.96); v.y = clamp(v.y, -0.62, 0.78); if (rank > 1 && (Math.abs(v.x - vx0) > 0.07 || Math.abs(v.y - vy0) > 0.07)) { lbl.hidden = true; continue; } lbl.hidden = false; lbl.textContent = text; const capW = Math.min(340, W * 0.42); lbl.style.maxWidth = capW.toFixed(0) + 'px';
      lbl.style.whiteSpace = 'nowrap'; if (lbl.scrollWidth > capW) lbl.style.whiteSpace = 'normal'; const lw = lbl.offsetWidth || 60; lbl.style.left = clamp((v.x + 1) / 2 * W, lw / 2 + 6, W - lw / 2 - 6).toFixed(1) + 'px'; lbl.style.top = Math.max(44 + Math.max(lbl.offsetHeight, 22) / 2, (1 - v.y) / 2 * H).toFixed(1) + 'px'; lbl.style.opacity = (clamp(1.3 - dist / 70, 0.25, 1) * st.op).toFixed(2); lbl.style.background = st.say ? 'rgba(179,78,44,.85)' : 'rgba(8,9,22,.55)'; pts.push({ id, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }); placed.push({ lbl, id, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, dist, rank }); }
    // a crowded frame keeps the labels of whoever is acting; the scenery gives up its name
    placed.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
    const cap = 6; if (placed.length > cap) { let keep = cap; while (keep < placed.length && placed[keep].rank <= 2) keep++; for (const p of placed.slice(keep)) p.lbl.hidden = true; placed.length = keep; }
    // a chip must not be painted across somebody's head
    const heads = []; { const hv = new THREE.Vector3();
      for (const [id, rec] of this.actors) { if (!FACED.has(rec.a.kind)) continue; const st2 = states.get(id); if (!st2 || st2.op < 0.3) continue;
        const hh = rec.g.userData.baseHeight * (st2.size / rec.a.size);
        hv.set(st2.pos[0], st2.pos[1] + hh * 0.92, st2.pos[2]); const d2 = hv.distanceTo(camPos); hv.project(this.camera);
        if (hv.z > 1) continue; const px = (hv.x + 1) / 2 * W, py = (1 - hv.y) / 2 * H;
        const r2 = Math.max(10, (hh * 0.3) / Math.max(1, d2) * H); heads.push({ x: px, y: py, r: r2 }); } }
    const rects = [];
    for (const p of placed) { const w = p.lbl.offsetWidth || 60, h = p.lbl.offsetHeight || 20; let y = p.y; const x0 = p.x, y0 = p.y;
      const clash = (xx, yy) => rects.some(r => Math.abs(r.x - xx) < (r.w + w) / 2 + 4 && Math.abs(r.y - yy) < h + 2)
        || heads.some(q => Math.abs(q.x - xx) < w / 2 + q.r && Math.abs(q.y - yy) < h / 2 + q.r)
        || pts.some(q => q.id !== p.id && Math.abs(q.x - xx) < w / 2 + 12 && q.y > yy - h && q.y < yy + h * 1.7);
      let x = p.x, placedOk = !clash(x, y);
      for (const [dx, dy] of [[0, -1], [0, -2], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, 1], [1, -2], [-1, -2]]) {
        if (placedOk) break; const nx = p.x + dx * Math.min(w / 2 + 14, 58), ny = p.y + dy * (h + 4);
        if (nx < w / 2 + 6 || nx > W - w / 2 - 6 || ny < 44) continue;
        if (!clash(nx, ny)) { x = nx; y = ny; placedOk = true; }
      }
      // a chip that has walked far enough to sit on blank ground has stopped naming its actor;
      // only a spoken line is worth overlapping something for
      if (!placedOk) { if (p.rank === 0) { y = p.y; x = p.x; } else { p.lbl.hidden = true; continue; } }
      if (p.rank > 0 && Math.hypot(x - x0, y - y0) > 76) { p.lbl.hidden = true; continue; }
      if (x !== p.x) p.lbl.style.left = x.toFixed(1) + 'px';
      p.x = x; if (y !== p.y) p.lbl.style.top = y.toFixed(1) + 'px'; rects.push({ x: p.x, y, w, h }); }
  },
  /* metrics for the harness: which actors of the current beat are on screen */
  metrics() {
    if (!this.scene) return null; const bi = this.beatAt(this.time), b = this.scene.beats[bi]; const ids = new Set(b.actions.filter(x => x.actor).map(x => x.actor)); ids.add(b.camera.target); if (b.camera.mode === 'pov') ids.delete(b.camera.target); const v = new THREE.Vector3(); const res = [];
    for (const id of ids) { const rec = this.actors.get(id), st = this.states.get(id); if (!rec || !st) continue; const top = rec.g.userData.baseHeight * (st.size / rec.a.size); v.set(st.pos[0], st.pos[1] + top / 2, st.pos[2]); const dist = v.distanceTo(this.camera.position); const occ = rec.g.userData.members ? !this.anyPointSeen(this.camera.position, v, rec, st) : this.occluded(this.camera.position, v.clone(), rec.g); v.project(this.camera); res.push({ id, visible: st.op > 0.05, onScreen: st.op > 0.05 && !occ && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, occluded: occ, dist: +dist.toFixed(1), x: +v.x.toFixed(2), y: +v.y.toFixed(2) }); }
    const ft = this.frameTimes.slice(-120); const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 0; return { beat: bi, time: +this.time.toFixed(2), camera: { pos: this.camera.position.toArray().map(q => +q.toFixed(1)), look: this.cam.look.toArray().map(q => +q.toFixed(1)), mode: b.camera.mode }, fog: +this.three.fog.density.toFixed(4), actors: res, frameMs: +avg.toFixed(1), submitMs: +(((this.submitTimes || []).slice(-120).reduce((a, b) => a + b, 0)) / Math.max(1, (this.submitTimes || []).slice(-120).length)).toFixed(1), tris: this.r.info.render.triangles, calls: this.r.info.render.calls };
  }
};
