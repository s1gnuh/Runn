// Đọc ảnh chụp màn hình Strava (khoảng cách, pace, thời gian) bằng Gemini.
// Tối ưu cho tốc độ: gọi thẳng từ trình duyệt tới Google (không qua máy chủ
// trung gian), dùng model Flash-Lite, ảnh thu nhỏ còn ~960px, ép trả JSON
// theo schema 3 trường nên chỉ sinh vài chục token. Ảnh gốc được giải mã một
// lần rồi dùng chung cho cả bản gửi đi lẫn bản lưu vào nhật ký.
window.Vision = (function (Core) {
  'use strict';
  var K_KEY = 'app-gemini-key', K_MODEL = 'app-gemini-model';
  var DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var SEND_PX = 960, STORE_PX = 1400, TIMEOUT_MS = 20000;

  var PROMPT = 'Ảnh chụp màn hình hoạt động chạy trên Strava. Đọc 3 số liệu: '
    + 'km = quãng đường theo km (số thập phân, dấu chấm); '
    + 'pace = tốc độ trung bình theo phút/km, dạng m:ss; '
    + 'time = thời gian di chuyển, dạng m:ss hoặc h:mm:ss; '
    + 'date = ngày diễn ra hoạt động dạng YYYY-MM-DD nếu ảnh có ghi ngày '
    + '(thiếu năm thì lấy năm ' + new Date().getFullYear() + '). '
    + 'Số liệu nào không thấy trong ảnh thì để chuỗi rỗng (km để 0). '
    + 'kind = loại hoạt động: "walk" nếu là đi bộ, "run" nếu là chạy bộ, "other" nếu là môn khác (đạp xe, bơi...). '
    + 'Cách phân biệt trên Strava: đi bộ có trường "bước chân" (steps) và biểu tượng chiếc giày nằm bẹt, không có pace; '
    + 'chạy bộ có trường pace và biểu tượng chiếc giày nhấc gót chân lên. '
    + 'Đi bộ thì pace để chuỗi rỗng nếu ảnh không có. '
    + 'Bỏ qua mọi trường khác trong ảnh, đặc biệt là độ cao leo (Elev Gain), không dùng nó thay cho km hay pace.';

  var SCHEMA = {
    type: 'OBJECT',
    properties: {
      km: { type: 'NUMBER' },
      pace: { type: 'STRING' },
      time: { type: 'STRING' },
      date: { type: 'STRING' },
      kind: { type: 'STRING', enum: ['run', 'walk', 'other'] }
    },
    required: ['km', 'pace', 'time', 'date', 'kind']
  };

  var REPORT_PROMPT = 'Bạn là huấn luyện viên chạy bộ, viết tiếng Việt, giọng thân thiện và ngắn gọn. '
    + 'Chỉ dựa vào JSON số liệu bên dưới. Các số dự đoán (du_doan), pace gợi ý (pace_goi_y), tải tập luyện (tai_tap_luyen) '
    + 'và mức chậm đi do nóng ẩm (cham_di_do_nong_phan_tram) đã được app tính sẵn: '
    + 'hãy dùng đúng các số đó, không tự bịa hay đổi số. Không đưa lời khuyên y tế; nếu có dấu hiệu chấn thương '
    + 'thì khuyên gặp bác sĩ. Dữ liệu ít hoặc độ tin cậy thấp thì nói rõ điều đó. '
    + 'Viết đúng 5 mục, mỗi mục có tiêu đề dạng "## Tên mục" rồi 2 đến 4 gạch đầu dòng bắt đầu bằng "- ": '
    + '## Tổng quan, ## Điểm mạnh, ## Cần lưu ý, ## Dự đoán và chiến lược (nhắc giải sắp thi nếu có), '
    + '## Gợi ý tuần tới. Tối đa 300 từ, không dùng bảng.\n\nSố liệu:\n';

  function getKey() { return (Core.store.get(K_KEY) || '').trim(); }
  function getModel() { return (Core.store.get(K_MODEL) || '').trim() || DEFAULT_MODEL; }
  function setKey(v) { Core.store.set(K_KEY, String(v || '').trim()); }
  function setModel(v) { Core.store.set(K_MODEL, String(v || '').trim()); }
  function hasKey() { return !!getKey(); }

  /* ---------- ảnh ---------- */
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return viaImage(file); });
    }
    return viaImage(file);
  }
  function viaImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
      img.src = url;
    });
  }
  function draw(src, maxSide) {
    var w = src.width, h = src.height, sc = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sc));
    c.height = Math.max(1, Math.round(h * sc));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- gọi Gemini ---------- */
  function friendly(status, body) {
    var msg = body && body.error && body.error.message ? String(body.error.message) : '';
    if (status === 400 && /api key/i.test(msg)) return 'API key không hợp lệ. Kiểm tra lại trong Cài đặt.';
    if (status === 401 || status === 403) return 'API key bị từ chối. Kiểm tra lại trong Cài đặt.';
    if (status === 404) return 'Không tìm thấy model "' + getModel() + '". Đổi tên model trong Cài đặt.';
    if (status === 429) return 'Hết hạn mức Gemini, thử lại sau ít phút.';
    return 'Gemini lỗi ' + status + (msg ? ': ' + msg.slice(0, 120) : '');
  }

  function generate(parts, config) {
    var key = getKey();
    if (!key) return Promise.reject(new Error('Chưa có API key Gemini. Thêm trong Cài đặt.'));
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(ENDPOINT + encodeURIComponent(getModel()) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: config }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) throw new Error(friendly(r.status, j));
        var c = j && j.candidates && j.candidates[0];
        var p = c && c.content && c.content.parts;
        var text = '';
        if (p) for (var i = 0; i < p.length; i++) if (p[i].text) text += p[i].text;
        if (!text) throw new Error('Gemini không trả về nội dung.');
        return text;
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('Gemini phản hồi quá lâu, thử lại.');
      if (e instanceof TypeError) throw new Error('Không kết nối được tới Gemini. Kiểm tra mạng.');
      throw e;
    }).then(function (v) { clearTimeout(timer); return v; },
            function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------- chuẩn hoá kết quả ---------- */
  function normKm(v) {
    var n = Number(String(v == null ? '' : v).replace(',', '.'));
    return n > 0 && n < 500 ? String(Math.round(n * 100) / 100) : '';
  }
  function normClock(v, allowHours) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      if (m[3] !== undefined) return allowHours ? (+m[1]) + ':' + m[2] + ':' + m[3] : '';
      return (+m[1]) + ':' + m[2];
    }
    // dạng "1h 02m 03s" / "31m 5s"
    var h = s.match(/(\d+)\s*h/i), mi = s.match(/(\d+)\s*m/i), se = s.match(/(\d+)\s*s/i);
    if (!mi && !se) return '';
    var H = h ? +h[1] : 0, M = mi ? +mi[1] : 0, S = se ? +se[1] : 0;
    if (!allowHours) return M + ':' + Core.pad(S);
    return H ? H + ':' + Core.pad(M) + ':' + Core.pad(S) : M + ':' + Core.pad(S);
  }
  // Chỉ nhận ngày hợp lệ, không ở tương lai và không quá 2 năm trước, để một
  // lần đọc sai không đẩy buổi chạy về một ngày vô lý.
  function normDate(v) {
    var m = String(v == null ? '' : v).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getMonth() !== +m[2] - 1) return '';
    var t0 = Core.today0();
    if (d > Core.addDays(t0, 1) || d < Core.addDays(t0, -730)) return '';
    return Core.iso(d);
  }
  function normalize(o) {
    o = o || {};
    var kind = String(o.kind == null ? '' : o.kind).toLowerCase().trim();
    return { km: normKm(o.km), pace: normClock(o.pace, false), time: normClock(o.time, true), date: normDate(o.date),
             kind: kind === 'run' || kind === 'walk' || kind === 'other' ? kind : '' };
  }

  // Bắt đầu đọc NGAY khi có file. Trả về hai promise chạy song song:
  //   data: { km, pace, time } đã chuẩn hoá (chuỗi rỗng nếu không đọc được)
  //   blob: ảnh đã thu nhỏ để lưu vào nhật ký
  function analyze(file, wantData) {
    var decoded = decode(file);
    var blob = decoded.then(function (src) {
      return new Promise(function (res) {
        draw(src, STORE_PX).toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.86);
      });
    }).catch(function () { return file; });

    var data = null;
    if (wantData) {
      data = decoded.then(function (src) {
        var url = draw(src, SEND_PX).toDataURL('image/jpeg', 0.72);
        return generate([
          { inline_data: { mime_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) } },
          { text: PROMPT }
        ], {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA
        });
      }).then(function (text) {
        var o;
        try { o = JSON.parse(text); } catch (e) { throw new Error('Không hiểu kết quả Gemini trả về.'); }
        return normalize(o);
      });
    }
    return { blob: blob, data: data };
  }

  // Gửi một yêu cầu rất nhỏ để thử key + model, trả về số mili giây.
  function test() {
    var t0 = Date.now();
    return generate([{ text: 'Trả lời đúng một từ: ok' }], { temperature: 0, maxOutputTokens: 32 })
      .then(function () { return Date.now() - t0; });
  }

  // Báo cáo văn bản từ số liệu đã tính sẵn (xem REPORT_PROMPT).
  function report(payload) {
    return generate([{ text: REPORT_PROMPT + JSON.stringify(payload) }],
                    { temperature: 0.4, maxOutputTokens: 1200 });
  }

  return {
    DEFAULT_MODEL: DEFAULT_MODEL,
    getKey: getKey, setKey: setKey, getModel: getModel, setModel: setModel, hasKey: hasKey,
    analyze: analyze, test: test, report: report
  };
})(window.Core);
