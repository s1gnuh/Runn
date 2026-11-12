// Lõi dùng chung cho cả index.html (dashboard) và race.html (trang 1 giải):
// tiện ích ngày/giờ, store an toàn, pháo hoa canvas, toast.
window.Core = (function () {
  'use strict';

  /* ================= tiện ích ================= */
  var WD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d) { return d.getDate() + '/' + (d.getMonth() + 1); }
  function today0() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function fmtKm(x) { return (Math.round((Number(x) || 0) * 10) / 10).toString().replace('.', ','); }
  // Số với tối đa `d` chữ số thập phân (mặc định 2), cắt số 0 vô nghĩa ở cuối.
  function fmtNum(x, d) {
    var s = (Number(x) || 0).toFixed(d == null ? 2 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }
  function fmtDuration(secs) {
    var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    if (h === 0) return m + ' phút';
    return h + 'h ' + (m ? m + 'p' : '');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uid(prefix) { return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /* ================= store an toàn ================= */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    getJSON: function (k, fallback) {
      try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fallback : v; }
      catch (e) { return fallback; }
    },
    setJSON: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ================= toast ================= */
  function toast(title, sub) {
    var wrap = document.getElementById('toasts');
    if (!wrap) return;
    while (wrap.children.length > 1) wrap.removeChild(wrap.firstChild);
    var box = document.createElement('div');
    box.className = 'toast';
    box.innerHTML = '<strong>' + esc(title) + '</strong>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
    wrap.appendChild(box);
    function close() {
      box.classList.add('out');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 420);
    }
    var timer = setTimeout(close, 3600);
    box.addEventListener('click', function () { clearTimeout(timer); close(); });
  }

  /* ================= pháo hoa ăn mừng (canvas) ================= */
  var FX = (function () {
    var cvs = null, ctx = null, parts = [], raf = 0, w = 0, h = 0, dpr = 1, booted = false;
    var COLORS = ['#1366D6', '#FF7C1D', '#5B9DFF', '#FFC93C', '#FF5D8F', '#FFFFFF'];
    var TIER = {
      easy:      { spark: 26, conf: 16, ring: 1, rocket: 0, power: 4.2 },
      quality:   { spark: 38, conf: 26, ring: 1, rocket: 1, power: 5.0 },
      long:      { spark: 42, conf: 30, ring: 1, rocket: 1, power: 5.2 },
      week:      { spark: 58, conf: 44, ring: 2, rocket: 3, power: 6.0 },
      milestone: { spark: 68, conf: 58, ring: 2, rocket: 4, power: 6.4 },
      race:      { spark: 92, conf: 84, ring: 3, rocket: 6, power: 7.0 }
    };

    function reduced() {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    }
    function boot() {
      if (booted) return !!ctx;
      booted = true;
      cvs = document.getElementById('fx');
      if (!cvs || !cvs.getContext) return false;
      ctx = cvs.getContext('2d');
      if (!ctx) return false;
      resize();
      window.addEventListener('resize', resize);
      return true;
    }
    function resize() {
      if (!ctx) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
      cvs.style.width = w + 'px'; cvs.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }

    function spark(x, y, power) {
      var a = rnd(0, Math.PI * 2), sp = rnd(power * 0.25, power);
      return { k: 's', x: x, y: y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
               g: 0.085, drag: 0.975, delay: 0, life: 0, max: rnd(38, 70), c: pick(COLORS), r: rnd(1.4, 3) };
    }
    function conf(x, y, power) {
      var a = rnd(0, Math.PI * 2), sp = rnd(power * 0.3, power * 0.9);
      return { k: 'c', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4,
               g: 0.14, drag: 0.985, delay: 0, life: 0, max: rnd(70, 125), c: pick(COLORS),
               bw: rnd(5, 9), bh: rnd(8, 14), rot: rnd(0, Math.PI), vr: rnd(-0.22, 0.22), sway: rnd(0.02, 0.06), ph: rnd(0, 6) };
    }
    function ring(x, y, delay) {
      return { k: 'r', x: x, y: y, delay: delay || 0, life: 0, max: 26, c: pick(COLORS), r: 6, vr: 4.4 };
    }
    function rocket(power, delay) {
      var x = rnd(w * 0.15, w * 0.85);
      return { k: 'k', x: x, y: h + 10, px: x, py: h + 10, vx: rnd(-0.7, 0.7), vy: -rnd(9.5, 13.5),
               g: 0.16, drag: 0.995, delay: delay || 0, life: 0, max: rnd(32, 50), c: pick(COLORS), r: 2.2, power: power };
    }
    function explode(into, x, y, power, n) {
      for (var i = 0; i < n; i++) into.push(spark(x, y, power));
      into.push(ring(x, y, 0));
    }

    function tick() {
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      var next = [], i, p;
      for (i = 0; i < parts.length; i++) {
        p = parts[i];
        if (p.delay > 0) { p.delay--; next.push(p); continue; }
        p.life++;
        var t = p.life / p.max;
        var fade = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;

        if (p.k === 's' || p.k === 'k') {
          p.px = p.x; p.py = p.y;
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
          p.x += p.vx; p.y += p.vy;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.c; ctx.lineWidth = p.r; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else if (p.k === 'c') {
          p.ph += p.sway;
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
          p.x += p.vx + Math.cos(p.ph) * 0.9; p.y += p.vy;
          p.rot += p.vr;
          ctx.globalAlpha = fade;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.bw / 2, -p.bh / 2, p.bw, Math.max(1, p.bh * Math.abs(Math.cos(p.ph))));
          ctx.restore();
        } else {
          p.r += p.vr; p.vr *= 0.93;
          ctx.globalAlpha = Math.max(0, 1 - t) * 0.6;
          ctx.strokeStyle = p.c; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        }

        var spent = p.life >= p.max;
        if (!spent && p.y < h + 90) next.push(p);
        else if (spent && p.k === 'k') explode(next, p.x, p.y, p.power, 26);
      }
      ctx.globalAlpha = 1;
      parts = next;
      if (parts.length) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    }

    return {
      party: function (tier, el) {
        if (reduced() || !boot()) return;
        var cfg = TIER[tier] || TIER.easy;
        var x = w / 2, y = h * 0.4, r, i;
        if (el && el.getBoundingClientRect) {
          r = el.getBoundingClientRect();
          if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
        }
        for (i = 0; i < cfg.spark; i++) parts.push(spark(x, y, cfg.power));
        for (i = 0; i < cfg.conf; i++) parts.push(conf(x, y, cfg.power));
        for (i = 0; i < cfg.ring; i++) parts.push(ring(x, y, i * 7));
        for (i = 0; i < cfg.rocket; i++) parts.push(rocket(cfg.power, 8 + i * 13));
        if (parts.length > 1000) parts = parts.slice(parts.length - 1000);
        if (!raf) raf = requestAnimationFrame(tick);
      }
    };
  })();

  /* ================= nguyên tắc tập (chung cho mọi giải) ================= */
  var TRAINING_RULES = [
    'Khoảng 80% số buổi chạy ở pace nhẹ. Buổi chất lượng chỉ tốt khi hai buổi nhẹ đủ chậm để chân còn khỏe.',
    'Khối lượng tăng không quá 10% mỗi tuần. Các tuần giảm tải trong giáo án là có chủ ý.',
    'Đi bộ dài tính là buổi nhẹ. Không xếp ngay trước buổi chất lượng.',
    'Đau gân hoặc đau khớp quá 2–3 ngày thì bỏ buổi chất lượng tuần đó và chạy nhẹ lại. Bỏ một buổi không ảnh hưởng kết quả, chấn thương kéo dài thì có.',
    'Nếu bận, bỏ buổi chạy nhẹ chứ giữ buổi chất lượng và buổi dài.'
  ];

  var LABEL = { easy: 'Nhẹ', quality: 'Chất lượng', long: 'Dài', race: 'Thi đấu', rest: 'Nghỉ' };

  /* ================= khoá hướng màn hình ================= */
  // App chỉ thiết kế cho chiều dọc (xem "orientation" trong manifest.json).
  // screen.orientation.lock chỉ được hầu hết trình duyệt cho phép khi app chạy
  // như PWA đã cài (display-mode: standalone/fullscreen) — mở trong tab thường
  // hay trên iOS thì luôn bị từ chối, nên thất bại là bình thường, bỏ qua lặng lẽ.
  // Lớp phủ CSS .orient-lock (style.css) là lưới chắn cho mọi trường hợp còn lại.
  function lockOrientation() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(function () {});
      }
    } catch (e) {}
  }

  /* ================= service worker ================= */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.update().catch(function () {});
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) reg.update().catch(function () {});
        });
      }).catch(function () {});
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded) return;
        reloaded = true;
        toast('Đã có bản mới', 'Đang tải lại trang...');
        setTimeout(function () { window.location.reload(); }, 1200);
      });
    });
  }

  return {
    WD: WD, LABEL: LABEL, TRAINING_RULES: TRAINING_RULES,
    pad: pad, iso: iso, fromIso: fromIso, fmt: fmt, today0: today0, addDays: addDays,
    fmtKm: fmtKm, fmtNum: fmtNum, fmtDuration: fmtDuration, esc: esc, uid: uid, qs: qs,
    store: store, toast: toast, FX: FX, registerSW: registerSW, lockOrientation: lockOrientation
  };
})();
