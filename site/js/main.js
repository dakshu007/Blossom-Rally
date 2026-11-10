/* Blossom Rally — page interactions */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* ---------------- platform detection ---------------- */
  const ua = navigator.userAgent || "";
  const uaPlat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Mac/.test(uaPlat) && navigator.maxTouchPoints > 1);
  const detected = /Win/i.test(uaPlat) || /Windows/i.test(ua) ? "windows" : /Mac/i.test(uaPlat) || /Mac OS X/.test(ua) ? "mac" : null;
  window.BR_PLATFORM = detected || "windows";
  if (!isMobile && detected === "mac") $("#platMac").classList.add("is-rec");
  if (!isMobile && detected === "windows") $("#platWin").classList.add("is-rec");
  if (isMobile) $("#dlNote").classList.add("is-on");

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-download]");
    if (!t) return;
    e.preventDefault();
    const p = t.getAttribute("data-download") || window.BR_PLATFORM;
    window.Launch && window.Launch.open(p);
  });

  /* ---------------- tach tick marks ---------------- */
  $$(".tach__ticks").forEach((g) => {
    let html = "";
    for (let i = 0; i <= 9; i++) {
      const a = (-90 + i * 20) * Math.PI / 180;
      const x1 = 100 + Math.sin(a) * 68, y1 = 110 - Math.cos(a) * 68;
      const x2 = 100 + Math.sin(a) * 60, y2 = 110 - Math.cos(a) * 60;
      const tx = 100 + Math.sin(a) * 48, ty = 110 - Math.cos(a) * 48 + 4;
      html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text x="${tx}" y="${ty}">${i}</text>`;
    }
    g.innerHTML = html;
  });
  const needleAngle = (rpm) => -90 + clamp(rpm / 9000, 0, 1) * 180;

  /* ---------------- hero title split ---------------- */
  $$("[data-split]").forEach((el) => {
    const txt = el.textContent;
    el.innerHTML = txt.split("").map((c, i) => `<span class="ch" style="transition-delay:${0.15 + i * 0.05}s">${c}</span>`).join("");
  });

  /* ---------------- ignition gate ---------------- */
  const gate = $("#gate");
  const gateNeedle = $("#gateNeedle");
  const gateLoad = $("#gateLoad");
  const btnSound = $("#enterSound"), btnSilent = $("#enterSilent");
  const video = $("#heroVideo");
  let loadP = 0, shownP = 0, gateDone = false;
  const parts = { sfx: 0, video: 0, fonts: 0 };
  const upd = () => { loadP = parts.sfx * 0.4 + parts.video * 0.4 + parts.fonts * 0.2; };
  SFX.prefetch((p) => { parts.sfx = p; upd(); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { parts.fonts = 1; upd(); });
  const vidReady = () => { parts.video = 1; upd(); };
  if (video.readyState >= 3) vidReady();
  video.addEventListener("canplaythrough", vidReady, { once: true });
  video.addEventListener("loadeddata", () => { parts.video = Math.max(parts.video, 0.6); upd(); }, { once: true });
  setTimeout(() => { parts.video = 1; parts.sfx = 1; parts.fonts = 1; upd(); }, 4500); // never block

  (function gateLoop() {
    if (gateDone) return;
    shownP = lerp(shownP, loadP, 0.08);
    if (loadP >= 1 && shownP > 0.985) shownP = 1;
    const rpm = shownP * 8200 + Math.sin(performance.now() / 90) * 120 * (1 - shownP);
    gateNeedle.style.transform = `rotate(${needleAngle(rpm)}deg)`;
    gateLoad.textContent = Math.round(shownP * 100);
    if (shownP >= 1 && btnSound.disabled) {
      btnSound.disabled = false; btnSilent.disabled = false;
      btnSound.focus({ preventScroll: true });
    }
    requestAnimationFrame(gateLoop);
  })();

  function enter(withSound) {
    gateDone = true;
    SFX.setEnabled(withSound);
    if (withSound) {
      SFX.ensureCtx();
      setTimeout(() => SFX.play("rev", { volume: 0.9 }), 60);
    }
    gateNeedle.style.transition = "transform .5s cubic-bezier(.34,1.56,.64,1)";
    gateNeedle.style.transform = `rotate(${needleAngle(withSound ? 8800 : 1000)}deg)`;
    setTimeout(() => {
      gate.classList.add("is-out");
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-ready");
      video.play && video.play().catch(() => {});
    }, withSound ? 420 : 150);
    setTimeout(() => gate.remove(), 1400);
  }
  btnSound.addEventListener("click", () => enter(true));
  btnSilent.addEventListener("click", () => enter(false));

  /* ---------------- sound toggle ---------------- */
  const soundBtn = $("#soundToggle");
  const syncSound = (on) => {
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.querySelector(".sound__label").textContent = on ? "SOUND ON" : "SOUND OFF";
  };
  SFX.onChange(syncSound);
  soundBtn.addEventListener("click", () => {
    const on = SFX.toggle();
    if (on) SFX.beep(660, 0.08, "triangle", 0.15), SFX.beep(990, 0.1, "triangle", 0.15, 0.08);
  });

  /* ---------------- idle loop while hero visible ---------------- */
  let idle = null, heroVisible = true;
  const syncIdle = () => {
    const want = SFX.enabled && heroVisible && !document.hidden && !document.body.classList.contains("is-locked");
    if (want && !idle) idle = SFX.play("idle", { loop: true, volume: 0.22 });
    if (!want && idle) { idle.stop(0.6); idle = null; }
  };
  SFX.onChange(() => setTimeout(syncIdle, 300));
  document.addEventListener("visibilitychange", syncIdle);
  window.BR_syncIdle = syncIdle;
  setInterval(syncIdle, 1200); // catches decode finishing after unlock

  /* ---------------- petals (hero) ---------------- */
  const pc = $("#petals"), px = pc.getContext("2d");
  let PW = 0, PH = 0, DPR = 1;
  const petals = [];
  const mouse = { x: -999, y: -999 };
  const PCOLORS = ["#f7a3bc", "#f07a9c", "#fbd0dc", "#e8577f", "#ffc2d1"];
  function sizePetals() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    PW = pc.clientWidth; PH = pc.clientHeight;
    pc.width = PW * DPR; pc.height = PH * DPR;
    px.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function newPetal(top) {
    const z = 0.35 + Math.random() * 0.9;
    return {
      x: Math.random() * PW, y: top ? -20 - Math.random() * PH * 0.3 : Math.random() * PH,
      z, s: 6 + z * 9, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.06,
      flip: Math.random() * 6.28, vf: 0.02 + Math.random() * 0.05,
      vx: 0.25 + Math.random() * 0.6, vy: 0.5 + z * 0.9, ph: Math.random() * 6.28,
      c: PCOLORS[(Math.random() * PCOLORS.length) | 0], dx: 0, dy: 0,
    };
  }
  function drawPetal(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.8 + 0.2);
    ctx.globalAlpha = 0.55 + p.z * 0.4;
    ctx.fillStyle = p.c;
    const s = p.s;
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(s * 0.9, s * 0.4, s * 0.7, -s * 0.8, s * 0.15, -s);
    ctx.lineTo(0, -s * 0.72);
    ctx.lineTo(-s * 0.15, -s);
    ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.4, 0, s);
    ctx.fill();
    ctx.restore();
  }
  window.BR_drawPetal = drawPetal;
  function initPetals() {
    sizePetals();
    petals.length = 0;
    const n = reduced ? 0 : isTouch ? 34 : 70;
    for (let i = 0; i < n; i++) petals.push(newPetal(false));
  }
  initPetals();
  window.addEventListener("resize", () => { sizePetals(); });
  $("#hero").addEventListener("pointermove", (e) => {
    const r = pc.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  $("#hero").addEventListener("pointerleave", () => { mouse.x = mouse.y = -999; });
  let wind = 0;
  function petalLoop(t) {
    if (heroVisible) {
      px.clearRect(0, 0, PW, PH);
      const gust = Math.sin(t / 2400) * 0.6 + wind;
      for (const p of petals) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 16000) { const f = (1 - d2 / 16000) * 2.2; const d = Math.sqrt(d2) || 1; p.dx += (dx / d) * f; p.dy += (dy / d) * f; }
        p.dx *= 0.93; p.dy *= 0.93;
        p.x += (p.vx + gust) * p.z + Math.sin(t / 900 + p.ph) * 0.5 + p.dx;
        p.y += p.vy + p.dy;
        p.rot += p.vr; p.flip += p.vf;
        if (p.y > PH + 30 || p.x > PW + 40 || p.x < -60) Object.assign(p, newPetal(true), { x: Math.random() * PW * 1.1 - PW * 0.1 });
        drawPetal(px, p);
      }
      wind *= 0.96;
    }
    requestAnimationFrame(petalLoop);
  }
  requestAnimationFrame(petalLoop);

  /* ---------------- visibility observers ---------------- */
  new IntersectionObserver((es) => {
    es.forEach((e) => {
      heroVisible = e.isIntersecting;
      if (heroVisible) video.play && video.play().catch(() => {}); else video.pause();
      syncIdle();
    });
  }, { threshold: 0.05 }).observe($("#hero"));

  // reveal-on-scroll
  const revealEls = $$(".h2:not(.hero__title), .lead, .eyebrow, .plat, .log__item, .faq details, .pit, .garage__stage, .lot__frame");
  revealEls.forEach((el, i) => { el.setAttribute("data-reveal", ""); el.style.transitionDelay = `${(i % 3) * 0.06}s`; });
  const ro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); } }), { threshold: 0.15 });
  revealEls.forEach((el) => ro.observe(el));
  const stats = $("#stats");
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) stats.classList.add("is-in"); }), { threshold: 0.4 }).observe(stats);

  /* ---------------- speedo hides over sections with their own HUD/CTA ---------------- */
  const awaySet = new Set();
  const awayIO = new IntersectionObserver((es) => {
    es.forEach((e) => (e.isIntersecting ? awaySet.add(e.target) : awaySet.delete(e.target)));
    $("#speedo").classList.toggle("is-away", awaySet.size > 0);
  }, { threshold: 0.12 });
  ["#drive", "#download", ".foot"].forEach((s) => awayIO.observe($(s)));

  /* ---------------- scroll speedo + nav + marquee ---------------- */
  const nav = $("#nav"), speedo = $("#speedo");
  const spdV = $("#spdV"), spdG = $("#spdG"), spdD = $("#spdD");
  const hudSpeed = $("#hudSpeed"), hudGear = $("#hudGear"), hudScore = $("#hudScore"), hudBest = $("#hudBest");
  const marquee = $("#marquee");
  marquee.innerHTML += marquee.innerHTML; // seamless loop
  let lastY = window.scrollY, lastT = performance.now(), vel = 0, speed = 0, score = 0, mqX = 0;
  let best = 0; try { best = +localStorage.getItem("br_scroll_best") || 0; } catch (e) {}
  hudBest.textContent = best;
  let lastDir = 0, run = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0.016; lastT = t;
    const y = window.scrollY, dy = y - lastY; lastY = y;
    const inst = Math.abs(dy) / dt;
    vel = lerp(vel, inst, 0.12);
    speed = clamp(vel * 0.09, 0, 260);
    const dir = Math.sign(dy);
    if (speed > 25) {
      run += speed * dt * 0.6;
      if (dir && lastDir && dir !== lastDir) run *= 1.5; // direction flick = drift bonus
    } else if (run > 0) {
      score += Math.round(run); run = 0;
      if (score > best) { best = score; try { localStorage.setItem("br_scroll_best", best); } catch (e) {} }
    }
    if (dir) lastDir = dir;
    const gear = speed < 20 ? 1 : speed < 55 ? 2 : speed < 95 ? 3 : speed < 140 ? 4 : speed < 190 ? 5 : 6;
    const s = Math.round(speed);
    spdV.textContent = s; hudSpeed.textContent = s;
    spdG.textContent = gear; hudGear.textContent = gear;
    const shown = score + Math.round(run);
    spdD.textContent = shown; hudScore.textContent = shown; hudBest.textContent = Math.max(best, shown);
    speedo.classList.toggle("is-on", y > window.innerHeight * 0.7);
    nav.classList.toggle("is-solid", y > window.innerHeight * 0.6);
    if (Math.abs(dy) > 4 && y > 200) nav.classList.toggle("is-hidden", dy > 0 && !document.body.classList.contains("is-locked"));
    // marquee speed reacts to scroll
    mqX -= (60 + speed * 4) * dt * (reduced ? 0 : 1);
    const half = marquee.scrollWidth / 2;
    if (half && -mqX > half) mqX += half;
    marquee.style.transform = `translate3d(${mqX}px,0,0)`;
    // petals get blown by fast scroll
    wind = Math.max(wind, speed / 80);
    runTick(dt);
    revTick(dt);
    requestAnimationFrame(frame);
  }

  /* ---------------- THE RUN: scroll-driven drift road ---------------- */
  const runSec = $("#run"), svg = $("#runSvg");
  const roadEls = ["#runRoadEdge", "#runRoad", "#runCenter"].map((s) => $(s));
  const skid = $("#runSkid"), skid2 = $("#runSkid2");
  const car = $("#runCar"), carBody = $("#runCarBody");
  const runTrees = $("#runTrees"), runFlags = $("#runFlags");
  const cards = $$(".rcard"), runPct = $("#runPct"), runHead = $(".run__head");
  let pathLen = 0, W = 0, H = 0, roadW = 84, carAngle = 0, slip = 0, prog = 0, runVisible = false;
  let runEngine = null, runScreech = null;
  const LAND = [[-0.06, .80], [.18, .88], [.42, .76], [.50, .56], [.30, .47], [.10, .40], [.13, .21], [.36, .13], [.58, .25], [.66, .07], [.72, -.12]];
  const PORT = [[-0.12, .44], [.25, .47], [.78, .43], [.86, .31], [.55, .27], [.16, .24], [.18, .13], [.55, .095], [1.15, .13]];

  function catmull(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function buildRun() {
    W = svg.clientWidth; H = svg.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const portrait = W < H * 0.9 || W < 760;
    const pts = (portrait ? PORT : LAND).map(([x, y]) => [x * W, y * H]);
    const d = catmull(pts);
    roadEls.forEach((el) => el.setAttribute("d", d));
    skid.setAttribute("d", d); skid2.setAttribute("d", d);
    roadW = clamp(Math.min(W, H) * (portrait ? 0.1 : 0.105), 46, 96);
    roadEls[0].style.strokeWidth = roadW + 12;
    roadEls[1].style.strokeWidth = roadW;
    skid.style.strokeWidth = roadW * 0.44; skid.style.opacity = 0.3;
    skid2.style.strokeWidth = roadW * 0.3; skid2.style.stroke = "#5d5658"; skid2.style.opacity = 1;
    pathLen = roadEls[1].getTotalLength();
    [skid, skid2].forEach((s) => { s.style.strokeDasharray = `${pathLen} ${pathLen}`; });
    car.style.transform = "";
    carBody.setAttribute("transform", "");
    car.setAttribute("data-scale", (roadW / 84) * 1.55);
    // trees, away from the road
    const samples = [];
    for (let i = 0; i <= 160; i++) { const p = roadEls[1].getPointAtLength((i / 160) * pathLen); samples.push(p); }
    const away = (x, y, r) => samples.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > (roadW * 0.75 + r) ** 2);
    let trees = "", n = 0, tries = 0;
    const want = portrait ? 8 : 16;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (n < want && tries < 600) {
      tries++;
      const x = rnd() * W, y = portrait ? rnd() * H * 0.55 : rnd() * H, r = (portrait ? 16 : 22) + rnd() * 18;
      if (!portrait && x > W * 0.62) continue;
      if (!away(x, y, r)) continue;
      trees += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})"><rect class="run__tree-trunk" x="-3" y="0" width="6" height="${(r * 0.9).toFixed(0)}" rx="2"/><circle class="run__tree" r="${r.toFixed(0)}" cy="-2"/><circle class="run__tree2" r="${(r * 0.62).toFixed(0)}" cx="${(-r * 0.45).toFixed(0)}" cy="${(-r * 0.4).toFixed(0)}"/><circle class="run__tree" r="${(r * 0.55).toFixed(0)}" cx="${(r * 0.55).toFixed(0)}" cy="${(r * 0.1).toFixed(0)}"/></g>`;
      n++;
    }
    runTrees.innerHTML = trees;
    // checkpoint flags
    runFlags.innerHTML = cards.map((c, i) => {
      const p = roadEls[1].getPointAtLength(+c.dataset.at * pathLen);
      return `<g class="run__flag" data-i="${i}" transform="translate(${(p.x).toFixed(0)},${(p.y - roadW * 0.5 - 30).toFixed(0)})"><line x1="0" y1="0" x2="0" y2="30" stroke="#1b1416" stroke-width="3"/><rect x="0" y="0" width="38" height="22" rx="4"/><text x="19" y="16" text-anchor="middle">0${i + 1}</text></g>`;
    }).join("");
    placeCar(prog, true);
  }
  function placeCar(p, snap) {
    if (!pathLen) return;
    const L = clamp(p, 0, 1) * pathLen;
    const a = roadEls[1].getPointAtLength(Math.max(0, L - 2));
    const b = roadEls[1].getPointAtLength(Math.min(pathLen, L + 2));
    const ahead = roadEls[1].getPointAtLength(Math.min(pathLen, L + 60));
    const behind = roadEls[1].getPointAtLength(Math.max(0, L - 60));
    const tang = Math.atan2(b.y - a.y, b.x - a.x);
    let turn = Math.atan2(ahead.y - b.y, ahead.x - b.x) - Math.atan2(b.y - behind.y, b.x - behind.x);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const targetSlip = clamp(turn * 0.9, -0.75, 0.75);
    slip = snap ? targetSlip : lerp(slip, targetSlip, 0.12);
    let target = tang + slip;
    let diff = Math.atan2(Math.sin(target - carAngle), Math.cos(target - carAngle));
    carAngle = snap ? target : carAngle + diff * 0.25;
    const pt = roadEls[1].getPointAtLength(L);
    const sc = +car.getAttribute("data-scale") || 1;
    car.setAttribute("transform", `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) scale(${sc.toFixed(3)})`);
    carBody.setAttribute("transform", `rotate(${(carAngle * 180 / Math.PI).toFixed(1)})`);
    const off = pathLen - L;
    skid.style.strokeDashoffset = off; skid2.style.strokeDashoffset = off;
    return Math.abs(slip);
  }
  let lastProg = 0;
  function runTick(dt) {
    if (!runVisible) { if (runEngine) { runEngine.setRpm(900, 0); } if (runScreech) runScreech.set(0); return; }
    const r = runSec.getBoundingClientRect();
    const total = runSec.offsetHeight - window.innerHeight;
    const target = clamp(-r.top / total, 0, 1);
    prog = reduced ? target : lerp(prog, target, 0.14);
    const sl = placeCar(prog) || 0;
    const v = Math.abs(prog - lastProg) / dt; lastProg = prog;
    runPct.textContent = Math.round(prog * 100);
    runHead.style.opacity = clamp(1 - prog * 14, 0, 1);
    cards.forEach((c, i) => {
      const at = +c.dataset.at, next = cards[i + 1] ? +cards[i + 1].dataset.at : 1.2;
      c.classList.toggle("is-on", prog >= at - 0.06 && prog < next - 0.06);
      c.classList.toggle("is-past", prog >= next - 0.06);
    });
    $$(".run__flag", runFlags).forEach((f, i) => f.classList.toggle("is-hit", prog >= +cards[i].dataset.at));
    // engine follows the scroll throttle
    if (SFX.enabled) {
      if (!runEngine) runEngine = SFX.createEngine(0.1);
      if (!runScreech) runScreech = SFX.createScreech(0.12);
      const rpm = clamp(1000 + v * 60000, 900, 8200);
      runEngine && runEngine.setRpm(rpm, clamp(v * 10, 0, 1));
      runScreech && runScreech.set(v > 0.02 ? clamp(sl * 1.6, 0, 1) * clamp(v * 12, 0, 1) : 0);
    } else if (runEngine) { runEngine.stop(); runEngine = null; runScreech && runScreech.stop(); runScreech = null; }
  }
  new IntersectionObserver((es) => es.forEach((e) => {
    runVisible = e.isIntersecting;
    if (!runVisible && runEngine) { runEngine.stop(); runEngine = null; }
    if (!runVisible && runScreech) { runScreech.stop(); runScreech = null; }
  }), { threshold: 0 }).observe(runSec);
  buildRun();
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { buildRun(); initPetals(); }, 150); });

  /* ---------------- GARAGE: hold to rev ---------------- */
  const revBtn = $("#revBtn"), revNeedle = $("#revNeedle"), revRpmEl = $("#revRpm"), revBox = $(".rev");
  let rpm = 900, holding = false, revEngine = null, revCool = 0, limiterT = 0;
  const startRev = (e) => {
    if (e) e.preventDefault();
    if (holding) return;
    holding = true; revBtn.classList.add("is-held");
    if (SFX.enabled && !revEngine) revEngine = SFX.createEngine(0.32);
  };
  const endRev = () => {
    if (!holding) return;
    holding = false; revBtn.classList.remove("is-held");
    if (rpm > 6000 && SFX.enabled) { SFX.burst(0.12, 500, 0.35); setTimeout(() => SFX.burst(0.1, 700, 0.28), 140); setTimeout(() => SFX.burst(0.08, 600, 0.2), 260); }
    revCool = 1.6;
  };
  revBtn.addEventListener("pointerdown", startRev);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => revBtn.addEventListener(ev, endRev));
  revBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if ((e.key === "r" || e.key === "R") && !e.repeat && !/input|textarea/i.test(document.activeElement.tagName) && !document.body.classList.contains("is-driving")) {
      const gr = $("#garage").getBoundingClientRect();
      if (gr.top < window.innerHeight && gr.bottom > 0) startRev();
    }
  });
  window.addEventListener("keyup", (e) => { if (e.key === "r" || e.key === "R") endRev(); });
  function revTick(dt) {
    if (holding) {
      rpm += (1500 + rpm * 0.9) * dt * 2.2;
      if (rpm >= 8200) { rpm = 8200 - Math.random() * 500; limiterT = 0.12; }
    } else {
      rpm += (900 - rpm) * dt * 3.2;
    }
    limiterT -= dt;
    revBox.classList.toggle("is-limiter", limiterT > 0);
    revNeedle.style.transform = `rotate(${needleAngle(rpm)}deg)`;
    revRpmEl.textContent = Math.round(rpm / 10) * 10;
    if (revEngine) {
      revEngine.setRpm(rpm, holding ? 1 : 0.3);
      if (!holding) { revCool -= dt; if (revCool <= 0) { revEngine.stop(); revEngine = null; } }
    }
  }

  /* ---------------- gallery drag ---------------- */
  const track = $("#galleryTrack");
  let dragging = false, sx = 0, sl0 = 0, moved = 0;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    dragging = true; moved = 0; sx = e.clientX; sl0 = track.scrollLeft; track.classList.add("is-drag");
  });
  window.addEventListener("pointermove", (e) => { if (!dragging) return; moved = Math.abs(e.clientX - sx); track.scrollLeft = sl0 - (e.clientX - sx) * 1.4; });
  window.addEventListener("pointerup", () => { if (!dragging) return; dragging = false; track.classList.remove("is-drag"); });

  /* ---------------- Thursday countdown ---------------- */
  const clock = {}; $$("#pitClock b").forEach((b) => (clock[b.dataset.u] = b));
  const pit = $(".pit"), pitLabel = $("#pitLabel"), pitWeek = $("#pitWeek");
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  function nextThursday(now) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    let add = (4 - d.getDay() + 7) % 7; if (add === 0) add = 7;
    d.setDate(d.getDate() + add); return d;
  }
  function renderWeek(now) {
    const today = (now.getDay() + 6) % 7;
    pitWeek.innerHTML = days.map((d, i) => `<span class="${i === 3 ? "is-thu" : ""} ${i === today ? "is-today" : ""}">${d}</span>`).join("");
  }
  const prevVals = {};
  function tickClock() {
    const now = new Date();
    const isThu = now.getDay() === 4;
    pit.classList.toggle("is-today", isThu);
    pitLabel.textContent = isThu ? "IT'S THURSDAY · NEW BUILD DAY · NEXT ONE IN" : "NEXT UPDATE IN";
    let ms = nextThursday(now) - now;
    const v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
    Object.keys(v).forEach((k) => {
      const txt = k === "d" ? String(v[k]) : String(v[k]).padStart(2, "0");
      if (prevVals[k] !== txt) { clock[k].textContent = txt; clock[k].classList.remove("tick"); void clock[k].offsetWidth; clock[k].classList.add("tick"); prevVals[k] = txt; }
    });
    if (!pitWeek.children.length || now.getSeconds() === 0) renderWeek(now);
  }
  tickClock(); setInterval(tickClock, 1000);

  $("#year").textContent = new Date().getFullYear();
  requestAnimationFrame(frame);
})();
