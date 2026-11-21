using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using QuanLyBanVe.Api;
using QuanLyBanVe.Api.GiaoTiep;
using QuanLyBanVe.Api.TienIch;
using QuanLyBanVe.Api.XuLy;

var builder = WebApplication.CreateBuilder(args);

builder.Services.themTangXuLyVaTruyXuat();

builder.Services
    .AddControllers(tuyChon => tuyChon.Filters.Add<BoLocLoi>())
    .AddJsonOptions(tuyChon =>
    {
        tuyChon.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        tuyChon.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
        tuyChon.JsonSerializerOptions.Converters.Add(new BoChuyenNgayGio());
    })
    .ConfigureApiBehaviorOptions(tuyChon =>
    {
        // thân yêu cầu sai kiểu dữ liệu cũng trả lỗi đúng dạng { ma, thongBao, chiTiet }
        tuyChon.InvalidModelStateResponseFactory = nguCanh =>
        {
            var chiTiet = new Dictionary<string, string>();
            foreach (var muc in nguCanh.ModelState.Where(muc => muc.Value?.Errors.Count > 0))
            {
                string ten = muc.Key.Split('.').Last().TrimStart('$');
                chiTiet[ten.Length == 0 ? "yeuCau" : ChuyenDoi.tenCamelCase(ten)] = "Giá trị không hợp lệ.";
            }
            return new BadRequestObjectResult(new PhanHoiLoi(MaLoi.DU_LIEU_KHONG_HOP_LE, "Dữ liệu gửi lên không hợp lệ.", chiTiet));
        };
    });

// máy chủ có địa chỉ https (README, mục chạy trong mạng LAN): cookie phiên chỉ gửi qua HTTPS, bật HSTS và chuyển http sang https
bool coHttps = (builder.Configuration["urls"] ?? "").Contains("https://", StringComparison.OrdinalIgnoreCase);
builder.Services.themXacThucCookie(coHttps);

string[] nguonChoPhep = builder.Configuration.GetSection("Cors:NguonChoPhep").Get<string[]>()
    ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(tuyChon => tuyChon.AddDefaultPolicy(chinhSach => chinhSach
    .WithOrigins(nguonChoPhep)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()
    .WithExposedHeaders("Content-Disposition")));

builder.Services.AddHostedService<BoDinhThoi>();
builder.Services.AddSingleton<BoChayKiemThu>();

var app = builder.Build();

string thuMucNhatKy = Path.Combine(app.Environment.ContentRootPath, app.Configuration["NhatKy:ThuMuc"] ?? "nhat_ky");
TienIch_NhatKy.datDuongDan(Path.Combine(thuMucNhatKy, "huy_phieu_tu_dong.log"));

// CSDL sẵn sàng muộn hơn máy chủ (vd máy vừa khởi động) thì thử lại ở nền, 15 giây một lần trong 5 phút
if (!taoTaiKhoanBanDau(app))
{
    _ = Task.Run(async () =>
    {
        for (int lan = 0; lan < 20; lan++)
        {
            await Task.Delay(TimeSpan.FromSeconds(15));
            if (taoTaiKhoanBanDau(app)) break;
        }
    });
}

app.UseMiddleware<BatLoiChung>();
if (coHttps)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
// header bảo mật cho mọi phản hồi: không cho nhúng trang vào khung, không đoán kiểu nội dung, chỉ nạp tài nguyên của chính máy chủ
app.Use((nguCanh, buocKe) =>
{
    IHeaderDictionary dau = nguCanh.Response.Headers;
    dau["X-Frame-Options"] = "DENY";
    dau["X-Content-Type-Options"] = "nosniff";
    dau["Referrer-Policy"] = "same-origin";
    dau["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    return buocKe(nguCanh);
});
// chống giả mạo yêu cầu từ trang khác (CSRF): yêu cầu ghi tới API phải kèm header X-Requested-With,
// thứ mà biểu mẫu HTML không gắn được và trang khác nguồn muốn gắn thì bị CORS chặn
app.Use((nguCanh, buocKe) =>
{
    HttpRequest yeuCau = nguCanh.Request;
    bool laGhi = !HttpMethods.IsGet(yeuCau.Method) && !HttpMethods.IsHead(yeuCau.Method) && !HttpMethods.IsOptions(yeuCau.Method);
    if (laGhi && yeuCau.Path.StartsWithSegments("/api") && !yeuCau.Headers.ContainsKey("X-Requested-With"))
        return PhanHoiLoi.ghi(nguCanh.Response, StatusCodes.Status400BadRequest, MaLoi.THIEU_HEADER_YEU_CAU,
            "Yêu cầu thiếu header X-Requested-With.");
    return buocKe(nguCanh);
});
// đường dẫn không có hoặc sai phương thức cũng trả JSON đúng dạng lỗi
app.UseStatusCodePages(nguCanh =>
{
    HttpResponse phanHoi = nguCanh.HttpContext.Response;
    return phanHoi.StatusCode == StatusCodes.Status404NotFound
        ? PhanHoiLoi.ghi(phanHoi, phanHoi.StatusCode, MaLoi.KHONG_TIM_THAY, "Không tìm thấy đường dẫn.")
        : PhanHoiLoi.ghi(phanHoi, phanHoi.StatusCode, MaLoi.DU_LIEU_KHONG_HOP_LE, "Yêu cầu không hợp lệ.");
});
// giao diện đã dựng (npm run dung-may-chu) nằm trong wwwroot, được phục vụ cùng địa chỉ với API
bool coGiaoDien = File.Exists(Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "index.html"));
if (coGiaoDien)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
if (coGiaoDien)
{
    // đường dẫn /api không khớp vẫn trả lỗi JSON; các đường dẫn còn lại là trang của giao diện
    app.MapFallback("/api/{**duongDan}", (HttpContext nguCanh) =>
        PhanHoiLoi.ghi(nguCanh.Response, StatusCodes.Status404NotFound, MaLoi.KHONG_TIM_THAY, "Không tìm thấy đường dẫn."));
    app.MapFallbackToFile("index.html");
}

app.Run();

// Lần chạy đầu, bảng TAIKHOAN còn rỗng thì tạo các tài khoản ban đầu khai báo ở mục TaiKhoanBanDau của cấu hình.
// Trả về false khi chưa làm được (chưa kết nối được CSDL).
static bool taoTaiKhoanBanDau(WebApplication app)
{
    var danhSach = new List<(string, string, string, bool)>();
    foreach (IConfigurationSection muc in app.Configuration.GetSection("TaiKhoanBanDau").GetChildren())
    {
        string? tenDangNhap = muc["TenDangNhap"];
        string? matKhau = muc["MatKhau"];
        string? nhomQuyen = ChuyenDoi.nhomQuyenTuMa(muc["NhomQuyen"]);
        if (string.IsNullOrWhiteSpace(tenDangNhap) || string.IsNullOrEmpty(matKhau) || nhomQuyen == null) continue;
        danhSach.Add((tenDangNhap, matKhau, nhomQuyen, muc.GetValue("DaKhoa", false)));
    }
    if (danhSach.Count == 0) return true;

    try
    {
        using IServiceScope phamVi = app.Services.CreateScope();
        int soDaTao = phamVi.ServiceProvider.GetRequiredService<XL_PhanQuyen>().taoTaiKhoanBanDau(danhSach);
        if (soDaTao > 0) app.Logger.LogInformation("Da tao {SoTaiKhoan} tai khoan ban dau.", soDaTao);
        return true;
    }
    catch (Exception loi)
    {
        app.Logger.LogError(loi, "Khong tao duoc tai khoan ban dau. Kiem tra chuoi ket noi va da chay script trong thu muc db chua.");
        return false;
    }
}

// để dự án kiểm thử khởi động được máy chủ trong bộ nhớ
public partial class Program { }
