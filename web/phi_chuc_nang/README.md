# Đo yêu cầu hiệu quả HQ01–HQ07

Bộ script tái lập các phép đo trong Bảng 5.19–5.22 của báo cáo mục 5.3 trên SQL Server Express và bản ứng dụng HQ tại `http://localhost:5095`. Bản ứng dụng và toàn bộ bằng chứng nằm trong `ket_qua/`, thư mục được Git bỏ qua.

## Chuẩn bị

- Dùng Windows PowerShell 5.1 với .NET Framework 4.8. Tài khoản Windows cần quyền tạo và xóa riêng CSDL `QLBANVE_HQ` trên `localhost\SQLEXPRESS`. Kiểm tra `sqlcmd` với `-E -C`.
- Chuẩn bị .NET SDK 10, Node.js, npm và Chromium của Playwright. Thêm thư mục chứa `dotnet.exe`, `node.exe` và `sqlcmd.exe` vào PATH nếu terminal chưa nhận lệnh. Ví dụ `D:\Programs\dotnet`, `D:\Programs\nodejs` và thư mục `Tools\Binn` chứa `sqlcmd.exe` dưới `D:\Programs\SQLServer` tùy bản đã cài.
- Nếu thiếu gói JavaScript, chạy `npm.cmd ci` từ `web`. Nếu thiếu Chromium, đặt `$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Programs\PlaywrightBrowsers'` rồi chạy `npx.cmd playwright install chromium` từ `web`. Giữ biến này trong phiên chạy phép đo nếu đã dùng để cài. Chromium không cần PATH riêng. npm và NuGet có thể dùng bộ nhớ đệm trong hồ sơ người dùng theo cấu hình của máy.
- Dành khoảng **4 GB** cho dữ liệu và nhật ký giao dịch SQL Server, cộng dung lượng cho TempDB, bản build và bằng chứng. Lần nạp chính thức từng mất khoảng 133 giây theo báo cáo. Dự trù vài phút để nạp, dựng và chạy phép đo. Thời gian thực tế tùy cấu hình, lượng xuất báo cáo và số lần khởi động lại.

## Thử ở quy mô nhỏ

Chạy từ thư mục gốc kho mã. Nếu Windows PowerShell đang dùng chính sách mặc định `Restricted`, có thể đặt `Set-ExecutionPolicy -Scope Process RemoteSigned` cho riêng phiên này nếu chính sách tổ chức cho phép.

```powershell
Set-Location web/phi_chuc_nang
.\01_tao_csdl_hq.ps1 -HeSo 0.01
.\03_chay_may_chu_hq.ps1
try {
    .\04_do_api.ps1 -SoLan 2
    .\06_dong_thoi.ps1
    $env:HQ_SO_LAN = '1'
    & node ../node_modules/@playwright/test/cli.js test --config playwright.hq.config.ts
    if ($LASTEXITCODE -ne 0) { throw 'Phép đo giao diện thất bại.' }
} finally {
    Remove-Item Env:HQ_SO_LAN -ErrorAction SilentlyContinue
    .\03_chay_may_chu_hq.ps1 -Dung
}
```

Hệ số 0,01 nạp 200 chuyến bay, 100 dòng trung gian, 400 dòng số ghế, 6.000 hành khách, 20.000 vé và 20.000 phiếu. Trong số đó có 10 phiếu quá hạn. Bước 01 thay thế CSDL `QLBANVE_HQ` cũ khi cổng 5095 trống. Bước 03 theo dõi đúng tiến trình HQ do nó khởi chạy để dùng với `-Dung`.

## Đo chính thức

1. Chạy `.\01_tao_csdl_hq.ps1 -HeSo 1` và lưu đầu ra làm bằng chứng Bảng 5.19. SQL đối chiếu khóa ngoại, CHECK, giá, số ghế, vé chuyển từ phiếu, số vé đã bán và số phiếu chờ/quá hạn trước khi hoàn tất giao dịch nạp. Mọi cột `SoDongSai` phải bằng 0.
2. Chạy `.\03_chay_may_chu_hq.ps1`. Máy chủ tự kiểm tra phiếu hết hạn ngay lúc khởi động. Chạy các bước sau tuần tự trên dữ liệu mới nạp.
3. Chạy `.\07_do_hq04.ps1 -SoLan 10` để đo cách 2 của Bảng 5.21. Script dừng bản HQ trước khi đưa đúng 1.000 phiếu gốc về Chờ thanh toán, rồi khởi động bằng bản đã dựng. Sau lượt cuối, bản HQ chạy tiếp cho các phép đo còn lại. Nên thực hiện trong ngày nạp để các phiếu chờ khác chưa quá hạn.
4. Chạy `.\04_do_api.ps1 -SoLan 10`. Số lần áp dụng cho từng phép đo, kể cả mỗi định dạng xuất. Các kỳ lấy theo giờ Việt Nam: báo cáo tháng 6, báo cáo cả năm hiện tại, tra cứu một tháng là tháng hiện tại và theo tuyến SGN–HAN là cả năm hiện tại.
5. Đặt `$env:HQ_SO_LAN = '10'` rồi chạy lệnh Playwright như trên. Các phép xác nhận bán/đặt nằm trong khoảng đo. Với xuất báo cáo, phép đo kết thúc khi có tải xuống và thông báo trên màn hình. Tệp tải xuống được giữ làm bằng chứng.
6. Chạy `.\06_dong_thoi.ps1`, sau đó dừng HQ bằng `.\03_chay_may_chu_hq.ps1 -Dung`.

HQ02 và HQ03 dùng chuyến `HQBAN100`. Chuyến này ở quy mô chuẩn bắt đầu với 100 vé và 100 phiếu lịch sử. Các lượt đo ghi thêm vé và phiếu. Nạp lại trước một đợt đo mới để giữ cùng điều kiện ban đầu; thực hiện tối đa 90 lượt bán cộng đặt trên chuyến này sau mỗi lần nạp. Phiếu quá hạn tại bước 01 được nhân hệ số, còn bước 07 yêu cầu đúng 1.000 phiếu nên chỉ chạy ở quy mô 1.

## Đọc kết quả

| Tệp trong `ket_qua/` | Nội dung |
| --- | --- |
| `api_*.csv` | Từng yêu cầu với thời gian tính bằng ms, HTTP, số byte và số dòng trả về cho HQ05. Console in nhỏ nhất, trung vị và lớn nhất từng phép đo. |
| `giao_dien_*.csv` | Từng lượt từ trước lần bấm đến lúc kết quả hiện. Nhóm theo `PhepDo` để tính nhỏ nhất, trung vị và lớn nhất. |
| `*.xlsx`, `*.pdf` | Tệp báo cáo thực tế tải về từ API và giao diện. |
| `dong_thoi_*.txt` | Giờ gửi, kết quả từng yêu cầu và mã vé/phiếu đối chiếu SQL. Mỗi lượt phải có đúng 5 HTTP 201, 15 HTTP 409 `HET_CHO` và 5 ghế đã bán/đặt. |
| `hq04_*.csv`, `may_chu_*.log`, `nhat_ky_*/` | Mỗi lượt hủy đúng 1.000 phiếu. Mili giây tính từ dòng `Application started.` tới dòng báo hủy trong cùng lần khởi động. |

So giá trị lớn nhất với ngưỡng 5 giây của HQ01–HQ03 và HQ07, 10 giây của HQ04 và HQ05, 15 giây của HQ06. Nếu mã hiện tại giới hạn số dòng tra cứu, đọc cột `SoKetQua` và thông báo trên UI khi so với số liệu Bảng 5.20.

## Xóa CSDL HQ

Sau khi dừng HQ, chạy lệnh sau. Tên CSDL được kiểm ngay trong SQL trước khi yêu cầu xóa và lệnh xóa dùng tên cố định.

```powershell
$sql = @'
DECLARE @Ten sysname = N'QLBANVE_HQ';
IF @Ten COLLATE Latin1_General_BIN2 <> N'QLBANVE_HQ' THROW 50000, 'Sai ten CSDL', 1;
IF DB_ID(@Ten) IS NOT NULL
BEGIN
    IF DB_NAME(DB_ID(@Ten)) COLLATE Latin1_General_BIN2 <> N'QLBANVE_HQ' THROW 50000, 'Sai ten CSDL', 1;
    ALTER DATABASE [QLBANVE_HQ] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [QLBANVE_HQ];
END;
'@
sqlcmd -S 'localhost\SQLEXPRESS' -E -C -b -d master -Q $sql
```

## Số liệu của lần đo chính thức

Thư mục `so_lieu_22_11/` giữ số liệu thô của lần đo ngày 22/11/2026 trên Windows 11 (CSV từng lần đo, kết quả HQ04, kiểm tra đồng thời, nhật ký nạp dữ liệu và một tập tin Excel, PDF mẫu). Báo cáo mục 5.2.2, 5.2.3 dẫn các số trong thư mục này.
