// Nhắc chạy + Web Push — dùng ở trang chủ (dashboard), không thuộc riêng
// giải nào. Gộp "hôm nay có gì" từ TẤT CẢ block đang active (nhiều giải có
// thể chạy song song), thay vì đọc một giáo án cứng như bản cũ.
window.Notify = (function (Core, Blocks) {
  'use strict';
  var KEY = 'bn27-notify'; // giữ nguyên khoá cũ để không mất cài đặt đã lưu
  function okTime(t) {
    var m = typeof t === 'string' ? /^(\d{2}):(\d{2})$/.exec(t) : null;
    return !!m && +m[1] <= 23 && +m[2] <= 59;
  }
  var cfg = { on: false, time: '06:30' };
  try {
    var s = JSON.parse(Core.store.get(KEY) || 'null');
    if (s && typeof s === 'object') { cfg.on = !!s.on; if (okTime(s.time)) cfg.time = s.time; }
  } catch (e) {}
  var timer = 0, hasPush = false, pushSub = null, pushTimer = 0, REST_TIPS = ['Tập chống đẩy hoặc squat vài hiệp cho chân khỏe.'];

  function save() { Core.store.set(KEY, JSON.stringify(cfg)); }
  function canNotify() { return 'Notification' in window && 'serviceWorker' in navigator; }
  function granted() { return canNotify() && Notification.permission === 'granted'; }
  function el(id) { return document.getElementById(id); }

  function loadTips() {
    return fetch('rest-tips.json').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (Array.isArray(d) && d.length) REST_TIPS = d; }).catch(function () {});
  }

  /* ---------- gom "hôm nay" từ mọi block đang active ---------- */
  function activeBlocks() { return Blocks.list().filter(Blocks.isActive); }
  // Pace ghi trong buổi (giây/km): điểm giữa "Pace a–b" của buổi nhẹ/dài, hoặc
  // "@ m:ss" đầu tiên của buổi chất lượng. Máy chủ dùng để nói "khoảng x:xx/km"
  // sau khi cộng mức chậm do nóng ẩm. Không có thì bỏ trống.
  function paceOf(s) {
    var txt = (s.title || '') + ' ' + (s.d || ''), m = /Pace (\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(txt);
    if (m) return Math.round((+m[1] * 60 + +m[2] + +m[3] * 60 + +m[4]) / 2);
    m = /@ (\d{1,2}):(\d{2})/.exec(txt);
    return m ? +m[1] * 60 + +m[2] : 0;
  }
  function buildDays() {
    var out = [], seen = {};
    activeBlocks().forEach(function (b) {
      Blocks.sessionsOf(b).list.forEach(function (x) {
        if (x.s.type === 'rest') return;
        var key = b.id + ':' + x.id;
        if (seen[key]) return;
        seen[key] = 1;
        var d = { date: Core.iso(x.date), title: x.s.title, done: !!b.done[x.id], type: x.s.type }, p = paceOf(x.s);
        if (p) d.pace = p;
        out.push(d);
      });
    });
    return out;
  }
  function planRange() {
    var ds = buildDays().map(function (d) { return d.date; }).sort();
    return ds.length ? { first: ds[0], last: ds[ds.length - 1] } : null;
  }
  function todayPlan() {
    var key = Core.iso(Core.today0());
    var todays = buildDays().filter(function (d) { return d.date === key; });
    var undone = todays.filter(function (d) { return !d.done; })[0];
    if (undone) return { title: 'Hôm nay có buổi chạy', body: undone.title };
    if (todays.length) return null; // buổi hôm nay đã xong
    var r = planRange();
    if (!r || key < r.first || key > r.last) return null; // không có block nào đang chạy
    return { title: 'Hôm nay không có buổi chạy', body: REST_TIPS[(Math.random() * REST_TIPS.length) | 0] };
  }

  /* ---------- thông báo cục bộ ---------- */
  function show(title, body) {
    if (!granted()) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'bn27-remind', data: { url: 'index.html' } });
    }).catch(function () {});
  }
  function remindAt() {
    var hm = cfg.time.split(':'), at = new Date();
    at.setHours(+hm[0], +hm[1], 0, 0);
    return at;
  }
  function schedule() {
    clearTimeout(timer);
    if (!cfg.on || !granted() || !todayPlan()) return;
    var ms = remindAt() - new Date();
    if (ms <= 0) return;
    timer = setTimeout(function () { var p = todayPlan(); if (p) show(p.title, p.body); }, Math.min(ms, 0x7fffffff));
  }
  function nudgeIfDue() {
    var p = todayPlan();
    if (!p || new Date() < remindAt()) return false;
    show(p.title, p.body);
    return true;
  }
  function registerPeriodic() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.periodicSync) return;
      return reg.periodicSync.register('bn27-remind', { minInterval: 12 * 60 * 60 * 1000 });
    }).catch(function () {});
  }

  /* ---------- trạng thái lưu cho service worker chạy nền ---------- */
  function stateUrl() { return new URL('state.json', location.href).href; }
  function syncState() {
    pushState();
    if (!('caches' in window)) return Promise.resolve();
    var body = JSON.stringify({ on: cfg.on, time: cfg.time, days: buildDays(), tips: REST_TIPS });
    return caches.open('bn27-state').then(function (c) { return c.put(stateUrl(), new Response(body, { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }

  /* ---------- Web Push qua máy chủ ---------- */
  function b64ToBytes(s) {
    var pad = '='.repeat((4 - (s.length % 4)) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function vapidKey() {
    return fetch('api/vapid').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { return d && d.key ? d.key : null; }).catch(function () { return null; });
  }
  function enablePush() {
    if (!('PushManager' in window) || !granted()) return Promise.resolve(false);
    return vapidKey().then(function (key) {
      if (!key) return false;
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existing) {
          return existing || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
        });
      }).then(function (sub) { pushSub = sub; return postSub(sub); }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  function postSub(sub) {
    if (!sub) return Promise.resolve();
    return fetch('api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, on: cfg.on, time: cfg.time,
        tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || 'Asia/Ho_Chi_Minh', days: buildDays(),
        wx: window.Weather ? window.Weather.forPush() : null })
    }).catch(function () {});
  }
  function pushState() {
    if (!pushSub) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { postSub(pushSub); }, 2000);
  }
  function disablePush() {
    if (!pushSub) return Promise.resolve();
    var sub = pushSub; pushSub = null; clearTimeout(pushTimer);
    return fetch('api/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) })
      .catch(function () {}).then(function () { return sub.unsubscribe ? sub.unsubscribe().catch(function () {}) : null; });
  }

  var PUSH_ERR = {
    push_not_configured: 'Thiếu VAPID_PRIVATE_KEY trên Vercel. Dán đủ biến môi trường rồi deploy lại.',
    storage_not_configured: 'Chưa nối kho Upstash Redis trên Vercel, hoặc nối xong chưa deploy lại.',
    subscription_not_registered: 'Máy này chưa được lưu lên máy chủ. Tắt rồi bật lại nhắc nhở.',
    no_subscriptions: 'Chưa có máy nào đăng ký nhận thông báo.',
    need_subscription_or_secret: 'Thiếu thông tin đăng ký khi gọi máy chủ.'
  };
  function tryPush(allowRetry) {
    return fetch('api/test-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: pushSub }) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (out) {
        var d = out.d || {};
        if (out.status === 200 && d.ok) return '';
        if (d.error === 'subscription_not_registered' && allowRetry) return postSub(pushSub).then(function () { return tryPush(false); });
        if (out.status === 404 && !d.error) return 'Máy chủ không có /api/test-push. Bản deploy có thể chưa xong.';
        if (PUSH_ERR[d.error]) return PUSH_ERR[d.error];
        var e0 = (d.errors && d.errors[0]) || null;
        if (e0 && (e0.status === 403 || e0.status === 400)) return 'Khoá VAPID không khớp với đăng ký cũ của máy này. Tắt rồi bật lại nhắc nhở.';
        if (e0) return 'Dịch vụ push trả lỗi ' + e0.status + ': ' + e0.message;
        return 'Máy chủ trả lỗi ' + out.status + (d.error ? ' (' + d.error + ')' : '') + '.';
      }).catch(function () { return 'Không gọi được máy chủ. Kiểm tra mạng hoặc trang đã deploy chưa.'; });
  }

  /* ---------- UI ---------- */
  function render() {
    var btn = el('nt-toggle'), st = el('nt-status'), tm = el('nt-time'), test = el('nt-test');
    if (!btn || !st) return;
    if (tm) tm.value = cfg.time;
    if (test) test.hidden = !granted() || !cfg.on;
    if (!canNotify()) {
      btn.disabled = true; btn.textContent = 'Không dùng được';
      st.textContent = 'Trình duyệt này chưa cho gửi thông báo. Trên iPhone, hãy bấm Chia sẻ → Thêm vào màn hình chính, rồi mở lại từ icon đó.';
      return;
    }
    btn.disabled = false;
    if (Notification.permission === 'denied') {
      btn.textContent = 'Đã bị chặn'; btn.disabled = true;
      st.textContent = 'Bạn đã chặn thông báo cho trang này. Mở lại trong cài đặt trình duyệt rồi quay lại đây.';
      return;
    }
    btn.textContent = cfg.on && granted() ? 'Tắt nhắc nhở' : 'Bật nhắc nhở';
    if (!cfg.on || !granted()) { st.textContent = 'Đang tắt.'; return; }
    st.textContent = hasPush
      ? 'Đang bật kèm thông báo đẩy từ máy chủ, nhắc lúc 6:30 sáng mỗi ngày kể cả khi đã đóng app.'
      : 'Đang bật, nhắc lúc ' + cfg.time + ' nhưng chỉ khi app đang mở hoặc khi điện thoại đánh thức app chạy nền. Máy chủ đẩy thông báo chưa sẵn sàng.';
  }

  function enable() {
    if (!canNotify()) return;
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        cfg.on = true; save();
        syncState(); registerPeriodic();
        if (!nudgeIfDue()) show('Đã bật nhắc chạy', 'Sẽ nhắc lúc ' + cfg.time + ' vào ngày có buổi chạy.');
        schedule();
        enablePush().then(function (ok) { hasPush = ok; render(); });
      }
      render();
    }).catch(function () { render(); });
  }
  function disable() {
    cfg.on = false; save(); clearTimeout(timer);
    syncState();
    disablePush().then(function () { hasPush = false; render(); });
    render();
  }

  return {
    render: render,
    // Cài đặt thời tiết đổi thì gửi lại đăng ký để máy chủ có / bỏ vị trí.
    resync: function () { pushState(); },
    init: function () {
      loadTips().then(function () {
        render();
        if (cfg.on && granted()) { registerPeriodic(); schedule(); enablePush().then(function (ok) { hasPush = ok; render(); }); }
      });
    },
    sync: function () { syncState(); schedule(); },
    health: function () {
      var st = el('nt-status');
      if (st) st.textContent = 'Đang kiểm tra máy chủ...';
      fetch('api/health').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!st) return;
        if (!d) { st.textContent = 'Không gọi được /api/health. Bản deploy có thể chưa xong.'; return; }
        var bad = [];
        if (!d.vapidPublic) bad.push('thiếu VAPID_PUBLIC_KEY');
        if (!d.vapidPrivate) bad.push('thiếu VAPID_PRIVATE_KEY');
        if (d.storage === 'missing_env') bad.push('chưa nối kho Upstash Redis');
        if (d.storage === 'wrong_env_shape') bad.push('kho nối sai kiểu biến');
        if (d.storage === 'unreachable') bad.push('không kết nối được Upstash (' + (d.storageError || '') + ')');
        var keys = (d.envKeys || []).join(', ') || 'không có biến nào';
        var warn = (d.vapidSubject ? '' : ' Lưu ý: chưa đặt VAPID_SUBJECT, iPhone có thể từ chối nhận.') + (d.cronSecret ? '' : ' Chưa đặt CRON_SECRET nên ai cũng gọi được /api/cron.');
        st.textContent = bad.length
          ? 'Máy chủ còn thiếu: ' + bad.join('; ') + '. ' + (d.hint ? d.hint + ' ' : '') + 'Biến đang có trên server: ' + keys + '. Sửa trên Vercel rồi deploy lại.'
          : 'Máy chủ sẵn sàng, đang có ' + d.subscriptions + ' máy đăng ký nhận thông báo.' + warn;
      }).catch(function () { if (st) st.textContent = 'Không gọi được /api/health.'; });
    },
    toggle: function () { if (cfg.on && granted()) disable(); else enable(); },
    setTime: function (v) { if (!okTime(v)) return; cfg.time = v; save(); syncState(); schedule(); render(); },
    test: function () {
      var st = el('nt-status');
      if (!pushSub) { show('Thử thông báo cục bộ', 'Thông báo này từ chính máy bạn, chưa phải từ máy chủ.'); Core.toast('Chưa có push từ máy chủ', 'Bấm "Kiểm tra máy chủ" để xem còn thiếu gì.'); return; }
      if (st) st.textContent = 'Đang gửi thử qua máy chủ...';
      tryPush(true).then(function (msg) {
        if (msg) { if (st) st.textContent = msg; Core.toast('Gửi thử thất bại', msg); }
        else { Core.toast('Đã gửi từ máy chủ', 'Thông báo sẽ hiện ra trong vài giây.'); render(); }
      });
    }
  };
})(window.Core, window.Blocks);
