// Điều khiển settings.html — nhắc chạy/push và sao lưu/khôi phục dữ liệu.
(function () {
  'use strict';
  var C = window.Core, B = window.Backup;
  var el = function (id) { return document.getElementById(id); };
  var on = function (id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); };

  var pending = null;   // dữ liệu đã đọc từ file, đang chờ bấm xác nhận

  function status(msg) { var n = el('bk-status'); if (n) n.textContent = msg || ''; }
  function busy(v) {
    ['bk-export', 'bk-import', 'bk-confirm'].forEach(function (id) {
      var n = el(id); if (n) n.disabled = !!v;
    });
  }
  function num1(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }
  function fmtSize(bytes) {
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1048576) return num1(bytes / 1024) + ' KB';
    if (bytes < 1073741824) return num1(bytes / 1048576) + ' MB';
    return num1(bytes / 1073741824) + ' GB';
  }
  function clearPending() {
    pending = null;
    var n = el('bk-confirm'); if (n) n.hidden = true;
    var f = el('bk-file'); if (f) f.value = '';
  }

  /* ---------- giao diện sáng/tối ---------- */
  // Không có thuộc tính data-theme nghĩa là để trình duyệt tự quyết theo cài
  // đặt máy; đặt "light"/"dark" thì CSS khoá cứng theo lựa chọn đó.
  function currentTheme() {
    var t = C.store.get('app-theme');
    return (t === 'light' || t === 'dark') ? t : 'auto';
  }
  function renderTheme() {
    var seg = el('th-seg');
    if (!seg) return;
    var cur = currentTheme();
    [].forEach.call(seg.querySelectorAll('[data-theme-set]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === cur ? 'true' : 'false');
    });
  }
  function setTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else { document.documentElement.removeAttribute('data-theme'); t = 'auto'; }
    C.store.set('app-theme', t);
    renderTheme();
  }

  /* ---------- đọc ảnh bằng Gemini ---------- */
  function vsStatus(msg, cls) {
    var n = el('vs-status');
    if (!n) return;
    n.textContent = msg || '';
    n.className = 'hint' + (cls ? ' ' + cls : '');
  }
  function renderVision() {
    var k = el('vs-key'), m = el('vs-model'), V = window.Vision;
    if (!k || !V) return;
    k.value = V.getKey();
    m.value = V.getModel();
    vsStatus(V.hasKey() ? 'Đã có API key.' : 'Chưa có API key — tab Nhập nhanh vẫn dùng được, chỉ không tự điền từ ảnh.');
  }
  function saveVision() {
    var V = window.Vision;
    V.setKey(el('vs-key').value);
    V.setModel(el('vs-model').value === V.DEFAULT_MODEL ? '' : el('vs-model').value);
    el('vs-model').value = V.getModel();
    vsStatus(V.hasKey() ? 'Đã lưu.' : 'Đã lưu, nhưng chưa có API key.');
  }
  function testVision() {
    saveVision();
    if (!window.Vision.hasKey()) { vsStatus('Nhập API key trước.', 'err'); return; }
    vsStatus('Đang thử kết nối...');
    window.Vision.test().then(function (ms) {
      vsStatus('Kết nối tốt: Gemini trả lời sau ' + ms + ' ms.', 'ok');
    }).catch(function (e) { vsStatus(e.message || 'Không kết nối được.', 'err'); });
  }

  /* ---------- dung lượng ---------- */
  // Ảnh chạy nằm trong IndexedDB nên cộng thẳng kích thước từng blob cho
  // chính xác; phần còn lại (vỏ app, font, bộ nhớ đệm) suy ra từ tổng mà
  // trình duyệt báo. Hạn mức là con số trình duyệt cấp cho tên miền này,
  // không phải dung lượng trống của máy.
  function renderStorage() {
    var head = el('sg-head'), meter = el('sg-meter'), legend = el('sg-legend'), note = el('sg-note');
    if (!head || !meter) return;

    function giveUp(msg) {
      head.textContent = msg;
      meter.hidden = true;
      if (legend) legend.innerHTML = '';
      if (note) note.textContent = '';
    }
    if (!navigator.storage || !navigator.storage.estimate) {
      giveUp('Trình duyệt này không cho biết dung lượng còn lại.');
      return;
    }

    Promise.all([
      navigator.storage.estimate().catch(function () { return null; }),
      window.RunLog.loadRuns().catch(function () { return []; }),
      navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return false; }) : Promise.resolve(false)
    ]).then(function (r) {
      var est = r[0], runs = r[1] || [], persisted = r[2];
      var photoBytes = 0;
      runs.forEach(function (x) {
        if (x.blob) photoBytes += x.blob.size || 0;
        if (x.url) { try { URL.revokeObjectURL(x.url); } catch (e) {} }
      });
      if (!est || !est.quota) { giveUp('Trình duyệt này không cho biết dung lượng còn lại.'); return; }

      var quota = est.quota, used = est.usage || 0;
      if (photoBytes > used) photoBytes = used;        // ước lượng của trình duyệt có thể lệch chút
      var appBytes = Math.max(0, used - photoBytes);
      var free = Math.max(0, quota - used);

      head.textContent = 'Đã dùng ' + fmtSize(used) + ' trong khoảng ' + fmtSize(quota) + ' trình duyệt cho phép.';
      meter.hidden = false;
      meter.innerHTML =
        (photoBytes > 0 ? '<i class="m-photo" style="width:' + (photoBytes / quota * 100).toFixed(3) + '%"></i>' : '') +
        (appBytes > 0 ? '<i class="m-app" style="width:' + (appBytes / quota * 100).toFixed(3) + '%"></i>' : '');
      meter.setAttribute('aria-label',
        'Đã dùng ' + fmtSize(used) + ' trên ' + fmtSize(quota) + ', còn trống ' + fmtSize(free));

      legend.innerHTML =
        '<span><i class="meter-dot m-photo"></i>Ảnh chạy ' + fmtSize(photoBytes) + '</span>' +
        '<span><i class="meter-dot m-app"></i>App &amp; bộ nhớ đệm ' + fmtSize(appBytes) + '</span>' +
        '<span><i class="meter-dot m-free"></i>Còn trống ' + fmtSize(free) + '</span>';

      var avg = (runs.length && photoBytes) ? photoBytes / runs.length : 250 * 1024;
      var more = Math.floor(free / avg);
      var avgText = runs.length ? ' (ảnh của bạn trung bình ' + fmtSize(avg) + ').' : ' (tính theo cỡ ảnh thường gặp, khoảng 250 KB).';
      note.textContent = (more >= 10000 ? 'Còn rất nhiều chỗ cho ảnh' : 'Còn đủ chỗ cho khoảng ' + more.toLocaleString('vi-VN') + ' ảnh nữa') + avgText
        + (persisted
            ? ' Dữ liệu đã được đánh dấu lưu bền.'
            : ' Dữ liệu chưa được đánh dấu lưu bền — trình duyệt có thể tự xoá khi máy đầy, nên thỉnh thoảng xuất file sao lưu ở dưới.');
    }).catch(function () {
      giveUp('Không đọc được dung lượng.');
    });
  }

  /* ---------- xuất ---------- */
  function doExport() {
    busy(true);
    status('Đang gói dữ liệu...');
    B.exportAll(function (done, total) {
      if (total) status('Đang gói ảnh ' + done + '/' + total + '...');
    }).then(function (r) {
      busy(false);
      if (r.how === 'cancelled') { status('Đã huỷ.'); return; }
      status('Xong: ' + r.name + ' · ' + r.runs + ' bản ghi · ' + fmtSize(r.bytes)
        + (r.how === 'shared' ? '. Chọn "Lưu vào Tệp" để giữ lại.' : '.'));
      C.toast('Đã xuất dữ liệu', fmtSize(r.bytes));
    }).catch(function () {
      busy(false);
      status('Không xuất được dữ liệu. Thử lại hoặc kiểm tra dung lượng máy.');
    });
  }

  /* ---------- nhập ---------- */
  function readFile(file) {
    if (!file) return;
    busy(true);
    status('Đang đọc file...');
    var fr = new FileReader();
    fr.onload = function () {
      busy(false);
      try {
        pending = B.parse(String(fr.result));
      } catch (e) {
        clearPending();
        status('File không đúng định dạng sao lưu của app.');
        return;
      }
      var s = B.summary(pending);
      var when = '';
      try { when = new Date(s.exportedAt).toLocaleDateString('vi-VN'); } catch (e) {}
      status('File' + (when ? ' ngày ' + when : '') + ': ' + s.races + ' giải · ' + s.blocks
        + ' giáo án · ' + s.done + ' buổi đã đánh dấu · ' + s.goals + ' mục tiêu · '
        + s.runs + ' buổi chạy (' + s.photos + ' có ảnh). Bấm "Xác nhận khôi phục" để gộp vào dữ liệu hiện có.');
      el('bk-confirm').hidden = false;
    };
    fr.onerror = function () { busy(false); clearPending(); status('Không đọc được file.'); };
    fr.readAsText(file);
  }

  function doImport() {
    if (!pending) return;
    busy(true);
    status('Đang khôi phục...');
    B.apply(pending).then(function () {
      status('Đã khôi phục xong. Đang tải lại app...');
      C.toast('Đã khôi phục dữ liệu', 'App sẽ tải lại');
      setTimeout(function () { window.location.reload(); }, 1200);
    }).catch(function () {
      busy(false);
      clearPending();
      status('Khôi phục thất bại. Dữ liệu cũ vẫn còn nguyên.');
    });
  }

  function boot() {
    var d = new Date();
    el('se-eyebrow').textContent = C.WD[(d.getDay() + 6) % 7] + ', ' + C.fmt(d) + '/' + d.getFullYear();

    on('nt-toggle', 'click', function () { window.Notify.toggle(); });
    on('nt-time', 'change', function (e) { window.Notify.setTime(e.target.value); });
    on('nt-test', 'click', function () { window.Notify.test(); });
    on('nt-health', 'click', function () { window.Notify.health(); });

    renderTheme();
    renderStorage();
    renderVision();
    on('vs-save', 'click', saveVision);
    on('vs-test', 'click', testVision);
    on('vs-clear', 'click', function () { el('vs-key').value = ''; saveVision(); });

    var seg = el('th-seg');
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-theme-set]') : null;
      if (b) setTheme(b.getAttribute('data-theme-set'));
    });

    on('bk-export', 'click', doExport);
    on('bk-import', 'click', function () { clearPending(); status(''); el('bk-file').click(); });
    on('bk-file', 'change', function (e) { readFile(e.target.files && e.target.files[0]); });
    on('bk-confirm', 'click', doImport);

    window.Notify.init();
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
