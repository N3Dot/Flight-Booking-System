// Bổ sung kịch bản đầu cuối: mỗi kịch bản đi xuyên nhiều use case như một ngày làm việc ở phòng vé.
// KB.1 vòng đời chuyến bay, phiếu, vé tới báo cáo; KB.2 đổi QĐ1, QĐ3 rồi trả lại; KB.3 tài khoản Nhân viên mới từ lúc tạo tới lúc bị khóa.
import { expect, test, xemCsdl, type Browser, type Locator, type Page } from '../tien_ich/trinh_dien';
import {
  ApiThu,
  DIA_CHI,
  bamTrongHopThoai,
  chonTrongOChon,
  dangNhap,
  dangNhapGiaoDien,
  hanhKhachMoi,
  hopThoai,
  maMoi,
  mocVN,
  nhapNgay,
  tenDangNhapMoi,
  toast,
  khoaTaiKhoanThuSauMoiCa,
  type HanhKhachThu,
} from '../tien_ich/chung';

const MAT_KHAU = 'Kiemthu@123';

/** Giá trị mặc định của bảng THAMSOQUYDINH trong dữ liệu mẫu. */
const MAC_DINH: Record<string, number> = { thoiGianBayToiThieu: 30, thoiGianDatVeChamNhat: 1 };

/* ---------------- chuyến bay ---------------- */

/** Điền biểu mẫu thêm chuyến bay; mọi hạng vé khác H1, H2 (nếu có) để 0 ghế. */
async function dienChuyenBay(page: Page, d: { ma: string; ngayGio: string; thoiGianBay: number; gheH1: number; gheH2: number }) {
  await page.getByRole('textbox', { name: 'Mã chuyến bay' }).fill(d.ma);
  await page.getByRole('textbox', { name: 'Giá vé (VND)' }).fill('1000000');
  await chonTrongOChon(page.getByRole('combobox', { name: 'Sân bay đi' }), 'SGN', /^SGN/);
  await chonTrongOChon(page.getByRole('combobox', { name: 'Sân bay đến' }), 'HAN', /^HAN/);
  await nhapNgay(page, 'Ngày giờ khởi hành', d.ngayGio);
  await page.getByRole('textbox', { name: 'Thời gian bay (phút)' }).fill(String(d.thoiGianBay));
  for (const o of await page.locator('input[aria-label^="Số lượng ghế "]').all()) await o.fill('0');
  await page.getByLabel('Số lượng ghế Hạng 1', { exact: true }).fill(String(d.gheH1));
  await page.getByLabel('Số lượng ghế Hạng 2', { exact: true }).fill(String(d.gheH2));
}

/** Mở trang xem chuyến bay (BM4) và so số đã bán và đặt, số ghế còn trống của từng hạng; đối chiếu thêm với máy chủ. */
async function kiemGhe(page: Page, ma: string, mong: Record<'H1' | 'H2', [daBanVaDat: number, conTrong: number]>) {
  await page.goto(`/chuyen-bay/${ma}`);
  const vung = page.getByRole('region', { name: 'Số lượng ghế theo hạng vé' });
  for (const [hang, [daDung, trong]] of Object.entries(mong)) {
    const dong = vung.locator('tbody tr').filter({ has: page.getByText(hang, { exact: true }) });
    await expect(dong.locator('td').nth(3), `${hang} đã bán và đặt`).toHaveText(String(daDung));
    await expect(dong.locator('td').nth(4), `${hang} còn trống`).toContainText(`${trong} ghế`);
  }
  const cb = await (await page.request.get(`/api/chuyen-bay/${ma}`)).json();
  for (const [hang, [daDung, trong]] of Object.entries(mong)) {
    const g = cb.gheTheoHang.find((x: { maHangVe: string }) => x.maHangVe === hang);
    expect(g, `máy chủ: ghế ${hang}`).toMatchObject({ soDaBanVaDat: daDung, soGheTrong: trong });
  }
}

async function tinhTrangPhieu(page: Page, maPhieu: string): Promise<string> {
  const ds = await (await page.request.get(`/api/phieu-dat?maPhieuDat=${maPhieu}`)).json();
  return JSON.stringify(ds).match(/"tinhTrang":"(\w+)"/)?.[1] ?? '';
}

async function tinhTrangVe(page: Page, maVe: string): Promise<string> {
  const ds = await (await page.request.get(`/api/ve?maVe=${maVe}`)).json();
  return JSON.stringify(ds).match(/"tinhTrang":"(\w+)"/)?.[1] ?? '';
}

/* ---------------- bán vé, đặt vé ---------------- */

async function chonHang(page: Page, tenHang: string) {
  const o = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: new RegExp(`^${tenHang}`) });
  await page.locator('label').filter({ has: o }).or(o).first().click();
  await expect(o).toBeChecked();
}

async function nhapHanhKhach(form: Locator, hk: HanhKhachThu) {
  await form.getByRole('textbox', { name: 'Hành khách' }).fill(hk.hoTen);
  await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(hk.soGiayTo);
  await form.getByRole('textbox', { name: 'Điện thoại' }).fill(hk.dienThoai);
}

/** Đóng hộp thoại kết quả (bán vé, đặt vé thành công). */
async function dongKetQua(kq: Locator) {
  await kq.getByRole('button').last().press('Escape');
  await expect(kq).toBeHidden();
}

async function datPhieu(page: Page, ma: string, hk: HanhKhachThu, tenHang = 'Hạng 2'): Promise<string> {
  await page.goto(`/dat-ve?maChuyenBay=${ma}`);
  await expect(page.getByRole('combobox', { name: 'Chuyến bay' })).toHaveValue(new RegExp(ma));
  const form = page.getByRole('form');
  await nhapHanhKhach(form, hk);
  await chonHang(page, tenHang);
  await form.getByRole('button', { name: 'Đặt vé', exact: true }).click();
  await bamTrongHopThoai(page, 'Xác nhận đặt vé?', 'Đặt vé');
  const kq = hopThoai(page, 'Đặt vé thành công');
  await expect(kq).toContainText('Chờ thanh toán');
  const maPhieu = (await kq.getByText(/^PD\d{8}$/).textContent())!.trim();
  await dongKetQua(kq);
  return maPhieu;
}

async function banTrucTiep(page: Page, ma: string, hk: HanhKhachThu, tenHang: string): Promise<string> {
  await page.goto(`/ban-ve?maChuyenBay=${ma}`);
  await expect(page.getByRole('combobox', { name: 'Chuyến bay' })).toHaveValue(new RegExp(ma));
  const form = page.getByRole('form', { name: 'Vé chuyến bay BM2' });
  await nhapHanhKhach(form, hk);
  await chonHang(page, tenHang);
  await form.getByRole('button', { name: 'Bán vé', exact: true }).click();
  await bamTrongHopThoai(page, 'Xác nhận bán vé?', 'Bán vé');
  const kq = hopThoai(page, 'Bán vé thành công');
  await expect(kq).toBeVisible();
  const maVe = (await kq.getByText(/^VE\d{8}$/).textContent())!.trim();
  await dongKetQua(kq);
  return maVe;
}

async function banTuPhieu(page: Page, hk: HanhKhachThu, maPhieu: string): Promise<string> {
  await page.goto('/ban-ve');
  await page.getByRole('tab', { name: 'Bán từ phiếu đặt chỗ' }).click();
  await page.getByRole('tab', { name: 'Theo CCCD/Hộ chiếu' }).click();
  await page.getByRole('textbox', { name: 'CCCD/Hộ chiếu của hành khách' }).fill(hk.soGiayTo);
  await page.getByRole('button', { name: 'Tìm phiếu' }).click();
  await page.getByRole('table', { name: 'Phiếu đặt chỗ còn hạn' }).getByRole('row').filter({ hasText: maPhieu }).click();
  await page.getByRole('button', { name: 'Bán vé từ phiếu' }).click();
  await bamTrongHopThoai(page, `Bán vé từ phiếu ${maPhieu}?`, 'Bán vé');
  const kq = hopThoai(page, 'Bán vé thành công');
  await expect(kq).toContainText(`Đã lập vé từ phiếu đặt chỗ ${maPhieu}`);
  const maVe = (await kq.getByText(/^VE\d{8}$/).textContent())!.trim();
  await dongKetQua(kq);
  return maVe;
}

async function timVe(page: Page, maVe: string) {
  await page.goto('/ve');
  await page.getByRole('textbox', { name: 'Mã vé' }).fill(maVe);
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  const dong = page.getByRole('table', { name: 'Danh sách vé' }).getByRole('row').filter({ hasText: maVe });
  await expect(dong).toHaveCount(1);
  return dong;
}

async function huyVe(page: Page, maVe: string) {
  const dong = await timVe(page, maVe);
  await dong.getByRole('button', { name: 'Hủy vé' }).click();
  await bamTrongHopThoai(page, `Hủy vé ${maVe}?`, 'Hủy vé');
  await expect(toast(page, `Đã hủy vé ${maVe}`)).toBeVisible();
  await expect(dong).toContainText('Đã hủy');
}

async function timPhieu(page: Page, maPhieu: string) {
  await page.goto('/phieu-dat');
  await page.getByRole('textbox', { name: 'Mã phiếu đặt' }).fill(maPhieu);
  await page.getByRole('combobox', { name: 'Tình trạng' }).selectOption('');
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  const dong = page.getByRole('table', { name: 'Danh sách phiếu đặt chỗ' }).getByRole('row').filter({ hasText: maPhieu });
  await expect(dong).toHaveCount(1);
  return dong;
}

async function huyPhieu(page: Page, maPhieu: string) {
  const dong = await timPhieu(page, maPhieu);
  await dong.getByRole('button', { name: `Hủy phiếu ${maPhieu}` }).click();
  await bamTrongHopThoai(page, `Hủy phiếu ${maPhieu}?`, 'Hủy phiếu');
  await expect(toast(page, `Đã hủy phiếu ${maPhieu}`)).toBeVisible();
  await expect(dong).toContainText('Đã hủy');
}

/* ---------------- quy định ---------------- */

async function doiThamSoGiaoDien(page: Page, tieuDe: string, giaTri: number, donVi: string) {
  await page.getByRole('button', { name: new RegExp(`^${tieuDe}: .*Bấm để thay đổi$`) }).click();
  const hop = hopThoai(page, 'Cập nhật quy định');
  await expect(hop).toBeVisible();
  await hop.getByRole('textbox', { name: `Giá trị mới (${donVi})` }).fill(String(giaTri));
  await hop.getByRole('button', { name: 'Lưu' }).click();
  await expect(toast(page, `Cập nhật quy định thành công: ${tieuDe.toLowerCase()} là ${giaTri} ${donVi}.`)).toBeVisible();
  await expect(hop).toBeHidden();
}

/** Đọc giá trị cũ; nếu ca khác đang tạm đổi tham số thì chờ nó trả lại (tối đa 15 giây). */
async function docGiaTriCu(api: ApiThu, cacTen: string[]): Promise<Record<string, number>> {
  let ts = await api.thamSo();
  for (let lan = 0; lan < 30 && cacTen.some((t) => ts[t] !== MAC_DINH[t]); lan++) {
    await new Promise((r) => setTimeout(r, 500));
    ts = await api.thamSo();
  }
  return Object.fromEntries(cacTen.map((t) => [t, ts[t]]));
}

async function traGiaTriCu(api: ApiThu, cu: Record<string, number>) {
  const nay = await api.thamSo();
  for (const t of Object.keys(cu)) if (nay[t] !== cu[t]) await api.doiThamSo(t, cu[t]).catch(() => undefined);
}

/* ---------------- tài khoản ---------------- */

async function dongTaiKhoan(page: Page, ten: string) {
  const o = page.getByRole('textbox', { name: 'Tìm tài khoản' });
  if ((await o.inputValue()) !== ten) await o.fill(ten);
  const dong = page.getByRole('table', { name: 'Danh sách tài khoản' }).getByRole('row').filter({ hasText: ten });
  await expect(dong).toHaveCount(1);
  return dong;
}

/** Trình duyệt thứ hai (phiên riêng) dùng cùng cấu hình với bộ kiểm thử. */
async function moTrinhDuyetKhac(browser: Browser) {
  const ctx = await browser.newContext({
    baseURL: DIA_CHI,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  return { ctx, page: await ctx.newPage() };
}

function bangBaoCao(page: Page) {
  return page.getByRole('region').filter({ has: page.locator('#tieu-de-bang-bao-cao') }).locator('table');
}

test.describe('Bổ sung kịch bản đầu cuối', () => {
  khoaTaiKhoanThuSauMoiCa(test);
  test('KB.1 Thêm chuyến bay, đặt 2 phiếu, bán từ phiếu, hủy phiếu còn lại, hủy một vé, lập báo cáo: số ghế, tình trạng và doanh thu khớp sau từng bước (BM1, BM2, BM3, BM4, BM5.1)', async ({ page }) => {
    test.setTimeout(240_000);
    const ma = maMoi('KB');
    const ngay = mocVN(20, 9, 0);
    const hk1 = hanhKhachMoi('Trần Văn Đặt Một');
    const hk2 = hanhKhachMoi('Lê Thị Đặt Hai');
    const hk3 = hanhKhachMoi('Phạm Văn Mua Thẳng');

    // 1. Quản lý thêm chuyến bay: Hạng 1 có 2 ghế, Hạng 2 có 5 ghế
    await dangNhap(page, 'quanLy', '/chuyen-bay/them');
    await dienChuyenBay(page, { ma, ngayGio: ngay.vnGio, thoiGianBay: 120, gheH1: 2, gheH2: 5 });
    await page.getByRole('button', { name: 'Lưu chuyến bay' }).click();
    await expect(toast(page, `Thêm chuyến bay ${ma} thành công.`)).toBeVisible();
    await kiemGhe(page, ma, { H1: [0, 2], H2: [0, 5] });

    // 2. Nhân viên đặt 2 phiếu Hạng 2
    await dangNhap(page, 'nhanVien', '/');
    const pd1 = await datPhieu(page, ma, hk1);
    const pd2 = await datPhieu(page, ma, hk2);
    expect(await tinhTrangPhieu(page, pd1)).toBe('ChoThanhToan');
    expect(await tinhTrangPhieu(page, pd2)).toBe('ChoThanhToan');
    await kiemGhe(page, ma, { H1: [0, 2], H2: [2, 3] });

    // 3. Khách thứ nhất đến thanh toán: bán vé từ phiếu, ghế vẫn giữ cho khách
    const ve1 = await banTuPhieu(page, hk1, pd1);
    expect(await tinhTrangPhieu(page, pd1)).toBe('DaHuy');
    expect(await tinhTrangVe(page, ve1)).toBe('DaBan');
    await kiemGhe(page, ma, { H1: [0, 2], H2: [2, 3] });

    // 4. Phiếu còn lại bị hủy: trả 1 ghế Hạng 2
    await huyPhieu(page, pd2);
    expect(await tinhTrangPhieu(page, pd2)).toBe('DaHuy');
    await kiemGhe(page, ma, { H1: [0, 2], H2: [1, 4] });

    // 5. Một khách mua thẳng vé Hạng 1 rồi đổi ý: vé đó bị hủy, trả ghế Hạng 1
    const ve2 = await banTrucTiep(page, ma, hk3, 'Hạng 1');
    await kiemGhe(page, ma, { H1: [1, 1], H2: [1, 4] });
    await huyVe(page, ve2);
    expect(await tinhTrangVe(page, ve2)).toBe('DaHuy');
    expect(await tinhTrangVe(page, ve1)).toBe('DaBan');
    await kiemGhe(page, ma, { H1: [0, 2], H2: [1, 4] });

    // 6. Quản lý lập báo cáo tháng khởi hành: chỉ tính vé Đã bán (1 vé Hạng 2, 1.000.000 đồng)
    await dangNhap(page, 'quanLy', '/bao-cao');
    await page.getByRole('combobox', { name: 'Tháng' }).selectOption(String(ngay.thang));
    await page.getByRole('combobox', { name: 'Năm' }).selectOption(String(ngay.nam));
    await page.getByRole('button', { name: 'Lập báo cáo' }).click();
    await expect(page.getByText(`Tháng: ${ngay.thang}/${ngay.nam}`)).toBeVisible();
    const dong = bangBaoCao(page).locator('tbody tr').filter({ hasText: ma });
    await expect(dong).toHaveCount(1);
    const o = (await dong.locator('td').allTextContents()).map((x) => x.trim());
    expect(o[2]).toBe('1');
    expect(Number(o[3].replace(/\D/g, ''))).toBe(1_000_000);

    await xemCsdl(page, `chuyến bay ${ma}: vé ${ve1} Đã bán, vé ${ve2} Đã hủy, hai phiếu Đã hủy`,
      { bang: 'VE', cot: 'MaVe', giaTri: ve1, soDong: 1, dung: { MaPhieuDat: pd1, TinhTrang: 'Đã bán', GiaTien: 1000000 } },
      { bang: 'VE', cot: 'MaVe', giaTri: ve2, soDong: 1, dung: { TinhTrang: 'Đã hủy' } },
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: pd1, soDong: 1, dung: { TinhTrang: 'Đã hủy' } },
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: pd2, soDong: 1, dung: { TinhTrang: 'Đã hủy' } },
      { bang: 'GHETHEOHANG', cot: 'MaChuyenBay', giaTri: ma, soDong: 2 });
  });

  test('KB.2 Quản lý đổi QĐ1 và QĐ3, thêm chuyến bay và đặt vé theo quy định mới, trả quy định cũ không ảnh hưởng dữ liệu đã lưu (QĐ1, QĐ3, QĐ6)', async ({ page }) => {
    test.setTimeout(180_000);
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianBayToiThieu', 'thoiGianDatVeChamNhat']);
    const qd1 = cu.thoiGianBayToiThieu + 15;
    const qd3 = cu.thoiGianDatVeChamNhat + 2;
    // chuyến bay gần: đặt được theo QĐ3 cũ, quá hạn theo QĐ3 mới
    const cbGan = await api.themChuyenBay({ lechNgay: qd3 - 1 });
    const ma = maMoi('KB');
    const ngay = mocVN(qd3 + 3, 10, 0);
    const hk = hanhKhachMoi('Đỗ Thị Quy Định');
    try {
      // 1. QĐ1 mới: thời gian bay tối thiểu tăng 15 phút; chuyến bay ngắn hơn bị chặn, đủ thì lưu được
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await doiThamSoGiaoDien(page, 'Thời gian bay tối thiểu', qd1, 'phút');
      await page.goto('/chuyen-bay/them');
      await dienChuyenBay(page, { ma, ngayGio: ngay.vnGio, thoiGianBay: qd1 - 5, gheH1: 2, gheH2: 10 });
      await page.getByRole('button', { name: 'Lưu chuyến bay' }).click();
      await expect(page.getByText(`Thời gian bay phải từ ${qd1} phút trở lên (QĐ1).`)).toBeVisible();
      await expect(page).toHaveURL(/\/chuyen-bay\/them$/);
      await page.getByRole('textbox', { name: 'Thời gian bay (phút)' }).fill(String(qd1));
      await page.getByRole('button', { name: 'Lưu chuyến bay' }).click();
      await expect(toast(page, `Thêm chuyến bay ${ma} thành công.`)).toBeVisible();
      // trả QĐ1 ngay để không ảnh hưởng các ca khác đang chạy
      await api.doiThamSo('thoiGianBayToiThieu', cu.thoiGianBayToiThieu);

      // 2. QĐ3 mới: thời gian chậm nhất khi đặt vé tăng 2 ngày
      await page.goto('/quy-dinh');
      await doiThamSoGiaoDien(page, 'Thời gian chậm nhất khi đặt vé', qd3, 'ngày');
      await dangNhap(page, 'nhanVien', `/dat-ve?maChuyenBay=${cbGan.maChuyenBay}`);
      const canhBao = hopThoai(page, 'Quá thời hạn đặt vé');
      await expect(canhBao).toBeVisible();
      await canhBao.getByRole('button').last().click();
      const maPhieu = await datPhieu(page, ma, hk);
      await api.doiThamSo('thoiGianDatVeChamNhat', cu.thoiGianDatVeChamNhat);

      // 3. Quản lý thấy quy định cũ đã được trả lại; dữ liệu lưu theo quy định mới vẫn giữ nguyên
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await expect(page.getByRole('button', { name: `Thời gian bay tối thiểu: ${cu.thoiGianBayToiThieu} phút. Bấm để thay đổi` })).toBeVisible();
      await expect(page.getByRole('button', { name: `Thời gian chậm nhất khi đặt vé: ${cu.thoiGianDatVeChamNhat} ngày. Bấm để thay đổi` })).toBeVisible();
      await page.goto(`/chuyen-bay/${ma}`);
      await expect(page.getByRole('main')).toContainText(`${qd1} phút`);
      await kiemGhe(page, ma, { H1: [0, 2], H2: [1, 9] });
      expect(await tinhTrangPhieu(page, maPhieu)).toBe('ChoThanhToan');
      // theo QĐ3 cũ, chuyến bay gần lại đặt được
      await dangNhap(page, 'nhanVien', '/');
      const pdGan = await datPhieu(page, cbGan.maChuyenBay, hanhKhachMoi('Đỗ Văn Đặt Lại'));
      expect(await tinhTrangPhieu(page, pdGan)).toBe('ChoThanhToan');

      await xemCsdl(page, `quy định đã trả lại; chuyến bay ${ma} (${qd1} phút) và phiếu ${maPhieu} vẫn giữ nguyên`,
        { bang: 'THAMSOQUYDINH', dung: { ThoiGianBayToiThieu: cu.thoiGianBayToiThieu, ThoiGianDatVeChamNhat: cu.thoiGianDatVeChamNhat } },
        { bang: 'CHUYENBAY', cot: 'MaChuyenBay', giaTri: ma, soDong: 1, dung: { ThoiGianBay: qd1 } },
        { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieu, soDong: 1, dung: { MaChuyenBay: ma, TinhTrang: 'Chờ thanh toán' } });
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('KB.3 Quản lý tạo tài khoản Nhân viên, Nhân viên làm đúng các việc được phép, bị chặn sau khi Quản lý khóa (BMT02 đến BMT09, BMT01)', async ({ page, browser }) => {
    test.setTimeout(240_000);
    const ten = tenDangNhapMoi('kb');
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({ lechNgay: 12 });
    await api.dong();

    // 1. Quản lý tạo tài khoản Nhân viên bán vé
    await dangNhap(page, 'quanLy', '/tai-khoan');
    await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
    const hop = hopThoai(page, 'Thêm tài khoản');
    await hop.getByRole('textbox', { name: 'Tên đăng nhập' }).fill(ten);
    await hop.getByLabel('Mật khẩu', { exact: false }).first().fill(MAT_KHAU);
    await hop.getByLabel('Nhập lại mật khẩu').fill(MAT_KHAU);
    await hop.locator('label:has(input[type="radio"][value="NhanVien"])').click();
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page, `Thêm tài khoản ${ten} thành công.`)).toBeVisible();

    const { ctx, page: nv } = await moTrinhDuyetKhac(browser);
    try {
      // 2. Nhân viên đăng nhập ở trình duyệt khác
      await dangNhapGiaoDien(nv, ten, MAT_KHAU);
      await expect(nv).toHaveURL(/\/$/);
      await expect(nv.getByRole('banner').getByText('Nhân viên bán vé')).toBeVisible();
      const menu = nv.getByRole('navigation', { name: 'Menu chính' });
      for (const muc of ['Chuyến bay', 'Bán vé', 'Đặt vé']) await expect(menu.getByRole('link', { name: muc, exact: true })).toBeVisible();
      for (const muc of ['Báo cáo', 'Quy định', 'Tài khoản']) await expect(menu.getByRole('link', { name: muc, exact: true })).toHaveCount(0);

      // BMT06: tra cứu, xem và xuất danh sách chuyến bay
      await nv.goto('/chuyen-bay');
      await nhapNgay(nv, 'Từ ngày', '');
      await nv.getByRole('textbox', { name: 'Mã chuyến bay' }).fill(cb.maChuyenBay);
      await nv.getByRole('button', { name: 'Tìm', exact: true }).click();
      await expect(nv.getByRole('table', { name: 'Danh sách chuyến bay' }).getByRole('row').filter({ hasText: cb.maChuyenBay })).toHaveCount(1);
      const choTai = nv.waitForEvent('download');
      await nv.getByRole('button', { name: 'Xuất Excel' }).click();
      expect((await choTai).suggestedFilename()).toMatch(/\.xlsx$/);
      await nv.getByRole('button', { name: `Xem chuyến bay ${cb.maChuyenBay}` }).click();
      await expect(nv.getByRole('heading', { level: 1, name: `Chuyến bay ${cb.maChuyenBay}` })).toBeVisible();
      // BMT03 chỉ của Quản lý: không thêm, sửa, xóa chuyến bay
      await nv.goto('/chuyen-bay');
      await expect(nv.getByRole('link', { name: 'Thêm chuyến bay' })).toHaveCount(0);
      await expect(nv.getByRole('button', { name: /^Xóa chuyến bay/ })).toHaveCount(0);
      expect((await nv.request.post('/api/chuyen-bay', { data: {} })).status()).toBe(403);

      // BMT04: bán, tra cứu, sửa, hủy vé
      const hkVe = hanhKhachMoi('Ngô Văn Nhân Viên Mới');
      const maVe = await banTrucTiep(nv, cb.maChuyenBay, hkVe, 'Hạng 2');
      const dongVe = await timVe(nv, maVe);
      await expect(dongVe).toContainText(hkVe.hoTen);
      await dongVe.getByRole('button', { name: `Sửa vé ${maVe}` }).click();
      const formVe = nv.getByRole('form', { name: 'Vé chuyến bay BM2' });
      await formVe.getByRole('textbox', { name: 'Điện thoại' }).fill('0987000111');
      await formVe.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(toast(nv, `Đã cập nhật thông tin hành khách của vé ${maVe}`)).toBeVisible();
      await huyVe(nv, maVe);

      // BMT05: lập, tra cứu, sửa, hủy phiếu đặt chỗ
      const maPhieu = await datPhieu(nv, cb.maChuyenBay, hanhKhachMoi('Ngô Thị Đặt Chỗ'));
      const dongPhieu = await timPhieu(nv, maPhieu);
      await dongPhieu.getByRole('button', { name: `Sửa phiếu ${maPhieu}` }).click();
      await nv.getByRole('form').getByRole('textbox', { name: 'Hành khách' }).fill('Ngô Thị Đã Sửa');
      await nv.getByRole('form').getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(toast(nv, new RegExp(`Đã cập nhật thông tin hành khách của phiếu.*${maPhieu}`))).toBeVisible();
      await huyPhieu(nv, maPhieu);

      // BMT02, BMT07, BMT08, BMT09 chỉ của Quản lý
      for (const duongDan of ['/bao-cao', '/quy-dinh', '/tai-khoan']) {
        await nv.goto(duongDan);
        await expect(nv.getByRole('heading', { name: 'Không có quyền truy cập', level: 1 })).toBeVisible();
      }
      expect((await nv.request.get(`/api/bao-cao/nam?nam=${mocVN(0).nam}`)).status()).toBe(403);
      expect((await nv.request.put('/api/quy-dinh/tham-so/thoiGianBayToiThieu', { data: { giaTriMoi: 30 } })).status()).toBe(403);
      expect((await nv.request.get('/api/tai-khoan')).status()).toBe(403);
      expect((await nv.request.get(`/api/phieu-dat/da-huy/dem?truocNgay=${mocVN(0).iso}`)).status()).toBe(403);

      // 3. Quản lý khóa tài khoản trong lúc Nhân viên vẫn đang mở phần mềm
      await page.goto('/tai-khoan');
      await (await dongTaiKhoan(page, ten)).getByRole('button', { name: 'Khóa', exact: true }).click();
      await bamTrongHopThoai(page, `Khóa tài khoản ${ten}?`, 'Khóa');
      await expect(toast(page, `Đã khóa tài khoản ${ten}.`)).toBeVisible();

      // thao tác kế tiếp của Nhân viên bị chặn và bị đưa về trang đăng nhập
      expect((await nv.request.get(`/api/ve?maVe=${maVe}`)).status()).toBe(401);
      await nv.goto('/ban-ve');
      await expect(nv).toHaveURL(/\/dang-nhap/);
      await dangNhapGiaoDien(nv, ten, MAT_KHAU);
      await expect(nv.getByRole('alert').filter({ hasText: /khóa/i })).toBeVisible();
      await expect(nv).toHaveURL(/\/dang-nhap/);

      await xemCsdl(page, `tài khoản ${ten} đã bị khóa; vé và phiếu do tài khoản này lập đã hủy`,
        { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 1, dung: { NhomQuyen: 'Nhân viên bán vé', TrangThai: 'Đã khóa' } },
        { bang: 'VE', cot: 'MaVe', giaTri: maVe, soDong: 1, dung: { TinhTrang: 'Đã hủy' } },
        { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieu, soDong: 1, dung: { TinhTrang: 'Đã hủy' } });
    } finally {
      await ctx.close();
    }
  });
});
