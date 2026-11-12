// Nhật ký chạy: IndexedDB "bn-runs", kho duy nhất cho mọi lần chạy — có
// thể gắn vào 1 buổi tập của 1 block (sessionId/blockId), gắn vào 1 giải
// (raceId) mà không cần buổi tập cụ thể, hoặc đứng tự do (chạy tự phát).
// Đồng thời tính PR theo cự ly và streak từ chính nhật ký này.
window.RunLog = (function (Core) {
  'use strict';
  var DB_NAME = 'bn-runs', STORE = 'runs';
  var KIND = { run: 'Chạy', walk: 'Đi bộ', other: 'Khác' };
  var PR_BUCKETS = [
    { key: '5', label: '5K', km: 5 }, { key: '10', label: '10K', km: 10 },
    { key: '21', label: 'Half', km: 21.1 }, { key: '42', label: 'Full', km: 42.2 }
  ];

  var idbp = null;
  function openDB() {
    if (idbp) return idbp;
    idbp = new Promise(function (res) {
      try {
        var r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
        r.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return idbp;
  }
  function idbRun(mode, fn) {
    return openDB().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
          tx.oncomplete = function () { res(req && req.result !== undefined ? req.result : true); };
          tx.onerror = tx.onabort = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }

  function hydrate(r) {
    return { id: r.id, blob: r.blob, url: r.blob ? URL.createObjectURL(r.blob) : '',
             date: r.date || '', km: r.km || '', pace: r.pace || '', time: r.time || '',
             title: r.title || '', kind: r.kind || 'run', cat: r.cat === 'photo' ? 'photo' : 'strava',
             blockId: r.blockId || '', sessionId: r.sessionId || '', raceId: r.raceId || '',
             note: r.note || '', added: r.added || 0, shoeId: r.shoeId || '',
             msg: '', busy: false, zoom: false, armed: false, saved: 0, expanded: false };
  }
  function record(l) {
    return { id: l.id, blob: l.blob, date: l.date, km: l.km, pace: l.pace, time: l.time, title: l.title,
             kind: l.kind, cat: l.cat, blockId: l.blockId, sessionId: l.sessionId, raceId: l.raceId,
             note: l.note, added: l.added, shoeId: l.shoeId || '' };
  }

  function saveRun(l) { return idbRun('readwrite', function (st) { return st.put(record(l)); }); }
  function removeRun(id) { return idbRun('readwrite', function (st) { return st.delete(id); }); }
  function loadRuns() {
    return idbRun('readonly', function (st) { return st.getAll(); }).then(function (rows) {
      // Bản ghi nhập tay không có ảnh (blob rỗng) vẫn là một buổi chạy hợp lệ.
      return Array.isArray(rows) ? rows.filter(function (r) { return r && r.id; }).map(hydrate) : [];
    });
  }

  function shrink(file) {
    return new Promise(function (res) {
      try {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var sc = Math.min(1, 1400 / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.88);
        };
        img.onerror = function () { URL.revokeObjectURL(url); res(file); };
        img.src = url;
      } catch (e) { res(file); }
    });
  }

  function newRun(opts) {
    return hydrate({ id: Core.uid('r'), blob: opts.blob || null, kind: 'run', cat: opts.cat || 'strava',
                      blockId: opts.blockId || '', raceId: opts.raceId || '', added: Date.now() });
  }

  /* ---------- gắn tự động vào buổi tập theo ngày ---------- */
  // candidateSessions: [{id, blockId, date(Date), type}] gom từ (các) block
  // đang xét. Ảnh "photo" chỉ gắn vào buổi, không tự đánh dấu đã chạy.
  function autoLink(run, candidateSessions) {
    if (run.sessionId || !run.date) return null;
    var hit = candidateSessions.filter(function (x) { return x.type !== 'rest' && Core.iso(x.date) === run.date; })[0];
    if (!hit) return null;
    run.sessionId = hit.id;
    run.blockId = hit.blockId;
    return hit;
  }

  /* ---------- thời gian: "m:ss" / "h:mm:ss" <-> giây ---------- */
  function parseTime(s) {
    if (!s) return 0;
    var p = String(s).split(':').map(Number);
    if (p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
  }
  function formatTime(sec) {
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + Core.pad(m) : m) + ':' + Core.pad(s);
  }

  /* ---------- PR theo cự ly ---------- */
  function computePRs(runs) {
    var best = {};
    runs.forEach(function (r) {
      var km = Number(r.km), sec = parseTime(r.time);
      if (r.kind !== 'run' || !(km > 0) || !sec) return;
      var bucket = PR_BUCKETS.filter(function (b) { return Math.abs(km - b.km) / b.km <= 0.05; })[0];
      if (!bucket) return;
      if (!best[bucket.key] || sec < best[bucket.key].timeSeconds) {
        best[bucket.key] = { label: bucket.label, timeSeconds: sec, date: r.date, runId: r.id, km: km };
      }
    });
    return best;
  }

  /* ---------- streak ngày liên tục ---------- */
  function computeStreak(runs) {
    var days = {};
    runs.forEach(function (r) { if (r.kind !== 'walk' && Number(r.km) > 0 && r.date) days[r.date] = 1; });
    var cur = Core.today0();
    if (!days[Core.iso(cur)]) cur = Core.addDays(cur, -1);
    var n = 0;
    while (days[Core.iso(cur)]) { n++; cur = Core.addDays(cur, -1); }
    return n;
  }

  /* ---------- tổng km theo khoảng ngày ---------- */
  function kmBetween(runs, from, to) {
    return runs.reduce(function (a, r) {
      if (r.kind === 'walk') return a;
      var d = r.date ? Core.fromIso(r.date) : null;
      if (d && d >= from && d <= to) a += Number(r.km) || 0;
      return a;
    }, 0);
  }
  function thisWeekRange(t0) {
    var off = (t0.getDay() + 6) % 7; // Thứ 2 là đầu tuần
    var start = Core.addDays(t0, -off);
    return { start: start, end: Core.addDays(start, 6) };
  }
  function weeklyKmSeries(runs, weeksBack) {
    var t0 = Core.today0(), wk = thisWeekRange(t0), out = [];
    for (var i = weeksBack - 1; i >= 0; i--) {
      var start = Core.addDays(wk.start, -7 * i), end = Core.addDays(start, 6);
      out.push({ start: start, end: end, km: kmBetween(runs, start, end) });
    }
    return out;
  }

  function totalTimeSecs(runs) {
    return runs.reduce(function (a, r) {
      return a + parseTime(r.time);
    }, 0);
  }

  return {
    KIND: KIND, PR_BUCKETS: PR_BUCKETS,
    openDB: openDB, saveRun: saveRun, removeRun: removeRun, loadRuns: loadRuns,
    shrink: shrink, newRun: newRun, hydrate: hydrate, autoLink: autoLink,
    parseTime: parseTime, formatTime: formatTime,
    computePRs: computePRs, computeStreak: computeStreak,
    kmBetween: kmBetween, thisWeekRange: thisWeekRange, weeklyKmSeries: weeklyKmSeries,
    totalTimeSecs: totalTimeSecs
  };
})(window.Core);
