using Microsoft.Extensions.DependencyInjection;
using QuanLyBanVe.Api.DTO;
using QuanLyBanVe.Api.TienIch;
using QuanLyBanVe.Api.TruyXuat;
using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.KiemThu;

public class KiemThuUC01_DangNhap : KiemThuCoSo
{
    public KiemThuUC01_DangNhap(CoSoDuLieuThu csdl) : base(csdl)
    {
        lay<XL_PhanQuyen>().taoTaiKhoanBanDau(new[]
        {
            ("quanly", "Quanly@123", TaiKhoan.QUAN_LY, false),
            ("nhanvien", "Nhanvien@123", TaiKhoan.NHAN_VIEN, false),
            ("nhanvien2", "Nhanvien2@123", TaiKhoan.NHAN_VIEN, true)
        });
    }

    [Fact(DisplayName = "BMT01: đăng nhập đúng trả về nhóm quyền và ghi vào phiên làm việc")]
    public void DangNhapDung()
    {
        TaiKhoan quanLy = lay<XL_DangNhap>().dangNhap("quanly", "Quanly@123");
        Assert.Equal(TaiKhoan.QUAN_LY, quanLy.NhomQuyen);
        Assert.Equal("quanly", lay<PhienLamViec>().TenDangNhap);
        Assert.Equal(TaiKhoan.QUAN_LY, lay<PhienLamViec>().NhomQuyen);

        TaiKhoan nhanVien = taoMay().GetRequiredService<XL_DangNhap>().dangNhap("nhanvien", "Nhanvien@123");
        Assert.Equal(TaiKhoan.NHAN_VIEN, nhanVien.NhomQuyen);
    }

    [Fact(DisplayName = "BMT01 ngoại lệ 4a: sai mật khẩu hoặc sai tên đăng nhập báo cùng một câu")]
    public void SaiThongTin()
    {
        LoiNghiepVu saiMatKhau = batLoi(() => lay<XL_DangNhap>().dangNhap("quanly", "sai-mat-khau"));
        LoiNghiepVu saiTen = batLoi(() => lay<XL_DangNhap>().dangNhap("khongco", "Quanly@123"));

        Assert.Equal(MaLoi.SAI_THONG_TIN_DANG_NHAP, saiMatKhau.Ma);
        Assert.Equal(MaLoi.SAI_THONG_TIN_DANG_NHAP, saiTen.Ma);
        Assert.Equal("Sai tên đăng nhập hoặc mật khẩu.", saiMatKhau.Message);
        Assert.Equal(saiMatKhau.Message, saiTen.Message);
        Assert.False(lay<PhienLamViec>().daDangNhap);
    }

    [Fact(DisplayName = "BMT01 ngoại lệ 4b: tài khoản đã bị khóa không đăng nhập được")]
    public void TaiKhoanBiKhoa()
    {
        LoiNghiepVu loi = batLoi(() => lay<XL_DangNhap>().dangNhap("nhanvien2", "Nhanvien2@123"));
        Assert.Equal(MaLoi.TAI_KHOAN_BI_KHOA, loi.Ma);
        Assert.Equal("Tài khoản đã bị khóa.", loi.Message);

        // sai mật khẩu thì không cho biết tài khoản đang bị khóa
        LoiNghiepVu saiMatKhau = batLoi(() => lay<XL_DangNhap>().dangNhap("nhanvien2", "sai"));
        Assert.Equal(MaLoi.SAI_THONG_TIN_DANG_NHAP, saiMatKhau.Ma);
    }

    [Fact(DisplayName = "BMT01: để trống tên đăng nhập hoặc mật khẩu thì báo lỗi từng ô")]
    public void DeTrong()
    {
        LoiNghiepVu loi = batLoi(() => lay<XL_DangNhap>().dangNhap(" ", ""));
        Assert.Equal(LoaiLoi.DuLieuKhongHopLe, loi.Loai);
        Assert.Contains("tenDangNhap", loi.ChiTiet.Keys);
        Assert.Contains("matKhau", loi.ChiTiet.Keys);
    }

    [Fact(DisplayName = "BMT01: mật khẩu lưu trong TAIKHOAN là chuỗi băm, không phải mật khẩu gốc")]
    public void MatKhauDuocBam()
    {
        TaiKhoan taiKhoan = lay<DAL_TaiKhoan>().timTaiKhoan("quanly")!;
        Assert.StartsWith("PBKDF2-SHA256$", taiKhoan.MatKhau);
        Assert.DoesNotContain("Quanly@123", taiKhoan.MatKhau);
    }

    // PH-02: biên của bộ đếm đăng nhập sai (5 lần trong 1 phút cho một tên, 30 lần cho một máy, khóa 5 phút)

    [Fact(DisplayName = "PH-02: sai 4 lần rồi đúng thì vào được và bộ đếm về 0; sai thêm 4 lần nữa vẫn chưa bị khóa")]
    public void PH02_Sai4LanRoiDung()
    {
        var gioiHan = new GioiHanDangNhap(dongHo);
        for (int i = 0; i < 4; i++) gioiHan.ghiLanSai("10.0.0.1", "quanly");
        int truocKhiDung = gioiHan.soGiayConKhoa("10.0.0.1", "quanly");
        gioiHan.ghiLanDung("10.0.0.1", "quanly");
        for (int i = 0; i < 4; i++) gioiHan.ghiLanSai("10.0.0.1", "quanly");

        Assert.Equal(0, truocKhiDung);
        Assert.Equal(0, gioiHan.soGiayConKhoa("10.0.0.1", "quanly"));
        gioiHan.ghiLanSai("10.0.0.1", "quanly");
        Assert.True(gioiHan.soGiayConKhoa("10.0.0.1", "quanly") > 0);
    }

    [Fact(DisplayName = "PH-02: lần sai thứ 5 cách lần sai đầu hơn 1 phút thì không bị khóa")]
    public void PH02_LanSaiThu5NgoaiCuaSo()
    {
        var gioiHan = new GioiHanDangNhap(dongHo);
        DateTime dau = dongHo.BayGio;
        for (int i = 0; i < 4; i++) gioiHan.ghiLanSai("10.0.0.2", "quanly");

        dongHo.BayGio = dau.AddMinutes(1).AddSeconds(1);
        gioiHan.ghiLanSai("10.0.0.2", "quanly");

        Assert.Equal(0, gioiHan.soGiayConKhoa("10.0.0.2", "quanly"));
    }

    [Fact(DisplayName = "PH-02: bị khóa tạm thì sau 4 phút 59 giây vẫn còn khóa, đủ 5 phút thì đăng nhập lại được")]
    public void PH02_KhoaTam5Phut()
    {
        var gioiHan = new GioiHanDangNhap(dongHo);
        DateTime khoaLuc = dongHo.BayGio;
        for (int i = 0; i < GioiHanDangNhap.SO_LAN_SAI_TOI_DA; i++) gioiHan.ghiLanSai("10.0.0.3", "quanly");

        dongHo.BayGio = khoaLuc.AddMinutes(4).AddSeconds(59);
        int conKhoa = gioiHan.soGiayConKhoa("10.0.0.3", "quanly");
        dongHo.BayGio = khoaLuc.AddMinutes(5);

        Assert.Equal(1, conKhoa);
        Assert.Equal(0, gioiHan.soGiayConKhoa("10.0.0.3", "quanly"));
    }

    [Fact(DisplayName = "PH-02: 30 lần sai từ một máy với nhiều tên thì khóa cả máy, 29 lần thì chưa")]
    public void PH02_KhoaCaMay()
    {
        var gioiHan = new GioiHanDangNhap(dongHo);
        // mỗi tên chỉ sai 1 lần nên không tên nào chạm ngưỡng 5 lần
        for (int i = 1; i < GioiHanDangNhap.SO_LAN_SAI_TOI_DA_MOT_MAY; i++) gioiHan.ghiLanSai("10.0.0.4", "ten" + i);
        int sau29Lan = gioiHan.soGiayConKhoa("10.0.0.4", "tenkhac");
        gioiHan.ghiLanSai("10.0.0.4", "ten30");

        Assert.Equal(0, sau29Lan);
        Assert.True(gioiHan.soGiayConKhoa("10.0.0.4", "tenkhac") > 0);
        Assert.Equal(0, gioiHan.soGiayConKhoa("10.0.0.5", "tenkhac"));
    }
}
