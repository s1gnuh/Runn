// Điều khiển index.html — trang chủ cá nhân: buổi chạy tiếp theo, câu truyền
// động lực, tóm tắt nhanh (bấm vào mở trang Thống kê) và danh sách giải đấu.
// Số liệu chi tiết/PR/mục tiêu/phân tích xu hướng nằm ở stats.html; nhắc
// chạy & push nằm ở settings.html — trang chủ chỉ giữ "hôm nay cần làm gì".
(function () {
  'use strict';
  var C = window.Core, T = window.Templates, B = window.Blocks, R = window.Races, RL = window.RunLog;
  var el = function (id) { return document.getElementById(id); };
  var runs = [];

  /* ================= header + quote ================= */
  function renderDate() {
    var d = new Date();
    el('dash-date').textContent = C.WD[(d.getDay() + 6) % 7] + ', ' + C.fmt(d) + '/' + d.getFullYear();
    var h = d.getHours();
    var greet = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    var g = el('dash-greet');
    if (g) g.textContent = greet;
  }
  var lastQuote = -1;
  function renderQuote() {
    var qs = window.BN_QUOTES, qEl = el('quote-q'), aEl = el('quote-a');
    if (!qEl || !aEl || !qs || !qs.length) return;
    var i = (Math.random() * qs.length) | 0;
    if (qs.length > 1) while (i === lastQuote) i = (Math.random() * qs.length) | 0;
    lastQuote = i;
    qEl.textContent = '“' + qs[i].q + '”';
    aEl.textContent = '— ' + qs[i].a;
  }

  /* ================= buổi tiếp theo (gộp mọi block active) ================= */
  function nextAction() {
    var t0 = C.today0(), out = [];
    B.list().forEach(function (b) {
      B.sessionsOf(b).list.forEach(function (x) {
        if (x.s.type === 'rest' || b.done[x.id] || x.date < t0) return;
        out.push({ x: x, block: b, race: R.get(b.raceId) });
      });
    });
    out.sort(function (a, b2) { return a.x.date - b2.x.date; });
    return out[0] || null;
  }
  function renderNext() {
    var box = el('next'), hit = nextAction();
    if (hit) {
      var diff = Math.round((hit.x.date - C.today0()) / 864e5);
      var when = diff === 0 ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : 'Còn ' + diff + ' ngày nữa';
      box.innerHTML = '<div class="when"><span class="chip tag-now">' + when + '</span><span class="num">' + C.fmt(hit.x.date) + '</span><span class="chip t-' + hit.x.s.type + '">' + C.LABEL[hit.x.s.type] + '</span></div>' +
        '<h2>' + C.esc(hit.x.s.title) + '</h2>' +
        '<p class="detail">' + (hit.race ? C.esc(hit.race.name) : '') + '</p>' +
        '<a class="btn" href="race.html?id=' + encodeURIComponent(hit.block.raceId) + '">Mở trang giải</a>';
      return;
    }
    var nextRace = R.upcoming()[0];
    if (nextRace) {
      box.innerHTML = '<div class="when"><span class="chip tag-now">Còn ' + R.daysUntil(nextRace) + ' ngày</span></div>' +
        '<h2>' + C.esc(nextRace.name) + '</h2><p class="detail">Chưa có buổi nào tới hạn. Mở trang giải để xem chi tiết hoặc ghi nhật ký chạy tự do.</p>' +
        '<a class="btn" href="race.html?id=' + encodeURIComponent(nextRace.id) + '">Mở trang giải</a>';
      return;
    }
    box.innerHTML = '<div class="when"><span class="chip t-rest">Chưa có giải nào</span></div><h2>Chạy tự do</h2><p class="detail">Tạo một giải mới ở dưới, hoặc cứ ghi nhật ký chạy hằng ngày — PR và streak vẫn được tính bình thường.</p>';
  }

  /* ================= tóm tắt nhanh — bấm vào mở trang Thống kê ================= */
  function renderQuickStats() {
    var box = el('qstat-row');
    if (!box) return;
    var t0 = C.today0(), wk = RL.thisWeekRange(t0);
    var weekKm = RL.kmBetween(runs, wk.start, wk.end);
    var totalKm = runs.reduce(function (a, r) { return a + (r.kind !== 'walk' ? Number(r.km) || 0 : 0); }, 0);
    var streak = RL.computeStreak(runs);
    var cards = [
      { label: 'Streak', value: streak + ' ngày' },
      { label: 'Km tuần này', value: C.fmtKm(weekKm) },
      { label: 'Tổng km', value: C.fmtKm(totalKm) }
    ];
    box.innerHTML = cards.map(function (c) {
      return '<div class="qstat"><div class="qv num">' + c.value + '</div><div class="ql">' + c.label + '</div></div>';
    }).join('');

    var trend = el('qstat-trend');
    if (!trend) return;
    var series = RL.weeklyKmSeries(runs, 8).map(function (w) { return w.km; });
    var last = series[series.length - 2], avg = series.slice(0, -1).reduce(function (a, v) { return a + v; }, 0) / 7;
    trend.hidden = !series.some(function (v) { return v > 0; });
    trend.innerHTML = window.Charts.spark(series)
      + '<div class="qstat-trend-t"><span>Km 8 tuần gần nhất</span><span>Tuần trước <b class="num">' + C.fmtKm(last)
      + ' km</b> · trung bình <b class="num">' + C.fmtKm(avg) + ' km</b></span></div>';
  }

  /* ================= danh sách giải ================= */
  var armedDel = '';

  function renderRaces() {
    var box = el('race-list');
    var all = R.list().map(R.refreshStatus);
    if (!all.length) { box.innerHTML = '<p class="hint">Chưa có giải nào. Tạo giải đầu tiên ở trên.</p>'; return; }
    box.innerHTML = all.map(function (r) {
      var d = R.daysUntil(r);
      var when = r.status === 'upcoming' ? 'Còn ' + d + ' ngày' : (r.result ? 'Đã hoàn thành' : 'Đã qua');
      var blk = r.blockId ? B.get(r.blockId) : null;
      var tpl = blk ? T.get(blk.templateId) : null;
      var armed = armedDel === r.id;
      return '<div class="race-card">' +
        '<a class="race-card-main" href="race.html?id=' + encodeURIComponent(r.id) + '">' +
        '<span class="chip ' + (r.status === 'upcoming' ? 'tag-now' : 't-rest') + '">' + when + '</span>' +
        '<strong>' + C.esc(r.name) + '</strong>' +
        '<span class="hint num">' + C.fmt(C.fromIso(r.date)) + '/' + C.fromIso(r.date).getFullYear() + (r.distanceKm ? ' · ' + r.distanceKm + ' km' : '') + '</span>' +
        '<span class="hint">' + (tpl ? C.esc(tpl.name) : 'Không có giáo án') + '</span>' +
        '</a>' +
        '<div class="race-card-acts">' +
        '<button type="button" class="btn-sm" data-race-edit="' + r.id + '">Sửa</button>' +
        '<button type="button" class="btn-sm"' + (armed ? ' data-armed="1"' : '') + ' data-race-del="' + r.id + '">' +
        (armed ? 'Chắc chắn xoá?' : 'Xoá') + '</button>' +
        '</div></div>';
    }).join('');
  }

  /* ================= form giải: dùng chung cho tạo và sửa ================= */
  function renderTemplateOptions() {
    var sel = el('race-template');
    if (!sel) return;
    var opts = ['<option value="">Không dùng giáo án — chỉ tạo giải, tự ghi nhật ký</option>'];
    T.levels().forEach(function (t) {
      var s = T.summary(t);
      opts.push('<option value="' + t.id + '">' + C.esc(t.name)
        + ' · đỉnh ' + s.peakKm + ' km/tuần</option>');
    });
    opts.push('<option value="' + T.PERIODIZED_12W_ID + '">Chu kỳ 12 tuần (kiểu Bắc Ninh 10K)</option>');
    sel.innerHTML = opts.join('');
  }
  function syncTemplateDesc() {
    var node = el('race-template-desc');
    if (!node) return;
    var t = T.get(el('race-template').value);
    if (!t) { node.textContent = 'Không sinh giáo án. Bạn vẫn ghi được nhật ký chạy cho giải này.'; return; }
    var s = T.summary(t);
    node.textContent = (t.desc ? t.desc + ' ' : '')
      + '(' + s.weeks + ' tuần · ' + s.daysPerWeek + ' buổi/tuần · đỉnh ' + s.peakKm + ' km/tuần · tổng khoảng ' + s.totalKm + ' km)';
  }
  function openCreate() {
    el('race-form').reset();
    el('race-edit-id').value = '';
    el('race-submit').textContent = 'Tạo giải';
    el('race-cancel').hidden = true;
    el('race-form').hidden = false;
    syncTemplateDesc();
  }
  function openEdit(id) {
    var race = R.get(id);
    if (!race) return;
    var blk = race.blockId ? B.get(race.blockId) : null;
    el('race-edit-id').value = id;
    el('race-name').value = race.name;
    el('race-date').value = race.date;
    el('race-km').value = race.distanceKm || 0;
    el('race-template').value = blk ? blk.templateId : '';
    el('race-submit').textContent = 'Lưu thay đổi';
    el('race-cancel').hidden = false;
    el('race-form').hidden = false;
    syncTemplateDesc();
    el('race-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function closeRaceForm() {
    el('race-form').reset();
    el('race-edit-id').value = '';
    el('race-submit').textContent = 'Tạo giải';
    el('race-cancel').hidden = true;
    el('race-form').hidden = true;
  }

  // Gắn / đổi / bỏ giáo án của một giải. Giữ nguyên tiến độ nếu khuôn không
  // đổi, chỉ dời lịch theo ngày thi mới.
  function applyBlock(race, templateId, name, km) {
    var oldBlock = race.blockId ? B.get(race.blockId) : null;
    if (!templateId) {
      if (oldBlock) B.remove(oldBlock.id);
      race.blockId = null;
      return null;
    }
    if (oldBlock && oldBlock.templateId === templateId) {
      var tpl = T.get(templateId);
      oldBlock.startDate = C.iso(T.startFromRaceDate(tpl, C.fromIso(race.date)));
      oldBlock.raceTitle = name + (km ? ', ' + km + ' km' : '');
      oldBlock.raceKm = km;
      B.save(oldBlock);
      return oldBlock;
    }
    if (oldBlock) B.remove(oldBlock.id);
    var blk = B.create({ id: C.uid('blk-'), templateId: templateId, raceDate: race.date, raceId: race.id, mode: 4 });
    blk.raceTitle = name + (km ? ', ' + km + ' km' : '');
    blk.raceDesc = '';
    blk.raceKm = km;
    B.save(blk);
    race.blockId = blk.id;
    return blk;
  }

  /* ================= sự kiện ================= */
  function on(id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); }

  function renderAll() {
    renderNext(); renderQuickStats(); renderRaces();
  }

  function bindEvents() {
    on('quote-next', 'click', renderQuote);

    on('race-add-toggle', 'click', function () {
      if (el('race-form').hidden) openCreate(); else closeRaceForm();
    });
    on('race-cancel', 'click', closeRaceForm);
    on('race-template', 'change', syncTemplateDesc);

    on('race-form', 'submit', function (e) {
      e.preventDefault();
      var editId = el('race-edit-id').value;
      var name = el('race-name').value.trim();
      var date = el('race-date').value;
      var km = Number(el('race-km').value) || 0;
      var templateId = el('race-template').value;
      if (!name || !date) return;

      if (editId) {
        var race = R.get(editId);
        if (!race) return;
        var hadBlock = race.blockId ? B.get(race.blockId) : null;
        var swapped = hadBlock && templateId && hadBlock.templateId !== templateId;
        race.name = name; race.date = date; race.distanceKm = km;
        applyBlock(race, templateId, name, km);
        R.save(race);
        closeRaceForm();
        renderAll();
        C.toast('Đã lưu giải', swapped ? 'Đổi giáo án nên tiến độ cũ được làm lại' : name);
        return;
      }

      var fresh = R.create({ id: C.uid('race-'), name: name, date: date, distanceKm: km, blockId: null });
      applyBlock(fresh, templateId, name, km);
      R.save(fresh);
      closeRaceForm();
      renderAll();
      C.toast('Đã tạo giải mới', name + (fresh.blockId ? ' · đã sinh giáo án' : ''));
    });

    on('race-list', 'click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var editId = t.getAttribute('data-race-edit');
      if (editId) { armedDel = ''; openEdit(editId); renderRaces(); return; }
      var delId = t.getAttribute('data-race-del');
      if (!delId) return;
      if (armedDel !== delId) { armedDel = delId; renderRaces(); return; }
      var race = R.get(delId);
      if (race && race.blockId) B.remove(race.blockId);
      R.remove(delId);
      armedDel = '';
      if (el('race-edit-id').value === delId) closeRaceForm();
      renderAll();
      C.toast('Đã xoá giải', (race ? race.name : '') + ' · ảnh và nhật ký vẫn được giữ');
    });
  }

  // Màn hình chờ do đoạn script trong <head> bật lên (chỉ khi mở app từ đầu);
  // ở đây chỉ lo gỡ nó xuống sau khi chạy xong hiệu ứng.
  function hideSplash() {
    var root = document.documentElement, sp = el('splash');
    if (!sp || !root.classList.contains('splash-on')) return;
    setTimeout(function () {
      sp.classList.add('out');
      setTimeout(function () {
        root.classList.remove('splash-on');
        if (sp.parentNode) sp.parentNode.removeChild(sp);
      }, 430);
    }, 3500);
  }

  function boot() {
    hideSplash();
    renderDate(); renderQuote();
    renderTemplateOptions();
    bindEvents();
    window.Migrate.run().then(function () {
      renderAll();
      return RL.loadRuns();
    }).then(function (all) {
      runs = all;
      if (window.Adapt) window.Adapt.auto(all);   // chế độ tự điều chỉnh giáo án (nếu đã bật ở Lịch tập)
      renderAll();
      window.Notify.init();
    });
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
