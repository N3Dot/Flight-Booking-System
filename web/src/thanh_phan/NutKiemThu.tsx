// Lối vào thu gọn của trang Kiểm thử (chỉ Quản lý): một vạch đỏ mờ dính mép phải màn hình,
// di chuột hoặc Tab tới thì trượt ra thành nút, bấm mở trang trong tab mới.
// Máy chủ tắt kiểm thử (KiemThu:Bat = false) thì đường dẫn trả 404 và nút không hiện.
import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { apiKiemThu, khoaTruyVan } from '@/api/dich_vu';
import s from './NutKiemThu.module.css';

export function NutKiemThu() {
  const { isSuccess } = useQuery({
    queryKey: khoaTruyVan.kiemThuTrangThai,
    queryFn: apiKiemThu.trangThai,
    retry: false,
    staleTime: Infinity,
  });
  if (!isSuccess) return null;
  return (
    <a className={s.nut} href="/kiem-thu" target="_blank" rel="noopener" title="Kiểm thử giao diện tự động">
      <FlaskConical size={16} strokeWidth={2.4} aria-hidden />
      <span>Kiểm thử</span>
    </a>
  );
}
