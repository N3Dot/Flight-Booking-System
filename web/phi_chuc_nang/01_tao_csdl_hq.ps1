#requires -Version 5.1
param([ValidateRange(0.01, 1.0)][double]$HeSo = 1)
. "$PSScriptRoot/chung.ps1"
Kiem-CongHQTrong
$goc = Join-Path $PSScriptRoot '../../db'
$schema = [IO.File]::ReadAllText((Join-Path $goc '01_tao_csdl.sql')).Replace('QLBANVECHUYENBAY', 'QLBANVE_HQ')
$khoiXoa = '(?s)IF DB_ID\(N''QLBANVE_HQ''\) IS NOT NULL\s+BEGIN\s+ALTER DATABASE QLBANVE_HQ SET SINGLE_USER WITH ROLLBACK IMMEDIATE;\s+DROP DATABASE QLBANVE_HQ;\s+END'
if ([regex]::Matches($schema, $khoiXoa).Count -ne 1) { throw 'Khối tạo lại CSDL đã thay đổi.' }
$schema = [regex]::Replace($schema, $khoiXoa, @'
DECLARE @Ten sysname = N'QLBANVE_HQ';
IF @Ten COLLATE Latin1_General_BIN2 <> N'QLBANVE_HQ' THROW 50000, 'Sai ten CSDL', 1;
IF DB_ID(@Ten) IS NOT NULL
BEGIN
    IF DB_NAME(DB_ID(@Ten)) COLLATE Latin1_General_BIN2 <> N'QLBANVE_HQ' THROW 50000, 'Sai ten CSDL', 1;
    ALTER DATABASE [QLBANVE_HQ] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [QLBANVE_HQ];
END
'@)
$mau = [IO.File]::ReadAllText((Join-Path $goc '02_du_lieu_mau.sql'))
$danhMuc = [regex]::Match($mau, '(?s)UPDATE THAMSOQUYDINH\b.*?INSERT INTO HANGVE\b.*?;')
if (-not $danhMuc.Success) { throw 'Không tìm thấy danh mục SQL mẫu.' }
$dongHo = [Diagnostics.Stopwatch]::StartNew()
Chay-SqlHQ -Database master -Sql $schema
Chay-SqlHQ -Sql $danhMuc.Value
$cauHinh = Join-Path $PSScriptRoot '../../api/QuanLyBanVe.Api/appsettings.json'
$taiKhoan = ([IO.File]::ReadAllText($cauHinh) | ConvertFrom-Json).TaiKhoanBanDau
$giaTri = foreach ($tk in $taiKhoan) {
    if ($tk.TenDangNhap -cnotmatch '^[a-z0-9]{1,30}$') { throw 'Tên tài khoản mẫu không hợp lệ.' }
    $nhom = switch -CaseSensitive ($tk.NhomQuyen) {
        'QuanLy' { 'Quản lý' }
        'NhanVien' { 'Nhân viên bán vé' }
        default { throw 'Nhóm quyền mẫu không hợp lệ.' }
    }
    # Cùng định dạng và số vòng với TienIch_BaoMat của API.
    $pbkdf = [Security.Cryptography.Rfc2898DeriveBytes]::new(
        $tk.MatKhau,16,600000,[Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        $bam = 'PBKDF2-SHA256${0}${1}${2}' -f 600000,[Convert]::ToBase64String($pbkdf.Salt),[Convert]::ToBase64String($pbkdf.GetBytes(32))
    } finally { $pbkdf.Dispose() }
    $tt = if ($tk.DaKhoa) { 'Đã khóa' } else { 'Hoạt động' }
    "('$($tk.TenDangNhap)','$bam',N'$nhom',N'$tt')"
}
if (-not $giaTri) { throw 'Thiếu tài khoản mẫu.' }
Chay-SqlHQ -Sql ('INSERT INTO TAIKHOAN (TenDangNhap,MatKhau,NhomQuyen,TrangThai) VALUES ' + ($giaTri -join ',') + ';')
$heSoSql = $HeSo.ToString('G17', [Globalization.CultureInfo]::InvariantCulture)
Chay-SqlHQ -File (Join-Path $PSScriptRoot '02_nap_du_lieu_lon.sql') -Bien "HeSo=$heSoSql"
Write-Host ('Tổng thời gian tạo và nạp: {0:N2} giây' -f $dongHo.Elapsed.TotalSeconds)
Chay-SqlHQ -Sql "SELECT type_desc, SUM(size) / 128.0 AS DungLuongMB FROM sys.database_files GROUP BY type_desc;"
