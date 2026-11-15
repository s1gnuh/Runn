'use strict';
const { getRedis, subId, putSub, dropSub } = require('../lib/store');

const TIME_RE = /^(\d{2}):(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

function readBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return req.body;
}

function cleanSub(s) {
  if (!s || typeof s !== 'object') return null;
  if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  const k = s.keys;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  if (k.p256dh.length > 300 || k.auth.length > 300) return null;
  return { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

function cleanDays(days) {
  if (!Array.isArray(days)) return [];
  return days.slice(0, MAX_DAYS).reduce((out, d) => {
    if (d && DATE_RE.test(d.date) && typeof d.title === 'string') {
      const item = { date: d.date, title: d.title.slice(0, 120), done: !!d.done };
      if (['easy', 'quality', 'long', 'race'].includes(d.type)) item.type = d.type;
      if (typeof d.pace === 'number' && d.pace >= 150 && d.pace <= 900) item.pace = Math.round(d.pace);
      out.push(item);
    }
    return out;
  }, []);
}

// "99:99" khớp \d{2}:\d{2} nhưng vô nghĩa, và giờ 99 sẽ khiến cron không
// bao giờ gửi được, nên phải kiểm tra cả khoảng giá trị.
function cleanTime(t) {
  const m = typeof t === 'string' ? TIME_RE.exec(t) : null;
  if (!m) return '06:30';
  return Number(m[1]) > 23 || Number(m[2]) > 59 ? '06:30' : t;
}

// Vị trí để lấy thời tiết sáng nay: chỉ nhận khi người dùng bật, làm tròn 1 chữ
// số thập phân (~10 km) — app đã làm tròn trước khi gửi, đây là lớp chặn thứ hai.
function cleanWx(w) {
  if (!w || typeof w !== 'object') return null;
  const lat = Number(w.lat), lon = Number(w.lon), hour = Number(w.hour);
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return null;
  return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, hour: hour >= 0 && hour <= 23 ? Math.round(hour) : 6 };
}

function cleanTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return 'Asia/Ho_Chi_Minh';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch (e) {
    return 'Asia/Ho_Chi_Minh';
  }
}

module.exports = async (req, res) => {
  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'storage_not_configured' });

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: 'bad_body' });

  const sub = cleanSub(body.subscription);
  if (!sub) return res.status(400).json({ error: 'bad_subscription' });
  const id = subId(sub.endpoint);

  if (req.method === 'DELETE') {
    await dropSub(redis, id);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const record = {
    sub,
    on: body.on !== false,
    time: cleanTime(body.time),
    tz: cleanTz(body.tz),
    days: cleanDays(body.days),
    wx: cleanWx(body.wx),
    at: Date.now()
  };

  try {
    await putSub(redis, id, record);
  } catch (e) {
    if (e.code === 'too_many_subscriptions') return res.status(429).json({ error: e.code });
    throw e;
  }
  return res.status(200).json({ ok: true, sessions: record.days.length });
};
