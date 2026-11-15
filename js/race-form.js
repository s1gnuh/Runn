// Tạo / sửa / xoá giải, dùng chung cho trang chủ (tạo giải) và trang giải
// (sửa, xoá): danh sách giáo án để chọn, mô tả giáo án, và gắn / đổi / bỏ
// giáo án của một giải. Mỗi trang tự dựng form, module này chỉ lo dữ liệu.
window.RaceForm = (function (Core, Templates, Blocks, Races) {
  'use strict';
  var GEN = '__gen__';   // giá trị của ô chọn: sinh giáo án riêng theo mục tiêu

  // currentId: khuôn đang gắn (để khuôn sinh riêng hiện tại vẫn chọn được khi sửa).
  function optionsHtml(currentId) {
    var opts = ['<option value="">Không dùng giáo án — chỉ tạo giải, tự ghi nhật ký</option>'];
    opts.push('<option value="' + GEN + '">Giáo án riêng theo mục tiêu thời gian (sinh tự động)</option>');
    var cur = currentId && Templates.get(currentId);
    if (cur && cur.gen) opts.push('<option value="' + Core.esc(cur.id) + '">' + Core.esc(cur.name) + ' (đang dùng)</option>');
    Templates.levels().forEach(function (t) {
      opts.push('<option value="' + t.id + '">' + Core.esc(t.name) + ' · đỉnh ' + Templates.summary(t).peakKm + ' km/tuần</option>');
    });
    opts.push('<option value="' + Templates.PERIODIZED_12W_ID + '">Chu kỳ 12 tuần 10K (cổ điển)</option>');
    return opts.join('');
  }

  // Số tuần dùng được từ Thứ 2 tuần này tới ngày thi (tuần cuối thi vào Chủ nhật).
  function weeksUntil(raceDate) {
    var t0 = Core.today0(), mon = Core.addDays(t0, -((t0.getDay() + 6) % 7));
    var span = Math.round((Core.fromIso(raceDate) - mon) / 864e5);
    return Math.floor((span - 6) / 7) + 1;
  }
  function parseGoal(s) {
    var p = String(s || '').trim().split(':').map(Number);
    if (!p.length || p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
  }
  // km/tuần trung bình 4 tuần đã xong gần nhất (0 nếu không có nhật ký).
  function weeklyKm(runs) {
    if (!runs || !runs.length || !window.RunLog) return 0;
    var s = window.RunLog.weeklyKmSeries(runs, 5).slice(0, 4), used = s.filter(function (w) { return w.km > 0; });
    return used.length ? used.reduce(function (a, w) { return a + w.km; }, 0) / used.length : 0;
  }
  function easyBand(runs) {
    if (!runs || !runs.length || !window.Predict) return null;
    var z = window.Predict.compute(runs).zones;
    return z ? z.filter(function (x) { return x.key === 'easy'; })[0] || null : null;
  }

  function describe(templateId) {
    if (templateId === GEN) return 'App tự sinh giáo án từ mục tiêu thời gian, ngày thi và số buổi mỗi tuần bạn chọn: pace từng buổi theo mục tiêu (chạy nhẹ theo thể lực hiện tại), khối lượng khởi điểm theo nhật ký 4 tuần qua, tăng tối đa 10% mỗi tuần. Cần còn ít nhất 6 tuần tới ngày thi.';
    var t = Templates.get(templateId);
    if (!t) return 'Không sinh giáo án. Bạn vẫn ghi được nhật ký chạy cho giải này.';
    var s = Templates.summary(t);
    return (t.desc ? t.desc + ' ' : '')
      + '(' + s.weeks + ' tuần · ' + s.daysPerWeek + ' buổi/tuần · đỉnh ' + s.peakKm + ' km/tuần · tổng khoảng ' + s.totalKm + ' km)';
  }

  // Gắn / đổi / bỏ giáo án của một giải. Giữ nguyên tiến độ nếu khuôn không
  // đổi, chỉ dời lịch theo ngày thi mới.
  function applyBlock(race, templateId, name, km) {
    var oldBlock = race.blockId ? Blocks.get(race.blockId) : null;
    if (!templateId) {
      if (oldBlock) Blocks.remove(oldBlock.id);
      race.blockId = null;
      return null;
    }
    if (oldBlock && oldBlock.templateId === templateId) {
      var tpl = Templates.get(templateId);
      oldBlock.startDate = Core.iso(Templates.startFromRaceDate(tpl, Core.fromIso(race.date)));
      oldBlock.raceTitle = name + (km ? ', ' + km + ' km' : '');
      oldBlock.raceKm = km;
      Blocks.save(oldBlock);
      return oldBlock;
    }
    if (oldBlock) Blocks.remove(oldBlock.id);
    var blk = Blocks.create({ id: Core.uid('blk-'), templateId: templateId, raceDate: race.date, raceId: race.id, mode: 4 });
    blk.raceTitle = name + (km ? ', ' + km + ' km' : '');
    blk.raceDesc = '';
    blk.raceKm = km;
    Blocks.save(blk);
    race.blockId = blk.id;
    return blk;
  }

  // d: { id (rỗng = tạo mới), name, date, km, templateId, goal, days, runs }.
  // goal/days/runs chỉ dùng khi templateId === GEN. Trả { race, created, swapped }
  // hoặc { error: 'chuỗi để hiện' }; null nếu thiếu tên / ngày.
  function save(d) {
    var name = String(d.name || '').trim(), date = d.date, km = Number(d.km) || 0, templateId = d.templateId || '';
    if (!name || !date) return null;
    var goalTxt = '';
    if (templateId === GEN) {
      var goalSec = parseGoal(d.goal), weeks = weeksUntil(date);
      if (!km) return { error: 'Nhập cự ly của giải để sinh giáo án.' };
      if (!goalSec) return { error: 'Nhập mục tiêu thời gian dạng 55:00 hoặc 1:59:00.' };
      var pace = goalSec / km;
      if (pace < 150 || pace > 720) return { error: 'Mục tiêu ' + d.goal + ' cho ' + km + ' km ứng với pace ' + Math.round(pace / 60) + ' phút/km, có vẻ không đúng.' };
      if (weeks < 6) return { error: 'Chỉ còn ' + Math.max(0, weeks) + ' tuần tới ngày thi, cần ít nhất 6 tuần để sinh giáo án. Chọn một giáo án theo cấp độ hoặc đổi ngày thi.' };
      var tpl = Templates.generate({ raceKm: km, goalSec: goalSec, weeks: Math.min(20, weeks), daysPerWeek: Number(d.days) || 4,
                                     startKm: weeklyKm(d.runs), easyBand: easyBand(d.runs) });
      Templates.save(tpl);
      templateId = tpl.id;
      goalTxt = String(d.goal).trim();
    }
    if (d.id) {
      var race = Races.get(d.id);
      if (!race) return null;
      var had = race.blockId ? Blocks.get(race.blockId) : null;
      var swapped = !!(had && templateId && had.templateId !== templateId);
      race.name = name; race.date = date; race.distanceKm = km;
      if (goalTxt) race.targetA = goalTxt;
      var oldTpl = had ? had.templateId : '';
      applyBlock(race, templateId, name, km);
      Races.save(race);
      dropGen(oldTpl);
      return { race: race, created: false, swapped: swapped };
    }
    var fresh = Races.create({ id: Core.uid('race-'), name: name, date: date, distanceKm: km, blockId: null, targetA: goalTxt });
    applyBlock(fresh, templateId, name, km);
    Races.save(fresh);
    return { race: fresh, created: true, swapped: false };
  }

  // Khuôn sinh riêng không còn block nào dùng thì xoá khỏi kho cho gọn.
  function dropGen(templateId) {
    var t = templateId && Templates.get(templateId);
    if (!t || !t.gen) return;
    if (Blocks.list().some(function (b) { return b.templateId === templateId; })) return;
    Templates.remove(templateId);
  }

  // Xoá giải và giáo án của nó; nhật ký chạy và ảnh vẫn giữ nguyên.
  function remove(id) {
    var race = Races.get(id), blk = race && race.blockId ? Blocks.get(race.blockId) : null;
    if (blk) Blocks.remove(blk.id);
    Races.remove(id);
    if (blk) dropGen(blk.templateId);
    return race;
  }

  return { GEN: GEN, optionsHtml: optionsHtml, describe: describe, applyBlock: applyBlock, save: save, remove: remove,
           weeksUntil: weeksUntil, parseGoal: parseGoal };
})(window.Core, window.Templates, window.Blocks, window.Races);
