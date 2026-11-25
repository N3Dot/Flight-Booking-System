// Định dạng số, tiền, chuỗi và so khớp không dấu.
import type { LoaiGiayTo, NhomQuyen, TinhTrangPhieu, TinhTrangVe, TrangThaiTaiKhoan } from '@/kieu/api';

const boSo = new Intl.NumberFormat('vi-VN');

/** 1575000 sang '1.575.000' */
export function dinhDangSo(n: number): string {
  return boSo.format(Math.round(n));
}

/** 1575000 sang '1.575.000 ₫' */
export function dinhDangTien(n: number, donVi = '₫'): string {
  return `${dinhDangSo(n)} ${donVi}`;
}

/**
 * Giá tiền của hạng (QĐ2): giá vé x tỉ lệ đơn giá / 100, làm tròn nửa lên như HangVe.tinhGiaTien ở máy chủ.
 * Tính bằng số nguyên vì số thực làm lệch 1 đồng ở các giá trị đúng nửa (125 x 129,2% = 161,5 thành 161).
 */
export function giaTienTheoHang(giaVe: number, tiLeDonGia: number): number {
  if (!Number.isSafeInteger(giaVe) || giaVe < 0) return Math.round((giaVe * tiLeDonGia) / 100);
  return Number((BigInt(giaVe) * BigInt(Math.round(tiLeDonGia * 100)) + 5000n) / 10000n);
}

/** 12.3456 sang '12,35%' */
export function dinhDangPhanTram(n: number, soLe = 2): string {
  return `${n.toLocaleString('vi-VN', { minimumFractionDigits: soLe, maximumFractionDigits: soLe })}%`;
}

/** Bỏ dấu tiếng Việt và viết thường để lọc */
export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function khopTuKhoa(chu: string, tuKhoa: string): boolean {
  if (!tuKhoa.trim()) return true;
  return boDau(chu).includes(boDau(tuKhoa.trim()));
}

export const tenNhomQuyen: Record<NhomQuyen, string> = {
  QuanLy: 'Quản lý',
  NhanVien: 'Nhân viên bán vé',
};

export const tenTrangThaiTaiKhoan: Record<TrangThaiTaiKhoan, string> = {
  HoatDong: 'Hoạt động',
  DaKhoa: 'Đã khóa',
};

export const tenTinhTrangVe: Record<TinhTrangVe, string> = {
  DaBan: 'Đã bán',
  DaHuy: 'Đã hủy',
};

export const tenTinhTrangPhieu: Record<TinhTrangPhieu, string> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaHuy: 'Đã hủy',
};

export const tenLoaiGiayTo: Record<LoaiGiayTo, string> = {
  CCCD: 'CCCD',
  HoChieu: 'Hộ chiếu',
};

/** Chữ cái đầu để làm ảnh đại diện */
export function chuCaiDau(ten: string): string {
  const t = ten.trim();
  return t ? t[0].toUpperCase() : '?';
}
