# Antigravity Desktop UI (`agyu`)

Ứng dụng Desktop độc lập dành cho Antigravity Agent, cho phép gọi trực tiếp qua terminal như `agyu`, hiển thị giao diện Desktop native hỗ trợ kéo thả tệp, dán ảnh chụp màn hình từ clipboard, cơ chế bảo vệ an toàn mã nguồn (Guardrail Hook) và quản lý lịch sử hội thoại.

---

## 1. Tính năng nổi bật

- **Không cần Local Web Server:** Chạy dưới dạng tiến trình Desktop thuần túy (`GTK3` + `WebKit2`), không mở cổng mạng (port), không phụ thuộc vào trình duyệt ngoài.
- **Gọi trực tiếp qua Terminal:** Gọi lệnh `agyu` tại bất kỳ thư mục dự án nào để mở phiên làm việc gắn đúng vào thư mục đó.
- **Nút `⚡ ACTION` & Chế độ `Free to go`:**
  - Nằm cạnh nút Gửi, kích hoạt bằng click chuột trực tiếp.
  - Phân định rõ ràng giữa **chế độ thảo luận** (Agent chỉ đọc/phân tích) và **chế độ hành động** (Agent thực thi sửa đổi).
  - Chuột phải vào nút ACTION để kích hoạt chế độ **Free to go** (Agent tự động lặp chu kỳ triển khai cho đến khi hoàn thành mục tiêu).
- **Cơ chế bảo vệ mã nguồn (Guardrail Hook):**
  - Tự động chặn các thao tác sửa đổi file (`write_file`, `edit_file`) nếu tệp đó không nằm trong kế hoạch đã được phê duyệt.
  - Tự động sao lưu snapshot trước khi ghi đè file, hỗ trợ Rollback ngay trên giao diện.
- **Đồng bộ tự động Quy tắc làm việc (`GEMINI.md`):**
  - Đi kèm file quy tắc chuẩn `GEMINI.md`. Khi chạy lần đầu, ứng dụng tự động kiểm tra và đồng bộ vào `~/.gemini/GEMINI.md` trên hệ thống nếu chưa có.
- **Kéo thả tệp & Dán ảnh clipboard (`Ctrl + V`):**
  - Kéo file văn bản hoặc ảnh từ File Manager thả thẳng vào cửa sổ chat.
  - Chụp ảnh màn hình và dán trực tiếp (`Ctrl + V`), tự động lưu vào thư mục đính kèm của workspace.
- **Tích hợp Deep Think:** Lập kế hoạch phân rã dạng cây trước khi thực thi các tác vụ phức tạp.

---

## 2. Yêu cầu hệ thống

- Hệ điều hành: Linux (Ubuntu, Debian, Fedora, Arch...)
- Python 3.8+
- Các gói thư viện đồ họa hệ thống:
  ```bash
  # Ubuntu / Debian
  sudo apt-get install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1 gir1.2-notify-0.7

  # Fedora
  sudo dnf install python3-gobject gtk3 webkit2gtk4.1 libnotify

  # Arch Linux
  sudo pacman -S python-gobject gtk3 webkit2gtk-4.1 libnotify
  ```
- Antigravity CLI (`agy`) đã được cài đặt và có trong PATH hoặc chỉ định qua biến môi trường `AGY_BIN`.

---

## 3. Cài đặt nhanh

1. Clone dự án về máy:
   ```bash
   git clone https://github.com/<your-username>/agyu.git
   cd agyu
   ```

2. Chạy script cài đặt tự động:
   ```bash
   ./install.sh
   ```
   *Script sẽ tự động cấp quyền thực thi, liên kết lệnh `agyu` vào `~/.local/bin/agyu` và thiết lập `~/.gemini/GEMINI.md`.*

---

## 4. Cách sử dụng

Tại bất kỳ thư mục dự án nào trong terminal:

```bash
# Mở phiên làm việc tại thư mục hiện tại
agyu

# Mở phiên làm việc tại thư mục chỉ định
agyu /duong/dan/thu_muc

# Tiếp tục phiên làm việc gần nhất tại thư mục
agyu -c
```

---

## 5. Cơ chế hoạt động của `GEMINI.md` & Guardrail

1. **Quy định Thảo luận vs ACTION (`GEMINI.md`):**
   - Khi chat thông thường (nhấn Enter hoặc nút Gửi), Antigravity sẽ chỉ phân tích, đọc code và lập kế hoạch sửa đổi (không tự ý ghi đè file).
   - Khi bấm **`⚡ ACTION`**, Antigravity mới thực hiện chỉnh sửa chính xác các file đã thống nhất trong kế hoạch.
2. **Cơ chế Hook bảo vệ (`guardrail_hook.py`):**
   - Ứng dụng tự động đăng ký hook vào `~/.gemini/config/hooks.json`.
   - Bất kỳ thao tác `write_file` hoặc `edit_file` nào tác động lên tệp ngoài danh sách kế hoạch đã duyệt sẽ bị tạm dừng tiến trình và hiển thị hộp thoại cảnh báo trên giao diện.

---

## 6. Cấu trúc dự án

```
agyu/
├── bin/
│   ├── agyu           # Script launcher agyu từ terminal
│   └── agy-account    # Script quản lý/chuyển đổi tài khoản
├── app/
│   ├── main.py        # Ứng dụng Desktop GTK3/WebKit2 & quản lý tiến trình agy
│   ├── guardrail_hook.py # Hook kiểm soát an toàn thao tác file
│   ├── deep_think.py  # Quản lý luồng lập kế hoạch Deep Think
│   └── ui/
│       ├── index.html # Giao diện ứng dụng
│       ├── style.css  # Giao diện Dark Theme
│       ├── app.js     # Logic điều khiển, kéo thả, clipboard & stream
│       ├── vendor/    # Thư viện ngoài (highlight.js, marked, mermaid...)
│       └── assets/    # Icon & hình ảnh giao diện
├── GEMINI.md          # File quy tắc chuẩn mực cho Antigravity Agent
├── install.sh         # Script cài đặt 1 chạm cho người dùng
├── .gitignore         # Quy tắc loại trừ tệp tạm
└── README.md          # Hướng dẫn chi tiết
```

---

## 7. Giấy phép

Phát hành theo giấy phép [MIT License](LICENSE).
