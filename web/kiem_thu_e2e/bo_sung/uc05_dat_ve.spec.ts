// Bổ sung UC05 Quản lý đặt vé: thời hạn đặt vé (QĐ3), giữ chỗ (giả định 2), hạn thanh toán (giả định 6, 7),
// hủy, lọc, xóa phiếu đã hủy (AT04), kiểm tra thông tin hành khách và bấm hai lần.
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
} from '../tien_ich/chung';

const bieuMau = (page: Page) => page.getByRole('form');

async function nhapHanhKhach(page: Page, hoTen: string, soGiayTo: string, dienThoai = '0912345678') {
  const form = bieuMau(page);
  await form.getByRole('textbox', { name: 'Hành khách' }).fill(hoTen);
  await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill(soGiayTo);
  await form.getByRole('textbox', { name: 'Điện thoại' }).fill(dienThoai);
}

async function chonHang(page: Page, tenHang: string) {
  const o = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: new RegExp(`^${tenHang}`) });
  await page.locator('label').filter({ has: o }).or(o).first().click();
  await expect(o).toBeChecked();
}

/** Bấm Đặt vé, xác nhận, đọc mã phiếu và hạn thanh toán trong hộp thoại kết quả rồi đóng hộp thoại. */
async function datVaLayMa(page: Page): Promise<{ maPhieu: string; han: string }> {
  await bieuMau(page).getByRole('button', { name: 'Đặt vé', exact: true }).click();
  await bamTrongHopThoai(page, 'Xác nhận đặt vé?', 'Đặt vé');
  const kq = hopThoai(page, 'Đặt vé thành công');
  await expect(kq).toBeVisible();
  const maPhieu = (await kq.getByText(/^PD\d{8}$/).textContent())!.trim();
  const han = (await kq.locator('dd').last().textContent())!.trim();
  await kq.getByRole('button').last().press('Escape');
  await expect(kq).toBeHidden();
  return { maPhieu, han };
}

async function timPhieu(page: Page, maPhieuDat: string) {
  await page.goto('/phieu-dat');
  await page.getByRole('textbox', { name: 'Mã phiếu đặt' }).fill(maPhieuDat);
  await page.getByRole('combobox', { name: 'Tình trạng' }).selectOption('');
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  const dong = page.getByRole('table', { name: 'Danh sách phiếu đặt chỗ' }).getByRole('row').filter({ hasText: maPhieuDat });
  await expect(dong).toHaveCount(1);
  return dong;
}

async function nhapRoiO(o: Locator, giaTri: string) {
  await o.fill(giaTri);
  await o.press('Tab');
}

/** Đọc các dòng trong CSDL có cột = giá trị (tối đa 50 dòng), để ca tự khẳng định cả khi chạy bằng lệnh npm. */
async function docCsdl(bang: string, cot: string, giaTri: string): Promise<Record<string, unknown>[]> {
  const yc = await request.newContext({ baseURL: DIA_CHI });
  try {
    await yc.post('/api/dang-nhap', { data: { tenDangNhap: TAI_KHOAN.quanLy.ten, matKhau: TAI_KHOAN.quanLy.matKhau } });
    const ph = await yc.get(`/api/kiem-thu/csdl?${new URLSearchParams({ bang, cot, giaTri })}`);
    expect(ph.ok(), `đọc bảng ${bang}`).toBeTruthy();
    const b = (await ph.json()) as { cacCot: string[]; cacDong: unknown[][] };
    return b.cacDong.map((d) => Object.fromEntries(b.cacCot.map((c, i) => [c, d[i]])));
  } finally {
    await yc.dispose();
  }
}

/** Thời điểm theo giờ Việt Nam dạng '14:30 20/11/2026' như giao diện hiển thị. */
function gioNgayVN(ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}`;
}

test.describe('Bổ sung UC05 Quản lý đặt vé', () => {
  test('UC05.7 Chuyến bay đúng mốc đặt chậm nhất thì đặt được, sát dưới mốc thì báo quá thời hạn (QĐ3, giả định 6)', async ({ page }) => {
    const api = await ApiThu.moi();
    const tenThamSo = 'thoiGianDatVeChamNhat';
    const cu = (await api.thamSo())[tenThamSo];
    // Giữ hai chuyến bay ở tương lai kể cả khi chạy sát nửa đêm.
    const n = Math.max(cu, 2);
    try {
      if (n !== cu) await api.doiThamSo(tenThamSo, n);
      const cbDuoc = await api.themChuyenBay({ lechNgay: n });
      const cbTre = await api.themChuyenBay({ lechNgay: n - 1 });

      await dangNhap(page, 'nhanVien', `/dat-ve?maChuyenBay=${cbDuoc.maChuyenBay}`);
      await expect(page.getByRole('radio', { name: /^Hạng 2/ })).toBeEnabled();
      await expect(hopThoai(page, 'Quá thời hạn đặt vé')).toHaveCount(0);
      await nhapHanhKhach(page, 'Đinh Văn Đúng Hạn', soCanCuocMoi());
      await chonHang(page, 'Hạng 2');
      const { maPhieu } = await datVaLayMa(page);

      await page.goto(`/dat-ve?maChuyenBay=${cbTre.maChuyenBay}`);
      const canhBao = hopThoai(page, 'Quá thời hạn đặt vé');
      await expect(canhBao).toBeVisible();
      await expect(canhBao).toContainText(`chậm nhất ${n} ngày trước ngày khởi hành`);
      await canhBao.getByRole('button').last().click();
      const ph = await page.request.post('/api/phieu-dat', { data: { maChuyenBay: cbTre.maChuyenBay, maHangVe: 'H2', hanhKhach: hanhKhachMoi() } });
      expect(ph.status()).toBe(409);
      expect(await ph.text()).toContain('QUA_HAN_DAT_VE');
      await xemCsdl(page, `phiếu ${maPhieu} lập được cho chuyến bay đúng mốc, chuyến bay dưới mốc không có phiếu`,
        { bang: 'PHIEUDATCHO', cot: 'MaChuyenBay', giaTri: cbDuoc.maChuyenBay, soDong: 1, dung: { MaPhieuDat: maPhieu } },
        { bang: 'PHIEUDATCHO', cot: 'MaChuyenBay', giaTri: cbTre.maChuyenBay, soDong: 0 });
    } finally {
      try {
        if (n !== cu) await api.doiThamSo(tenThamSo, cu);
      } finally {
        await api.dong();
      }
    }
  });

  test('UC05.8 Hạng còn 1 ghế: đặt 1 phiếu rồi bán vé hạng đó thì báo hết chỗ (giả định 2)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({
      gheTheoHang: [
        { maHangVe: 'H1', soLuongGhe: 1 },
        { maHangVe: 'H2', soLuongGhe: 3 },
      ],
    });
    await api.dong();
    await dangNhap(page, 'nhanVien', `/dat-ve?maChuyenBay=${cb.maChuyenBay}`);
    await nhapHanhKhach(page, 'La Thị Giữ Ghế Cuối', soCanCuocMoi());
    await chonHang(page, 'Hạng 1');
    const { maPhieu } = await datVaLayMa(page);

    await page.goto(`/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    const hang1 = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 1/ });
    await expect(hang1).toContainText('Hết chỗ');
    await expect(hang1).toBeDisabled();
    const ph = await page.request.post('/api/ve', { data: { maChuyenBay: cb.maChuyenBay, maHangVe: 'H1', hanhKhach: hanhKhachMoi() } });
    expect(ph.status()).toBe(409);
    expect(await ph.text()).toContain('HET_CHO');
    await xemCsdl(page, `phiếu ${maPhieu} giữ ghế Hạng 1, không có vé nào được bán`,
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieu, soDong: 1, dung: { MaHangVe: 'H1', TinhTrang: 'Chờ thanh toán' } },
      { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 0 });
  });

  test('UC05.9 Hạn thanh toán bằng lúc lập cộng 24 giờ, hoặc mốc hủy theo QĐ3 nếu mốc đó đến trước (giả định 6, 7)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ts = await api.thamSo();
    const n = ts.thoiGianDatVeChamNhat;
    const huy = ts.thoiGianHuyDatVe;
    // chuyến bay xa: hạn là lúc lập + 24 giờ; chuyến bay gần nhất còn đặt được: mốc hủy (0 giờ ngày khởi hành trừ thời gian hủy) đến trước
    const cacChuyen = [
      { cb: await api.themChuyenBay({ lechNgay: 10 }), lech: 10 },
      { cb: await api.themChuyenBay({ lechNgay: n }), lech: n },
    ];
    await api.dong();
    await dangNhap(page, 'nhanVien', '/dat-ve');
    const cacPhieu: string[] = [];
    for (const { cb, lech } of cacChuyen) {
      await page.goto(`/dat-ve?maChuyenBay=${cb.maChuyenBay}`);
      await nhapHanhKhach(page, 'Từ Thị Hạn Thanh Toán', soCanCuocMoi());
      await chonHang(page, 'Hạng 2');
      const moc = Date.parse(`${mocVN(lech - huy).iso}T00:00:00+07:00`);
      const t0 = Date.now();
      const { maPhieu, han } = await datVaLayMa(page);
      const t1 = Date.now();
      const mongDoi = [...new Set([t0, t1].map((t) => gioNgayVN(Math.min(t + 86_400_000, moc))))];
      expect(mongDoi, `hạn thanh toán của phiếu ${maPhieu} (chuyến bay sau ${lech} ngày)`).toContain(han);
      if (moc < t0 + 86_400_000) expect(han).toBe(gioNgayVN(moc));
      // danh sách phiếu hiện cùng hạn
      const dong = await timPhieu(page, maPhieu);
      await expect(dong).toContainText(han.slice(0, 11));
      cacPhieu.push(maPhieu);
    }
    await xemCsdl(page, `đã lập phiếu ${cacPhieu.join(', ')}`,
      ...cacPhieu.map((ma) => ({ bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: ma, soDong: 1, dung: { TinhTrang: 'Chờ thanh toán' } })));
  });

  test('UC05.10 Hủy phiếu rồi xem số ghế trống: ghế được trả lại (giả định 8)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H2');
    await api.dong();
    const hang2 = page.getByRole('radiogroup', { name: 'Hạng vé' }).getByRole('radio', { name: /^Hạng 2/ });
    await dangNhap(page, 'nhanVien', `/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await expect(hang2).toHaveAttribute('title', /^Hạng 2: 4 ghế trống/);
    const dong = await timPhieu(page, maPhieuDat);
    await dong.getByRole('button', { name: `Hủy phiếu ${maPhieuDat}` }).click();
    await bamTrongHopThoai(page, `Hủy phiếu ${maPhieuDat}?`, 'Hủy phiếu');
    await expect(toast(page, `Đã hủy phiếu ${maPhieuDat}`)).toBeVisible();
    await page.goto(`/ban-ve?maChuyenBay=${cb.maChuyenBay}`);
    await expect(hang2).toHaveAttribute('title', /^Hạng 2: 5 ghế trống/);
    await xemCsdl(page, `phiếu ${maPhieuDat} đã hủy, trả lại ghế Hạng 2`, { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieuDat, soDong: 1, dung: { TinhTrang: 'Đã hủy' } });
  });

  test('UC05.11 Phiếu đã hủy: nút sửa, hủy, bán vé bị khóa (AT03)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat } = await api.datVe(cb.maChuyenBay, 'H2');
    await api.dong();
    await dangNhap(page, 'nhanVien', '/phieu-dat');
    expect((await page.request.post(`/api/phieu-dat/${maPhieuDat}/huy`)).ok()).toBeTruthy();
    const dong = await timPhieu(page, maPhieuDat);
    await expect(dong).toContainText('Đã hủy');
    await expect(dong.getByRole('button', { name: 'Phiếu đã hủy, không sửa được' })).toBeDisabled();
    await expect(dong.getByRole('button', { name: `Hủy phiếu ${maPhieuDat}` })).toBeDisabled();
    await expect(dong.getByRole('button', { name: 'Bán vé' })).toBeDisabled();
    // mở thẳng đường dẫn sửa cũng không có biểu mẫu
    await page.goto(`/dat-ve?suaPhieu=${maPhieuDat}`);
    await expect(page.getByText(`Phiếu ${maPhieuDat} đã bị hủy, không thể sửa`)).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
    // máy chủ cũng từ chối
    const sua = await page.request.put(`/api/phieu-dat/${maPhieuDat}/hanh-khach`, { data: hanhKhachMoi('Tên Không Lưu') });
    expect(sua.status()).toBe(409);
    expect((await page.request.post(`/api/phieu-dat/${maPhieuDat}/huy`)).status()).toBe(409);
    await xemCsdl(page, `phiếu ${maPhieuDat} vẫn Đã hủy`, { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieuDat, soDong: 1, dung: { TinhTrang: 'Đã hủy' } });
  });

  test('UC05.12 Lọc phiếu theo tình trạng (Chờ thanh toán, Đã hủy, Tất cả) và theo mã phiếu (UC05.2)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    const { maPhieuDat: phieuCho } = await api.datVe(cb.maChuyenBay, 'H2');
    const { maPhieuDat: phieuHuy } = await api.datVe(cb.maChuyenBay, 'H1');
    await api.dong();
    await dangNhap(page, 'nhanVien', '/phieu-dat');
    expect((await page.request.post(`/api/phieu-dat/${phieuHuy}/huy`)).ok()).toBeTruthy();
    const bang = page.getByRole('table', { name: 'Danh sách phiếu đặt chỗ' });
    const dongBang = bang.locator('tbody tr');
    const tinhTrang = page.getByRole('combobox', { name: 'Tình trạng' });
    const tim = () => page.getByRole('button', { name: 'Tìm', exact: true }).click();

    await page.goto('/phieu-dat');
    await chonTrongOChon(page.getByRole('combobox', { name: 'Chuyến bay' }), cb.maChuyenBay, new RegExp(cb.maChuyenBay));
    await tinhTrang.selectOption('ChoThanhToan');
    await tim();
    await expect(dongBang).toHaveCount(1);
    await expect(dongBang).toContainText(phieuCho);
    await tinhTrang.selectOption('DaHuy');
    await tim();
    await expect(dongBang).toHaveCount(1);
    await expect(dongBang).toContainText(phieuHuy);
    await tinhTrang.selectOption('');
    await tim();
    await expect(dongBang).toHaveCount(2);

    // theo mã phiếu
    await page.goto('/phieu-dat');
    await page.getByRole('textbox', { name: 'Mã phiếu đặt' }).fill(phieuHuy);
    await tinhTrang.selectOption('');
    await tim();
    await expect(dongBang).toHaveCount(1);
    await expect(dongBang).toContainText(phieuHuy);
    // mã phiếu đã hủy nhưng lọc Chờ thanh toán thì không có
    await tinhTrang.selectOption('ChoThanhToan');
    await tim();
    await expect(page.getByText('Không tìm thấy phiếu đặt chỗ')).toBeVisible();
    await expect(dongBang).toHaveCount(0);
  });

  test('UC05.13 Xóa phiếu đã hủy: phiếu đã thành vé đặt trước mốc không bị xóa (AT04)', async ({ page }) => {
    await dangNhap(page, 'quanLy', '/phieu-dat');
    // phiếu đã thành vé trong dữ liệu mẫu, lập trước hôm nay (chỉ đọc, không sửa)
    const homNay = mocVN(0);
    const dsVe = await page.request.get(`/api/ve?tuNgay=2000-01-01&denNgay=${mocVN(-1).iso}`);
    expect(dsVe.ok(), 'đọc danh sách vé mẫu').toBeTruthy();
    const ve = (await dsVe.json()) as { maPhieuDat: string | null }[];
    const maPhieu = ve.find((v) => v.maPhieuDat)?.maPhieuDat;
    if (!maPhieu) throw new Error('Dữ liệu mẫu thiếu vé lập từ phiếu đặt chỗ trước hôm nay');
    const docPhieu = async () => (await (await page.request.get(`/api/phieu-dat?maPhieuDat=${maPhieu}`)).json()) as { tinhTrang: string; thoiDiemDat: string }[];
    const truoc = await docPhieu();
    expect(truoc).toHaveLength(1);
    expect(truoc[0].tinhTrang).toBe('DaHuy');
    expect(truoc[0].thoiDiemDat < homNay.iso).toBeTruthy();

    const khoi = page.locator('#xoa-phieu-da-huy');
    await nhapNgay(khoi, 'Xóa phiếu đã hủy trước ngày', homNay.vn);
    await khoi.getByRole('button', { name: 'Xóa phiếu đã hủy' }).click();
    const hoi = hopThoai(page, /^Xóa [\d.]+ phiếu đã hủy\?$/);
    const khongCo = hopThoai(page, 'Không có phiếu nào để xóa');
    await expect(hoi.or(khongCo)).toBeVisible();
    if (await hoi.isVisible()) {
      await hoi.getByRole('button', { name: 'Xóa phiếu đã hủy' }).click();
      await bamTrongHopThoai(page, 'Đã xóa phiếu đã hủy', 'Đóng');
      await khoi.getByRole('button', { name: 'Xóa phiếu đã hủy' }).click();
    }
    await bamTrongHopThoai(page, 'Không có phiếu nào để xóa', 'Đã hiểu');

    // phiếu đã thành vé vẫn còn, vé vẫn tham chiếu tới phiếu
    const sau = await docPhieu();
    expect(sau).toHaveLength(1);
    expect(sau[0].tinhTrang).toBe('DaHuy');
    expect(await docCsdl('VE', 'MaPhieuDat', maPhieu)).toHaveLength(1);
    await xemCsdl(page, `phiếu ${maPhieu} đã thành vé nên được giữ lại`,
      { bang: 'PHIEUDATCHO', cot: 'MaPhieuDat', giaTri: maPhieu, soDong: 1, dung: { TinhTrang: 'Đã hủy' } },
      { bang: 'VE', cot: 'MaPhieuDat', giaTri: maPhieu, soDong: 1 });
  });

  test('UC05.14 Xóa phiếu đã hủy: không chọn ngày thì báo lỗi, ngày tương lai bị chặn (AT04)', async ({ page }) => {
    await dangNhap(page, 'quanLy', '/phieu-dat');
    const khoi = page.locator('#xoa-phieu-da-huy');
    const nhan = 'Xóa phiếu đã hủy trước ngày';
    const nut = khoi.getByRole('button', { name: 'Xóa phiếu đã hủy' });
    const hoi = hopThoai(page, /^Xóa [\d.]+ phiếu đã hủy\?$/);
    const khongCo = hopThoai(page, 'Không có phiếu nào để xóa');

    // không chọn ngày
    await nhapNgay(khoi, nhan, '');
    await nut.click();
    await expect(khoi.getByText('Vui lòng chọn ngày.')).toBeVisible();
    await expect(hoi.or(khongCo)).toHaveCount(0);

    // ngày mai: ô ngày báo lỗi ngay tại ô; bấm Xóa thì không được chạy tiếp với một ngày khác ngày đang hiện
    await page.goto('/phieu-dat');
    await nhapNgay(khoi, nhan, mocVN(1).vn);
    await expect(khoi.getByText(`Phải trước hoặc bằng ngày ${mocVN(0).vn}`)).toBeVisible();
    await nut.click();
    await page.waitForTimeout(1000);
    await expect(hoi.or(khongCo), 'không đếm hay xóa phiếu theo ngày cũ còn giữ trong ô').toHaveCount(0);
  });

  test('UC05.15 Kiểm tra CCCD, hộ chiếu, điện thoại, họ tên trên màn hình Đặt vé như màn hình Bán vé (giả định 9, 10)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/dat-ve?maChuyenBay=${cb.maChuyenBay}`);
    const form = bieuMau(page);
    const oSo = form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' });
    const oDt = form.getByRole('textbox', { name: 'Điện thoại' });

    // họ tên trống: báo lỗi, không mở hộp xác nhận
    await chonHang(page, 'Hạng 2');
    await form.getByRole('button', { name: 'Đặt vé', exact: true }).click();
    await expect(form.getByText('Vui lòng nhập họ tên hành khách.')).toBeVisible();
    await expect(hopThoai(page, 'Xác nhận đặt vé?')).toHaveCount(0);

    await nhapRoiO(oSo, '01234567890');
    await expect(form.getByText('Số CCCD gồm đúng 12 chữ số.')).toBeVisible();

    await form.getByRole('combobox', { name: 'Loại giấy tờ' }).selectOption('HoChieu');
    await nhapRoiO(oSo, 'AB123');
    await expect(form.getByText('Số hộ chiếu gồm 6 đến 20 ký tự là chữ in hoa và chữ số.')).toBeVisible();

    await nhapRoiO(oDt, '0912345');
    await expect(form.getByText('Điện thoại gồm 8 đến 15 chữ số, có thể có dấu + ở đầu (ví dụ +84).')).toBeVisible();
  });

  test('UC05.17 Bấm Đặt vé hai lần thật nhanh: chỉ lập 1 phiếu (Chương 7, tr. 46)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay();
    await api.dong();
    await dangNhap(page, 'nhanVien', `/dat-ve?maChuyenBay=${cb.maChuyenBay}`);
    await nhapHanhKhach(page, 'Ninh Văn Bấm Hai Lần', soCanCuocMoi());
    await chonHang(page, 'Hạng 2');
    const nutDat = bieuMau(page).getByRole('button', { name: 'Đặt vé', exact: true });
    const hoi = hopThoai(page, 'Xác nhận đặt vé?');
    // bấm hai lần nút Đặt vé của biểu mẫu: không được mở chồng hai hộp xác nhận, không lập phiếu nào khi chưa xác nhận
    await nutDat.dblclick();
    await page.waitForTimeout(800);
    expect(await hoi.count(), 'số hộp xác nhận đang mở').toBeLessThanOrEqual(1);
    expect(await docCsdl('PHIEUDATCHO', 'MaChuyenBay', cb.maChuyenBay)).toHaveLength(0);
    // hiện tại lần bấm thứ hai rơi ra ngoài hộp xác nhận và đóng nó; khi đó bấm Đặt vé lại một lần
    if ((await hoi.count()) === 0) await nutDat.click();
    // bấm hai lần nút Đặt vé trong hộp xác nhận
    await hoi.getByRole('button', { name: 'Đặt vé', exact: true }).dblclick();
    await expect(hopThoai(page, 'Đặt vé thành công')).toBeVisible();
    // chờ thêm cho yêu cầu thứ hai (nếu có) kịp ghi xuống CSDL
    await page.waitForTimeout(1500);
    await expect(hoi).toHaveCount(0);
    expect(await docCsdl('PHIEUDATCHO', 'MaChuyenBay', cb.maChuyenBay)).toHaveLength(1);
    await xemCsdl(page, `chuyến bay ${cb.maChuyenBay} chỉ có 1 phiếu`, { bang: 'PHIEUDATCHO', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1 });
  });
});
