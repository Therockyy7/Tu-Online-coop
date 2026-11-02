# Tu Online

Game web co-op cho hội bạn: **lên chùa tích Công Đức, xuống núi xả nghiệp**. 3D low-poly góc nhìn thứ nhất, chơi trên trình duyệt máy tính, 2–20 người một phòng.

- **Chùa:** cấp bậc từ Tiểu Đồng Quét Lá tới Phương Trượng. Quét lá, chẻ củi, xách nước, thiền, phóng sinh, nấu cơm chay, gõ mõ tụng kinh đồng điệu, thỉnh Đại Hồng Chung, Đại lễ cúng dường. Có Hiên Tăng Đoàn treo ảnh chân dung.
- **Quán Bar Hạ Sơn:** đổi Đức lấy Xu, bao cả quán, vé VIP, thi nhảy kiểu Audition, DJ chiếm sóng (nhạc có sẵn hoặc dán link YouTube chiếu lên màn hình LED sân khấu cho cả quán cùng xem, có hàng chờ), thi pha chế, Bầu Cua Cá Cọp, vòng quay sự thật.

Thiết kế chi tiết: [`docs/superpowers/specs/2026-10-30-tu-online-design.md`](docs/superpowers/specs/2026-10-30-tu-online-design.md).

## Yêu cầu

- Node.js 22.12 trở lên (`node -v`).
- (Tùy chọn) [ngrok](https://ngrok.com) đã đăng nhập, để chia sẻ link chơi ngay từ máy mình.

## Chạy thử trên máy

```bash
npm install
```

```bash
npm run dev
```

Mở <http://localhost:5173>. Server game chạy ở cổng 3000, Vite tự chuyển tiếp `/socket.io`. Mở thêm tab ẩn danh để thử 2 người chơi.

Bản giống production:

```bash
npm run build
```

```bash
npm start
```

Mở <http://localhost:3000>.

## Chơi cùng bạn bè ngay (ngrok)

```bash
npm run share
```

Lệnh này lần lượt:

1. Build nếu chưa có bản build.
2. Chạy server cổng 3000.
3. Mở tunnel ngrok.
4. In ra link `https://…ngrok-free.app`.

Gửi bạn bè link kèm mã phòng, ví dụ `https://…ngrok-free.app/?r=ABCD`. Lần đầu mở link, ngrok hiện trang cảnh báo — bấm **Visit Site**. Máy bạn phải bật trong lúc chơi; tiến trình lưu ở thư mục `data/`.

Có domain tĩnh của ngrok thì chạy kèm biến môi trường:

```bash
NGROK_DOMAIN=ten-ban.ngrok-free.app npm run share
```

## Deploy lên Render (link cố định, miễn phí)

**1. Đưa code lên GitHub**

Tạo repo trống trên GitHub, rồi trong thư mục dự án:

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Tu Online"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/<ten-ban>/tu-online.git
```

```bash
git push -u origin main
```

**2. Tạo database MongoDB Atlas (miễn phí)** để giữ Công Đức khi server khởi động lại:

1. Đăng ký <https://www.mongodb.com/cloud/atlas>, tạo cluster **M0 Free**, region Singapore.
2. *Database Access*: tạo user + mật khẩu.
3. *Network Access*: thêm `0.0.0.0/0`, vì Render free không có IP cố định.
4. *Connect → Drivers*: copy connection string dạng `mongodb+srv://user:pass@cluster…/tu-online`.

**3. Deploy trên Render:**

1. Đăng ký <https://render.com> bằng GitHub → **New → Blueprint** → chọn repo vừa push. Render đọc `render.yaml`: web service Node, gói free, region Singapore.
2. Khi được hỏi `MONGODB_URI`, dán connection string ở bước 2.
3. Bấm **Apply**, chờ build xong là có link `https://tu-online.onrender.com` (tên có thể khác).

**Lưu ý gói free:** server ngủ sau 15 phút không ai vào; lần mở lại chờ khoảng 1 phút. Không cấu hình `MONGODB_URI` thì tiến trình bị mất mỗi lần Render khởi động lại.

## Điều khiển

| Phím | Chức năng |
|---|---|
| Chuột | Xoay góc nhìn (bấm vào màn hình để khóa chuột, Esc để thả) |
| W A S D | Đi tới / lùi / bước ngang |
| E | Tương tác (nhìn vào đồ vật và lại gần) |
| Q | Bỏ đồ đang cầm |
| Space | Hành động trong mini-game |
| V | Xem góc thứ ba sau lưng |
| 1–8 | Emote |
| Enter | Chat |
| Tab | Bảng người chơi |
| H | Menu Phương Trượng |
| B | Ban phước (Tri Khách Tăng trở lên) |
| F1 | Trợ giúp |

## Phát triển

| Lệnh | Việc |
|---|---|
| `npm test` | Unit + test tích hợp (shared, server) |
| `npm run typecheck` | Kiểm kiểu shared, server, client |
| `npm run bots -- --room ABCD --count 8` | Thả 8 người chơi ảo vào phòng ABCD (server đang chạy): đi lang thang, chat, emote. Bỏ `--room` thì tạo phòng mới; thêm `--seconds 60` để tự rời |
| <http://localhost:5173/preview.html> | Trang xem thử nhân vật, map, UI, âm thanh (khi chạy `npm run dev`) |

Cấu trúc:

```text
shared/   luật chơi, số cân bằng (config/balance.ts), bản đồ, giao thức — dùng chung client + server
server/   Express + Socket.io, phòng chơi, hồ sơ (file JSON hoặc MongoDB), mini-game phía server
client/   Vite + Three.js, góc nhìn thứ nhất, UI HTML/CSS, âm thanh tổng hợp, mini-game phía client
scripts/  dev, build server, share (ngrok), bots
docs/     thiết kế và kế hoạch
```

Biến môi trường server:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng HTTP, mặc định 3000 |
| `DATA_DIR` | Thư mục lưu hồ sơ dạng file, mặc định `./data` |
| `MONGODB_URI` | Có thì lưu hồ sơ vào MongoDB thay cho file |

## Lưu ý riêng tư

Ảnh chân dung ở Hiên Tăng Đoàn (`client/src/content/gallery/`) được đóng gói vào bản build. Ai có link game đều xem được. Muốn đổi ảnh hoặc ghi tên dưới tranh: sửa `client/src/content/gallery.ts`.
