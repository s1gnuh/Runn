// Điều khiển plan.html — trang Lịch tập toàn cục. Gộp buổi tập của mọi
// giáo án đang theo (hoặc lọc về một giáo án): thẻ tổng quan, lịch tháng,
// chi tiết từng ngày và lịch tuần thu gọn, đánh dấu buổi đã chạy ngay tại đây.
(function () {
  'use strict';
  var C = window.Core, B = window.Blocks, R = window.Races, RL = window.RunLog, CH = window.Charts;
  var el = function (id) { return document.getElementById(id); };
  var on = function (id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); };
  var MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  var SEP = '::';
  var KIND_CHIP = { run: 't-easy', walk: 't-long', other: 't-rest' };

  var blocks = [], runs = [], sel = 'all', calMonth = null, calSel = '';
  // buổi đang sửa / đang chờ xác nhận xóa: "blockId::sessionId", hoặc "run:<id>" cho nhật ký
  var editKey = '', armedKey = '';
  var adaptItems = [], runsReady = false;
  var zones = null;   // vùng pace gợi ý từ kết quả thực tế (Predict), null khi chưa đủ dữ liệu
  var openWeeks = null; // { wi: true/false } tuần đang mở trong lịch tuần, null = theo mặc định

  /* ================= truy vấn ================= */
  function raceName(b) {
    var race = R.get(b.raceId);
    return race ? race.name : 'Giáo án chưa gắn giải';
  }
  function fullDate(d) { return C.fmt(d) + '/' + d.getFullYear(); }
  function wdName(d) { return C.WD[(d.getDay() + 6) % 7]; }
  function selected() {
    return sel === 'all' ? blocks : blocks.filter(function (b) { return b.id === sel; });
  }
  function singleBlock() {
    var s = selected();
    return s.length === 1 ? s[0] : null;
  }
  // Mọi buổi tập (trừ ngày nghỉ) của các giáo án đang xem, sắp theo ngày.
  function entries() {
    var out = [];
    selected().forEach(function (b) {
      B.sessionsOf(b).list.forEach(function (x) {
        if (x.s.type === 'rest') return;
        out.push({ b: b, x: x });
      });
    });
    out.sort(function (p, q) { return p.x.date - q.x.date || p.x.si - q.x.si; });
    return out;
  }
  function byDate() {
    var m = {};
    entries().forEach(function (e) { var k = C.iso(e.x.date); (m[k] = m[k] || []).push(e); });
    return m;
  }
  function photosOn(key) {
    return runs.filter(function (r) { return r.date === key; });
  }
  function bounds() {
    var list = entries();
    if (!list.length) return null;
    return { first: list[0].x.date, last: list[list.length - 1].x.date };
  }
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

  // Từng tuần của một giáo án: km kế hoạch, km của buổi đã đánh dấu, số buổi.
  function weekInfo(b) {
    var info = B.sessionsOf(b), tpl = info.tpl;
    if (!tpl) return null;
    var t0 = C.today0(), weeks = [], cur = -1;
    for (var wi = 0; wi < tpl.weeks.length; wi++) {
      var w = { wi: wi, start: B.dayOf(b, wi, 0), end: B.dayOf(b, wi, 6), plan: 0, done: 0, n: 0, nd: 0,
                ph: tpl.weeks[wi].ph || '', race: !!tpl.weeks[wi].race };
      info.list.forEach(function (x) {
        if (x.wi !== w.wi || x.s.type === 'rest') return;
        var km = Number(x.s.km) || 0;
        w.plan += km; w.n++;
        if (b.done[x.id]) { w.done += km; w.nd++; }
      });
      if (t0 >= w.start && t0 <= w.end) cur = wi;
      weeks.push(w);
    }
    return { tpl: tpl, weeks: weeks, cur: cur };
  }
  function fig(v, l) { return '<div class="fig"><b>' + v + '</b><span>' + C.esc(l) + '</span></div>'; }
  function countdown(race) {
    if (!race) return '';
    var d = R.daysUntil(race);
    if (d > 0) return '<b>' + d + '</b><span>ngày nữa thi</span>';
    if (d === 0) return '<b>Hôm nay</b><span>ngày thi</span>';
    return '<b>Xong</b><span>đã thi</span>';
  }

  /* ================= ô chọn + thẻ tổng quan ================= */
  function renderPick() {
    var opts = [];
    if (blocks.length > 1) opts.push('<option value="all"' + (sel === 'all' ? ' selected' : '') + '>Tất cả giáo án (' + blocks.length + ')</option>');
    blocks.forEach(function (b) {
      opts.push('<option value="' + b.id + '"' + (sel === b.id ? ' selected' : '') + '>'
        + C.esc(raceName(b)) + (B.isActive(b) ? ' · đang chạy' : '') + '</option>');
    });
    el('p-pick').innerHTML = opts.join('');
    el('p-pick-wrap').hidden = blocks.length < 2;
  }

  function renderHero() {
    var hero = el('p-hero'), body = el('p-hero-body');
    hero.hidden = !blocks.length;
    if (!blocks.length) return;
    var one = singleBlock();
    if (!one) {
      body.innerHTML = '<div class="ph-list">' + blocks.map(function (b) {
        var st = B.stats(b), race = R.get(b.raceId), d = race ? R.daysUntil(race) : null;
        return '<button type="button" class="ph-item" data-pick="' + b.id + '">'
          + '<span class="ph-item-top"><strong>' + C.esc(raceName(b)) + '</strong><span class="num">' + st.pct + '%</span></span>'
          + '<span class="bar"><i style="width:' + st.pct + '%"></i></span>'
          + '<span class="hint">' + st.n + '/' + st.total + ' buổi · ' + C.fmtKm(st.km) + ' km'
          + (d == null ? '' : d > 0 ? ' · còn ' + d + ' ngày' : d === 0 ? ' · thi hôm nay' : ' · đã thi') + '</span></button>';
      }).join('') + '</div>';
      return;
    }
    var wk = weekInfo(one), st = B.stats(one), race = R.get(one.raceId), t0 = C.today0();
    var sub = [wk && wk.tpl.name ? wk.tpl.name : '', race ? 'thi ' + fullDate(C.fromIso(race.date)) : ''].filter(Boolean).join(' · ');
    var curFig = !wk ? fig('—', 'tuần hiện tại')
      : wk.cur >= 0 ? fig((wk.cur + 1) + '<small>/' + wk.weeks.length + '</small>', 'tuần hiện tại')
      : t0 < wk.weeks[0].start ? fig(Math.round((wk.weeks[0].start - t0) / 864e5) + '<small>ngày</small>', 'nữa bắt đầu')
      : fig('Xong', wk.weeks.length + ' tuần');
    var html = '<div class="ph-top"><div class="ph-name"><h2>' + C.esc(raceName(one)) + '</h2>'
      + (sub ? '<span class="hint">' + C.esc(sub) + '</span>' : '') + '</div>'
      + (race ? '<div class="ph-count">' + countdown(race) + '</div>' : '') + '</div>'
      + '<div class="figs">' + fig(st.n + '<small>/' + st.total + '</small>', 'buổi đã chạy')
      + fig(C.fmtKm(st.km) + '<small>km</small>', 'đã chạy') + curFig + '</div>'
      + '<div class="ph-prog"><div class="bar"><i style="width:' + st.pct + '%"></i></div><span class="num">' + st.pct + '%</span></div>';
    if (wk) {
      var max = Math.max.apply(null, wk.weeks.map(function (w) { return w.plan; })) || 1;
      html += '<div class="pw" role="list" aria-label="Khối lượng từng tuần của giáo án">' + wk.weeks.map(function (w) {
        var state = w.wi === wk.cur ? ' now' : w.end < t0 ? ' past' : '';
        var head = 'Tuần ' + (w.wi + 1) + ' · ' + C.fmt(w.start) + ' – ' + C.fmt(w.end) + (w.ph ? ' · ' + w.ph : '');
        return '<button type="button" class="pw-w' + state + '" role="listitem" data-wk="' + w.wi + '"'
          + CH.tipAttrs(head, C.fmtKm(w.plan) + ' km|kế hoạch~' + C.fmtKm(w.done) + ' km|đã chạy~' + w.nd + '/' + w.n + '|buổi')
          + ' aria-label="' + C.esc(head + ': ' + C.fmtKm(w.done) + ' trên ' + C.fmtKm(w.plan) + ' km, ' + w.nd + ' trên ' + w.n + ' buổi') + '">'
          + '<span class="pw-col"><span class="pw-bar" style="height:' + (w.plan / max * 100).toFixed(1) + '%">'
          + '<i style="height:' + (w.plan ? w.done / w.plan * 100 : 0).toFixed(1) + '%"></i></span></span>'
          + '<span class="pw-n num">' + (w.wi + 1) + '</span></button>';
      }).join('') + '</div>'
        + '<div class="ch-legend"><span><i class="lk-bar pw-plan"></i>Km kế hoạch</span><span><i class="lk-bar"></i>Đã chạy</span>'
        + '<span><i class="lk-bar pw-cur"></i>Tuần này</span><span>Chạm vào cột để mở tuần đó</span></div>';
    }
    body.innerHTML = html;
    CH.bindTips(body);
  }

  /* ================= lịch tháng ================= */
  function renderCal() {
    var box = el('p-cal');
    if (!box) return;
    var b = bounds(), t0 = C.today0();
    if (!calMonth) {
      calMonth = b && t0 >= monthStart(b.first) && t0 <= b.last ? monthStart(t0) : monthStart(b ? b.first : t0);
    }
    el('p-cal-title').textContent = MONTHS[calMonth.getMonth()] + '/' + calMonth.getFullYear();
    if (b) {
      el('p-prev').disabled = calMonth <= monthStart(b.first);
      el('p-next').disabled = calMonth >= monthStart(b.last);
    }
    var map = byDate();
    var offset = (calMonth.getDay() + 6) % 7;
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1 - offset + i);
      var key = C.iso(d), list = map[key] || [];
      var all = list.length && list.every(function (e) { return !!e.b.done[e.x.id]; });
      var cls = ['cday'];
      if (!sameMonth(d, calMonth)) cls.push('out');
      if (key === C.iso(t0)) cls.push('today');
      if (key === calSel) cls.push('sel');
      if (all) cls.push('done');
      else if (list.length && d < t0) cls.push('miss');
      var dots = list.slice(0, 3).map(function (e) { return '<i class="cd-dot t-' + e.x.s.type + '"></i>'; }).join('');
      var names = list.map(function (e) { return e.x.s.title; }).join(', ');
      cells += '<button type="button" class="' + cls.join(' ') + '" data-day="' + key + '"'
        + ' aria-label="' + C.fmt(d) + (names ? ', ' + C.esc(names) + (all ? ', đã chạy' : d < t0 ? ', bỏ lỡ' : '') : ', không có buổi chạy') + '">'
        + '<span class="cd-num num">' + d.getDate() + '</span>'
        + (dots ? '<span class="cd-dots">' + dots + '</span>' : '')
        + (photosOn(key).length ? '<i class="cd-pic"></i>' : '')
        + '</button>';
    }
    box.innerHTML = cells;

    var mList = entries().filter(function (e) { return sameMonth(e.x.date, calMonth); });
    var nDone = 0, nMiss = 0, kmPlan = 0, kmDone = 0;
    mList.forEach(function (e) {
      var km = Number(e.x.s.km) || 0, dn = !!e.b.done[e.x.id];
      kmPlan += km;
      if (dn) { nDone++; kmDone += km; } else if (e.x.date < t0) nMiss++;
    });
    el('p-cal-sum').textContent = mList.length
      ? mList.length + ' buổi trong tháng · ' + nDone + ' đã chạy' + (nMiss ? ' · ' + nMiss + ' bỏ lỡ' : '')
        + ' · ' + C.fmtKm(kmDone) + '/' + C.fmtKm(kmPlan) + ' km'
      : 'Không có buổi nào trong tháng này.';
  }

  /* ================= sửa / xóa buổi tập ================= */
  var TYPES = [['easy', 'Nhẹ'], ['quality', 'Chất lượng'], ['long', 'Dài']];

  function isArmed(key) { return armedKey === key; }
  function delBtn(key) {
    return '<button type="button" class="btn-sm btn-xs"' + (isArmed(key) ? ' data-armed="1"' : '')
      + ' data-act="del" data-k="' + key + '">' + (isArmed(key) ? 'Chắc chắn xóa?' : 'Xóa') + '</button>';
  }
  function actsHtml(key, x) {
    return '<button type="button" class="btn-sm btn-xs" data-act="edit" data-k="' + key + '">Sửa</button>'
      + (x.adj ? '<button type="button" class="btn-sm btn-xs" data-act="reset-edit" data-k="' + key + '">Hoàn tác</button>' : '')
      + (x.s.type === 'race' ? '' : delBtn(key));
  }

  function editorHtml(key, x) {
    var s = x.s, race = s.type === 'race';
    return '<div class="sess-edit" data-ed="' + key + '">'
      + '<label class="fld"><span>Loại</span><select data-sf="type"' + (race ? ' disabled' : '') + '>'
      + (race ? '<option selected>Thi đấu</option>'
              : TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (s.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join(''))
      + '</select></label>'
      + '<label class="fld"><span>Km</span><input type="text" inputmode="decimal" data-sf="km" value="' + C.esc(String(s.km || 0)) + '"></label>'
      + '<label class="fld wide"><span>Tên buổi</span><input type="text" data-sf="title" value="' + C.esc(s.title) + '"></label>'
      + '<label class="fld wide"><span>Mô tả</span><textarea data-sf="d">' + C.esc(s.d || '') + '</textarea></label>'
      + '<div class="lg-actions">'
      + '<button type="button" class="btn-sm primary" data-act="save-edit" data-k="' + key + '">Lưu</button>'
      + '<button type="button" class="btn-sm" data-act="cancel-edit">Hủy</button>'
      + (x.edited ? '<button type="button" class="btn-sm" data-act="reset-edit" data-k="' + key + '">Về bản gốc</button>' : '')
      + '</div></div>';
  }

  function blockOf(key) { return B.get(key.split(SEP)[0]); }
  function sidOf(key) { return key.split(SEP)[1]; }
  function syncBlock(b) { for (var i = 0; i < blocks.length; i++) if (blocks[i].id === b.id) blocks[i] = b; }
  function entryOf(key) {
    var list = entries();
    for (var i = 0; i < list.length; i++) if (list[i].b.id + SEP + list[i].x.id === key) return list[i];
    return null;
  }

  function openWeek(wi) {
    if (!openWeeks) openWeeks = defaultOpen();
    openWeeks[wi] = true;
    renderWeeks();
    var t = document.querySelector('#p-weeks .week[data-wi="' + wi + '"]');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onAct(e) {
    var pick = e.target.closest ? e.target.closest('[data-pick]') : null;
    if (pick) { sel = pick.getAttribute('data-pick'); resetView(); renderAll(); return; }
    var wkBtn = e.target.closest ? e.target.closest('[data-wk]') : null;
    if (wkBtn) { CH.hideTip(); openWeek(Number(wkBtn.getAttribute('data-wk'))); return; }

    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act'), key = btn.getAttribute('data-k') || '';
    var b;

    if (act === 'adapt' || act === 'adapt-all') {
      applyAdapt(act === 'adapt' ? [adaptItems[Number(key)]] : adaptItems.slice());
    } else if (act === 'edit') {
      var en = entryOf(key);
      if (!en) return;
      armedKey = ''; editKey = key;
      // mở sửa từ lịch tuần thì nhảy sang đúng ngày để dùng chung một form
      calSel = C.iso(en.x.date); calMonth = monthStart(en.x.date);
      renderAll();
      var t = el('p-day'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'cancel-edit') {
      editKey = ''; renderAll();
    } else if (act === 'save-edit') {
      b = blockOf(key);
      var box = btn.closest('[data-ed]');
      if (!b || !box) return;
      var patch = {};
      [].forEach.call(box.querySelectorAll('[data-sf]'), function (n) {
        if (!n.disabled) patch[n.getAttribute('data-sf')] = n.value;
      });
      if (patch.km !== undefined) patch.km = String(patch.km).replace(',', '.');
      if (patch.title !== undefined && !patch.title.trim()) { C.toast('Chưa lưu được', 'Tên buổi không được để trống'); return; }
      syncBlock(B.editSession(b, sidOf(key), patch));
      editKey = ''; renderAll(); C.toast('Đã sửa buổi tập', '');
    } else if (act === 'reset-edit') {
      b = blockOf(key);
      if (!b) return;
      syncBlock(B.resetSession(b, sidOf(key)));
      editKey = ''; renderAll(); C.toast('Đã về bản gốc', '');
    } else if (act === 'del') {
      if (armedKey !== key) { armedKey = key; renderAll(); return; }
      b = blockOf(key);
      if (!b) return;
      syncBlock(B.removeSession(b, sidOf(key)));
      armedKey = ''; editKey = ''; renderAll(); C.toast('Đã xóa buổi tập', 'Khôi phục ở mục "Buổi đã xóa"');
    } else if (act === 'restore') {
      b = blockOf(key);
      if (!b) return;
      syncBlock(B.restoreSession(b, sidOf(key)));
      renderAll(); C.toast('Đã khôi phục buổi tập', '');
    } else if (act === 'run-del') {
      if (armedKey !== 'run:' + key) { armedKey = 'run:' + key; renderDay(); return; }
      RL.removeRun(key).then(function () {
        runs = runs.filter(function (r) { return r.id !== key; });
        armedKey = ''; renderCal(); renderDay(); C.toast('Đã xóa nhật ký', '');
      });
    }
  }

  function renderRemoved() {
    var wrap = el('p-removed-wrap'), box = el('p-removed');
    if (!wrap || !box) return;
    var rows = [];
    selected().forEach(function (b) {
      B.sessionsOf(b, { includeRemoved: true }).list.forEach(function (x) {
        if (x.removed) rows.push({ b: b, x: x });
      });
    });
    wrap.hidden = !rows.length;
    box.innerHTML = rows.map(function (r) {
      return '<div class="removed-item"><span class="chip t-' + r.x.s.type + '">' + C.LABEL[r.x.s.type] + '</span>'
        + '<strong>' + C.esc(r.x.s.title) + '</strong>'
        + '<span class="hint">' + fullDate(r.x.date)
        + (sel === 'all' && blocks.length > 1 ? ' · ' + C.esc(raceName(r.b)) : '') + '</span>'
        + '<button type="button" class="btn-sm" data-act="restore" data-k="' + r.b.id + SEP + r.x.id + '">Khôi phục</button></div>';
    }).join('');
  }

  /* ================= chi tiết một ngày ================= */
  function runCard(l) {
    var armed = armedKey === 'run:' + l.id, kind = l.kind || 'run';
    var stats = [];
    if (l.km) stats.push('<span><b class="num">' + C.esc(C.fmtNum(l.km, 2)) + '</b> km</span>');
    if (l.time) stats.push('<span><b class="num">' + C.esc(l.time) + '</b></span>');
    if (l.pace) stats.push('<span><b class="num">' + C.esc(l.pace) + '</b>/km</span>');
    return '<article class="rc' + (l.url ? ' has-pic' : '') + '">'
      + '<div class="rc-main">'
      + '<div class="rc-top"><span class="chip ' + (KIND_CHIP[kind] || 't-rest') + '">' + (RL.KIND[kind] || 'Chạy') + '</span>'
      + '<span class="hint">' + (l.cat === 'photo' ? 'Ảnh chạy' : 'Nhật ký chạy') + '</span></div>'
      + '<div class="rc-stats">' + (stats.length ? stats.join('') : '<span>—</span>') + '</div>'
      + (l.note ? '<p class="rc-note">' + C.esc(l.note) + '</p>' : '')
      + '<div class="rc-acts"><a class="btn-sm btn-xs" href="log.html?edit=' + l.id + '">Sửa</a>'
      + '<button type="button" class="btn-sm btn-xs"' + (armed ? ' data-armed="1"' : '') + ' data-act="run-del" data-k="' + l.id + '">'
      + (armed ? 'Chắc chắn?' : 'Xóa') + '</button></div></div>'
      + (l.url ? '<div class="rc-pic"><img src="' + l.url + '" loading="lazy" alt=""></div>' : '')
      + '</article>';
  }

  function renderDay() {
    var box = el('p-day');
    if (!box) return;
    if (!calSel) { box.innerHTML = '<p class="hint">Bấm vào một ngày trong lịch để xem buổi tập và ảnh của ngày đó.</p>'; return; }
    var d = C.fromIso(calSel), t0 = C.today0();
    var list = byDate()[calSel] || [];
    var pics = photosOn(calSel);
    var rel = d.getTime() === t0.getTime() ? 'Hôm nay' : d.getTime() === C.addDays(t0, 1).getTime() ? 'Ngày mai'
      : d.getTime() === C.addDays(t0, -1).getTime() ? 'Hôm qua' : '';
    var html = '<div class="cdh"><strong>' + wdName(d) + ', ' + fullDate(d) + '</strong>'
      + (rel ? '<span class="chip tag-now">' + rel + '</span>' : '') + '</div>';

    if (!list.length) {
      html += '<p class="hint">Không có buổi nào trong giáo án vào ngày này.</p>';
    } else {
      html += list.map(function (e) {
        var dn = !!e.b.done[e.x.id];
        var multi = sel === 'all' && blocks.length > 1;
        var key = e.b.id + SEP + e.x.id, type = e.x.s.type;
        var hint = window.Predict.hintFor(type, zones);
        return '<div class="sess s-' + type + (dn ? ' done' : '') + (e.x.date < t0 && !dn ? ' miss' : '') + '">'
          + '<label class="sess-check"><input type="checkbox" data-done="' + key + '"' + (dn ? ' checked' : '')
          + ' aria-label="Đã chạy ' + C.esc(e.x.s.title) + '"></label>'
          + '<div class="sess-main">'
          + '<div class="sess-top"><span class="chip t-' + type + '">' + C.LABEL[type] + '</span>'
          + (e.x.edited ? '<span class="tag-edited">' + (e.x.adj ? 'tự điều chỉnh' : 'đã sửa') + '</span>' : '')
          + (dn ? '<span class="sess-st ok">Đã chạy</span>' : e.x.date < t0 ? '<span class="sess-st">Bỏ lỡ</span>' : '')
          + '<span class="sess-km num">' + C.fmtKm(e.x.s.km) + ' km</span></div>'
          + '<strong class="sess-title">' + C.esc(e.x.s.title) + '</strong>'
          + (multi ? '<span class="hint">' + C.esc(raceName(e.b)) + '</span>' : '')
          + (editKey === key ? editorHtml(key, e.x)
              : (e.x.s.d ? '<p class="cdn">' + C.esc(e.x.s.d) + '</p>' : '')
                + (e.x.adj ? '<p class="cdn adj-why">' + C.esc(e.x.adj.why) + '</p>' : '')
                + (dn || !hint ? '' : '<p class="cdn pace-hint">' + C.esc(hint) + '</p>')
                + '<div class="sess-acts">' + actsHtml(key, e.x) + '</div>')
          + '</div></div>';
      }).join('');
    }

    if (pics.length) html += '<div class="cal-cards">' + pics.map(runCard).join('') + '</div>';
    html += '<a class="btn-sm" href="log.html?date=' + calSel + '">+ Nhập buổi chạy cho ngày này</a>';
    box.innerHTML = html;
  }

  /* ================= lịch tuần (chỉ khi chọn 1 giáo án) ================= */
  // Mặc định chỉ mở tuần đang chạy (chưa bắt đầu thì tuần đầu, xong rồi thì tuần cuối).
  function defaultOpen() {
    var one = singleBlock(), wk = one && weekInfo(one), o = {};
    if (!wk) return o;
    o[wk.cur >= 0 ? wk.cur : C.today0() < wk.weeks[0].start ? 0 : wk.weeks.length - 1] = true;
    return o;
  }
  function renderWeeks() {
    var wrap = el('p-weeks-wrap'), box = el('p-weeks');
    var one = singleBlock();
    if (!one) { wrap.hidden = true; return; }
    var info = B.sessionsOf(one), tpl = info.tpl, wk = weekInfo(one);
    if (!tpl) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (!openWeeks) openWeeks = defaultOpen();
    var t0 = C.today0(), html = '';
    wk.weeks.forEach(function (w) {
      var wi = w.wi, cur = wi === wk.cur, full = B.weekComplete(one, wi), past = w.end < t0;
      var rows = '';
      info.list.filter(function (x) { return x.wi === wi; }).forEach(function (x) {
        var dn = !!one.done[x.id], rest = x.s.type === 'rest', key = one.id + SEP + x.id;
        rows += '<div class="row r-' + x.s.type + (dn ? ' done' : '') + (!rest && !dn && x.date < t0 ? ' miss' : '') + '">'
          + (rest
              ? '<span class="spacer"></span>'
              : '<input type="checkbox" data-done="' + key + '"' + (dn ? ' checked' : '')
                + ' aria-label="Đã chạy ' + C.esc(x.s.title) + '">')
          + '<div class="day"><b>' + wdName(x.date) + '</b><span class="num">' + C.fmt(x.date) + '</span></div>'
          + '<div class="what"><strong>' + C.esc(x.s.title) + '</strong>'
          + (x.edited ? '<span class="tag-edited">' + (x.adj ? 'tự điều chỉnh' : 'đã sửa') + '</span>' : '')
          + (x.s.d ? '<p>' + C.esc(x.s.d) + '</p>' : '')
          + '<div class="row-foot">' + (rest ? '' : actsHtml(key, x))
          + '<details class="note-box"><summary>Ghi chú' + (one.notes[x.id] ? ' ●' : '') + '</summary>'
          + '<textarea class="note-ta" data-note="' + key + '" rows="2">' + C.esc(one.notes[x.id] || '') + '</textarea>'
          + '</details></div></div>'
          + '<div class="kmv num">' + (x.s.km ? C.fmtKm(x.s.km) + ' km' : '—') + '</div>'
          + '</div>';
      });
      var pct = w.n ? Math.round(w.nd / w.n * 100) : 0, wkTpl = tpl.weeks[wi];
      html += '<details class="week' + (cur ? ' current' : '') + (full ? ' full' : '') + (past && !full ? ' past' : '') + '" data-wi="' + wi + '"'
        + (openWeeks[wi] ? ' open' : '') + '>'
        + '<summary class="wk-sum">'
        + '<div class="wk-head"><h3>Tuần ' + (wi + 1) + '</h3>'
        + '<span class="dates num">' + C.fmt(w.start) + ' – ' + C.fmt(w.end) + '</span>'
        + '<span class="sp"></span>'
        + '<span class="km num">' + C.fmtKm(w.done) + '<small>/' + C.fmtKm(w.plan) + ' km</small></span></div>'
        + '<div class="wk-phase">'
        + (w.ph ? '<span class="chip t-' + (w.race ? 'race' : 'easy') + '">' + C.esc(w.ph) + '</span>' : '')
        + (cur ? '<span class="chip tag-now">Tuần này</span>' : '')
        + (full ? '<span class="chip t-easy chip-full">Đủ tuần</span>' : '')
        + '<span class="wk-count num">' + w.nd + '/' + w.n + ' buổi</span></div>'
        + '<div class="bar wk-bar"><i style="width:' + pct + '%"></i></div>'
        + '</summary>'
        + rows
        + (wkTpl.nt ? '<div class="wk-note">' + C.esc(wkTpl.nt) + '</div>' : '')
        + '</details>';
    });
    box.innerHTML = html;
  }

  /* ================= gợi ý chỉnh giáo án ================= */
  function renderAdapt() {
    var wrap = el('p-adapt');
    if (!wrap) return;
    var unfinished = selected();
    wrap.hidden = !runsReady || !unfinished.length;
    if (wrap.hidden) return;
    adaptItems = [];
    unfinished.forEach(function (b) {
      window.Adapt.propose(b, runs).forEach(function (it) { adaptItems.push(it); });
    });
    el('p-adapt-auto').checked = window.Adapt.isAuto();
    el('p-adapt-all').hidden = adaptItems.length < 2;
    el('p-adapt-sum').textContent = adaptItems.length
      ? adaptItems.length + ' gợi ý dựa trên nhịp tập gần đây của bạn.'
      : (runs.length ? 'Giáo án đang khớp với nhịp tập và khả năng hiện tại, chưa có gợi ý nào.'
                     : 'Nhập vài buổi chạy ở tab Nhập nhanh để app có cơ sở gợi ý.');
    el('p-adapt-list').innerHTML = adaptItems.map(function (it, i) {
      var b = B.get(it.blockId);
      return '<article class="adapt-item lv-' + it.level + '">'
        + '<div class="adapt-top"><strong>' + C.esc(it.title) + '</strong>'
        + '<span class="chip ' + (it.level === 'high' ? 'conf-lo' : it.level === 'info' ? 'conf-hi' : 'conf-mid') + '">' + it.changes.length + ' buổi</span></div>'
        + (blocks.length > 1 && b ? '<p class="hint">' + C.esc(raceName(b)) + '</p>' : '')
        + '<p class="adapt-why">' + C.esc(it.why) + '</p>'
        + '<details class="adapt-more"><summary>Xem ' + it.changes.length + ' buổi sẽ thay đổi</summary>'
        + '<ul class="adapt-diff">' + it.changes.map(function (c) { return '<li>' + C.esc(c.line) + '</li>'; }).join('') + '</ul></details>'
        + '<button type="button" class="btn-sm primary" data-act="adapt" data-k="' + i + '">' + (it.restore ? 'Khôi phục' : 'Áp dụng') + '</button>'
        + '</article>';
    }).join('');
  }

  function applyAdapt(items) {
    var n = 0;
    items.forEach(function (it) {
      if (!it) return;
      var r = window.Adapt.applyItem(B.get(it.blockId), it);
      syncBlock(r.block); n += r.n;
    });
    renderAll();
    C.toast(n ? 'Đã chỉnh ' + n + ' buổi' : 'Không có gì để chỉnh', n ? 'Bấm Hoàn tác ở từng buổi nếu muốn quay lại' : '');
  }

  /* ================= ăn mừng ================= */
  function celebrate(b, sid, anchor) {
    var x = B.findSession(b, sid);
    if (!x) return;
    var full = B.weekComplete(b, x.wi);
    var tier = x.s.type === 'race' ? 'race' : full ? 'week' : x.s.type === 'long' ? 'long'
             : x.s.type === 'quality' ? 'quality' : 'easy';
    C.FX.party(tier, anchor);
    var st = B.stats(b);
    C.toast(full ? 'Đủ tuần ' + (x.wi + 1) + '!' : 'Xong buổi này',
            st.n + '/' + st.total + ' buổi · ' + C.fmtKm(st.km) + ' km');
  }

  /* ================= render + sự kiện ================= */
  function resetView() { calMonth = null; calSel = C.iso(C.today0()); editKey = ''; armedKey = ''; openWeeks = null; }

  function renderAll() {
    renderPick();
    var has = blocks.length > 0;
    el('p-empty').hidden = has;
    el('p-cal-wrap').hidden = !has;
    renderHero();
    if (!has) { el('p-weeks-wrap').hidden = true; el('p-removed-wrap').hidden = true; el('p-adapt').hidden = true; return; }
    renderCal(); renderDay(); renderWeeks(); renderRemoved(); renderAdapt();
  }

  function markDone(key, checked, anchor) {
    var parts = key.split(SEP);
    var b = B.get(parts[0]);
    if (!b) return;
    B.setDone(b, parts[1], checked);
    // đồng bộ lại bản trong mảng để render dùng dữ liệu mới
    for (var i = 0; i < blocks.length; i++) if (blocks[i].id === b.id) blocks[i] = b;
    if (checked) celebrate(b, parts[1], anchor);
    renderAll();
  }

  function bind() {
    on('p-pick', 'change', function (e) { sel = e.target.value; resetView(); renderAll(); });
    on('p-prev', 'click', function () {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal();
    });
    on('p-next', 'click', function () {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal();
    });
    on('p-cal', 'click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-day]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-day');
      calSel = calSel === key ? '' : key;
      editKey = ''; armedKey = '';
      renderCal(); renderDay();
    });
    on('p-jump', 'click', function () {
      var one = singleBlock(), wk = one && weekInfo(one);
      if (wk) openWeek(wk.cur >= 0 ? wk.cur : 0);
    });
    // 'toggle' không nổi bọt nên bắt ở pha capture để nhớ tuần nào đang mở qua các lần vẽ lại.
    document.addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d.classList || !d.classList.contains('week')) return;
      if (!openWeeks) openWeeks = defaultOpen();
      openWeeks[d.getAttribute('data-wi')] = d.open;
    }, true);

    document.addEventListener('click', onAct);
    on('p-adapt-auto', 'change', function (e) {
      window.Adapt.setAuto(e.target.checked);
      if (e.target.checked && runsReady) {
        if (window.Adapt.auto(runs)) blocks = B.list();
        renderAll();
      }
    });

    // đánh dấu đã chạy — dùng chung cho cả chi tiết ngày và lịch tuần
    document.addEventListener('change', function (e) {
      var node = e.target;
      if (!node) return;
      var dk = node.getAttribute && node.getAttribute('data-done');
      if (dk) { markDone(dk, node.checked, node); return; }
      var nk = node.getAttribute && node.getAttribute('data-note');
      if (nk) {
        var parts = nk.split(SEP), b = B.get(parts[0]);
        if (b) { B.setNote(b, parts[1], node.value); }
      }
    });
  }

  function boot() {
    var d = new Date();
    el('p-eyebrow').textContent = wdName(d) + ', ' + fullDate(d);
    blocks = B.list();
    // mặc định: nếu đang có đúng một giáo án chạy thì mở sẵn nó
    var active = blocks.filter(B.isActive);
    sel = blocks.length === 1 ? blocks[0].id : (active.length === 1 ? active[0].id : 'all');
    calSel = C.iso(C.today0());
    bind();
    renderAll();
    RL.loadRuns().then(function (all) {
      runs = all;
      runsReady = true;
      zones = window.Predict.compute(all).zones;
      if (window.Adapt.auto(all)) blocks = B.list();
      renderAll();
    });
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
