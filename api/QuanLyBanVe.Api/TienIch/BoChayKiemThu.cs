using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using QuanLyBanVe.Api.XuLy;

namespace QuanLyBanVe.Api.TienIch;

/// <summary>
/// Chạy bộ kiểm thử giao diện Playwright (thư mục web) cho trang Kiểm thử: lấy danh sách trường hợp,
/// chạy các trường hợp được chọn trong một tiến trình npx và theo dõi kết quả từng trường hợp qua
/// reporter web/bao_cao_trang_kiem_thu.ts. Mỗi lúc chỉ có một lần chạy.
/// </summary>
public partial class BoChayKiemThu
{
    /// <summary>Một trường hợp kiểm thử. Id = "tập tin:dòng", dùng làm tham số lọc của playwright test.</summary>
    public record CaKiemThu(int Stt, string Id, string Ma, string Ten, string Nhom, string TapTin);

    /// <summary>TrangThai: cho, dangChay, dat, truot, boQua, dung. Buoc là thao tác đang làm khi dangChay.</summary>
    public record KetQuaCa(string TrangThai, long? ThoiGianMs = null, string? Loi = null, string? Buoc = null, int SoBuoc = 0);

    public record TrangThaiChay(bool DangChay, DateTime? BatDau, DateTime? KetThuc,
        Dictionary<string, KetQuaCa> KetQua, List<string> NhatKy);

    private const string DAU_DONG = "@@KT ";
    private const int SO_DONG_NHAT_KY = 3000;
    public const int CHAM_TOI_DA_MS = 5000;

    private readonly string thuMucWeb;
    private readonly ILogger<BoChayKiemThu> nhatKyMayChu;
    private readonly object khoa = new();

    private List<CaKiemThu>? danhSach;
    private DateTime danhSachLuc;
    private Process? tienTrinh;
    private Dictionary<string, KetQuaCa> ketQua = new();
    private readonly List<string> nhatKy = new();
    private DateTime? batDau;
    private DateTime? ketThuc;
    private bool daDung;

    public BoChayKiemThu(IConfiguration cauHinh, IWebHostEnvironment moiTruong, IHostApplicationLifetime vongDoi,
        ILogger<BoChayKiemThu> nhatKyMayChu)
    {
        thuMucWeb = Path.GetFullPath(cauHinh["KiemThu:ThuMucWeb"]
            ?? Path.Combine(moiTruong.ContentRootPath, "..", "..", "web"));
        this.nhatKyMayChu = nhatKyMayChu;
        // tắt máy chủ thì dừng luôn trình duyệt kiểm thử đang chạy
        vongDoi.ApplicationStopping.Register(dung);
    }

    /// <summary>Danh sách trường hợp theo thứ tự Playwright chạy; đọc lại khi có tập tin .spec.ts mới sửa.</summary>
    public IReadOnlyList<CaKiemThu> layDanhSach()
    {
        string thuMucKiemThu = Path.Combine(thuMucWeb, "kiem_thu_e2e");
        if (!Directory.Exists(thuMucKiemThu))
            throw LoiNghiepVu.khongTimThay($"Không thấy thư mục kiểm thử {thuMucKiemThu}.");
        DateTime moiNhat = Directory.GetFiles(thuMucKiemThu, "*.spec.ts", SearchOption.AllDirectories).Select(File.GetLastWriteTimeUtc).DefaultIfEmpty().Max();
        lock (khoa)
        {
            if (danhSach != null && danhSachLuc >= moiNhat) return danhSach;
        }

        using Process lenh = Process.Start(taoLenh(new[] { "playwright", "test", "--list", "--reporter=json" }))!;
        // đọc hai luồng ra ở nền rồi mới chờ có giới hạn; đọc đồng bộ thì lệnh treo sẽ làm yêu cầu treo theo
        Task<string> loiRa = lenh.StandardError.ReadToEndAsync();
        Task<string> dauRa = lenh.StandardOutput.ReadToEndAsync();
        bool xong = lenh.WaitForExit(120_000);
        if (!xong) lenh.Kill(entireProcessTree: true);
        string ra = dauRa.Result;
        if (!xong || ra.IndexOf('{') < 0)
        {
            nhatKyMayChu.LogError("Khong lay duoc danh sach kiem thu: {Loi}", loiRa.Result);
            throw LoiNghiepVu.viPham(MaLoi.LOI_HE_THONG,
                "Không lấy được danh sách kiểm thử. Kiểm tra đã chạy npm ci trong thư mục web chưa.");
        }

        var moi = new List<CaKiemThu>();
        using JsonDocument json = JsonDocument.Parse(ra[ra.IndexOf('{')..]);
        foreach (JsonElement tapTin in json.RootElement.GetProperty("suites").EnumerateArray())
            docNhom(tapTin, tapTin.GetProperty("title").GetString() ?? "", moi, laTapTin: true);

        lock (khoa)
        {
            danhSach = moi;
            danhSachLuc = moiNhat;
            return danhSach;
        }
    }

    // nhóm hiển thị là tên test.describe cấp đầu; trường hợp nằm thẳng trong tập tin thì nhóm là tên tập tin
    private static void docNhom(JsonElement nhom, string tenNhom, List<CaKiemThu> ketQua, bool laTapTin = false)
    {
        if (nhom.TryGetProperty("specs", out JsonElement cacCa))
        {
            foreach (JsonElement ca in cacCa.EnumerateArray())
            {
                string tieuDe = ca.GetProperty("title").GetString() ?? "";
                Match tach = MaVaTen().Match(tieuDe);
                string tapTin = ca.GetProperty("file").GetString() ?? "";
                ketQua.Add(new CaKiemThu(ketQua.Count + 1, $"{tapTin}:{ca.GetProperty("line").GetInt32()}",
                    tach.Success ? tach.Groups[1].Value : "", tach.Success ? tach.Groups[2].Value : tieuDe, tenNhom, tapTin));
            }
        }
        if (nhom.TryGetProperty("suites", out JsonElement nhomCon))
        {
            foreach (JsonElement con in nhomCon.EnumerateArray())
                docNhom(con, laTapTin ? con.GetProperty("title").GetString() ?? tenNhom : tenNhom, ketQua);
        }
    }

    [GeneratedRegex(@"^(\S+\.\d+)\s+(.*)$")]
    private static partial Regex MaVaTen();

    /// <summary>Chạy các trường hợp được chọn; diaChi là địa chỉ máy chủ mà trình duyệt kiểm thử sẽ mở.</summary>
    public void chay(IReadOnlyCollection<string> cacId, int chamMs, bool hienTrinhDuyet, string diaChi)
    {
        if (cacId.Count == 0) throw LoiNghiepVu.khongHopLe("cacCa", "Chưa chọn trường hợp kiểm thử nào.");
        if (chamMs < 0 || chamMs > CHAM_TOI_DA_MS)
            throw LoiNghiepVu.khongHopLe("chamMs", $"Tốc độ phải từ 0 đến {CHAM_TOI_DA_MS} mili giây.");
        // chỉ nhận đúng mã có trong danh sách, không để giá trị lạ lọt vào dòng lệnh
        var hopLe = layDanhSach().Select(ca => ca.Id).ToHashSet();
        if (cacId.Any(id => !hopLe.Contains(id)))
            throw LoiNghiepVu.khongHopLe("cacCa", "Có trường hợp kiểm thử không tồn tại. Tải lại trang để lấy danh sách mới.");

        lock (khoa)
        {
            if (tienTrinh is { HasExited: false })
                throw LoiNghiepVu.viPham(MaLoi.DANG_DUOC_SU_DUNG, "Đang có một lần chạy kiểm thử. Chờ chạy xong hoặc bấm Dừng.");

            var thamSo = new List<string> { "playwright", "test" };
            thamSo.AddRange(cacId.Distinct());
            thamSo.Add("--reporter=./bao_cao_trang_kiem_thu.ts");
            if (hienTrinhDuyet) thamSo.Add("--headed");
            ProcessStartInfo thongTin = taoLenh(thamSo);
            thongTin.Environment["CHAM_MS"] = chamMs.ToString();
            thongTin.Environment["DIA_CHI"] = diaChi;
            // các ca làm đổi dữ liệu mở bảng trong CSDL ra cho xem sau khi làm xong (kiem_thu_e2e/tien_ich/trinh_dien.ts)
            thongTin.Environment["XEM_CSDL"] = "1";

            ketQua = cacId.Distinct().ToDictionary(id => id, _ => new KetQuaCa("cho"));
            nhatKy.Clear();
            batDau = DateTime.Now;
            ketThuc = null;
            daDung = false;

            var moi = new Process { StartInfo = thongTin, EnableRaisingEvents = true };
            moi.OutputDataReceived += (_, e) => xuLyDong(e.Data);
            moi.ErrorDataReceived += (_, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) themNhatKy(e.Data); };
            moi.Exited += (_, _) => ketThucChay(moi);
            themNhatKy($"Bắt đầu chạy {ketQua.Count} trường hợp, chậm {chamMs} ms mỗi thao tác.");
            moi.Start();
            moi.BeginOutputReadLine();
            moi.BeginErrorReadLine();
            tienTrinh = moi;
        }
    }

    public void dung()
    {
        lock (khoa)
        {
            if (tienTrinh is not { HasExited: false }) return;
            daDung = true;
            themNhatKy("Đang dừng...");
            if (OperatingSystem.IsWindows())
            {
                // Kill(entireProcessTree) bỏ sót node và Chrome do cmd/npx sinh ra; taskkill /T diệt cả cây
                using Process diet = Process.Start(new ProcessStartInfo("taskkill", $"/PID {tienTrinh.Id} /T /F")
                    { UseShellExecute = false, CreateNoWindow = true })!;
                diet.WaitForExit(10_000);
            }
            else
            {
                tienTrinh.Kill(entireProcessTree: true);
            }
        }
    }

    public TrangThaiChay layTrangThai()
    {
        lock (khoa)
        {
            return new TrangThaiChay(tienTrinh is { HasExited: false }, batDau, ketThuc,
                new Dictionary<string, KetQuaCa>(ketQua), new List<string>(nhatKy));
        }
    }

    private void xuLyDong(string? dong)
    {
        if (string.IsNullOrWhiteSpace(dong)) return;
        if (!dong.StartsWith(DAU_DONG))
        {
            themNhatKy(dong);
            return;
        }
        using JsonDocument json = JsonDocument.Parse(dong[DAU_DONG.Length..]);
        JsonElement goc = json.RootElement;
        string su = goc.GetProperty("su").GetString() ?? "";
        lock (khoa)
        {
            if (su == "loi")
            {
                themNhatKy("Lỗi: " + goc.GetProperty("loi").GetString());
                return;
            }
            string id = goc.GetProperty("ma").GetString() ?? "";
            string ten = danhSach?.FirstOrDefault(x => x.Id == id) is { } ca ? $"{ca.Ma} {ca.Ten}" : id;
            if (su == "batDau")
            {
                ketQua[id] = new KetQuaCa("dangChay");
                themNhatKy($"… {ten}");
                return;
            }
            if (su == "buoc")
            {
                string tieuDe = goc.GetProperty("tieuDe").GetString() ?? "";
                int soBuoc = (ketQua.TryGetValue(id, out KetQuaCa? cu) ? cu.SoBuoc : 0) + 1;
                ketQua[id] = new KetQuaCa("dangChay", Buoc: tieuDe, SoBuoc: soBuoc);
                themNhatKy($"    {soBuoc}. {tieuDe}");
                return;
            }
            string trangThai = goc.GetProperty("trangThai").GetString() switch
            {
                "passed" => "dat",
                "failed" or "timedOut" => "truot",
                "interrupted" => "dung",
                _ => "boQua"
            };
            long thoiGian = goc.GetProperty("thoiGianMs").GetInt64();
            string? loi = goc.GetProperty("loi").GetString();
            ketQua[id] = new KetQuaCa(trangThai, thoiGian, loi);
            themNhatKy($"{(trangThai == "dat" ? "✓" : trangThai == "truot" ? "✘" : "–")} {ten} ({thoiGian / 1000.0:0.0}s)");
            if (loi != null) themNhatKy("    " + loi);
        }
    }

    private void ketThucChay(Process daXong)
    {
        // chờ đọc hết dòng còn trong bộ đệm trước khi chốt kết quả
        daXong.WaitForExit();
        lock (khoa)
        {
            ketThuc = DateTime.Now;
            foreach (string id in ketQua.Where(muc => muc.Value.TrangThai is "cho" or "dangChay").Select(muc => muc.Key).ToList())
                ketQua[id] = new KetQuaCa(daDung ? "dung" : "boQua");
            int dat = ketQua.Values.Count(kq => kq.TrangThai == "dat");
            int truot = ketQua.Values.Count(kq => kq.TrangThai == "truot");
            themNhatKy(daDung ? $"Đã dừng: {dat} đạt, {truot} trượt." : $"Chạy xong: {dat} đạt, {truot} trượt, mã thoát {daXong.ExitCode}.");
        }
    }

    private void themNhatKy(string dong)
    {
        lock (khoa)
        {
            nhatKy.Add(dong);
            if (nhatKy.Count > SO_DONG_NHAT_KY) nhatKy.RemoveRange(0, nhatKy.Count - SO_DONG_NHAT_KY);
        }
    }

    private ProcessStartInfo taoLenh(IEnumerable<string> thamSo)
    {
        // npx trên Windows là tập tin .cmd nên phải chạy qua cmd.exe
        bool laWindows = OperatingSystem.IsWindows();
        var thongTin = new ProcessStartInfo(laWindows ? "cmd.exe" : "npx")
        {
            WorkingDirectory = thuMucWeb,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (laWindows)
        {
            thongTin.ArgumentList.Add("/c");
            thongTin.ArgumentList.Add("npx");
        }
        foreach (string muc in thamSo) thongTin.ArgumentList.Add(muc);
        thongTin.Environment["NO_COLOR"] = "1";
        thongTin.Environment.Remove("FORCE_COLOR");
        return thongTin;
    }
}
