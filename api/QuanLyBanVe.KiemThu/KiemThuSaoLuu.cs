using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.KiemThu;

/// <summary>
/// Sao lưu dữ liệu ngay trên giao diện (bổ sung cho AT01). Tập tin do SQL Server ghi vào thư mục của nó nên ca kiểm thử
/// kiểm tra và xóa tập tin qua SQL Server (sys.dm_os_file_exists, xp_delete_files), không qua hệ thống tập tin.
/// </summary>
public class KiemThuSaoLuu : KiemThuCoSo
{
    private readonly XL_SaoLuu xl;

    public KiemThuSaoLuu(CoSoDuLieuThu csdl) : base(csdl)
    {
        xl = lay<XL_SaoLuu>();
    }

    private bool coTapTin(string tapTin) =>
        csdl.dem($"SELECT file_exists FROM sys.dm_os_file_exists(N'{tapTin.Replace("'", "''")}')") == 1;

    [Fact(DisplayName = "AT01 bổ sung: sao lưu ngay tạo tập tin .bak mang thời điểm tạo, là bản COPY_ONLY có tổng kiểm, không đổi dữ liệu")]
    public void SaoLuuNgay()
    {
        taoChuyenBay("CB600", HOM_NAY.AddDays(5).AddHours(8));
        int soChuyenBay = csdl.dem("SELECT COUNT(*) FROM CHUYENBAY");

        KetQuaSaoLuu kq = xl.saoLuu(null);
        try
        {
            Assert.EndsWith($"{CoSoDuLieuThu.TEN_CSDL}_20261112_090000_tay.bak", kq.TapTin);
            Assert.Equal(dongHo.BayGio, kq.ThoiDiem);
            Assert.True(coTapTin(kq.TapTin));
            // bản sao lưu thêm không làm đổi chuỗi sao lưu hằng ngày và được SQL Server kiểm tra từng trang khi ghi
            Assert.Equal(1, csdl.dem(
                "SELECT TOP (1) CASE WHEN s.is_copy_only = 1 AND s.has_backup_checksums = 1 THEN 1 ELSE 0 END " +
                "FROM msdb.dbo.backupset s JOIN msdb.dbo.backupmediafamily m ON m.media_set_id = s.media_set_id " +
                $"WHERE m.physical_device_name = N'{kq.TapTin}' ORDER BY s.backup_finish_date DESC"));
            Assert.Equal(soChuyenBay, csdl.dem("SELECT COUNT(*) FROM CHUYENBAY"));
        }
        finally
        {
            csdl.thucThi($"EXEC master.sys.xp_delete_files N'{kq.TapTin}'");
        }
    }

    [Fact(DisplayName = "AT01 bổ sung: thư mục sao lưu không có thì báo KHONG_SAO_LUU_DUOC kèm tên thư mục, không tạo tập tin")]
    public void ThuMucKhongCo()
    {
        string thuMuc = @"D:\khong_co_thu_muc_sao_luu_" + Guid.NewGuid().ToString("N");

        LoiNghiepVu loi = Assert.Throws<LoiNghiepVu>(() => xl.saoLuu(thuMuc));

        Assert.Equal(MaLoi.KHONG_SAO_LUU_DUOC, loi.Ma);
        Assert.Contains(thuMuc, loi.Message);
        Assert.False(coTapTin(Path.Combine(thuMuc, $"{CoSoDuLieuThu.TEN_CSDL}_20261112_090000_tay.bak")));
    }
}
