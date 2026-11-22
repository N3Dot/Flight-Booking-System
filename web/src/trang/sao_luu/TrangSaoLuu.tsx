// Sao lưu dữ liệu (chỉ Quản lý, bổ sung cho AT01): tạo thêm một bản sao lưu toàn bộ dữ liệu ngoài lịch sao lưu hằng ngày.
// Phục hồi không làm ở đây vì ghi đè toàn bộ dữ liệu đang dùng; người phụ trách máy chủ làm theo hướng dẫn cài đặt.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { DatabaseBackup, X } from 'lucide-react';
import { apiSaoLuu } from '@/api/dich_vu';
import { thongBaoLoi } from '@/api/may_khach';
import { IconThuMucBang } from '@/icons3d';
import type { KetQuaSaoLuu } from '@/kieu/api';
import { baoLoi, hoiXacNhan } from '@/thanh_phan/hop_thoai_kho';
import { KhungTrang } from '@/thanh_phan/KhungTrang';
import { Nut } from '@/thanh_phan/Nut';
import { hienToast } from '@/thanh_phan/toast_kho';
import { dinhDangGio, dinhDangNgay } from '@/tien_ich/thoi_gian';
import s from './SaoLuu.module.css';

export function TrangSaoLuu() {
  const [ketQua, datKetQua] = useState<KetQuaSaoLuu | null>(null);
  const saoLuu = useMutation({
    mutationFn: apiSaoLuu.saoLuu,
    onSuccess: (kq) => {
      datKetQua(kq);
      hienToast.thanhCong('Sao lưu dữ liệu thành công.');
    },
    onError: (loi) => baoLoi('Sao lưu dữ liệu không thành công', thongBaoLoi(loi)),
  });

  const batDau = async () => {
    const dongY = await hoiXacNhan({
      loai: 'xac-nhan',
      tieuDe: 'Sao lưu dữ liệu ngay?',
      noiDung: 'Phần mềm tạo một tập tin sao lưu toàn bộ dữ liệu trên máy chủ. Nhân viên vẫn làm việc bình thường trong lúc sao lưu.',
      nutDongY: 'Sao lưu',
    });
    if (dongY) saoLuu.mutate();
  };

  return (
    <KhungTrang
      tieuDe="Sao lưu dữ liệu"
      icon={<IconThuMucBang kichThuoc={56} />}
      moTa="Tạo thêm một bản sao lưu toàn bộ dữ liệu"
      duongDan={[{ nhan: 'Sao lưu dữ liệu' }]}
      nut={
        <Nut bienThe="lang" muiTen={false} iconTrai={<X size={18} />} den="/">
          Đóng
        </Nut>
      }
    >
      <section className={s.khung} aria-label="Sao lưu dữ liệu">
        <p>
          Ngoài bản sao lưu tự động mỗi ngày, Quản lý có thể tạo thêm một bản sao lưu bất cứ lúc nào, ví dụ trước khi nhập lịch chuyến bay từ tập
          tin Excel hoặc xóa các phiếu đặt chỗ đã hủy.
        </p>
        <div>
          <Nut iconTrai={<DatabaseBackup size={18} />} onClick={batDau} dangXuLy={saoLuu.isPending}>
            Sao lưu ngay
          </Nut>
        </div>
        {ketQua && (
          <div className={s.ketQua} role="status">
            Đã tạo bản sao lưu lúc {dinhDangGio(ketQua.thoiDiem)} ngày {dinhDangNgay(ketQua.thoiDiem)}: <b>{ketQua.tapTin}</b>
          </div>
        )}
        <p className={s.ghiChu}>
          Phần mềm không phục hồi dữ liệu từ bản sao lưu, vì việc phục hồi ghi đè toàn bộ dữ liệu đang có. Khi cần phục hồi, báo người phụ trách máy
          chủ làm theo hướng dẫn cài đặt.
        </p>
      </section>
    </KhungTrang>
  );
}
