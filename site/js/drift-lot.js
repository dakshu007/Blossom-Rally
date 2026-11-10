/* Blossom Rally — "drift lot" browser mini-game (top-down arcade drift) */
(function () {
  const frameEl = document.getElementById("lotFrame");
  const cv = document.getElementById("lot");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const ui = { speed: $("lotSpeed"), drift: $("lotDrift"), combo: $("lotCombo"), score: $("lotScore"), best: $("lotBest"), comboBox: $("lotComboBox"), pop: $("lotPop") };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;

  let WW = 1280, WH = 720, scale = 1, DPR = 1;
  const CS = 1.45; // car draw scale
  let bg = null, skids = null, sk = null;
  let active = false, visible = false, running = false, last = 0;
  let engine = null, screech = null;

  const keys = { up: false, down: false, left: false, right: false, hand: false };
  const car = { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, steer: 0, drifting: false };
  let trees = [], cones = [], posts = [], smoke = [], petals = [];
  let score = 0, driftPts = 0, driftTime = 0, offTime = 0, combo = 1;
  let best = 0; try { best = +localStorage.getItem("br_lot_best") || 0; } catch (e) {}
  ui.best.textContent = best;

  /* ---------- layout ---------- */
  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cv.clientWidth, cssH = cv.clientHeight;
    const portrait = cssH > cssW;
    WW = portrait ? 800 : 1280;
    WH = Math.round(WW * cssH / cssW);
    scale = cssW / WW;
    cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR);
    buildWorld(portrait);
    resetCar();
  }

  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

  function buildWorld(portrait) {
    const r = rng(27);
    const m = 60;
    trees = portrait
      ? [{ x: 120, y: 160, r: 46 }, { x: 680, y: 220, r: 40 }, { x: 140, y: WH - 260, r: 40 }, { x: 660, y: WH - 300, r: 46 }]
      : [{ x: 150, y: 150, r: 52 }, { x: WW - 160, y: 140, r: 46 }, { x: 170, y: WH - 140, r: 44 }, { x: WW - 170, y: WH - 150, r: 54 }];
    posts = portrait
      ? [{ x: 400, y: 120 }, { x: 90, y: WH * 0.5 }, { x: 710, y: WH * 0.62 }]
      : [{ x: WW * 0.3, y: 70 }, { x: WW * 0.7, y: 70 }, { x: 60, y: WH * 0.5 }, { x: WW - 60, y: WH * 0.5 }];
    cones = [];
    const ring = (cx, cy, rad, n) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; cones.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, vx: 0, vy: 0, a: 0, hit: false }); } };
    if (portrait) { ring(400, WH * 0.42, 140, 8); }
    else { ring(WW * 0.27, WH * 0.55, 120, 8); ring(WW * 0.73, WH * 0.55, 120, 8); }

    // static background
    bg = document.createElement("canvas"); bg.width = WW; bg.height = WH;
    const b = bg.getContext("2d");
    b.fillStyle = "#9fcf5f"; b.fillRect(0, 0, WW, WH);
    // grass tufts
    for (let i = 0; i < 260; i++) { b.fillStyle = r() > 0.5 ? "#8bc04e" : "#b2dc74"; const x = r() * WW, y = r() * WH; b.beginPath(); b.moveTo(x, y); b.lineTo(x + 3, y - 9 - r() * 6); b.lineTo(x + 6, y); b.fill(); }
    // asphalt pad
    const pad = 34;
    b.fillStyle = "#6d6668"; roundRect(b, pad, pad, WW - pad * 2, WH - pad * 2, 46); b.fill();
    b.strokeStyle = "#fbf8f2"; b.lineWidth = 6; roundRect(b, pad + 12, pad + 12, WW - pad * 2 - 24, WH - pad * 2 - 24, 36); b.stroke();
    // kerb stripes on pad edge
    b.save(); b.setLineDash([22, 22]); b.strokeStyle = "#d42a3c"; b.lineWidth = 6; roundRect(b, pad + 12, pad + 12, WW - pad * 2 - 24, WH - pad * 2 - 24, 36); b.stroke(); b.restore();
    // asphalt grain
    for (let i = 0; i < 2600; i++) { b.fillStyle = r() > 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)"; b.fillRect(pad + r() * (WW - pad * 2), pad + r() * (WH - pad * 2), 2, 2); }
    // painted drift circles
    b.save(); b.setLineDash([16, 14]); b.strokeStyle = "rgba(251,248,242,.55)"; b.lineWidth = 4;
    if (portrait) { b.beginPath(); b.arc(400, WH * 0.42, 220, 0, TAU); b.stroke(); }
    else { [[WW * 0.27, WH * 0.55], [WW * 0.73, WH * 0.55]].forEach(([x, y]) => { b.beginPath(); b.arc(x, y, 190, 0, TAU); b.stroke(); }); }
    b.restore();
    // logo paint
    b.save(); b.globalAlpha = 0.16; b.fillStyle = "#fbf8f2"; b.font = `${portrait ? 54 : 84}px "Dela Gothic One", sans-serif`; b.textAlign = "center"; b.textBaseline = "middle";
    b.fillText("BLOSSOM RALLY", WW / 2, portrait ? WH - 90 : WH - 92); b.restore();
    // fallen petals on asphalt
    for (let i = 0; i < 140; i++) { b.save(); b.translate(r() * WW, r() * WH); b.rotate(r() * TAU); b.fillStyle = ["#f7a3bc", "#f07a9c", "#fbd0dc"][(r() * 3) | 0]; b.globalAlpha = 0.7; b.beginPath(); b.ellipse(0, 0, 4, 2.4, 0, 0, TAU); b.fill(); b.restore(); }

    skids = document.createElement("canvas"); skids.width = WW; skids.height = WH;
    sk = skids.getContext("2d"); sk.lineCap = "round";

    petals = [];
    for (let i = 0; i < 26; i++) petals.push({ x: r() * WW, y: r() * WH, z: 0.5 + r() * 0.6, s: 5 + r() * 4, rot: r() * TAU, vr: (r() - 0.5) * 0.05, flip: r() * TAU, vf: 0.03 + r() * 0.04, vx: 12 + r() * 20, vy: 18 + r() * 24, ph: r() * TAU, c: ["#f7a3bc", "#f07a9c", "#fbd0dc", "#e8577f"][(r() * 4) | 0], dx: 0, dy: 0 });
    m;
  }

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function resetCar() { Object.assign(car, { x: WW / 2, y: WH - 120, a: -Math.PI / 2, vx: 0, vy: 0, steer: 0, drifting: false }); }

  /* ---------- input ---------- */
  const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "hand" };
  window.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.code === "Escape") { deactivate(); return; }
    const k = map[e.code]; if (!k) return;
    e.preventDefault(); keys[k] = true;
  });
  window.addEventListener("keyup", (e) => { const k = map[e.code]; if (k) keys[k] = false; });
  document.getElementById("lotTouch").querySelectorAll("button").forEach((btn) => {
    const k = btn.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k === "gas" ? "up" : k === "brake" ? "down" : k] = true; btn.classList.add("is-down"); };
    const off = () => { keys[k === "gas" ? "up" : k === "brake" ? "down" : k] = false; btn.classList.remove("is-down"); };
    btn.addEventListener("pointerdown", on); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, off));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  document.getElementById("lotStart").addEventListener("click", activate);
  cv.addEventListener("pointerdown", () => { if (!active) activate(); });

  function activate() {
    if (active) return;
    active = true; frameEl.classList.add("is-live"); document.body.classList.add("is-driving");
    resetCar(); lastWheel[0] = lastWheel[1] = null; smoke = []; sk.clearRect(0, 0, WW, WH);
    score = 0; driftPts = 0; driftTime = 0; combo = 1;
    frameEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.SFX && SFX.enabled) { SFX.ensureCtx(); engine = engine || SFX.createEngine(0.2); screech = screech || SFX.createScreech(0.3); SFX.beep(440, 0.12, "square", 0.12); SFX.beep(880, 0.2, "square", 0.12, 0.14); }
    start();
  }
  function deactivate() {
    active = false; frameEl.classList.remove("is-live"); document.body.classList.remove("is-driving");
    Object.keys(keys).forEach((k) => (keys[k] = false));
    if (engine) { engine.stop(); engine = null; } if (screech) { screech.stop(); screech = null; }
    bank(false);
  }

  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (visible) start(); else if (active) deactivate();
  }), { threshold: 0.25 }).observe(frameEl);

  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(loop); }

  /* ---------- scoring ---------- */
  function popup(text, bad) {
    ui.pop.textContent = text;
    ui.pop.classList.remove("is-on", "is-bad"); void ui.pop.offsetWidth;
    ui.pop.classList.add("is-on"); if (bad) ui.pop.classList.add("is-bad");
  }
  function bank(show = true) {
    const pts = Math.round(driftPts);
    if (pts > 30) {
      score += pts;
      if (show) {
        const label = pts > 6000 ? "LEGENDARY" : pts > 2500 ? "HUGE DRIFT" : pts > 900 ? "GREAT DRIFT" : "NICE";
        popup(`${label} +${pts}`);
        if (window.SFX) { SFX.beep(660, 0.09, "triangle", 0.14); SFX.beep(990, 0.14, "triangle", 0.14, 0.09); if (pts > 2500) SFX.beep(1320, 0.2, "triangle", 0.14, 0.2); }
      }
      if (score > best) { best = score; try { localStorage.setItem("br_lot_best", best); } catch (e) {} }
    }
    driftPts = 0; driftTime = 0; combo = 1;
  }
  function crash() {
    if (driftPts > 30) popup("CRASHED · DRIFT LOST", true);
    driftPts = 0; driftTime = 0; combo = 1;
    if (window.SFX) SFX.burst(0.18, 220, 0.4);
  }

  /* ---------- physics ---------- */
  function step(dt) {
    const fx = Math.cos(car.a), fy = Math.sin(car.a);
    const rx = -fy, ry = fx;
    let vf = car.vx * fx + car.vy * fy;
    let vr = car.vx * rx + car.vy * ry;
    const speed = Math.hypot(car.vx, car.vy);

    // steering
    const steerIn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    car.steer += (steerIn - car.steer) * Math.min(1, dt * 10);
    const turnRate = (keys.hand ? 3.6 : 3.0) * Math.min(1, speed / 150) * Math.sign(vf || 1);
    car.a += car.steer * turnRate * dt;
    if (car.drifting && keys.up) car.a += car.steer * 0.6 * dt; // throttle-on oversteer

    // longitudinal
    if (keys.up) vf += (vf < 0 ? 900 : 430 * (1 - clamp(vf / 560, 0, 1) * 0.7)) * dt;
    if (keys.down) vf -= (vf > 20 ? 900 : 260) * dt;
    if (keys.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 160 * dt);
    vf -= vf * 0.45 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 22 * dt);
    vf = clamp(vf, -180, 560);

    // lateral grip
    if (!car.drifting && Math.abs(vr) > 75 && speed > 140) car.drifting = true;
    if (car.drifting && Math.abs(vr) < 32) car.drifting = false;
    const k = keys.hand ? 0.9 : car.drifting ? 2.2 : 8;
    vr *= Math.exp(-k * dt);

    // recompose with the NEW heading so slip appears when the nose rotates
    const nfx = Math.cos(car.a), nfy = Math.sin(car.a), nrx = -nfy, nry = nfx;
    // velocity keeps world direction; split it on the new axes
    car.vx = fx * vf + rx * vr; car.vy = fy * vf + ry * vr;
    const vf2 = car.vx * nfx + car.vy * nfy;
    let vr2 = car.vx * nrx + car.vy * nry;
    vr2 *= Math.exp(-(keys.hand ? 0.4 : car.drifting ? 1.2 : 6) * dt);
    car.vx = nfx * vf2 + nrx * vr2; car.vy = nfy * vf2 + nry * vr2;

    car.x += car.vx * dt; car.y += car.vy * dt;

    // walls
    const pad = 50;
    if (car.x < pad) { car.x = pad; car.vx = Math.abs(car.vx) * 0.35; crashIf(speed); }
    if (car.x > WW - pad) { car.x = WW - pad; car.vx = -Math.abs(car.vx) * 0.35; crashIf(speed); }
    if (car.y < pad) { car.y = pad; car.vy = Math.abs(car.vy) * 0.35; crashIf(speed); }
    if (car.y > WH - pad) { car.y = WH - pad; car.vy = -Math.abs(car.vy) * 0.35; crashIf(speed); }

    // trees
    for (const t of trees) {
      const dx = car.x - t.x, dy = car.y - t.y, d = Math.hypot(dx, dy), min = t.r * 0.55 + 18 * CS;
      if (d < min) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        car.x = t.x + nx * min; car.y = t.y + ny * min;
        const vn = car.vx * nx + car.vy * ny;
        if (vn < 0) { car.vx -= vn * nx * 1.4; car.vy -= vn * ny * 1.4; car.vx *= 0.5; car.vy *= 0.5; }
        crashIf(speed);
        shakeT = 0.25;
      }
    }
    // lantern posts
    for (const p of posts) {
      const dx = car.x - p.x, dy = car.y - p.y, d = Math.hypot(dx, dy), min = 26;
      if (d < min) { const nx = dx / (d || 1), ny = dy / (d || 1); car.x = p.x + nx * min; car.y = p.y + ny * min; car.vx *= -0.3; car.vy *= -0.3; crashIf(speed); }
    }
    // cones
    for (const c of cones) {
      const dx = c.x - car.x, dy = c.y - car.y, d = Math.hypot(dx, dy);
      if (d < 20 * CS) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        c.vx += nx * (speed * 0.8 + 60); c.vy += ny * (speed * 0.8 + 60); c.va = (Math.random() - 0.5) * 20;
        c.x = car.x + nx * 20 * CS; c.y = car.y + ny * 20 * CS;
        if (!c.hit && window.SFX) SFX.burst(0.06, 1400, 0.2);
        c.hit = true;
      }
      c.x += c.vx * dt; c.y += c.vy * dt; c.a += (c.va || 0) * dt;
      c.vx *= Math.exp(-3 * dt); c.vy *= Math.exp(-3 * dt); if (c.va) c.va *= Math.exp(-3 * dt);
      c.x = clamp(c.x, 20, WW - 20); c.y = clamp(c.y, 20, WH - 20);
    }

    // drift scoring
    const sp = Math.hypot(car.vx, car.vy);
    const fwd = car.vx * nfx + car.vy * nfy, lat = car.vx * nrx + car.vy * nry;
    const slipA = Math.atan2(Math.abs(lat), Math.abs(fwd) + 1);
    const isDrift = sp > 120 && slipA > 0.2 && fwd > 0;
    if (isDrift) {
      driftTime += dt; offTime = 0;
      combo = Math.min(8, 1 + Math.floor(driftTime / 1.2));
      driftPts += sp * slipA * dt * 0.9 * combo;
    } else if (driftPts > 0) {
      offTime += dt;
      if (offTime > 0.7) bank(true);
    }

    // skid marks + smoke
    const sl = clamp((slipA - 0.12) * 2.4, 0, 1) * clamp(sp / 200, 0, 1) + (keys.hand && sp > 60 ? 0.5 : 0);
    const wheels = [[-16 * CS, -12 * CS], [-16 * CS, 12 * CS]];
    if (sl > 0.12) {
      sk.strokeStyle = `rgba(30,22,24,${clamp(sl * 0.35, 0.05, 0.4)})`;
      sk.lineWidth = 7;
      wheels.forEach(([wx, wy], i) => {
        const x = car.x + nfx * wx + nrx * wy, y = car.y + nfy * wx + nry * wy;
        const lp = lastWheel[i];
        if (lp) { sk.beginPath(); sk.moveTo(lp[0], lp[1]); sk.lineTo(x, y); sk.stroke(); }
        lastWheel[i] = [x, y];
        if (Math.random() < sl * 0.7) smoke.push({ x, y, vx: (Math.random() - 0.5) * 30 - car.vx * 0.05, vy: (Math.random() - 0.5) * 30 - car.vy * 0.05, r: 6 + Math.random() * 6, life: 1 });
      });
    } else { lastWheel[0] = lastWheel[1] = null; }
    smoke.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.r += 34 * dt; s.life -= dt * 0.9; });
    smoke = smoke.filter((s) => s.life > 0).slice(-180);

    // audio
    if (engine) {
      const gearTops = [0, 110, 210, 320, 430, 560];
      let g = 1; while (g < 5 && sp > gearTops[g]) g++;
      const lo = gearTops[g - 1], hi = gearTops[g];
      const rpm = 1100 + clamp((sp - lo) / (hi - lo), 0, 1) * 6400 + (keys.up && sp < 40 ? 2200 : 0);
      engine.setRpm(car.drifting && keys.up ? rpm + 900 : rpm, keys.up ? 1 : 0.25);
    }
    if (screech) screech.set(sl);

    // ui
    ui.speed.textContent = Math.round(sp * 0.36);
    ui.drift.textContent = Math.round(driftPts);
    ui.combo.textContent = "x" + combo;
    ui.comboBox.classList.toggle("is-on", driftPts > 0);
    ui.score.textContent = score;
    ui.best.textContent = best;
  }
  const lastWheel = [null, null];
  let shakeT = 0;
  function crashIf(speed) { if (speed > 140) crash(); }

  /* ---------- render ---------- */
  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(CS, CS);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.28)"; roundRect(ctx, -22, -11, 50, 28, 8); ctx.fill();
    // wheels
    ctx.fillStyle = "#1b1416";
    [[-16, -13], [-16, 13]].forEach(([x, y]) => { roundRect(ctx, x - 6, y - 3.5, 12, 7, 2); ctx.fill(); });
    [[14, -13], [14, 13]].forEach(([x, y]) => { ctx.save(); ctx.translate(x, y); ctx.rotate(c.steer * 0.45); roundRect(ctx, -6, -3.5, 12, 7, 2); ctx.fill(); ctx.restore(); });
    // body
    ctx.fillStyle = "#fbf8f2"; ctx.strokeStyle = "#1b1416"; ctx.lineWidth = 2;
    roundRect(ctx, -24, -12, 48, 24, 7); ctx.fill(); ctx.stroke();
    // wing
    roundRect(ctx, -27, -13, 5, 26, 2); ctx.fill(); ctx.stroke();
    // stripes
    ctx.fillStyle = "#2f7f8f"; ctx.fillRect(-23, -3.2, 46, 3);
    ctx.fillStyle = "#f0892b"; ctx.fillRect(-23, -0.2, 46, 3);
    // glass
    ctx.fillStyle = "#2b2326"; roundRect(ctx, -6, -9.5, 15, 19, 3); ctx.fill();
    // number
    ctx.fillStyle = "#fbf8f2"; ctx.beginPath(); ctx.arc(-14, 0, 5.2, 0, TAU); ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#1b1416"; ctx.font = "900 6.5px Archivo, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("27", -14, 0.4);
    // lights
    ctx.fillStyle = "#fff2b8"; ctx.fillRect(21, -10, 3, 5); ctx.fillRect(21, 5, 3, 5);
    ctx.globalAlpha = 0.18; ctx.fillStyle = "#fff6c9";
    ctx.beginPath(); ctx.moveTo(24, -9); ctx.lineTo(120, -40); ctx.lineTo(120, 40); ctx.lineTo(24, 9); ctx.fill();
    ctx.restore();
  }
  function drawTree(t) {
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(t.x + 12, t.y + 14, t.r, t.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5b3a2e"; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.22, 0, TAU); ctx.fill();
    const blobs = [[0, 0, 1, "#e8577f"], [-0.4, -0.3, 0.62, "#f07a9c"], [0.42, -0.2, 0.58, "#f07a9c"], [0.1, 0.42, 0.55, "#f7a3bc"], [-0.15, -0.1, 0.45, "#fbd0dc"]];
    blobs.forEach(([ox, oy, s, col]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(t.x + ox * t.r * 0.6, t.y + oy * t.r * 0.6, t.r * s * 0.72, 0, TAU); ctx.fill(); });
  }
  function drawPost(p, t) {
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 8, 14, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#a51428"; ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    const glow = 0.5 + Math.sin(t / 400 + p.x) * 0.15;
    ctx.fillStyle = `rgba(255,120,90,${glow * 0.35})`; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = "#d42a3c"; ctx.beginPath(); ctx.ellipse(p.x, p.y, 11, 13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.stroke();
  }
  function drawCone(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.arc(3, 4, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f0892b"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fbf8f2"; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f0892b"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  let skFade = 0;
  function render(t, dt) {
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, 0, 0);
    if (shakeT > 0) { shakeT -= dt; ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6); }
    ctx.drawImage(bg, 0, 0);
    // fade skid marks slowly
    skFade += dt;
    if (skFade > 0.5) { skFade = 0; sk.globalCompositeOperation = "destination-out"; sk.fillStyle = "rgba(0,0,0,.025)"; sk.fillRect(0, 0, WW, WH); sk.globalCompositeOperation = "source-over"; }
    ctx.drawImage(skids, 0, 0);
    cones.forEach(drawCone);
    smoke.forEach((s) => { ctx.fillStyle = `rgba(245,240,238,${s.life * 0.45})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); });
    drawCar(car);
    posts.forEach((p) => drawPost(p, t));
    trees.forEach(drawTree);
    // petals drifting over
    petals.forEach((p) => {
      p.x += (p.vx + Math.sin(t / 900 + p.ph) * 10) * dt; p.y += p.vy * dt; p.rot += p.vr; p.flip += p.vf;
      if (p.y > WH + 20) { p.y = -20; p.x = Math.random() * WW; }
      if (p.x > WW + 20) p.x = -20;
      if (window.BR_drawPetal) window.BR_drawPetal(ctx, p);
    });
  }

  function loop(t) {
    if (!visible && !active) { running = false; return; }
    const dt = Math.min(0.033, (t - last) / 1000) || 0.016; last = t;
    if (active) step(dt);
    else { // idle attract mode: car does lazy donuts
      car.a += dt * 1.6; const sp = 160;
      car.vx = Math.cos(car.a + 0.5) * sp; car.vy = Math.sin(car.a + 0.5) * sp;
      car.x = WW / 2 + Math.cos(t / 1000) * (WW * 0.18); car.y = WH * 0.55 + Math.sin(t / 1000) * (WH * 0.18);
      car.a = t / 1000 + Math.PI / 2 + 0.5;
      const nfx = Math.cos(car.a), nfy = Math.sin(car.a);
      [[-16 * CS, -12 * CS], [-16 * CS, 12 * CS]].forEach(([wx, wy], i) => {
        const x = car.x + nfx * wx - nfy * wy, y = car.y + nfy * wx + nfx * wy;
        const lp = lastWheel[i]; sk.strokeStyle = "rgba(30,22,24,.12)"; sk.lineWidth = 5;
        if (lp) { sk.beginPath(); sk.moveTo(lp[0], lp[1]); sk.lineTo(x, y); sk.stroke(); }
        lastWheel[i] = [x, y];
        if (Math.random() < 0.25) smoke.push({ x, y, vx: 0, vy: 0, r: 6, life: 0.8 });
      });
      smoke.forEach((s) => { s.r += 30 * dt; s.life -= dt; }); smoke = smoke.filter((s) => s.life > 0);
    }
    render(t, dt);
    requestAnimationFrame(loop);
  }

  layout();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
  if (document.fonts) document.fonts.ready.then(() => layout());
})();
