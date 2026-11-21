#requires -Version 5.1
param([switch]$Dung,[switch]$DungLaiBanDaBuild)
. "$PSScriptRoot/chung.ps1"
if ($Dung) { Dung-MayChuHQ; return }
if (Lay-TienTrinhHQ) { throw 'Bản HQ đang chạy. Dùng -Dung để dừng.' }
Kiem-CongHQTrong
Chay-SqlHQ -Sql 'SELECT DB_NAME() AS CoSoDuLieu;'
$api = (Resolve-Path (Join-Path $PSScriptRoot '../../api/QuanLyBanVe.Api')).Path
$ban = (New-Item -ItemType Directory -Force -Path (Join-Path $KetQuaHQ 'may_chu')).FullName
$dll = Join-Path $ban 'QuanLyBanVe.Api.dll'
$www = Join-Path $ban 'wwwroot'
if (-not $DungLaiBanDaBuild) {
    & dotnet build (Join-Path $api 'QuanLyBanVe.Api.csproj') --output $ban
    if ($LASTEXITCODE -ne 0) { throw 'Build API thất bại.' }
    Push-Location (Join-Path $PSScriptRoot '..')
    try {
        & npm.cmd run build -- --outDir $www --emptyOutDir
        if ($LASTEXITCODE -ne 0) { throw 'Build giao diện thất bại.' }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $dll) -or -not (Test-Path -LiteralPath (Join-Path $www 'index.html'))) {
    throw 'Thiếu bản build dành cho HQ.'
}
$token = [guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText((Join-Path $www 'hq-instance.txt'),$token)
$moc = DauGio-HQ
$stdout = Join-Path $KetQuaHQ "may_chu_${moc}.log"
$stderr = Join-Path $KetQuaHQ "may_chu_${moc}.err.log"
$cauHinh = @{
    ConnectionStrings__QLBANVE='Server=localhost\SQLEXPRESS;Database=QLBANVE_HQ;Trusted_Connection=True;TrustServerCertificate=True'
    Urls=$DiaChiHQ; PreferHostingUrls='true'; ASPNETCORE_ENVIRONMENT='Production'; DOTNET_ENVIRONMENT='Production'
    ASPNETCORE_CONTENTROOT=$ban; ASPNETCORE_WEBROOT=$www
    BoDinhThoi__Bat='true'; KiemThu__Bat='false'
    NhatKy__ThuMuc=(Join-Path $KetQuaHQ "nhat_ky_$moc")
    Logging__Console__FormatterName='simple'
    Logging__Console__FormatterOptions__SingleLine='true'
    Logging__Console__FormatterOptions__TimestampFormat='yyyy-MM-dd HH:mm:ss.fff '
    'Logging__LogLevel__Microsoft.Hosting.Lifetime'='Information'
    'Logging__LogLevel__QuanLyBanVe.Api.TienIch.BoDinhThoi'='Information'
}
$envCu = @{}
try {
    foreach ($key in $cauHinh.Keys) {
        $envCu[$key] = [Environment]::GetEnvironmentVariable($key)
        [Environment]::SetEnvironmentVariable($key,$cauHinh[$key])
    }
    $p = Start-Process -FilePath (Get-Command dotnet -CommandType Application).Source -ArgumentList ('"{0}"' -f $dll) `
        -WorkingDirectory $ban -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
} finally {
    foreach ($key in $envCu.Keys) { [Environment]::SetEnvironmentVariable($key,$envCu[$key]) }
}
try {
    @{pid=$p.Id;started=$p.StartTime.ToUniversalTime().Ticks.ToString();token=$token;stdout=$stdout;stderr=$stderr} |
        ConvertTo-Json | Set-Content -LiteralPath $TrangThaiHQ -Encoding UTF8
    $den = [datetime]::UtcNow.AddSeconds(40)
    do {
        if ($p.HasExited) { throw "Tiến trình HQ đã thoát. Xem $stdout và $stderr." }
        try {
            Kiem-MayChuHQ $DiaChiHQ
            $null = DangNhap-HQ
            Write-Host "HQ chạy ở $DiaChiHQ (PID $($p.Id)). Nhật ký $stdout"
            return
        } catch { $loi = $_; Start-Sleep -Milliseconds 300 }
    } while ([datetime]::UtcNow -lt $den)
    throw "Máy chủ HQ chưa sẵn sàng. $loi. Xem $stdout và $stderr."
} catch {
    Dung-MayChuHQ
    if (-not $p.HasExited) { Stop-Process -InputObject $p }
    throw
}
