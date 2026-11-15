'use strict';
// Thời tiết + hiệu chỉnh nhiệt cho máy chủ (cron). Bảng mức chậm đi theo
// "nhiệt độ + điểm sương" (°F) phải GIỐNG HỆT js/weather.js phía trình duyệt;
// sửa một nơi thì sửa cả hai. Node không nạp được file trình duyệt nên chép lại.
const HEAT = [[100, 0], [110, 0.5], [120, 1], [130, 2], [140, 3], [150, 4.5], [160, 6], [170, 8], [180, 10]];
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m';

function toF(c) { return c * 9 / 5 + 32; }
function heat(wx) {
  if (!wx || typeof wx.t !== 'number' || typeof wx.dp !== 'number') return null;
  const sum = toF(wx.t) + toF(wx.dp);
  let pct = 0;
  if (sum > HEAT[0][0]) {
    pct = HEAT[HEAT.length - 1][1] + (sum - HEAT[HEAT.length - 1][0]) * 0.2;
    for (let i = 1; i < HEAT.length; i++) {
      if (sum <= HEAT[i][0]) { const a = HEAT[i - 1], b = HEAT[i]; pct = a[1] + (b[1] - a[1]) * (sum - a[0]) / (b[0] - a[0]); break; }
    }
  }
  pct = Math.min(15, pct);
  const level = sum <= 120 ? 'cool' : sum <= 150 ? 'warm' : sum <= 170 ? 'hot' : 'vhot';
  return { sum: Math.round(sum), pct: Math.round(pct * 10) / 10, level };
}

// Dự báo của hôm nay (theo giờ địa phương của toạ độ) tại giờ `hour`.
// Trả { t, dp, rh } hoặc null. Lỗi mạng cũng trả null: thông báo vẫn đi, chỉ
// thiếu dòng thời tiết.
async function todayAt(lat, lon, hour, date) {
  const url = FORECAST + '?latitude=' + lat + '&longitude=' + lon + '&hourly=' + HOURLY + '&timezone=auto&forecast_days=2';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    const h = j && j.hourly;
    if (!h || !h.time) return null;
    const i = h.time.indexOf(date + 'T' + String(hour).padStart(2, '0') + ':00');
    if (i < 0 || h.temperature_2m[i] == null || h.dew_point_2m[i] == null) return null;
    return { t: Math.round(h.temperature_2m[i] * 10) / 10, dp: Math.round(h.dew_point_2m[i] * 10) / 10,
             rh: h.relative_humidity_2m && h.relative_humidity_2m[i] != null ? Math.round(h.relative_humidity_2m[i]) : null };
  } catch (e) {
    return null;
  }
}

function fmtPace(sec) {
  sec = Math.round(sec);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// Dòng thời tiết + lời khuyên cho buổi hôm nay. day: { title, type, pace }.
function advice(wx, day) {
  if (!wx) return '';
  const h = heat(wx);
  let s = wx.t + '°C' + (wx.rh != null ? ', ẩm ' + wx.rh + '%' : '');
  if (!h || h.pct < 1) return s + ' · trời mát, chạy thoải mái.';
  s += (h.level === 'warm' ? ' · oi, chậm hơn khoảng ' : ' · nóng ẩm, chậm hơn khoảng ') + Math.round(h.pct) + '%';
  if (day.pace) s += ', khoảng ' + fmtPace(day.pace * (1 + h.pct / 100)) + '/km';
  s += '.';
  if (h.pct >= 8 && day.type === 'quality') s += ' Cân nhắc đổi buổi chất lượng thành chạy nhẹ.';
  else if (h.pct >= 4) s += ' Mang nước, xuất phát chậm.';
  return s;
}

module.exports = { heat, todayAt, advice, fmtPace };
