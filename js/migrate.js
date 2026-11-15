// Chạy một lần duy nhất: đọc dữ liệu kiểu cũ (bn27-*, IndexedDB bn27-strava
// chỉ-có-một-giáo-án) và dựng thành template + block + race + nhật ký chạy
// theo mô hình mới. KHÔNG xoá dữ liệu cũ — chỉ đọc, giữ nguyên làm dự phòng.
window.Migrate = (function (Core, Templates, Blocks, Races, RunLog) {
  'use strict';
  var FLAG = 'app-migrated-v2';
  var BLOCK_ID = 'giai-10k-dau-tien';
  var RACE_ID = 'giai-10k-dau-tien';
  var OLD_DB = 'bn27-strava';

  function hasOldData() {
    return !!Core.store.get('bn27-done') || !!Core.store.get('bn27-sched');
  }

  function openOldDB() {
    return new Promise(function (res) {
      try {
        var r = indexedDB.open(OLD_DB, 1);
        r.onupgradeneeded = function () { try { r.result.createObjectStore('logs', { keyPath: 'id' }); } catch (e) {} };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function readOldLogs() {
    return openOldDB().then(function (db) {
      if (!db) return [];
      return new Promise(function (res) {
        try {
          var tx = db.transaction('logs', 'readonly');
          var req = tx.objectStore('logs').getAll();
          tx.oncomplete = function () { res(Array.isArray(req.result) ? req.result : []); };
          tx.onerror = tx.onabort = function () { res([]); };
        } catch (e) { res([]); }
      });
    });
  }

  function okOff(n) { return typeof n === 'number' && n >= 0 && n <= 6 && n === Math.floor(n); }

  function run() {
    if (Core.store.get(FLAG)) return Promise.resolve(false);
    if (!hasOldData()) { Core.store.set(FLAG, '1'); return Promise.resolve(false); }

    // 1) Template: khuôn 12 tuần đã có sẵn trong Templates (periodized-12w),
    //    là chính khuôn chu kỳ 12 tuần cổ điển — không cần trích xuất lại.
    var tpl = Templates.get(Templates.PERIODIZED_12W_ID);

    // 2) Block: gói sched/done/notes/mode cũ thành 1 block cố định ngày
    //    19/10/2026, giữ nguyên để lịch các buổi không bị xê dịch.
    var oldDone = Core.store.getJSON('bn27-done', {});
    var oldNotes = Core.store.getJSON('bn27-notes', {});
    var oldSched = Core.store.getJSON('bn27-sched', null);
    var oldMode = Core.store.get('bn27-mode') === '3' ? 3 : 4;

    var block = {
      id: BLOCK_ID, raceId: RACE_ID, templateId: tpl.id, startDate: '2026-10-19', mode: oldMode,
      schedDef: (oldSched && Array.isArray(oldSched.def) && oldSched.def.length === 4)
        ? oldSched.def.map(function (n, i) { return okOff(n) ? n : tpl.days[i].def; })
        : tpl.days.map(function (d) { return d.def; }),
      schedWk: (oldSched && oldSched.wk && typeof oldSched.wk === 'object') ? oldSched.wk : {},
      done: (oldDone && typeof oldDone === 'object') ? oldDone : {},
      notes: (oldNotes && typeof oldNotes === 'object') ? oldNotes : {},
      raceTitle: 'Giải 10K đầu tiên, 10 km',
      raceDesc: 'Km 1–2 @ 7:00, km 3–8 @ 6:50, km 9–10 tăng tốc nếu còn sức.',
      raceKm: 10
    };
    Blocks.save(block);

    // 3) Race: giải 10K của giáo án cũ, liên kết block ở trên.
    var race = Races.create({
      id: RACE_ID, name: 'Giải 10K đầu tiên', date: '2027-01-10', distanceKm: 10,
      targetA: '68–70 phút', targetB: 'dưới 75 phút', targetC: 'hoàn thành và vẫn chạy được đến vạch đích',
      paceZones: [
        { label: 'Chạy nhẹ', type: 'easy', pace: '7:40–8:30', note: 'Nói được cả câu.' },
        { label: 'Chạy dài', type: 'long', pace: '7:30–8:00', note: 'Đều và thoải mái, không cần nhanh.' },
        { label: 'Tempo', type: 'quality', pace: '6:50–6:55', note: 'Gắt nhưng giữ được, nói từng cụm ngắn.' },
        { label: 'Interval', type: 'quality', pace: '6:35–6:40', note: 'Từng đoạn 1–2 km, nghỉ 2 phút giữa các đoạn.' },
        { label: 'Nước rút', type: 'quality', pace: '20 giây', note: 'Từ tuần 3, cuối các buổi chạy nhẹ.' }
      ],
      raceDayPlan: 'Km 1–2 @ 7:00, km 3–8 @ 6:50, km 9–10 tăng tốc nếu còn sức.',
      blockId: BLOCK_ID
    });
    Races.save(race);

    // 4) Nhật ký chạy: copy ảnh/số liệu từ IndexedDB cũ sang kho mới, gắn
    //    blockId/raceId cho mọi bản ghi vì trước đây tất cả đều thuộc giáo án duy nhất đó.
    return readOldLogs().then(function (rows) {
      var jobs = rows.filter(function (r) { return r && r.blob; }).map(function (r) {
        var run = RunLog.hydrate(r);
        run.blockId = BLOCK_ID;
        run.raceId = RACE_ID;
        run.sessionId = r.link || '';
        delete run.url; // url tạo lại khi hydrate lúc load, không cần giữ ở record lưu
        return RunLog.saveRun(run);
      });
      return Promise.all(jobs);
    }).then(function () {
      Core.store.set(FLAG, '1');
      return true;
    });
  }

  return { run: run, FLAG: FLAG, BLOCK_ID: BLOCK_ID, RACE_ID: RACE_ID };
})(window.Core, window.Templates, window.Blocks, window.Races, window.RunLog);
