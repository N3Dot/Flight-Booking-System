// Bổ sung UC07 Lập báo cáo doanh thu: tháng rỗng, chỉ tính vé Đã bán theo tháng khởi hành (giả định 4),
// tổng tỉ lệ, tháng không có doanh thu trong báo cáo năm, đối chiếu tập tin Excel và PDF với màn hình (TT03).
import { expect, test, xemCsdl, type Download, type Page } from '../tien_ich/trinh_dien';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { ApiThu, dangNhap, hopThoai, mocVN } from '../tien_ich/chung';
import { docZip } from '../tien_ich/excel';

/* ---------------- thao tác trên màn hình báo cáo ---------------- */

function bangBaoCao(page: Page) {
  return page.getByRole('region').filter({ has: page.locator('#tieu-de-bang-bao-cao') }).locator('table');
}

/** Chọn loại báo cáo, kỳ báo cáo rồi bấm Lập báo cáo (chưa chờ bảng vì kỳ rỗng không có bảng). */
async function chonVaLap(page: Page, loai: 'thang' | 'nam', nam: number, thang?: number) {
  await page.getByRole('tab', { name: loai === 'thang' ? 'Báo cáo tháng' : 'Báo cáo năm' }).click();
  if (thang) await page.getByRole('combobox', { name: 'Tháng' }).selectOption(String(thang));
  await page.getByRole('combobox', { name: 'Năm' }).selectOption(String(nam));
  await page.getByRole('button', { name: 'Lập báo cáo' }).click();
}

async function lapBaoCao(page: Page, loai: 'thang' | 'nam', nam: number, thang?: number) {
  await chonVaLap(page, loai, nam, thang);
  await expect(page.getByText(loai === 'thang' ? `Tháng: ${thang}/${nam}` : `Năm: ${nam}`)).toBeVisible();
  await expect(bangBaoCao(page)).toBeVisible();
}

/** Chữ trong từng ô của các dòng thân bảng và dòng tổng. */
async function docBangManHinh(page: Page): Promise<{ dong: string[][]; tong: string[] }> {
  const bang = bangBaoCao(page);
  const dong: string[][] = [];
  for (const d of await bang.locator('tbody tr').all()) dong.push((await d.locator('td').allTextContents()).map((o) => o.trim()));
  const tong = (await bang.locator('tfoot tr td').allTextContents()).map((o) => o.trim());
  return { dong, tong };
}

function soTien(chu: string): number {
  return Number(chu.replace(/[^\d]/g, ''));
}

/** '18,63%' sang 18.63 */
function soTiLe(chu: string): number {
  return Number((chu.match(/([\d.,]+)\s*%/)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'));
}

/** Số ngày từ hôm nay tới một ngày của tháng sau (giờ Việt Nam). */
function lechSangThangSau(ngayTrongThang = 5): number {
  const nay = mocVN(0);
  let lech = 1;
  while (mocVN(lech).thang === nay.thang) lech++;
  return lech + ngayTrongThang - 1;
}

/** Tháng trước tháng hiện tại (đã qua hết nên số liệu không đổi). */
function thangTruoc(): { thang: number; nam: number } {
  const nay = mocVN(0);
  return nay.thang === 1 ? { thang: 12, nam: nay.nam - 1 } : { thang: nay.thang - 1, nam: nay.nam };
}

/* ---------------- đọc tập tin tải về ---------------- */

const giaiMaXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Các dòng của trang tính đầu tiên: ô chữ thành chuỗi, ô số thành số, ô trống là null. */
function docTrangTinh(tapTin: Buffer): (string | number | null)[][] {
  const phan = docZip(tapTin);
  const chung = [...(phan.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) =>
    giaiMaXml([...m[1].matchAll(/<(?:\w+:)?t(?: [^>]*)?>([^<]*)<\/(?:\w+:)?t>/g)].map((t) => t[1]).join('')),
  );
  const tenTrang = [...phan.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const xml = phan.get(tenTrang)!.toString('utf8');
  const ketQua: (string | number | null)[][] = [];
  for (const o of xml.matchAll(/<(?:\w+:)?c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const cot = [...o[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const dong = Number(o[2]) - 1;
    const kieu = o[3].match(/t="(\w+)"/)?.[1];
    const v = o[4]?.match(/<(?:\w+:)?v>([^<]*)<\/(?:\w+:)?v>/)?.[1];
    let giaTri: string | number | null = null;
    if (kieu === 's' && v !== undefined) giaTri = chung[Number(v)];
    else if (kieu === 'inlineStr') giaTri = giaiMaXml([...(o[4] ?? '').matchAll(/<(?:\w+:)?t(?: [^>]*)?>([^<]*)</g)].map((t) => t[1]).join(''));
    else if (kieu === 'str' && v !== undefined) giaTri = giaiMaXml(v);
    else if (v !== undefined) giaTri = Number(v);
    (ketQua[dong] ??= [])[cot] = giaTri;
  }
  return Array.from(ketQua, (d) => Array.from(d ?? [], (x) => x ?? null));
}

/**
 * Các đoạn chữ trong tập tin PDF theo thứ tự vẽ (mỗi ô của bảng là một đoạn).
 * Chữ được giải mã qua bảng ToUnicode của từng phông nên đọc đúng tiếng Việt có dấu.
 */
function docChuPdf(tapTin: Buffer): string[] {
  const s = tapTin.toString('latin1');
  const doiTuong = new Map<string, { dict: string; duLieu: Buffer | null }>();
  for (const m of s.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const than = m[2];
    const viTriStream = than.indexOf('stream');
    const dict = viTriStream >= 0 ? than.slice(0, viTriStream) : than;
    let duLieu: Buffer | null = null;
    if (viTriStream >= 0) {
      let batDau = m.index! + m[0].indexOf('stream') + 6;
      if (s[batDau] === '\r') batDau++;
      if (s[batDau] === '\n') batDau++;
      const doDai = Number(dict.match(/\/Length (\d+)/)?.[1] ?? 0);
      const tho = tapTin.subarray(batDau, batDau + doDai);
      duLieu = /FlateDecode/.test(dict) ? inflateSync(tho) : tho;
    }
    doiTuong.set(m[1], { dict, duLieu });
  }
  const docCmap = (c: string) => {
    const bang = new Map<number, string>();
    const u16 = (h: string) => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
    for (const k of c.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const x of k[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) bang.set(parseInt(x[1], 16), u16(x[2]));
    for (const k of c.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const x of k[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const [dau, cuoi, dich] = [x[1], x[2], x[3]].map((h) => parseInt(h, 16));
        for (let i = dau; i <= cuoi; i++) bang.set(i, String.fromCharCode(dich + i - dau));
      }
    return bang;
  };
  const phong = new Map<string, Map<number, string>>();
  for (const [, o] of doiTuong)
    for (const f of o.dict.matchAll(/\/Font\s*<<([^>]*)>>/g))
      for (const x of f[1].matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
        const ma = doiTuong.get(x[2])?.dict.match(/\/ToUnicode (\d+) 0 R/)?.[1];
        const cmap = ma ? doiTuong.get(ma)?.duLieu : null;
        if (cmap) phong.set(x[1], docCmap(cmap.toString('latin1')));
      }
  const doan: string[] = [];
  for (const [, o] of doiTuong) {
    if (!o.duLieu || /Length1|FontFile/.test(o.dict)) continue;
    const c = o.duLieu.toString('latin1');
    if (!/\bBT\b/.test(c) || /begincmap/.test(c)) continue;
    let bang: Map<number, string> | undefined;
    let hienTai = '';
    for (const t of c.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj|\b(ET|Tm|Td|TD|T\*)\b/g)) {
      if (t[1]) bang = phong.get(t[1]);
      else if (t[2] !== undefined || t[3] !== undefined) {
        const cacChuoi = t[3] !== undefined ? [t[3]] : [...t[2].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => x[1]);
        for (const h of cacChuoi) for (let i = 0; i + 4 <= h.length; i += 4) hienTai += bang?.get(parseInt(h.slice(i, i + 4), 16)) ?? '';
      } else if (hienTai) {
        doan.push(hienTai.normalize('NFC'));
        hienTai = '';
      }
    }
    if (hienTai) doan.push(hienTai.normalize('NFC'));
  }
  return doan;
}

/** Có dãy liên tiếp các đoạn chữ đúng bằng dãy cho trước. */
function coDayLienTiep(doan: string[], day: string[]): boolean {
  return doan.some((_, i) => day.every((x, j) => doan[i + j] === x));
}

async function taiVe(page: Page, nut: 'Xuất Excel' | 'Xuất PDF'): Promise<{ tai: Download; noiDung: Buffer }> {
  const cho = page.waitForEvent('download');
  await page.getByRole('button', { name: nut }).click();
  const tai = await cho;
  return { tai, noiDung: await readFile((await tai.path())!) };
}

const dangSoPdf = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 });
const dangTiLePdf = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

test.describe('Bổ sung UC07 Báo cáo doanh thu', () => {
  test('UC07.4 Tháng không có chuyến bay nào: báo cáo rỗng, tổng bằng 0, không lỗi chia cho 0 (BM5.1)', async ({ page }) => {
    // năm đã qua trong danh sách chọn: không thể thêm chuyến bay khởi hành trong quá khứ nên luôn rỗng
    const nam = mocVN(0).nam - 3;
    await dangNhap(page, 'quanLy', '/bao-cao');
    await chonVaLap(page, 'thang', nam, 6);
    await expect(page.getByText('Không có dữ liệu')).toBeVisible();
    await expect(page.getByText(`Không có chuyến bay nào khởi hành trong tháng 6/${nam}, báo cáo rỗng.`)).toBeVisible();
    await expect(hopThoai(page, 'Không lập được báo cáo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Xuất PDF' })).toBeDisabled();

    // năm cũng rỗng: tổng doanh thu 0 nên mọi tỉ lệ 0, không chia cho 0
    await chonVaLap(page, 'nam', nam);
    await expect(page.getByText(`Không có chuyến bay nào khởi hành trong năm ${nam}, báo cáo rỗng.`)).toBeVisible();

    // tháng ở xa (2035) qua máy chủ: trả về 0 dòng, tổng 0, không lỗi
    const thang = await page.request.get('/api/bao-cao/thang?thang=6&nam=2035');
    expect(thang.status()).toBe(200);
    expect(await thang.json()).toMatchObject({ thang: 6, nam: 2035, soChuyenBay: 0, tongSoVe: 0, tongDoanhThu: 0, dong: [] });
    const namXa = await page.request.get('/api/bao-cao/nam?nam=2035');
    expect(namXa.status()).toBe(200);
    const bcNam = await namXa.json();
    expect(bcNam.tongDoanhThu).toBe(0);
    expect(bcNam.dong).toHaveLength(12);
    for (const d of bcNam.dong) expect(d).toMatchObject({ soChuyenBay: 0, doanhThu: 0, tiLe: 0 });
    // xuất tập tin của tháng rỗng cũng không lỗi
    const pdf = await page.request.get('/api/bao-cao/thang/xuat?thang=6&nam=2035&dinhDang=pdf');
    expect(pdf.status()).toBe(200);
    expect(docChuPdf(await pdf.body())).toContain('Không có dữ liệu.');
  });

  test('UC07.5 Bán 2 vé, hủy 1 vé, đặt 1 phiếu cho cùng chuyến bay: doanh thu chỉ tính 1 vé Đã bán (giả định 4)', async ({ page }) => {
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({ lechNgay: 14, giaVe: 1_000_000 });
    const ve1 = await api.banVe(cb.maChuyenBay, 'H2');
    const ve2 = await api.banVe(cb.maChuyenBay, 'H2');
    await api.datVe(cb.maChuyenBay, 'H2');
    await api.dong();
    const ky = mocVN(14);

    await dangNhap(page, 'quanLy', '/bao-cao');
    const huy = await page.request.post(`/api/ve/${ve2.maVe}/huy`);
    expect(huy.status()).toBe(204);

    await lapBaoCao(page, 'thang', ky.nam, ky.thang);
    const dong = bangBaoCao(page).locator('tbody tr').filter({ hasText: cb.maChuyenBay });
    await expect(dong).toHaveCount(1);
    const o = (await dong.locator('td').allTextContents()).map((x) => x.trim());
    expect(o[2]).toBe('1');
    expect(soTien(o[3])).toBe(1_000_000);
    await xemCsdl(page, `chuyến bay ${cb.maChuyenBay}: 1 vé Đã bán (${ve1.maVe}), 1 vé Đã hủy, 1 phiếu Chờ thanh toán`,
      { bang: 'VE', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 2 },
      { bang: 'PHIEUDATCHO', cot: 'MaChuyenBay', giaTri: cb.maChuyenBay, soDong: 1, dung: { TinhTrang: 'Chờ thanh toán' } });
  });

  test('UC07.6 Vé bán tháng này cho chuyến bay khởi hành tháng sau: doanh thu vào báo cáo tháng sau (giả định 4)', async ({ page }) => {
    const lech = lechSangThangSau(5);
    const nay = mocVN(0);
    const sau = mocVN(lech);
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({ lechNgay: lech, giaVe: 1_000_000 });
    await api.banVe(cb.maChuyenBay, 'H1');
    await api.dong();

    await dangNhap(page, 'quanLy', '/bao-cao');
    // tháng bán vé: không có dòng của chuyến bay
    await lapBaoCao(page, 'thang', nay.nam, nay.thang);
    await expect(bangBaoCao(page).locator('tbody tr').filter({ hasText: cb.maChuyenBay })).toHaveCount(0);
    // tháng khởi hành: có dòng với 1 vé Hạng 1 giá 1.050.000
    await lapBaoCao(page, 'thang', sau.nam, sau.thang);
    const dong = bangBaoCao(page).locator('tbody tr').filter({ hasText: cb.maChuyenBay });
    await expect(dong).toHaveCount(1);
    const o = (await dong.locator('td').allTextContents()).map((x) => x.trim());
    expect(o[2]).toBe('1');
    expect(soTien(o[3])).toBe(1_050_000);
  });

  test('UC07.7 Tổng cột tỉ lệ của báo cáo tháng và năm đúng bằng 100% (BM5.1, BM5.2)', async ({ page }) => {
    const nay = mocVN(0);
    await dangNhap(page, 'quanLy', '/bao-cao');
    for (const loai of ['thang', 'nam'] as const) {
      await lapBaoCao(page, loai, nay.nam, loai === 'thang' ? nay.thang : undefined);
      const { dong, tong } = await docBangManHinh(page);
      expect(dong.length).toBeGreaterThan(0);
      const tongTiLe = dong.reduce((t, d) => t + soTiLe(d[4]), 0);
      expect(soTien(tong[3]), `báo cáo ${loai} có doanh thu`).toBeGreaterThan(0);
      expect(tong[4]).toBe('100,00%');
      // phần lệch do làm tròn từng dòng được dồn vào dòng doanh thu lớn nhất; 0,005 chỉ để trừ sai số cộng số thực
      const choPhep = 0.005;
      expect(Math.abs(tongTiLe - 100), `tổng tỉ lệ ${dong.length} dòng của báo cáo ${loai} là ${tongTiLe.toFixed(2)}%`).toBeLessThanOrEqual(choPhep);
    }
  });

  test('UC07.8 Năm có tháng không có doanh thu: tháng đó vẫn có dòng 0, tổng năm bằng tổng 12 tháng (BM5.2)', async ({ page }) => {
    // một vé cho chuyến bay khởi hành giữa tháng 1 năm sau: năm sau có doanh thu và có các tháng bằng 0
    const nay = mocVN(0);
    const namSau = nay.nam + 1;
    let lech = 1;
    while (!(mocVN(lech).nam === namSau && mocVN(lech).thang === 1 && mocVN(lech).iso.endsWith('-15'))) lech++;
    const api = await ApiThu.moi();
    const cb = await api.themChuyenBay({ lechNgay: lech, giaVe: 1_000_000 });
    await api.banVe(cb.maChuyenBay, 'H2');
    await api.dong();

    await dangNhap(page, 'quanLy', '/bao-cao');
    await lapBaoCao(page, 'nam', namSau);
    const { dong, tong } = await docBangManHinh(page);
    expect(dong).toHaveLength(12);
    dong.forEach((d, i) => expect(d[1]).toBe(`Tháng ${i + 1}`));
    expect(soTien(dong[0][3])).toBeGreaterThanOrEqual(1_000_000);
    const thangKhong = dong.filter((d) => soTien(d[3]) === 0);
    expect(thangKhong.length, 'có ít nhất một tháng không có doanh thu').toBeGreaterThan(0);
    for (const d of thangKhong) {
      expect(d[3]).toMatch(/^0\s*₫$/);
      expect(d[4]).toBe('0,00%');
    }
    const tongCacThang = dong.reduce((t, d) => t + soTien(d[3]), 0);
    expect(soTien(tong[3])).toBe(tongCacThang);
    expect(Number(tong[2].replace(/\D/g, ''))).toBe(dong.reduce((t, d) => t + Number(d[2].replace(/\D/g, '')), 0));

    // doanh thu từng tháng trong báo cáo năm bằng tổng của báo cáo tháng đó
    for (let t = 1; t <= 12; t++) {
      const bc = await (await page.request.get(`/api/bao-cao/thang?thang=${t}&nam=${namSau}`)).json();
      expect(bc.tongDoanhThu, `tháng ${t}/${namSau}`).toBe(soTien(dong[t - 1][3]));
    }
  });

  test('UC07.9 Số liệu trong tập tin Excel và PDF khớp từng dòng với màn hình, PDF có tiếng Việt có dấu (TT03)', async ({ page }) => {
    // tháng trước đã qua hết nên số liệu không đổi giữa lúc xem và lúc xuất
    const { thang, nam } = thangTruoc();
    await dangNhap(page, 'quanLy', '/bao-cao');
    await lapBaoCao(page, 'thang', nam, thang);
    const man = await docBangManHinh(page);
    expect(man.dong.length).toBeGreaterThan(0);

    // Excel: mỗi dòng trên màn hình có đúng một dòng trong trang tính với cùng số liệu
    const excel = await taiVe(page, 'Xuất Excel');
    expect(excel.tai.suggestedFilename()).toBe(`bao_cao_thang_${thang}_${nam}.xlsx`);
    const trang = docTrangTinh(excel.noiDung);
    const dauBang = trang.findIndex((d) => d[0] === 'STT');
    expect(trang[dauBang]).toEqual(['STT', 'Chuyến bay', 'Số vé', 'Doanh thu', 'Tỉ lệ']);
    expect(trang.flat()).toContain('Báo cáo doanh thu bán vé các chuyến bay');
    expect(trang.flat()).toContain(`Tháng ${thang} năm ${nam}`);
    const dongExcel = trang.slice(dauBang + 1).filter((d) => typeof d[0] === 'number');
    expect(dongExcel).toHaveLength(man.dong.length);
    man.dong.forEach((d, i) => {
      expect(dongExcel[i], `dòng ${i + 1} trong Excel`).toEqual([Number(d[0]), d[1], soTien(d[2]), soTien(d[3]), soTiLe(d[4])]);
    });

    // PDF: cùng các dòng, chữ tiếng Việt có dấu đọc ra đúng
    const pdf = await taiVe(page, 'Xuất PDF');
    expect(pdf.tai.suggestedFilename()).toBe(`bao_cao_thang_${thang}_${nam}.pdf`);
    const doan = docChuPdf(pdf.noiDung);
    for (const chu of ['Báo cáo doanh thu bán vé các chuyến bay', `Tháng ${thang} năm ${nam}`, 'Chuyến bay', 'Số vé', 'Doanh thu', 'Tỉ lệ'])
      expect(doan, `PDF có "${chu}"`).toContain(chu);
    const tongVe = soTien(man.tong[2]);
    const tongTien = soTien(man.tong[3]);
    expect(doan).toContain(
      `Số chuyến bay: ${man.dong.length}. Tổng số vé: ${dangSoPdf(tongVe)}. Tổng doanh thu: ${dangSoPdf(tongTien)} đồng.`,
    );
    expect(doan.some((x) => x.startsWith('Ngày lập: '))).toBeTruthy();
    for (const d of man.dong) {
      const day = [d[0], d[1], dangSoPdf(soTien(d[2])), dangSoPdf(soTien(d[3])), dangTiLePdf(soTiLe(d[4]))];
      expect(coDayLienTiep(doan, day), `PDF có dòng ${day.join(' | ')}`).toBeTruthy();
    }

    // báo cáo năm: so các tháng đã qua (tỉ lệ còn đổi theo doanh thu tháng hiện tại nên chỉ so số chuyến bay và doanh thu)
    await lapBaoCao(page, 'nam', nam);
    const manNam = await docBangManHinh(page);
    const nay = mocVN(0);
    const soThangDaQua = nam < nay.nam ? 12 : nay.thang - 1;
    const excelNam = docTrangTinh((await taiVe(page, 'Xuất Excel')).noiDung);
    const dauNam = excelNam.findIndex((d) => d[0] === 'Tháng');
    expect(excelNam[dauNam]).toEqual(['Tháng', 'Số chuyến bay', 'Doanh thu', 'Tỉ lệ']);
    const dongNam = excelNam.slice(dauNam + 1).filter((d) => typeof d[0] === 'number');
    expect(dongNam).toHaveLength(12);
    const doanNam = docChuPdf((await taiVe(page, 'Xuất PDF')).noiDung);
    expect(doanNam).toContain('Báo cáo doanh thu năm');
    expect(doanNam).toContain(`Năm ${nam}`);
    for (let i = 0; i < soThangDaQua; i++) {
      const d = manNam.dong[i];
      expect(dongNam[i].slice(0, 3), `tháng ${i + 1} trong Excel`).toEqual([i + 1, soTien(d[2]), soTien(d[3])]);
      const day = [String(i + 1), dangSoPdf(soTien(d[2])), dangSoPdf(soTien(d[3]))];
      expect(coDayLienTiep(doanNam, day), `PDF có tháng ${day.join(' | ')}`).toBeTruthy();
    }
  });
});
