# Truyện Lạ

Kho truyện cá nhân của Chú Lạ, gồm bản đọc trên điện thoại và app máy tính độc lập.

## Điện thoại

Bản web ở thư mục `web/`, chạy hoàn toàn trong trình duyệt. Mở trang lần đầu khi có mạng, chờ **Sẵn sàng đọc offline**, rồi chọn **Nhập truyện** để nhập TXT UTF-8, EPUB hoặc bản sao lưu JSON của Truyện Lạ.

- Đọc offline, tìm chương, nhớ chương và vị trí đọc.
- Chọn 45 font tiếng Việt từ kho Duy TTD, tăng/giảm cỡ chữ, nền tối.
- Dữ liệu lưu trong IndexedDB của thiết bị, không gửi lên máy chủ và không tự đồng bộ giữa các máy.
- Có thể thêm vào màn hình chính: Android dùng Cài app; iPhone dùng Safari → Chia sẻ → Thêm vào Màn hình chính.
- Sao lưu kho ra JSON để chuyển sang thiết bị khác. Giữ file gốc/bản sao lưu vì việc xóa dữ liệu trình duyệt có thể xóa kho.

EPUB cần trình duyệt hiện đại hỗ trợ `DecompressionStream('deflate-raw')`; nếu máy chưa hỗ trợ, nhập TXT UTF-8. Không hỗ trợ EPUB mã hóa/DRM. TXT/EPUB tối đa 50 MB, JSON tối đa 150 MB.

Repo không chứa văn bản tiểu thuyết, dữ liệu người dùng, API key, cookie, hồ sơ đăng nhập hay bản Electron đóng gói. Trang web không có chức năng dịch AI hoặc tạo bìa của bản desktop.

## GitHub Pages

Mã web dùng đường dẫn tương đối và không cần build/dependency. Trong Settings → Pages, chọn **Deploy from a branch**, nhánh **gh-pages**, thư mục **/(root)**. Nhánh `main` giữ mã app; nhánh `gh-pages` chỉ giữ nội dung `web/`.

## Máy tính

`MO-APP.cmd` mở app Electron. Cần runtime Electron và các module dùng chung của Duy TTD Studio. Tạo `config.local.json` từ `config.example.json`, điền vị trí Studio và kho riêng trên máy. `server.mjs` chỉ lắng nghe loopback, không dùng làm máy chủ Internet.

Font desktop đọc trực tiếp đường dẫn `fonts` từ `desktop/duong-dan.cjs` của Studio; bản web đi kèm các font có giấy phép OFL trong `web/licenses/`. Giấy phép font chỉ áp dụng với font tương ứng.

## Kiểm tra

Với Node.js 20.20+:

```sh
node --test test.mjs web.test.mjs
```

Kiểm tra không gọi Google hay ChatGPT. Có kiểm nhập văn bản/EPUB, lưu/checkpoint, HTTP/CSRF, đổi font, nhập bản sao lưu và EPUB dùng bộ giải nén của trình duyệt.

## Quyền riêng tư

Bản web chỉ tải mã, biểu tượng và font từ cùng địa chỉ GitHub Pages. File truyện nhập vào được xử lý trên thiết bị. API key và luồng ChatGPT Plus chỉ thuộc bản desktop trên máy đã cấu hình; không đưa các cấu hình đó lên GitHub.
