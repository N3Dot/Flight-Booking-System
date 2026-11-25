// Cấu hình bộ kiểm thử giao diện đầu cuối (Playwright).
// Máy chủ phải đang chạy và phục vụ giao diện đã dựng (npm run dung-may-chu), cơ sở dữ liệu vừa nạp dữ liệu mẫu.
// Địa chỉ máy chủ lấy từ biến môi trường DIA_CHI, mặc định http://localhost:5080.
import { defineConfig, devices } from '@playwright/test';

const DIA_CHI = process.env.DIA_CHI ?? 'http://localhost:5080';

// chạy có hiện trình duyệt (npm run kiem-thu-xem) thì mặc định chậm 400 ms mỗi thao tác;
// đặt vào biến môi trường để các tiến trình worker (không có cờ --headed) cũng nhận được
if (process.argv.includes('--headed')) process.env.CHAM_MS ??= '400';
// chạy chậm thì mỗi thao tác chờ thêm CHAM_MS, nới giới hạn thời gian để không trượt oan
const CHAM = Number(process.env.CHAM_MS ?? 0);

export default defineConfig({
  testDir: './kiem_thu_e2e',
  outputDir: 'test-results',
  // các ca dùng chung một cơ sở dữ liệu và có ca đổi tham số quy định nên chạy tuần tự
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000 + CHAM * 100,
  expect: { timeout: 10_000 + CHAM * 4 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    // KENH=chrome hoặc KENH=msedge: chạy bằng Chrome, Edge đã cài trên máy thay cho Chromium của Playwright (CN05)
    ...(process.env.KENH ? { channel: process.env.KENH } : {}),
    baseURL: DIA_CHI,
    // máy chủ từ chối yêu cầu ghi không có header này (chống giả mạo yêu cầu từ trang khác)
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000 + CHAM * 4,
    // CHAM_MS: số mili giây chậm lại mỗi thao tác để kịp xem (đặt ở đầu tệp khi chạy --headed)
    launchOptions: { slowMo: Number(process.env.CHAM_MS ?? 0) },
  },
});
