$ErrorActionPreference = 'Stop'
$KetQuaHQ = (New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'ket_qua')).FullName
$TrangThaiHQ = Join-Path $KetQuaHQ 'may-chu.json'
$DiaChiHQ = 'http://localhost:5095'
$DongHQ = @()

function Chay-SqlHQ {
    param([ValidateSet('master','QLBANVE_HQ')][string]$Database='QLBANVE_HQ',
          [string]$Sql, [string]$File, [string[]]$Bien, [switch]$Gon)
    $cli = @('-S','localhost\SQLEXPRESS','-E','-C','-l','5','-b','-r','1','-f','65001','-d',$Database)
    if ($Gon) { $cli += @('-h','-1','-W','-s','|') }
    if ($Bien) { $cli += '-v'; $cli += $Bien }
    $tam = $null
    try {
        if (-not $File) {
            if ($Database -eq 'QLBANVE_HQ') {
                $Sql = "IF DB_NAME() COLLATE Latin1_General_BIN2 <> N'QLBANVE_HQ' THROW 50000, 'Sai ten CSDL', 1;`nSET NOCOUNT ON;`n" + $Sql
            }
            $tam = Join-Path $KetQuaHQ ("sql_{0}.sql" -f [guid]::NewGuid())
            [IO.File]::WriteAllText($tam,$Sql,[Text.UTF8Encoding]::new($false))
            $File = $tam
        }
        & sqlcmd @cli -i $File
        if ($LASTEXITCODE -ne 0) { throw "sqlcmd thất bại trên $Database (mã $LASTEXITCODE)." }
    } finally { if ($tam) { Remove-Item -LiteralPath $tam } }
}
function Kiem-CongHQTrong {
    foreach ($ip in @([Net.IPAddress]::Loopback,[Net.IPAddress]::IPv6Loopback)) {
        if ($ip.AddressFamily -eq 'InterNetworkV6' -and -not [Net.Sockets.Socket]::OSSupportsIPv6) { continue }
        $listener = [Net.Sockets.TcpListener]::new($ip,5095)
        try { $listener.Start() } finally { $listener.Stop() }
    }
}
function Lay-TienTrinhHQ {
    if (-not (Test-Path -LiteralPath $TrangThaiHQ)) { return }
    $state = Get-Content -Raw -LiteralPath $TrangThaiHQ | ConvertFrom-Json
    $p = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'dotnet' -and $p.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.started) { $p }
}
function Dung-MayChuHQ {
    $p = Lay-TienTrinhHQ
    if ($p) { Stop-Process -InputObject $p; if (-not $p.WaitForExit(10000)) { throw 'Không dừng được bản HQ.' } }
    if (Test-Path -LiteralPath $TrangThaiHQ) { Remove-Item -LiteralPath $TrangThaiHQ }
}
function Goi-HQ {
    param([string]$Path, [string]$Method='GET', $Session, $Data, [int]$Status=200, [string]$BodyFile)
    $web = @{Uri="$DiaChiHQ$Path"; Method=$Method; UseBasicParsing=$true; MaximumRedirection=0; TimeoutSec=120
             Headers=@{'X-Requested-With'='XMLHttpRequest'}}
    if ($Session) { $web.WebSession = $Session }
    if ($BodyFile) { $web.Body = [IO.File]::ReadAllBytes($BodyFile) }
    elseif ($null -ne $Data) { $web.Body = [Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Depth 8 -Compress)) }
    if ($web.ContainsKey('Body')) { $web.ContentType = 'application/json; charset=utf-8' }
    $r = Invoke-WebRequest @web
    if ($r.StatusCode -ne $Status) { throw "HTTP $Method ${Path}: $($r.StatusCode), cần $Status." }
    $r
}
# Gọi API và trả về mã HTTP, mã lỗi kèm phản hồi, kể cả khi máy chủ trả 4xx/5xx.
function Thu-HQ {
    param([string]$Path, [string]$Method='GET', $Session, $Data, [string]$TepXlsx)
    $web = @{Uri="$DiaChiHQ$Path"; Method=$Method; UseBasicParsing=$true; MaximumRedirection=0; TimeoutSec=300
             Headers=@{'X-Requested-With'='XMLHttpRequest'}}
    if ($Session) { $web.WebSession = $Session }
    if ($TepXlsx) {
        $ranh = 'hq' + [guid]::NewGuid().ToString('N')
        $dau = "--$ranh`r`nContent-Disposition: form-data; name=`"tapTin`"; filename=`"$([IO.Path]::GetFileName($TepXlsx))`"`r`n" +
               "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`r`n`r`n"
        $ms = New-Object IO.MemoryStream
        foreach ($b in @([Text.Encoding]::UTF8.GetBytes($dau), [IO.File]::ReadAllBytes($TepXlsx),
                         [Text.Encoding]::UTF8.GetBytes("`r`n--$ranh--`r`n"))) { $ms.Write($b,0,$b.Length) }
        $web.Body = $ms.ToArray(); $web.ContentType = "multipart/form-data; boundary=$ranh"
    } elseif ($null -ne $Data) {
        $web.Body = [Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Depth 8 -Compress))
        $web.ContentType = 'application/json; charset=utf-8'
    }
    $r = $null; $than = $null
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest @web
        $http = [int]$r.StatusCode
        if ($r.Content -is [string]) { $than = $r.Content }
    } catch [Net.WebException] {
        $resp = $_.Exception.Response
        if (-not $resp) { throw }
        $http = [int]$resp.StatusCode
        $than = $_.ErrorDetails.Message
        if (-not $than) { $doc = New-Object IO.StreamReader($resp.GetResponseStream()); $than = $doc.ReadToEnd(); $doc.Dispose() }
    }
    $sw.Stop()
    $ma = $null
    if ($http -ge 400 -and $than) { try { $ma = ($than | ConvertFrom-Json).ma } catch { $ma = $null } }
    [pscustomobject]@{Http=$http; Ma=$ma; MiliGiay=[math]::Round($sw.Elapsed.TotalMilliseconds,1); PhanHoi=$r; Than=$than}
}
# Ghi, Luot, Sql-Dong dùng $script:LogHQ (tệp văn bản) và $script:CsvHQ (từng lượt gọi) do script gọi đặt trước.
function Ghi($NoiDung) { $NoiDung | Tee-Object -FilePath $script:LogHQ -Append | Out-Host }
function Sql-Dong([string]$Sql) { @(Chay-SqlHQ -Gon -Sql $Sql | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
# Một lượt gọi: ghi mã HTTP, mã lỗi và so với mong đợi; MaMong rỗng thì không xét mã lỗi.
function Luot {
    param([string]$Yc, [string]$MoTa, [string]$Path, [string]$Method='GET', $Session, $Data, [int]$Mong, [string]$MaMong, [string]$TepXlsx)
    $kq = Thu-HQ $Path $Method $Session $Data -TepXlsx $TepXlsx
    $dat = ($kq.Http -eq $Mong) -and (-not $MaMong -or $kq.Ma -ceq $MaMong)
    $row = [pscustomobject]@{STT=@($script:DongHQ).Count + 1; YeuCau=$Yc; MoTa=$MoTa; PhuongThuc=$Method; DuongDan=$Path
        Http=$kq.Http; MaLoi=$kq.Ma; MongDoi=("$Mong $MaMong").Trim(); Dat=$(if ($dat) {'Đạt'} else {'KHÔNG ĐẠT'}); MiliGiay=$kq.MiliGiay}
    $row | Export-Csv -LiteralPath $script:CsvHQ -Append -NoTypeInformation -Encoding UTF8
    $script:DongHQ = @($script:DongHQ) + $row
    Ghi ("{0,3} {1} {2} -> {3} {4} (mong {5}) {6} {7} ms" -f $row.STT,$Yc,$MoTa,$row.Http,$row.MaLoi,$row.MongDoi,$row.Dat,$row.MiliGiay)
    $kq
}
function TongKet-Luot {
    $khong = @($script:DongHQ | Where-Object Dat -ne 'Đạt')
    Ghi ("Tổng {0} lượt, {1} đạt, {2} không đạt" -f @($script:DongHQ).Count, (@($script:DongHQ).Count - $khong.Count), $khong.Count)
    $script:DongHQ | Group-Object YeuCau | ForEach-Object { Ghi ("{0}: {1} lượt, {2} đạt" -f $_.Name,$_.Count,@($_.Group | Where-Object Dat -eq 'Đạt').Count) }
}
function Kiem-MayChuHQ([string]$DiaChi) {
    $uri = [uri]$DiaChi
    if ($uri.AbsoluteUri -notmatch '^http://(localhost|127\.0\.0\.1):5095/$') { throw 'Chỉ cho phép loopback cổng 5095.' }
    $script:DiaChiHQ = $uri.GetLeftPart([UriPartial]::Authority)
    if (-not (Lay-TienTrinhHQ)) { throw 'Chưa có tiến trình do script 03 khởi chạy.' }
    $state = Get-Content -Raw -LiteralPath $TrangThaiHQ | ConvertFrom-Json
    if ((Goi-HQ '/hq-instance.txt').Content.Trim() -cne $state.token) { throw 'Sai máy chủ đo HQ.' }
}
function DangNhap-HQ([switch]$NhanVien) {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $data = if ($NhanVien) { @{tenDangNhap='nhanvien';matKhau='Nhanvien@123'} }
            else { @{tenDangNhap='quanly';matKhau='Quanly@123'} }
    $null = Goi-HQ '/api/dang-nhap' POST $session $data
    $session
}
function Ma-HQ { 'T' + [guid]::NewGuid().ToString('N').Substring(0,9).ToUpperInvariant() }
function Khach-HQ {
    @{hoTen='Nguyễn Thị Đo';loaiGiayTo='HoChieu';soGiayTo=('H'+[guid]::NewGuid().ToString('N').Substring(0,19).ToUpperInvariant());dienThoai='0912345678'}
}
function Chuyen-HQ([string]$Ma,[int]$Ghe=20,[switch]$HaiHang) {
    $data = @{maChuyenBay=$Ma;giaVe=1000000;maSanBayDi='SGN';maSanBayDen='HAN'
        ngayGioKhoiHanh=(NgayGio-HQ).AddDays(7).ToString('yyyy-MM-ddTHH:mm:ss');thoiGianBay=130
        gheTheoHang=@(@{maHangVe='H1';soLuongGhe=$Ghe});trungGian=@()}
    if ($HaiHang) {
        $data.gheTheoHang += @{maHangVe='H2';soLuongGhe=180}
        $data.trungGian = @(@{thuTu=1;maSanBay='DAD';thoiGianDung=15;ghiChu='Đón khách'},
                            @{thuTu=2;maSanBay='CXR';thoiGianDung=15;ghiChu='Dừng kỹ thuật'})
    }
    $data
}
function NgayGio-HQ { [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]::UtcNow,'SE Asia Standard Time') }
function DauGio-HQ { Get-Date -Format 'yyyyMMdd_HHmmss_fff' }
function TomTat-HQ($Dong) {
    $Dong | Group-Object PhepDo | ForEach-Object {
        $ms = @($_.Group.MiliGiay | Sort-Object)
        $i = [int][math]::Floor($ms.Count / 2)
        $trungVi = if ($ms.Count % 2) { $ms[$i] } else { ($ms[$i-1]+$ms[$i])/2 }
        [pscustomobject]@{PhepDo=$_.Name;SoLan=$ms.Count;NhoNhat=$ms[0];TrungVi=$trungVi;LonNhat=$ms[-1]}
    } | Format-Table -AutoSize | Out-Host
}
