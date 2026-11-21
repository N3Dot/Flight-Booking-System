using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QuanLyBanVe.Api.DTO;
using QuanLyBanVe.Api.TienIch;
using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.Api.GiaoTiep;

/// <summary>Phiên làm việc (UC01): đăng nhập, đăng xuất, xem phiên hiện tại.</summary>
[ApiController]
public class PhienController : ControllerBase
{
    private readonly XL_DangNhap xlDangNhap;
    private readonly PhienLamViec phien;
    private readonly GioiHanDangNhap gioiHan;

    public PhienController(XL_DangNhap xlDangNhap, PhienLamViec phien, GioiHanDangNhap gioiHan)
    {
        this.gioiHan = gioiHan;
        this.xlDangNhap = xlDangNhap;
        this.phien = phien;
    }

    [HttpPost("api/dang-nhap")]
    [AllowAnonymous]
    public async Task<IActionResult> dangNhap([FromBody] YeuCauDangNhap yeuCau)
    {
        string diaChi = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
        string tenDN = yeuCau.TenDangNhap ?? "";
        int soGiay = gioiHan.soGiayConKhoa(diaChi, tenDN);
        if (soGiay > 0)
            throw new LoiNghiepVu(LoaiLoi.QuaNhieuLanThu, MaLoi.DANG_NHAP_SAI_NHIEU_LAN,
                "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau " + (soGiay + 59) / 60 + " phút.");

        TaiKhoan taiKhoan;
        try
        {
            taiKhoan = xlDangNhap.dangNhap(yeuCau.TenDangNhap, yeuCau.MatKhau);
        }
        catch (LoiNghiepVu loi) when (loi.Ma == MaLoi.SAI_THONG_TIN_DANG_NHAP)
        {
            gioiHan.ghiLanSai(diaChi, tenDN);
            throw;
        }
        gioiHan.ghiLanDung(diaChi, tenDN);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, XacThuc.taoDanhTinh(taiKhoan));
        return Ok(new { tenDangNhap = taiKhoan.TenDangNhap, nhomQuyen = ChuyenDoi.ma(taiKhoan.NhomQuyen) });
    }

    [HttpPost("api/dang-xuat")]
    [AllowAnonymous]
    public async Task<IActionResult> dangXuat()
    {
        xlDangNhap.dangXuat();
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [HttpGet("api/phien")]
    [Authorize]
    public IActionResult layPhien()
    {
        return Ok(new { tenDangNhap = phien.TenDangNhap, nhomQuyen = ChuyenDoi.ma(phien.NhomQuyen ?? "") });
    }
}
