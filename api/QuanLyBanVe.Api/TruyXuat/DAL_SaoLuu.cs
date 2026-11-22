using Microsoft.Data.SqlClient;

namespace QuanLyBanVe.Api.TruyXuat;

/// <summary>
/// Sao lưu toàn bộ cơ sở dữ liệu đang kết nối thành một tập tin .bak. Chính SQL Server ghi tập tin nên đường dẫn
/// là đường dẫn trên máy chủ cơ sở dữ liệu, thư mục phải cho tài khoản dịch vụ của SQL Server quyền ghi.
/// </summary>
public class DAL_SaoLuu
{
    // 3201: không mở được tập tin (thư mục không có hoặc SQL Server không được ghi); 262: tài khoản thiếu quyền BACKUP
    private const int LOI_TAP_TIN = 3201;
    private const int LOI_QUYEN = 262;

    private readonly KetNoiCSDL ketNoi;

    public DAL_SaoLuu(KetNoiCSDL ketNoi)
    {
        this.ketNoi = ketNoi;
    }

    /// <summary>Thư mục sao lưu mặc định của phiên bản SQL Server.</summary>
    public string layThuMucMacDinh()
    {
        return (string)ketNoi.docGiaTri("SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(260))")!;
    }

    public string layTenCSDL()
    {
        return (string)ketNoi.docGiaTri("SELECT DB_NAME()")!;
    }

    /// <summary>
    /// COPY_ONLY để bản sao lưu thêm này không làm đổi chuỗi sao lưu hằng ngày; CHECKSUM để SQL Server kiểm tra từng trang khi ghi.
    /// </summary>
    public void saoLuu(string tapTin)
    {
        using SqlConnection kn = ketNoi.layKetNoi();
        using var lenh = new SqlCommand(
            "DECLARE @csdl sysname = DB_NAME(); BACKUP DATABASE @csdl TO DISK = @tapTin WITH COPY_ONLY, INIT, CHECKSUM", kn)
        {
            // sao lưu dữ liệu ở mức Bảng 1.11 lâu hơn 30 giây mặc định của câu lệnh
            CommandTimeout = 600
        };
        lenh.Parameters.Add(ThamSo.ChuoiCoDau("@tapTin", tapTin, 260));
        try
        {
            lenh.ExecuteNonQuery();
        }
        catch (SqlException loi) when (loi.Errors.Cast<SqlError>().Any(e => e.Number is LOI_TAP_TIN or LOI_QUYEN))
        {
            throw new LoiSaoLuu(loi.Errors.Cast<SqlError>().Any(e => e.Number == LOI_QUYEN), loi);
        }
    }
}

/// <summary>SQL Server không ghi được bản sao lưu: thiếu quyền BACKUP hoặc không ghi được vào thư mục.</summary>
public class LoiSaoLuu : Exception
{
    public bool ThieuQuyen { get; }

    public LoiSaoLuu(bool thieuQuyen, Exception loiGoc) : base("Không sao lưu được cơ sở dữ liệu.", loiGoc)
    {
        ThieuQuyen = thieuQuyen;
    }
}
