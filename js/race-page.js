// Điều khiển race.html — đọc ?id=<raceId> và dựng phần thuộc riêng MỘT giải:
// buổi tiếp theo, tiến độ, biểu đồ km/tuần, ngày chạy mặc định trong tuần và
// phần tham khảo. Lịch tháng / lịch tuần đã chuyển sang plan.html, ảnh và
// nhật ký sang log.html, nên trang này không còn giữ hai phần đó.
(function () {
  'use strict';
  var C = window.Core, T = window.Templates, B = window.Blocks, R = window.Races;
  var el = function (id) { return document.getElementById(id); };

  var raceId = C.qs('id');
  var race = null, block = null, tpl = null, runs = [];

  function sessions() { return block ? B.sessionsOf(block).list : []; }
  function findSession(sid) { return block ? B.findSession(block, sid) : null; }

  /* ================= header ================= */
  function renderHeader() {
    document.title = race.name;
    el('r-eyebrow').textContent = block
      ? (C.fmt(B.dayOf(block, 0, 0)) + ' đến ' + C.fmt(C.fromIso(race.date)))
      : 'Chạy tự do · không theo giáo án cố định';
    el('r-title').textContent = race.name;
    var d = R.daysUntil(race);
    el('days').textContent = Math.abs(d);
    el('r-days-label').textContent = d >= 0
      ? 'ngày nữa đến ngày thi, ' + C.WD[C.fromIso(race.date).getDay() === 0 ? 6 : C.fromIso(race.date).getDay() - 1]
      : 'ngày sau ngày thi';
    el('r-mode').hidden = !block || !tpl || !!(tpl.days && tpl.days[0] && tpl.days[0].role);
    el('r-progress-wrap').hidden = !block;
    el('r-noblock').hidden = !!block;
  }

  /* ================= ngày chạy mặc định trong tuần ================= */
  function renderSched() {
    var box = el('sched-fields');
    if (!box || !block) return;
    var html = '';
    tpl.days.forEach(function (dy, i) {
      if (!B.visible(block, tpl, dy)) return;
      html += '<div class="sf"><label for="def-' + dy.k + '">' + dy.name + '</label>'
        + '<select id="def-' + dy.k + '" data-def="' + i + '">' + dayOptions(block.schedDef[i]) + '</select></div>';
    });
    box.innerHTML = html;
  }
  function dayOptions(sel) {
    return C.WD.map(function (n, i) {
      return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + n + '</option>';
    }).join('');
  }

  /* ================= biểu đồ km theo tuần ================= */
  var chartSeen = false;
  function renderChart() {
    var box = el('chart');
    if (!box || !block) return;
    var t0 = C.today0();
    var weeks = B.weeklyLoad(block);
    var max = Math.max.apply(null, weeks.map(function (w) { return w.planned; })) || 1;
    box.innerHTML = weeks.map(function (w) {
      var start = B.dayOf(block, w.wi, 0), end = B.dayOf(block, w.wi, 6);
      var cur = t0 >= start && t0 <= end;
      var ph = Math.max(2, Math.round(w.planned / max * 100));
      var af = w.planned ? Math.round(Math.min(w.actual, w.planned) / w.planned * 100) : 0;
      return '<div class="cweek' + (cur ? ' now' : '') + '" style="--i:' + w.wi + '">' +
        '<span class="cval num">' + C.fmtKm(w.planned) + '</span>' +
        '<div class="cbar" style="--h:' + ph + '%" title="Tuần ' + (w.wi + 1) + ': ' + C.fmtKm(w.actual) + ' / ' + C.fmtKm(w.planned) + ' km đã chạy">' +
        (af > 0 ? '<div class="cfill" style="--f:' + af + '%"></div>' : '') +
        '</div><span class="clabel num">T' + (w.wi + 1) + '</span></div>';
    }).join('');
    if (!chartSeen) { chartSeen = true; box.classList.add('in'); }
  }

  function renderProgress() {
    if (!block) return;
    var st = B.stats(block);
    el('pfill').style.width = st.pct + '%';
    el('pbar').setAttribute('aria-valuenow', st.pct);
    el('plabel').textContent = st.n + '/' + st.total + ' buổi đã chạy';
    el('pkm').textContent = C.fmtKm(st.km) + ' km';
  }

  /* ================= buổi tiếp theo ================= */
  function renderNext() {
    var box = el('next');
    if (!box) return;
    if (!block) {
      var d = R.daysUntil(race);
      box.innerHTML = '<div class="when"><span class="chip tag-now">' + (d >= 0 ? 'Còn ' + d + ' ngày' : 'Đã qua') + '</span></div>' +
        '<h2>' + C.esc(race.name) + '</h2>' +
        '<p class="detail">Chưa có giáo án cho giải này. Nhập buổi chạy tự do ở tab Nhập nhanh trên menu.</p>' +
        '<a class="btn" href="log.html">Mở Nhập nhanh</a>';
      return;
    }
    var t0 = C.today0();
    var nxt = sessions().filter(function (x) { return x.s.type !== 'rest' && !block.done[x.id] && x.date >= t0; })[0];
    if (!nxt) {
      box.innerHTML = '<div class="when"><span class="chip t-rest">Hết lịch</span></div><h2>Không còn buổi nào phía trước</h2><p class="detail">Mọi buổi từ hôm nay đã được đánh dấu hoặc đã qua.</p>';
      return;
    }
    var diff = Math.round((nxt.date - t0) / 864e5);
    var when = diff === 0 ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : 'Còn ' + diff + ' ngày nữa';
    box.innerHTML =
      '<div class="when"><span class="chip tag-now">' + when + '</span><span class="num">' + C.WD[nxt.off] + ' ' + C.fmt(nxt.date) + ' · Tuần ' + (nxt.wi + 1) + '</span><span class="chip t-' + nxt.s.type + '">' + C.LABEL[nxt.s.type] + '</span></div>' +
      '<h2>' + C.esc(nxt.s.title) + '</h2><p class="detail">' + C.esc(nxt.s.d) + '</p>' +
      (nxt.s.type === 'race' ? '' : '<button type="button" class="btn" data-done="' + nxt.id + '">Đánh dấu đã chạy</button>');
  }

  /* ================= tham khảo ================= */
  function renderReference() {
    var zEl = el('ref-paces'), rdEl = el('ref-raceday'), ruEl = el('ref-rules');
    if (zEl) {
      var zones = race.paceZones || [];
      zEl.innerHTML = zones.length ? '<h2 class="sec-title">Các mức pace</h2><div class="zones">' + zones.map(function (z) {
        return '<div class="zone"><span class="chip t-' + z.type + '">' + C.esc(z.label) + '</span><span class="pace num">' + C.esc(z.pace) + '</span><p>' + C.esc(z.note || '') + '</p></div>';
      }).join('') + '</div>' : '';
    }
    if (rdEl) {
      rdEl.innerHTML = '<h2>Ngày thi ' + C.fmt(C.fromIso(race.date)) + '/' + C.fromIso(race.date).getFullYear() + '</h2>' +
        (race.raceDayPlan ? '<p>' + C.esc(race.raceDayPlan) + '</p>' : '') +
        '<ul class="rules">' +
        (race.targetA ? '<li>Mục tiêu A: ' + C.esc(race.targetA) + '.' + (race.targetB ? ' Mục tiêu B: ' + C.esc(race.targetB) + '.' : '') + (race.targetC ? ' Mục tiêu C: ' + C.esc(race.targetC) + '.' : '') + '</li>' : '') +
        '</ul>';
    }
    if (ruEl) ruEl.innerHTML = C.TRAINING_RULES.map(function (r) { return '<li>' + C.esc(r) + '</li>'; }).join('');
  }

  /* ================= chúc mừng ================= */
  var CHEER = {
    easy: ['Xong buổi nhẹ!', 'Nhẹ nhàng mà chắc!', 'Thêm một buổi vào sổ!', 'Đều đặn là thắng!'],
    quality: ['Buổi chất lượng xong!', 'Ngưỡng vừa được đẩy lên!', 'Đó mới là tốc độ!'],
    long: ['Chạy dài xong!', 'Nền sức bền dày thêm một lớp!', 'Đường dài không làm khó được bạn!'],
    week: ['Trọn vẹn một tuần!', 'Không sót buổi nào cả tuần!', 'Tuần hoàn hảo!'],
    milestone: ['Cột mốc mới!', 'Giáo án đã đi được một đoạn dài!']
  };
  // "race" đọc race.name, chỉ biết được lúc chạy (sau boot), nên tách khỏi
  // bảng tĩnh ở trên — bảng đó được tạo ngay lúc nạp file, trước khi boot().
  function cheerFor(tier) {
    if (tier === 'race') return pick(['VỀ ĐÍCH!', race.name + ' — hoàn thành!', 'Bạn đã làm được!']);
    return pick(CHEER[tier]);
  }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function crossed(prev, now) {
    var marks = [25, 50, 75, 100];
    for (var i = marks.length - 1; i >= 0; i--) if (prev < marks[i] && now >= marks[i]) return marks[i];
    return 0;
  }
  function celebrate(sid, anchor, prevPct) {
    var x = findSession(sid);
    if (!x) return;
    var st = B.stats(block);
    var ms = crossed(prevPct, st.pct);
    var full = B.weekComplete(block, x.wi);
    var tier = x.s.type === 'race' ? 'race' : full ? 'week' : x.s.type === 'long' ? 'long' : x.s.type === 'quality' ? 'quality' : 'easy';
    if (ms === 100) tier = 'race'; else if (ms) tier = 'milestone';
    var sub;
    if (ms) sub = 'Đã xong ' + ms + '% giáo án · ' + st.n + '/' + st.total + ' buổi · ' + C.fmtKm(st.km) + ' km';
    else if (tier === 'week') sub = 'Tuần ' + (x.wi + 1) + ' trọn vẹn';
    else sub = x.s.title + (x.s.km ? ' · ' + C.fmtKm(x.s.km) + ' km' : '');
    C.FX.party(tier, anchor);
    C.toast(cheerFor(tier), sub);
  }

  /* ================= tổng hợp render ================= */
  function renderAll(focusId) {
    renderHeader();
    el('panel-chart-wrap').hidden = !block;
    el('panel-sched-wrap').hidden = !block;
    if (block) { renderSched(); renderChart(); renderProgress(); }
    renderNext();
    if (focusId) { var f = el(focusId); if (f) f.focus(); }
  }

  /* ================= sửa / xoá giải ================= */
  // Dùng chung js/race-form.js với trang chủ (nơi tạo giải).
  var delArmed = false;
  function syncDel() {
    var b = el('r-del');
    b.textContent = delArmed ? 'Chắc chắn xoá?' : 'Xoá giải';
    if (delArmed) b.setAttribute('data-armed', '1'); else b.removeAttribute('data-armed');
  }
  function openEdit() {
    var RF = window.RaceForm;
    delArmed = false; syncDel();
    el('race-template').innerHTML = RF.optionsHtml(block ? block.templateId : '');
    el('race-name').value = race.name;
    el('race-date').value = race.date;
    el('race-km').value = race.distanceKm || '';
    el('race-goal').value = race.targetA || '';
    el('race-template').value = block ? block.templateId : '';
    syncGen();
    el('race-form').hidden = false;
    el('r-manage-acts').hidden = true;
    el('race-name').focus();
  }
  function closeEdit() {
    el('race-form').hidden = true;
    el('r-manage-acts').hidden = false;
  }
  function syncGen() {
    var RF = window.RaceForm, v = el('race-template').value;
    el('race-template-desc').textContent = RF.describe(v);
    el('race-gen').hidden = v !== RF.GEN;
  }
  function saveEdit(e) {
    e.preventDefault();
    var res = window.RaceForm.save({ id: race.id, name: el('race-name').value, date: el('race-date').value,
                                     km: el('race-km').value, templateId: el('race-template').value,
                                     goal: el('race-goal').value, days: el('race-days').value, runs: runs });
    if (!res) return;
    if (res.error) { C.toast('Chưa lưu được', res.error); return; }
    race = res.race;
    block = race.blockId ? B.get(race.blockId) : null;
    tpl = block ? T.get(block.templateId) : null;
    chartSeen = false;
    closeEdit();
    renderAll();
    renderReference();
    C.toast('Đã lưu giải', res.swapped ? 'Đổi giáo án nên tiến độ cũ được làm lại' : race.name);
  }
  function deleteRace() {
    if (!delArmed) { delArmed = true; syncDel(); return; }
    window.RaceForm.remove(race.id);
    location.replace('index.html');
  }

  /* ================= tab ================= */
  var TAB_IDS = ['overview', 'ref'];
  function setTab(name, scroll) {
    if (TAB_IDS.indexOf(name) < 0) name = 'overview';
    TAB_IDS.forEach(function (n) {
      var btn = el('tab-' + n), pane = el('panel-' + n);
      if (!btn || !pane) return;
      var on = n === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      pane.hidden = !on;
      if (on) { pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in'); }
    });
    if (scroll) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } }
  }

  /* ================= sự kiện ================= */
  function on(target, ev, fn) {
    var node = typeof target === 'string' ? el(target) : target;
    if (node) node.addEventListener(ev, fn);
  }

  function bindEvents() {
    on('sched-fields', 'change', function (e) {
      var i = e.target && e.target.getAttribute('data-def');
      if (i == null) return;
      block.schedDef[+i] = +e.target.value; B.save(block); renderAll(e.target.id);
    });
    on('sched-reset', 'click', function () {
      block.schedDef = tpl.days.map(function (d) { return d.def; });
      block.schedWk = {};
      B.save(block); renderAll();
    });
    on('next', 'click', function (e) {
      var k = e.target && e.target.getAttribute('data-done');
      if (!k) return;
      var prev = B.stats(block).pct;
      B.setDone(block, k, true);
      celebrate(k, e.target, prev);
      renderAll();
    });
    on('r-edit', 'click', openEdit);
    on('race-cancel', 'click', closeEdit);
    on('race-form', 'submit', saveEdit);
    on('race-template', 'change', syncGen);
    on('r-del', 'click', deleteRace);
    on('m4', 'click', function () { block.mode = 4; B.save(block); renderAll(); });
    on('m3', 'click', function () { block.mode = 3; B.save(block); renderAll(); });
    on('tabs', 'click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-tab]') : null;
      if (b) setTab(b.getAttribute('data-tab'), true);
    });
  }

  /* ================= khởi động ================= */
  function boot() {
    race = R.get(raceId);
    if (!race) {
      document.querySelector('.wrap').innerHTML =
        '<section class="panel"><h2>Không tìm thấy giải này</h2>' +
        '<p class="hint">Có thể đường dẫn sai hoặc giải đã bị xoá.</p></section>';
      return;
    }
    block = race.blockId ? B.get(race.blockId) : null;
    tpl = block ? T.get(block.templateId) : null;
    bindEvents();
    setTab('overview', false);
    renderAll();
    renderReference();
    // Nhật ký chỉ cần cho bộ sinh giáo án (khối lượng hiện tại); nạp nền, không chặn trang.
    window.RunLog.loadRuns().then(function (all) { runs = all; }).catch(function () {});
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
