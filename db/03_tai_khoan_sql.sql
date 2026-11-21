-- Tùy chọn: tạo tài khoản SQL Server riêng cho phần mềm, chỉ có quyền đọc và ghi dữ liệu trên QLBANVECHUYENBAY
-- (không tạo, sửa, xóa được bảng và không đụng được cơ sở dữ liệu khác). Dùng khi không muốn máy chủ web
-- chạy bằng quyền Windows của người cài đặt. SQL Server phải bật chế độ xác thực "SQL Server and Windows".
-- Chạy bằng tài khoản quản trị SQL Server, mật khẩu tự đặt và truyền qua tham số, không ghi vào tập tin:
--   sqlcmd -S localhost\SQLEXPRESS -E -C -b -v TenDangNhap="qlbv_web" MatKhau="<mật khẩu mạnh>" -i db\03_tai_khoan_sql.sql
-- Sau đó đặt chuỗi kết nối trong api/QuanLyBanVe.Api/appsettings.Development.json (tập tin không đưa lên git):
--   "ConnectionStrings": { "QLBANVE": "Server=localhost\\SQLEXPRESS;Database=QLBANVECHUYENBAY;User Id=qlbv_web;Password=<mật khẩu>;TrustServerCertificate=True" }
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(TenDangNhap)')
    CREATE LOGIN [$(TenDangNhap)] WITH PASSWORD = N'$(MatKhau)', CHECK_POLICY = ON, DEFAULT_DATABASE = QLBANVECHUYENBAY;
GO
USE QLBANVECHUYENBAY;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(TenDangNhap)')
    CREATE USER [$(TenDangNhap)] FOR LOGIN [$(TenDangNhap)];
GO
ALTER ROLE db_datareader ADD MEMBER [$(TenDangNhap)];
ALTER ROLE db_datawriter ADD MEMBER [$(TenDangNhap)];
-- lấy số kế tiếp của mã hành khách, mã vé, mã phiếu đặt chỗ
GRANT UPDATE ON OBJECT::dbo.SEQ_HANHKHACH TO [$(TenDangNhap)];
GRANT UPDATE ON OBJECT::dbo.SEQ_VE TO [$(TenDangNhap)];
GRANT UPDATE ON OBJECT::dbo.SEQ_PHIEUDATCHO TO [$(TenDangNhap)];
GO
