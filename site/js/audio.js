/* Blossom Rally — sound engine
   - ElevenLabs-generated samples for the big moments (drift, rev, whoosh, win, idle loop)
   - WebAudio synth for things that must react live (engine rpm, tyre screech, beeps) */
(function () {
  const FILES = {
    drift: "/assets/sfx/drift.mp3",
    rev: "/assets/sfx/rev.mp3",
    whoosh: "/assets/sfx/whoosh.mp3",
    win: "/assets/sfx/win.mp3",
    idle: "/assets/sfx/idle.mp3",
  };
  const raw = {};      // ArrayBuffers fetched early
  const buffers = {};  // decoded AudioBuffers
  let ctx = null, master = null, noiseBuf = null;
  let enabled = false;
  const listeners = new Set();

  function readPref() { try { return localStorage.getItem("br_sound"); } catch (e) { return null; } }
  function writePref(v) { try { localStorage.setItem("br_sound", v ? "1" : "0"); } catch (e) {} }

  function prefetch(onProgress) {
    const names = Object.keys(FILES);
    let done = 0;
    return Promise.all(names.map((n) =>
      fetch(FILES[n]).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null).then((ab) => {
        if (ab) raw[n] = ab;
        done++; onProgress && onProgress(done / names.length);
      })
    ));
  }

  function ensureCtx() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // white noise buffer for screech / smoke
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    decodeAll();
    return ctx;
  }

  function decodeAll() {
    Object.keys(raw).forEach((n) => {
      if (buffers[n] || !raw[n]) return;
      const copy = raw[n].slice(0);
      ctx.decodeAudioData(copy, (b) => { buffers[n] = b; }, () => {});
    });
  }

  function setEnabled(v) {
    enabled = !!v; writePref(enabled);
    if (enabled) ensureCtx();
    if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.05);
    listeners.forEach((fn) => fn(enabled));
  }

  function play(name, opts = {}) {
    if (!enabled || !ensureCtx()) return null;
    const b = buffers[name];
    if (!b) { if (raw[name]) decodeAll(); return null; }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = opts.rate || 1;
    src.loop = !!opts.loop;
    const g = ctx.createGain();
    g.gain.value = opts.volume == null ? 1 : opts.volume;
    src.connect(g).connect(master);
    src.start(ctx.currentTime + (opts.delay || 0));
    return {
      src, gain: g,
      stop(fade = 0.15) {
        try {
          g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
          src.stop(ctx.currentTime + fade + 0.05);
        } catch (e) {}
      },
    };
  }

  function beep(freq = 880, dur = 0.18, type = "square", vol = 0.18, when = 0) {
    if (!enabled || !ensureCtx()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function tick(step = 0) { beep(520 + step * 90, 0.06, "triangle", 0.12); }

  // ---- synth engine: two detuned saws + square sub through a lowpass ----
  function createEngine(level = 0.22) {
    if (!ensureCtx()) return null;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const o1 = ctx.createOscillator(); o1.type = "sawtooth";
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.detune.value = 14;
    const o3 = ctx.createOscillator(); o3.type = "square";
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    // amplitude flutter = firing pulses
    const lfo = ctx.createOscillator(); lfo.type = "square";
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    const pulse = ctx.createGain(); pulse.gain.value = 0.75;
    lfo.connect(lfoG).connect(pulse.gain);
    o1.connect(lp); o2.connect(lp); o3.connect(g3).connect(lp);
    lp.connect(shaper).connect(pulse).connect(out).connect(master);
    [o1, o2, o3, lfo].forEach((o) => o.start());
    let alive = true;
    const api = {
      setRpm(rpm, load = 0.6) {
        if (!alive) return;
        const t = ctx.currentTime;
        const f = 18 + (rpm / 60) * 2; // 4-cyl firing frequency
        o1.frequency.setTargetAtTime(f, t, 0.03);
        o2.frequency.setTargetAtTime(f * 1.005, t, 0.03);
        o3.frequency.setTargetAtTime(f / 2, t, 0.03);
        lfo.frequency.setTargetAtTime(f / 4, t, 0.03);
        lp.frequency.setTargetAtTime(220 + f * (4 + load * 6), t, 0.04);
        out.gain.setTargetAtTime(enabled ? level * (0.45 + load * 0.55) : 0, t, 0.05);
      },
      stop() {
        if (!alive) return; alive = false;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        setTimeout(() => { [o1, o2, o3, lfo].forEach((o) => { try { o.stop(); } catch (e) {} }); out.disconnect(); }, 600);
      },
    };
    return api;
  }

  // ---- tyre screech: band-passed noise with wobble ----
  function createScreech(level = 0.35) {
    if (!ensureCtx()) return null;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 9;
    const bp2 = ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 3100; bp2.Q.value = 12;
    const g = ctx.createGain(); g.gain.value = 0;
    const wob = ctx.createOscillator(); wob.frequency.value = 7;
    const wobG = ctx.createGain(); wobG.gain.value = 160;
    wob.connect(wobG).connect(bp.frequency);
    src.connect(bp).connect(g); src.connect(bp2).connect(g);
    g.connect(master);
    src.start(); wob.start();
    let alive = true;
    return {
      set(x) {
        if (!alive) return;
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(enabled ? Math.max(0, Math.min(1, x)) * level : 0, t, 0.05);
        bp.frequency.setTargetAtTime(1700 + x * 700, t, 0.1);
      },
      stop() {
        if (!alive) return; alive = false;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => { try { src.stop(); wob.stop(); } catch (e) {} g.disconnect(); }, 400);
      },
    };
  }

  // noise burst (impact / blow-off)
  function burst(dur = 0.3, freq = 900, vol = 0.3) {
    if (!enabled || !ensureCtx()) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 3, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  window.SFX = {
    prefetch, ensureCtx, play, beep, tick, burst, createEngine, createScreech,
    setEnabled,
    toggle() { setEnabled(!enabled); return enabled; },
    get enabled() { return enabled; },
    get pref() { return readPref(); },
    onChange(fn) { listeners.add(fn); },
  };
})();
