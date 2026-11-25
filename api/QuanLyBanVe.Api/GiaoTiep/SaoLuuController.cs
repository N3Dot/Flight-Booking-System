using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.Api.GiaoTiep;

/// <summary>Sao lưu dữ liệu ngay (chỉ Quản lý). Thư mục lưu đọc từ SaoLuu:ThuMuc, để trống thì dùng thư mục mặc định của SQL Server.</summary>
[ApiController]
[Authorize(Roles = VaiTro.QUAN_LY)]
public class SaoLuuController : ControllerBase
{
    private readonly XL_SaoLuu xlSaoLuu;
    private readonly string? thuMuc;

    public SaoLuuController(XL_SaoLuu xlSaoLuu, IConfiguration cauHinh)
    {
        this.xlSaoLuu = xlSaoLuu;
        thuMuc = cauHinh["SaoLuu:ThuMuc"];
    }

    [HttpPost("api/sao-luu")]
    public IActionResult saoLuu()
    {
        return Ok(xlSaoLuu.saoLuu(thuMuc));
    }
}
