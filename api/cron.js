'use strict';
// Vercel Cron gọi mỗi ngày. Với từng subscription, tính ngày/giờ theo múi giờ
// của máy đã đăng ký rồi đẩy thông báo nếu hôm nay còn buổi chạy chưa xong.
const webpush = require('web-push');
const { getRedis, allSubs, dropSub } = require('../lib/store');
const REST_TIPS = require('../rest-tips.json');
const { todayAt, advice } = require('../lib/heat');

function localNow(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return { date: get('year') + '-' + get('month') + '-' + get('day'), hour: Number(get('hour')) };
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return res.status(503).json({ error: 'push_not_configured' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:run@example.com', pub, priv);

  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'storage_not_configured' });

  const subs = await allSubs(redis);
  let sent = 0, skipped = 0, dropped = 0, withWx = 0;
  const wxCache = new Map();   // cùng toạ độ + giờ + ngày thì hỏi Open-Meteo một lần

  for (const { id, rec } of subs) {
    if (rec.on === false) { skipped++; continue; }

    // Gói Hobby chỉ cho cron chạy một lần mỗi ngày, nên giờ chạy cron chính
    // là giờ nhắc. Không chặn theo rec.time nữa, vì đặt giờ muộn hơn cron sẽ
    // làm thông báo không bao giờ được gửi.
    const now = localNow(rec.tz || 'Asia/Ho_Chi_Minh');
    const days = rec.days || [];
    const todays = days.filter((d) => d.date === now.date);
    const undone = todays.find((d) => !d.done);

    let title, body;
    if (undone) {
      title = 'Hôm nay có buổi chạy';
      body = undone.title;
      if (rec.wx) {
        const k = rec.wx.lat + ',' + rec.wx.lon + ',' + rec.wx.hour + ',' + now.date;
        if (!wxCache.has(k)) wxCache.set(k, await todayAt(rec.wx.lat, rec.wx.lon, rec.wx.hour, now.date));
        const line = advice(wxCache.get(k), undone);
        if (line) { body += '\n' + rec.wx.hour + 'h: ' + line; withWx++; }
      }
    } else if (todays.length) {
      skipped++; continue;              // buổi hôm nay đã xong, không làm phiền
    } else {
      const dates = days.map((d) => d.date).sort();
      const inPlan = dates.length && now.date >= dates[0] && now.date <= dates[dates.length - 1];
      if (!inPlan) { skipped++; continue; }
      title = 'Hôm nay không có buổi chạy';
      body = REST_TIPS[Math.floor(Math.random() * REST_TIPS.length)];
    }

    const payload = JSON.stringify({ title, body, url: '/index.html', tag: 'bn27-remind' });

    try {
      await webpush.sendNotification(rec.sub, payload, { TTL: 10 * 60 * 60 });
      sent++;
    } catch (e) {
      // 404/410: trình duyệt đã huỷ đăng ký, bỏ khỏi kho cho sạch
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await dropSub(redis, id);
        dropped++;
      } else {
        skipped++;
      }
    }
  }

  return res.status(200).json({ ok: true, total: subs.length, sent, skipped, dropped, withWx });
};
