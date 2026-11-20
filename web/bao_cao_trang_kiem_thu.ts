// Reporter cho trang Kiểm thử trong phần mềm: mỗi sự kiện in một dòng "@@KT {json}" để máy chủ đọc.
// Mã mỗi trường hợp là "tập tin:dòng", trùng với mã máy chủ lấy từ `playwright test --list --reporter=json`.
import path from 'node:path';
import type { FullConfig, Reporter, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';

const MA_MAU = /\u001b\[[0-9;]*m/g;

// tên bước của Playwright (tiếng Anh) đổi phần động từ đầu câu sang tiếng Việt
const DONG_TU: [RegExp, string][] = [
  [/^Navigate( to)?/, 'Mở trang'],
  [/^Click/, 'Bấm'],
  [/^Double click/, 'Bấm đúp'],
  [/^Fill/, 'Nhập'],
  [/^Type/, 'Gõ'],
  [/^Press/, 'Nhấn phím'],
  [/^Check/, 'Tick chọn'],
  [/^Uncheck/, 'Bỏ tick'],
  [/^Select option/, 'Chọn'],
  [/^Hover/, 'Rê chuột'],
  [/^Set input files/, 'Chọn tập tin'],
  [/^Wait for/, 'Chờ'],
  [/^Expect/, 'Kiểm tra'],
];
const PHEP_KIEM_TRA: Record<string, string> = {
  toHaveURL: 'đúng địa chỉ trang',
  toBeVisible: 'đang hiển thị',
  toBeHidden: 'đã ẩn',
  toHaveText: 'đúng chữ',
  toContainText: 'có chứa chữ',
  toHaveValue: 'đúng giá trị ô',
  toHaveCount: 'đúng số lượng',
  toBeChecked: 'đang được chọn',
  toBeEnabled: 'bấm được',
  toBeDisabled: 'bị khóa',
  toHaveAttribute: 'đúng thuộc tính',
  toBe: 'đúng giá trị',
  toEqual: 'đúng giá trị',
  toBeTruthy: 'đúng',
  toBeGreaterThan: 'lớn hơn mong đợi',
  toContain: 'có chứa',
};

// Expect "not.toBeVisible" thành Kiểm tra không đang hiển thị
const viet = (tieuDe: string) =>
  DONG_TU.reduce((chu, [mau, thay]) => chu.replace(mau, thay), tieuDe).replace(
    /^Kiểm tra "(not\.)?(\w+)"/,
    (goc, phuDinh: string | undefined, phep: string) => (PHEP_KIEM_TRA[phep] ? `Kiểm tra ${phuDinh ? 'không ' : ''}${PHEP_KIEM_TRA[phep]}` : goc),
  );

const VAI_TRO: Record<string, string> = {
  button: 'nút',
  textbox: 'ô',
  link: 'liên kết',
  checkbox: 'ô chọn',
  combobox: 'ô chọn',
  heading: 'tiêu đề',
  cell: 'ô bảng',
  row: 'dòng',
  tab: 'thẻ',
  menuitem: 'mục',
  option: 'mục',
  dialog: 'hộp thoại',
  alert: 'thông báo',
};

// đối tượng của thao tác: getByRole('button', { name: 'Lưu' }) thành nút "Lưu"
function doiTuong(phu?: string) {
  if (!phu) return '';
  const vaiTro = /^getByRole\('(\w+)'(?:, \{ name: (['/])(.*?)\2)?/.exec(phu);
  if (vaiTro) return `${VAI_TRO[vaiTro[1]] ?? vaiTro[1]}${vaiTro[3] ? ` "${vaiTro[3]}"` : ''}`;
  const theoChu = /^getBy(Label|Placeholder|Text)\((['/])(.*?)\2/.exec(phu);
  if (theoChu) return `${theoChu[1] === 'Text' ? 'chữ' : 'ô'} "${theoChu[3]}"`;
  return phu.length > 80 ? phu.slice(0, 77) + '...' : phu;
}

// bước nằm trong hook hoặc fixture (mở trình duyệt, tạo trang, dọn dẹp) không phải thao tác của trường hợp;
// thao tác nhỏ bên trong bước mở CSDL (mở thẻ, vẽ bảng, chờ) cũng bỏ qua, chỉ giữ tên bước
function laBuocNoiBo(buoc: TestStep) {
  for (let cha = buoc.parent; cha; cha = cha.parent)
    if (cha.category === 'hook' || cha.category === 'fixture' || cha.title.startsWith('Mở CSDL kiểm chứng')) return true;
  return false;
}

export default class BaoCaoTrangKiemThu implements Reporter {
  private thuMuc = '';

  onBegin(config: FullConfig) {
    this.thuMuc = config.rootDir;
  }

  onTestBegin(test: TestCase) {
    this.gui({ su: 'batDau', ma: this.ma(test) });
  }

  // các bước thao tác trên trang và kiểm tra kết quả; bỏ qua bước nội bộ (fixture, hook)
  onStepBegin(test: TestCase, _ketQua: TestResult, buoc: TestStep) {
    if (!['pw:api', 'expect', 'test.step'].includes(buoc.category) || laBuocNoiBo(buoc)) return;
    const phu = doiTuong((buoc as TestStep & { subtitle?: string }).subtitle);
    this.gui({ su: 'buoc', ma: this.ma(test), tieuDe: viet(buoc.title) + (phu ? ` · ${phu}` : '') });
  }

  onTestEnd(test: TestCase, ketQua: TestResult) {
    const loi = ketQua.error?.message?.replace(MA_MAU, '').split('\n').find((dong) => dong.trim()) ?? null;
    this.gui({ su: 'xong', ma: this.ma(test), trangThai: ketQua.status, thoiGianMs: ketQua.duration, loi });
  }

  onError(loi: TestError) {
    this.gui({ su: 'loi', loi: (loi.message ?? '').replace(MA_MAU, '') });
  }

  printsToStdio() {
    return true;
  }

  private ma(test: TestCase) {
    return `${path.relative(this.thuMuc, test.location.file).replace(/\\/g, '/')}:${test.location.line}`;
  }

  private gui(duLieu: object) {
    process.stdout.write(`@@KT ${JSON.stringify(duLieu)}\n`);
  }
}
