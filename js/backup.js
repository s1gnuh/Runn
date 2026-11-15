// Sao lưu & khôi phục toàn bộ dữ liệu vào/từ một file JSON duy nhất.
// Dữ liệu nằm ở hai nơi: localStorage (giải, giáo án, buổi đã đánh dấu, ghi
// chú, mục tiêu, cài đặt nhắc) và IndexedDB (nhật ký chạy kèm ảnh). Ảnh được
// mã hoá base64 nhúng thẳng vào file để chỉ phải giữ đúng một tệp.
window.Backup = (function (Core, RunLog) {
  'use strict';
  var APP_ID = 'runn-nhat-ky-chay';
  var VERSION = 1;

  // Chỉ xuất/nhận đúng những khoá của app, không đụng tới thứ khác trong
  // localStorage của cùng tên miền.
  var LOCAL_KEYS = [
    'app-races', 'app-blocks', 'app-templates', 'app-goals', 'app-shoes', 'app-shoe-def',
    'bn27-notify', 'app-theme', 'app-migrated-v2', 'app-wx',
    'bn27-done', 'bn27-notes', 'bn27-sched', 'bn27-mode'
  ];

  function blobToDataUrl(blob) {
    return new Promise(function (res) {
      try {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result)); };
        fr.onerror = function () { res(''); };
        fr.readAsDataURL(blob);
      } catch (e) { res(''); }
    });
  }
  function dataUrlToBlob(url) {
    return fetch(url).then(function (r) { return r.blob(); }).catch(function () { return null; });
  }

  /* ================= gói dữ liệu ================= */
  function build(onProgress) {
    var local = {};
    LOCAL_KEYS.forEach(function (k) {
      var v = Core.store.get(k);
      if (v != null) local[k] = v;
    });

    return RunLog.loadRuns().then(function (runs) {
      var out = [], i = 0;
      // Làm tuần tự: nhiều ảnh mà đổi base64 song song thì rất dễ tràn bộ nhớ
      // trên điện thoại.
      return runs.reduce(function (p, r) {
        return p.then(function () {
          var rec = {
            id: r.id, date: r.date, km: r.km, pace: r.pace, time: r.time, title: r.title,
            kind: r.kind, cat: r.cat, blockId: r.blockId, sessionId: r.sessionId,
            raceId: r.raceId, note: r.note, added: r.added, shoeId: r.shoeId, wx: r.wx || null
          };
          if (r.url) { try { URL.revokeObjectURL(r.url); } catch (e) {} }
          if (onProgress) onProgress(++i, runs.length);
          if (!r.blob) { out.push(rec); return null; }
          return blobToDataUrl(r.blob).then(function (d) {
            if (d) rec.photo = d;
            out.push(rec);
          });
        });
      }, Promise.resolve()).then(function () {
        return {
          app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(),
          local: local, runs: out
        };
      });
    });
  }

  function fileName() {
    var d = new Date();
    return 'runn-backup-' + d.getFullYear() + '-' + Core.pad(d.getMonth() + 1) + '-' + Core.pad(d.getDate()) + '.json';
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 10000);
    return 'downloaded';
  }

  // Trên iPhone, app chạy ở chế độ standalone thường không tải được file bằng
  // thẻ <a download>; bảng chia sẻ của hệ điều hành có mục "Lưu vào Tệp" nên
  // dùng được. Máy nào không hỗ trợ thì quay về cách tải thường.
  function save(blob, name) {
    var file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name })
        .then(function () { return 'shared'; })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return 'cancelled';
          return download(blob, name);
        });
    }
    return Promise.resolve(download(blob, name));
  }

  function exportAll(onProgress) {
    return build(onProgress).then(function (data) {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var name = fileName();
      return save(blob, name).then(function (how) {
        return { how: how, name: name, bytes: blob.size, runs: data.runs.length };
      });
    });
  }

  /* ================= đọc & khôi phục ================= */
  function parse(text) {
    var data = JSON.parse(text);
    if (!data || data.app !== APP_ID || !data.local) {
      var err = new Error('bad_file');
      err.code = 'bad_file';
      throw err;
    }
    return data;
  }

  function summary(data) {
    var races = 0, blocks = 0, done = 0, goals = 0;
    try { races = Object.keys(JSON.parse(data.local['app-races'] || '{}')).length; } catch (e) {}
    try {
      var bs = JSON.parse(data.local['app-blocks'] || '{}');
      Object.keys(bs).forEach(function (k) {
        blocks++;
        done += Object.keys((bs[k] && bs[k].done) || {}).length;
      });
    } catch (e) {}
    try { goals = (JSON.parse(data.local['app-goals'] || '[]') || []).length; } catch (e) {}
    var runs = data.runs || [];
    return {
      races: races, blocks: blocks, done: done, goals: goals,
      runs: runs.length,
      photos: runs.filter(function (r) { return !!r.photo; }).length,
      manual: runs.filter(function (r) { return !r.photo; }).length,
      exportedAt: data.exportedAt
    };
  }

  // Gộp vào dữ liệu hiện có: mục nào trùng id thì lấy theo file, mục nào chỉ
  // có trên máy thì giữ nguyên. Nhờ vậy khôi phục nhầm cũng không mất gì.
  function apply(data) {
    Object.keys(data.local).forEach(function (k) {
      if (LOCAL_KEYS.indexOf(k) < 0) return;
      Core.store.set(k, data.local[k]);
    });

    var runs = data.runs || [];
    return runs.reduce(function (p, r) {
      return p.then(function () {
        if (!r || !r.id) return null;
        // Bản ghi nhập tay không có ảnh vẫn khôi phục bình thường (blob rỗng).
        return (r.photo ? dataUrlToBlob(r.photo) : Promise.resolve(null)).then(function (blob) {
          if (r.photo && !blob) return null;
          return RunLog.saveRun({
            id: r.id, blob: blob, date: r.date || '', km: r.km || '', pace: r.pace || '',
            time: r.time || '', title: r.title || '', kind: r.kind || 'run',
            cat: r.cat === 'photo' ? 'photo' : 'strava',
            blockId: r.blockId || '', sessionId: r.sessionId || '', raceId: r.raceId || '',
            note: r.note || '', added: r.added || Date.now(), shoeId: r.shoeId || '', wx: r.wx || null
          });
        });
      });
    }, Promise.resolve());
  }

  return { exportAll: exportAll, parse: parse, summary: summary, apply: apply };
})(window.Core, window.RunLog);
