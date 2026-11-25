using QuanLyBanVe.Api.TruyXuat;

namespace QuanLyBanVe.Api.XuLy;

/// <summary>
/// Trang Kiểm thử (ngoài các use case của đề tài): đọc các dòng của một bảng để bộ kiểm thử giao diện
/// mở ra cho người xem kiểm chứng. Danh sách bảng được xem và việc bỏ cột mật khẩu nằm ở DAL_KiemThu.
/// </summary>
public class XL_KiemThu
{
    private readonly DAL_KiemThu dalKiemThu;

    public XL_KiemThu(DAL_KiemThu dalKiemThu)
    {
        this.dalKiemThu = dalKiemThu;
    }

    /// <summary>Tối đa 50 dòng của bảng, lọc theo cột = giá trị nếu có cột.</summary>
    public KetQuaXemBang xemBang(string bang, string? cot, string? giaTri)
    {
        return dalKiemThu.xemBang(bang, cot, giaTri) ?? throw LoiNghiepVu.khongTimThay("Không có bảng hoặc cột này.");
    }
}
