// Mục tiêu cá nhân — độc lập với mọi giải/block. "weekly_km" và
// "weekly_sessions" tính theo tuần dương lịch hiện tại (Thứ 2 → Chủ nhật).
window.Goals = (function (Core, RunLog) {
  'use strict';
  var KEY = 'app-goals';

  function all() { return Core.store.getJSON(KEY, []); }
  function save(list) { Core.store.setJSON(KEY, list); return list; }

  function create(opts) {
    var list = all();
    list.push({ id: Core.uid('g'), type: opts.type, target: Number(opts.target) || 0,
                distanceKm: opts.distanceKm ? Number(opts.distanceKm) : null, active: true });
    save(list);
    return list;
  }
  function remove(id) { save(all().filter(function (g) { return g.id !== id; })); }
  function setActive(id, active) {
    var list = all();
    list.forEach(function (g) { if (g.id === id) g.active = !!active; });
    save(list);
  }

  function weekSessions(runs, start, end) {
    return runs.filter(function (r) {
      if (r.kind === 'walk' || !r.date) return false;
      var d = Core.fromIso(r.date);
      return d >= start && d <= end;
    }).length;
  }

  // Tiến độ hiện tại so với mục tiêu: {current, target, pct}.
  function progress(goal, runs) {
    var t0 = Core.today0();
    if (goal.type === 'weekly_km' || goal.type === 'weekly_sessions') {
      var wk = RunLog.thisWeekRange(t0);
      var current = goal.type === 'weekly_km' ? RunLog.kmBetween(runs, wk.start, wk.end) : weekSessions(runs, wk.start, wk.end);
      return clip(current, goal.target);
    }
    if (goal.type === 'monthly_km') {
      var mStart = new Date(t0.getFullYear(), t0.getMonth(), 1);
      var mEnd = new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
      return clip(RunLog.kmBetween(runs, mStart, mEnd), goal.target);
    }
    if (goal.type === 'pr_target') {
      var prs = RunLog.computePRs(runs);
      var bucket = RunLog.PR_BUCKETS.filter(function (b) { return Math.abs((goal.distanceKm || 0) - b.km) / b.km <= 0.05; })[0];
      var best = bucket && prs[bucket.key];
      if (!best) return { current: 0, target: goal.target, pct: 0, label: 'Chưa có thành tích' };
      // mục tiêu là thời gian (giây) càng thấp càng tốt — tiến độ tính ngược.
      var pct = goal.target > 0 ? Math.max(0, Math.min(100, Math.round(goal.target / best.timeSeconds * 100))) : 0;
      return { current: best.timeSeconds, target: goal.target, pct: pct, label: RunLog.formatTime(best.timeSeconds) };
    }
    return clip(0, goal.target);
  }
  function clip(current, target) {
    var pct = target > 0 ? Math.max(0, Math.min(100, Math.round(current / target * 100))) : 0;
    return { current: current, target: target, pct: pct };
  }

  var TYPE_LABEL = { weekly_km: 'Km mỗi tuần', weekly_sessions: 'Số buổi mỗi tuần',
                      monthly_km: 'Km mỗi tháng', pr_target: 'Mục tiêu thành tích' };

  /* ---------- chuỗi tuần đạt ---------- */
  // Điều kiện "tuần đạt": theo mục tiêu số buổi/tuần nếu có, không thì mục
  // tiêu km/tuần, không có nữa thì mặc định 3 buổi chạy — mức tối thiểu của
  // giáo án 3 buổi, và vẫn đạt được trong tuần giảm tải.
  var DEFAULT_WEEK_RUNS = 3;
  function weekRule() {
    var list = all().filter(function (g) { return g.active !== false && g.target > 0; });
    var s = list.filter(function (g) { return g.type === 'weekly_sessions'; })[0];
    if (s) return { kind: 'n', need: s.target, label: Core.fmtNum(s.target) + ' buổi/tuần', test: function (w) { return w.n >= s.target; } };
    var k = list.filter(function (g) { return g.type === 'weekly_km'; })[0];
    if (k) return { kind: 'km', need: k.target, label: Core.fmtNum(k.target) + ' km/tuần', test: function (w) { return w.km >= k.target - 1e-9; } };
    return { kind: 'n', need: DEFAULT_WEEK_RUNS, label: DEFAULT_WEEK_RUNS + ' buổi/tuần', isDefault: true,
             test: function (w) { return w.n >= DEFAULT_WEEK_RUNS; } };
  }
  // { n, best, cur: {km, n}, curMet, rule }
  function weekStreak(runs) {
    var rule = weekRule(), s = RunLog.computeWeekStreak(runs, rule.test);
    s.rule = rule;
    return s;
  }
  // "Tuần này 2/3 buổi" hoặc "Tuần này 18,5/25 km".
  function weekProgressText(s) {
    if (s.curMet) return 'Tuần này đã đạt';
    return 'Tuần này ' + (s.rule.kind === 'km'
      ? Core.fmtKm(s.cur.km) + '/' + Core.fmtNum(s.rule.need) + ' km'
      : s.cur.n + '/' + Core.fmtNum(s.rule.need) + ' buổi');
  }

  return { all: all, create: create, remove: remove, setActive: setActive, progress: progress, TYPE_LABEL: TYPE_LABEL,
           weekRule: weekRule, weekStreak: weekStreak, weekProgressText: weekProgressText };
})(window.Core, window.RunLog);
