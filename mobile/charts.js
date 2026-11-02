/*
 * Driving charts: live line charts of the engine-side steering and the car's grip, drawn over
 * the game while driving (Tune "Charts · show" / the chart pill). Loaded by mobile.js, which
 * pushes one sample per frame (gta2_port_steer_debug, port/platform/steer_web.cpp).
 *
 * The x axis is *time in motion*: it advances only while the car moves, so the charts freeze
 * when you stop and stay readable; the last 8 s of motion are kept, "now" at the right edge.
 * Two panels, each with its own series scaled independently (auto-range over the window, or a
 * fixed range) and light bands for on/off states (steering key held, front / rear wheels
 * skidding):
 *   steer: heading error (°), yaw rate ω (°/tick), lock = key × wheel-angle scale (−1..1),
 *          road assist correction (°/tick) — band: steering key held
 *   grip:  slip angle (°, velocity direction − heading), lateral speed (blocks/tick), speed
 *          (blocks/tick), gas pedal (0..5) — bands: front skid, rear skid (≥ threshold)
 * The plot is at 20 % opacity so it never hides the road; the labels (name + current value,
 * right of each panel) are brighter.
 */
(() => {
  'use strict';
  const WINDOW_MS = 8000; // of motion
  const PANELS = [
    { name: 'steer',
      series: [
        { k: 'error', label: 'err', unit: '°', color: '#ffc400', signed: true, floor: 5, dp: 1 },
        { k: 'omega', label: 'ω', unit: '°/t', color: '#4fd3ff', signed: true, floor: 1, dp: 2 },
        { k: 'lock', label: 'lock', unit: '', color: '#ffffff', signed: true, fixed: 1, dp: 2 },
        { k: 'assist', label: 'snap', unit: '°/t', color: '#ff5ad6', signed: true, floor: 1, dp: 2 },
      ],
      bands: [{ k: 'key', label: 'key', color: 'rgba(255, 196, 0, 0.35)', on: (v) => v !== 0 }] },
    { name: 'grip',
      series: [
        { k: 'slip', label: 'slip', unit: '°', color: '#ff8c3a', signed: true, floor: 5, dp: 1 },
        { k: 'lat', label: 'lat', unit: 'b/t', color: '#4fd3ff', signed: true, floor: 0.05, dp: 3 },
        { k: 'speed', label: 'speed', unit: 'b/t', color: '#6cff7a', signed: false, floor: 0.1, dp: 3 },
        { k: 'pedal', label: 'pedal', unit: '', color: '#ffffff', signed: false, fixed: 5, dp: 2 },
      ],
      bands: [
        { k: 'skidF', label: 'skid F', color: 'rgba(255, 80, 80, 0.45)', on: (v) => v >= 1 },
        { k: 'skidR', label: 'skid R', color: 'rgba(80, 140, 255, 0.45)', on: (v) => v >= 1 },
      ] },
  ];
  const LABEL_W = 92; // px kept free on the right of each panel for the labels
  const PAD = 6;

  let wrap = null, plot = null, text = null, pc = null, tc = null;
  const buf = []; // samples in motion: { tm, ...values }
  let tm = 0; // time in motion (ms)
  let lastNow = 0;
  let last = null; // latest sample (moving or not), for the labels

  function mount(root) {
    wrap = document.createElement('div');
    wrap.id = 'gtaCharts';
    wrap.hidden = true;
    plot = document.createElement('canvas');
    plot.className = 'gta-charts-plot';
    text = document.createElement('canvas');
    text.className = 'gta-charts-text';
    wrap.append(plot, text);
    root.appendChild(wrap);
    pc = plot.getContext('2d');
    tc = text.getContext('2d');
  }

  function show(on, root) {
    if (!wrap && on) mount(root);
    if (!wrap) return;
    if (wrap.hidden === !on) return;
    wrap.hidden = !on;
    if (!on) lastNow = 0;
  }

  // Canvas backing size follows the layout size (clientWidth/Height: valid under the forced
  // rotation too, unlike getBoundingClientRect) × devicePixelRatio.
  function fit(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [c.clientWidth, c.clientHeight, dpr];
  }

  function push(s) {
    if (!wrap || wrap.hidden) return;
    const now = performance.now();
    const dt = lastNow ? Math.min(50, now - lastNow) : 0;
    lastNow = now;
    last = s;
    if (s.speed > 0) {
      tm += dt;
      buf.push({ tm, ...s });
      while (buf.length && buf[0].tm < tm - WINDOW_MS) buf.shift();
    }
    draw();
  }

  function fmt(v, dp) {
    const s = v.toFixed(dp);
    return s.startsWith('-') ? s : ` ${s}`;
  }

  function draw() {
    const [w, h, dpr] = fit(plot);
    fit(text);
    pc.setTransform(dpr, 0, 0, dpr, 0, 0);
    tc.setTransform(dpr, 0, 0, dpr, 0, 0);
    pc.clearRect(0, 0, w, h);
    tc.clearRect(0, 0, w, h);
    const n = PANELS.length;
    const ph = h / n;
    const pw = w - LABEL_W;
    const xOf = (t) => pw - ((tm - t) / WINDOW_MS) * pw;
    tc.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
    tc.textBaseline = 'top';
    for (let i = 0; i < n; i++) {
      const P = PANELS[i];
      const y0 = i * ph + PAD, y1 = (i + 1) * ph - PAD, hh = y1 - y0;
      // frame, baseline (signed series read around the middle) and one tick per second of motion
      pc.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      pc.lineWidth = 1;
      pc.strokeRect(0.5, y0 + 0.5, pw - 1, hh - 1);
      pc.beginPath();
      pc.moveTo(0, Math.round(y0 + hh / 2) + 0.5); pc.lineTo(pw, Math.round(y0 + hh / 2) + 0.5);
      for (let t = Math.ceil((tm - WINDOW_MS) / 1000) * 1000; t <= tm; t += 1000) {
        const x = Math.round(xOf(t)) + 0.5;
        pc.moveTo(x, y1 - 4); pc.lineTo(x, y1);
      }
      pc.stroke();
      // bands: one horizontal stripe per band, filled where the state is on
      const bh = hh / P.bands.length;
      P.bands.forEach((b, bi) => {
        pc.fillStyle = b.color;
        let start = -1;
        for (let j = 0; j <= buf.length; j++) {
          const on = j < buf.length && b.on(buf[j][b.k]);
          if (on && start < 0) start = j;
          if (!on && start >= 0) {
            const xa = xOf(buf[start].tm), xb = xOf(buf[j - 1].tm);
            pc.fillRect(xa, y0 + bi * bh, Math.max(1, xb - xa), bh);
            start = -1;
          }
        }
      });
      // series: each on its own scale (auto-range over the window, floor, or a fixed range)
      P.series.forEach((S, si) => {
        let range = S.fixed;
        if (!range) {
          range = S.floor;
          for (const s of buf) { const a = Math.abs(s[S.k]); if (a > range) range = a; }
        }
        const yOf = S.signed
          ? (v) => y0 + hh / 2 - (v / range) * (hh / 2 - 2)
          : (v) => y1 - 2 - (v / range) * (hh - 4);
        pc.strokeStyle = S.color;
        pc.lineWidth = 1.5;
        pc.beginPath();
        buf.forEach((s, j) => { const x = xOf(s.tm), y = yOf(Math.max(-range, Math.min(range, s[S.k]))); j ? pc.lineTo(x, y) : pc.moveTo(x, y); });
        pc.stroke();
        // label: name, current value, unit, and the scale in use
        const cur = last ? last[S.k] : 0;
        tc.fillStyle = S.color;
        tc.fillText(`${S.label}${fmt(cur, S.dp)}${S.unit}`, pw + 4, y0 + 2 + si * 12);
      });
      tc.fillStyle = 'rgba(255, 255, 255, 0.8)';
      P.bands.forEach((b, bi) => {
        const on = last && b.on(last[b.k]);
        tc.fillStyle = on ? b.color.replace(/[\d.]+\)$/, '1)') : 'rgba(255, 255, 255, 0.45)';
        tc.fillText(b.label, pw + 4, y0 + 2 + (P.series.length + bi) * 12);
      });
    }
  }

  window.gtaDrivingCharts = { show, push, get buffer() { return buf; }, get motionMs() { return tm; } };
})();
