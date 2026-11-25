import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Download, type Page } from '@playwright/test';
import {
  bamTrongHopThoai, chonTrongOChon, dangNhap, hopThoai, maMoi, mocVN, nhapNgay, soCanCuocMoi, toast,
} from '../kiem_thu_e2e/tien_ich/chung';

const ketQua = new URL('./ket_qua/', import.meta.url);
const soLan = Number(process.env.HQ_SO_LAN ?? '10');
const thamSo = '/api/quy-dinh/tham-so/thoiGianBayToiThieu';

const nut = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const chonSanBay = (page: Page, name: string, ma: string) =>
  chonTrongOChon(page.getByRole('combobox', { name }), ma, new RegExp('^' + ma));

async function chuanBiChuyenBay(page: Page, ma: string) {
  await page.goto('/chuyen-bay/them');
  await page.getByRole('textbox', { name: 'Mã chuyến bay' }).fill(ma);
  await page.getByRole('textbox', { name: 'Giá vé (VND)' }).fill('1500000');
  await chonSanBay(page, 'Sân bay đi', 'SGN');
  await chonSanBay(page, 'Sân bay đến', 'HAN');
  await nhapNgay(page, 'Ngày giờ khởi hành', mocVN(7, 10).vnGio);
  await page.getByRole('textbox', { name: 'Thời gian bay (phút)' }).fill('130');
  await page.getByLabel('Số lượng ghế Hạng 1').fill('20');
  await page.getByLabel('Số lượng ghế Hạng 2').fill('180');
  const bang = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Sân bay trung gian' }) });
  for (const [i, sb] of ['DAD', 'CXR'].entries()) {
    await nut(page, 'Thêm sân bay trung gian').click();
    await chonTrongOChon(bang.getByRole('combobox').nth(i), sb, new RegExp('^' + sb));
    await bang.getByLabel('Thời gian dừng (phút)').nth(i).fill('15');
    await bang.getByLabel('Ghi chú').nth(i).fill('Dừng kỹ thuật');
  }
}

async function chuanBiVe(page: Page, dat: boolean) {
  await page.goto('/' + (dat ? 'dat-ve' : 'ban-ve') + '?maChuyenBay=HQBAN100');
  await expect(page.getByRole('combobox', { name: 'Chuyến bay' })).toHaveValue(/HQBAN100/);
  const form = page.getByRole('form');
  await form.getByRole('textbox', { name: 'Hành khách' }).fill('Trần Thị Kiểm Thử');
  // Dải 9 tách khỏi các số căn cước nạp bằng SQL.
  await form.getByRole('textbox', { name: 'CCCD/Hộ chiếu' }).fill('9' + soCanCuocMoi().slice(1));
  await form.getByRole('textbox', { name: 'Điện thoại' }).fill('0934567890');
  const hang = form.getByRole('radio', { name: /^Hạng 2/ });
  await page.locator('label').filter({ has: hang }).or(hang).first().click();
  return form;
}

test('Đo HQ01, HQ02, HQ03, HQ05, HQ06 và HQ07', async ({ page, context, baseURL }) => {
  if (baseURL !== 'http://localhost:5095') throw new Error('Chỉ đo bản HQ trên cổng 5095.');
  if (!Number.isSafeInteger(soLan) || soLan < 1 || soLan > 50) throw new Error('HQ_SO_LAN phải từ 1 đến 50.');
  const state = JSON.parse((await readFile(new URL('may-chu.json', ketQua), 'utf8')).replace(/^\uFEFF/, ''));
  const instance = await page.request.get('/hq-instance.txt', { maxRedirects: 0 });
  expect(instance.ok()).toBeTruthy();
  expect(await instance.text()).toBe(state.token);

  await mkdir(ketQua, { recursive: true });
  const moc = new Date().toISOString().replace(/[:.]/g, '-');
  const csv = new URL('giao_dien_' + moc + '.csv', ketQua);
  await appendFile(csv, '\uFEFFPhepDo,Lan,MiliGiay\r\n', { flag: 'wx' });
  console.log(fileURLToPath(csv));
  let lan = 1;
  async function doGiaoDien(ten: string, thaoTac: () => Promise<void>) {
    const dau = performance.now();
    await thaoTac();
    const ms = performance.now() - dau;
    await appendFile(csv, [ten, lan, ms.toFixed(3)].join(',') + '\r\n');
  }

  const nv = await context.browser()!.newContext({
    baseURL, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const trangNV = await nv.newPage();
  trangNV.setDefaultTimeout(20_000);
  trangNV.setDefaultNavigationTimeout(30_000);
  await dangNhap(page, 'quanLy');
  await dangNhap(trangNV, 'nhanVien');
  const r = await page.request.get('/api/quy-dinh');
  expect(r.ok()).toBeTruthy();
  const cu = (await r.json()).thamSo.thoiGianBayToiThieu;
  const ky = mocVN(0);
  const thangBaoCao = 6;

  try {
    for (; lan <= soLan; lan++) {
      const ma = maMoi('TUI');
      await chuanBiChuyenBay(page, ma);
      await doGiaoDien('HQ01', async () => {
        await nut(page, 'Lưu chuyến bay').click();
        await expect(toast(page, 'Thêm chuyến bay ' + ma + ' thành công.')).toBeVisible();
      });
      for (const dat of [false, true]) {
        const form = await chuanBiVe(trangNV, dat);
        const ten = dat ? 'Đặt vé' : 'Bán vé';
        await doGiaoDien(dat ? 'HQ03' : 'HQ02', async () => {
          await form.getByRole('button', { name: ten, exact: true }).click();
          await bamTrongHopThoai(trangNV, 'Xác nhận ' + ten.toLowerCase() + '?', ten);
          await expect(hopThoai(trangNV, ten + ' thành công')).toBeVisible();
        });
      }
      const ketQuaTim = trangNV.getByText(/Tìm thấy [\d.]+ chuyến bay thỏa tiêu chí|Chỉ hiển thị [\d.]+ chuyến bay/);
      for (const loai of ['tuyen', 'ma', 'tat_ca']) {
        await trangNV.goto('/chuyen-bay');
        await expect(ketQuaTim).toBeVisible();
        await nhapNgay(trangNV, 'Từ ngày', loai === 'tuyen' ? '01/01/' + ky.nam : '');
        if (loai === 'tuyen') {
          await chonSanBay(trangNV, 'Sân bay đi', 'SGN');
          await chonSanBay(trangNV, 'Sân bay đến', 'HAN');
          await nhapNgay(trangNV, 'Đến ngày', '31/12/' + ky.nam);
        }
        if (loai === 'ma') await trangNV.getByRole('textbox', { name: 'Mã chuyến bay' }).fill('HQ1234');
        await doGiaoDien('HQ05_' + loai, async () => {
          const cho = trangNV.waitForResponse(resp => new URL(resp.url()).pathname === '/api/chuyen-bay' &&
            resp.request().method() === 'GET');
          await nut(trangNV, 'Tìm').click();
          expect((await cho).ok()).toBeTruthy();
          await expect(ketQuaTim).toBeVisible();
          await expect(trangNV.getByRole('table', { name: 'Danh sách chuyến bay' }).locator('tbody tr').first()).toBeVisible();
        });
      }
      for (const loai of ['thang', 'nam']) {
        await page.goto('/bao-cao');
        await page.getByRole('tab', { name: loai === 'thang' ? 'Báo cáo tháng' : 'Báo cáo năm' }).click();
        if (loai === 'thang') await page.getByRole('combobox', { name: 'Tháng' }).selectOption(String(thangBaoCao));
        await page.getByRole('combobox', { name: 'Năm' }).selectOption(String(ky.nam));
        await doGiaoDien('HQ06_' + loai, async () => {
          await nut(page, 'Lập báo cáo').click();
          await expect(page.getByText(loai === 'thang' ? 'Tháng: ' + thangBaoCao + '/' + ky.nam : 'Năm: ' + ky.nam, { exact: true })).toBeVisible();
          await expect(page.getByRole('region').filter({ has: page.locator('#tieu-de-bang-bao-cao') }).locator('table')).toBeVisible();
        });
        for (const [ten, ext] of [['Excel', 'xlsx'], ['PDF', 'pdf']]) {
          let download: Download | undefined;
          await doGiaoDien('HQ06_' + loai + '_' + ten.toLowerCase(), async () => {
            [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), nut(page, 'Xuất ' + ten).click()]);
            const tenTep = download.suggestedFilename();
            expect(tenTep.endsWith('.' + ext)).toBeTruthy();
            await expect(toast(page, 'Đã xuất báo cáo ra tập tin ' + tenTep)).toBeVisible();
          });
          if (!download) throw new Error('Thiếu tệp báo cáo.');
          await download.saveAs(fileURLToPath(new URL(
            moc + '-ui_' + loai + '_' + lan + '.' + ext, ketQua)));
        }
      }
      await page.goto('/quy-dinh');
      await page.getByRole('button', { name: /^Thời gian bay tối thiểu: .*Bấm để thay đổi$/ }).click();
      const hop = hopThoai(page, 'Cập nhật quy định');
      const moi = 30 + lan % 2;
      await hop.getByRole('textbox', { name: 'Giá trị mới (phút)' }).fill(String(moi));
      await doGiaoDien('HQ07', async () => {
        await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
        await expect(toast(page, 'Cập nhật quy định thành công: thời gian bay tối thiểu là ' + moi + ' phút.')).toBeVisible();
      });
    }
  } finally {
    try {
      expect((await page.request.put(thamSo, { data: { giaTriMoi: cu } })).status()).toBe(204);
    } finally { await nv.close(); }
  }
});
