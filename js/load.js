// Tải tập luyện: mỗi buổi chạy quy về "km quy đổi" = km × hệ số cường độ, rồi
// so tải 7 ngày gần nhất (gồm hôm nay) với trung bình tuần của 4 tuần liền
// trước đó (ngày 7–34 tính lùi) — cùng kiểu so sánh js/adapt.js dùng để chỉnh
// giáo án, chỉ khác là ở đây có trọng số cường độ và tính cả hôm nay để buổi
// vừa nhập hiện ngay. Tỷ lệ 0,8–1,3 thường được coi là vùng tăng tải an toàn.
// Đây là chỉ báo xu hướng, không phải chẩn đoán chấn thương.
//
// Hệ số cường độ của một buổi, theo thứ tự ưu tiên:
//  1. Buổi gắn với một buổi trong giáo án → theo loại buổi đó.
//  2. Buổi tự do: nhanh hơn pace trung vị 120 ngày của chính bạn từ 6% coi
//     là chất lượng; dài từ 1,5 lần quãng trung vị (tối thiểu 12 km) coi là
//     chạy dài. So với chính mình chứ không với vùng pace của Predict: vùng
//     đó suy từ các buổi nhanh nhất, nên người chỉ chạy nhẹ sẽ bị xếp gần
//     như mọi buổi thành "chất lượng".
//  3. Còn lại là chạy nhẹ.
// Chỉ tính buổi "Chạy": đi bộ và môn khác không vào tải chạy.
window.Load = (function (Core, RL, Blocks) {
  'use strict';
  var FACTOR = { easy: 1, long: 1.2, quality: 1.5, race: 1.6 };
  var LABEL = { easy: 'Nhẹ', long: 'Dài', quality: 'Chất lượng', race: 'Thi đấu' };
  var ORDER = ['easy', 'long', 'quality', 'race'];
  var MIN_CHRONIC = 8;   // km quy đổi/tuần; thấp hơn thì tỷ lệ dao động vô nghĩa (cùng ngưỡng với adapt.js)
  var BAND = [0.8, 1.3];
  var ZONES = [
    { key: 'low', max: 0.8, label: 'Đang giảm tải' },
    { key: 'ok', max: 1.3, label: 'Vùng an toàn' },
    { key: 'high', max: 1.5, label: 'Tăng nhanh' },
    { key: 'over', max: Infinity, label: 'Tăng quá nhanh' }
  ];

  function isRun(r) { return r.kind === 'run' && !!r.date && Number(r.km) > 0; }

  function sessionTypes() {
    var m = {};
    Blocks.list().forEach(function (b) {
      Blocks.sessionsOf(b).list.forEach(function (x) { m[b.id + '|' + x.id] = x.s.type; });
    });
    return m;
  }

  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; }), h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }

  function paceOf(r) {
    var km = Number(r.km), sec = RL.parseTime(r.time);
    return sec > 0 ? sec / km : RL.parseTime(r.pace);
  }

  // Mỗi buổi chạy → { date, km, type, how: 'plan' | 'auto', load }.
  function classify(runs) {
    var list = runs.filter(isRun), types = sessionTypes(), t0 = Core.today0();
    var recent = list.filter(function (r) { return (t0 - Core.fromIso(r.date)) / 864e5 <= 120; });
    var pool = recent.length ? recent : list;
    var longKm = Math.max(12, median(pool.map(function (r) { return Number(r.km); })) * 1.5);
    var paces = pool.map(paceOf).filter(function (p) { return p >= 150 && p <= 720; });
    var fastPace = paces.length >= 3 ? median(paces) * 0.94 : 0;   // ít buổi quá thì không đoán chất lượng
    return list.map(function (r) {
      var km = Number(r.km), type = r.sessionId ? types[r.blockId + '|' + r.sessionId] : '', how = 'plan';
      if (!FACTOR[type]) {
        var pace = paceOf(r);
        how = 'auto';
        type = fastPace && pace > 0 && pace < fastPace ? 'quality' : km >= longKm ? 'long' : 'easy';
      }
      return { date: r.date, km: km, type: type, how: how, load: km * FACTOR[type] };
    });
  }

  function zoneOf(ratio) {
    if (ratio == null) return null;
    for (var i = 0; i < ZONES.length; i++) if (ratio < ZONES[i].max) return ZONES[i];
    return ZONES[ZONES.length - 1];
  }

  // days: số ngày của chuỗi trả về (mặc định 84 = 12 tuần).
  function compute(runs, days) {
    days = days || 84;
    var items = classify(runs), byDay = {}, t0 = Core.today0();
    items.forEach(function (it) { byDay[it.date] = (byDay[it.date] || 0) + it.load; });
    function sum(end, from, to) {
      var s = 0;
      for (var i = from; i <= to; i++) s += byDay[Core.iso(Core.addDays(end, -i))] || 0;
      return s;
    }
    var series = [];
    for (var d = days - 1; d >= 0; d--) {
      var day = Core.addDays(t0, -d), acute = sum(day, 0, 6), chronic = sum(day, 7, 34) / 4;
      series.push({ date: day, acute: acute, chronic: chronic, ratio: chronic >= MIN_CHRONIC ? acute / chronic : null });
    }

    // Cơ cấu cường độ 28 ngày qua, theo km thật (không nhân hệ số).
    var from = Core.addDays(t0, -27), mix = {}, auto = 0, total = 0;
    ORDER.forEach(function (k) { mix[k] = { n: 0, km: 0 }; });
    items.forEach(function (it) {
      var dt = Core.fromIso(it.date);
      if (dt < from || dt > t0) return;
      mix[it.type].n++; mix[it.type].km += it.km; total += it.km;
      if (it.how === 'auto') auto++;
    });

    var now = series[series.length - 1];
    return { series: series, now: now, zone: zoneOf(now.ratio), mix: mix, mixKm: total, mixAuto: auto };
  }

  return {
    FACTOR: FACTOR, LABEL: LABEL, ORDER: ORDER, BAND: BAND, ZONES: ZONES, MIN_CHRONIC: MIN_CHRONIC,
    classify: classify, compute: compute, zoneOf: zoneOf
  };
})(window.Core, window.RunLog, window.Blocks);
