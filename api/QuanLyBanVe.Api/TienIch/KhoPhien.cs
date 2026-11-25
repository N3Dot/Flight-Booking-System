using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;

namespace QuanLyBanVe.Api.TienIch;

/// <summary>
/// Giữ phiên đăng nhập ở máy chủ; cookie qlbv_phien chỉ mang khóa phiên. Đăng xuất hoặc đặt lại mật khẩu
/// thì phiên bị xóa ở đây nên cookie cũ không dùng lại được. Khi đã gọi datTapTin, các phiên được ghi
/// xuống tập tin nên máy chủ khởi động lại thì người dùng không phải đăng nhập lại.
/// </summary>
public class KhoPhien : ITicketStore
{
    private readonly ConcurrentDictionary<string, AuthenticationTicket> cacPhien = new();
    private readonly object khoaGhi = new();
    private string? tapTin;
    private IDataProtector? baoVe;

    /// <summary>
    /// Đọc lại các phiên còn hạn từ tập tin và ghi mọi thay đổi về sau xuống đó. Tập tin chỉ giữ mã băm của khóa phiên
    /// (chép tập tin không dùng được làm cookie) và nội dung phiên được mã hóa bằng khóa bảo vệ dữ liệu của máy chủ.
    /// </summary>
    public void datTapTin(string duongDan, IDataProtectionProvider nhaCungCap)
    {
        tapTin = duongDan;
        baoVe = nhaCungCap.CreateProtector("QuanLyBanVe.KhoPhien");
        if (!File.Exists(duongDan)) return;
        foreach (string dong in File.ReadAllLines(duongDan))
        {
            string[] phan = dong.Split('\t');
            if (phan.Length != 2) continue;
            try
            {
                AuthenticationTicket? phien = TicketSerializer.Default.Deserialize(baoVe.Unprotect(Convert.FromBase64String(phan[1])));
                if (phien != null && !daHetHan(phien)) cacPhien[phan[0]] = phien;
            }
            catch (CryptographicException)
            {
                // khóa bảo vệ dữ liệu đã đổi: bỏ phiên này, người dùng đăng nhập lại
            }
        }
    }

    public Task<string> StoreAsync(AuthenticationTicket phien)
    {
        string khoa = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        cacPhien[bam(khoa)] = phien;
        luu();
        return Task.FromResult(khoa);
    }

    public Task RenewAsync(string khoa, AuthenticationTicket phien)
    {
        cacPhien[bam(khoa)] = phien;
        luu();
        return Task.CompletedTask;
    }

    public Task<AuthenticationTicket?> RetrieveAsync(string khoa)
    {
        cacPhien.TryGetValue(bam(khoa), out AuthenticationTicket? phien);
        return Task.FromResult(phien);
    }

    public Task RemoveAsync(string khoa)
    {
        if (cacPhien.TryRemove(bam(khoa), out _)) luu();
        return Task.CompletedTask;
    }

    /// <summary>Xóa mọi phiên của một tài khoản (khi đặt lại mật khẩu).</summary>
    public void huyCuaTaiKhoan(string tenDN)
    {
        foreach (var muc in cacPhien.Where(muc =>
            string.Equals(muc.Value.Principal.Identity?.Name, tenDN, StringComparison.OrdinalIgnoreCase)))
            cacPhien.TryRemove(muc.Key, out _);
        luu();
    }

    private static bool daHetHan(AuthenticationTicket phien) => phien.Properties.ExpiresUtc < DateTimeOffset.UtcNow;

    private static string bam(string khoa) => Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(khoa)));

    private void luu()
    {
        // dọn các phiên đã hết hạn mà không ai quay lại
        foreach (var muc in cacPhien.Where(muc => daHetHan(muc.Value)))
            cacPhien.TryRemove(muc.Key, out _);
        if (tapTin == null || baoVe == null) return;

        lock (khoaGhi)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(tapTin)!);
            string tam = tapTin + ".tam";
            File.WriteAllLines(tam, cacPhien.Select(muc =>
                muc.Key + "\t" + Convert.ToBase64String(baoVe.Protect(TicketSerializer.Default.Serialize(muc.Value)))));
            // ghi tập tin tạm rồi đổi tên để máy chủ tắt giữa chừng không để lại tập tin hỏng
            File.Move(tam, tapTin, overwrite: true);
        }
    }
}
