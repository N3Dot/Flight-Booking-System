using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace QuanLyBanVe.Api.TienIch;

/// <summary>
/// Giữ phiên đăng nhập ở máy chủ; cookie qlbv_phien chỉ mang khóa phiên. Đăng xuất hoặc đặt lại mật khẩu
/// thì phiên bị xóa ở đây nên cookie cũ không dùng lại được. Phiên nằm trong bộ nhớ: khởi động lại
/// máy chủ thì mọi người đăng nhập lại.
/// </summary>
public class KhoPhien : ITicketStore
{
    private readonly ConcurrentDictionary<string, AuthenticationTicket> cacPhien = new();

    public Task<string> StoreAsync(AuthenticationTicket phien)
    {
        // dọn các phiên đã hết hạn mà không ai quay lại
        foreach (var muc in cacPhien.Where(muc => muc.Value.Properties.ExpiresUtc < DateTimeOffset.UtcNow))
            cacPhien.TryRemove(muc.Key, out _);

        string khoa = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        cacPhien[khoa] = phien;
        return Task.FromResult(khoa);
    }

    public Task RenewAsync(string khoa, AuthenticationTicket phien)
    {
        cacPhien[khoa] = phien;
        return Task.CompletedTask;
    }

    public Task<AuthenticationTicket?> RetrieveAsync(string khoa)
    {
        cacPhien.TryGetValue(khoa, out AuthenticationTicket? phien);
        return Task.FromResult(phien);
    }

    public Task RemoveAsync(string khoa)
    {
        cacPhien.TryRemove(khoa, out _);
        return Task.CompletedTask;
    }

    /// <summary>Xóa mọi phiên của một tài khoản (khi đặt lại mật khẩu).</summary>
    public void huyCuaTaiKhoan(string tenDN)
    {
        foreach (var muc in cacPhien.Where(muc =>
            string.Equals(muc.Value.Principal.Identity?.Name, tenDN, StringComparison.OrdinalIgnoreCase)))
            cacPhien.TryRemove(muc.Key, out _);
    }
}
