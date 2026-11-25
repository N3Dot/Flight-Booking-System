using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QuanLyBanVe.Api.TienIch;
using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.Api.GiaoTiep;

/// <summary>
/// Trang Kiểm thử (chỉ Quản lý, ngoài các use case của đề tài): chạy bộ kiểm thử giao diện Playwright
/// trên máy chủ và xem kết quả. Đặt KiemThu:Bat = false trong appsettings.json để tắt hẳn.
/// </summary>
[ApiController]
[Authorize(Roles = VaiTro.QUAN_LY)]
public class KiemThuController : ControllerBase
{
    private readonly BoChayKiemThu boChay;
    private readonly bool bat;

    public KiemThuController(BoChayKiemThu boChay, IConfiguration cauHinh)
    {
        this.boChay = boChay;
        bat = cauHinh.GetValue("KiemThu:Bat", false);
    }

    [HttpGet("api/kiem-thu/danh-sach")]
    public IActionResult layDanhSach()
    {
        kiemTraBat();
        return Ok(boChay.layDanhSach());
    }

    [HttpGet("api/kiem-thu/trang-thai")]
    public IActionResult layTrangThai()
    {
        kiemTraBat();
        return Ok(boChay.layTrangThai());
    }

    [HttpPost("api/kiem-thu/chay")]
    public IActionResult chay([FromBody] YeuCauChayKiemThu yeuCau)
    {
        kiemTraBat();
        // trình duyệt kiểm thử mở trên máy chủ nên luôn gọi về localhost, đúng cổng đang phục vụ
        boChay.chay(yeuCau.CacCa ?? new List<string>(), yeuCau.ChamMs ?? 0, yeuCau.HienTrinhDuyet ?? true,
            $"http://localhost:{HttpContext.Connection.LocalPort}");
        return NoContent();
    }

    [HttpPost("api/kiem-thu/dung")]
    public IActionResult dung()
    {
        kiemTraBat();
        boChay.dung();
        return NoContent();
    }

    /// <summary>Đọc các dòng của một bảng (lọc theo cột = giá trị) để bộ kiểm thử mở ra cho người xem kiểm chứng.</summary>
    [HttpGet("api/kiem-thu/csdl")]
    public IActionResult xemCsdl([FromServices] XL_KiemThu xl, string bang, string? cot, string? giaTri)
    {
        kiemTraBat();
        return Ok(xl.xemBang(bang, cot, giaTri));
    }

    private void kiemTraBat()
    {
        if (!bat) throw LoiNghiepVu.khongTimThay("Không tìm thấy đường dẫn.");
    }
}
