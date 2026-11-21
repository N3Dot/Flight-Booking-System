using System.Collections.Concurrent;

namespace QuanLyBanVe.Api.TienIch;

/// <summary>
/// Chống dò mật khẩu: đếm số lần đăng nhập sai trong một phút theo cặp (địa chỉ máy, tên đăng nhập)
/// và theo địa chỉ máy. Vượt ngưỡng thì khóa tạm, kể cả khi lần sau nhập đúng. Chỉ đếm lần sai nên
/// nhiều người đăng nhập đúng từ cùng một địa chỉ không bị ảnh hưởng. Bộ đếm nằm trong bộ nhớ.
/// </summary>
public class GioiHanDangNhap
{
    public const int SO_LAN_SAI_TOI_DA = 5;
    public const int SO_LAN_SAI_TOI_DA_MOT_MAY = 30;
    private static readonly TimeSpan CUA_SO = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan KHOA_TAM = TimeSpan.FromMinutes(5);
    private const int SO_MUC_TOI_DA = 10_000;

    private readonly ConcurrentDictionary<string, (int SoLan, DateTime HetHan)> dem = new();
    private readonly DongHoHeThong dongHo;

    public GioiHanDangNhap(DongHoHeThong dongHo)
    {
        this.dongHo = dongHo;
    }

    /// <summary>Số giây còn bị khóa tạm; 0 là được đăng nhập.</summary>
    public int soGiayConKhoa(string diaChi, string tenDN)
    {
        return Math.Max(conKhoa(khoaMay(diaChi), SO_LAN_SAI_TOI_DA_MOT_MAY), conKhoa(khoaCap(diaChi, tenDN), SO_LAN_SAI_TOI_DA));
    }

    public void ghiLanSai(string diaChi, string tenDN)
    {
        tang(khoaMay(diaChi), SO_LAN_SAI_TOI_DA_MOT_MAY);
        tang(khoaCap(diaChi, tenDN), SO_LAN_SAI_TOI_DA);
    }

    public void ghiLanDung(string diaChi, string tenDN)
    {
        dem.TryRemove(khoaCap(diaChi, tenDN), out _);
    }

    private static string khoaMay(string diaChi) => "may|" + diaChi;

    private static string khoaCap(string diaChi, string tenDN) => "cap|" + diaChi + "|" + tenDN.Trim().ToLowerInvariant();

    private int conKhoa(string khoa, int nguong)
    {
        if (!dem.TryGetValue(khoa, out var muc) || muc.SoLan < nguong) return 0;
        double giay = (muc.HetHan - dongHo.layThoiDiemHienTai()).TotalSeconds;
        return giay > 0 ? (int)Math.Ceiling(giay) : 0;
    }

    private void tang(string khoa, int nguong)
    {
        DateTime bayGio = dongHo.layThoiDiemHienTai();
        if (dem.Count > SO_MUC_TOI_DA)
            foreach (var muc in dem.Where(muc => muc.Value.HetHan <= bayGio)) dem.TryRemove(muc.Key, out _);

        dem.AddOrUpdate(khoa, _ => (1, bayGio + CUA_SO), (_, cu) =>
        {
            if (cu.HetHan <= bayGio) return (1, bayGio + CUA_SO);
            int soLan = cu.SoLan + 1;
            return (soLan, soLan >= nguong ? bayGio + KHOA_TAM : cu.HetHan);
        });
    }
}
