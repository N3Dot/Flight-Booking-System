// Bổ sung chức năng chung và yêu cầu phi chức năng kiểm qua giao diện: trang không tìm thấy, F5 và Back/Forward,
// chữ có thẻ script, chuỗi chèn SQL ở ô tìm kiếm, bố cục ở các khung màn hình thường gặp.
import { expect, test, xemCsdl, type Locator, type Page } from '../tien_ich/trinh_dien';
import { ApiThu, bamTrongHopThoai, dangNhap, hopThoai, nhapNgay, soCanCuocMoi, tenDangNhapMoi, toast } from '../tien_ich/chung';

const SCRIPT = '<script>alert(1)</script>';
const ANH_LOI = '<img src=x onerror=alert(1)>';
const CHEN_SQL = "' OR 1=1 --";

/** Ghi lại mọi hộp alert/confirm bật lên và mọi lỗi JavaScript của trang. */
function theoDoiTrang(page: Page) {
  const ghi = { hopThoai: [] as string[], loi: [] as string[] };
  page.on('dialog', async (d) => {
    ghi.hopThoai.push(`${d.type()}: ${d.message()}`);
    await d.dismiss().catch(() => {});
  });
  page.on('pageerror', (e) => ghi.loi.push(e.message));
  return ghi;
}

/** Không có đoạn mã nào chạy: không hộp alert, không lỗi trang, không thẻ script hay ảnh lạ được chèn vào trang. */
async function khongChayMa(page: Page, ghi: ReturnType<typeof theoDoiTrang>) {
  expect(ghi.hopThoai).toEqual([]);
  expect(ghi.loi).toEqual([]);
  expect(await page.locator('body script').filter({ hasText: 'alert(1)' }).count()).toBe(0);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
}

test.describe('Bổ sung chức năng chung và phi chức năng', () => {
  test('CHUNG.5 Mở đường dẫn không tồn tại thì hiện trang Không tìm thấy có nút về trang chính', async ({ page }) => {
    const ghi = theoDoiTrang(page);
    for (const vaiTro of ['nhanVien', 'quanLy'] as const) {
      await dangNhap(page, vaiTro, '/duong-dan-khong-ton-tai');
      await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
      await expect(page.getByText('Trang bạn tìm không tồn tại')).toBeVisible();
      // menu chính vẫn còn để đi tiếp
      await expect(page.getByRole('navigation', { name: 'Menu chính' })).toBeVisible();
      const veTrangChinh = page.getByRole('main').getByRole('link', { name: 'Về trang chính' });
      await expect(veTrangChinh).toBeVisible();
      await veTrangChinh.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      // đường dẫn con sai ở trong một chức năng cũng vậy
      await page.goto('/ve/khong-co/them');
      await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
      await page.context().clearCookies();
    }
    expect(ghi.loi).toEqual([]);
  });

  test('CHUNG.7 F5 hoặc Back/Forward giữa biểu mẫu và danh sách không gửi lại dữ liệu, không lỗi', async ({ page }) => {
    const ghi = theoDoiTrang(page);
    const ten = tenDangNhapMoi('f5');
    await dangNhap(page, 'quanLy', '/tai-khoan');

    // lưu một tài khoản qua biểu mẫu
    await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
    const hop = hopThoai(page, 'Thêm tài khoản');
    await hop.getByRole('textbox', { name: 'Tên đăng nhập' }).fill(ten);
    await hop.getByRole('textbox', { name: 'Mật khẩu', exact: true }).fill('Kiemthu@123');
    await hop.getByRole('textbox', { name: 'Nhập lại mật khẩu', exact: true }).fill('Kiemthu@123');
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page, `Thêm tài khoản ${ten} thành công.`)).toBeVisible();
    await expect(hop).toBeHidden();

    // từ đây không được có yêu cầu ghi dữ liệu nào gửi lên máy chủ
    const yeuCauGhi: string[] = [];
    page.on('request', (yc) => {
      if (yc.url().includes('/api/') && yc.method() !== 'GET') yeuCauGhi.push(`${yc.method()} ${yc.url()}`);
    });
    const tieuDe = (ten: string | RegExp) => page.getByRole('heading', { level: 1, name: ten });

    await page.reload();
    await expect(tieuDe('Phân quyền')).toBeVisible();
    await expect(hopThoai(page, 'Thêm tài khoản')).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Chuyến bay', exact: true }).click();
    await expect(tieuDe('Danh sách chuyến bay')).toBeVisible();
    await page.getByRole('link', { name: 'Thêm chuyến bay' }).click();
    await expect(tieuDe('Thêm chuyến bay')).toBeVisible();
    await page.reload();
    await expect(tieuDe('Thêm chuyến bay')).toBeVisible();

    await page.goBack();
    await expect(tieuDe('Danh sách chuyến bay')).toBeVisible();
    await page.goBack();
    await expect(tieuDe('Phân quyền')).toBeVisible();
    await page.goForward();
    await expect(tieuDe('Danh sách chuyến bay')).toBeVisible();
    await page.goForward();
    await expect(tieuDe('Thêm chuyến bay')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Mã chuyến bay' })).toHaveValue('');

    await page.goto('/ve');
    await expect(tieuDe('Danh sách vé')).toBeVisible();
    await page.goBack();
    await expect(tieuDe('Thêm chuyến bay')).toBeVisible();
    await page.reload();
    await expect(tieuDe('Thêm chuyến bay')).toBeVisible();

    expect(yeuCauGhi).toEqual([]);
    expect(ghi.loi).toEqual([]);
    await expect(page.getByText(/lỗi hệ thống|không kết nối/i)).toHaveCount(0);

    // tài khoản chỉ có đúng một dòng, không bị thêm lại
    const ds = (await (await page.request.get('/api/tai-khoan')).json()) as { tenDangNhap: string }[];
    expect(ds.filter((t) => t.tenDangNhap === ten)).toHaveLength(1);
    await xemCsdl(page, `tài khoản ${ten} chỉ được thêm một lần`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 1 });
  });

  test('CHUNG.8 Nhập thẻ script vào họ tên hành khách, tên sân bay, ghi chú trung gian thì hiện như chữ thường, không chạy (bảo mật)', async ({ page }) => {
    const ghi = theoDoiTrang(page);
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    // ghi chú sân bay trung gian chứa thẻ ảnh có onerror
    const cbTrungGian = await api.themChuyenBay({ thoiGianBay: 180, trungGian: [{ thuTu: 1, maSanBay: 'DAD', thoiGianDung: 15, ghiChu: ANH_LOI }] });
    await api.dong();

    // 1. họ tên hành khách: nhập trên biểu mẫu bán vé
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await expect(page.getByRole('combobox', { name: 'Chuyến bay' })).toHaveValue(new RegExp(cb.maChuyenBay));
    const form = page.getByRole('form', { name: 'Vé chuyến bay BM2' });
    await form.getByRole('textbox', { name: 'Hành khách' }).fill(SCRIPT);
    await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(soCanCuocMoi());
    await form.getByRole('textbox', { name: 'Điện thoại' }).fill('0912345678');
    const hang = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 2/ });
    await page.locator('label').filter({ has: hang }).or(hang).first().click();
    await form.getByRole('button', { name: 'Bán vé', exact: true }).click();
    await bamTrongHopThoai(page, 'Xác nhận bán vé?', 'Bán vé');
    const kq = hopThoai(page, 'Bán vé thành công');
    await expect(kq).toBeVisible();
    await expect(kq.getByText(SCRIPT, { exact: true })).toBeVisible();
    const maVe = (await kq.getByText(/^VE\d{8}$/).textContent())!.trim();
    await kq.getByRole('button').last().press('Escape');

    await page.goto('/ve');
    await page.getByRole('textbox', { name: 'Mã vé' }).fill(maVe);
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    const dong = page.getByRole('table', { name: 'Danh sách vé' }).getByRole('row').filter({ hasText: maVe });
    await expect(dong.getByText(SCRIPT, { exact: true })).toBeVisible();
    await khongChayMa(page, ghi);
    await xemCsdl(page, `họ tên hành khách của vé ${maVe} lưu nguyên dạng chữ`, { bang: 'VE', cot: 'MaVe', giaTri: maVe, soDong: 1 });

    // 2. ghi chú sân bay trung gian: trang xem chuyến bay và biểu mẫu sửa
    await dangNhap(page, 'quanLy', `/chuyen-bay/${cbTrungGian.maChuyenBay}`);
    await expect(page.getByRole('main').getByText(ANH_LOI, { exact: true })).toBeVisible();
    await page.goto(`/chuyen-bay/${cbTrungGian.maChuyenBay}/sua`);
    await expect(page.getByRole('textbox', { name: 'Ghi chú' }).first()).toHaveValue(ANH_LOI);
    await khongChayMa(page, ghi);
    await xemCsdl(page, `ghi chú trung gian của ${cbTrungGian.maChuyenBay} lưu nguyên dạng chữ`, {
      bang: 'CHITIETTRUNGGIAN',
      cot: 'MaChuyenBay',
      giaTri: cbTrungGian.maChuyenBay,
      soDong: 1,
      dung: { GhiChu: ANH_LOI },
    });

    // 3. tên sân bay: không thêm sân bay thật vào dữ liệu dùng chung; nhập vào ô của biểu mẫu rồi hủy,
    //    và cho danh sách sân bay nhận một tên có thẻ script (thay phản hồi máy chủ ngay trong trình duyệt)
    await page.route('**/api/quy-dinh', async (route) => {
      const ph = await route.fetch();
      const duLieu = await ph.json();
      duLieu.sanBay.push({ maSanBay: 'ZZX', tenSanBay: SCRIPT }, { maSanBay: 'ZZY', tenSanBay: ANH_LOI });
      await route.fulfill({ response: ph, json: duLieu });
    });
    await page.goto('/quy-dinh');
    const bangSanBay = page.getByRole('table', { name: 'Danh sách sân bay' });
    await expect(bangSanBay.getByRole('row').filter({ hasText: 'ZZX' }).getByText(SCRIPT, { exact: true })).toBeVisible();
    await expect(bangSanBay.getByRole('row').filter({ hasText: 'ZZY' }).getByText(ANH_LOI, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thêm sân bay' }).click();
    const them = hopThoai(page, 'Thêm sân bay');
    await them.getByRole('textbox', { name: 'Tên sân bay' }).fill(SCRIPT);
    await expect(them.getByRole('textbox', { name: 'Tên sân bay' })).toHaveValue(SCRIPT);
    await them.getByRole('button', { name: 'Hủy' }).click();
    await expect(them).toBeHidden();
    // ô chọn sân bay ở trang chuyến bay cũng hiện tên như chữ thường
    await page.goto('/chuyen-bay');
    await page.getByRole('combobox', { name: 'Sân bay đi' }).click();
    await page.getByRole('combobox', { name: 'Sân bay đi' }).fill('ZZX');
    await expect(page.getByRole('option', { name: /ZZX/ })).toContainText(SCRIPT);
    await page.keyboard.press('Escape');
    await khongChayMa(page, ghi);
    await page.unroute('**/api/quy-dinh');
  });

  test('CHUNG.9 Nhập chuỗi chèn SQL vào các ô tìm kiếm thì không lỗi, không ra dữ liệu lạ (bảo mật)', async ({ page }) => {
    const ghi = theoDoiTrang(page);
    const khongLoi = async () => {
      await expect(page.locator('[role="alert"]').filter({ hasText: /lỗi|không kết nối|không hợp lệ/i })).toHaveCount(0);
    };
    await dangNhap(page, 'quanLy', '/tai-khoan');

    // tài khoản
    await page.getByRole('textbox', { name: 'Tìm tài khoản' }).fill(CHEN_SQL);
    await expect(page.getByText('Không có tài khoản phù hợp')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Danh sách tài khoản' }).locator('tbody tr')).toHaveCount(0);
    await khongLoi();

    // sân bay
    await page.goto('/quy-dinh');
    await page.getByRole('textbox', { name: 'Lọc sân bay' }).fill(CHEN_SQL);
    await expect(page.getByText('Không có sân bay phù hợp')).toBeVisible();
    await khongLoi();

    // chuyến bay theo mã
    await page.goto('/chuyen-bay');
    await nhapNgay(page, 'Từ ngày', '');
    await page.getByRole('textbox', { name: 'Mã chuyến bay' }).fill(CHEN_SQL);
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await expect(page.getByText('Không tìm thấy chuyến bay')).toBeVisible();
    await expect(page.getByText(/Tìm thấy 0 chuyến bay/)).toBeVisible();
    await khongLoi();

    // vé theo mã vé và số giấy tờ
    for (const nhan of ['Mã vé', 'CCCD/Hộ chiếu']) {
      await page.goto('/ve');
      await page.getByRole('textbox', { name: nhan }).fill(CHEN_SQL);
      await page.getByRole('button', { name: 'Tìm', exact: true }).click();
      await expect(page.getByText('Không tìm thấy vé')).toBeVisible();
      await khongLoi();
    }

    // phiếu đặt chỗ theo mã phiếu và số giấy tờ, mọi tình trạng
    for (const nhan of ['Mã phiếu đặt', 'CCCD/Hộ chiếu']) {
      await page.goto('/phieu-dat');
      await page.getByRole('textbox', { name: nhan }).fill(CHEN_SQL);
      await page.getByRole('combobox', { name: 'Tình trạng' }).selectOption('');
      await page.getByRole('button', { name: 'Tìm', exact: true }).click();
      await expect(page.getByText('Không tìm thấy phiếu đặt chỗ')).toBeVisible();
      await khongLoi();
    }

    // gửi nguyên chuỗi lên máy chủ (không qua bộ lọc ký tự của ô nhập): không lỗi, không trả về dữ liệu
    for (const [duongDan, thamSo] of [
      ['/api/chuyen-bay', 'maChuyenBay'],
      ['/api/ve', 'maVe'],
      ['/api/ve', 'soGiayTo'],
      ['/api/phieu-dat', 'maPhieuDat'],
      ['/api/phieu-dat', 'soGiayTo'],
    ]) {
      const ph = await page.request.get(duongDan, { params: { [thamSo]: CHEN_SQL } });
      expect(ph.status(), `${duongDan}?${thamSo}`).toBeLessThan(500);
      if (ph.ok()) expect(await ph.json(), `${duongDan}?${thamSo}`).toEqual([]);
    }
    expect(ghi.loi).toEqual([]);
  });

  test('CHUNG.13 Các màn hình chính ở khung 1366×768 và 1920×1080 không vỡ bố cục, không bị che nút (Bảng 5.23)', async ({ page }) => {
    const nut = (ten: string, vaiTro: 'button' | 'link' = 'button') => (p: Page) => p.getByRole('main').getByRole(vaiTro, { name: ten, exact: true }).first();
    const manHinh: { duongDan: string; cacNut: ((p: Page) => Locator)[] }[] = [
      { duongDan: '/', cacNut: [] },
      { duongDan: '/chuyen-bay', cacNut: [nut('Thêm chuyến bay', 'link'), nut('Tìm'), nut('Xuất Excel'), nut('Nhập Excel')] },
      { duongDan: '/chuyen-bay/them', cacNut: [nut('Lưu chuyến bay')] },
      { duongDan: '/ban-ve', cacNut: [nut('Bán vé'), nut('Hủy')] },
      { duongDan: '/dat-ve', cacNut: [nut('Đặt vé'), nut('Hủy')] },
      { duongDan: '/ve', cacNut: [nut('Tìm')] },
      { duongDan: '/phieu-dat', cacNut: [nut('Tìm')] },
      { duongDan: '/bao-cao', cacNut: [nut('Lập báo cáo')] },
      { duongDan: '/quy-dinh', cacNut: [nut('Thêm sân bay'), nut('Thêm hạng vé')] },
      { duongDan: '/tai-khoan', cacNut: [nut('Thêm tài khoản')] },
      { duongDan: '/tro-giup', cacNut: [] },
    ];
    const ghi = theoDoiTrang(page);
    const loi: string[] = [];

    for (const kichThuoc of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      const khung = `${kichThuoc.width}×${kichThuoc.height}`;
      await page.setViewportSize(kichThuoc);

      // trang đăng nhập
      await page.context().clearCookies();
      await page.goto('/dang-nhap');
      await kiemBoCuc(page, `${khung} /dang-nhap`, [page.getByRole('button', { name: 'Đăng nhập', exact: true })], loi);

      await dangNhap(page, 'quanLy', '/');
      for (const m of manHinh) {
        await page.goto(m.duongDan);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        const cacO = [
          page.getByRole('heading', { level: 1 }).first(),
          page.getByRole('banner').getByRole('button', { name: 'Đăng xuất' }),
          ...m.cacNut.map((f) => f(page)),
        ];
        await kiemBoCuc(page, `${khung} ${m.duongDan}`, cacO, loi);
      }
    }
    expect(loi, loi.join('\n')).toEqual([]);
    expect(ghi.loi).toEqual([]);
  });
});

/** Trang không có thanh cuộn ngang; từng nút nằm trọn trong bề ngang khung nhìn, cuộn tới thì thấy trọn và không bị phần khác che. */
async function kiemBoCuc(page: Page, noi: string, cacO: Locator[], loi: string[]) {
  const rong = await page.evaluate(() => ({
    trang: document.documentElement.scrollWidth,
    khung: document.documentElement.clientWidth,
  }));
  if (rong.trang > rong.khung) loi.push(`${noi}: có thanh cuộn ngang (rộng ${rong.trang} > ${rong.khung})`);

  const beNgang = page.viewportSize()!.width;
  for (const o of cacO) {
    const ten = (await o.textContent().catch(() => null))?.trim() || o.toString();
    if (!(await o.isVisible())) {
      loi.push(`${noi}: không thấy "${ten}"`);
      continue;
    }
    await o.scrollIntoViewIfNeeded();
    const hop = await o.boundingBox();
    if (!hop || hop.x < 0 || hop.x + hop.width > beNgang + 1) loi.push(`${noi}: "${ten}" tràn ra ngoài bề ngang khung nhìn`);
    try {
      await expect(o).toBeInViewport({ ratio: 1, timeout: 2000 });
    } catch {
      loi.push(`${noi}: "${ten}" không nằm trọn trong khung nhìn`);
    }
    // bấm thử (không bấm thật): Playwright kiểm nút nhận được cú bấm, không bị phần khác che
    const laTieuDe = await o.evaluate((e) => /^H\d$/.test(e.tagName));
    if (!laTieuDe && !(await o.isDisabled().catch(() => false)))
      await o.click({ trial: true, timeout: 3000 }).catch(() => loi.push(`${noi}: "${ten}" bị che hoặc không bấm được`));
  }
}
