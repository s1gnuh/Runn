// Service worker: app-shell cache cho cả trang chủ (index.html) lẫn trang
// giải (race.html). Bump CACHE khi các file dưới đổi đáng kể.
var CACHE = 'bn27-cache-v28';
var STATE = 'bn27-state';
var FONTS = 'bn27-fonts';
var CORE = [
  './',
  './index.html',
  './race.html',
  './plan.html',
  './log.html',
  './stats.html',
  './settings.html',
  './style.css',
  './quotes.js',
  './rest-tips.json',
  './manifest.json',
  './js/core.js',
  './js/nav.js',
  './js/templates.js',
  './js/blocks.js',
  './js/races.js',
  './js/runlog.js',
  './js/goals.js',
  './js/migrate.js',
  './js/notify.js',
  './js/dashboard.js',
  './js/race-page.js',
  './js/plan-page.js',
  './js/log-page.js',
  './js/stats-page.js',
  './js/settings-page.js',
  './js/backup.js',
  './js/vision.js',
  './js/predict.js',
  './js/shoes.js',
  './js/adapt.js',
  './js/charts.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './icons/logo.png',
  './icons/logo-dark.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== STATE && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Vỏ app (html/css/js/json) trả NGAY từ cache rồi mới âm thầm tải bản mới về
// cho lần sau (stale-while-revalidate). Trước đây phải đợi mạng xong mới vẽ,
// nên mỗi lần chuyển tab là một lần khựng — nhất là khi sóng yếu.
// Bản vừa deploy vẫn tới tay người dùng: mỗi lần deploy ta đổi CACHE nên
// service worker mới sẽ cài, skipWaiting rồi trang tự tải lại.
function isCode(req) {
  if (req.mode === 'navigate') return true;
  var p = new URL(req.url).pathname;
  return /\.(html|css|js|json)$/.test(p);
}

// Lời gọi API không bao giờ được cache: chúng phản ánh trạng thái ngay lúc
// hỏi. Cache /api/health từng làm nó báo lỗi cũ sau khi server đã sửa xong.
function isApi(req) {
  return /(^|\/)api\//.test(new URL(req.url).pathname);
}

// Font Google là tài nguyên bất biến (URL có đánh phiên bản). Cache lại để
// khỏi phải hỏi mạng mỗi lần đổi trang — đây là thủ phạm gây nháy chữ.
function isFont(req) {
  return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(req.url);
}

function putIn(cacheName, req, res) {
  var copy = res.clone();
  return caches.open(cacheName).then(function (c) { return c.put(req, copy); });
}

function staleWhileRevalidate(e, req) {
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) putIn(CACHE, req, res);
        return res;
      }).catch(function () {
        return cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
      });
      // Có cache thì trả liền, phần tải mới chạy nền (waitUntil giữ cho service
      // worker không bị ngắt giữa chừng).
      if (cached) { e.waitUntil(net); return cached; }
      return net;
    })
  );
}

function cacheFirst(e, req, cacheName) {
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) putIn(cacheName, req, res);
        return res;
      });
    })
  );
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (isFont(req)) { cacheFirst(e, req, FONTS); return; }
  if (req.url.indexOf(self.location.origin) !== 0) return;
  if (isApi(req)) return;
  if (isCode(req)) { staleWhileRevalidate(e, req); return; }
  cacheFirst(e, req, CACHE);
});

/* ---------- nhắc chạy ---------- */
// Trang chép trạng thái giáo án vào cache STATE vì service worker không đọc
// được localStorage. Nhờ vậy lần chạy nền sau vẫn biết hôm nay còn buổi nào.
function pad(n) { return (n < 10 ? '0' : '') + n; }

function readState() {
  return caches.open(STATE)
    .then(function (c) { return c.match(new URL('state.json', self.location.href).href); })
    .then(function (r) { return r ? r.json() : null; })
    .catch(function () { return null; });
}

function maybeRemind() {
  return readState().then(function (s) {
    if (!s || !s.on || !Array.isArray(s.days)) return;
    var now = new Date();
    var key = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

    // Chạy nền được đánh thức vào giờ bất kỳ nên vẫn phải chặn, tránh báo lúc 3 giờ sáng.
    var hm = String(s.time || '06:30').split(':');
    if (now.getHours() < Number(hm[0])) return;

    var todays = s.days.filter(function (d) { return d.date === key; });
    var undone = todays.filter(function (d) { return !d.done; })[0];
    var title, body;

    if (undone) {
      title = 'Hôm nay có buổi chạy';
      body = undone.title;
    } else if (todays.length) {
      return;                                   // buổi hôm nay đã xong
    } else {
      var dates = s.days.map(function (d) { return d.date; }).sort();
      if (!dates.length || key < dates[0] || key > dates[dates.length - 1]) return;
      var tips = (s.tips && s.tips.length) ? s.tips : ['Tập chống đẩy hoặc squat vài hiệp cho chân khỏe.'];
      title = 'Hôm nay không có buổi chạy';
      body = tips[Math.floor(Math.random() * tips.length)];
    }

    return self.registration.showNotification(title, {
      body: body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'bn27-remind',
      data: { url: './index.html' }
    });
  });
}

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'bn27-remind') e.waitUntil(maybeRemind());
});

self.addEventListener('sync', function (e) {
  if (e.tag === 'bn27-remind') e.waitUntil(maybeRemind());
});

// Sẵn cho trường hợp sau này có máy chủ đẩy thông báo thật.
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Giáo án Bắc Ninh 10K', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'bn27-push',
    data: { url: d.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
