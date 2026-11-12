// Biểu đồ dùng chung, HTML/SVG thuần không thư viện: cột, đường pace, lịch
// nhiệt, thanh ngang, sparkline, bảng số liệu và một tooltip duy nhất.
// Tooltip đọc data-tip-h (tiêu đề) và data-tip ("giá trị|nhãn~giá trị|nhãn")
// trên phần tử được trỏ/chạm/focus, ghi bằng textContent.
window.Charts = (function (Core) {
  'use strict';
  var esc = Core.esc;

  /* ================= tooltip ================= */
  var tip = null, hotEl = null;
  function tipEl() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'ch-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    window.addEventListener('scroll', hideTip, { passive: true });
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest || !e.target.closest('[data-tip],.ch-svg')) hideTip();
    });
    return tip;
  }
  function showRows(head, rows, x, y) {
    var t = tipEl();
    t.textContent = '';
    if (head) {
      var h = document.createElement('div');
      h.className = 'ch-tip-h'; h.textContent = head; t.appendChild(h);
    }
    String(rows || '').split('~').forEach(function (ln) {
      if (!ln) return;
      var p = ln.split('|'), row = document.createElement('div'), b = document.createElement('b');
      row.className = 'ch-tip-r';
      b.textContent = p[0]; row.appendChild(b);
      if (p[1]) { var s = document.createElement('span'); s.textContent = p[1]; row.appendChild(s); }
      t.appendChild(row);
    });
    t.hidden = false;
    var r = t.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    var left = Math.min(Math.max(8, x - r.width / 2), vw - r.width - 8);
    var top = y - r.height - 12;
    if (top < 8) top = y + 18;
    t.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    if (hotEl) { hotEl.classList.remove('hot'); hotEl = null; }
  }
  function showFor(m, x, y) {
    if (hotEl !== m) { if (hotEl) hotEl.classList.remove('hot'); hotEl = m; m.classList.add('hot'); }
    showRows(m.getAttribute('data-tip-h'), m.getAttribute('data-tip'), x, y);
  }
  // Gắn một lần cho mỗi vùng chứa; phần tử con có data-tip tự có tooltip.
  function bindTips(root) {
    if (!root || root.getAttribute('data-tips')) return;
    root.setAttribute('data-tips', '1');
    function pick(e) { var m = e.target.closest ? e.target.closest('[data-tip]') : null; return m && root.contains(m) ? m : null; }
    root.addEventListener('pointermove', function (e) {
      var m = pick(e);
      if (m) showFor(m, e.clientX, e.clientY); else if (hotEl && root.contains(hotEl)) hideTip();
    });
    root.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    root.addEventListener('focusin', function (e) {
      var m = pick(e);
      if (!m) return;
      var r = m.getBoundingClientRect();
      showFor(m, r.left + r.width / 2, r.top);
    });
    root.addEventListener('focusout', hideTip);
  }
  function tipAttrs(head, rows) {
    return ' data-tip-h="' + esc(head || '') + '" data-tip="' + esc(rows || '') + '"';
  }

  /* ================= thang chia ================= */
  function niceStep(max, n) {
    var raw = max / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  /* ================= biểu đồ cột ================= */
  // o.items: [{label, value, head, rows, aria, now}], o.fmt(v), o.avg (đường trung bình, tuỳ chọn)
  function columns(o) {
    var items = o.items, fmt = o.fmt;
    var max = Math.max.apply(null, items.map(function (it) { return it.value; }).concat([o.avg || 0]));
    var step = niceStep(max > 0 ? max : 1, 3), top = Math.max(step, Math.ceil(max / step) * step);
    var grid = '';
    for (var v = 0; v <= top + 1e-9; v += step) {
      grid += '<div class="ch-grid" style="bottom:' + (v / top * 100).toFixed(2) + '%"><span class="num">' + fmt(v) + '</span></div>';
    }
    var peak = -1, pv = 0;
    items.forEach(function (it, i) { if (it.value > pv) { pv = it.value; peak = i; } });
    var bars = items.map(function (it, i) {
      var h = it.value > 0 ? Math.max(1.5, it.value / top * 100) : 0;
      var cap = it.value > 0 && (it.now || i === peak) ? '<span class="ch-cap num">' + fmt(it.value) + '</span>' : '';
      return '<div class="ch-col' + (it.now ? ' now' : '') + '" role="listitem" tabindex="0" aria-label="' + esc(it.aria) + '"'
        + tipAttrs(it.head, it.rows) + ' style="--i:' + i + '">'
        + '<div class="ch-bar" style="height:' + h.toFixed(2) + '%">' + cap + '</div></div>';
    }).join('');
    var ref = o.avg > 0
      ? '<div class="ch-ref" style="bottom:' + (o.avg / top * 100).toFixed(2) + '%"><span class="num">TB ' + fmt(o.avg) + '</span></div>' : '';
    var xs = items.map(function (it, i) {
      return '<span class="' + (it.now ? 'now' : (items.length - 1 - i) % 2 ? 'alt' : '') + '">' + esc(it.label) + '</span>';
    }).join('');
    return '<div class="ch-cols"><div class="ch-plot">' + grid + ref
      + '<div class="ch-bars" role="list">' + bars + '</div></div>'
      + '<div class="ch-x" aria-hidden="true">' + xs + '</div></div>';
  }

  /* ================= lịch nhiệt ================= */
  // o.days: {iso: km}, o.weeks, o.today, o.level(km) -> 0..4, o.tip(date, km) -> [head, rows]
  function heatmap(o) {
    var t0 = o.today, off = (t0.getDay() + 6) % 7;
    var start = Core.addDays(t0, -off - 7 * (o.weeks - 1));
    var months = '', cells = '', prevM = -1;
    for (var w = 0; w < o.weeks; w++) {
      var wd = Core.addDays(start, w * 7);
      if (wd.getMonth() !== prevM) {
        if (w < o.weeks - 1 || prevM < 0) months += '<span style="grid-column:' + (w + 1) + '">T' + (wd.getMonth() + 1) + '</span>';
        prevM = wd.getMonth();
      }
      for (var d = 0; d < 7; d++) {
        var day = Core.addDays(start, w * 7 + d);
        if (day > t0) { cells += '<i class="hm-c fut"></i>'; continue; }
        var km = o.days[Core.iso(day)] || 0, tp = o.tip(day, km);
        cells += '<i class="hm-c l' + o.level(km) + (day.getTime() === t0.getTime() ? ' today' : '') + '"' + tipAttrs(tp[0], tp[1]) + '></i>';
      }
    }
    return '<div class="hm" style="--w:' + o.weeks + '">'
      + '<div class="hm-months" aria-hidden="true">' + months + '</div>'
      + '<div class="hm-body"><div class="hm-days" aria-hidden="true"><span>T2</span><span></span><span>T4</span><span></span><span>T6</span><span></span><span>CN</span></div>'
      + '<div class="hm-grid">' + cells + '</div></div></div>';
  }

  /* ================= thanh ngang ================= */
  // items: [{label, value, text, head, rows}]
  function hbars(items) {
    var max = Math.max.apply(null, items.map(function (it) { return it.value; })) || 1;
    return '<div class="hb" role="list">' + items.map(function (it) {
      return '<div class="hb-r" role="listitem" tabindex="0"' + tipAttrs(it.head, it.rows) + '>'
        + '<span class="hb-l">' + esc(it.label) + '</span>'
        + '<span class="hb-t"><i style="width:' + (it.value > 0 ? Math.max(1.5, it.value / max * 100) : 0).toFixed(2) + '%"></i></span>'
        + '<span class="hb-v num">' + esc(it.text) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ================= sparkline cột nhỏ ================= */
  function spark(values) {
    var max = Math.max.apply(null, values) || 1;
    return '<div class="spark" aria-hidden="true">' + values.map(function (v, i) {
      return '<i class="' + (i === values.length - 1 ? 'now' : '') + '" style="height:' + (v > 0 ? Math.max(6, v / max * 100) : 0).toFixed(1) + '%"></i>';
    }).join('') + '</div>';
  }

  /* ================= bảng số liệu (bản thay thế cho biểu đồ) ================= */
  function table(head, rows) {
    return '<details class="ch-table"><summary>Xem bảng số liệu</summary><div class="tbl"><table><thead><tr>'
      + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td class="num">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div></details>';
  }

  /* ================= đường pace (SVG, vẽ theo đúng bề rộng khung) ================= */
  // o.pts: [{t, v, avg, head, rows}] sắp theo thời gian; o.from, o.to (ms); o.fmt(giây)
  // Trục dọc đảo ngược: pace nhanh (số giây nhỏ) nằm trên.
  function paceLine(box, o) {
    var W = Math.max(260, Math.round(box.clientWidth)), H = 210, L = 46, R = 16, T = 18, B = 28;
    var pw = W - L - R, ph = H - T - B, pts = o.pts, NS = 'http://www.w3.org/2000/svg';
    var vs = [];
    pts.forEach(function (p) { vs.push(p.v, p.avg); });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    var span = Math.max(30, hi - lo), step = span <= 60 ? 15 : span <= 150 ? 30 : 60;
    lo = Math.floor((lo - 5) / step) * step; hi = Math.ceil((hi + 5) / step) * step;
    function X(t) { return L + (o.to > o.from ? (t - o.from) / (o.to - o.from) * pw : pw / 2); }
    function Y(v) { return T + (v - lo) / (hi - lo) * ph; }

    var s = '';
    for (var v = lo; v <= hi; v += step) {
      var y = Y(v).toFixed(1);
      s += '<line class="ch-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<text class="ch-tk" x="' + (L - 8) + '" y="' + (+y + 4) + '" text-anchor="end">' + esc(o.fmt(v)) + '</text>';
    }
    for (var k = 0; k <= 3; k++) {
      var t = o.from + k * (o.to - o.from) / 3, d = new Date(t);
      s += '<text class="ch-tk" x="' + X(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (k === 0 ? 'start' : k === 3 ? 'end' : 'middle') + '">' + Core.fmt(d) + '</text>';
    }
    s += pts.map(function (p) { return '<circle class="ch-dot" cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4"/>'; }).join('');
    s += '<path class="ch-line" d="M' + pts.map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.avg).toFixed(1); }).join('L') + '"/>';
    var last = pts[pts.length - 1], lx = X(last.t), ly = Y(last.avg);
    s += '<circle class="ch-end" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="5"/>';
    s += '<text class="ch-endl" x="' + (lx - 9).toFixed(1) + '" y="' + (ly < T + 16 ? ly + 18 : ly - 10).toFixed(1) + '" text-anchor="end">' + esc(o.fmt(last.avg)) + '</text>';
    s += '<line class="ch-cross" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" visibility="hidden"/>';
    s += '<circle class="ch-hot" r="6" cx="0" cy="0" visibility="hidden"/>';
    s += '<rect class="ch-hit" x="' + L + '" y="0" width="' + pw + '" height="' + (T + ph) + '"/>';

    box.innerHTML = '<svg class="ch-svg" xmlns="' + NS + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"'
      + ' role="img" tabindex="0" aria-label="' + esc(o.aria) + '">' + s + '</svg>';

    var svg = box.firstChild, cross = svg.querySelector('.ch-cross'), hot = svg.querySelector('.ch-hot'), cur = -1;
    function show(i) {
      cur = i;
      var p = pts[i], x = X(p.t), y = Y(p.v), r = svg.getBoundingClientRect();
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hot.setAttribute('cx', x); hot.setAttribute('cy', y); hot.setAttribute('visibility', 'visible');
      showRows(p.head, p.rows, r.left + x, r.top + Math.min(y, Y(p.avg)));
    }
    function hide() { cur = -1; cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); hideTip(); }
    svg.addEventListener('pointermove', function (e) {
      var x = e.clientX - svg.getBoundingClientRect().left, best = 0, bd = Infinity;
      pts.forEach(function (p, i) { var dd = Math.abs(X(p.t) - x); if (dd < bd) { bd = dd; best = i; } });
      if (best !== cur || (tip && tip.hidden)) show(best);
    });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var i = cur < 0 ? pts.length - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1);
      show(Math.max(0, Math.min(pts.length - 1, i)));
    });
  }

  return {
    bindTips: bindTips, hideTip: hideTip, tipAttrs: tipAttrs,
    columns: columns, heatmap: heatmap, hbars: hbars, spark: spark, table: table, paceLine: paceLine
  };
})(window.Core);
