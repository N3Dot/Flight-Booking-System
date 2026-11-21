// Bổ sung UC01 Đăng nhập: thông báo lỗi, ô bỏ trống, chữ hoa thường, khoảng trắng, chèn SQL, phím Enter, ô mật khẩu ẩn,
// mở lại trang đăng nhập, nút Back sau khi đăng xuất và phiên hết hạn giữa chừng (BMT01).
import { expect, request, test, type Page } from '../tien_ich/trinh_dien';
import { ApiThu, DIA_CHI, TAI_KHOAN, dangNhap, dangNhapGiaoDien, hopThoai, tenDangNhapMoi, khoaTaiKhoanThuSauMoiCa } from '../tien_ich/chung';

const CHEN_SQL = "' OR 1=1 --";

function oTen(page: Page) {
  return page.getByRole('textbox', { name: 'Tên đăng nhập' });
}

function oMatKhau(page: Page) {
  return page.getByRole('textbox', { name: 'Mật khẩu' });
}

/** Hộp báo lỗi chung của biểu mẫu đăng nhập (không tính lỗi tại từng ô). */
function hopLoi(page: Page) {
  return page.locator('form [role="alert"]').filter({ hasText: /Sai tên đăng nhập|Không đăng nhập được|khóa/ });
}

/** Đếm số lần trình duyệt gửi yêu cầu đăng nhập lên máy chủ. */
function demGuiDangNhap(page: Page) {
  const dem = { soLan: 0 };
  page.on('request', (yc) => {
    if (yc.method() === 'POST' && new URL(yc.url()).pathname === '/api/dang-nhap') dem.soLan += 1;
  });
  return dem;
}

async function goiDangNhapApi(ten: string, matKhau: string) {
  const yc = await request.newContext({ baseURL: DIA_CHI });
  const ph = await yc.post('/api/dang-nhap', { data: { tenDangNhap: ten, matKhau } });
  const ketQua = { trangThai: ph.status(), than: await ph.text() };
  await yc.dispose();
  return ketQua;
}

test.describe('Bổ sung UC01 Đăng nhập', () => {
  khoaTaiKhoanThuSauMoiCa(test);
  test('UC01.6 Tên đăng nhập không tồn tại báo giống hệt sai mật khẩu (BMT01)', async ({ page }) => {
    await dangNhapGiaoDien(page, TAI_KHOAN.quanLy.ten, 'SaiMatKhau@1');
    await expect(hopLoi(page)).toBeVisible();
    const loiSaiMatKhau = (await hopLoi(page).innerText()).trim();

    await dangNhapGiaoDien(page, tenDangNhapMoi('khongco'), 'SaiMatKhau@1');
    await expect(hopLoi(page)).toBeVisible();
    const loiSaiTen = (await hopLoi(page).innerText()).trim();
    expect(loiSaiTen).toBe(loiSaiMatKhau);
    expect(loiSaiTen).not.toMatch(/không tồn tại|không có tài khoản/i);
    await expect(page).toHaveURL(/\/dang-nhap/);

    // máy chủ cũng trả cùng mã trạng thái và cùng nội dung
    const saiMatKhau = await goiDangNhapApi(TAI_KHOAN.quanLy.ten, 'SaiMatKhau@1');
    const saiTen = await goiDangNhapApi(tenDangNhapMoi('khongco'), 'SaiMatKhau@1');
    expect(saiTen.trangThai).toBe(saiMatKhau.trangThai);
    expect(saiTen.than).toBe(saiMatKhau.than);
  });

  test('UC01.7 Bỏ trống tên, mật khẩu hoặc cả hai thì báo lỗi tại ô, không gửi lên máy chủ (BMT01, UC01)', async ({ page }) => {
    const dem = demGuiDangNhap(page);
    await page.goto('/dang-nhap');
    const nut = page.getByRole('button', { name: 'Đăng nhập', exact: true });
    const loiTen = page.getByRole('alert').filter({ hasText: 'Vui lòng nhập tên đăng nhập.' });
    const loiMatKhau = page.getByRole('alert').filter({ hasText: 'Vui lòng nhập mật khẩu.' });

    // bỏ trống tên
    await oMatKhau(page).fill(TAI_KHOAN.quanLy.matKhau);
    await nut.click();
    await expect(loiTen).toBeVisible();
    await expect(oTen(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(oTen(page)).toBeFocused();
    await expect(loiMatKhau).toHaveCount(0);

    // bỏ trống mật khẩu
    await oTen(page).fill(TAI_KHOAN.quanLy.ten);
    await oMatKhau(page).fill('');
    await nut.click();
    await expect(loiMatKhau).toBeVisible();
    await expect(oMatKhau(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(oMatKhau(page)).toBeFocused();
    await expect(loiTen).toHaveCount(0);

    // bỏ trống cả hai (tên chỉ có khoảng trắng cũng coi là trống)
    await oTen(page).fill('   ');
    await nut.click();
    await expect(loiTen).toBeVisible();
    await expect(loiMatKhau).toBeVisible();

    await expect(page).toHaveURL(/\/dang-nhap/);
    expect(dem.soLan).toBe(0);
  });

  test('UC01.8 Mật khẩu đúng nhưng sai chữ hoa, chữ thường thì không đăng nhập được (BMT01)', async ({ page }) => {
    await dangNhapGiaoDien(page, TAI_KHOAN.quanLy.ten, 'quanly@123');
    await expect(hopLoi(page)).toContainText('Sai tên đăng nhập hoặc mật khẩu');
    await expect(page).toHaveURL(/\/dang-nhap/);
    expect((await page.request.get('/api/phien')).status()).toBe(401);
    expect((await goiDangNhapApi(TAI_KHOAN.quanLy.ten, 'QUANLY@123')).trangThai).toBe(401);
  });

  test('UC01.9 Tên đăng nhập có khoảng trắng ở đầu hoặc cuối được tự cắt, giao diện và máy chủ nhất quán (BMT01) (cần chốt)', async ({ page }) => {
    // hành vi hiện tại: giao diện và máy chủ đều cắt khoảng trắng ở hai đầu tên rồi mới kiểm tra
    for (const ten of [`  ${TAI_KHOAN.nhanVien.ten}`, `${TAI_KHOAN.nhanVien.ten}  `, ` ${TAI_KHOAN.nhanVien.ten} `]) {
      await page.context().clearCookies();
      await dangNhapGiaoDien(page, ten, TAI_KHOAN.nhanVien.matKhau);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('banner').getByText('Nhân viên bán vé')).toBeVisible();
      expect((await goiDangNhapApi(ten, TAI_KHOAN.nhanVien.matKhau)).trangThai).toBe(200);
    }
  });

  test('UC01.10 Nhập chuỗi chèn SQL vào ô tên và ô mật khẩu thì không đăng nhập được, không lỗi hệ thống (BMT01)', async ({ page }) => {
    const loiTrang: string[] = [];
    page.on('pageerror', (e) => loiTrang.push(e.message));
    for (const [ten, matKhau] of [
      [CHEN_SQL, CHEN_SQL],
      [`${TAI_KHOAN.quanLy.ten}' --`, 'bat ky'],
      [TAI_KHOAN.quanLy.ten, CHEN_SQL],
    ]) {
      await dangNhapGiaoDien(page, ten, matKhau);
      await expect(hopLoi(page)).toContainText('Sai tên đăng nhập hoặc mật khẩu');
      await expect(page).toHaveURL(/\/dang-nhap/);
      const ph = await goiDangNhapApi(ten, matKhau);
      expect(ph.trangThai).toBe(401);
      expect(ph.than).not.toMatch(/SqlException|syntax|Exception/i);
    }
    expect((await page.request.get('/api/phien')).status()).toBe(401);
    expect(loiTrang).toEqual([]);
  });

  test('UC01.11 Gõ xong mật khẩu rồi nhấn Enter thì đăng nhập như bấm nút (TD)', async ({ page }) => {
    await page.goto('/dang-nhap');
    await oTen(page).fill(TAI_KHOAN.quanLy.ten);
    await oMatKhau(page).fill(TAI_KHOAN.quanLy.matKhau);
    await oMatKhau(page).press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /quanly/ })).toBeVisible();
  });

  test('UC01.12 Ô mật khẩu hiện chữ dạng ẩn khi đang gõ (BMT01)', async ({ page }) => {
    await page.goto('/dang-nhap');
    await expect(oMatKhau(page)).toHaveAttribute('type', 'password');
    await oMatKhau(page).pressSequentially('Quanly@1');
    await expect(oMatKhau(page)).toHaveAttribute('type', 'password');
    await expect(oMatKhau(page)).toHaveValue('Quanly@1');
    // chữ chỉ hiện khi người dùng chủ động bấm nút Hiện mật khẩu
    const nutMat = page.getByRole('button', { name: 'Hiện mật khẩu' });
    await expect(nutMat).toHaveAttribute('aria-pressed', 'false');
    await nutMat.click();
    await expect(oMatKhau(page)).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
    await expect(oMatKhau(page)).toHaveAttribute('type', 'password');
  });

  test('UC01.13 Đã đăng nhập rồi mở lại trang đăng nhập thì được chuyển về trang chính (BMT01) (cần chốt)', async ({ page }) => {
    // hành vi hiện tại: chuyển thẳng về trang chính, phiên giữ nguyên
    await dangNhap(page, 'quanLy', '/chuyen-bay');
    await page.goto('/dang-nhap');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /quanly/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Tên đăng nhập' })).toHaveCount(0);
    expect((await page.request.get('/api/phien')).status()).toBe(200);
  });

  test('UC01.14 Sau khi đăng xuất bấm Back của trình duyệt thì không xem được dữ liệu phiên cũ (BMT01)', async ({ page }) => {
    await dangNhapGiaoDien(page, TAI_KHOAN.quanLy.ten, TAI_KHOAN.quanLy.matKhau);
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Tài khoản', exact: true }).click();
    const bang = page.getByRole('table', { name: 'Danh sách tài khoản' });
    await page.getByRole('textbox', { name: 'Tìm tài khoản' }).fill('nhanvien2');
    await expect(bang.getByRole('row').filter({ hasText: 'nhanvien2' })).toBeVisible();

    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/dang-nhap/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dang-nhap/);
    await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible();
    await expect(bang).toHaveCount(0);
    await expect(page.getByText('nhanvien2')).toHaveCount(0);
    // tiến lại cũng không vào được
    await page.goForward();
    await expect(page).toHaveURL(/\/dang-nhap/);
    await expect(bang).toHaveCount(0);
    expect((await page.request.get('/api/tai-khoan')).status()).toBe(401);
  });

  test('UC01.15 Phiên hết hạn giữa chừng rồi bấm Lưu thì báo đăng nhập lại và đưa về trang đăng nhập (BMT01)', async ({ page }) => {
    const loiTrang: string[] = [];
    page.on('pageerror', (e) => loiTrang.push(e.message));
    await dangNhap(page, 'quanLy', '/tai-khoan');
    await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
    const hop = hopThoai(page, 'Thêm tài khoản');
    await expect(hop).toBeVisible();
    await hop.getByRole('textbox', { name: 'Tên đăng nhập' }).fill(tenDangNhapMoi('hh'));
    await hop.getByLabel('Mật khẩu', { exact: false }).first().fill('Kiemthu@123');
    await hop.getByLabel('Nhập lại mật khẩu').fill('Kiemthu@123');

    // xóa cookie phiên, giống như phiên đã hết hạn
    await page.context().clearCookies();
    await hop.getByRole('button', { name: 'Lưu' }).click();

    await expect(page).toHaveURL(/\/dang-nhap/);
    await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible();
    // hộp thoại cho biết lý do: chưa đăng nhập hoặc phiên đã hết hạn
    const baoLoi = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: /phiên làm việc đã hết/i });
    await expect(baoLoi).toBeVisible();
    await baoLoi.getByRole('button', { name: 'Đóng' }).click();
    await expect(baoLoi).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Tên đăng nhập' })).toBeVisible();
    expect(loiTrang).toEqual([]);
  });

  test('UC01.16 Sai mật khẩu 5 lần liên tiếp thì bị khóa tạm, nhập đúng cũng chưa vào được; tài khoản khác không bị ảnh hưởng (BMT01)', async ({ page }) => {
    const ten = tenDangNhapMoi('sn');
    const api = await ApiThu.moi();
    await api.themTaiKhoan(ten, 'Kiemthu@123');
    await api.dong();
    for (let lan = 1; lan <= 5; lan++) {
      await dangNhapGiaoDien(page, ten, 'SaiMatKhau@' + lan);
      await expect(page.getByRole('alert').filter({ hasText: 'Sai tên đăng nhập hoặc mật khẩu' })).toBeVisible();
    }
    await dangNhapGiaoDien(page, ten, 'Kiemthu@123');
    await expect(page.getByRole('alert').filter({ hasText: /Đăng nhập sai quá nhiều lần.*5 phút/ })).toBeVisible();
    await expect(page).toHaveURL(/\/dang-nhap/);

    await dangNhapGiaoDien(page, TAI_KHOAN.nhanVien.ten, TAI_KHOAN.nhanVien.matKhau);
    await expect(page).toHaveURL(/\/$/);
  });
});
