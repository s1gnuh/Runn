// Tạo / sửa / xoá giải, dùng chung cho trang chủ (tạo giải) và trang giải
// (sửa, xoá): danh sách giáo án để chọn, mô tả giáo án, và gắn / đổi / bỏ
// giáo án của một giải. Mỗi trang tự dựng form, module này chỉ lo dữ liệu.
window.RaceForm = (function (Core, Templates, Blocks, Races) {
  'use strict';

  function optionsHtml() {
    var opts = ['<option value="">Không dùng giáo án — chỉ tạo giải, tự ghi nhật ký</option>'];
    Templates.levels().forEach(function (t) {
      opts.push('<option value="' + t.id + '">' + Core.esc(t.name) + ' · đỉnh ' + Templates.summary(t).peakKm + ' km/tuần</option>');
    });
    opts.push('<option value="' + Templates.PERIODIZED_12W_ID + '">Chu kỳ 12 tuần (kiểu Bắc Ninh 10K)</option>');
    return opts.join('');
  }

  function describe(templateId) {
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

  // d: { id (rỗng = tạo mới), name, date, km, templateId }.
  // Trả { race, created, swapped } hoặc null nếu thiếu tên / ngày.
  function save(d) {
    var name = String(d.name || '').trim(), date = d.date, km = Number(d.km) || 0, templateId = d.templateId || '';
    if (!name || !date) return null;
    if (d.id) {
      var race = Races.get(d.id);
      if (!race) return null;
      var had = race.blockId ? Blocks.get(race.blockId) : null;
      var swapped = !!(had && templateId && had.templateId !== templateId);
      race.name = name; race.date = date; race.distanceKm = km;
      applyBlock(race, templateId, name, km);
      Races.save(race);
      return { race: race, created: false, swapped: swapped };
    }
    var fresh = Races.create({ id: Core.uid('race-'), name: name, date: date, distanceKm: km, blockId: null });
    applyBlock(fresh, templateId, name, km);
    Races.save(fresh);
    return { race: fresh, created: true, swapped: false };
  }

  // Xoá giải và giáo án của nó; nhật ký chạy và ảnh vẫn giữ nguyên.
  function remove(id) {
    var race = Races.get(id);
    if (race && race.blockId) Blocks.remove(race.blockId);
    Races.remove(id);
    return race;
  }

  return { optionsHtml: optionsHtml, describe: describe, applyBlock: applyBlock, save: save, remove: remove };
})(window.Core, window.Templates, window.Blocks, window.Races);
