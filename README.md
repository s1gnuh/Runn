# Nhật ký chạy

Ứng dụng web cá nhân theo dõi việc chạy bộ: km, streak, thành tích tốt nhất (PR), mục tiêu riêng — còn **giải đấu chỉ là một cột mốc trên dòng thời gian**, không phải trung tâm của app. Bắt đầu từ giáo án Bắc Ninh Legacy Marathon 2027, nhưng không dừng ở đó: mỗi giải tiếp theo tạo được ngay trong app, tái dùng lại đúng "khuôn" 12 tuần đã dùng cho Bắc Ninh nếu muốn.

Không có framework, không có bước build: HTML, CSS và JavaScript thuần, cộng vài serverless function trên Vercel để đẩy thông báo nhắc chạy. Cài được ra màn hình chính điện thoại như một app.

---

## Hai trang

| | `index.html` (trang chủ) | `race.html?id=...` (trang 1 giải) |
| --- | --- | --- |
| Vai trò | Bảng tổng hợp cá nhân | Chi tiết một giải cụ thể |
| Nội dung | Km/streak/PR, mục tiêu, câu truyền động lực, phân tích xu hướng, danh sách mọi giải, cài đặt nhắc chạy | Lịch 12 tuần, lịch tháng, biểu đồ km/tuần, ảnh & nhật ký, pace/mục tiêu riêng của giải đó |
| Dùng được khi | Luôn luôn | Chỉ khi giải đó có giáo án (block) |

Giải không có giáo án (`blockId` rỗng) vẫn mở được trang riêng để ghi nhật ký chạy tự do — không bắt buộc mọi giải phải theo một kế hoạch 12 tuần.

---

## Mô hình dữ liệu

| Khái niệm | Là gì | Lưu ở đâu |
| --- | --- | --- |
| **Template** (khuôn) | Hình dạng một chu kỳ tập luyện — số tuần, giai đoạn, khối lượng easy/quality/long từng tuần — không gắn ngày cụ thể | `localStorage['app-templates']` |
| **Block** | Một lần áp khuôn vào một giải: ngày bắt đầu, chế độ 3/4 buổi, lịch tuỳ chỉnh, buổi đã chạy, ghi chú | `localStorage['app-blocks']` |
| **Race** (giải) | Mốc trên dòng thời gian: tên, ngày thi, cự ly, mục tiêu, pace zones, có thể gắn hoặc không gắn 1 block | `localStorage['app-races']` |
| **Run** (nhật ký + ảnh) | Mỗi lần chạy, có hoặc không gắn vào 1 buổi tập cụ thể | IndexedDB `bn-runs` |
| **Goal** (mục tiêu cá nhân) | Km/tuần, số buổi/tuần, km/tháng, hoặc mục tiêu thành tích theo cự ly — độc lập với mọi giải | `localStorage['app-goals']` |
| **PR** | Thành tích tốt nhất theo cự ly (5K/10K/Half/Full), tính lại từ nhật ký mỗi khi cần, không lưu riêng | tính từ `bn-runs` |

Giải Bắc Ninh Legacy Marathon 2027 chính là bản ghi đầu tiên của cả Template, Block và Race — không có gì đặc biệt về mặt code, chỉ là dữ liệu được tạo từ lần migrate đầu tiên.

---

## Tính năng

### Trang chủ

- **Buổi tiếp theo** gộp từ mọi block đang active (nhiều giải chạy song song vẫn hiện đúng buổi gần nhất).
- **Thống kê**: km tuần này, km tháng này, streak (số ngày chạy liên tục), tổng km/số buổi từ trước tới giờ.
- **PR theo cự ly**: 5K, 10K, Half, Full — tự nhận ra từ các run có `km` khớp cự ly chuẩn (sai số ±5%) và có ghi thời gian.
- **Mục tiêu cá nhân**: km/tuần, số buổi/tuần, km/tháng, hoặc mục tiêu thành tích — mỗi mục tiêu có thanh tiến độ riêng.
- **Phân tích xu hướng** (rule-based, không AI/ML): biểu đồ km 8 tuần dương lịch gần nhất, cảnh báo khi tuần này tăng hơn 10% so với trung bình 7 tuần trước (đúng nguyên tắc "tăng tải không quá 10%/tuần"), tỷ lệ hoàn thành buổi chất lượng/dài trong 4 tuần gần đây nếu đang có block active.
- **Danh sách giải** kèm nút **Tạo giải mới** — nhập tên/ngày thi/cự ly, chọn áp khuôn 12 tuần hoặc không, bấm là có ngay trang giải riêng.
- **200 câu truyền động lực** tiếng Anh, đổi câu khi bấm nút hoặc tự đổi mỗi khi có gì đáng ăn mừng.

### Trang 1 giải

- **Lịch 12 tuần** chia 5 giai đoạn: Nền tảng → Xây sức bền → Đặc thù cự ly → Giảm tải → Tuần thi đấu. Chuyển được giữa chế độ 4 buổi hoặc 3 buổi mỗi tuần.
- **Lịch tháng** với chấm màu theo loại buổi. Bấm vào một ngày để xem buổi tập, số liệu Strava, ghi chú và ảnh của ngày đó, đánh dấu đã chạy ngay tại chỗ.
- **Đổi ngày chạy** mặc định cho cả giáo án, hoặc riêng từng tuần.
- **Ghi chú từng buổi** cho cảm nhận, đau mỏi, thời tiết.
- **Biểu đồ km theo tuần**: cột nhạt là dự kiến, phần tô đậm là đã chạy.
- **Tham khảo**: pace zones, mục tiêu A/B/C và chiến thuật ngày thi riêng của giải đó, cộng nguyên tắc tập chung.

### Nhập nhanh (`log.html`)

Form nhập một buổi chạy: ngày, loại (chạy / đi bộ / khác), km, pace, thời gian, chú thích, và ảnh nếu muốn. Chỉ cần nhập **hai trong ba** số km / pace / thời gian, số còn lại tự tính. Nếu ngày đó có buổi trong Lịch tập chưa đánh dấu, ô "Đánh dấu xong buổi…" được tick sẵn nên lưu một lần là xong cả hai. Bên dưới là danh sách các buổi đã nhập gần đây, mỗi buổi có **Sửa** và **Xóa** (bấm hai lần để xác nhận).

Buổi nhập tay không cần ảnh. Có ảnh mà không có số liệu thì được lưu như "ảnh chạy" (kỷ niệm).

### Đọc ảnh Strava bằng Gemini (`js/vision.js`)

Chọn, kéo thả hoặc dán (Ctrl+V) một ảnh chụp màn hình Strava, app gửi ảnh cho Gemini đọc khoảng cách, pace, thời gian rồi điền sẵn vào form. Cần dán API key ở **Cài đặt → Đọc ảnh Strava tự động** (lấy miễn phí ở Google AI Studio). Model mặc định `gemini-3.5-flash-lite`, đổi được trong Cài đặt.

Những điểm làm nó nhanh:

- Gọi thẳng từ trình duyệt tới Google, không qua serverless function nên bớt một chặng mạng.
- Ảnh được giải mã một lần, rồi thu nhỏ còn 960px (JPEG 0,72) để gửi đi, song song với việc tạo bản 1400px để lưu.
- Ép trả JSON theo schema 3 trường, `temperature: 0`, nên chỉ sinh vài chục token.
- Gửi ngay khi chọn ảnh; trong lúc chờ, ảnh xem trước hiện liền và ô số liệu nhấp nháy.
- `preconnect` tới Google khi mở trang để bắt tay TLS xong từ trước.

**Phân biệt chạy và đi bộ**: Gemini còn trả về loại hoạt động (`run` / `walk` / `other`). Đi bộ có trường "bước chân" và biểu tượng giày nằm bẹt, không có pace; chạy bộ có pace và biểu tượng giày nhấc gót. Loại được điền sẵn vào ô "Loại" (sửa lại được). Đi bộ không tính vào streak, PR, dự đoán và không tự đánh dấu buổi trong giáo án.

Gemini chỉ lấy km, pace, thời gian, ngày và loại hoạt động; các trường khác trong ảnh như độ cao leo (Elev Gain) bị bỏ qua. Nhấn giữ icon app trên Android có lối tắt "Nhập nhanh" và "Lịch tập".

**Nhập hàng loạt**: chọn nhiều ảnh cùng lúc (hoặc kéo thả, dán nhiều ảnh) thì app mở bảng hàng loạt. Mỗi ảnh là một dòng, Gemini đọc song song 3 ảnh một lúc, đọc luôn cả **ngày** nếu ảnh có ghi (không có thì lấy theo thời điểm chụp ảnh). Số nào thiếu thì tự tính từ hai số còn lại. Dòng có vẻ trùng một buổi đã lưu (cùng ngày, cùng km) bị bỏ tick sẵn. Soát lại rồi **Lưu tất cả**; tùy chọn tự đánh dấu buổi tương ứng trong Lịch tập theo ngày.

API key nằm trong `localStorage` của trình duyệt, gửi thẳng cho Google, và **không** có trong file sao lưu. Nên giới hạn key theo tên miền của app trong Google AI Studio.

### Dự đoán thành tích & báo cáo AI (trang Thống kê)

**Dự đoán** (`js/predict.js`, tính tại máy, không cần mạng): từ các buổi chạy có km (từ 2,5 km) và thời gian, ước tính thời gian + pace trung bình cho **5K / 10K / Half / Full** bằng công thức Riegel (`T = t × (D/d)^e`, e = 1,06 / 1,06 / 1,07 / 1,08). Mỗi cự ly lấy nỗ lực cho kết quả tốt nhất trong 120 ngày qua, chỉ nhận buổi dài ít nhất 1/4 cự ly cần dự đoán. Half/Full cộng thêm tối đa 15% nếu buổi chạy dài nhất 60 ngày qua còn ngắn so với cự ly. Mỗi dự đoán có khoảng sai số và độ tin cậy (thấp / vừa / cao) tùy số buổi gần đây và độ dài nguồn.

**Pace gợi ý** suy ra từ dự đoán 10K và 5K: chạy nhẹ/dài, tempo, interval, pace Full. Chúng cập nhật theo mỗi buổi chạy mới và hiện thẳng trong Lịch tập, ngay dưới các buổi chưa chạy ("Pace gợi ý theo kết quả của bạn").

**Báo cáo AI**: nút **Phân tích bằng AI** gửi số liệu (km 8 tuần, 15 buổi gần nhất, PR, dự đoán và pace gợi ý đã tính sẵn, giải sắp tới, giáo án, mục tiêu — không gồm ảnh) cho Gemini, nhận lại báo cáo tiếng Việt 5 mục: tổng quan, điểm mạnh, cần lưu ý, dự đoán & chiến lược, gợi ý tuần tới. AI chỉ diễn giải, các con số dự đoán luôn do app tính nên không bị "bịa". Báo cáo được lưu lại trong trình duyệt, cần bấm "Phân tích lại" khi có dữ liệu mới.

### Sửa / xóa trong Lịch tập (`plan.html`)

- **Sửa buổi tập**: đổi loại (nhẹ / chất lượng / dài), tên, km và mô tả của từng buổi. Buổi đã sửa có nhãn "đã sửa" và nút **Về bản gốc**. Buổi thi đấu chỉ đổi được tên, km, mô tả.
- **Xóa buổi tập**: bấm hai lần để xác nhận. Buổi bị xóa biến khỏi lịch và mọi thống kê, nằm trong mục **Buổi đã xóa** để **Khôi phục** bất cứ lúc nào. Buổi thi đấu không xóa được.
- Các thay đổi này nằm trong `block.edits` / `block.removed`, khuôn gốc không bị đụng tới.
- Nhật ký chạy của ngày đang chọn cũng có **Sửa** (mở form Nhập nhanh) và **Xóa**.

### Tự điều chỉnh giáo án (`js/adapt.js`, panel đầu trang Lịch tập)

Quy tắc minh bạch, không dùng AI. Chỉ đụng tới buổi **chưa chạy**, không đụng buổi thi đấu, tuần thi đấu cuối và buổi bạn tự sửa. Mỗi gợi ý có lý do, danh sách buổi sẽ đổi và nút **Áp dụng**; bật ô **Tự động áp dụng** thì app tự áp mỗi khi mở (mặc định tắt).

- **Khối lượng, 7 ngày tới**: nghỉ từ 10 ngày thì về khoảng 55% kế hoạch; tuần qua chạy dưới 60% kế hoạch thì về khoảng 110% số đã chạy (không dưới 75% kế hoạch); tuần qua nhiều hơn 30% / 50% so với trung bình 4 tuần trước thì giảm 8% / 15%. Giảm nặng (còn 80% trở xuống) còn đổi buổi chất lượng thành chạy nhẹ. Hết điều kiện thì gợi ý **khôi phục** buổi gốc. Luôn tính trên km gốc nên chạy lại nhiều lần không giảm chồng.
- **Pace, 21 ngày tới**: so pace ghi sẵn trong buổi ("Pace 7:40–8:30", "5 × 3 phút @ 6:40") với vùng pace suy từ dự đoán 10K. Chỉ sửa khi lệch quá 5% (chạy nhẹ) hoặc 3–4% (chất lượng), mỗi lần tối đa 15%, và chỉ khi độ tin cậy dự đoán không phải "thấp".
- Buổi được chỉnh có nhãn "tự điều chỉnh", lý do hiện dưới buổi, và nút **Hoàn tác** về bản gốc. Thay đổi nằm trong `block.edits` + `block.adj`.

### Giày chạy (`js/shoes.js`, panel trong Thống kê)

Mỗi đôi có tên, km đã chạy trước khi dùng app, ngưỡng nên thay (mặc định 700 km) và ngày bắt đầu dùng. Ở Nhập nhanh, mỗi buổi chạy / đi bộ chọn được giày (mặc định là đôi được đặt mặc định; nhập hàng loạt chọn một đôi cho cả lô). Km của đôi giày được tính lại từ nhật ký mỗi lần nên sửa hoặc xóa buổi luôn cho số đúng. Từ 80% ngưỡng hiện "Sắp thay", vượt 100% hiện "Nên thay", và khi một buổi vừa lưu làm đôi giày chạm mốc thì app báo ngay. Có ước tính số tuần còn dùng được theo nhịp 4 tuần gần nhất, nút **Gán các buổi chưa có giày** cho dữ liệu cũ, và **Cho nghỉ** để giữ lịch sử mà ẩn khỏi danh sách chọn.

### Động lực

**Pháo hoa ăn mừng** khi đánh dấu xong một buổi, to dần theo mức độ: buổi nhẹ → chất lượng/dài → trọn một tuần → mốc 25/50/75% giáo án → ngày thi đấu. Tự tắt khi hệ điều hành bật chế độ giảm chuyển động.

### Nhắc chạy

Cài đặt ở **trang chủ**, áp dụng chung cho mọi giải đang có giáo án active — không cần bật riêng từng giải. Thông báo đẩy lúc **6:30 sáng mỗi ngày**, nội dung tuỳ ngày:

| Hôm nay | Thông báo |
| --- | --- |
| Có buổi chạy (ở bất kỳ block active nào), chưa đánh dấu xong | "Hôm nay có buổi chạy" kèm tên buổi |
| Có buổi chạy, đã đánh dấu xong | im lặng |
| Không có buổi nào, nhưng vẫn trong khoảng ngày của ít nhất 1 block active | "Hôm nay không có buổi chạy" kèm một gợi ý ngẫu nhiên từ `rest-tips.json` — chống đẩy, squat, plank, tập chân |
| Không có block nào đang active | im lặng |

---

## Dữ liệu được lưu ở đâu

Mặc định mọi thứ nằm trong trình duyệt của bạn:

- `localStorage` — template, block, race, goal, tab đang mở, cài đặt nhắc chạy
- `IndexedDB` (`bn-runs`) — nhật ký chạy và ảnh. App xin quyền `persist` để trình duyệt không tự dọn khi máy thiếu chỗ, và hiện dung lượng đang dùng trong tab ảnh
- `Cache Storage` — bản sao "hôm nay có gì" cho service worker đọc khi chạy nền, vì service worker không đọc được `localStorage`

**Khi bật nhắc chạy bằng push**, một phần dữ liệu được gửi lên máy chủ và lưu trong Upstash Redis: danh sách ngày tập (gộp từ mọi block active) kèm tên buổi và cờ đã-chạy, múi giờ, giờ nhắc, và địa chỉ đăng ký nhận thông báo của trình duyệt. **Ảnh không bao giờ rời khỏi máy bạn.** Tắt nhắc nhở thì bản ghi đó bị xoá khỏi máy chủ.

Sao lưu / khôi phục bằng file JSON ở trang Cài đặt (gồm cả buổi nhập tay không có ảnh và danh sách giày). API key Gemini cố ý không nằm trong file sao lưu. Muốn chuyển dữ liệu sang máy khác thì xuất file ở máy cũ rồi khôi phục ở máy mới.

### Chuyển đổi dữ liệu cũ (migrate)

Bản trước của app lưu mọi thứ dưới các khoá `bn27-*` (một giáo án Bắc Ninh duy nhất). Lần mở trang chủ đầu tiên sau khi cập nhật, `js/migrate.js` tự đọc các khoá đó và dựng thành template + block + race + nhật ký theo mô hình mới — **không xoá dữ liệu cũ**, chỉ đọc, giữ nguyên làm dự phòng. Chạy một lần duy nhất, đánh dấu bằng `localStorage['app-migrated-v2']`.

---

## Cấu trúc file

```
index.html        trang chủ: dashboard cá nhân
race.html         trang 1 giải, đọc ?id=<raceId>
style.css         toàn bộ giao diện, sáng/tối theo hệ điều hành
quotes.js         200 câu truyền động lực
rest-tips.json    gợi ý bài tập cho ngày không có buổi chạy
sw.js             service worker: cache offline, nhận push, nhắc chạy nền
manifest.json     khai báo PWA
icons/            icon app (192, 512, apple-touch, favicon)

js/
  core.js           tiện ích dùng chung: ngày giờ, store an toàn, pháo hoa canvas, toast
  templates.js      khuôn giáo án tái sử dụng được (hiện có "periodized-12w" = khuôn Bắc Ninh)
  blocks.js         1 lần áp khuôn vào 1 giải: sinh buổi tập, tick/ghi chú, lịch tuỳ chỉnh
  races.js          CRUD giải đấu, liên kết block
  runlog.js         nhật ký chạy (ảnh không bắt buộc) trong IndexedDB, tính PR và streak
  vision.js         đọc ảnh Strava bằng Gemini (km, pace, thời gian, ngày) và viết báo cáo AI
  predict.js        dự đoán thời gian 5/10/21/42K và vùng pace từ nhật ký
  adapt.js          gợi ý và tự điều chỉnh khối lượng, pace của giáo án
  shoes.js          quản lý giày chạy, tính km và mức mòn
  log-page.js       trang Nhập nhanh (log.html)
  plan-page.js      trang Lịch tập (plan.html), gồm sửa/xóa buổi
  goals.js          mục tiêu cá nhân + tính tiến độ
  migrate.js        chuyển dữ liệu bn27-* cũ sang mô hình mới, chạy một lần
  notify.js         nhắc chạy cục bộ + Web Push, gộp từ mọi block active
  dashboard.js      điều khiển index.html
  race-page.js      điều khiển race.html

api/               serverless function trên Vercel
  vapid.js           trả khoá công khai VAPID cho trình duyệt
  subscribe.js       lưu hoặc xoá subscription kèm danh sách buổi tập hôm nay
  cron.js            chạy hằng ngày, đẩy thông báo nhắc chạy
  test-push.js       bắn thử một thông báo ngay lập tức
  health.js          báo xem máy chủ đã cấu hình đủ chưa
lib/store.js       kho subscription trên Upstash Redis
vercel.json        header cache và lịch cron
package.json       dependency cho phần api/ (web-push, @upstash/redis)
```

Phía trình duyệt không dùng dependency nào, `package.json` chỉ phục vụ các serverless function. Các file `js/*.js` là script thuần nạp bằng `<script src>` theo thứ tự phụ thuộc (core → templates → blocks → races → runlog → goals → migrate/notify → dashboard/race-page), không có bundler.

---

## Chạy ở máy

```bash
npx serve
# hoặc
python -m http.server
```

Mở `http://localhost:<port>/index.html` (trang chủ) hoặc `http://localhost:<port>/race.html?id=bac-ninh-legacy-2027` (sau khi đã mở trang chủ ít nhất một lần để migrate chạy).

Phần `api/` chỉ chạy trên Vercel. Ở máy, app tự nhận ra không có máy chủ và lùi về nhắc cục bộ, mọi tính năng khác hoạt động bình thường.

---

## Deploy

Project nối thẳng với Vercel qua Git integration: push lên `main` là Vercel tự build và deploy, không cần GitHub Actions.

### Bật thông báo đẩy

Phần nhắc chạy có hai tầng. Tầng cục bộ chạy sẵn không cần cấu hình. Tầng Web Push cần làm một lần:

**1. Tạo kho Redis.** Vercel → project → tab **Storage** → **Create Database** → **Upstash** → **Redis** → gói Free, region Singapore → Connect vào project, tick cả ba môi trường. Để trống ô prefix nếu được hỏi.

Vercel sẽ tự thêm một cặp biến REST. Code nhận được cả `KV_REST_API_URL`/`KV_REST_API_TOKEN` lẫn `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, và chịu được cả tiền tố kiểu `STORAGE_`. Token `READ_ONLY` bị bỏ qua vì không ghi được.

**2. Thêm biến môi trường** vào Project Settings → Environment Variables:

| Biến | Lấy ở đâu |
| --- | --- |
| `VAPID_PUBLIC_KEY` | `.env.local` (đã gitignore) |
| `VAPID_PRIVATE_KEY` | `.env.local` |
| `VAPID_SUBJECT` | `.env.local`, dạng `mailto:ban@email.com` |
| `CRON_SECRET` | `.env.local`, bảo vệ `/api/cron` khỏi bị gọi tuỳ tiện |

Muốn sinh cặp khoá VAPID mới: `npx web-push generate-vapid-keys`.

**3. Deploy lại.** Vercel chỉ nạp biến môi trường khi tạo deployment mới, thêm biến xong mà không deploy lại thì hàm vẫn chạy bản cũ. Deployments → bản trên cùng → ⋯ → **Redeploy**.

**4. Bật trong app.** Trang chủ → **Kiểm tra máy chủ**, phải thấy "Máy chủ sẵn sàng". Rồi **Bật nhắc nhở** → **Gửi thử**.

### Giờ nhắc

Cron đặt `30 23 * * *` giờ UTC, tức 6:30 sáng giờ Việt Nam. Máy chủ lưu múi giờ của từng máy đăng ký nên tính ngày theo đúng nơi bạn đang ở.

Gói Hobby của Vercel **chỉ cho cron chạy một lần mỗi ngày**, nên giờ chạy cron chính là giờ nhận thông báo đẩy. Ô "Giờ nhắc khi app mở" chỉ điều khiển lời nhắc cục bộ lúc app đang mở. Muốn đổi giờ push thì sửa `schedule` trong `vercel.json` (Việt Nam = UTC+7).

### Bắn thử từ dòng lệnh

```bash
# gửi tới mọi máy đã đăng ký
curl -X POST https://<project>.vercel.app/api/test-push \
  -H "Authorization: Bearer <CRON_SECRET>"

# chạy đúng luồng cron, tức nội dung sẽ nhận lúc 6:30 sáng
curl https://<project>.vercel.app/api/cron \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Kết quả dạng `{"ok":true,"total":1,"sent":1,...}`. Nếu `sent` bằng 0 thì xem `skipped` và `errors`.

---

## Gặp trục trặc

**Sửa gì trên Vercel cũng không thấy tác dụng.** Phải Redeploy. Biến môi trường chỉ được nạp lúc tạo deployment.

**App vẫn hiện bản cũ sau khi deploy.** Service worker cũ đang giữ cache. App tự nhận bản mới và tải lại, nhưng nếu đang kẹt ở một bản cũ thì cần làm tay một lần: máy tính bấm F12 → Application → Service Workers → Unregister rồi Ctrl+Shift+R; điện thoại xoá icon khỏi màn hình chính rồi thêm lại.

**"Kiểm tra máy chủ" báo thiếu kho Upstash.** Chưa nối kho, hoặc nối rồi nhưng chưa Redeploy. Dòng báo lỗi có liệt kê tên các biến đang có trên server để đối chiếu.

**Gửi thử báo lỗi 403.** Khoá VAPID đã đổi sau khi máy này đăng ký. Tắt rồi bật lại nhắc nhở để đăng ký lại.

**iPhone không nhận thông báo.** Safari chỉ cho phép thông báo khi trang đã được thêm vào màn hình chính và mở từ icon đó (iOS 16.4 trở lên).

**Ảnh biến mất.** Trình duyệt dọn IndexedDB khi máy thiếu chỗ. App có xin quyền lưu bền nhưng không phải trình duyệt nào cũng cho; xem dòng dung lượng trong tab ảnh để biết tình trạng.

**Vào trang chủ không thấy giải Bắc Ninh / số liệu cũ biến mất.** Mở `index.html` ít nhất một lần để `migrate.js` chạy — nó đọc dữ liệu `bn27-*` cũ trong cùng trình duyệt đó và dựng lại. Nếu trước giờ chỉ mở thẳng `race.html`, hãy mở `index.html` trước.

---

## Ghi chú kỹ thuật

- **Service worker** lấy HTML/CSS/JS từ mạng trước rồi mới dùng cache, để bản vừa deploy có hiệu lực ngay. Icon thì cache dài hạn. Mọi đường dẫn `/api/` đi thẳng ra mạng, không bao giờ qua cache — cache nhầm từng khiến `/api/health` báo lỗi cũ sau khi máy chủ đã sửa xong.
- **Nhắc cục bộ** khi chưa có máy chủ: Android đã cài ra màn hình chính dùng Periodic Background Sync (tối thiểu 12 tiếng một lần, hệ điều hành quyết định lúc đánh thức nên giờ có thể lệch); iOS không hỗ trợ nên chỉ nhắc khi app đang mở; app đang mở thì hẹn giờ chính xác bằng `setTimeout`.
- **Nút "Đọc bằng Claude"** trong tab ảnh dùng `window.claude.use('sample')` để đọc số liệu từ ảnh chụp màn hình. API này chỉ tồn tại khi trang chạy trong Claude Artifacts; ở nơi khác nút tự ẩn và bạn nhập tay.
- **`api/cron.js`** không chặn theo giờ người dùng chọn. Với cron một lần mỗi ngày, chặn như vậy sẽ làm thông báo không bao giờ được gửi nếu giờ chọn muộn hơn giờ cron.
- **PR theo cự ly** tính từ mọi run có `kind === 'run'`, số km trong khoảng ±5% một cự ly chuẩn (5/10/21.1/42.2) và có ghi thời gian — không phân biệt run đó có thuộc giải/buổi tập nào hay không.
- **Streak** đếm số ngày liên tục có ít nhất 1 run tính đến hôm nay; nếu hôm nay chưa chạy thì tính đến hôm qua (chưa coi là "đứt" cho tới khi bỏ lỡ một ngày trọn vẹn).
