// Khung định tuyến của ứng dụng
import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CHI_QUAN_LY } from '@/dinh_tuyen';
import { BoCuc } from '@/thanh_phan/BoCuc';
import { YeuCauDangNhap, YeuCauQuyen } from '@/thanh_phan/BaoVeDuongDan';
import { TrangKhongTimThay } from '@/thanh_phan/TrangThongBaoLoi';
import { TrangDangNhap } from '@/trang/dang_nhap/TrangDangNhap';
import { TrangChinh } from '@/trang/trang_chinh/TrangChinh';
import { TrangDanhSachChuyenBay } from '@/trang/chuyen_bay/TrangDanhSachChuyenBay';
import { TrangThemSuaChuyenBay } from '@/trang/chuyen_bay/TrangThemSuaChuyenBay';
import { TrangXemChuyenBay } from '@/trang/chuyen_bay/TrangXemChuyenBay';
import { TrangDanhSachVe } from '@/trang/ve/TrangDanhSachVe';
import { TrangBanVe } from '@/trang/ve/TrangBanVe';
import { TrangDanhSachPhieuDat } from '@/trang/phieu_dat/TrangDanhSachPhieuDat';
import { TrangDatVe } from '@/trang/phieu_dat/TrangDatVe';

// các trang ít mở (bốn trang của Quản lý và Trợ giúp): tách khỏi tập tin JS chính, tải khi mở trang
const TrangBaoCao = lazy(() => import('@/trang/bao_cao/TrangBaoCao').then((m) => ({ default: m.TrangBaoCao })));
const TrangKiemThu = lazy(() => import('@/trang/kiem_thu/TrangKiemThu').then((m) => ({ default: m.TrangKiemThu })));
const TrangQuyDinh = lazy(() => import('@/trang/quy_dinh/TrangQuyDinh').then((m) => ({ default: m.TrangQuyDinh })));
const TrangTaiKhoan = lazy(() => import('@/trang/tai_khoan/TrangTaiKhoan').then((m) => ({ default: m.TrangTaiKhoan })));
const TrangTroGiup = lazy(() => import('@/trang/tro_giup/TrangTroGiup').then((m) => ({ default: m.TrangTroGiup })));

export function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<TrangDangNhap />} />
      <Route element={<YeuCauDangNhap />}>
        <Route element={<BoCuc />}>
          <Route index element={<TrangChinh />} />
          <Route path="chuyen-bay" element={<TrangDanhSachChuyenBay />} />
          <Route path="chuyen-bay/them" element={<YeuCauQuyen quyen={CHI_QUAN_LY}><TrangThemSuaChuyenBay /></YeuCauQuyen>} />
          <Route path="chuyen-bay/:ma" element={<TrangXemChuyenBay />} />
          <Route path="chuyen-bay/:ma/sua" element={<YeuCauQuyen quyen={CHI_QUAN_LY}><TrangThemSuaChuyenBay /></YeuCauQuyen>} />
          <Route path="ve" element={<TrangDanhSachVe />} />
          <Route path="ban-ve" element={<TrangBanVe />} />
          <Route path="phieu-dat" element={<TrangDanhSachPhieuDat />} />
          <Route path="dat-ve" element={<TrangDatVe />} />
          <Route element={<YeuCauQuyen quyen={CHI_QUAN_LY} />}>
            <Route path="bao-cao" element={<Suspense fallback={null}><TrangBaoCao /></Suspense>} />
            <Route path="quy-dinh" element={<Suspense fallback={null}><TrangQuyDinh /></Suspense>} />
            <Route path="tai-khoan" element={<Suspense fallback={null}><TrangTaiKhoan /></Suspense>} />
            <Route path="kiem-thu" element={<Suspense fallback={null}><TrangKiemThu /></Suspense>} />
          </Route>
          <Route path="tro-giup" element={<Suspense fallback={null}><TrangTroGiup /></Suspense>} />
          <Route path="*" element={<TrangKhongTimThay />} />
        </Route>
      </Route>
    </Routes>
  );
}
