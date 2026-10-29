# TheLOVE — Connect & Play

PWA giao diện đen + tím neon. Frontend dùng HTML/CSS/JavaScript, Supabase Auth, Database, Realtime và Storage.

## 1. Cấu hình Supabase

Mở `app.js`, thay hai dòng đầu:

```js
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";
```

Chỉ dùng Project URL và Publishable key (hoặc anon key cũ). Không bao giờ đưa `service_role`/secret key vào frontend.

## 2. Supabase cần cấu hình

1. Đã chạy SQL tạo `profiles`, `follows`, `messages` và RLS trong SQL Editor.
2. Authentication → Sign In / Providers → Google: bật provider, điền Google OAuth Client ID và Client Secret.
3. Authentication → URL Configuration: đặt Site URL và thêm Redirect URL cho môi trường thử nghiệm và GitHub Pages.
4. Storage: tạo bucket tên `avatars`, đặt public nếu muốn hiển thị ảnh đại diện bằng URL công khai. Thiết lập policy upload chỉ cho người dùng ghi vào thư mục có tên bằng UID của họ.
5. Database → Replication / Publications: bật Realtime cho bảng `messages` để nhận tin nhắn mới trực tiếp.

## 3. Chạy local

Không mở `index.html` bằng `file://`. Hãy chạy bằng localhost qua VS Code Live Server hoặc máy chủ phát triển tương đương, ví dụ `http://localhost:5500`.

Trong Supabase Authentication → URL Configuration, thêm URL local tương ứng vào Redirect URLs. Google OAuth Client phải có callback Supabase trong Authorized redirect URIs.

## 4. Triển khai GitHub Pages

Đẩy toàn bộ nội dung thư mục lên repository GitHub. Vào Settings → Pages và chọn nguồn triển khai phù hợp. Sau khi có URL thật, thêm URL đó vào Supabase Auth Redirect URLs và Google OAuth Authorized JavaScript origins. Callback URI Google vẫn là callback do Supabase cung cấp.

## 5. Những điểm cần hoàn tất trước khi phát hành

- Bảo đảm RLS và các policy đúng, kiểm tra trên hai tài khoản khác nhau.
- Tạo bucket `avatars` và Storage policies.
- Bật Realtime cho `messages`.
- Xóa tài khoản thật cần Edge Function phía server dùng quyền quản trị và xác thực người gọi. Chức năng xóa hiện chủ động chưa thực thi.
- Thêm OTP email nếu muốn xác minh bổ sung; Google OAuth và OTP là hai luồng khác nhau.
- Thêm kiểm soát spam, báo cáo/chặn người dùng, điều khoản và chính sách quyền riêng tư.
- Game và bảng xếp hạng chưa được tích hợp ở gói khởi đầu này.
