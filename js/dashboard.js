// Điều khiển index.html — trang chủ cá nhân: buổi chạy tiếp theo (đánh dấu
// hoặc nhập số liệu ngay tại chỗ), tóm tắt nhanh (bấm vào mở trang Thống kê),
// câu truyền động lực và danh sách giải đấu. Số liệu chi tiết nằm ở
// stats.html; sửa / xoá giải nằm ở trang của từng giải (race.html).
(function () {
  'use strict';
  var C = window.Core, B = window.Blocks, R = window.Races, RL = window.RunLog, RF = window.RaceForm;
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
  // Buổi hôm nay đã đánh dấu xong, để thẻ vẫn ghi nhận sau khi chuyển sang buổi kế.
  function doneToday() {
    var t = C.iso(C.today0()), out = [];
    B.list().forEach(function (b) {
      B.sessionsOf(b).list.forEach(function (x) {
        if (x.s.type !== 'rest' && b.done[x.id] && C.iso(x.date) === t) out.push(x.s.title);
      });
    });
    return out;
  }
  // Tiến độ tuần dương lịch này (T2 – CN) của một giáo án.
  function weekPlan(block) {
    var wk = RL.thisWeekRange(C.today0()), w = { n: 0, nd: 0, km: 0, kmDone: 0 };
    B.sessionsOf(block).list.forEach(function (x) {
      if (x.s.type === 'rest' || x.date < wk.start || x.date > wk.end) return;
      var km = Number(x.s.km) || 0;
      w.n++; w.km += km;
      if (block.done[x.id]) { w.nd++; w.kmDone += km; }
    });
    return w;
  }
  function paceHint(type) {
    if (!runs.length || !window.Predict) return '';
    return window.Predict.hintFor(type, window.Predict.compute(runs).zones);
  }

  function renderNext() {
    var box = el('next'), hit = nextAction(), done = doneToday();
    var doneLine = done.length ? '<p class="next-done">✓ Đã xong hôm nay: ' + C.esc(done.join(', ')) + '</p>' : '';
    if (hit) {
      var x = hit.x, diff = Math.round((x.date - C.today0()) / 864e5), today = diff === 0;
      var when = today ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : 'Còn ' + diff + ' ngày nữa';
      var hint = paceHint(x.s.type), wk = weekPlan(hit.block), iso = C.iso(x.date);
      var acts = today && x.s.type !== 'race'
        ? '<button type="button" class="btn" data-done="' + C.esc(hit.block.id + '|' + x.id) + '">Đánh dấu đã chạy</button>'
          + '<a class="btn-sm" href="log.html?date=' + iso + '">Nhập số liệu</a>'
        : today
          ? '<a class="btn" href="log.html?date=' + iso + '">Nhập kết quả thi</a>'
          : '<a class="btn-sm" href="plan.html">Xem lịch tập</a>';
      var pct = wk.n ? Math.round(wk.nd / wk.n * 100) : 0;
      box.innerHTML = doneLine
        + '<div class="when"><span class="chip tag-now">' + when + '</span><span class="num">' + C.WD[(x.date.getDay() + 6) % 7] + ' ' + C.fmt(x.date) + '</span>'
        + '<span class="chip t-' + x.s.type + '">' + C.LABEL[x.s.type] + '</span></div>'
        + '<h2>' + C.esc(x.s.title) + '</h2>'
        + (x.s.d ? '<p class="detail">' + C.esc(x.s.d) + '</p>' : '')
        + (hint ? '<p class="next-hint">' + C.esc(hint) + '</p>' : '')
        + '<div class="next-acts">' + acts + '</div>'
        + (wk.n ? '<div class="next-week"><div class="next-week-t"><span>Tuần này <b class="num">' + wk.nd + '/' + wk.n + '</b> buổi</span>'
            + '<span class="num">' + C.fmtKm(wk.kmDone) + '/' + C.fmtKm(wk.km) + ' km</span></div>'
            + '<div class="bar" role="progressbar" aria-label="Tiến độ tuần này" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div></div>' : '')
        + (hit.race ? '<a class="next-race" href="race.html?id=' + encodeURIComponent(hit.race.id) + '">' + C.esc(hit.race.name) + ' ›</a>' : '');
      return;
    }
    var nextRace = R.upcoming()[0];
    if (nextRace) {
      box.innerHTML = doneLine + '<div class="when"><span class="chip tag-now">Còn ' + R.daysUntil(nextRace) + ' ngày</span></div>'
        + '<h2>' + C.esc(nextRace.name) + '</h2><p class="detail">Chưa có buổi nào tới hạn. Mở trang giải để xem chi tiết hoặc ghi nhật ký chạy tự do.</p>'
        + '<div class="next-acts"><a class="btn" href="race.html?id=' + encodeURIComponent(nextRace.id) + '">Mở trang giải</a>'
        + '<a class="btn-sm" href="log.html">Nhập buổi chạy</a></div>';
      return;
    }
    box.innerHTML = doneLine + '<div class="when"><span class="chip t-rest">Chưa có giải nào</span></div><h2>Chạy tự do</h2>'
      + '<p class="detail">Tạo một giải mới ở dưới, hoặc cứ ghi nhật ký chạy hằng ngày — PR và chuỗi tuần vẫn được tính bình thường.</p>'
      + '<div class="next-acts"><a class="btn" href="log.html">Nhập buổi chạy</a></div>';
  }

  // Đánh dấu ngay trên trang chủ. Bỏ đánh dấu thì vào Lịch tập.
  function markDone(btn) {
    var p = btn.getAttribute('data-done').split('|'), blk = B.get(p[0]), x = blk && B.findSession(blk, p[1]);
    if (!x) return;
    B.setDone(blk, x.id, true);
    var tier = B.weekComplete(blk, x.wi) ? 'week' : x.s.type === 'long' ? 'long' : x.s.type === 'quality' ? 'quality' : 'easy';
    C.FX.party(tier, btn);
    C.toast(tier === 'week' ? 'Trọn vẹn một tuần!' : 'Đã xong: ' + x.s.title, 'Muốn bỏ đánh dấu thì vào Lịch tập');
    renderNext();
  }

  /* ================= tóm tắt nhanh — bấm vào mở trang Thống kê ================= */
  function renderQuickStats() {
    var box = el('qstat-row');
    if (!box) return;
    var t0 = C.today0(), wk = RL.thisWeekRange(t0);
    var weekKm = RL.kmBetween(runs, wk.start, wk.end);
    var totalKm = runs.reduce(function (a, r) { return a + (r.kind !== 'walk' ? Number(r.km) || 0 : 0); }, 0);
    // Chuỗi tuần thay cho streak ngày ở trang chủ: ngày nghỉ đúng giáo án không
    // làm đứt chuỗi tuần. Streak ngày vẫn còn ở trang Thống kê.
    var ws = window.Goals.weekStreak(runs);
    var cards = [
      { label: 'Chuỗi tuần', value: ws.n + ' tuần' },
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
  // Cả thẻ là một đường dẫn sang trang giải; sửa / xoá nằm ở đó.
  function renderRaces() {
    var box = el('race-list');
    var all = R.list().map(R.refreshStatus);
    if (!all.length) { box.innerHTML = '<p class="hint">Chưa có giải nào. Tạo giải đầu tiên ở trên.</p>'; return; }
    box.innerHTML = all.map(function (r) {
      var d = R.daysUntil(r);
      var when = r.status === 'upcoming' ? 'Còn ' + d + ' ngày' : (r.result ? 'Đã hoàn thành' : 'Đã qua');
      var blk = r.blockId ? B.get(r.blockId) : null;
      var tpl = blk ? window.Templates.get(blk.templateId) : null;
      var st = blk ? B.stats(blk) : null;
      return '<a class="race-card" href="race.html?id=' + encodeURIComponent(r.id) + '">'
        + '<span class="race-card-top"><span class="chip ' + (r.status === 'upcoming' ? 'tag-now' : 't-rest') + '">' + when + '</span><span class="race-card-go" aria-hidden="true">›</span></span>'
        + '<strong>' + C.esc(r.name) + '</strong>'
        + '<span class="hint num">' + C.fmt(C.fromIso(r.date)) + '/' + C.fromIso(r.date).getFullYear() + (r.distanceKm ? ' · ' + r.distanceKm + ' km' : '') + '</span>'
        + '<span class="hint">' + (tpl ? C.esc(tpl.name) : 'Không có giáo án') + '</span>'
        + (st ? '<span class="bar race-card-bar" aria-hidden="true"><i style="width:' + st.pct + '%"></i></span>' : '')
        + '</a>';
    }).join('');
  }

  /* ================= form tạo giải ================= */
  function syncTemplateDesc() { el('race-template-desc').textContent = RF.describe(el('race-template').value); }
  function openCreate() {
    el('race-form').reset();
    el('race-form').hidden = false;
    syncTemplateDesc();
    el('race-name').focus();
  }
  function closeRaceForm() {
    el('race-form').reset();
    el('race-form').hidden = true;
  }

  /* ================= sự kiện ================= */
  function on(id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); }

  function renderAll() {
    renderNext(); renderQuickStats(); renderRaces();
  }

  function bindEvents() {
    on('quote-next', 'click', renderQuote);
    on('next', 'click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-done]') : null;
      if (b) markDone(b);
    });
    on('race-add-toggle', 'click', function () {
      if (el('race-form').hidden) openCreate(); else closeRaceForm();
    });
    on('race-cancel', 'click', closeRaceForm);
    on('race-template', 'change', syncTemplateDesc);
    on('race-form', 'submit', function (e) {
      e.preventDefault();
      var res = RF.save({ name: el('race-name').value, date: el('race-date').value,
                          km: el('race-km').value, templateId: el('race-template').value });
      if (!res) return;
      closeRaceForm();
      renderAll();
      C.toast('Đã tạo giải mới', res.race.name + (res.race.blockId ? ' · đã sinh giáo án' : ''));
    });
  }

  // Màn hình chờ do đoạn script trong <head> bật lên (chỉ khi mở app từ đầu).
  // Gỡ xuống ngay khi dữ liệu đã vẽ xong, nhưng giữ tối thiểu 1 giây để logo và
  // khẩu hiệu kịp hiện hết; quá 2,5 giây thì gỡ luôn dù dữ liệu chưa xong.
  var SPLASH_MIN = 1000, SPLASH_MAX = 2500;
  function hideSplash(ready) {
    var root = document.documentElement, sp = el('splash'), gone = false;
    if (!sp || !root.classList.contains('splash-on')) return;
    function go() {
      if (gone) return;
      gone = true;
      var elapsed = window.performance && performance.now ? performance.now() : SPLASH_MIN;
      setTimeout(function () {
        sp.classList.add('out');
        setTimeout(function () {
          root.classList.remove('splash-on');
          if (sp.parentNode) sp.parentNode.removeChild(sp);
        }, 430);
      }, Math.max(0, SPLASH_MIN - elapsed));
    }
    ready.then(go, go);
    setTimeout(go, SPLASH_MAX);
  }

  function boot() {
    renderDate(); renderQuote();
    el('race-template').innerHTML = RF.optionsHtml();
    bindEvents();
    var ready = window.Migrate.run().then(function () {
      renderAll();
      return RL.loadRuns();
    }).then(function (all) {
      runs = all;
      if (window.Adapt) window.Adapt.auto(all);   // chế độ tự điều chỉnh giáo án (nếu đã bật ở Lịch tập)
      renderAll();
      window.Notify.init();
    });
    hideSplash(ready);
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
