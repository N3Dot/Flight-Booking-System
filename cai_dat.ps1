# Cai dat va chay phan mem Quan ly ban ve chuyen bay bang mot lenh (Windows 10 tro len).
# Chay trong PowerShell, dung o thu muc goc cua ma nguon:
#   .\cai_dat.cmd                          tao CSDL (neu chua co), nap du lieu mau (neu CSDL rong), dung giao dien, chay may chu
#   .\cai_dat.cmd -NapLaiDuLieu            xoa CSDL hien co roi tao lai va nap lai du lieu mau
#   .\cai_dat.cmd -MayChuSql "localhost"   SQL Server khong dung ten phien ban SQLEXPRESS
#   .\cai_dat.cmd -KhongChay               chi cai dat, khong chay may chu
# Thong bao viet khong dau de hien dung tren moi bang ma cua cua so lenh.
param(
    [string]$MayChuSql = "localhost\SQLEXPRESS",
    [switch]$NapLaiDuLieu,
    [switch]$KhongChay
)

$ErrorActionPreference = "Stop"
$goc = $PSScriptRoot
$tenCsdl = "QLBANVECHUYENBAY"
$diaChi = "http://localhost:5080"

function Buoc($so, $noiDung) {
    Write-Host ""
    Write-Host "[$so/4] $noiDung" -ForegroundColor Cyan
}

function Dung($thongBao) {
    Write-Host ""
    Write-Host "LOI: $thongBao" -ForegroundColor Red
    exit 1
}

function KiemTraLenh($ten, $huongDan) {
    if (-not (Get-Command $ten -ErrorAction SilentlyContinue)) {
        Dung "Chua co lenh '$ten'. $huongDan"
    }
}

# Goi mot lenh ngoai (sqlcmd, npm, dotnet). Trong luc goi, dong canh bao lenh ghi ra stderr
# khong bi PowerShell coi la loi dung script; ket qua xet theo ma thoat $LASTEXITCODE.
function GoiLenh([string]$ten, [string[]]$thamSo) {
    $cu = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $ten @thamSo 2>&1 | ForEach-Object { "$_" }
    } finally {
        $ErrorActionPreference = $cu
    }
}

# Chay sqlcmd bang tai khoan Windows dang dang nhap; tra ve cac dong ket qua.
function ChaySql([string[]]$thamSo) {
    $ketQua = GoiLenh "sqlcmd" (@("-S", $MayChuSql, "-E", "-C", "-b") + $thamSo)
    if ($LASTEXITCODE -ne 0) {
        $ketQua | ForEach-Object { Write-Host $_ }
        Dung "sqlcmd bao loi (ma $LASTEXITCODE)."
    }
    return $ketQua
}

Write-Host "Quan ly ban ve chuyen bay: cai dat va chay" -ForegroundColor Green

# ---- kiem tra phan mem can co
KiemTraLenh "sqlcmd" "Cai SQL Server 2022 Express (kieu Basic) va goi sqlcmd cua Microsoft."
KiemTraLenh "dotnet" "Cai .NET SDK 10."
KiemTraLenh "node" "Cai Node.js 22 (kem npm)."
KiemTraLenh "npm" "Cai Node.js 22 (kem npm)."

# dotnet --version chi bao SDK moi nhat; may chu net10.0 can bo SDK 10 (kem runtime 10), cai them ban moi hon van duoc
$sdkDotnet = @(GoiLenh 'dotnet' @('--list-sdks'))
if (-not ($sdkDotnet -match '^10\.')) { Dung "Can .NET SDK 10 (co the cai song song ban moi hon). May dang co: $($sdkDotnet -join '; ')" }
$banNode = "$(GoiLenh 'node' @('--version') | Select-Object -Last 1)".Trim()
if ($banNode -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { Dung "Can Node.js 22 tro len, may dang co ban $banNode." }

# may cai SQL Server o phien ban mac dinh (MSSQLSERVER) khong co SQLEXPRESS: tu thu localhost khi nguoi dung khong chi dinh -MayChuSql
if (-not $PSBoundParameters.ContainsKey('MayChuSql')) {
    GoiLenh "sqlcmd" @("-S", $MayChuSql, "-E", "-C", "-b", "-l", "3", "-Q", "SELECT 1") | Out-Null
    if ($LASTEXITCODE -ne 0) {
        GoiLenh "sqlcmd" @("-S", "localhost", "-E", "-C", "-b", "-l", "3", "-Q", "SELECT 1") | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $MayChuSql = "localhost"
            Write-Host "Khong ket noi duoc localhost\SQLEXPRESS, dung SQL Server tai 'localhost' (phien ban mac dinh)." -ForegroundColor Yellow
        }
    }
}

GoiLenh "sqlcmd" @("-S", $MayChuSql, "-E", "-C", "-b", "-l", "15", "-Q", "SELECT 1") | Out-Null
if ($LASTEXITCODE -ne 0) {
    Dung "Khong ket noi duoc SQL Server '$MayChuSql' bang tai khoan Windows hien tai. Kiem tra dich vu SQL Server dang chay; neu ten phien ban khac thi them tham so -MayChuSql."
}

# ---- 1 va 2: co so du lieu
# so dong cua 6 bang nghiep vu; -1 khi chua co CSDL hoac thieu bang (01 chay do dang). TAIKHOAN la bang tao sau cung trong 01.
$bang = "SANBAY", "HANGVE", "CHUYENBAY", "HANHKHACH", "VE", "PHIEUDATCHO" | ForEach-Object { "(SELECT COUNT(*) FROM $tenCsdl.dbo.$_)" }
$soDong = (ChaySql @("-h", "-1", "-W", "-Q", "SET NOCOUNT ON; IF OBJECT_ID(N'$tenCsdl.dbo.TAIKHOAN') IS NULL SELECT -1 ELSE EXEC (N'SELECT $($bang -join ' + ')')") |
    Where-Object { $_ -match '^\s*-?\d+\s*$' } | Select-Object -First 1)
$soDong = [int]("$soDong".Trim())

if ($soDong -lt 0 -or $NapLaiDuLieu) {
    Buoc 1 "Tao co so du lieu $tenCsdl"
    ChaySql @("-i", (Join-Path $goc "db\01_tao_csdl.sql")) | Out-Null
    Buoc 2 "Nap du lieu mau"
    ChaySql @("-i", (Join-Path $goc "db\02_du_lieu_mau.sql")) | Out-Null
    Write-Host "Da tao $tenCsdl va nap du lieu mau."
} elseif ($soDong -eq 0) {
    # CSDL rong (vd lan nap truoc bi loi): chi nap du lieu mau, giu tai khoan; khong mat gi vi cac bang nghiep vu dang trong
    Buoc 1 "Co so du lieu $tenCsdl da co nhung rong, giu nguyen tai khoan"
    Buoc 2 "Nap du lieu mau"
    ChaySql @("-i", (Join-Path $goc "db\02_du_lieu_mau.sql")) | Out-Null
    Write-Host "Da nap du lieu mau vao $tenCsdl."
} else {
    Buoc 1 "Co so du lieu $tenCsdl da co, giu nguyen"
    Buoc 2 "Bo qua nap du lieu mau (them -NapLaiDuLieu neu muon xoa va nap lai)"
}

# ---- chuoi ket noi: SQL Server khong phai localhost\SQLEXPRESS thi ghi vao appsettings.Development.json
# (tap tin rieng cua may, khong dua len git) de cac lan chay sau, ke ca "dotnet run", van dung dung may chu SQL.
# Chuoi ket noi tu dat trong tap tin do (vd dung tai khoan SQL) duoc giu nguyen.
$tepRieng = Join-Path $goc "api\QuanLyBanVe.Api\appsettings.Development.json"
$chuoiMoi = "Server=$MayChuSql;Database=$tenCsdl;Trusted_Connection=True;TrustServerCertificate=True"
$cauHinh = if (Test-Path $tepRieng) { Get-Content $tepRieng -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
if (-not $cauHinh) { $cauHinh = [pscustomobject]@{} }
$chuoiCu = if ($cauHinh.ConnectionStrings) { $cauHinh.ConnectionStrings.QLBANVE } else { $null }
if ($chuoiCu -and $chuoiCu -notmatch 'Trusted_Connection') {
    Write-Host "Giu nguyen chuoi ket noi rieng trong appsettings.Development.json."
} elseif ($chuoiCu -ne $chuoiMoi -and ($chuoiCu -or $MayChuSql -ne "localhost\SQLEXPRESS")) {
    if (-not $cauHinh.ConnectionStrings) { $cauHinh | Add-Member -NotePropertyName ConnectionStrings -NotePropertyValue ([pscustomobject]@{}) }
    $cauHinh.ConnectionStrings | Add-Member -NotePropertyName QLBANVE -NotePropertyValue $chuoiMoi -Force
    [IO.File]::WriteAllText($tepRieng, ($cauHinh | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
    Write-Host "Da ghi chuoi ket noi toi '$MayChuSql' vao appsettings.Development.json."
}

# ---- 3: dung giao dien, chep vao wwwroot cua may chu
Buoc 3 "Dung giao dien"
Push-Location (Join-Path $goc "web")
try {
    # cai lai khi chua co node_modules hoac package-lock.json moi hon lan npm ci truoc (vd sau git pull)
    $daCai = "node_modules\.package-lock.json"
    if (-not (Test-Path $daCai) -or (Get-Item "package-lock.json").LastWriteTime -gt (Get-Item $daCai).LastWriteTime) {
        GoiLenh "npm" @("ci")
        if ($LASTEXITCODE -ne 0) { Dung "npm ci bao loi." }
    }
    GoiLenh "npm" @("run", "dung-may-chu")
    if ($LASTEXITCODE -ne 0) { Dung "Dung giao dien bao loi." }
} finally {
    Pop-Location
}

if ($KhongChay) {
    Write-Host ""
    Write-Host "Da cai dat xong. Chay may chu: cd api\QuanLyBanVe.Api roi dotnet run -c Release" -ForegroundColor Green
    exit 0
}

# ---- 4: chay may chu
Buoc 4 "Chay may chu tai $diaChi (Ctrl+C de dung)"
Write-Host "Tai khoan mac dinh: quanly / Quanly@123 (Quan ly), nhanvien / Nhanvien@123 (Nhan vien ban ve)."
Write-Host "Trinh duyet se tu mo khi may chu san sang."

# mo trinh duyet khi may chu da tra loi; neu khong mo duoc thi nguoi dung tu mo dia chi tren
$moTrinhDuyet = Start-Job -ArgumentList $diaChi -ScriptBlock {
    param($diaChi)
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        try {
            Invoke-WebRequest -Uri $diaChi -UseBasicParsing -TimeoutSec 3 | Out-Null
            Start-Process $diaChi
            return
        } catch { }
    }
}

Push-Location (Join-Path $goc "api\QuanLyBanVe.Api")
try {
    GoiLenh "dotnet" @("run", "-c", "Release")
} finally {
    Pop-Location
    Remove-Job $moTrinhDuyet -Force -ErrorAction SilentlyContinue
}
