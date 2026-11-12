// Điều khiển stats.html — tổng quan tuần, số liệu so với kỳ trước, lịch hoạt
// động, khối lượng, xu hướng pace, phân bố cự ly, PR, dự đoán, mục tiêu, giày
// và báo cáo AI. Biểu đồ dựng bằng js/charts.js.
(function () {
  'use strict';
  var C = window.Core, B = window.Blocks, RL = window.RunLog, G = window.Goals, S = window.Shoes, CH = window.Charts;
  var el = function (id) { return document.getElementById(id); };
  var on = function (id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); };
  var runs = [];
  var SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  /* ================= tiện ích ================= */
  function wdName(d) { return C.WD[(d.getDay() + 6) % 7]; }
  function fullDate(d) { return C.fmt(d) + '/' + d.getFullYear(); }
  function isRun(r) { return r.kind !== 'walk' && !!r.date && Number(r.km) > 0; }
  function between(r, a, b) { var d = C.fromIso(r.date); return d >= a && d <= b; }
  function countIn(a, b) { return runs.filter(function (r) { return isRun(r) && between(r, a, b); }).length; }
  function dayKm() {
    var m = {};
    runs.forEach(function (r) { if (isRun(r)) m[r.date] = (m[r.date] || 0) + Number(r.km); });
    return m;
  }
  function longestStreak(keys) {
    var best = 0, cur = 0, prev = null;
    keys.slice().sort().forEach(function (k) {
      var d = C.fromIso(k);
      cur = prev && Math.round((d - prev) / 864e5) === 1 ? cur + 1 : 1;
      if (cur > best) best = cur;
      prev = d;
    });
    return best;
  }
  // Pace trung bình (tổng giây / tổng km) của buổi chạy cách hôm nay [from, to) ngày.
  function paceAvg(from, to) {
    var t0 = C.today0(), km = 0, sec = 0;
    runs.forEach(function (r) {
      var k = Number(r.km), s = RL.parseTime(r.time);
      if (r.kind !== 'run' || !(k > 0) || !(s > 0) || !r.date) return;
      var age = Math.round((t0 - C.fromIso(r.date)) / 864e5);
      if (age >= from && age < to) { km += k; sec += s; }
    });
    return km ? Math.round(sec / km) : 0;
  }
  // good: true = tăng là tốt, false = giảm là tốt
  function delta(diff, text, basis, upIsGood) {
    if (!diff) return '<span class="delta flat"><b>Không đổi</b> ' + C.esc(basis) + '</span>';
    var good = diff > 0 === upIsGood;
    return '<span class="delta ' + (good ? 'good' : 'bad') + '"><b>' + (diff > 0 ? '▲ ' : '▼ ') + C.esc(text) + '</b> ' + C.esc(basis) + '</span>';
  }
  function fig(v, l) { return '<div class="fig"><b>' + v + '</b><span>' + C.esc(l) + '</span></div>'; }

  function renderHeader() {
    var d = new Date();
    el('st-eyebrow').textContent = wdName(d) + ', ' + fullDate(d);
  }

  /* ================= tuần này ================= */
  // Mốc so sánh ưu tiên mục tiêu km/tuần người dùng đặt; chưa đặt thì lấy
  // trung bình 8 tuần trước làm chuẩn để vòng vẫn có ý nghĩa.
  function renderWeek() {
    var t0 = C.today0(), wk = RL.thisWeekRange(t0);
    var km = RL.kmBetween(runs, wk.start, wk.end), sessions = countIn(wk.start, wk.end);
    var lastKm = RL.kmBetween(runs, C.addDays(wk.start, -7), C.addDays(wk.end, -7));
    var goal = G.all().filter(function (g) { return g.type === 'weekly_km' && g.target > 0; })[0];
    var prev = RL.weeklyKmSeries(runs, 9).slice(0, 8);
    var avg = prev.reduce(function (a, w) { return a + w.km; }, 0) / (prev.length || 1);
    var target = goal ? Number(goal.target) : avg;
    var pctRaw = target > 0 ? Math.round(km / target * 100) : 0, pct = Math.min(100, pctRaw);

    el('week-range').textContent = C.fmt(wk.start) + ' – ' + C.fmt(wk.end);
    var R = 52, CIRC = 2 * Math.PI * R;
    el('week-ring').innerHTML =
      '<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Đã chạy ' + C.fmtKm(km) + ' km tuần này' + (target > 0 ? ', đạt ' + pctRaw + '%' : '') + '">' +
      '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop class="ring-g1" offset="0%"/><stop class="ring-g2" offset="100%"/></linearGradient></defs>' +
      '<circle class="ring-track" cx="60" cy="60" r="' + R + '"/>' +
      '<circle class="ring-fill" cx="60" cy="60" r="' + R + '" stroke-dasharray="' + CIRC.toFixed(1) + '"' +
      ' stroke-dashoffset="' + (CIRC * (1 - pct / 100)).toFixed(1) + '"/>' +
      '</svg>' +
      '<div class="ring-center"><div class="ring-v">' + C.fmtKm(km) + '</div><div class="ring-l">km</div></div>';

    var basis = goal
      ? 'mục tiêu ' + C.fmtNum(goal.target) + ' km/tuần'
      : (avg > 0 ? 'so với trung bình 8 tuần (' + C.fmtKm(avg) + ' km)' : 'chưa có mốc so sánh, đặt mục tiêu ở dưới');
    el('week-side').innerHTML =
      '<div class="ring-stat lead"><b>' + (target > 0 ? pctRaw + '%' : '—') + '</b><span>' + C.esc(basis) + '</span></div>' +
      '<div class="ring-stat"><b>' + sessions + '</b><span>buổi chạy</span></div>' +
      '<div class="ring-stat"><b>' + C.fmtKm(lastKm) + '</b><span>km tuần trước</span></div>';

    var days = dayKm(), vals = [], max = 0, i;
    for (i = 0; i < 7; i++) { vals[i] = days[C.iso(C.addDays(wk.start, i))] || 0; if (vals[i] > max) max = vals[i]; }
    var box = el('week-days');
    box.innerHTML = vals.map(function (v, i) {
      var d = C.addDays(wk.start, i), fut = d > t0, today = d.getTime() === t0.getTime();
      return '<div class="wd' + (v ? ' on' : '') + (fut ? ' fut' : '') + (today ? ' today' : '') + '" tabindex="0"'
        + CH.tipAttrs(wdName(d) + ', ' + C.fmt(d), v ? C.fmtKm(v) + ' km|đã chạy' : fut ? '|chưa tới' : '|nghỉ') + '>'
        + '<div class="wd-track"><i style="height:' + (v ? Math.max(8, v / max * 100) : 0).toFixed(1) + '%"></i></div>'
        + '<b>' + SHORT[i] + '</b><span class="num">' + (v ? C.fmtKm(v) : fut ? '' : '·') + '</span></div>';
    }).join('');
    CH.bindTips(box);
  }

  /* ================= số liệu so với kỳ trước ================= */
  function renderTiles() {
    var t0 = C.today0(), P = window.Predict;
    var mS = new Date(t0.getFullYear(), t0.getMonth(), 1);
    var pmS = new Date(t0.getFullYear(), t0.getMonth() - 1, 1);
    var pmLast = new Date(t0.getFullYear(), t0.getMonth(), 0).getDate();
    var pmE = new Date(pmS.getFullYear(), pmS.getMonth(), Math.min(t0.getDate(), pmLast));
    var mKm = RL.kmBetween(runs, mS, t0), pmKm = RL.kmBetween(runs, pmS, pmE);
    var mN = countIn(mS, t0), pmN = countIn(pmS, pmE);
    var days = dayKm(), streak = RL.computeStreak(runs), best = longestStreak(Object.keys(days));
    var a30 = paceAvg(0, 30), p30 = paceAvg(30, 60);
    var real = runs.filter(isRun);
    var totalKm = real.reduce(function (a, r) { return a + Number(r.km); }, 0);
    var first = real.reduce(function (a, r) { return !a || r.date < a ? r.date : a; }, '');
    var totalSec = RL.totalTimeSecs(runs);
    var timed = runs.filter(function (r) { return RL.parseTime(r.time) > 0; });
    var basis = 'so với cùng kỳ tháng trước';

    var kmD = !pmKm ? '<span class="delta flat">' + (mKm ? 'Cùng kỳ tháng trước chưa chạy' : 'Chưa có buổi nào tháng này') + '</span>'
      : delta(Math.round((mKm - pmKm) / pmKm * 100), Math.abs(Math.round((mKm - pmKm) / pmKm * 100)) + '%', basis, true);
    var nD = !pmN && !mN ? '<span class="delta flat">Chưa có buổi nào</span>' : delta(mN - pmN, Math.abs(mN - pmN) + ' buổi', basis, true);
    var pD = !a30 ? '<span class="delta flat">Cần buổi có ghi thời gian</span>'
      : !p30 ? '<span class="delta flat">Chưa có dữ liệu 30 ngày trước đó</span>'
      : delta(a30 - p30, (a30 < p30 ? 'nhanh hơn ' : 'chậm hơn ') + Math.abs(a30 - p30) + ' giây', 'so với 30 ngày trước', false);

    var tiles = [
      { l: 'Km tháng này', v: C.fmtKm(mKm), u: 'km', s: kmD },
      { l: 'Buổi chạy tháng này', v: mN, u: 'buổi', s: nD },
      { l: 'Chuỗi ngày chạy', v: streak, u: 'ngày', s: '<span class="tile-s">Dài nhất ' + best + ' ngày</span>' },
      { l: 'Pace trung bình 30 ngày', v: a30 ? P.paceText(a30) : '—', u: a30 ? '/km' : '', s: pD },
      { l: 'Tổng quãng đường', v: C.fmtKm(totalKm), u: 'km', s: '<span class="tile-s">' + real.length + ' buổi' + (first ? ' từ ' + fullDate(C.fromIso(first)) : '') + '</span>' },
      { l: 'Tổng thời gian', v: C.esc(C.fmtDuration(totalSec)), u: '', s: '<span class="tile-s">' + (timed.length ? 'Trung bình ' + Math.round(totalSec / timed.length / 60) + ' phút mỗi buổi' : 'Chưa có buổi ghi thời gian') + '</span>' }
    ];
    el('stat-grid').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="tile-l">' + C.esc(t.l) + '</div>'
        + '<div class="tile-v">' + t.v + (t.u ? '<small>' + t.u + '</small>' : '') + '</div>' + t.s + '</div>';
    }).join('');
  }

  /* ================= lịch hoạt động ================= */
  var hmWeeks = 0;
  function heatWeeks() {
    var w = el('hm-box').clientWidth || 300;
    return Math.max(12, Math.min(26, Math.floor((w - 28) / 19)));
  }
  function level(km) { return !km ? 0 : km < 5 ? 1 : km < 10 ? 2 : km < 15 ? 3 : 4; }
  function renderHeatmap() {
    var box = el('hm-box'), t0 = C.today0(), weeks = heatWeeks(), days = dayKm();
    hmWeeks = weeks;
    box.innerHTML = CH.heatmap({
      days: days, weeks: weeks, today: t0, level: level,
      tip: function (d, km) { return [wdName(d) + ', ' + fullDate(d), km ? C.fmtKm(km) + ' km|đã chạy' : '|nghỉ']; }
    });
    var start = C.addDays(t0, -((t0.getDay() + 6) % 7) - 7 * (weeks - 1));
    var keys = Object.keys(days).filter(function (k) { var d = C.fromIso(k); return d >= start && d <= t0; });
    var km = keys.reduce(function (a, k) { return a + days[k]; }, 0);
    el('hm-range').textContent = weeks + ' tuần gần nhất';
    el('hm-figs').innerHTML = fig(keys.length, 'ngày có chạy') + fig(C.fmtKm(km) + '<small>km</small>', 'tổng quãng đường')
      + fig(longestStreak(keys) + '<small>ngày</small>', 'chuỗi dài nhất');
    var grid = box.querySelector('.hm-grid');
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', keys.length + ' ngày có chạy trong ' + weeks + ' tuần gần nhất, tổng ' + C.fmtKm(km) + ' km');
    CH.bindTips(box);
  }

  /* ================= khối lượng theo tuần / tháng ================= */
  var volMode = C.store.get('app-stats-vol') === 'month' ? 'month' : 'week';
  function syncVolSeg() {
    [].forEach.call(el('vol-seg').querySelectorAll('[data-vol]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-vol') === volMode ? 'true' : 'false');
    });
  }
  function renderVolume() {
    var t0 = C.today0(), items = [], rows = [], week = volMode === 'week';
    function push(label, name, a, b, km, now) {
      var n = countIn(a, b), head = name + (now ? (week ? ' (tuần này)' : ' (tháng này)') : '');
      items.push({ label: label, value: km, now: now, head: head,
                   rows: C.fmtKm(km) + ' km|quãng đường~' + n + '|buổi chạy',
                   aria: head + ': ' + C.fmtKm(km) + ' km, ' + n + ' buổi' });
      rows.push([name, C.fmtKm(km), String(n)]);
    }
    if (week) {
      RL.weeklyKmSeries(runs, 12).forEach(function (w, i, all) {
        var now = i === all.length - 1;
        push(now ? 'Nay' : C.fmt(w.start), 'Tuần ' + C.fmt(w.start) + ' – ' + C.fmt(w.end), w.start, w.end, w.km, now);
      });
    } else {
      for (var i = 11; i >= 0; i--) {
        var s = new Date(t0.getFullYear(), t0.getMonth() - i, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
        push('T' + (s.getMonth() + 1), 'Tháng ' + (s.getMonth() + 1) + '/' + s.getFullYear(), s, e, RL.kmBetween(runs, s, e), i === 0);
      }
    }
    // Trung bình chỉ tính các kỳ đã xong, kể từ kỳ đầu tiên có chạy.
    var past = items.slice(0, -1), firstIdx = -1;
    past.forEach(function (it, i) { if (firstIdx < 0 && it.value > 0) firstIdx = i; });
    var used = firstIdx < 0 ? [] : past.slice(firstIdx);
    var avg = used.length ? used.reduce(function (a, it) { return a + it.value; }, 0) / used.length : 0;
    var total = items.reduce(function (a, it) { return a + it.value; }, 0), peak = items[0];
    items.forEach(function (it) { if (it.value > peak.value) peak = it; });

    el('vol-chart').innerHTML = CH.columns({ items: items, avg: avg, fmt: function (v) { return C.fmtNum(v, 1); } });
    CH.bindTips(el('vol-chart'));
    var unit = week ? 'tuần' : 'tháng';
    el('vol-legend').innerHTML = '<span><i class="lk-bar"></i>Km mỗi ' + unit + '</span>'
      + '<span><i class="lk-bar now"></i>' + (week ? 'Tuần' : 'Tháng') + ' này, đang chạy</span>'
      + (avg ? '<span><i class="lk-ref"></i>Trung bình ' + used.length + ' ' + unit + ' trước</span>' : '');
    el('vol-sum').textContent = total
      ? 'Tổng ' + C.fmtKm(total) + ' km trong 12 ' + unit + ' gần nhất. Cao nhất ' + C.fmtKm(peak.value) + ' km (' + peak.head.replace(/ \(.*\)$/, '') + ').'
      : 'Chưa có buổi chạy nào trong 12 ' + unit + ' gần nhất.';
    el('vol-table').innerHTML = CH.table([week ? 'Tuần' : 'Tháng', 'Km', 'Buổi'], rows.slice().reverse());
  }

  /* ================= nhận xét xu hướng ================= */
  function renderInsights() {
    var series = RL.weeklyKmSeries(runs, 8), notes = [];
    var curWeek = series[series.length - 1].km;
    var prevAvg = series.slice(0, -1).reduce(function (a, w) { return a + w.km; }, 0) / Math.max(1, series.length - 1);
    if (prevAvg > 0 && curWeek > prevAvg * 1.1) {
      notes.push(['warn', 'Km tuần này (' + C.fmtKm(curWeek) + ') cao hơn trung bình 7 tuần trước (' + C.fmtKm(prevAvg) + ') hơn 10%. Nguyên tắc tăng tải không quá 10%/tuần, cân nhắc giữ nhịp hoặc thêm một buổi nghỉ.']);
    } else if (prevAvg > 0 && curWeek < prevAvg * 0.6) {
      notes.push(['info', 'Km tuần này thấp hơn nhiều so với trung bình gần đây. Nếu không phải tuần giảm tải chủ động, có thể bù nhẹ nhàng vào cuối tuần.']);
    }
    var activeBlocks = B.list().filter(B.isActive);
    if (activeBlocks.length) {
      var qTotal = 0, qDone = 0, lTotal = 0, lDone = 0, t0 = C.today0(), from = C.addDays(t0, -27);
      activeBlocks.forEach(function (b) {
        B.sessionsOf(b).list.forEach(function (x) {
          if (x.date < from || x.date > t0) return;
          if (x.s.type === 'quality') { qTotal++; if (b.done[x.id]) qDone++; }
          if (x.s.type === 'long') { lTotal++; if (b.done[x.id]) lDone++; }
        });
      });
      if (qTotal) notes.push([qDone / qTotal >= 0.8 ? 'ok' : 'warn', 'Buổi chất lượng 4 tuần gần đây: hoàn thành ' + qDone + '/' + qTotal + '.']);
      if (lTotal) notes.push([lDone / lTotal >= 0.8 ? 'ok' : 'warn', 'Buổi chạy dài 4 tuần gần đây: hoàn thành ' + lDone + '/' + lTotal + '.']);
    }
    if (!notes.length) notes.push(['info', 'Chưa đủ dữ liệu để đưa ra nhận xét, cứ tiếp tục ghi nhật ký đều đặn.']);
    el('analysis-notes').innerHTML = notes.slice(0, 3).map(function (n) {
      return '<li class="' + n[0] + '">' + C.esc(n[1]) + '</li>';
    }).join('');
  }

  /* ================= xu hướng pace ================= */
  var paceWidth = 0;
  function renderPace() {
    var box = el('pace-chart'), P = window.Predict, t0 = C.today0(), from = C.addDays(t0, -119);
    paceWidth = box.clientWidth;
    var list = runs.filter(function (r) {
      if (r.kind !== 'run' || !r.date) return false;
      var km = Number(r.km), sec = RL.parseTime(r.time), d = C.fromIso(r.date), p = sec / km;
      return km >= 1 && sec > 0 && d >= from && d <= t0 && p >= 150 && p <= 720;
    }).sort(function (a, b) { return a.date.localeCompare(b.date) || (a.added || 0) - (b.added || 0); });

    if (list.length < 3) {
      box.innerHTML = '<div class="ch-empty">Cần ít nhất 3 buổi chạy có ghi cả km lẫn thời gian trong 120 ngày qua để vẽ xu hướng.</div>';
      el('pace-legend').hidden = true; el('pace-sum').textContent = ''; el('pace-table').innerHTML = '';
      return;
    }
    var fastest = null;
    var pts = list.map(function (r, i) {
      var km = 0, sec = 0;
      list.slice(Math.max(0, i - 4), i + 1).forEach(function (x) { km += Number(x.km); sec += RL.parseTime(x.time); });
      var d = C.fromIso(r.date), v = Math.round(RL.parseTime(r.time) / Number(r.km)), avg = Math.round(sec / km);
      if (!fastest || v < fastest.v) fastest = { v: v, d: d };
      return { t: d.getTime(), v: v, avg: avg, head: wdName(d) + ', ' + fullDate(d),
               rows: P.paceText(v) + '/km|pace buổi này~' + C.fmtKm(r.km) + ' km|quãng đường~' + P.paceText(avg) + '/km|trung bình 5 buổi' };
    });
    var last = pts[pts.length - 1].avg, base = pts[Math.min(4, pts.length - 1)].avg, diff = last - base;
    CH.paceLine(box, { pts: pts, from: from.getTime(), to: t0.getTime(), fmt: P.paceText,
                       aria: 'Biểu đồ pace ' + pts.length + ' buổi chạy trong 120 ngày, trung bình 5 buổi gần nhất ' + P.paceText(last) + ' mỗi km' });
    el('pace-legend').hidden = false;
    var trend = Math.abs(diff) < 3 ? 'gần như không đổi so với đầu giai đoạn'
      : (diff < 0 ? 'nhanh hơn ' : 'chậm hơn ') + Math.abs(diff) + ' giây/km so với đầu giai đoạn';
    el('pace-sum').innerHTML = 'Trung bình 5 buổi gần nhất <b class="num">' + P.paceText(last) + '/km</b>, ' + C.esc(trend)
      + '. Nhanh nhất <b class="num">' + P.paceText(fastest.v) + '/km</b> ngày ' + C.fmt(fastest.d) + '. Trục dọc đảo ngược: càng cao càng nhanh.';
    el('pace-table').innerHTML = CH.table(['Ngày', 'Km', 'Thời gian', 'Pace'], list.slice(-12).reverse().map(function (r) {
      return [fullDate(C.fromIso(r.date)), C.fmtKm(r.km), r.time, P.paceText(Math.round(RL.parseTime(r.time) / Number(r.km))) + '/km'];
    }));
  }

  /* ================= phân bố cự ly ================= */
  var BANDS = [
    { label: 'Dưới 5 km', hi: 5 }, { label: '5–10 km', hi: 10 }, { label: '10–15 km', hi: 15 },
    { label: '15–21 km', hi: 21 }, { label: 'Từ 21 km', hi: Infinity }
  ];
  function renderDist() {
    var list = runs.filter(function (r) { return r.kind === 'run' && Number(r.km) > 0; });
    el('dist-n').textContent = list.length ? 'Tất cả ' + list.length + ' buổi chạy' : '';
    if (!list.length) {
      el('dist-figs').innerHTML = '';
      el('dist-bars').innerHTML = '<p class="hint">Chưa có buổi chạy nào. Nhập ở tab Nhập nhanh để xem bạn hay chạy cự ly nào.</p>';
      return;
    }
    var bins = BANDS.map(function () { return { n: 0, km: 0 }; }), total = 0, longest = list[0];
    list.forEach(function (r) {
      var km = Number(r.km), i = 0;
      while (km >= BANDS[i].hi) i++;
      bins[i].n++; bins[i].km += km; total += km;
      if (km > Number(longest.km)) longest = r;
    });
    el('dist-figs').innerHTML = fig(C.fmtKm(total / list.length) + '<small>km</small>', 'trung bình mỗi buổi')
      + fig(C.fmtKm(longest.km) + '<small>km</small>', 'buổi dài nhất' + (longest.date ? ', ' + fullDate(C.fromIso(longest.date)) : ''));
    el('dist-bars').innerHTML = CH.hbars(BANDS.map(function (b, i) {
      var pct = Math.round(bins[i].n / list.length * 100);
      return { label: b.label, value: bins[i].n, text: bins[i].n + ' · ' + pct + '%', head: b.label,
               rows: bins[i].n + '|buổi chạy~' + pct + '%|số buổi~' + C.fmtKm(bins[i].km) + ' km|tổng quãng đường' };
    }));
    CH.bindTips(el('dist-bars'));
  }

  /* ================= PR ================= */
  function renderPR() {
    var prs = RL.computePRs(runs), t0 = C.today0(), P = window.Predict;
    el('pr-grid').innerHTML = RL.PR_BUCKETS.map(function (b) {
      var p = prs[b.key];
      if (!p) {
        return '<div class="pr-card empty"><div class="pr-top"><span class="pr-label">' + b.label + '</span></div>'
          + '<div class="pr-v">—</div><div class="pr-d">Chưa có thành tích</div></div>';
      }
      var d = C.fromIso(p.date), fresh = (t0 - d) / 864e5 <= 30;
      return '<div class="pr-card"><div class="pr-top"><span class="pr-label">' + b.label + '</span>'
        + (fresh ? '<span class="chip t-quality">Mới</span>' : '') + '</div>'
        + '<div class="pr-v num">' + RL.formatTime(p.timeSeconds) + '</div>'
        + '<div class="pr-d"><span class="num">' + P.paceText(Math.round(p.timeSeconds / p.km)) + '/km</span> · ' + fullDate(d) + '</div></div>';
    }).join('');
  }

  /* ================= mục tiêu ================= */
  function renderGoals() {
    var box = el('goal-list'), goals = G.all();
    if (!goals.length) { box.innerHTML = '<p class="hint">Chưa có mục tiêu nào. Đặt mục tiêu km mỗi tuần để vòng "Tuần này" tính theo mục tiêu của bạn.</p>'; return; }
    box.innerHTML = goals.map(function (g) {
      var p = G.progress(g, runs), done = p.pct >= 100, title, sub;
      if (g.type === 'pr_target') {
        title = G.TYPE_LABEL[g.type] + ' ' + g.distanceKm + 'K';
        sub = 'Mục tiêu ' + RL.formatTime(g.target) + (p.label ? ' · hiện tại ' + p.label : '');
      } else {
        var isKm = g.type.indexOf('km') >= 0, unit = isKm ? ' km' : ' buổi', rest = g.target - p.current;
        var f = isKm ? C.fmtKm : C.fmtNum;
        title = G.TYPE_LABEL[g.type];
        sub = f(p.current) + ' / ' + C.fmtNum(g.target) + unit + (rest > 0 ? ' · còn ' + f(rest) + unit : '');
      }
      return '<div class="goal-row' + (done ? ' done' : '') + '">'
        + '<div class="goal-info"><div class="goal-top"><strong>' + C.esc(title) + '</strong>'
        + (done ? '<span class="chip t-easy">Đạt</span>' : '') + '<span class="goal-pct num">' + p.pct + '%</span></div>'
        + '<div class="bar goal-bar"><i style="width:' + p.pct + '%"></i></div>'
        + '<span class="goal-sub num">' + C.esc(sub) + '</span></div>'
        + '<button type="button" class="lnk" data-goal-del="' + g.id + '">Xoá</button></div>';
    }).join('');
  }

  /* ================= dự đoán thành tích ================= */
  var pred = null;

  function renderPredict() {
    var P = window.Predict;
    pred = P.compute(runs);
    var note = [];
    if (!pred.efforts) {
      note.push('Chưa có buổi chạy nào ghi cả km (từ 2,5 km) lẫn thời gian. Nhập thêm ở tab Nhập nhanh để có dự đoán.');
    } else {
      note.push('Dựa trên ' + pred.efforts + ' buổi chạy có số liệu' + (pred.stale ? ' (đã hơn 4 tháng trước, độ tin cậy giảm)' : '') + '.');
    }
    if (pred.avg30) note.push('Pace trung bình 30 ngày qua: ' + P.paceText(pred.avg30.paceSec) + '/km (' + pred.avg30.n + ' buổi).');
    var pen = pred.list.filter(function (p) { return p.penalty > 0; })[0];
    if (pen) {
      note.push('Half/Full đã cộng thêm cho sức bền: buổi chạy dài nhất 60 ngày qua mới ' + C.fmtKm(pred.longest) + ' km.');
    }
    el('pred-note').textContent = note.join(' ');

    el('pred-grid').innerHTML = pred.list.map(function (p) {
      if (!p.timeSec) {
        return '<div class="pred-card"><div class="pr-label">' + p.label + '</div>'
          + '<div class="pr-v num">—</div>'
          + '<div class="pr-d">Cần một buổi từ ' + C.fmtKm(p.needKm) + ' km có ghi thời gian</div></div>';
      }
      return '<div class="pred-card"><div class="pr-label">' + p.label + '</div>'
        + '<div class="pr-v num">' + RL.formatTime(p.timeSec) + '</div>'
        + '<div class="pred-pace num">' + P.paceText(p.paceSec) + '/km</div>'
        + '<div class="pr-d num">' + RL.formatTime(p.low) + ' – ' + RL.formatTime(p.high) + '</div>'
        + '<span class="chip conf-' + (p.confidence === 'cao' ? 'hi' : p.confidence === 'thấp' ? 'lo' : 'mid') + '">Tin cậy ' + p.confidence + '</span></div>';
    }).join('');

    // Các vùng pace đặt trên cùng một thước, nhanh hơn ở bên phải.
    var zl = el('zone-list');
    if (!pred.zones) { zl.innerHTML = '<p class="hint">Cần dự đoán 10K để suy ra các vùng pace.</p>'; return; }
    var all = [];
    pred.zones.forEach(function (z) { all.push(z.lo, z.hi); });
    var slow = Math.max.apply(null, all) + 15, fast = Math.min.apply(null, all) - 15;
    function pos(v) { return (slow - v) / (slow - fast) * 100; }
    zl.innerHTML = pred.zones.map(function (z) {
      var left = pos(z.hi), w = pos(z.lo) - left;
      if (w < 2.5) { left -= (2.5 - w) / 2; w = 2.5; }
      return '<div class="zone-row z-' + z.key + '"><div class="zone-top"><strong>' + C.esc(z.label) + '</strong>'
        + '<span class="num zone-v">' + P.rangeText(z) + '/km</span></div>'
        + '<div class="zone-scale" aria-hidden="true"><i style="left:' + left.toFixed(1) + '%;width:' + w.toFixed(1) + '%"></i></div>'
        + '<span class="hint">' + C.esc(z.note) + '</span></div>';
    }).join('') + '<div class="zone-axis" aria-hidden="true"><span>← Chậm hơn</span><span>Nhanh hơn →</span></div>';
  }

  /* ================= báo cáo AI ================= */
  var AI_KEY = 'app-ai-report';

  function mdHtml(text) {
    var out = '', list = false;
    function close() { if (list) { out += '</ul>'; list = false; } }
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var html = C.esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if (/^#{1,4}\s+/.test(line)) { close(); out += '<h3>' + html.replace(/^#{1,4}\s+/, '') + '</h3>'; }
      else if (/^[-*•]\s+/.test(line)) { if (!list) { out += '<ul class="rules">'; list = true; } out += '<li>' + html.replace(/^[-*•]\s+/, '') + '</li>'; }
      else { close(); out += '<p>' + html + '</p>'; }
    });
    close();
    return out;
  }

  function aiPayload() {
    var P = window.Predict, R = window.Races, t0 = C.today0();
    var recent = runs.filter(function (r) { return r.kind === 'run' && r.date && Number(r.km) > 0; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 15)
      .map(function (r) { return { ngay: r.date, km: Number(r.km), pace: r.pace || null, thoi_gian: r.time || null }; });
    var prs = RL.computePRs(runs), prOut = {};
    RL.PR_BUCKETS.forEach(function (b) { if (prs[b.key]) prOut[b.label] = RL.formatTime(prs[b.key].timeSeconds); });
    var preds = pred.list.filter(function (p) { return p.timeSec; }).map(function (p) {
      return { cu_ly: p.label, thoi_gian: RL.formatTime(p.timeSec), pace_tb: P.paceText(p.paceSec) + '/km',
               khoang: RL.formatTime(p.low) + ' - ' + RL.formatTime(p.high), do_tin_cay: p.confidence };
    });
    var zones = (pred.zones || []).map(function (z) { return { ten: z.label, pace: P.rangeText(z) + '/km' }; });
    var races = R.upcoming().slice(0, 2).map(function (r) {
      var match = pred.list.filter(function (p) { return p.timeSec && Math.abs(r.distanceKm - p.km) / p.km <= 0.05; })[0];
      return { ten: r.name, ngay_thi: r.date, con_ngay: R.daysUntil(r), cu_ly_km: r.distanceKm || null,
               muc_tieu: r.targetA || null, du_doan_cho_cu_ly_nay: match ? RL.formatTime(match.timeSec) : null };
    });
    var plans = B.list().filter(B.isActive).map(function (b) {
      var s = B.stats(b), race = R.get(b.raceId);
      return { giai: race ? race.name : null, da_chay: s.n + '/' + s.total + ' buổi', phan_tram: s.pct };
    });
    var goals = G.all().map(function (g) {
      var p = G.progress(g, runs);
      return { loai: G.TYPE_LABEL[g.type], muc_tieu: g.target, cu_ly_km: g.distanceKm, tien_do_phan_tram: p.pct };
    });
    return {
      hom_nay: C.iso(t0),
      km_8_tuan_gan_day: RL.weeklyKmSeries(runs, 8).map(function (w) { return Math.round(w.km * 10) / 10; }),
      chuoi_ngay_chay: RL.computeStreak(runs),
      pace_tb_30_ngay: pred.avg30 ? P.paceText(pred.avg30.paceSec) + '/km' : null,
      buoi_chay_dai_nhat_60_ngay_km: pred.longest || null,
      thanh_tich_tot_nhat: prOut,
      buoi_gan_day: recent,
      du_doan: preds, pace_goi_y: zones,
      giai_sap_toi: races, giao_an_dang_chay: plans, muc_tieu: goals
    };
  }

  function renderReport() {
    var saved = C.store.getJSON(AI_KEY, null);
    var body = el('ai-body'), when = el('ai-when'), btn = el('ai-run'), st = el('ai-status');
    var V = window.Vision;
    if (saved && saved.text) {
      body.innerHTML = mdHtml(saved.text);
      var d = new Date(saved.at);
      when.textContent = 'Tạo lúc ' + C.fmt(d) + ' ' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes())
        + (saved.n !== runs.length ? ' · có dữ liệu mới từ lần phân tích này' : '');
      btn.textContent = 'Phân tích lại';
    } else {
      body.innerHTML = '<p class="hint">AI đọc nhật ký, dự đoán và giáo án của bạn rồi viết báo cáo ngắn: điểm mạnh, điểm cần lưu ý và gợi ý tuần tới.</p>';
      when.textContent = '';
      btn.textContent = 'Phân tích bằng AI';
    }
    if (!V.hasKey()) st.innerHTML = 'Cần API key Gemini: dán ở <a href="settings.html">Cài đặt</a>.';
    else if (!st.textContent) st.textContent = 'Gửi số liệu chạy (không gồm ảnh) tới Gemini để viết báo cáo.';
  }

  function runReport() {
    var V = window.Vision, btn = el('ai-run'), st = el('ai-status');
    if (!V.hasKey()) { renderReport(); return; }
    if (!runs.length) { st.textContent = 'Chưa có buổi chạy nào để phân tích.'; return; }
    btn.disabled = true; st.className = 'hint busy'; st.textContent = 'Đang phân tích...';
    var t0 = Date.now();
    V.report(aiPayload()).then(function (text) {
      C.store.setJSON(AI_KEY, { at: Date.now(), text: text, n: runs.length });
      st.className = 'hint ok';
      st.textContent = 'Xong trong ' + (Math.round((Date.now() - t0) / 100) / 10).toString().replace('.', ',') + ' giây.';
      renderReport();
    }).catch(function (e) {
      st.className = 'hint err'; st.textContent = e.message || 'Không phân tích được.';
    }).then(function () { btn.disabled = false; });
  }

  /* ================= giày chạy ================= */
  var shoeEdit = '', shoeArmed = '';   // đôi đang sửa / đang chờ xác nhận (xóa hoặc gán hàng loạt)
  var LEVEL = { ok: 'Còn tốt', warn: 'Sắp thay', over: 'Nên thay' };

  function shoeCard(shoe, use, def) {
    var st = S.stat(shoe, use[shoe.id]);
    var pct = Math.min(100, Math.round(st.pct * 100));
    var n = S.unassigned(runs, shoe.since).length;
    var bits = [st.n + ' buổi'];
    if (st.last) bits.push('gần nhất ' + C.fmt(C.fromIso(st.last)));
    if (!shoe.retired && st.level !== 'over' && st.weeks) bits.push('còn khoảng ' + st.weeks + ' tuần nếu giữ nhịp 4 tuần qua');
    if (shoe.startKm) bits.push('đã chạy sẵn ' + C.fmtKm(shoe.startKm) + ' km');
    var akey = 'asg:' + shoe.id, dkey = 'del:' + shoe.id;
    return '<article class="shoe' + (shoe.retired ? ' retired' : '') + '" data-id="' + shoe.id + '">'
      + '<div class="shoe-top"><strong>' + C.esc(shoe.name) + '</strong>'
      + (def ? '<span class="chip t-easy">Mặc định</span>' : '')
      + (shoe.retired ? '<span class="chip t-rest">Đã nghỉ</span>' : '<span class="chip shoe-' + st.level + '">' + LEVEL[st.level] + '</span>')
      + '<span class="shoe-km num">' + C.fmtKm(st.total) + ' / ' + C.fmtKm(st.retire) + ' km</span></div>'
      + '<div class="shoe-bar" role="img" aria-label="' + pct + '% ngưỡng thay giày"><i class="' + st.level + '" style="width:' + pct + '%"></i></div>'
      + '<p class="hint">' + C.esc(bits.join(' · ')) + '</p>'
      + '<div class="shoe-acts">'
      + (shoe.retired || def ? '' : '<button type="button" class="btn-sm" data-sh="def">Đặt mặc định</button>')
      + '<button type="button" class="btn-sm" data-sh="edit">Sửa</button>'
      + '<button type="button" class="btn-sm" data-sh="retire">' + (shoe.retired ? 'Dùng lại' : 'Cho nghỉ') + '</button>'
      + (n && !shoe.retired ? '<button type="button" class="btn-sm"' + (shoeArmed === akey ? ' data-armed="1"' : '') + ' data-sh="assign">'
          + (shoeArmed === akey ? 'Gán ' + n + ' buổi?' : 'Gán ' + n + ' buổi chưa có giày') + '</button>' : '')
      + '<button type="button" class="btn-sm"' + (shoeArmed === dkey ? ' data-armed="1"' : '') + ' data-sh="del">' + (shoeArmed === dkey ? 'Chắc chắn xóa?' : 'Xóa') + '</button>'
      + '</div></article>';
  }

  function renderShoes() {
    var box = el('shoe-list');
    if (!box) return;
    var shoes = S.list(), use = S.usage(runs), def = S.defaultId();
    box.innerHTML = shoes.length ? shoes.map(function (s) { return shoeCard(s, use, s.id === def); }).join('')
      : '<p class="hint">Chưa có đôi giày nào. Thêm một đôi để biết nó đã chạy bao nhiêu km và khi nào nên thay.</p>';
    var due = shoes.filter(function (s) { return !s.retired && S.stat(s, use[s.id]).level !== 'ok'; });
    el('shoe-sum').textContent = due.length
      ? due.map(function (s) { var st = S.stat(s, use[s.id]); return s.name + (st.level === 'over' ? ' đã vượt ngưỡng' : ' sắp tới ngưỡng'); }).join('; ') + '.'
      : (shoes.length ? 'Giày đang dùng đều còn tốt.' : '');
  }

  function openShoeForm(shoe) {
    shoeEdit = shoe ? shoe.id : '';
    el('shoe-form').hidden = false;
    el('shoe-name').value = shoe ? shoe.name : '';
    el('shoe-start').value = shoe && shoe.startKm ? String(shoe.startKm).replace('.', ',') : '';
    el('shoe-retire').value = shoe ? String(shoe.retireKm).replace('.', ',') : '';
    el('shoe-since').value = shoe ? shoe.since || '' : '';
    el('shoe-save').textContent = shoe ? 'Cập nhật giày' : 'Lưu giày';
    el('shoe-name').focus();
  }
  function closeShoeForm() { shoeEdit = ''; el('shoe-form').hidden = true; el('shoe-form').reset(); }

  function onShoeSubmit(e) {
    e.preventDefault();
    var data = { name: el('shoe-name').value, startKm: el('shoe-start').value, retireKm: el('shoe-retire').value, since: el('shoe-since').value };
    var editing = !!shoeEdit;
    var done = editing ? S.update(shoeEdit, data) : S.create(data);
    if (!done) { C.toast('Chưa lưu được', 'Nhập tên đôi giày'); return; }
    closeShoeForm(); shoeArmed = ''; renderShoes();
    C.toast(editing ? 'Đã cập nhật giày' : 'Đã thêm giày', done.name);
  }

  // Ghi lần lượt từng buổi: ghi song song nhiều giao dịch IndexedDB trên điện thoại dễ nghẽn.
  function setShoe(list, id) {
    return list.reduce(function (p, r) { return p.then(function () { r.shoeId = id; return RL.saveRun(r); }); }, Promise.resolve());
  }

  function onShoeClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-sh]') : null, art = btn && btn.closest('[data-id]');
    if (!art) return;
    var id = art.getAttribute('data-id'), shoe = S.get(id), act = btn.getAttribute('data-sh');
    if (!shoe) return;
    if (act === 'def') {
      S.setDefault(id);
    } else if (act === 'edit') {
      shoeArmed = ''; openShoeForm(shoe); return;
    } else if (act === 'retire') {
      S.update(id, { retired: !shoe.retired });
    } else if (act === 'assign') {
      if (shoeArmed !== 'asg:' + id) { shoeArmed = 'asg:' + id; renderShoes(); return; }
      var todo = S.unassigned(runs, shoe.since);
      shoeArmed = '';
      setShoe(todo, id).then(function () {
        renderShoes(); C.toast('Đã gán giày', todo.length + ' buổi cho ' + shoe.name);
      });
      return;
    } else if (act === 'del') {
      if (shoeArmed !== 'del:' + id) { shoeArmed = 'del:' + id; renderShoes(); return; }
      S.remove(id);
      var mine = runs.filter(function (r) { return r.shoeId === id; });   // trở về chưa có giày
      shoeArmed = '';
      setShoe(mine, '').then(function () {
        renderShoes(); C.toast('Đã xóa giày', mine.length ? mine.length + ' buổi trở về chưa có giày' : '');
      });
      return;
    }
    shoeArmed = '';
    renderShoes();
  }

  /* ================= thanh mục lục dính ở đầu trang ================= */
  function bindJump() {
    var nav = el('jump');
    if (!nav) return;
    var links = [].slice.call(nav.querySelectorAll('a'));
    function setActive(a) {
      links.forEach(function (l) { if (l === a) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
      // Cuộn ngang bằng scrollLeft: scrollIntoView ở đây sẽ cắt ngang lần cuộn mượt của trang.
      nav.scrollLeft = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
    }
    nav.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null, t = a && document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      t.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      setActive(a);
    });
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var a = nav.querySelector('a[href="#' + en.target.id + '"]');
        if (a) setActive(a);
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    links.forEach(function (a) { var t = document.querySelector(a.getAttribute('href')); if (t) io.observe(t); });
  }

  function renderAll() {
    renderWeek(); renderTiles(); renderHeatmap(); renderVolume(); renderInsights(); renderPace(); renderDist();
    renderPR(); renderPredict(); renderGoals(); renderShoes(); renderReport();
  }

  function bindEvents() {
    on('ai-run', 'click', runReport);
    on('shoe-add', 'click', function () { if (el('shoe-form').hidden) openShoeForm(null); else closeShoeForm(); });
    on('shoe-cancel', 'click', closeShoeForm);
    on('shoe-form', 'submit', onShoeSubmit);
    on('shoe-list', 'click', onShoeClick);
    on('vol-seg', 'click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-vol]') : null;
      if (!b || b.getAttribute('data-vol') === volMode) return;
      volMode = b.getAttribute('data-vol');
      C.store.set('app-stats-vol', volMode);
      syncVolSeg(); renderVolume();
    });
    on('goal-add-toggle', 'click', function () { el('goal-form').hidden = !el('goal-form').hidden; });
    on('goal-type', 'change', function () {
      var isPr = el('goal-type').value === 'pr_target';
      el('goal-dist-wrap').hidden = !isPr;
      el('goal-target-label').textContent = isPr ? 'Mục tiêu thời gian (giây)' : 'Mục tiêu';
    });
    on('goal-form', 'submit', function (e) {
      e.preventDefault();
      G.create({ type: el('goal-type').value, target: el('goal-target').value, distanceKm: el('goal-dist').value });
      el('goal-form').reset(); el('goal-form').hidden = true;
      renderGoals(); renderWeek();
    });
    on('goal-list', 'click', function (e) {
      var id = e.target && e.target.getAttribute('data-goal-del');
      if (!id) return;
      G.remove(id); renderGoals(); renderWeek();
    });
    // Biểu đồ pace và lịch nhiệt vẽ theo bề rộng thật; Safari di động bắn resize
    // cả khi cuộn (thanh địa chỉ co giãn) nên chỉ vẽ lại khi bề rộng đổi.
    var rz = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rz);
      rz = setTimeout(function () {
        if (!runs.length && !paceWidth) return;
        if (el('pace-chart').clientWidth !== paceWidth) renderPace();
        if (heatWeeks() !== hmWeeks) renderHeatmap();
      }, 150);
    });
  }

  function boot() {
    renderHeader();
    syncVolSeg();
    bindEvents();
    bindJump();
    window.Migrate.run().then(function () { return RL.loadRuns(); }).then(function (all) {
      runs = all;
      renderAll();
    });
    C.registerSW();
    C.lockOrientation();
  }

  boot();
})();
