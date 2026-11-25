// Bổ sung sao lưu dữ liệu (bổ sung cho AT01): Quản lý tạo thêm một bản sao lưu; Nhân viên bán vé không mở được trang.
// Mỗi lần chạy để lại một tập tin _tay.bak trong thư mục sao lưu của máy chủ; tác vụ sao lưu hằng ngày xóa bản cũ hơn 30 ngày.
import { expect, test } from '../tien_ich/trinh_dien';
import { bamTrongHopThoai, dangNhap, toast } from '../tien_ich/chung';

test.describe('Bổ sung sao lưu dữ liệu', () => {
  test('CHUNG.19 Quản lý bấm Sao lưu ngay, xác nhận thì nhận tên tập tin sao lưu; Nhân viên bán vé mở thẳng trang thì bị chặn (AT01, BMT02)', async ({ page }) => {
    await dangNhap(page, 'nhanVien', '/sao-luu');
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập', level: 1 })).toBeVisible();
    expect((await page.request.post('/api/sao-luu', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })).status()).toBe(403);

    await dangNhap(page, 'quanLy', '/sao-luu');
    await page.getByRole('button', { name: 'Sao lưu ngay' }).click();
    await bamTrongHopThoai(page, 'Sao lưu dữ liệu ngay?', 'Sao lưu');
    await expect(toast(page, 'Sao lưu dữ liệu thành công.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Đã tạo bản sao lưu' })).toContainText(/QLBANVECHUYENBAY_\d{8}_\d{6}_tay\.bak/);
  });
});
