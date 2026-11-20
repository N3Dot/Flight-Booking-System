// Trang Kiểm thử (chỉ Quản lý, ngoài các use case của đề tài): chọn trường hợp kiểm thử giao diện,
// máy chủ chạy Playwright mở trình duyệt thật để xem từng thao tác, kết quả cập nhật mỗi giây.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Info, Play, RotateCcw, Search, Square } from 'lucide-react';
import { apiKiemThu, khoaTruyVan } from '@/api/dich_vu';
import { thongBaoLoi } from '@/api/may_khach';
import { IconBanhRangDanhSach } from '@/icons3d';
import type { CaKiemThu, KetQuaCaKiemThu, TrangThaiCaKiemThu } from '@/kieu/api';
import { baoLoi } from '@/thanh_phan/hop_thoai_kho';
import { KhungTrang } from '@/thanh_phan/KhungTrang';
import { NhanTrangThai, type LoaiNhan } from '@/thanh_phan/NhanTrangThai';
import { Nut, NutTron } from '@/thanh_phan/Nut';
import { ONhap } from '@/thanh_phan/ONhap';
import { khopTuKhoa } from '@/tien_ich/dinh_dang';
import s from './KiemThu.module.css';

const NHAN: Record<TrangThaiCaKiemThu, [LoaiNhan, string]> = {
  cho: ['trung-tinh', 'Chờ'],
  dangChay: ['canh-bao', 'Đang chạy'],
  dat: ['thanh-cong', 'Đạt'],
  truot: ['do', 'Trượt'],
  boQua: ['trung-tinh', 'Bỏ qua'],
  dung: ['trung-tinh', 'Đã dừng'],
};

const laBoSung = (tenNhom: string) => tenNhom.startsWith('Bổ sung');

export function TrangKiemThu() {
  const boTruyVan = useQueryClient();
  const danhSach = useQuery({ queryKey: khoaTruyVan.kiemThuDanhSach, queryFn: apiKiemThu.danhSach, staleTime: Infinity });
  const trangThai = useQuery({
    queryKey: khoaTruyVan.kiemThuTrangThai,
    queryFn: apiKiemThu.trangThai,
    refetchInterval: (q) => (q.state.data?.dangChay ? 500 : false),
  });
  const [chon, datChon] = useState<Set<string>>(new Set());
  const [tuKhoa, datTuKhoa] = useState('');
  const [chamMs, datChamMs] = useState(1000);
  const [hienTrinhDuyet, datHienTrinhDuyet] = useState(true);
  const [dongNhom, datDongNhom] = useState<Set<string>>(new Set());

  const cacCa = useMemo(() => danhSach.data ?? [], [danhSach.data]);
  const ketQua = trangThai.data?.ketQua ?? {};
  const dangChay = !!trangThai.data?.dangChay;

  const daLoc = useMemo(() => cacCa.filter((ca) => khopTuKhoa(`${ca.ma} ${ca.ten} ${ca.nhom}`, tuKhoa)), [cacCa, tuKhoa]);
  const theoNhom = useMemo(() => {
    const nhom = new Map<string, CaKiemThu[]>();
    for (const ca of daLoc) nhom.set(ca.nhom, [...(nhom.get(ca.nhom) ?? []), ca]);
    // nhóm theo báo cáo đứng trước, nhóm "Bổ sung" (kiem_thu_e2e/bo_sung) xếp sau
    return [...nhom.entries()].sort(([a], [b]) => Number(laBoSung(a)) - Number(laBoSung(b)));
  }, [daLoc]);

  const chay = useMutation({
    mutationFn: (cacId: string[]) => apiKiemThu.chay({ cacCa: cacId, chamMs, hienTrinhDuyet }),
    onSuccess: () => boTruyVan.invalidateQueries({ queryKey: khoaTruyVan.kiemThuTrangThai }),
    onError: (e) => baoLoi('Không chạy được kiểm thử', thongBaoLoi(e)),
  });
  const dung = useMutation({
    mutationFn: apiKiemThu.dung,
    onSuccess: () => boTruyVan.invalidateQueries({ queryKey: khoaTruyVan.kiemThuTrangThai }),
    onError: (e) => baoLoi('Không dừng được', thongBaoLoi(e)),
  });

  const doiChon = (cacId: string[], bat: boolean) =>
    datChon((cu) => {
      const moi = new Set(cu);
      cacId.forEach((id) => (bat ? moi.add(id) : moi.delete(id)));
      return moi;
    });
  const tatCaId = daLoc.map((ca) => ca.id);
  const soChonTrongLoc = tatCaId.filter((id) => chon.has(id)).length;
  // chạy theo thứ tự trong danh sách để số thứ tự trên trang khớp thứ tự chạy
  const chayCac = (cacId: string[]) => chay.mutate(cacCa.filter((ca) => cacId.includes(ca.id)).map((ca) => ca.id));

  const dem = { dat: 0, truot: 0, dangChay: 0, cho: 0 };
  for (const kq of Object.values(ketQua)) if (kq.trangThai in dem) dem[kq.trangThai as keyof typeof dem]++;
  const tong = Object.keys(ketQua).length;
  const daXong = tong - dem.cho - dem.dangChay;

  return (
    <KhungTrang
      tieuDe="Kiểm thử giao diện tự động"
      icon={<IconBanhRangDanhSach kichThuoc={56} />}
      moTa="Chọn trường hợp kiểm thử, máy chủ sẽ mở trình duyệt và tự thao tác để bạn xem. Dữ liệu thử được ghi vào cơ sở dữ liệu."
      duongDan={[{ nhan: 'Kiểm thử' }]}
    >
      <div className={s.thanhDieuKhien} role="toolbar" aria-label="Điều khiển kiểm thử">
        <label className={s.oChon}>
          <OChonCo
            chon={soChonTrongLoc > 0 && soChonTrongLoc === tatCaId.length}
            mot={soChonTrongLoc > 0 && soChonTrongLoc < tatCaId.length}
            onDoi={(bat) => doiChon(tatCaId, bat)}
          />
          Chọn tất cả ({tatCaId.length})
        </label>
        <NhanTrangThai loai="do" coCham={false}>
          Đã chọn {chon.size}
        </NhanTrangThai>
        <label className={s.tocDo}>
          <span className={s.nhanTocDo}>Tốc độ</span>
          <span className={s.chuNho}>Nhanh</span>
          <input type="range" min={0} max={3000} step={250} value={chamMs} onChange={(e) => datChamMs(Number(e.target.value))} aria-valuetext={`Nghỉ ${chamMs / 1000} giây giữa hai bước`} />
          <span className={s.chuNho}>Chậm</span>
          <span className={s.giaTriTocDo} title="Thời gian nghỉ giữa hai bước thao tác">
            {(chamMs / 1000).toLocaleString('vi-VN')} giây/bước
          </span>
        </label>
        <label className={s.oChon}>
          <input type="checkbox" checked={hienTrinhDuyet} onChange={(e) => datHienTrinhDuyet(e.target.checked)} />
          Hiện trình duyệt
        </label>
        <div className={s.nutPhai}>
          <Nut disabled={chon.size === 0 || dangChay} dangXuLy={chay.isPending} onClick={() => chayCac([...chon])}>
            Chạy {chon.size} trường hợp
          </Nut>
          <Nut bienThe="nguy-hiem" iconTrai={<Square size={16} />} disabled={!dangChay} dangXuLy={dung.isPending} onClick={() => dung.mutate()}>
            Dừng
          </Nut>
        </div>
      </div>

      {tong > 0 && (
        <div className={s.tongKet}>
          <OThongKe loai="thanh-cong" nhan="Đạt" so={dem.dat} />
          <OThongKe loai="do" nhan="Trượt" so={dem.truot} />
          <OThongKe loai="canh-bao" nhan="Đang chạy" so={dem.dangChay} />
          <OThongKe loai="trung-tinh" nhan="Chờ" so={dem.cho} />
          <div className={s.tienDo} role="progressbar" aria-valuemin={0} aria-valuemax={tong} aria-valuenow={daXong} aria-label="Tiến độ">
            <div className={s.tienDoChay} style={{ width: `${(daXong / tong) * 100}%` }} />
            <span>
              {daXong}/{tong}
            </span>
          </div>
          <Nut bienThe="phu" kichThuoc="nho" iconTrai={<RotateCcw size={16} />} disabled={dangChay} onClick={() => chayCac(Object.keys(ketQua))}>
            Chạy lại lần trước ({tong})
          </Nut>
        </div>
      )}

      <div className={s.luoi}>
        <section aria-label="Danh sách trường hợp kiểm thử">
          <ONhap iconTrai={<Search size={18} />} placeholder="Tìm theo mã hoặc tên trường hợp" value={tuKhoa} onChange={(e) => datTuKhoa(e.target.value)} aria-label="Tìm trường hợp kiểm thử" />
          {danhSach.isPending && <p className={s.ghiChu}>Đang lấy danh sách trường hợp kiểm thử (vài giây)...</p>}
          {danhSach.error && <p className={s.loi}>{thongBaoLoi(danhSach.error)}</p>}
          {theoNhom.map(([tenNhom, cacCaNhom], i) => {
            const idNhom = cacCaNhom.map((ca) => ca.id);
            const soChon = idNhom.filter((id) => chon.has(id)).length;
            const dong = dongNhom.has(tenNhom);
            const dauPhan = i === 0 || laBoSung(tenNhom) !== laBoSung(theoNhom[i - 1][0]);
            return (
              <Fragment key={tenNhom}>
              {dauPhan && <h2 className={s.tieuDePhan}>{laBoSung(tenNhom) ? 'Bổ sung ngoài báo cáo' : 'Theo báo cáo (Chương 5)'}</h2>}
              <div className={s.nhom}>
                <div className={s.dauNhom}>
                  <OChonCo chon={soChon === idNhom.length} mot={soChon > 0 && soChon < idNhom.length} onDoi={(bat) => doiChon(idNhom, bat)} nhan={`Chọn cả nhóm ${tenNhom}`} />
                  <button
                    type="button"
                    className={s.tenNhom}
                    aria-expanded={!dong}
                    onClick={() =>
                      datDongNhom((cu) => {
                        const moi = new Set(cu);
                        if (moi.has(tenNhom)) moi.delete(tenNhom);
                        else moi.add(tenNhom);
                        return moi;
                      })
                    }
                  >
                    <ChevronDown size={18} className={dong ? s.muiTenDong : s.muiTen} aria-hidden />
                    {tenNhom}
                    <span className={s.soCa}>{cacCaNhom.length} trường hợp</span>
                  </button>
                  <Nut bienThe="phu" kichThuoc="nho" disabled={dangChay} onClick={() => chayCac(idNhom)}>
                    Chạy nhóm
                  </Nut>
                </div>
                {!dong && (
                  <ol className={s.danhSach}>
                    {cacCaNhom.map((ca) => (
                      <DongCa key={ca.id} ca={ca} ketQua={ketQua[ca.id]} chon={chon.has(ca.id)} onChon={(bat) => doiChon([ca.id], bat)} onChay={() => chayCac([ca.id])} khoa={dangChay} />
                    ))}
                  </ol>
                )}
              </div>
              </Fragment>
            );
          })}
        </section>

        <aside className={s.cotPhai}>
          <div className={s.the}>
            <h2 className={s.tieuDeThe}>Nhật ký chạy</h2>
            <NhatKy dong={trangThai.data?.nhatKy ?? []} />
          </div>
          <div className={s.loiNhac}>
            <Info size={20} aria-hidden />
            <p>
              Trình duyệt kiểm thử mở trên máy chủ; trong lúc chạy đừng bấm vào cửa sổ đó. Bộ kiểm thử ghi dữ liệu thử (chuyến bay mã KT..., vé, phiếu, tài khoản thử), chạy xong nên nạp lại dữ liệu mẫu bằng <code>.\cai_dat.cmd -NapLaiDuLieu</code>. Tốc độ là thời gian nghỉ giữa hai bước, áp dụng từ lần bấm Chạy kế tiếp.
            </p>
          </div>
        </aside>
      </div>
    </KhungTrang>
  );
}

function DongCa({ ca, ketQua, chon, onChon, onChay, khoa }: { ca: CaKiemThu; ketQua?: KetQuaCaKiemThu; chon: boolean; onChon: (bat: boolean) => void; onChay: () => void; khoa: boolean }) {
  const [loai, chu] = ketQua ? NHAN[ketQua.trangThai] : (['trung-tinh', 'Chưa chạy'] as const);
  // tên trường hợp có phần mã yêu cầu trong ngoặc ở cuối, tách ra làm nhãn nhỏ
  const tach = /^(.*?)\s*\(([^()]*)\)$/.exec(ca.ten);
  return (
    <li className={`${s.dong} ${ketQua?.trangThai === 'dangChay' ? s.dongDangChay : ''}`}>
      <span className={s.stt}>{ca.stt}</span>
      <input type="checkbox" checked={chon} onChange={(e) => onChon(e.target.checked)} aria-label={`Chọn ${ca.ma}`} />
      <span className={s.ma}>{ca.ma}</span>
      <div className={s.noiDung}>
        <span className={s.ten}>{tach ? tach[1] : ca.ten}</span>
        {tach && <span className={s.yeuCau}>{tach[2]}</span>}
        {ketQua?.trangThai === 'dangChay' && ketQua.buoc && (
          <span className={s.buoc}>
            Bước {ketQua.soBuoc}: {ketQua.buoc}
          </span>
        )}
        {ketQua?.trangThai === 'truot' && ketQua.loi && <span className={s.loiCa}>{ketQua.loi}</span>}
      </div>
      <span className={s.thoiGian}>{ketQua?.thoiGianMs != null ? `${(ketQua.thoiGianMs / 1000).toFixed(1)}s` : ''}</span>
      <NhanTrangThai loai={loai} nho coCham={!!ketQua}>
        {chu}
      </NhanTrangThai>
      {/* đã có kết quả thì là nút chạy lại, để xem lại trường hợp đã đạt hoặc thử lại trường hợp trượt */}
      <NutTron nhan={ketQua ? `Chạy lại ${ca.ma}` : `Chạy riêng ${ca.ma}`} kichThuoc="nho" bienThe="trong" disabled={khoa} onClick={onChay}>
        {ketQua ? <RotateCcw size={16} /> : <Play size={16} />}
      </NutTron>
    </li>
  );
}

function OChonCo({ chon, mot, onDoi, nhan }: { chon: boolean; mot: boolean; onDoi: (bat: boolean) => void; nhan?: string }) {
  const o = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (o.current) o.current.indeterminate = mot;
  }, [mot]);
  return <input ref={o} type="checkbox" checked={chon} onChange={(e) => onDoi(e.target.checked)} aria-label={nhan} />;
}

function OThongKe({ loai, nhan, so }: { loai: LoaiNhan; nhan: string; so: number }) {
  return (
    <div className={s.oThongKe}>
      <NhanTrangThai loai={loai} nho>
        {nhan}
      </NhanTrangThai>
      <strong>{so}</strong>
    </div>
  );
}

function NhatKy({ dong }: { dong: string[] }) {
  const khung = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (khung.current) khung.current.scrollTop = khung.current.scrollHeight;
  }, [dong]);
  return (
    <pre ref={khung} className={s.nhatKy} aria-live="polite">
      {dong.length ? dong.join('\n') : 'Chưa chạy lần nào.'}
    </pre>
  );
}
