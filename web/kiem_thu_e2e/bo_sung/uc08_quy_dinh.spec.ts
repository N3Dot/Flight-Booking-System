// Bổ sung UC08 Thay đổi quy định (QĐ6): giá trị biên và giá trị sai của tham số, ràng buộc giữa các tham số (TH04, TH06, TH07),
// hiệu lực ngay ở màn hình Đặt vé và biểu mẫu chuyến bay, kiểm tra mã và tên sân bay, hạng vé (TH01, TH05, giả định 11).
// Mọi ca đổi tham số đều trả lại giá trị cũ trong finally; sân bay, hạng vé thử dùng mã mới và được xóa trong finally.
import { expect, request, test, xemCsdl, type Locator, type Page } from '../tien_ich/trinh_dien';
import { ApiThu, DIA_CHI, TAI_KHOAN, bamTrongHopThoai, dangNhap, hanhKhachMoi, hopThoai, lichChuyenBayThu, mocVN, toast } from '../tien_ich/chung';

/** Giá trị mặc định của bảng THAMSOQUYDINH trong dữ liệu mẫu. */
const MAC_DINH: Record<string, number> = {
  thoiGianBayToiThieu: 30,
  soSanBayTrungGianToiDa: 2,
  thoiGianDungToiThieu: 10,
  thoiGianDungToiDa: 20,
  thoiGianDatVeChamNhat: 1,
  thoiGianHuyDatVe: 0,
};

/**
 * Đọc giá trị cũ của các tham số sắp đổi. Nếu một ca khác đang tạm đổi tham số đó thì chờ nó trả lại
 * (tối đa 15 giây) để không lấy nhầm giá trị tạm làm giá trị cũ.
 */
async function docGiaTriCu(api: ApiThu, cacTen: string[]): Promise<Record<string, number>> {
  let ts = await api.thamSo();
  for (let lan = 0; lan < 30 && cacTen.some((t) => ts[t] !== MAC_DINH[t]); lan++) {
    await new Promise((r) => setTimeout(r, 500));
    ts = await api.thamSo();
  }
  return Object.fromEntries(cacTen.map((t) => [t, ts[t]]));
}

/** Trả các tham số về giá trị cũ; thử vài lượt vì ràng buộc giữa các tham số có thể chặn thứ tự trả. */
async function traGiaTriCu(api: ApiThu, cu: Record<string, number>) {
  for (let lan = 0; lan < 3; lan++) {
    const nay = await api.thamSo();
    const khac = Object.keys(cu).filter((t) => nay[t] !== cu[t]);
    if (!khac.length) return;
    for (const t of khac) await api.doiThamSo(t, cu[t]).catch(() => undefined);
  }
}

/** Mã gồm chữ cái in hoa ngẫu nhiên, không trùng mã đang có. */
function maChu(tienTo: string, doDai: number, daCo: string[] = []): string {
  for (;;) {
    let ma = tienTo;
    while (ma.length < doDai) ma += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    if (!daCo.includes(ma)) return ma;
  }
}

/** Mã các sân bay và hạng vé đang có. */
async function danhSachMa(): Promise<{ sanBay: string[]; hangVe: string[] }> {
  const yc = await request.newContext({ baseURL: DIA_CHI });
  await yc.post('/api/dang-nhap', { data: { tenDangNhap: TAI_KHOAN.quanLy.ten, matKhau: TAI_KHOAN.quanLy.matKhau } });
  const qd = (await (await yc.get('/api/quy-dinh')).json()) as { sanBay: { maSanBay: string }[]; hangVe: { maHangVe: string }[] };
  await yc.dispose();
  return { sanBay: qd.sanBay.map((x) => x.maSanBay), hangVe: qd.hangVe.map((x) => x.maHangVe) };
}

function theThamSo(page: Page, tieuDe: string) {
  return page.getByRole('button', { name: new RegExp(`^${tieuDe}: .*Bấm để thay đổi$`) });
}

async function moThamSo(page: Page, tieuDe: string): Promise<Locator> {
  await theThamSo(page, tieuDe).click();
  const hop = hopThoai(page, 'Cập nhật quy định');
  await expect(hop).toBeVisible();
  await expect(hop).toContainText(tieuDe);
  return hop;
}

function oGiaTri(hop: Locator, donVi: string) {
  return hop.getByRole('textbox', { name: `Giá trị mới (${donVi})` });
}

/** Gõ từng phím như người dùng (ô nhập có thể chặn ký tự không hợp lệ ngay khi gõ). */
async function go(o: Locator, chu: string) {
  await o.fill('');
  await o.pressSequentially(chu);
}

async function dongHop(hop: Locator) {
  if (await hop.isVisible()) await hop.getByRole('button', { name: 'Hủy' }).click();
  await expect(hop).toBeHidden();
}

/**
 * Giá trị sai bị chặn: hoặc ô báo lỗi, hoặc ô không nhận gì (còn trống).
 * Ô tự bỏ ký tự sai rồi thành một số hợp lệ khác (-1 thành 1, 1.5 thành 15) là không đạt, vì bấm Lưu sẽ lưu nhầm giá trị
 * (cùng cách chấm với UC03.18, UC03.20). Trả về chữ trong ô sau khi gõ để ghi lại.
 */
async function kiemBiChan(hop: Locator, o: Locator, chu: string): Promise<string> {
  await go(o, chu);
  const giaTri = await o.inputValue();
  const coLoi = await hop.getByRole('alert').isVisible();
  // soft: ghi lỗi nhưng vẫn chạy tiếp phần kiểm máy chủ và CSDL phía sau
  expect.soft(coLoi || giaTri === '', `gõ "${chu}" thì ô phải báo lỗi hoặc còn trống, không được tự đổi thành "${giaTri}"`).toBeTruthy();
  return giaTri;
}

test.describe('Bổ sung UC08 Thay đổi quy định', () => {
  test('UC08.22 Danh sách ban đầu có đúng 10 sân bay với các mã trong dữ liệu mẫu (QĐ1, TH01)', async ({ page }) => {
    await dangNhap(page, 'quanLy', '/quy-dinh');
    const cacDong = page.getByRole('table', { name: 'Danh sách sân bay' }).locator('tbody tr');
    await expect(cacDong).toHaveCount(10);

    const cacMa = await cacDong.evaluateAll((ds) =>
      ds.map((dong) => dong.querySelectorAll('td')[1]?.textContent?.trim()).sort(),
    );
    expect(cacMa).toEqual(['SGN', 'HAN', 'DAD', 'CXR', 'PQC', 'HPH', 'HUI', 'VCA', 'DLI', 'VII'].sort());
  });

  test('UC08.7 Tham số bằng 0, số âm, chữ, số lẻ: 0 được hay không tùy tham số, giá trị sai bị chặn và không lưu (Ràng buộc THAMSOQUYDINH)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ten = ['soSanBayTrungGianToiDa', 'thoiGianDatVeChamNhat', 'thoiGianHuyDatVe'];
    const cu = await docGiaTriCu(api, ten);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');

      // 0 được: thời gian hủy đặt vé bằng 0 là hủy ngay ngày khởi hành
      let hop = await moThamSo(page, 'Thời gian hủy đặt vé');
      await go(oGiaTri(hop, 'ngày'), '0');
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(hop.getByRole('alert')).toHaveCount(0);
      await expect(hop).toBeHidden();

      // 0 không được: thời gian chậm nhất khi đặt vé phải lớn hơn thời gian hủy đặt vé
      hop = await moThamSo(page, 'Thời gian chậm nhất khi đặt vé');
      await go(oGiaTri(hop, 'ngày'), '0');
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(hop.getByRole('alert')).toContainText('Thời gian chậm nhất khi đặt vé phải lớn hơn thời gian hủy đặt vé.');
      await dongHop(hop);

      // chữ, số âm, số lẻ ở ô số sân bay trung gian tối đa
      hop = await moThamSo(page, 'Số sân bay trung gian tối đa');
      const o = oGiaTri(hop, 'sân bay');
      const sauChu = await kiemBiChan(hop, o, 'abc');
      if (sauChu === '') {
        await hop.getByRole('button', { name: 'Lưu' }).click();
        await expect(hop.getByRole('alert')).toContainText('Chưa nhập giá trị mới.');
      }
      await kiemBiChan(hop, o, '-1');
      await kiemBiChan(hop, o, '1.5');
      await kiemBiChan(hop, o, '1,5');
      await dongHop(hop);
      await expect(theThamSo(page, 'Số sân bay trung gian tối đa')).toHaveAccessibleName(
        `Số sân bay trung gian tối đa: ${cu.soSanBayTrungGianToiDa} sân bay. Bấm để thay đổi`,
      );

      // máy chủ cũng từ chối số âm, số lẻ, chữ; nhận 0 với thời gian hủy đặt vé
      for (const giaTriMoi of [-1, 1.5, 'abc'])
        expect((await page.request.put('/api/quy-dinh/tham-so/soSanBayTrungGianToiDa', { data: { giaTriMoi } })).status(), `gửi ${giaTriMoi}`).toBe(400);
      expect((await page.request.put('/api/quy-dinh/tham-so/thoiGianDatVeChamNhat', { data: { giaTriMoi: 0 } })).status()).toBe(400);
      expect((await page.request.put('/api/quy-dinh/tham-so/thoiGianHuyDatVe', { data: { giaTriMoi: 0 } })).status()).toBe(204);

      const nay = await api.thamSo();
      expect(nay.soSanBayTrungGianToiDa).toBe(cu.soSanBayTrungGianToiDa);
      expect(nay.thoiGianDatVeChamNhat).toBe(cu.thoiGianDatVeChamNhat);
      await xemCsdl(page, 'giá trị sai không được lưu, tham số giữ nguyên', {
        bang: 'THAMSOQUYDINH',
        dung: { SoSanBayTrungGianToiDa: cu.soSanBayTrungGianToiDa, ThoiGianDatVeChamNhat: cu.thoiGianDatVeChamNhat, ThoiGianHuyDatVe: 0 },
      });
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.8 Thời gian dừng tối thiểu bằng tối đa thì lưu được (TH04)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianDungToiThieu', 'thoiGianDungToiDa']);
    const moi = cu.thoiGianDungToiDa;
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      const hop = await moThamSo(page, 'Thời gian dừng tối thiểu');
      await go(oGiaTri(hop, 'phút'), String(moi));
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(toast(page, `Cập nhật quy định thành công: thời gian dừng tối thiểu là ${moi} phút.`)).toBeVisible();
      await expect(hop).toBeHidden();
      await expect(theThamSo(page, 'Thời gian dừng tối thiểu')).toHaveAccessibleName(`Thời gian dừng tối thiểu: ${moi} phút. Bấm để thay đổi`);
      await xemCsdl(page, `thời gian dừng tối thiểu bằng tối đa (${moi} phút) đã được lưu`, {
        bang: 'THAMSOQUYDINH',
        dung: { ThoiGianDungToiThieu: moi, ThoiGianDungToiDa: moi },
      });
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.9 Thời gian hủy đặt vé bằng hoặc lớn hơn thời gian chậm nhất khi đặt vé thì báo lỗi, không lưu (giả định 6, TH06, TH07)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianDatVeChamNhat', 'thoiGianHuyDatVe']);
    const cham = cu.thoiGianDatVeChamNhat;
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      let hop = await moThamSo(page, 'Thời gian hủy đặt vé');
      for (const giaTri of [cham, cham + 1]) {
        await go(oGiaTri(hop, 'ngày'), String(giaTri));
        await hop.getByRole('button', { name: 'Lưu' }).click();
        await expect(hop.getByRole('alert'), `hủy đặt vé ${giaTri} ngày, chậm nhất ${cham} ngày`).toContainText(
          'Thời gian hủy đặt vé phải nhỏ hơn thời gian chậm nhất khi đặt vé.',
        );
        await expect(hop).toBeVisible();
      }
      await dongHop(hop);

      hop = await moThamSo(page, 'Thời gian chậm nhất khi đặt vé');
      await go(oGiaTri(hop, 'ngày'), String(cu.thoiGianHuyDatVe));
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(hop.getByRole('alert')).toContainText('Thời gian chậm nhất khi đặt vé phải lớn hơn thời gian hủy đặt vé.');
      await dongHop(hop);

      // máy chủ cũng kiểm ràng buộc này
      for (const giaTriMoi of [cham, cham + 1]) {
        const ph = await page.request.put('/api/quy-dinh/tham-so/thoiGianHuyDatVe', { data: { giaTriMoi } });
        expect(ph.status()).toBe(400);
        expect(await ph.text()).toContain('Thời gian hủy đặt vé phải nhỏ hơn thời gian chậm nhất khi đặt vé.');
      }
      expect((await page.request.put('/api/quy-dinh/tham-so/thoiGianDatVeChamNhat', { data: { giaTriMoi: cu.thoiGianHuyDatVe } })).status()).toBe(400);

      await expect(theThamSo(page, 'Thời gian hủy đặt vé')).toHaveAccessibleName(`Thời gian hủy đặt vé: ${cu.thoiGianHuyDatVe} ngày. Bấm để thay đổi`);
      await xemCsdl(page, 'hai tham số QĐ3 giữ nguyên', {
        bang: 'THAMSOQUYDINH',
        dung: { ThoiGianDatVeChamNhat: cham, ThoiGianHuyDatVe: cu.thoiGianHuyDatVe },
      });
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.10 Đổi thời gian chậm nhất khi đặt vé bằng giao diện thì màn hình Đặt vé áp dụng ngay (TH06, QĐ3)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianDatVeChamNhat']);
    const moi = cu.thoiGianDatVeChamNhat + 2;
    // chuyến bay khởi hành sau (moi - 1) ngày: đặt được theo giá trị cũ, quá hạn theo giá trị mới
    const cb = await api.themChuyenBay({ lechNgay: moi - 1 });
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      const hop = await moThamSo(page, 'Thời gian chậm nhất khi đặt vé');
      await go(oGiaTri(hop, 'ngày'), String(moi));
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(toast(page, `Cập nhật quy định thành công: thời gian chậm nhất khi đặt vé là ${moi} ngày.`)).toBeVisible();
      await xemCsdl(page, `thời gian chậm nhất khi đặt vé đã đổi thành ${moi} ngày`, { bang: 'THAMSOQUYDINH', dung: { ThoiGianDatVeChamNhat: moi } });

      await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Đặt vé', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Đặt vé' })).toBeVisible();
      await expect(page.getByText(`Chỉ hiện các chuyến bay khởi hành sau hôm nay ít nhất ${moi} ngày (QĐ3).`)).toBeVisible();
      await page.goto(`/dat-ve?maChuyenBay=${cb.maChuyenBay}`);
      const canhBao = hopThoai(page, 'Quá thời hạn đặt vé');
      await expect(canhBao).toBeVisible();
      await canhBao.getByRole('button').last().click();
      const ph = await page.request.post('/api/phieu-dat', {
        data: { maChuyenBay: cb.maChuyenBay, maHangVe: 'H2', hanhKhach: hanhKhachMoi() },
      });
      expect(ph.status()).toBe(409);
      expect(await ph.text()).toContain('QUA_HAN_DAT_VE');
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.11 Số sân bay trung gian tối đa bằng 0 thì biểu mẫu chuyến bay không cho thêm trung gian (TH03, QĐ1)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['soSanBayTrungGianToiDa']);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      const hop = await moThamSo(page, 'Số sân bay trung gian tối đa');
      await go(oGiaTri(hop, 'sân bay'), '0');
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(toast(page, 'Cập nhật quy định thành công: số sân bay trung gian tối đa là 0 sân bay.')).toBeVisible();
      await xemCsdl(page, 'số sân bay trung gian tối đa đã đổi thành 0', { bang: 'THAMSOQUYDINH', dung: { SoSanBayTrungGianToiDa: 0 } });

      await page.goto('/chuyen-bay/them');
      await expect(page.getByText('Đã đủ 0 sân bay trung gian theo quy định.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Thêm sân bay trung gian' })).toBeDisabled();
      // máy chủ cũng từ chối chuyến bay có trung gian
      const ph = await page.request.post('/api/chuyen-bay', {
        data: {
          maChuyenBay: `TG${Date.now() % 1e8}`,
          giaVe: 1_000_000,
          maSanBayDi: 'SGN',
          maSanBayDen: 'HAN',
          ngayGioKhoiHanh: mocVN(20, 9, 0).isoGio,
          thoiGianBay: 120,
          gheTheoHang: [{ maHangVe: 'H2', soLuongGhe: 5 }],
          trungGian: [{ thuTu: 1, maSanBay: 'DAD', thoiGianDung: 15 }],
        },
      });
      // vi phạm quy định được máy chủ trả mã 409 kèm lời báo
      expect(ph.status()).toBe(409);
      expect(await ph.text()).toContain('tối đa 0 sân bay trung gian');
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.12 Mã sân bay 2 chữ, 4 chữ, chữ thường, có số: chỉ nhận đúng 3 chữ in hoa (Ràng buộc SANBAY, TH01)', async ({ page }) => {
    await dangNhap(page, 'quanLy', '/quy-dinh');
    await page.getByRole('button', { name: 'Thêm sân bay' }).click();
    const them = hopThoai(page, 'Thêm sân bay');
    const oMa = them.getByRole('textbox', { name: 'Mã sân bay' });
    const loiMa = them.getByText('Mã sân bay phải gồm đúng 3 chữ cái in hoa.');
    await them.getByRole('textbox', { name: 'Tên sân bay' }).fill('Sân bay kiểm thử mã');

    // 2 chữ: báo lỗi
    await go(oMa, 'AB');
    await them.getByRole('button', { name: 'Lưu' }).click();
    await expect(loiMa).toBeVisible();
    // 4 chữ: ô chỉ nhận 3 ký tự
    await go(oMa, 'ABCD');
    await expect(oMa).toHaveValue('ABC');
    await expect(loiMa).toBeHidden();
    // chữ thường: được đổi thành chữ in hoa
    await go(oMa, 'abc');
    await expect(oMa).toHaveValue('ABC');
    // có số: chữ số bị bỏ, còn 2 chữ nên báo lỗi
    await go(oMa, 'A1B');
    await expect(oMa).toHaveValue('AB');
    await expect(loiMa).toBeVisible();
    await them.getByRole('button', { name: 'Hủy' }).click();
    await expect(them).toBeHidden();

    // máy chủ cũng chỉ nhận đúng 3 chữ cái
    for (const maSanBay of ['AB', 'ABCD', 'A1B', 'A B', '1AB'])
      expect((await page.request.post('/api/san-bay', { data: { maSanBay, tenSanBay: `Sân bay thử ${maSanBay}` } })).status(), `mã "${maSanBay}"`).toBe(400);
    await xemCsdl(page, 'không có sân bay mã sai nào được lưu',
      { bang: 'SANBAY', cot: 'MaSanBay', giaTri: 'AB', soDong: 0 },
      { bang: 'SANBAY', cot: 'TenSanBay', giaTri: 'Sân bay kiểm thử mã', soDong: 0 });
  });

  test('UC08.13 Mã sân bay trùng, tên sân bay trùng, tên trống thì báo lỗi (TH01)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ma = maChu('Y', 3, (await danhSachMa()).sanBay);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await page.getByRole('button', { name: 'Thêm sân bay' }).click();
      const them = hopThoai(page, 'Thêm sân bay');
      const oMa = them.getByRole('textbox', { name: 'Mã sân bay' });
      const oTen = them.getByRole('textbox', { name: 'Tên sân bay' });

      // tên trống
      await go(oMa, ma);
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(them.getByText('Chưa nhập tên sân bay.')).toBeVisible();
      // mã trùng với sân bay đã có
      await go(oMa, 'SGN');
      await oTen.fill(`Kiểm thử ${ma}`);
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(them.getByText('Mã sân bay đã tồn tại.')).toBeVisible();
      // tên trùng với sân bay đã có
      await go(oMa, ma);
      await oTen.fill('Tân Sơn Nhất');
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(them.getByText('Tên sân bay đã tồn tại.')).toBeVisible();
      await expect(them).toBeVisible();
      await them.getByRole('button', { name: 'Hủy' }).click();

      await expect(page.getByRole('table', { name: 'Danh sách sân bay' }).getByRole('row').filter({ hasText: ma })).toHaveCount(0);
      await xemCsdl(page, `sân bay ${ma} không được lưu, SGN và Tân Sơn Nhất vẫn chỉ có một dòng`,
        { bang: 'SANBAY', cot: 'MaSanBay', giaTri: ma, soDong: 0 },
        { bang: 'SANBAY', cot: 'TenSanBay', giaTri: 'Tân Sơn Nhất', soDong: 1, dung: { MaSanBay: 'SGN' } });
    } finally {
      await api.xoaSanBayNeuCo(ma);
      await api.dong();
    }
  });

  // Quy tắc còn ít nhất 2 sân bay / 1 hạng vé được kiểm ở xUnit: ConItNhatHaiSanBay và XoaHangVe.

  test('UC08.15 Tỉ lệ đơn giá bằng 0, số âm, chữ thì báo lỗi, không lưu hạng vé (giả định 11, TH05)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ma = maChu('Q', 5, (await danhSachMa()).hangVe);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await page.getByRole('button', { name: 'Thêm hạng vé' }).click();
      const them = hopThoai(page, 'Thêm hạng vé');
      await them.getByRole('textbox', { name: 'Mã hạng vé' }).fill(ma);
      await them.getByRole('textbox', { name: 'Tên hạng vé' }).fill(`Hạng thử ${ma}`);
      const oTiLe = them.getByRole('textbox', { name: 'Tỉ lệ đơn giá (%)' });

      // 0
      await go(oTiLe, '0');
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(them.getByText('Tỉ lệ đơn giá phải lớn hơn 0.')).toBeVisible();
      // chữ
      const sauChu = await kiemBiChan(them, oTiLe, 'abc');
      if (sauChu === '') await expect(them.getByText('Chưa nhập tỉ lệ đơn giá.')).toBeVisible();
      // số âm
      await kiemBiChan(them, oTiLe, '-10');
      await them.getByRole('button', { name: 'Hủy' }).click();
      await expect(them).toBeHidden();

      // máy chủ cũng từ chối
      for (const tiLeDonGia of [0, -10, 'abc'])
        expect(
          (await page.request.post('/api/hang-ve', { data: { maHangVe: ma, tenHangVe: `Hạng thử ${ma}`, tiLeDonGia } })).status(),
          `tỉ lệ ${tiLeDonGia}`,
        ).toBe(400);
      await xemCsdl(page, `hạng vé ${ma} không được lưu`, { bang: 'HANGVE', cot: 'MaHangVe', giaTri: ma, soDong: 0 });
    } finally {
      await api.xoaHangVeNeuCo(ma);
      await api.dong();
    }
  });

  test('UC08.16 Tên hạng vé trùng thì báo lỗi (giả định 11, TH05)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ma = maChu('Q', 5, (await danhSachMa()).hangVe);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await page.getByRole('button', { name: 'Thêm hạng vé' }).click();
      const them = hopThoai(page, 'Thêm hạng vé');
      await them.getByRole('textbox', { name: 'Mã hạng vé' }).fill(ma);
      await them.getByRole('textbox', { name: 'Tên hạng vé' }).fill('Hạng 1');
      await them.getByRole('textbox', { name: 'Tỉ lệ đơn giá (%)' }).fill('110');
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(them.getByText('Tên hạng vé đã tồn tại.')).toBeVisible();
      await expect(them).toBeVisible();
      await them.getByRole('button', { name: 'Hủy' }).click();
      await expect(them).toBeHidden();
      await xemCsdl(page, `hạng vé ${ma} trùng tên không được lưu, tên Hạng 1 vẫn chỉ có một dòng`,
        { bang: 'HANGVE', cot: 'MaHangVe', giaTri: ma, soDong: 0 },
        { bang: 'HANGVE', cot: 'TenHangVe', giaTri: 'Hạng 1', soDong: 1, dung: { MaHangVe: 'H1' } });
    } finally {
      await api.xoaHangVeNeuCo(ma);
      await api.dong();
    }
  });

  test('UC08.17 Thêm hạng vé mới rồi mở biểu mẫu chuyến bay thì có thêm ô số ghế cho hạng mới (TH05)', async ({ page }) => {
    const api = await ApiThu.moi();
    const ma = maChu('Q', 5, (await danhSachMa()).hangVe);
    const ten = `Hạng thử ${ma}`;
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      await page.getByRole('button', { name: 'Thêm hạng vé' }).click();
      const them = hopThoai(page, 'Thêm hạng vé');
      await them.getByRole('textbox', { name: 'Mã hạng vé' }).fill(ma);
      await them.getByRole('textbox', { name: 'Tên hạng vé' }).fill(ten);
      await them.getByRole('textbox', { name: 'Tỉ lệ đơn giá (%)' }).fill('90');
      await them.getByRole('button', { name: 'Lưu' }).click();
      await expect(toast(page, `Thêm hạng vé ${ten} thành công.`)).toBeVisible();
      await xemCsdl(page, `hạng vé ${ma} đã được thêm`, { bang: 'HANGVE', cot: 'MaHangVe', giaTri: ma, soDong: 1, dung: { TenHangVe: ten, TiLeDonGia: 90 } });

      await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Chuyến bay', exact: true }).click();
      await page.getByRole('link', { name: 'Thêm chuyến bay' }).click();
      await expect(page.getByLabel(`Số lượng ghế ${ten}`)).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: ma })).toContainText('90% đơn giá');
      await expect(page.getByLabel('Số lượng ghế Hạng 1', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Số lượng ghế Hạng 2', { exact: true })).toBeVisible();
    } finally {
      // hạng vé thử không được để lại vì biểu mẫu chuyến bay của các ca khác sẽ có thêm một hạng
      await api.xoaHangVeNeuCo(ma);
      await api.dong();
    }
  });

  test('UC08.18 Mở hộp thoại sửa tham số rồi bấm Hủy thì giá trị không đổi (QĐ6)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianBayToiThieu']);
    try {
      await dangNhap(page, 'quanLy', '/quy-dinh');
      const hop = await moThamSo(page, 'Thời gian bay tối thiểu');
      await expect(hop.getByText('Giá trị hiện tại')).toBeVisible();
      await go(oGiaTri(hop, 'phút'), String(cu.thoiGianBayToiThieu + 7));
      await hop.getByRole('button', { name: 'Hủy' }).click();
      await expect(hop).toBeHidden();
      await expect(theThamSo(page, 'Thời gian bay tối thiểu')).toHaveAccessibleName(
        `Thời gian bay tối thiểu: ${cu.thoiGianBayToiThieu} phút. Bấm để thay đổi`,
      );
      // mở lại: ô giá trị mới trống, không giữ giá trị đã gõ trước khi hủy
      const lai = await moThamSo(page, 'Thời gian bay tối thiểu');
      await expect(oGiaTri(lai, 'phút')).toHaveValue('');
      await lai.getByRole('button', { name: 'Hủy' }).click();
      await page.reload();
      await expect(theThamSo(page, 'Thời gian bay tối thiểu')).toHaveAccessibleName(
        `Thời gian bay tối thiểu: ${cu.thoiGianBayToiThieu} phút. Bấm để thay đổi`,
      );
      expect((await api.thamSo()).thoiGianBayToiThieu).toBe(cu.thoiGianBayToiThieu);
      await xemCsdl(page, 'bấm Hủy nên thời gian bay tối thiểu giữ nguyên', { bang: 'THAMSOQUYDINH', dung: { ThoiGianBayToiThieu: cu.thoiGianBayToiThieu } });
    } finally {
      await traGiaTriCu(api, cu);
      await api.dong();
    }
  });

  test('UC08.19 Máy A đổi quy định thì thao tác kế tiếp ở máy B (trình duyệt khác, đã mở sẵn) dùng giá trị mới, không khởi động lại máy chủ (HQ07, TH-15)', async ({ page, browser }) => {
    const api = await ApiThu.moi();
    const cu = await docGiaTriCu(api, ['thoiGianBayToiThieu']);
    const moi = cu.thoiGianBayToiThieu + 15;
    const mayB = await browser.newContext({ baseURL: DIA_CHI, extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' } });
    const trangB = await mayB.newPage();
    const cbCu = lichChuyenBayThu({ thoiGianBay: cu.thoiGianBayToiThieu });
    const cbMoi = lichChuyenBayThu({ thoiGianBay: moi });
    try {
      // máy B đăng nhập và mở biểu mẫu khi quy định còn giá trị cũ
      await dangNhap(trangB, 'quanLy', '/chuyen-bay/them');
      await expect(trangB.getByRole('heading', { level: 1, name: 'Thêm chuyến bay' })).toBeVisible();

      await dangNhap(page, 'quanLy', '/quy-dinh');
      const hop = await moThamSo(page, 'Thời gian bay tối thiểu');
      await go(oGiaTri(hop, 'phút'), String(moi));
      await hop.getByRole('button', { name: 'Lưu' }).click();
      await expect(toast(page, `Cập nhật quy định thành công: thời gian bay tối thiểu là ${moi} phút.`)).toBeVisible();

      // thao tác kế tiếp của máy B, không tải lại trang: mức cũ bị từ chối theo mức mới, mức mới lưu được
      const tuChoi = await trangB.request.post('/api/chuyen-bay', { data: cbCu });
      expect(tuChoi.status()).toBe(409);
      expect(await tuChoi.text()).toContain(`Thời gian bay phải từ ${moi} phút trở lên (QĐ1).`);
      const luu = await trangB.request.post('/api/chuyen-bay', { data: cbMoi });
      expect(luu.status()).toBe(201);
      // máy B mở màn hình Quy định thì thấy giá trị mới
      await trangB.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Quy định', exact: true }).click();
      await expect(theThamSo(trangB, 'Thời gian bay tối thiểu')).toHaveAccessibleName(`Thời gian bay tối thiểu: ${moi} phút. Bấm để thay đổi`);
      await xemCsdl(page, `máy B lưu theo mức mới ${moi} phút`,
        { bang: 'CHUYENBAY', cot: 'MaChuyenBay', giaTri: cbCu.maChuyenBay, soDong: 0 },
        { bang: 'CHUYENBAY', cot: 'MaChuyenBay', giaTri: cbMoi.maChuyenBay, soDong: 1, dung: { ThoiGianBay: moi } });
    } finally {
      await traGiaTriCu(api, cu);
      await api.xoaChuyenBayNeuCo(cbMoi.maChuyenBay);
      await api.dong();
      await mayB.close();
    }
  });

  test('UC08.21 Sân bay vừa xóa không còn ở ô chọn của ô tra cứu và biểu mẫu chuyến bay, không cần tải lại trang (TH01, TH-01)', async ({ page }) => {
    const ma = maChu('Q', 3, (await danhSachMa()).sanBay);
    const api = await ApiThu.moi();
    const menu = page.getByRole('navigation', { name: 'Menu chính' });
    const luaChon = () => page.getByRole('option', { name: new RegExp(`^${ma}`) });
    try {
      await api.themSanBay(ma, `Kiểm thử xóa ${ma}`);
      // mở trang tra cứu trước để danh sách sân bay (có sân bay thử) đã được nạp
      await dangNhap(page, 'quanLy', '/chuyen-bay');
      await page.getByRole('combobox', { name: 'Sân bay đi' }).click();
      await page.getByRole('combobox', { name: 'Sân bay đi' }).fill(ma);
      await expect(luaChon()).toBeVisible();

      await menu.getByRole('link', { name: 'Quy định', exact: true }).click();
      await page.getByRole('button', { name: `Xóa sân bay ${ma}` }).click();
      await bamTrongHopThoai(page, `Xóa sân bay ${ma}?`, 'Xóa');
      await expect(toast(page, `Xóa sân bay ${ma} thành công.`)).toBeVisible();

      await menu.getByRole('link', { name: 'Chuyến bay', exact: true }).click();
      for (const nhan of ['Sân bay đi', 'Sân bay đến']) {
        await page.getByRole('combobox', { name: nhan }).click();
        await page.getByRole('combobox', { name: nhan }).fill(ma);
        await expect(luaChon(), `ô tra cứu ${nhan}`).toHaveCount(0);
      }
      await page.getByRole('link', { name: 'Thêm chuyến bay' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Thêm chuyến bay' })).toBeVisible();
      for (const nhan of ['Sân bay đi', 'Sân bay đến']) {
        await page.getByRole('combobox', { name: nhan }).click();
        await page.getByRole('combobox', { name: nhan }).fill(ma);
        await expect(luaChon(), `biểu mẫu ${nhan}`).toHaveCount(0);
      }
      await xemCsdl(page, `sân bay ${ma} đã bị xóa`, { bang: 'SANBAY', cot: 'MaSanBay', giaTri: ma, soDong: 0 });
    } finally {
      await api.xoaSanBayNeuCo(ma);
      await api.dong();
    }
  });
});
