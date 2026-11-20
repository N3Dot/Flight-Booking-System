// Phần trình diễn khi chạy từ trang Kiểm thử trong phần mềm (chạy bằng lệnh npm thì không làm gì thêm):
// 1. CHAM_MS > 0: vẽ vòng đỏ ở chỗ vừa bấm và viền đỏ quanh ô đang nhập để người xem thấy từng thao tác.
// 2. XEM_CSDL = 1: sau ca làm đổi dữ liệu, mở bảng trong cơ sở dữ liệu ở thẻ mới cho thấy dữ liệu đã đổi thật.
import { test as goc, type Page } from '@playwright/test';
import { DIA_CHI, TAI_KHOAN } from './chung';

export * from '@playwright/test';

const CHAM = Number(process.env.CHAM_MS ?? 0);

/** Tên bước mở CSDL; reporter của trang Kiểm thử ẩn các thao tác nhỏ bên trong bước này. */
export const BUOC_XEM_CSDL = 'Mở CSDL kiểm chứng';

const DANH_DAU = `(() => {
  const css = document.createElement('style');
  css.textContent = '@keyframes ktVong{from{transform:translate(-50%,-50%) scale(.3);opacity:1}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}'
    + '.kt-vong{position:fixed;z-index:2147483647;width:44px;height:44px;border:4px solid #EC2029;border-radius:50%;pointer-events:none;animation:ktVong .9s ease-out forwards}'
    + '.kt-dang-nhap{outline:3px solid #EC2029 !important;outline-offset:2px !important}';
  const gan = () => document.documentElement.appendChild(css);
  if (document.documentElement) gan(); else addEventListener('DOMContentLoaded', gan);
  addEventListener('mousedown', (e) => {
    const v = document.createElement('div');
    v.className = 'kt-vong';
    v.style.left = e.clientX + 'px';
    v.style.top = e.clientY + 'px';
    document.documentElement.appendChild(v);
    setTimeout(() => v.remove(), 1000);
  }, true);
  addEventListener('focusin', (e) => e.target.classList && e.target.classList.add('kt-dang-nhap'), true);
  addEventListener('focusout', (e) => e.target.classList && e.target.classList.remove('kt-dang-nhap'), true);
})()`;

export const test = goc.extend<{ danhDauThaoTac: void }>({
  danhDauThaoTac: [
    async ({ context }, use) => {
      if (CHAM > 0) await context.addInitScript(DANH_DAU);
      await use();
    },
    { auto: true },
  ],
});

/* ---------------- mở bảng trong CSDL để kiểm chứng ---------------- */

export interface KhoiCsdl {
  bang: string;
  /** lọc cột = giá trị; bỏ trống thì lấy cả bảng (tối đa 50 dòng) */
  cot?: string;
  giaTri?: string | number;
  soDong?: number;
  /** giá trị mong đợi ở dòng đầu, được tô vàng */
  dung?: Record<string, string | number>;
}

interface BangDoc {
  cauLenh: string;
  cacCot: string[];
  cacDong: unknown[][];
}

let cookie: Promise<string> | undefined;

async function dangNhapQuanLy(): Promise<string> {
  const ph = await fetch(`${DIA_CHI}/api/dang-nhap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenDangNhap: TAI_KHOAN.quanLy.ten, matKhau: TAI_KHOAN.quanLy.matKhau }),
  });
  if (!ph.ok) throw new Error(`Không đăng nhập được để xem CSDL: ${ph.status}`);
  return ph.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function docBang(k: KhoiCsdl): Promise<BangDoc> {
  cookie ??= dangNhapQuanLy();
  const q = new URLSearchParams({ bang: k.bang });
  if (k.cot) q.set('cot', k.cot);
  if (k.giaTri !== undefined) q.set('giaTri', String(k.giaTri));
  const ph = await fetch(`${DIA_CHI}/api/kiem-thu/csdl?${q}`, { headers: { Cookie: await cookie } });
  if (!ph.ok) throw new Error(`Không đọc được bảng ${k.bang}: ${ph.status} ${await ph.text()}`);
  return ph.json();
}

const thoat = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** So kết quả với mong đợi: mỗi dòng một kiểm tra, kèm đạt hay không. */
function soSanh(k: KhoiCsdl, b: BangDoc): { moTa: string; dat: boolean }[] {
  const ds: { moTa: string; dat: boolean }[] = [];
  const dong = b.cacDong.map((d) => Object.fromEntries(b.cacCot.map((c, i) => [c, d[i]])));
  if (k.soDong !== undefined)
    ds.push({
      moTa: `Có ${k.soDong} dòng${k.soDong === 0 ? ' (không còn / không được lưu)' : ''}, thực tế ${dong.length} dòng`,
      dat: dong.length === k.soDong,
    });
  for (const [cot, mong] of Object.entries(k.dung ?? {}))
    ds.push({ moTa: `${cot} = ${mong}, thực tế ${dong[0]?.[cot] ?? '(không có dòng)'}`, dat: String(dong[0]?.[cot]) === String(mong) });
  return ds;
}

function veKhoi(k: KhoiCsdl, b: BangDoc, kt: { moTa: string; dat: boolean }[]) {
  const to = new Set(Object.keys(k.dung ?? {}));
  const bang = b.cacDong.length
    ? `<table><tr>${b.cacCot.map((c) => `<th>${thoat(c)}</th>`).join('')}</tr>${b.cacDong
        .map(
          (d, j) =>
            `<tr>${d
              .map((o, i) => `<td class="${j === 0 && to.has(b.cacCot[i]) ? 'to' : ''}">${o === null ? '<i>NULL</i>' : thoat(o)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}</table>`
    : '<div class="rong">0 dòng: không có dữ liệu nào khớp</div>';
  const ketQua = kt.map((x) => `<li class="${x.dat ? 'dat' : 'truot'}">${x.dat ? '✔' : '✘'} ${thoat(x.moTa)}</li>`).join('');
  return `<section><code>${thoat(b.cauLenh)}</code>${bang}<ul>${ketQua}</ul></section>`;
}

const KIEU = `body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#f4f5f7;color:#1d2433}
header{background:#EC2029;color:#fff;padding:20px 32px}header h1{margin:0;font-size:24px}header p{margin:6px 0 0;font-size:17px}
main{padding:24px 32px;display:grid;gap:20px}section{background:#fff;border-radius:24px;padding:20px 24px;box-shadow:0 2px 12px rgba(0,0,0,.07)}
code{display:block;background:#1d2433;color:#e6edf3;padding:10px 14px;border-radius:12px;font:15px Consolas,monospace}
table{border-collapse:collapse;margin-top:14px;font-size:15px;width:100%}th,td{border:1px solid #e3e6ea;padding:7px 10px;text-align:left}
th{background:#fff1f1;color:#a3141b}td.to{background:#ffe680;font-weight:700}i{color:#9aa1ab}
.rong{margin-top:14px;padding:18px;text-align:center;color:#6b7280;border:2px dashed #cfd4da;border-radius:12px;font-size:16px}
ul{margin:14px 0 0;padding:0;list-style:none;font-weight:700;font-size:16px}.dat{color:#13804a}.truot{color:#c4161c}`;

/**
 * Mở các bảng trong CSDL ở thẻ mới cho người xem thấy dữ liệu đã đổi thật, rồi so với mong đợi.
 * Chỉ chạy khi chạy từ trang Kiểm thử (XEM_CSDL = 1); chạy bằng lệnh npm thì bỏ qua.
 */
export async function xemCsdl(page: Page, moTa: string, ...cacKhoi: KhoiCsdl[]) {
  if (!process.env.XEM_CSDL) return;
  const cacBang = await Promise.all(cacKhoi.map(docBang));
  const kiemTra = cacKhoi.map((k, i) => soSanh(k, cacBang[i]));
  const tomTat = cacKhoi.map((k, i) => `${k.bang} ${cacBang[i].cacDong.length} dòng`).join(', ');
  await goc.step(`${BUOC_XEM_CSDL}: ${moTa} (${tomTat})`, async () => {
    if (CHAM === 0) return;
    const the = await page.context().newPage();
    await the.setContent(
      `<!doctype html><meta charset="utf-8"><title>CSDL QLBANVECHUYENBAY</title><style>${KIEU}</style>` +
        `<header><h1>🗄 Cơ sở dữ liệu QLBANVECHUYENBAY</h1><p>Kiểm chứng: ${thoat(moTa)}</p></header>` +
        `<main>${cacKhoi.map((k, i) => veKhoi(k, cacBang[i], kiemTra[i])).join('')}</main>`,
    );
    await the.waitForTimeout(Math.max(3000, CHAM * 3));
    await the.close();
  });
  const sai = kiemTra.flat().filter((x) => !x.dat).map((x) => x.moTa);
  if (sai.length) throw new Error(`Dữ liệu trong CSDL không đúng mong đợi (${moTa}): ${sai.join('; ')}`);
}
