using QuanLyBanVe.Api.TienIch;
using QuanLyBanVe.Api.TruyXuat;

namespace QuanLyBanVe.Api.XuLy;

/// <summary>
/// Sao lưu dữ liệu ngay trên giao diện (chỉ Quản lý, bổ sung cho AT01): tạo thêm một bản sao lưu ngoài lịch hằng ngày
/// ở mục 6.1.6. Phục hồi không làm trên giao diện vì ghi đè toàn bộ dữ liệu đang dùng.
/// </summary>
public class XL_SaoLuu
{
    private readonly DAL_SaoLuu dalSaoLuu;
    private readonly DongHoHeThong dongHo;

    public XL_SaoLuu(DAL_SaoLuu dalSaoLuu, DongHoHeThong dongHo)
    {
        this.dalSaoLuu = dalSaoLuu;
        this.dongHo = dongHo;
    }

    /// <summary>thuMuc rỗng thì dùng thư mục sao lưu mặc định của SQL Server. Tên tập tin mang thời điểm tạo và hậu tố _tay.</summary>
    public KetQuaSaoLuu saoLuu(string? thuMuc)
    {
        DateTime thoiDiem = dongHo.layThoiDiemHienTai();
        string noiLuu = string.IsNullOrWhiteSpace(thuMuc) ? dalSaoLuu.layThuMucMacDinh() : thuMuc.Trim();
        string tapTin = Path.Combine(noiLuu, $"{dalSaoLuu.layTenCSDL()}_{thoiDiem:yyyyMMdd_HHmmss}_tay.bak");
        try
        {
            dalSaoLuu.saoLuu(tapTin);
        }
        catch (LoiSaoLuu loi)
        {
            throw LoiNghiepVu.viPham(MaLoi.KHONG_SAO_LUU_DUOC, loi.ThieuQuyen
                ? "Tài khoản SQL Server của phần mềm chưa có quyền sao lưu (db_backupoperator). Báo người phụ trách máy chủ."
                : $"SQL Server không ghi được vào thư mục {noiLuu}. Kiểm tra thư mục đã có và SQL Server được quyền ghi.");
        }
        return new KetQuaSaoLuu(tapTin, thoiDiem);
    }
}

public record KetQuaSaoLuu(string TapTin, DateTime ThoiDiem);
