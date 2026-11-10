/* Blossom Rally — download experience
   lights → GO → drift across the screen → email → OTP (Supabase) → checkered flag → download */
(function () {
  const $ = (s) => document.querySelector(s);
  const cfg = window.BR_CONFIG || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = () => window.SFX || { play() {}, beep() {}, burst() {}, tick() {}, enabled: false };

  const el = {
    launch: $("#launch"), fx: $("#launchFx"), lights: $("#launchLights"), go: $("#launchGo"),
    car: $("#launchCar"), panel: $("#panel"), skip: $("#launchSkip"), close: $("#launchClose"),
    plat: $("#panelPlat"),
    stepEmail: $("#stepEmail"), email: $("#emailInput"), emailErr: $("#emailErr"), emailBtn: $("#emailBtn"),
    stepOtp: $("#stepOtp"), otp: $("#otp"), otpErr: $("#otpErr"), otpBtn: $("#otpBtn"), otpEmail: $("#otpEmail"),
    otpChange: $("#otpChange"), otpResend: $("#otpResend"), otpTimer: $("#otpTimer"),
    stepDone: $("#stepDone"), doneMsg: $("#doneMsg"), doneRetry: $("#doneRetry"), doneOther: $("#doneOther"),
  };
  const pods = Array.from(document.querySelectorAll(".gantry__pod"));
  const gantry = document.querySelector(".gantry");

  let sb = null;
  function client() {
    if (sb) return sb;
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "br-auth" },
    });
    return sb;
  }

  let platform = "windows", email = "", timers = [], raf = 0, carRaf = 0, open = false, resendT = 0, resendIv = 0, lastFocus = null;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); cancelAnimationFrame(carRaf); };
  const PNAME = { mac: "macOS", windows: "Windows" };

  /* ---------- fx canvas: skid marks, smoke, petals, confetti ---------- */
  const fx = el.fx, fc = fx.getContext("2d");
  let FW = 0, FH = 0, DPR = 1, parts = [], marks = [];
  function sizeFx() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    FW = window.innerWidth; FH = window.innerHeight;
    fx.width = FW * DPR; fx.height = FH * DPR; fc.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", () => { if (open) sizeFx(); });
  const PINKS = ["#f7a3bc", "#f07a9c", "#fbd0dc", "#e8577f", "#ffc2d1"];
  function petalBurst(x, y, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 520) * power;
      parts.push({ k: "petal", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200 * power, life: 2.2 + Math.random(), s: 6 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, flip: Math.random() * 6, vf: 0.05 + Math.random() * 0.1, c: PINKS[(Math.random() * PINKS.length) | 0], z: 1 });
    }
  }
  function confetti(n) {
    const cols = ["#2f7f8f", "#f0892b", "#d42a3c", "#fbf8f2", "#1b1416", "#f07a9c"];
    for (let i = 0; i < n; i++) parts.push({ k: "conf", x: Math.random() * FW, y: -20 - Math.random() * FH * 0.5, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 220, life: 4, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] });
  }
  let fxLast = 0;
  function fxLoop(t) {
    const dt = Math.min(0.033, (t - fxLast) / 1000) || 0.016; fxLast = t;
    fc.clearRect(0, 0, FW, FH);
    // skid marks (persist, slowly fade)
    fc.lineCap = "round";
    for (const m of marks) {
      m.a = Math.max(0, m.a - dt * 0.05);
      fc.strokeStyle = `rgba(10,6,8,${m.a})`; fc.lineWidth = m.w;
      fc.beginPath(); fc.moveTo(m.x1, m.y1); fc.lineTo(m.x2, m.y2); fc.stroke();
    }
    for (const p of parts) {
      p.life -= dt;
      if (p.k === "smoke") {
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += 60 * dt; p.vx *= 0.97; p.vy *= 0.97;
        fc.fillStyle = `rgba(240,234,236,${clamp(p.life, 0, 1) * 0.35})`;
        fc.beginPath(); fc.arc(p.x, p.y, p.r, 0, Math.PI * 2); fc.fill();
      } else if (p.k === "petal") {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr; p.flip += p.vf;
        if (window.BR_drawPetal) window.BR_drawPetal(fc, p);
      } else if (p.k === "conf") {
        p.x += p.vx * dt + Math.sin(t / 300 + p.rot) * 0.8; p.y += p.vy * dt; p.rot += p.vr;
        fc.save(); fc.translate(p.x, p.y); fc.rotate(p.rot); fc.scale(Math.cos(t / 200 + p.rot), 1);
        fc.fillStyle = p.c; fc.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fc.restore();
      }
    }
    parts = parts.filter((p) => p.life > 0 && p.y < FH + 80);
    if (open) raf = requestAnimationFrame(fxLoop);
  }

  /* ---------- car drift animation ---------- */
  function driftCar(onDone) {
    const dur = 1900, t0 = performance.now();
    const lastW = [null, null];
    el.car.style.opacity = 1;
    S().play("drift", { volume: 1 });
    const tan4 = Math.tan(4 * Math.PI / 180);
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = -0.2 * FW + e * 1.4 * FW;
      // ride the skewed road band, weaving a little
      const y = FH / 2 - (x - FW / 2) * tan4 + Math.sin(t * Math.PI * 2) * Math.min(60, FH * 0.05);
      // Scandinavian flick: swing the tail one way, then the other
      const u = clamp((t - 0.08) / 0.84, 0, 1);
      const slide = Math.sin(u * Math.PI * 2) * 0.95 * Math.sin(u * Math.PI);
      const ang = -4 * Math.PI / 180 + slide;
      const sc = clamp(FW / 900, 0.7, 1.25);
      el.car.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad) scale(${sc})`;
      // rear wheel skid marks + smoke
      const ca = Math.cos(ang), sa = Math.sin(ang), amt = Math.abs(slide);
      [[-56, -31], [-56, 31]].forEach(([wx, wy], i) => {
        const px = x + (ca * wx - sa * wy) * sc, py = y + (sa * wx + ca * wy) * sc;
        if (lastW[i] && amt > 0.12) marks.push({ x1: lastW[i][0], y1: lastW[i][1], x2: px, y2: py, w: 9 * sc, a: 0.6 * Math.min(1, amt * 1.4) });
        lastW[i] = [px, py];
        if (amt > 0.18 && Math.random() < 0.9) parts.push({ k: "smoke", x: px, y: py, vx: -120 + (Math.random() - 0.5) * 70, vy: -20 + (Math.random() - 0.5) * 60, r: 10 + Math.random() * 12, life: 1.5 });
      });
      if (Math.random() < 0.3) petalBurst(x, y, 1, 0.5);
      if (t < 1) carRaf = requestAnimationFrame(step);
      else { el.car.style.opacity = 0; onDone && onDone(); }
    };
    carRaf = requestAnimationFrame(step);
  }

  /* ---------- intro sequence ---------- */
  function intro(done) {
    if (reduced) { done(); return; }
    pods.forEach((p) => p.classList.remove("is-on")); gantry.classList.remove("is-go"); el.go.classList.remove("is-on");
    S().play("rev", { volume: 0.85 });
    const gap = 380, start = 450;
    pods.forEach((p, i) => later(() => { p.classList.add("is-on"); S().beep(520, 0.16, "square", 0.16); }, start + i * gap));
    const goAt = start + pods.length * gap + 300 + Math.random() * 500;
    later(() => {
      pods.forEach((p) => p.classList.remove("is-on")); gantry.classList.add("is-go");
      el.go.classList.add("is-on");
      S().beep(1046, 0.5, "square", 0.18);
      el.launch.classList.add("is-shake"); later(() => el.launch.classList.remove("is-shake"), 600);
      // FX loop runs separately; car drift on its own rAF
      driftCar(() => later(done, 120));
      fxLast = performance.now(); raf = requestAnimationFrame(fxLoop);
    }, goAt);
  }

  function showPanel() {
    if (!open || el.launch.classList.contains("is-panel")) return;
    el.launch.classList.add("is-panel");
    S().play("whoosh", { volume: 0.7 });
    cancelAnimationFrame(raf); fxLast = performance.now(); raf = requestAnimationFrame(fxLoop);
    const c = client();
    if (c) {
      c.auth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) { email = data.session.user.email || ""; showStep("done"); startDownload(); }
        else { showStep("email"); later(() => el.email.focus(), 350); }
      }).catch(() => showStep("email"));
    } else { showStep("email"); later(() => el.email.focus(), 350); }
  }

  function showStep(which) {
    el.stepEmail.hidden = which !== "email";
    el.stepOtp.hidden = which !== "otp";
    el.stepDone.hidden = which !== "done";
  }

  /* ---------- platform switch ---------- */
  function setPlatform(p) {
    platform = p === "mac" ? "mac" : "windows";
    el.plat.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.dataset.plat === platform));
    el.doneOther.textContent = `Also get the ${PNAME[platform === "mac" ? "windows" : "mac"]} build`;
  }
  el.plat.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { setPlatform(b.dataset.plat); S().tick(2); } });

  /* ---------- open / close ---------- */
  function openLaunch(p) {
    if (open) return;
    open = true; lastFocus = document.activeElement;
    setPlatform(p);
    document.body.classList.add("is-locked");
    window.BR_syncIdle && window.BR_syncIdle();
    el.launch.hidden = false;
    el.launch.classList.remove("is-panel");
    el.emailErr.textContent = ""; el.otpErr.textContent = "";
    showStep("none");
    sizeFx(); parts = []; marks = [];
    requestAnimationFrame(() => el.launch.classList.add("is-open"));
    if (window.SFX && SFX.enabled) SFX.ensureCtx();
    intro(showPanel);
  }
  function closeLaunch() {
    if (!open) return;
    open = false; clearTimers(); clearInterval(resendIv);
    el.launch.classList.remove("is-open", "is-panel");
    later(() => { el.launch.hidden = true; }, 350);
    document.body.classList.remove("is-locked");
    window.BR_syncIdle && window.BR_syncIdle();
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }
  el.close.addEventListener("click", closeLaunch);
  el.skip.addEventListener("click", () => { clearTimers(); el.car.style.opacity = 0; el.go.classList.remove("is-on"); showPanel(); });
  document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") closeLaunch(); });

  /* ---------- busy helper ---------- */
  function busy(btn, on) { btn.disabled = on; btn.classList.toggle("is-busy", on); }
  function shake() { el.panel.classList.remove("is-shake"); void el.panel.offsetWidth; el.panel.classList.add("is-shake"); S().burst(0.15, 250, 0.3); }
  function friendly(err) {
    const m = (err && (err.message || err.error_description || err.msg)) || String(err || "");
    if (/rate|too many|security purposes|seconds/i.test(m)) {
      const s = (m.match(/(\d+)\s*seconds?/) || [])[1];
      return s ? `Easy on the throttle — try again in ${s} seconds.` : "Too many tries. Give it a minute and try again.";
    }
    if (/expired/i.test(m)) return "That code has expired. Hit resend for a fresh one.";
    if (/invalid|token|otp/i.test(m)) return "That code didn't match. Check it and try again.";
    if (/fetch|network/i.test(m)) return "Network hiccup. Check your connection and retry.";
    return m || "Something went wrong. Please try again.";
  }

  /* ---------- step 1: email ---------- */
  el.stepEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = el.email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { el.emailErr.textContent = "That doesn't look like an email address."; shake(); return; }
    const c = client();
    if (!c) { el.emailErr.textContent = "Downloads are being switched on right now — please check back shortly."; shake(); return; }
    el.emailErr.textContent = "";
    busy(el.emailBtn, true);
    try {
      const { error } = await c.auth.signInWithOtp({ email: v, options: { shouldCreateUser: true } });
      if (error) throw error;
      email = v;
      S().play("whoosh", { volume: 0.6 });
      gotoOtp();
    } catch (err) {
      el.emailErr.textContent = friendly(err); shake();
    } finally { busy(el.emailBtn, false); }
  });

  /* ---------- step 2: OTP ---------- */
  const N = cfg.otpLength || 6;
  const boxes = [];
  for (let i = 0; i < N; i++) {
    const inp = document.createElement("input");
    inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 1; inp.pattern = "[0-9]*";
    inp.autocomplete = i === 0 ? "one-time-code" : "off";
    inp.setAttribute("aria-label", `Digit ${i + 1} of ${N}`);
    el.otp.appendChild(inp); boxes.push(inp);
  }
  el.otp.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  const code = () => boxes.map((b) => b.value).join("");
  function fill(str, from = 0) {
    const digits = str.replace(/\D/g, "").split("");
    let i = from;
    for (const d of digits) { if (i >= N) break; boxes[i].value = d; boxes[i].classList.add("is-filled"); i++; }
    boxes[Math.min(i, N - 1)].focus();
    if (code().length === N) later(() => el.stepOtp.requestSubmit ? el.stepOtp.requestSubmit() : el.otpBtn.click(), 120);
  }
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      el.otp.classList.remove("is-bad");
      const v = b.value.replace(/\D/g, "");
      if (v.length > 1) { b.value = ""; fill(v, i); return; }
      b.value = v; b.classList.toggle("is-filled", !!v);
      if (v) { S().tick(i); if (i < N - 1) boxes[i + 1].focus(); else if (code().length === N) later(() => el.stepOtp.requestSubmit ? el.stepOtp.requestSubmit() : el.otpBtn.click(), 120); }
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !b.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].classList.remove("is-filled"); boxes[i - 1].focus(); e.preventDefault(); }
      if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < N - 1) boxes[i + 1].focus();
    });
    b.addEventListener("paste", (e) => { e.preventDefault(); fill((e.clipboardData || window.clipboardData).getData("text"), 0); });
    b.addEventListener("focus", () => b.select());
  });

  function gotoOtp() {
    boxes.forEach((b) => { b.value = ""; b.classList.remove("is-filled"); });
    el.otp.classList.remove("is-bad", "is-good");
    el.otpErr.textContent = "";
    el.otpEmail.textContent = email;
    showStep("otp");
    later(() => boxes[0].focus(), 120);
    startResend(60);
  }
  function startResend(sec) {
    clearInterval(resendIv); resendT = sec; el.otpResend.disabled = true;
    const tickR = () => {
      el.otpTimer.textContent = resendT > 0 ? `in ${resendT}s` : "";
      el.otpResend.disabled = resendT > 0;
      if (resendT-- <= 0) clearInterval(resendIv);
    };
    tickR(); resendIv = setInterval(tickR, 1000);
  }
  el.otpChange.addEventListener("click", () => { clearInterval(resendIv); showStep("email"); el.email.focus(); });
  el.otpResend.addEventListener("click", async () => {
    const c = client(); if (!c) return;
    el.otpResend.disabled = true;
    const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { el.otpErr.textContent = friendly(error); startResend(30); }
    else { el.otpErr.textContent = ""; S().play("whoosh", { volume: 0.5 }); startResend(60); }
  });
  let verifying = false;
  el.stepOtp.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (verifying) return;
    const token = code();
    if (token.length !== N) { el.otpErr.textContent = `Enter all ${N} digits.`; shake(); return; }
    const c = client(); if (!c) return;
    verifying = true; busy(el.otpBtn, true);
    try {
      const { data, error } = await c.auth.verifyOtp({ email, token, type: "email" });
      if (error || !data || !data.session) throw error || new Error("invalid code");
      el.otp.classList.add("is-good");
      clearInterval(resendIv);
      later(() => { showStep("done"); celebrate(); startDownload(); }, 350);
    } catch (err) {
      el.otp.classList.add("is-bad"); el.otpErr.textContent = friendly(err); shake();
      later(() => { boxes.forEach((b) => { b.value = ""; b.classList.remove("is-filled"); }); boxes[0].focus(); }, 500);
    } finally { verifying = false; busy(el.otpBtn, false); }
  });

  /* ---------- step 3: download ---------- */
  function celebrate() {
    S().play("win", { volume: 0.9 });
    confetti(140);
    const r = el.panel.getBoundingClientRect();
    petalBurst(r.left + r.width / 2, r.top + 40, 60, 1.1);
  }
  async function startDownload(p) {
    if (p) setPlatform(p);
    el.doneMsg.textContent = `Your ${PNAME[platform]} build is starting…`;
    const c = client();
    try {
      const { data } = c ? await c.auth.getSession() : { data: null };
      const session = data && data.session;
      if (!session) { showStep("email"); return; }
      const res = await fetch(`${cfg.downloadEndpoint}?platform=${platform}`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { await c.auth.signOut().catch(() => {}); showStep("email"); el.emailErr.textContent = "Your session expired — verify your email again."; return; }
      if (!res.ok || !body.url) {
        el.doneMsg.textContent = body.error === "build_not_ready"
          ? `The ${PNAME[platform]} build is being refuelled in the pits. Try again in a few minutes.`
          : "Couldn't start the download. Tap the button to try again.";
        return;
      }
      // Navigating to an attachment URL downloads in place — the page stays put.
      window.location.assign(body.url);
      el.doneMsg.innerHTML = `Your <b>${PNAME[platform]}</b> download has started. Check your downloads folder.`;
      S().play("rev", { volume: 0.6, delay: 0.3 });
    } catch (err) {
      el.doneMsg.textContent = "Network hiccup — tap the button to try again.";
    }
  }
  el.doneRetry.addEventListener("click", () => startDownload());
  el.doneOther.addEventListener("click", () => startDownload(platform === "mac" ? "windows" : "mac"));

  window.Launch = { open: openLaunch, close: closeLaunch };
})();
