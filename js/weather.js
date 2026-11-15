// Thời tiết lúc chạy từ Open-Meteo (miễn phí, không cần API key) và pace
// hiệu chỉnh nhiệt. Chỉ bật khi người dùng chọn một vị trí ở Cài đặt; toạ độ
// được làm tròn 1 chữ số thập phân (~10 km) trước khi lưu và gửi đi — đủ cho
// thời tiết mà không lộ chỗ ở. Nhật ký không có giờ chạy nên lấy số liệu tại
// "giờ chạy thường" người dùng đặt (mặc định 6h sáng), theo giờ địa phương.
//
// Ngày gần đây hỏi API dự báo (có sẵn vài ngày quá khứ); ngày cũ hơn hỏi kho
// lưu trữ ERA5, vốn trễ khoảng 5 ngày nên không dùng được cho tuần này.
//
// Hiệu chỉnh nhiệt theo quy tắc "nhiệt độ + điểm sương" (°F) quen thuộc với
// dân chạy: tổng dưới 100 không ảnh hưởng, rồi chậm dần tới khoảng 10% ở 180.
// Nội suy tuyến tính giữa các mốc của bảng. Dùng điểm sương thay vì độ ẩm vì
// nó phản ánh đúng việc mồ hôi còn bay hơi được hay không.
window.Weather = (function (Core) {
  'use strict';
  var KEY = 'app-wx';
  var FORECAST = 'https://api.open-meteo.com/v1/forecast';
  var ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
  var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m';
  var RECENT = 10;     // ngày gần đây lấy từ API dự báo
  var CHUNK = 120;     // số ngày tối đa mỗi lần hỏi kho lưu trữ
  var HEAT = [[100, 0], [110, 0.5], [120, 1], [130, 2], [140, 3], [150, 4.5], [160, 6], [170, 8], [180, 10]];
  var LEVEL = { cool: 'Mát', warm: 'Ấm', hot: 'Nóng ẩm', vhot: 'Rất nóng ẩm' };

  /* ================= cấu hình ================= */
  function raw() { var c = Core.store.getJSON(KEY, null); return c && typeof c === 'object' ? c : {}; }
  function cfg() { var c = raw(); return typeof c.lat === 'number' && typeof c.lon === 'number' ? c : null; }
  function enabled() { return !!cfg(); }
  function hour() { var h = raw().hour; return typeof h === 'number' && h >= 0 && h <= 23 ? h : 6; }
  function round1(x) { return Math.round(Number(x) * 10) / 10; }
  function setPlace(p) {
    Core.store.setJSON(KEY, { lat: round1(p.lat), lon: round1(p.lon), place: String(p.place || '').slice(0, 80), hour: hour() });
  }
  function setHour(h) {
    var c = raw();
    c.hour = Math.max(0, Math.min(23, Math.round(Number(h) || 0)));
    Core.store.setJSON(KEY, c);
  }
  // Tắt = bỏ vị trí, giữ lại giờ chạy đã chọn cho lần bật sau.
  function disable() { Core.store.setJSON(KEY, { hour: hour() }); }
  // Gửi vị trí (đã làm tròn) kèm đăng ký nhận thông báo, để máy chủ ghép thời
  // tiết sáng nay vào lời nhắc. Mặc định tắt vì là dữ liệu rời khỏi máy.
  function pushOn() { return !!raw().push && enabled(); }
  function setPush(v) { var c = raw(); c.push = !!v; Core.store.setJSON(KEY, c); }
  // Phần gửi lên máy chủ, hoặc null nếu chưa bật.
  function forPush() { var c = cfg(); return c && raw().push ? { lat: c.lat, lon: c.lon, hour: hour() } : null; }

  /* ================= mạng ================= */
  function getJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error('Máy chủ thời tiết báo lỗi ' + r.status + '.');
      return r.json();
    }).then(function (d) { clearTimeout(timer); return d; }, function (e) {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'Máy chủ thời tiết không trả lời.' : (e && e.message) || 'Không kết nối được máy chủ thời tiết.');
    });
  }

  function search(name) {
    var q = String(name || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    return getJSON(GEO + '?count=6&language=vi&format=json&name=' + encodeURIComponent(q)).then(function (d) {
      return ((d && d.results) || []).map(function (r) {
        var parts = [];
        [r.name, r.admin1, r.country].forEach(function (s) { if (s && parts.indexOf(s) < 0) parts.push(s); });
        return { lat: r.latitude, lon: r.longitude, place: parts.join(', ') };
      });
    });
  }

  function locate() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) { rej(new Error('Trình duyệt không hỗ trợ định vị.')); return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ lat: p.coords.latitude, lon: p.coords.longitude, place: 'Vị trí hiện tại' });
      }, function (e) {
        rej(new Error(e && e.code === 1 ? 'Bạn đã từ chối quyền vị trí. Tìm theo tên thành phố thay thế.' : 'Không lấy được vị trí.'));
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
    });
  }

  // Cùng một URL trong một lần mở trang chỉ hỏi một lần (nhập hàng loạt nhiều
  // buổi cùng tuần không bắn hàng chục request giống nhau).
  var memo = {};
  function hourly(url) {
    if (!memo[url]) {
      memo[url] = getJSON(url).then(function (d) { return d && d.hourly ? d.hourly : null; })
        .catch(function (e) { delete memo[url]; throw e; });
    }
    return memo[url];
  }
  function query(c) { return '?latitude=' + c.lat + '&longitude=' + c.lon + '&hourly=' + HOURLY + '&timezone=auto'; }
  function recentUrl(c) { return FORECAST + query(c) + '&past_days=' + (RECENT + 2) + '&forecast_days=1'; }
  function archiveUrl(c, from, to) { return ARCHIVE + query(c) + '&start_date=' + from + '&end_date=' + to; }

  function pick(h, date, hr) {
    if (!h || !h.time) return null;
    var i = h.time.indexOf(date + 'T' + Core.pad(hr) + ':00');
    if (i < 0) return null;
    var t = h.temperature_2m && h.temperature_2m[i], dp = h.dew_point_2m && h.dew_point_2m[i];
    var rh = h.relative_humidity_2m && h.relative_humidity_2m[i];
    if (t == null || dp == null) return null;
    return { t: round1(t), dp: round1(dp), rh: rh == null ? null : Math.round(rh), h: hr };
  }

  /* ================= gắn thời tiết vào buổi chạy ================= */
  // redo: lấy lại cả buổi đã có thời tiết nhưng ở giờ khác giờ chạy hiện tại.
  function needs(r, redo) {
    if ((r.kind !== 'run' && r.kind !== 'walk') || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return false;
    if (Core.fromIso(r.date) > Core.today0()) return false;
    return !r.wx || (!!redo && r.wx.h !== hour());
  }

  // Gom các buổi cũ thành những khoảng ngày liền nhau, mỗi khoảng tối đa CHUNK
  // ngày, để mỗi lần hỏi kho lưu trữ phủ được nhiều buổi.
  function windows(list) {
    var sorted = list.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }), out = [], cur = null;
    sorted.forEach(function (r) {
      if (cur && (Core.fromIso(r.date) - Core.fromIso(cur.from)) / 864e5 < CHUNK) { cur.to = r.date; cur.runs.push(r); return; }
      cur = { from: r.date, to: r.date, runs: [r] };
      out.push(cur);
    });
    return out;
  }

  // Gắn r.wx cho các buổi cần (chưa lưu — người gọi tự lưu những buổi trả về).
  // Trả về { done: [buổi vừa có thời tiết], failed: số lần hỏi lỗi, error }.
  function attach(list, redo, onProgress) {
    var c = cfg(), out = { done: [], failed: 0, error: '' };
    if (!c) return Promise.resolve(out);
    var hr = hour(), t0 = Core.today0(), recent = [], old = [];
    list.filter(function (r) { return needs(r, redo); }).forEach(function (r) {
      ((t0 - Core.fromIso(r.date)) / 864e5 <= RECENT ? recent : old).push(r);
    });
    var jobs = [];
    if (recent.length) jobs.push({ url: recentUrl(c), runs: recent });
    windows(old).forEach(function (w) { jobs.push({ url: archiveUrl(c, w.from, w.to), runs: w.runs }); });
    var n = 0;
    // Hỏi lần lượt cho nhẹ nhàng với dịch vụ miễn phí.
    return jobs.reduce(function (p, job) {
      return p.then(function () {
        return hourly(job.url).then(function (h) {
          job.runs.forEach(function (r) {
            var w = pick(h, r.date, hr);
            if (w) { r.wx = w; out.done.push(r); }
          });
        }).catch(function (e) { out.failed++; out.error = e.message; }).then(function () {
          if (onProgress) onProgress(++n, jobs.length);
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /* ================= hiệu chỉnh nhiệt ================= */
  function toF(c) { return c * 9 / 5 + 32; }
  // { sum: °F, pct: % chậm đi do nóng ẩm, level } hoặc null nếu thiếu số liệu.
  function heat(wx) {
    if (!wx || wx.t == null || wx.dp == null) return null;
    var sum = toF(wx.t) + toF(wx.dp), pct = 0;
    if (sum > HEAT[0][0]) {
      pct = HEAT[HEAT.length - 1][1] + (sum - HEAT[HEAT.length - 1][0]) * 0.2;
      for (var i = 1; i < HEAT.length; i++) {
        if (sum <= HEAT[i][0]) {
          var a = HEAT[i - 1], b = HEAT[i];
          pct = a[1] + (b[1] - a[1]) * (sum - a[0]) / (b[0] - a[0]);
          break;
        }
      }
    }
    pct = Math.min(15, pct);
    var level = sum <= 120 ? 'cool' : sum <= 150 ? 'warm' : sum <= 170 ? 'hot' : 'vhot';
    return { sum: Math.round(sum), pct: Math.round(pct * 10) / 10, level: level, label: LEVEL[level] };
  }
  // Số giây (cả buổi hoặc mỗi km) quy về điều kiện trời mát.
  function adjust(sec, wx) {
    var h = heat(wx);
    return h && sec > 0 ? sec / (1 + h.pct / 100) : sec;
  }
  function text(wx) {
    return Core.fmtNum(wx.t, 0) + '°C' + (wx.rh != null ? ' · ẩm ' + wx.rh + '%' : '');
  }

  return {
    cfg: cfg, enabled: enabled, hour: hour, setPlace: setPlace, setHour: setHour, disable: disable,
    pushOn: pushOn, setPush: setPush, forPush: forPush,
    search: search, locate: locate, needs: needs, attach: attach,
    heat: heat, adjust: adjust, text: text, LEVEL: LEVEL
  };
})(window.Core);
