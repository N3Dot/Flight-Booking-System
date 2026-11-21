// Bổ sung UC04 Quản lý bán vé: kiểm tra thông tin hành khách (giả định 9, 10), hạng vé và giá tiền (QĐ2),
// bán đồng thời, bán từ phiếu đặt chỗ, tra cứu, sửa và hủy vé.
import { expect, request, test, xemCsdl, type Locator, type Page } from '../tien_ich/trinh_dien';
import {
  ApiThu,
  DIA_CHI,
  TAI_KHOAN,
  bamTrongHopThoai,
  chonTrongOChon,
  dangNhap,
  hanhKhachMoi,
  hopThoai,
  mocVN,
  nhapNgay,
  soCanCuocMoi,
  toast,
  type HanhKhachThu,
} from '../tien_ich/chung';

const bieuMau = (page: Page) => page.getByRole('form', { name: 'Vé chuyến bay BM2' });

async function nhapHanhKhach(page: Page, hoTen: string, soGiayTo: string, dienThoai = '0912345678') {
  const form = bieuMau(page);
  await form.getByRole('textbox', { name: 'Hành khách' }).fill(hoTen);
  await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(soGiayTo);
  await form.getByRole('textbox', { name: 'Điện thoại' }).fill(dienThoai);
}

async function chonHang(page: Page, tenHang: string) {
  const o = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: new RegExp(`^${tenHang}`) });
  // ô radio gốc có thể được ẩn dưới thẻ hạng vé, bấm vào nhãn của nó
  await page.locator('label').filter({ has: o }).or(o).first().click();
  await expect(o).toBeChecked();
}

/** Bấm Bán vé, xác nhận, đọc mã vé trong hộp thoại kết quả rồi đóng hộp thoại. */
async function banVaLayMa(page: Page): Promise<{ maVe: string; giaTien: string }> {
  await bieuMau(page).getByRole('button', { name: 'Bán vé', exact: true }).click();
  await bamTrongHopThoai(page, 'Xác nhận bán vé?', 'Bán vé');
  const kq = hopThoai(page, 'Bán vé thành công');
  await expect(kq).toBeVisible();
  const maVe = (await kq.getByText(/^VE\d{8}$/).textContent())!.trim();
  const giaTien = (await kq.locator('dd').last().textContent())!.trim();
  await kq.getByRole('button').last().press('Escape');
  await expect(kq).toBeHidden();
  return { maVe, giaTien };
}

async function timVe(page: Page, maVe: string) {
  await page.goto('/ve');
  await page.getByRole('textbox', { name: 'Mã vé' }).fill(maVe);
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  const dong = page.getByRole('table', { name: 'Danh sách vé' }).getByRole('row').filter({ hasText: maVe });
  await expect(dong).toHaveCount(1);
  return dong;
}

/** Nhập vào ô rồi rời ô bằng Tab để biểu mẫu kiểm tra ô đó. */
async function nhapRoiO(o: Locator, giaTri: string) {
  await o.fill(giaTri);
  await o.press('Tab');
}

/** Gọi thẳng API bán vé với thông tin hành khách sai một ô, để kiểm máy chủ cũng chặn. */
async function banQuaApi(page: Page, maChuyenBay: string, thay: Partial<HanhKhachThu>) {
  return page.request.post('/api/ve', { data: { maChuyenBay, maHangVe: 'H2', hanhKhach: { ...hanhKhachMoi(), ...thay } } });
}

/** Phiên API của Quản lý cho các việc ApiThu chưa có: đọc CSDL, thêm hạng vé, xóa chuyến bay. */
async function phienQuanLy() {
  const yc = await request.newContext({ baseURL: DIA_CHI });
  const ph = await yc.post('/api/dang-nhap', { data: { tenDangNhap: TAI_KHOAN.quanLy.ten, matKhau: TAI_KHOAN.quanLy.matKhau } });
  expect(ph.ok(), 'đăng nhập quản lý').toBeTruthy();
  return yc;
}

/** Đọc các dòng trong CSDL có cột = giá trị (tối đa 50 dòng), để ca tự khẳng định cả khi chạy bằng lệnh npm. */
async function docCsdl(bang: string, cot: string, giaTri: string): Promise<Record<string, unknown>[]> {
  const yc = await phienQuanLy();
  try {
    const ph = await yc.get(`/api/kiem-thu/csdl?${new URLSearchParams({ bang, cot, giaTri })}`);
    expect(ph.ok(), `đọc bảng ${bang}`).toBeTruthy();
    const b = (await ph.json()) as { cacCot: string[]; cacDong: unknown[][] };
    return b.cacDong.map((d) => Object.fromEntries(b.cacCot.map((c, i) => [c, d[i]])));
  } finally {
    await yc.dispose();
  }
}

test.describe('Bổ sung UC04 Quản lý bán vé', () => {
  test('UC04.8 Số căn cước 11, 12, 13 chữ số và có chữ cái: chỉ đúng 12 chữ số là hợp lệ (giả định 9)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    const o = form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' });
    const loi = form.getByText('Số CCCD gồm đúng 12 chữ số.');
    const so12 = soCanCuocMoi();

    await nhapRoiO(o, so12.slice(0, 11));
    await expect(loi).toBeVisible();
    await expect(o).toHaveAttribute('aria-invalid', 'true');

    await nhapRoiO(o, so12);
    await expect(o).toHaveValue(so12);
    await expect(loi).toHaveCount(0);

    // chữ số thứ 13 không nhập được vào ô
    await nhapRoiO(o, so12 + '7');
    await expect(o).toHaveValue(so12);
    await expect(loi).toHaveCount(0);

    // chữ cái bị bỏ đi, còn 9 chữ số nên báo lỗi
    await nhapRoiO(o, '0912abc34567');
    await expect(o).toHaveValue('091234567');
    await expect(loi).toBeVisible();

    // máy chủ cũng chặn khi gửi thẳng
    for (const so of [so12.slice(0, 11), so12 + '7', '0912abc34567']) {
      const ph = await banQuaApi(page, cb.maChuyenBay, { soGiayTo: so });
      expect(ph.status(), `số căn cước ${so}`).toBe(400);
    }
    expect(await docCsdl('VE', 'MaChuyenBay', cb.maChuyenBay)).toHaveLength(0);
  });

  test('UC04.9 Hộ chiếu 5, 6, 20, 21 ký tự, chữ thường, ký tự đặc biệt: 6 đến 20 chữ in hoa và số là hợp lệ (giả định 9)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    await form.getByRole('combobox', { name: 'Loại giấy tờ' }).selectOption('HoChieu');
    const o = form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' });
    const loi = form.getByText('Số hộ chiếu gồm 6 đến 20 ký tự là chữ in hoa và chữ số.');
    // số hộ chiếu 20 ký tự không trùng giữa các lần chạy
    const so20 = ('P' + soCanCuocMoi() + 'ABCDEFGH').slice(0, 20);

    await nhapRoiO(o, 'AB123');
    await expect(loi).toBeVisible();
    await nhapRoiO(o, 'AB1234');
    await expect(loi).toHaveCount(0);
    await nhapRoiO(o, so20);
    await expect(o).toHaveValue(so20);
    await expect(loi).toHaveCount(0);
    // ký tự thứ 21 không nhập được
    await nhapRoiO(o, so20 + 'Z');
    await expect(o).toHaveValue(so20);
    await expect(loi).toHaveCount(0);
    // chữ thường tự đổi thành chữ in hoa, ký tự đặc biệt bị bỏ đi
    await nhapRoiO(o, 'ab12cd');
    await expect(o).toHaveValue('AB12CD');
    await expect(loi).toHaveCount(0);
    await nhapRoiO(o, 'AB-12.3');
    await expect(o).toHaveValue('AB123');
    await expect(loi).toBeVisible();

    for (const so of ['AB123', so20 + 'Z', 'AB-12.34']) {
      const ph = await banQuaApi(page, cb.maChuyenBay, { loaiGiayTo: 'HoChieu', soGiayTo: so });
      expect(ph.status(), `số hộ chiếu ${so}`).toBe(400);
    }

    // bán được vé với hộ chiếu 20 ký tự nhập bằng chữ thường, lưu thành chữ in hoa
    await form.getByRole('textbox', { name: 'Hành khách' }).fill('Emily Watson');
    await o.fill(so20.toLowerCase());
    await form.getByRole('textbox', { name: 'Điện thoại' }).fill('+447911123456');
    await chonHang(page, 'Hạng 2');
    const { maVe } = await banVaLayMa(page);
    const dong = await timVe(page, maVe);
    await expect(dong).toContainText(so20);
    await expect(dong).toContainText('Hộ chiếu');
    await xemCsdl(page, `vé ${maVe} bán cho hành khách có hộ chiếu 20 ký tự`, { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: so20, soDong: 1, dung: { LoaiGiayTo: 'Hộ chiếu' } });
  });

  test('UC04.10 Điện thoại 7, 8, 15, 16 chữ số, có +84, có chữ hoặc khoảng trắng: 8 đến 15 chữ số là hợp lệ (giả định 10)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    const o = form.getByRole('textbox', { name: 'Điện thoại' });
    const loi = form.getByText('Điện thoại gồm 8 đến 15 chữ số, có thể có dấu + ở đầu (ví dụ +84).');

    await nhapRoiO(o, '0912345');
    await expect(loi).toBeVisible();
    await nhapRoiO(o, '09123456');
    await expect(loi).toHaveCount(0);
    await nhapRoiO(o, '091234567890123');
    await expect(loi).toHaveCount(0);
    await nhapRoiO(o, '0912345678901234');
    await expect(o).toHaveValue('0912345678901234');
    await expect(loi).toBeVisible();
    await nhapRoiO(o, '+84912345678');
    await expect(o).toHaveValue('+84912345678');
    await expect(loi).toHaveCount(0);
    // chữ cái, khoảng trắng và dấu + ở giữa bị bỏ đi khi gõ
    await nhapRoiO(o, '0912 345 678');
    await expect(o).toHaveValue('0912345678');
    await nhapRoiO(o, '09ab12+34');
    await expect(o).toHaveValue('091234');
    await expect(loi).toBeVisible();

    for (const dt of ['0912345', '0912345678901234', '0912 345 678', '09ab345678', '84+912345678']) {
      const ph = await banQuaApi(page, cb.maChuyenBay, { dienThoai: dt });
      expect(ph.status(), `điện thoại ${dt}`).toBe(400);
    }

    // bán được vé với số có mã quốc gia +84
    const soGiayTo = soCanCuocMoi();
    await nhapHanhKhach(page, 'Mai Thị Điện Thoại', soGiayTo, '+84912345678');
    await chonHang(page, 'Hạng 2');
    const { maVe } = await banVaLayMa(page);
    await expect(await timVe(page, maVe)).toContainText('+84912345678');
    await xemCsdl(page, `hành khách của vé ${maVe} lưu điện thoại có +84`, { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: soGiayTo, soDong: 1, dung: { DienThoai: '+84912345678' } });
  });

  test('UC04.11 Họ tên trống, 50 ký tự, 51 ký tự, có thẻ HTML (cột nvarchar(50))', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    // chờ trang chọn sẵn chuyến bay từ đường dẫn rồi mới nhập
    await expect(page.getByRole('combobox', { name: 'Chuyến bay' })).toHaveValue(new RegExp(cb.maChuyenBay));
    const form = bieuMau(page);
    const oTen = form.getByRole('textbox', { name: 'Hành khách' });
    const ten50 = ('Trần Thị Ngọc Bích Năm Mươi Ký Tự ' + 'X'.repeat(50)).slice(0, 50);
    expect(ten50).toHaveLength(50);

    // họ tên trống: báo lỗi, không mở hộp xác nhận
    await nhapHanhKhach(page, '', soCanCuocMoi());
    await chonHang(page, 'Hạng 2');
    await form.getByRole('button', { name: 'Bán vé', exact: true }).click();
    await expect(form.getByText('Vui lòng nhập họ tên hành khách.')).toBeVisible();
    await expect(oTen).toHaveAttribute('aria-invalid', 'true');
    await expect(hopThoai(page, 'Xác nhận bán vé?')).toHaveCount(0);

    // 51 ký tự: ô chỉ nhận 50 ký tự đầu; máy chủ chặn khi gửi thẳng
    await oTen.fill(ten50 + 'Y');
    await expect(oTen).toHaveValue(ten50);
    const ph = await banQuaApi(page, cb.maChuyenBay, { hoTen: ten50 + 'Y' });
    expect(ph.status()).toBe(400);

    // 50 ký tự: lưu được
    const so1 = soCanCuocMoi();
    await nhapHanhKhach(page, ten50, so1);
    await expect(form.getByText('Vui lòng nhập họ tên hành khách.')).toHaveCount(0);
    const ve1 = await banVaLayMa(page);
    await expect(await timVe(page, ve1.maVe)).toContainText(ten50);

    // thẻ HTML hiện như chữ thường, không thành chữ đậm
    const tenThe = '<b>Đậm</b> Thử Thẻ';
    const so2 = soCanCuocMoi();
    await page.goto(`/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await nhapHanhKhach(page, tenThe, so2);
    await chonHang(page, 'Hạng 2');
    const ve2 = await banVaLayMa(page);
    const dong = await timVe(page, ve2.maVe);
    await expect(dong).toContainText(tenThe);
    await expect(dong.locator('b').filter({ hasText: /^Đậm$/ })).toHaveCount(0);
    await xemCsdl(page, 'họ tên 50 ký tự và họ tên có thẻ HTML được lưu nguyên văn',
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: so1, soDong: 1, dung: { HoTen: ten50 } },
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: so2, soDong: 1, dung: { HoTen: tenThe } });
  });

  test('UC04.12 Bán vé cho hành khách đã có cùng loại và số giấy tờ: không tạo thêm hành khách (giả định 9)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const hk = hanhKhachMoi('Lý Thị Đã Có');
    await api.banVe(cb.maChuyenBay, 'H2', hk);
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    // nhập số giấy tờ trước: hệ thống điền sẵn họ tên, điện thoại của hành khách đã có
    await nhapRoiO(form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }), hk.soGiayTo);
    await expect(form.getByText(`Hành khách đã có trong hệ thống: ${hk.hoTen}`)).toBeVisible();
    await expect(form.getByRole('textbox', { name: 'Hành khách' })).toHaveValue(hk.hoTen);
    await expect(form.getByRole('textbox', { name: 'Điện thoại' })).toHaveValue(hk.dienThoai);
    await chonHang(page, 'Hạng 2');
    const { maVe } = await banVaLayMa(page);

    const dsVe = await (await page.request.get(`/api/ve?soGiayTo=${hk.soGiayTo}`)).json();
    expect(dsVe).toHaveLength(2);
    expect(await docCsdl('HANHKHACH', 'SoGiayTo', hk.soGiayTo)).toHaveLength(1);
    await xemCsdl(page, `vé ${maVe} dùng lại hành khách đã có, không thêm dòng HANHKHACH`,
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: hk.soGiayTo, soDong: 1, dung: { HoTen: hk.hoTen } },
      { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 2 });
  });

  test('UC04.13 Cùng số giấy tờ nhưng nhập họ tên khác: vé dùng tên đã lưu, không đổi tên hành khách (giả định 8, 9)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const hk = hanhKhachMoi('Đỗ Văn Tên Cũ');
    await api.banVe(cb.maChuyenBay, 'H2', hk);
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    await form.getByRole('textbox', { name: 'Hành khách' }).fill('Đỗ Văn Tên Mới');
    await nhapRoiO(form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }), hk.soGiayTo);
    // hiện tại: chỉ gợi ý tên đã lưu, giữ nguyên tên vừa nhập, không hỏi lại
    await expect(form.getByText(`Hành khách đã có trong hệ thống: ${hk.hoTen}`)).toBeVisible();
    await expect(form.getByRole('textbox', { name: 'Hành khách' })).toHaveValue('Đỗ Văn Tên Mới');
    await form.getByRole('textbox', { name: 'Điện thoại' }).fill('0911222333');
    await chonHang(page, 'Hạng 2');
    const { maVe } = await banVaLayMa(page);
    // hiện tại: vé gắn với hành khách đã có, họ tên và điện thoại đã lưu không đổi
    const dong = await timVe(page, maVe);
    await expect(dong).toContainText(hk.hoTen);
    await expect(dong).not.toContainText('Tên Mới');
    const dsHk = await docCsdl('HANHKHACH', 'SoGiayTo', hk.soGiayTo);
    expect(dsHk).toHaveLength(1);
    expect(dsHk[0].HoTen).toBe(hk.hoTen);
    await xemCsdl(page, `vé ${maVe} dùng hành khách đã có, tên giữ nguyên`, { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: hk.soGiayTo, soDong: 1, dung: { HoTen: hk.hoTen, DienThoai: hk.dienThoai } });
  });

  test('UC04.14 Hạng còn đúng 1 ghế: bán được, sau đó hạng hiện Hết chỗ (QĐ2)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({
      gheTheoHang: [
        { maHangVe: 'H1', soLuongGhe: 1 },
        { maHangVe: 'H2', soLuongGhe: 3 },
      ],
    });
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const hang1 = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 1/ });
    await expect(hang1).toHaveAttribute('title', /^Hạng 1: 1 ghế trống/);
    await nhapHanhKhach(page, 'Hoàng Văn Ghế Cuối', soCanCuocMoi());
    await chonHang(page, 'Hạng 1');
    const { maVe } = await banVaLayMa(page);
    // ngay trên màn hình đang bán: Hạng 1 hết chỗ, không chọn được
    await expect(hang1).toContainText('Hết chỗ');
    await expect(hang1).toBeDisabled();
    await xemCsdl(page, `vé ${maVe} bán ghế cuối cùng của Hạng 1`, { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1, dung: { MaHangVe: 'H1', TinhTrang: 'Đã bán' } });
  });

  test('UC04.15 Hai trình duyệt cùng bán ghế cuối cùng của một hạng: chỉ một bên thành công (QĐ2)', async ({ browser }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({
      gheTheoHang: [
        { maHangVe: 'H1', soLuongGhe: 1 },
        { maHangVe: 'H2', soLuongGhe: 3 },
      ],
    });
    await api.dong();
    const tuyChon = { baseURL: DIA_CHI, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 900 } };
    const mayA = await browser.newContext(tuyChon);
    const mayB = await browser.newContext(tuyChon);
    try {
      const a = await mayA.newPage();
      const b = await mayB.newPage();
      // cả hai máy cùng mở bán Hạng 1 và đều đến bước hộp xác nhận khi ghế còn trống
      for (const [p, ten] of [[a, 'Nguyễn Văn Máy A'], [b, 'Trần Thị Máy B']] as const) {
        await dangNhap(p, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
        await nhapHanhKhach(p, ten, soCanCuocMoi());
        await chonHang(p, 'Hạng 1');
        await bieuMau(p).getByRole('button', { name: 'Bán vé', exact: true }).click();
        await expect(hopThoai(p, 'Xác nhận bán vé?')).toBeVisible();
      }
      await bamTrongHopThoai(a, 'Xác nhận bán vé?', 'Bán vé');
      await expect(hopThoai(a, 'Bán vé thành công')).toBeVisible();
      await bamTrongHopThoai(b, 'Xác nhận bán vé?', 'Bán vé');
      const loi = hopThoai(b, 'Không thể bán vé');
      await expect(loi).toContainText('hết chỗ');
      await loi.getByRole('button', { name: 'Đóng' }).click();
      await expect(hopThoai(b, 'Bán vé thành công')).toHaveCount(0);
      // máy B được cập nhật lại số ghế: Hạng 1 hết chỗ
      await expect(b.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 1/ })).toBeDisabled();
      expect(await docCsdl('VE', 'MaChuyenBay', cb.maChuyenBay)).toHaveLength(1);
      await xemCsdl(a, `chuyến bay ${cb.maChuyenBay} chỉ có 1 vé Hạng 1`, { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1, dung: { MaHangVe: 'H1' } });
    } finally {
      await mayA.close();
      await mayB.close();
    }
  });

  test('UC04.16 Chuyến bay có hạng 0 ghế: hạng đó không hiện hoặc không chọn được (giả định 12)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({
      gheTheoHang: [
        { maHangVe: 'H1', soLuongGhe: 0 },
        { maHangVe: 'H2', soLuongGhe: 3 },
      ],
    });
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const nhom = page.getByRole('radiogroup', { name: 'Hạng vé' });
    await expect(nhom.getByRole('radio', { name: /^Hạng 2/ })).toBeEnabled();
    const hang1 = nhom.getByRole('radio', { name: /^Hạng 1/ });
    const soO = await hang1.count();
    expect(soO === 0 || (await hang1.isDisabled()), 'Hạng 1 không hiện hoặc bị khóa').toBeTruthy();
  });

  test('UC04.17 Ô Giá tiền tự tính, không sửa tay được, đổi ngay khi đổi hạng (TD02)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({ giaVe: 1_000_000 });
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    const gia = form.getByRole('status');
    await expect(form.getByRole('textbox', { name: 'Giá tiền' })).toHaveCount(0);
    expect(await gia.evaluate((o) => ({ the: o.tagName, sua: (o as HTMLElement).isContentEditable }))).toEqual({ the: 'OUTPUT', sua: false });
    // bấm vào rồi gõ phím: giá tiền không đổi
    await gia.click();
    await page.keyboard.type('999');
    await expect(gia).toHaveAttribute('aria-label', /^0 ₫$/);
    await chonHang(page, 'Hạng 2');
    await expect(gia).toHaveAttribute('aria-label', /^1\.000\.000 ₫$/, { timeout: 1000 });
    await chonHang(page, 'Hạng 1');
    await expect(gia).toHaveAttribute('aria-label', /^1\.050\.000 ₫$/, { timeout: 1000 });
    await expect(form).toContainText('x 105%');
  });

  test('UC04.18 Hạng vé mới thêm ở UC08 với tỉ lệ 120%: có để chọn, giá bằng 120% đơn giá (TH05, QĐ2)', async ({ page }) => {
    const maHang = ('T' + (Date.now() % 36 ** 4).toString(36).toUpperCase().padStart(4, '0')).slice(0, 5);
    const tenHang = `Hạng thử ${maHang}`;
    // chuẩn bị đăng nhập trước để hạng vé thử tồn tại ít thời gian nhất
    const api = await ApiThu.moi();
    const ql = await phienQuanLy();
    await dangNhap(page, 'nhanVien', '/');
    let maChuyenBay: string | undefined;
    try {
      const ph = await ql.post('/api/hang-ve', { data: { maHangVe: maHang, tenHangVe: tenHang, tiLeDonGia: 120 } });
      expect(ph.ok(), await ph.text()).toBeTruthy();
      const cb = await api.themChuyenBay({
        giaVe: 1_000_000,
        gheTheoHang: [
          { maHangVe: 'H2', soLuongGhe: 3 },
          { maHangVe: maHang, soLuongGhe: 2 },
        ],
      });
      maChuyenBay = cb.maChuyenBay;
      await page.goto(`/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
      const form = bieuMau(page);
      await expect(page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: new RegExp(`^${tenHang}`) })).toBeEnabled();
      await chonHang(page, tenHang);
      await expect(form.getByRole('status')).toHaveAttribute('aria-label', /^1\.200\.000 ₫$/);
      await expect(form).toContainText('x 120%');
      const tt = await (await page.request.get(`/api/chuyen-bay/${cb.maChuyenBay}/thong-tin-ban`)).json();
      expect(JSON.stringify(tt)).toContain(maHang);
    } finally {
      // xóa chuyến bay thử (chưa có vé) trước, rồi xóa hạng vé thử
      if (maChuyenBay) await ql.delete(`/api/chuyen-bay/${maChuyenBay}`);
      await api.xoaHangVeNeuCo(maHang);
      await api.dong();
      await ql.dispose();
    }
    expect(await docCsdl('HANGVE', 'MaHangVe', maHang), 'hạng vé thử đã được dọn').toHaveLength(0);
  });

  test('UC04.19 Bán vé từ phiếu, tìm theo mã phiếu đặt (TD02)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H2', hanhKhachMoi('Châu Thị Mã Phiếu'));
    await api.dong();
    await dangNhap(page, 'nhanVien', '/ban-ve');
    await page.getByRole('tab', { name: 'Bán từ phiếu đặt chỗ' }).click();
    await page.getByRole('tab', { name: 'Theo mã phiếu đặt' }).click();
    await page.getByRole('textbox', { name: 'Mã phiếu đặt' }).fill(maPhieuDat);
    await page.getByRole('button', { name: 'Tìm phiếu' }).click();
    const bang = page.getByRole('table', { name: 'Phiếu đặt chỗ còn hạn' });
    await expect(bang.locator('tbody tr')).toHaveCount(1);
    await bang.getByRole('row').filter({ hasText: maPhieuDat }).click();
    await page.getByRole('button', { name: 'Bán vé từ phiếu' }).click();
    await bamTrongHopThoai(page, `Bán vé từ phiếu ${maPhieuDat}?`, 'Bán vé');
    const kq = hopThoai(page, 'Bán vé thành công');
    await expect(kq).toContainText(`Đã lập vé từ phiếu đặt chỗ ${maPhieuDat}`);
    const maVe = (await kq.getByText(/^VE\d{8}$/).textContent())!.trim();
    await xemCsdl(page, `vé ${maVe} lập từ phiếu ${maPhieuDat}`,
      { bang: 'VE', cot: 'MaVe', giaTri: maVe, soDong: 1, dung: { MaPhieuDat: maPhieuDat, TinhTrang: 'Đã bán' } },
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieuDat, soDong: 1, dung: { TinhTrang: 'Đã hủy' } });
  });

  test('UC04.20 Phiếu đã hủy hoặc đã hết hạn không hiện trong danh sách còn hạn để bán (giả định 5, 7)', async ({ page }) => {
    const api = await ApiThu.moi();
    const thamSoCu = await api.thamSo();
    const n = thamSoCu.thoiGianDatVeChamNhat;
    const cb = await api.themChuyenBay();
    const hkHuy = hanhKhachMoi('Phiếu Đã Hủy');
    const { maPhieuDat: phieuHuy } = await api.datVe(cb.maChuyenBay, 'H2', hkHuy);
    // chuyến bay khởi hành sau đúng n ngày: vẫn đặt được, mốc hủy theo QĐ3 là 0 giờ ngày khởi hành trừ thời gian hủy
    const cbSat = await api.themChuyenBay({ lechNgay: n });
    const { maPhieuDat: phieuHet } = await api.datVe(cbSat.maChuyenBay, 'H2', hanhKhachMoi('Phiếu Hết Hạn'));
    await dangNhap(page, 'nhanVien', '/ban-ve');
    expect((await page.request.post(`/api/phieu-dat/${phieuHuy}/huy`)).ok()).toBeTruthy();

    await page.getByRole('tab', { name: 'Bán từ phiếu đặt chỗ' }).click();
    const rong = page.getByText('Không có phiếu đặt chỗ còn hạn');
    // phiếu đã hủy: tìm theo CCCD và theo mã đều không ra
    await page.getByRole('tab', { name: 'Theo CCCD/Hộ chiếu' }).click();
    await page.getByRole('textbox', { name: 'CCCD/Hộ chiếu của hành khách' }).fill(hkHuy.soGiayTo);
    await page.getByRole('button', { name: 'Tìm phiếu' }).click();
    await expect(rong).toBeVisible();
    await page.getByRole('tab', { name: 'Theo mã phiếu đặt' }).click();
    const oMa = page.getByRole('textbox', { name: 'Mã phiếu đặt' });
    await oMa.fill(phieuHuy);
    await page.getByRole('button', { name: 'Tìm phiếu' }).click();
    await expect(rong).toBeVisible();

    // phiếu còn hạn thì hiện
    await oMa.fill(phieuHet);
    await page.getByRole('button', { name: 'Tìm phiếu' }).click();
    await expect(page.getByRole('table', { name: 'Phiếu đặt chỗ còn hạn' }).getByRole('row').filter({ hasText: phieuHet })).toHaveCount(1);

    // phiếu hết hạn: tạm tăng thời gian hủy đặt vé lên n ngày để mốc hủy của chuyến bay là 0 giờ hôm nay
    // (thời gian hủy phải nhỏ hơn thời gian đặt chậm nhất nên tăng thời gian đặt chậm nhất trước)
    try {
      await api.doiThamSo('thoiGianDatVeChamNhat', n + 1);
      await api.doiThamSo('thoiGianHuyDatVe', n);
      await page.getByRole('button', { name: 'Tìm phiếu' }).click();
      await expect(rong).toBeVisible();
      const ph = await page.request.post('/api/ve/tu-phieu', { data: { maPhieuDat: phieuHet } });
      expect(ph.status()).toBe(409);
    } finally {
      await api.doiThamSo('thoiGianHuyDatVe', thamSoCu.thoiGianHuyDatVe);
      await api.doiThamSo('thoiGianDatVeChamNhat', n);
      await api.dong();
    }
    await xemCsdl(page, `không có vé nào được lập từ phiếu ${phieuHuy}, ${phieuHet}`,
      { bang: 'VE', cot: 'MaPhieuDat', giaTri: phieuHuy, soDong: 0 },
      { bang: 'VE', cot: 'MaPhieuDat', giaTri: phieuHet, soDong: 0 });
  });

  test('UC04.21 Bán từ cùng một phiếu lần thứ hai ở tab khác: bị từ chối (giả định 5)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H2', hanhKhachMoi('Tạ Văn Hai Tab'));
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maPhieuDat=${maPhieuDat}`);
    const tab2 = await page.context().newPage();
    await tab2.goto(`/ban-ve?maPhieuDat=${maPhieuDat}`);
    // cả hai tab cùng thấy phiếu còn hạn và mở hộp xác nhận
    for (const p of [page, tab2]) {
      await expect(p.getByRole('table', { name: 'Phiếu đặt chỗ còn hạn' }).getByRole('row').filter({ hasText: maPhieuDat })).toHaveCount(1);
      await p.getByRole('button', { name: 'Bán vé từ phiếu' }).click();
      await expect(hopThoai(p, `Bán vé từ phiếu ${maPhieuDat}?`)).toBeVisible();
    }
    await bamTrongHopThoai(page, `Bán vé từ phiếu ${maPhieuDat}?`, 'Bán vé');
    await expect(hopThoai(page, 'Bán vé thành công')).toBeVisible();
    await bamTrongHopThoai(tab2, `Bán vé từ phiếu ${maPhieuDat}?`, 'Bán vé');
    await expect(hopThoai(tab2, 'Không thể bán vé')).toContainText('không còn hạn');
    await expect(hopThoai(tab2, 'Bán vé thành công')).toHaveCount(0);
    expect(await docCsdl('VE', 'MaPhieuDat', maPhieuDat)).toHaveLength(1);
    await xemCsdl(page, `phiếu ${maPhieuDat} chỉ thành đúng 1 vé`, { bang: 'VE', cot: 'MaPhieuDat', giaTri: maPhieuDat, soDong: 1 });
    await tab2.close();
  });

  test('UC04.22 Số ghế trống trước và sau khi bán từ phiếu không đổi (giả định 2, 5)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H2', hanhKhachMoi('Kiều Thị Giữ Ghế'));
    await api.dong();
    const hang2 = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 2/ });
    // 5 ghế Hạng 2, phiếu đang giữ 1 ghế
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await expect(hang2).toHaveAttribute('title', /^Hạng 2: 4 ghế trống/);

    await page.goto(`/ban-ve?maPhieuDat=${maPhieuDat}`);
    await expect(page.getByRole('button', { name: 'Bán vé từ phiếu' })).toBeEnabled();
    await page.getByRole('button', { name: 'Bán vé từ phiếu' }).click();
    await bamTrongHopThoai(page, `Bán vé từ phiếu ${maPhieuDat}?`, 'Bán vé');
    await expect(hopThoai(page, 'Bán vé thành công')).toBeVisible();

    await page.goto(`/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await expect(hang2).toHaveAttribute('title', /^Hạng 2: 4 ghế trống/);
    await xemCsdl(page, `phiếu ${maPhieuDat} đã thành vé, chuyến bay vẫn chỉ có 1 chỗ bị chiếm`,
      { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1, dung: { MaPhieuDat: maPhieuDat } },
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieuDat, soDong: 1, dung: { TinhTrang: 'Đã hủy' } });
  });

  test('UC04.23 Tra cứu vé theo mã vé, CCCD, chuyến bay; không có kết quả thì thông báo (BMT04)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const hk1 = hanhKhachMoi('Ông Văn Tra Một');
    const hk2 = hanhKhachMoi('Bà Thị Tra Hai');
    const { maVe: ve1 } = await api.banVe(cb.maChuyenBay, 'H2', hk1);
    const { maVe: ve2 } = await api.banVe(cb.maChuyenBay, 'H1', hk2);
    await api.dong();
    const bang = page.getByRole('table', { name: 'Danh sách vé' });
    const tim = () => page.getByRole('button', { name: 'Tìm', exact: true }).click();

    // theo mã vé
    await dangNhap(page, 'nhanVien', '/ve');
    await page.getByRole('textbox', { name: 'Mã vé' }).fill(ve1);
    await tim();
    await expect(bang.locator('tbody tr')).toHaveCount(1);
    await expect(bang.locator('tbody tr')).toContainText(ve1);

    // theo CCCD
    await page.goto('/ve');
    await page.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(hk2.soGiayTo);
    await tim();
    await expect(bang.locator('tbody tr')).toHaveCount(1);
    await expect(bang.locator('tbody tr')).toContainText(ve2);
    await expect(bang.locator('tbody tr')).toContainText(hk2.hoTen);

    // theo chuyến bay
    await page.goto('/ve');
    await chonTrongOChon(page.getByRole('combobox', { name: 'Chuyến bay' }), cb.maChuyenBay, new RegExp(cb.maChuyenBay));
    await tim();
    await expect(bang.locator('tbody tr')).toHaveCount(2);
    await expect(bang.getByRole('row').filter({ hasText: ve1 })).toHaveCount(1);
    await expect(bang.getByRole('row').filter({ hasText: ve2 })).toHaveCount(1);

    // không có kết quả
    await page.goto('/ve');
    await page.getByRole('textbox', { name: 'Mã vé' }).fill('VE99999999');
    await tim();
    await expect(page.getByText('Không tìm thấy vé')).toBeVisible();
    await expect(bang.locator('tbody tr')).toHaveCount(0);
  });

  test('UC04.24 Màn hình Sửa vé: chuyến bay và hạng vé không sửa được, chỉ sửa thông tin hành khách (giả định 8)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maVe } = await api.banVe(cb.maChuyenBay, 'H1', hanhKhachMoi('Lục Văn Sửa Vé'));
    await api.dong();
    await dangNhap(page, 'nhanVien', '/ve');
    const dong = await timVe(page, maVe);
    await dong.getByRole('button', { name: `Sửa vé ${maVe}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sửa vé' })).toBeVisible();
    const form = bieuMau(page);
    const oCb = form.getByRole('textbox', { name: 'Chuyến bay' });
    await expect(oCb).toHaveValue(new RegExp(cb.maChuyenBay));
    await expect(oCb).not.toBeEditable();
    await expect(form.getByRole('textbox', { name: 'Hạng vé' })).toHaveValue('Hạng 1');
    await expect(form.getByRole('textbox', { name: 'Hạng vé' })).not.toBeEditable();
    await expect(form.getByRole('combobox', { name: 'Chuyến bay' })).toHaveCount(0);
    await expect(form.getByRole('radiogroup', { name: 'Hạng vé' })).toHaveCount(0);
    await expect(form.getByRole('status')).toHaveAttribute('aria-label', /^1\.050\.000 ₫$/);
    for (const ten of ['Hành khách', 'CCCD/Hộ chiếu', 'Điện thoại']) await expect(form.getByRole('textbox', { name: ten })).toBeEditable();
    await expect(form.getByRole('combobox', { name: 'Loại giấy tờ' })).toBeEnabled();
  });

  test('UC04.25 Sửa tên hành khách ở một vé: các vé và phiếu khác của hành khách đó cũng hiện tên mới (giả định 8)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const hk = hanhKhachMoi('Phùng Văn Tên Cũ');
    const { maVe: ve1 } = await api.banVe(cb.maChuyenBay, 'H2', hk);
    const { maVe: ve2 } = await api.banVe(cb.maChuyenBay, 'H2', hk);
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H1', hk);
    await api.dong();
    await dangNhap(page, 'nhanVien', '/ve');
    const dong = await timVe(page, ve1);
    await dong.getByRole('button', { name: `Sửa vé ${ve1}` }).click();
    await bieuMau(page).getByRole('textbox', { name: 'Hành khách' }).fill('Phùng Văn Tên Mới');
    await bieuMau(page).getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(toast(page, `Đã cập nhật thông tin hành khách của vé ${ve1}`)).toBeVisible();

    await page.goto('/ve');
    await page.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(hk.soGiayTo);
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    const bangVe = page.getByRole('table', { name: 'Danh sách vé' });
    await expect(bangVe.locator('tbody tr')).toHaveCount(2);
    for (const ma of [ve1, ve2]) await expect(bangVe.getByRole('row').filter({ hasText: ma })).toContainText('Phùng Văn Tên Mới');

    await page.goto('/phieu-dat');
    await page.getByRole('textbox', { name: 'Mã phiếu đặt' }).fill(maPhieuDat);
    await page.getByRole('combobox', { name: 'Tình trạng' }).selectOption('');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Danh sách phiếu đặt chỗ' }).getByRole('row').filter({ hasText: maPhieuDat })).toContainText('Phùng Văn Tên Mới');
    await xemCsdl(page, 'hành khách dùng chung cho 2 vé và 1 phiếu đã đổi tên',
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: hk.soGiayTo, soDong: 1, dung: { HoTen: 'Phùng Văn Tên Mới' } });
  });

  test('UC04.26 Sửa số giấy tờ trùng với một hành khách khác: báo lỗi trùng giấy tờ (giả định 9)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const hk1 = hanhKhachMoi('Quách Văn Một');
    const hk2 = hanhKhachMoi('Quách Thị Hai');
    const { maVe } = await api.banVe(cb.maChuyenBay, 'H2', hk1);
    await api.banVe(cb.maChuyenBay, 'H2', hk2);
    await api.dong();
    await dangNhap(page, 'nhanVien', '/ve');
    const dong = await timVe(page, maVe);
    await dong.getByRole('button', { name: `Sửa vé ${maVe}` }).click();
    const form = bieuMau(page);
    await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(hk2.soGiayTo);
    await form.getByRole('button', { name: 'Lưu', exact: true }).click();
    const loi = hopThoai(page, 'Không thể lưu thay đổi');
    await expect(loi).toContainText('Số giấy tờ này đã thuộc một hành khách khác.');
    await loi.getByRole('button', { name: 'Đóng' }).click();
    // vẫn ở màn hình sửa, chưa lưu
    await expect(page.getByRole('heading', { level: 1, name: 'Sửa vé' })).toBeVisible();
    await expect(toast(page, `Đã cập nhật thông tin hành khách của vé ${maVe}`)).toHaveCount(0);
    // dữ liệu hai hành khách giữ nguyên
    expect((await docCsdl('HANHKHACH', 'SoGiayTo', hk1.soGiayTo))[0]?.HoTen).toBe(hk1.hoTen);
    expect((await docCsdl('HANHKHACH', 'SoGiayTo', hk2.soGiayTo))[0]?.HoTen).toBe(hk2.hoTen);
    await xemCsdl(page, 'hành khách của vé không bị đổi sang giấy tờ của người khác',
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: hk1.soGiayTo, soDong: 1, dung: { HoTen: hk1.hoTen } },
      { bang: 'HANHKHACH', cot: 'SoGiayTo', giaTri: hk2.soGiayTo, soDong: 1, dung: { HoTen: hk2.hoTen } });
  });

  test('UC04.27 Hủy vé của chuyến bay đã khởi hành: không cho hủy (giả định 8)', async ({ page }) => {
    await dangNhap(page, 'nhanVien', '/ve');
    // vé Đã bán của chuyến bay đã khởi hành trong dữ liệu mẫu (chỉ đọc, không sửa)
    const bayGio = mocVN(0);
    const dsVe = await page.request.get(`/api/ve?tuNgay=2000-01-01&denNgay=${bayGio.iso}`);
    expect(dsVe.ok(), 'đọc danh sách vé mẫu').toBeTruthy();
    const ds = (await dsVe.json()) as {
      maVe: string;
      tinhTrang: string;
      ngayGioKhoiHanh: string;
    }[];
    const ve = ds.find((v) => v.tinhTrang === 'DaBan' && v.ngayGioKhoiHanh < bayGio.isoGio);
    if (!ve) throw new Error('Dữ liệu mẫu thiếu vé Đã bán của chuyến bay đã khởi hành');
    const { maVe } = ve;

    await page.getByRole('textbox', { name: 'Mã vé' }).fill(maVe);
    await nhapNgay(page, 'Từ ngày', '');
    await nhapNgay(page, 'Đến ngày', '');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    const dong = page.getByRole('table', { name: 'Danh sách vé' }).getByRole('row').filter({ hasText: maVe });
    await expect(dong).toContainText('Đã bán');
    const nut = dong.getByRole('button', { name: 'Hủy vé' });
    await expect(nut).toBeDisabled();
    await expect(nut).toHaveAttribute('title', 'Chuyến bay đã khởi hành, không hủy được');
    // máy chủ cũng từ chối
    const ph = await page.request.post(`/api/ve/${maVe}/huy`);
    expect(ph.status()).toBe(409);
    expect(await ph.text()).toContain('CHUYEN_BAY_DA_KHOI_HANH');
    await xemCsdl(page, `vé ${maVe} vẫn Đã bán`, { bang: 'VE', cot: 'MaVe', giaTri: maVe, soDong: 1, dung: { TinhTrang: 'Đã bán' } });
  });

  test('UC04.28 Bấm Hủy vé rồi chọn Không: vé giữ nguyên Đã bán (xác nhận thao tác xóa)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maVe } = await api.banVe(cb.maChuyenBay, 'H2');
    await api.dong();
    await dangNhap(page, 'nhanVien', '/ve');
    const dong = await timVe(page, maVe);
    await dong.getByRole('button', { name: 'Hủy vé' }).click();
    await bamTrongHopThoai(page, `Hủy vé ${maVe}?`, 'Không');
    await expect(toast(page, `Đã hủy vé ${maVe}`)).toHaveCount(0);
    await expect(dong).toContainText('Đã bán');
    await expect(dong.getByRole('button', { name: 'Hủy vé' })).toBeEnabled();
    const dongMoi = await timVe(page, maVe);
    await expect(dongMoi).toContainText('Đã bán');
    await xemCsdl(page, `vé ${maVe} vẫn Đã bán`, { bang: 'VE', cot: 'MaVe', giaTri: maVe, soDong: 1, dung: { TinhTrang: 'Đã bán' } });
  });

  test('UC04.29 Bấm Bán vé trong hộp xác nhận hai lần thật nhanh: chỉ lập 1 vé (Chương 7, tr. 46)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await nhapHanhKhach(page, 'Vũ Văn Bấm Hai Lần', soCanCuocMoi());
    await chonHang(page, 'Hạng 2');
    await bieuMau(page).getByRole('button', { name: 'Bán vé', exact: true }).click();
    const hoi = hopThoai(page, 'Xác nhận bán vé?');
    await hoi.getByRole('button', { name: 'Bán vé', exact: true }).dblclick();
    await expect(hopThoai(page, 'Bán vé thành công')).toBeVisible();
    // chờ thêm cho yêu cầu thứ hai (nếu có) kịp ghi xuống CSDL
    await page.waitForTimeout(1500);
    await expect(hopThoai(page, 'Bán vé thành công')).toHaveCount(1);
    expect(await docCsdl('VE', 'MaChuyenBay', cb.maChuyenBay)).toHaveLength(1);
    await xemCsdl(page, `chuyến bay ${cb.maChuyenBay} chỉ có 1 vé`, { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1 });
  });
  test('UC04.30 Đang nhập dở ở màn hình Bán vé mà bấm menu khác thì hỏi xác nhận; chọn Tiếp tục nhập thì giữ thông tin, chọn Rời trang thì sang trang mới (B5, Ch.5 nguyên lý khôi phục)', async ({ page }) => {
    await dangNhap(page, 'nhanVien', '/ban-ve');
    await nhapHanhKhach(page, 'Lý Văn Nhập Dở', soCanCuocMoi());
    const menu = page.getByRole('navigation', { name: 'Menu chính' });
    await menu.getByRole('link', { name: 'Chuyến bay', exact: true }).click();
    const hoi = hopThoai(page, 'Rời trang khi chưa lưu?');
    await expect(hoi).toBeVisible();
    await hoi.getByRole('button', { name: 'Tiếp tục nhập' }).click();
    await expect(hoi).toHaveCount(0);
    await expect(page).toHaveURL(/\/ban-ve/);
    await expect(bieuMau(page).getByRole('textbox', { name: 'Hành khách' })).toHaveValue('Lý Văn Nhập Dở');
    await menu.getByRole('link', { name: 'Chuyến bay', exact: true }).click();
    await hopThoai(page, 'Rời trang khi chưa lưu?').getByRole('button', { name: 'Rời trang' }).click();
    await expect(page).toHaveURL(/\/chuyen-bay/);
  });
});

