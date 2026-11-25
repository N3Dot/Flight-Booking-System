// Bổ sung UC02 Phân quyền: kiểm tra từng ô của biểu mẫu tài khoản, độ dài tên đăng nhập, đặt lại mật khẩu,
// tìm và chuyển trang danh sách, hủy biểu mẫu, không lộ mật khẩu (BMT02).
import { expect, request, test, xemCsdl, type Locator, type Page } from '../tien_ich/trinh_dien';
import { ApiThu, DIA_CHI, bamTrongHopThoai, dangNhap, hopThoai, maMoi, tenDangNhapMoi, toast, khoaTaiKhoanThuSauMoiCa } from '../tien_ich/chung';

const MAT_KHAU = 'Kiemthu@123';

async function thuDangNhapApi(ten: string, matKhau: string): Promise<number> {
  const yc = await request.newContext({ baseURL: DIA_CHI });
  const ph = await yc.post('/api/dang-nhap', { data: { tenDangNhap: ten, matKhau } });
  await yc.dispose();
  return ph.status();
}

function bangTaiKhoan(page: Page) {
  return page.getByRole('table', { name: 'Danh sách tài khoản' });
}

async function dongTaiKhoan(page: Page, ten: string) {
  const o = page.getByRole('textbox', { name: 'Tìm tài khoản' });
  if ((await o.inputValue()) !== ten) await o.fill(ten);
  const dong = bangTaiKhoan(page).getByRole('row').filter({ has: page.getByText(ten, { exact: true }) });
  await expect(dong).toHaveCount(1);
  return dong;
}

async function moThemTaiKhoan(page: Page) {
  await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
  const hop = hopThoai(page, 'Thêm tài khoản');
  await expect(hop).toBeVisible();
  return hop;
}

function oTen(hop: Locator) {
  return hop.getByRole('textbox', { name: 'Tên đăng nhập' });
}
function oMatKhau(hop: Locator) {
  return hop.getByRole('textbox', { name: 'Mật khẩu', exact: true });
}
function oNhapLai(hop: Locator) {
  return hop.getByRole('textbox', { name: 'Nhập lại mật khẩu', exact: true });
}

/** Khung của một ô (nhãn, ô nhập, dòng lỗi) để kiểm lỗi nằm đúng ô. */
function khungO(o: Locator) {
  return o.locator('xpath=ancestor::div[label][1]');
}

/** Tên tài khoản có trong máy chủ hay không (gọi API bằng phiên của trang). */
async function coTaiKhoan(page: Page, ten: string): Promise<boolean> {
  const ds = (await (await page.request.get('/api/tai-khoan')).json()) as { tenDangNhap: string }[];
  return ds.some((t) => t.tenDangNhap.toLowerCase() === ten.toLowerCase());
}

test.describe('Bổ sung UC02 Phân quyền', () => {
  khoaTaiKhoanThuSauMoiCa(test);
  test('UC02.10 Mật khẩu và Nhập lại mật khẩu không khớp thì báo lỗi tại ô Nhập lại, không lưu (BMT02)', async ({ page }) => {
    const ten = tenDangNhapMoi('nl');
    await dangNhap(page, 'quanLy', '/tai-khoan');
    const hop = await moThemTaiKhoan(page);
    await oTen(hop).fill(ten);
    await oMatKhau(hop).fill(MAT_KHAU);
    await oNhapLai(hop).fill(MAT_KHAU + 'x');
    await hop.getByRole('button', { name: 'Lưu' }).click();

    await expect(khungO(oNhapLai(hop)).getByRole('alert')).toHaveText(/Mật khẩu nhập lại không khớp/);
    await expect(oNhapLai(hop)).toHaveAttribute('aria-invalid', 'true');
    await expect(oMatKhau(hop)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(hop).toBeVisible();
    expect(await coTaiKhoan(page, ten)).toBe(false);
    await xemCsdl(page, `tài khoản ${ten} không được lưu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 0 });
  });

  test('UC02.11 Bỏ trống tên, mật khẩu hoặc nhóm quyền thì báo lỗi đúng ô (UC02 bước 6)', async ({ page }) => {
    const ten = tenDangNhapMoi('bt');
    await dangNhap(page, 'quanLy', '/tai-khoan');
    const hop = await moThemTaiKhoan(page);

    // bỏ trống tên
    await oMatKhau(hop).fill(MAT_KHAU);
    await oNhapLai(hop).fill(MAT_KHAU);
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(khungO(oTen(hop)).getByRole('alert')).toHaveText(/Chưa nhập tên đăng nhập/);
    await expect(oTen(hop)).toHaveAttribute('aria-invalid', 'true');
    await expect(khungO(oMatKhau(hop)).getByRole('alert')).toHaveCount(0);

    // bỏ trống mật khẩu
    await oTen(hop).fill(ten);
    await oMatKhau(hop).fill('');
    await oNhapLai(hop).fill('');
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(khungO(oMatKhau(hop)).getByRole('alert')).toHaveText(/Chưa nhập mật khẩu/);
    await expect(oMatKhau(hop)).toHaveAttribute('aria-invalid', 'true');
    await expect(khungO(oTen(hop)).getByRole('alert')).toHaveCount(0);

    // nhóm quyền: biểu mẫu luôn chọn sẵn một nhóm, không bỏ trống được trên giao diện
    const cacNhom = hop.locator('input[type="radio"][name="nhomQuyen"]');
    await expect(cacNhom).toHaveCount(2);
    await expect(hop.locator('input[type="radio"][name="nhomQuyen"]:checked')).toHaveCount(1);
    // gửi thẳng lên máy chủ mà bỏ trống nhóm quyền thì bị từ chối và báo đúng ô nhomQuyen
    const ph = await page.request.post('/api/tai-khoan', { data: { tenDangNhap: ten, matKhau: MAT_KHAU, nhomQuyen: null } });
    expect(ph.status()).toBe(400);
    const than = await ph.json();
    expect(Object.keys(than.chiTiet)).toEqual(['nhomQuyen']);

    expect(await coTaiKhoan(page, ten)).toBe(false);
    await xemCsdl(page, `tài khoản ${ten} không được lưu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 0 });
  });

  test('UC02.12 Tên đăng nhập có khoảng trắng ở giữa bị từ chối (ràng buộc bảng TAIKHOAN)', async ({ page }) => {
    const duoi = tenDangNhapMoi('');
    const tenCoCach = `nv moi${duoi}`;
    await dangNhap(page, 'quanLy', '/tai-khoan');
    const hop = await moThemTaiKhoan(page);
    await oTen(hop).pressSequentially(tenCoCach);
    // ô tên không nhận khoảng trắng
    await expect(oTen(hop)).toHaveValue(`nvmoi${duoi}`);
    await hop.getByRole('button', { name: 'Hủy' }).click();
    await bamTrongHopThoai(page, 'Hủy thông tin đang nhập?', 'Hủy thay đổi');

    // gửi thẳng lên máy chủ thì bị từ chối kèm lý do, không lỗi hệ thống
    const ph = await page.request.post('/api/tai-khoan', { data: { tenDangNhap: tenCoCach, matKhau: MAT_KHAU, nhomQuyen: 'NhanVien' } });
    expect(ph.status()).toBe(400);
    expect((await ph.json()).chiTiet.tenDangNhap).toMatch(/không chứa khoảng trắng/);
    expect(await coTaiKhoan(page, tenCoCach)).toBe(false);
    await xemCsdl(page, 'không có tài khoản chứa khoảng trắng', { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: tenCoCach, soDong: 0 });
  });

  test('UC02.13 Tên đăng nhập 30 ký tự lưu được, 31 ký tự bị chặn và có thông báo (cột varchar(30))', async ({ page }) => {
    const goc = tenDangNhapMoi('dd');
    const ten30 = goc.padEnd(30, 'x');
    const ten31 = goc.padEnd(31, 'y');
    await dangNhap(page, 'quanLy', '/tai-khoan');

    // 30 ký tự: lưu được
    let hop = await moThemTaiKhoan(page);
    await oTen(hop).pressSequentially(ten30);
    await oMatKhau(hop).fill(MAT_KHAU);
    await oNhapLai(hop).fill(MAT_KHAU);
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page, `Thêm tài khoản ${ten30} thành công.`)).toBeVisible();
    await dongTaiKhoan(page, ten30);
    expect(await thuDangNhapApi(ten30, MAT_KHAU)).toBe(200);
    await xemCsdl(page, `tài khoản 30 ký tự ${ten30} đã được thêm`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten30, soDong: 1 });

    // 31 ký tự: ô chỉ nhận 30 ký tự đầu, dòng gợi ý cho biết giới hạn
    hop = await moThemTaiKhoan(page);
    await oTen(hop).pressSequentially(ten31);
    await expect(oTen(hop)).toHaveValue(ten31.slice(0, 30));
    await expect(khungO(oTen(hop))).toContainText('Tối đa 30 ký tự');
    await hop.getByRole('button', { name: 'Hủy' }).click();
    await bamTrongHopThoai(page, 'Hủy thông tin đang nhập?', 'Hủy thay đổi');

    // gửi thẳng 31 ký tự lên máy chủ: bị từ chối với thông báo, không lỗi hệ thống
    const ph = await page.request.post('/api/tai-khoan', { data: { tenDangNhap: ten31, matKhau: MAT_KHAU, nhomQuyen: 'NhanVien' } });
    expect(ph.status()).toBe(400);
    expect((await ph.json()).chiTiet.tenDangNhap).toMatch(/tối đa 30 ký tự/);
    expect(await coTaiKhoan(page, ten31)).toBe(false);
    await xemCsdl(page, `tài khoản 31 ký tự không được lưu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten31, soDong: 0 });
  });

  test('UC02.14 Sửa tài khoản để trống mật khẩu mới thì giữ mật khẩu cũ (UC02 bước 4)', async ({ page }) => {
    const ten = tenDangNhapMoi('gm');
    const api = await ApiThu.moi();
    await api.themTaiKhoan(ten, MAT_KHAU, 'NhanVien');
    await api.dong();

    await dangNhap(page, 'quanLy', '/tai-khoan');
    await (await dongTaiKhoan(page, ten)).getByRole('button', { name: 'Sửa' }).click();
    const hop = hopThoai(page, `Sửa tài khoản ${ten}`);
    await expect(hop).toBeVisible();
    await expect(hop.getByRole('textbox', { name: 'Mật khẩu mới', exact: true })).toHaveValue('');
    // đổi nhóm quyền, để trống mật khẩu mới
    await hop.locator('label:has(input[type="radio"][value="QuanLy"])').click();
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page, `Cập nhật tài khoản ${ten} thành công.`)).toBeVisible();
    await expect(await dongTaiKhoan(page, ten)).toContainText('Quản lý');

    expect(await thuDangNhapApi(ten, MAT_KHAU)).toBe(200);
    await xemCsdl(page, `tài khoản ${ten} đổi nhóm quyền, giữ mật khẩu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 1, dung: { NhomQuyen: 'Quản lý' } });
  });

  test('UC02.15 Sửa tài khoản đặt lại mật khẩu mới thì mật khẩu mới dùng được, mật khẩu cũ bị từ chối (UC02 bước 4)', async ({ page }) => {
    const ten = tenDangNhapMoi('dl');
    const matKhauMoi = 'MatKhauMoi@' + maMoi('M');
    const api = await ApiThu.moi();
    await api.themTaiKhoan(ten, MAT_KHAU, 'NhanVien');
    await api.dong();

    await dangNhap(page, 'quanLy', '/tai-khoan');
    await (await dongTaiKhoan(page, ten)).getByRole('button', { name: 'Sửa' }).click();
    const hop = hopThoai(page, `Sửa tài khoản ${ten}`);
    await expect(hop).toBeVisible();
    await hop.getByRole('textbox', { name: 'Mật khẩu mới', exact: true }).fill(matKhauMoi);
    await hop.getByRole('textbox', { name: 'Nhập lại mật khẩu mới', exact: true }).fill(matKhauMoi);
    await hop.getByRole('button', { name: 'Lưu' }).click();
    await expect(toast(page, `Cập nhật tài khoản ${ten} thành công.`)).toBeVisible();
    await expect(hop).toBeHidden();

    expect(await thuDangNhapApi(ten, matKhauMoi)).toBe(200);
    expect(await thuDangNhapApi(ten, MAT_KHAU)).toBe(401);
    await xemCsdl(page, `tài khoản ${ten} đã đặt lại mật khẩu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 1, dung: { NhomQuyen: 'Nhân viên bán vé' } });
  });

  test('UC02.17 Tìm tài khoản theo tên lọc đúng; danh sách nhiều trang chuyển trang đúng (BMT02)', async ({ page }) => {
    const tienTo = tenDangNhapMoi('ds');
    const cacTen = Array.from({ length: 12 }, (_, i) => `${tienTo}_${String(i + 1).padStart(2, '0')}`);
    const api = await ApiThu.moi();
    for (const ten of cacTen) await api.themTaiKhoan(ten, MAT_KHAU, 'NhanVien');
    await api.dong();

    await dangNhap(page, 'quanLy', '/tai-khoan');
    const bang = bangTaiKhoan(page);
    const dongDuLieu = bang.locator('tbody tr');
    const phanTrang = page.getByRole('navigation', { name: 'Phân trang' });

    // tìm theo tiền tố chung: 12 tài khoản, mỗi trang 10 dòng
    await page.getByRole('textbox', { name: 'Tìm tài khoản' }).fill(tienTo.toUpperCase());
    await expect(page.getByText(/Hiển thị\s*1\s*đến\s*10\s*trong\s*12\s*tài khoản/)).toBeVisible();
    await expect(dongDuLieu).toHaveCount(10);
    for (const ten of cacTen.slice(0, 10)) await expect(dongDuLieu.filter({ hasText: ten })).toHaveCount(1);
    await expect(phanTrang.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    await phanTrang.getByRole('button', { name: 'Trang sau' }).click();
    await expect(page.getByText(/Hiển thị\s*11\s*đến\s*12\s*trong\s*12\s*tài khoản/)).toBeVisible();
    await expect(dongDuLieu).toHaveCount(2);
    await expect(dongDuLieu.filter({ hasText: cacTen[10] })).toHaveCount(1);
    await expect(dongDuLieu.filter({ hasText: cacTen[11] })).toHaveCount(1);
    await expect(phanTrang.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(phanTrang.getByRole('button', { name: 'Trang sau' })).toBeDisabled();

    await phanTrang.getByRole('button', { name: '1', exact: true }).click();
    await expect(dongDuLieu).toHaveCount(10);
    await expect(dongDuLieu.first()).toContainText(cacTen[0]);

    // tìm đúng một tên thì chỉ còn một dòng, không còn phân trang
    await page.getByRole('textbox', { name: 'Tìm tài khoản' }).fill(cacTen[11]);
    await expect(dongDuLieu).toHaveCount(1);
    await expect(dongDuLieu).toContainText(cacTen[11]);
    await expect(phanTrang).toHaveCount(0);

    // tên không có thì hiện danh sách trống có lời nhắn
    await page.getByRole('textbox', { name: 'Tìm tài khoản' }).fill(`${tienTo}_khongco`);
    await expect(page.getByText('Không có tài khoản phù hợp')).toBeVisible();
    await expect(dongDuLieu).toHaveCount(0);
  });

  test('UC02.18 Bấm Hủy khi biểu mẫu còn trống thì đóng luôn, đã nhập dở thì hỏi xác nhận (Ch.5 Thiết kế giao diện)', async ({ page }) => {
    const ten = tenDangNhapMoi('hy');
    await dangNhap(page, 'quanLy', '/tai-khoan');

    // còn trống: đóng ngay, không hỏi
    let hop = await moThemTaiKhoan(page);
    await hop.getByRole('button', { name: 'Hủy' }).click();
    await expect(hop).toBeHidden();
    await expect(hopThoai(page, 'Hủy thông tin đang nhập?')).toHaveCount(0);

    // đã nhập dở: hỏi lại; chọn Tiếp tục nhập thì giữ nguyên dữ liệu đã nhập
    hop = await moThemTaiKhoan(page);
    await oTen(hop).fill(ten);
    await oMatKhau(hop).fill(MAT_KHAU);
    await hop.getByRole('button', { name: 'Hủy' }).click();
    await bamTrongHopThoai(page, 'Hủy thông tin đang nhập?', 'Tiếp tục nhập');
    await expect(hop).toBeVisible();
    await expect(oTen(hop)).toHaveValue(ten);
    await expect(oMatKhau(hop)).toHaveValue(MAT_KHAU);

    // chọn Hủy thay đổi thì đóng, không lưu
    await hop.getByRole('button', { name: 'Hủy' }).click();
    await bamTrongHopThoai(page, 'Hủy thông tin đang nhập?', 'Hủy thay đổi');
    await expect(hop).toBeHidden();
    expect(await coTaiKhoan(page, ten)).toBe(false);
    await xemCsdl(page, `tài khoản ${ten} không được lưu`, { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 0 });
  });

  test('UC02.19 Danh sách tài khoản và CSDL không lộ mật khẩu (BMT01)', async ({ page }) => {
    const ten = tenDangNhapMoi('mk');
    const matKhau = 'MatKhauRieng@' + maMoi('P');
    const api = await ApiThu.moi();
    await api.themTaiKhoan(ten, matKhau, 'NhanVien');
    await api.dong();

    await dangNhap(page, 'quanLy', '/tai-khoan');
    // bảng không có cột mật khẩu, dòng tài khoản không chứa mật khẩu
    const dong = await dongTaiKhoan(page, ten);
    await expect(bangTaiKhoan(page).getByRole('columnheader', { name: 'Tên đăng nhập' })).toBeVisible();
    const tieuDeCot = await bangTaiKhoan(page).getByRole('columnheader').allInnerTexts();
    expect(tieuDeCot.join(' | ')).not.toMatch(/mật khẩu/i);
    await expect(dong).not.toContainText(matKhau);

    // dữ liệu máy chủ trả về cho trang cũng không có trường mật khẩu
    const ds = (await (await page.request.get('/api/tai-khoan')).json()) as Record<string, unknown>[];
    const cua = ds.find((t) => t.tenDangNhap === ten)!;
    expect(Object.keys(cua).sort()).toEqual(['nhomQuyen', 'tenDangNhap', 'trangThai']);
    expect(JSON.stringify(ds)).not.toContain(matKhau);

    // trong CSDL: có đúng một dòng của tài khoản nhưng không dòng nào lưu mật khẩu ở dạng gốc (đã băm)
    const docCsdl = async (cot: string, giaTri: string) => {
      const ph = await page.request.get('/api/kiem-thu/csdl', { params: { bang: 'TAIKHOAN', cot, giaTri } });
      expect(ph.ok(), `đọc bảng TAIKHOAN theo ${cot}`).toBeTruthy();
      return ((await ph.json()) as { cacDong: unknown[][] }).cacDong.length;
    };
    expect(await docCsdl('TenDangNhap', ten)).toBe(1);
    expect(await docCsdl('MatKhau', matKhau)).toBe(0);
    await xemCsdl(
      page,
      `mật khẩu của ${ten} không lưu ở dạng gốc`,
      { bang: 'TAIKHOAN', cot: 'TenDangNhap', giaTri: ten, soDong: 1 },
      { bang: 'TAIKHOAN', cot: 'MatKhau', giaTri: matKhau, soDong: 0 },
    );
  });
});
