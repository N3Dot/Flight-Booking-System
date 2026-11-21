#requires -Version 5.1
. "$PSScriptRoot/chung.ps1"
Kiem-MayChuHQ $DiaChiHQ
[Net.ServicePointManager]::DefaultConnectionLimit = 40
([Net.ServicePointManager]::FindServicePoint([uri]$DiaChiHQ)).ConnectionLimit = 40
$ql = DangNhap-HQ
$file = Join-Path $KetQuaHQ ("dong_thoi_{0}.txt" -f (DauGio-HQ))
function Ghi($NoiDung) { $NoiDung | Tee-Object -FilePath $file -Append | Out-Host }

$worker = {
    param($ThuVien,$Ma,$Path,$SanSang,$BatDau)
    . $ThuVien
    $session = DangNhap-HQ -NhanVien
    $data = @{maChuyenBay=$Ma;maHangVe='H1';hanhKhach=(Khach-HQ)}
    $null = $SanSang.Signal()
    if (-not $BatDau.Wait(60000)) { throw 'Hết thời gian chờ phát lệnh.' }
    $gui = [datetime]::UtcNow.ToString('o')
    try {
        $r = Goi-HQ $Path POST $session $data 201
        $json = $r.Content | ConvertFrom-Json
        [pscustomobject]@{Loai=$Path;Http=201;Ma=[string]($json.maVe+$json.maPhieuDat);GuiUtc=$gui}
    } catch [Net.WebException] {
        $http = [int]$_.Exception.Response.StatusCode
        if ($http -ne 409) { throw }
        # trong runspace, ErrorDetails có thể rỗng: đọc thẳng luồng phản hồi
        $than = $_.ErrorDetails.Message
        if (-not $than) { $doc = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $than = $doc.ReadToEnd(); $doc.Dispose() }
        $json = $than | ConvertFrom-Json
        [pscustomobject]@{Loai=$Path;Http=$http;Ma=$json.ma;GuiUtc=$gui}
    } finally {
        try { $null = Goi-HQ '/api/dang-xuat' POST $session -Status 204 } catch { Write-Verbose $_ }
    }
}

foreach ($luot in 1,2) {
    $ma = Ma-HQ
    $null = Goi-HQ '/api/chuyen-bay' POST $ql (Chuyen-HQ $ma 5) 201
    Ghi "Lượt $luot | $ma | 5 ghế H1"
    $ready = [Threading.CountdownEvent]::new(20)
    $go = [Threading.ManualResetEventSlim]::new($false)
    $pool = [RunspaceFactory]::CreateRunspacePool(20,20)
    $viec = @()
    try {
        $pool.Open()
        foreach ($i in 1..20) {
            $path = if ($luot -eq 2 -and $i -gt 10) { '/api/phieu-dat' } else { '/api/ve' }
            $ps = [PowerShell]::Create()
            $ps.RunspacePool = $pool
            $null = $ps.AddScript($worker.ToString()).AddArgument((Join-Path $PSScriptRoot 'chung.ps1')).
                AddArgument($ma).AddArgument($path).AddArgument($ready).AddArgument($go)
            $viec += @{Ps=$ps;Id=$ps.BeginInvoke()}
        }
        if (-not $ready.Wait(45000)) { throw 'Chưa đủ 20 phiên đăng nhập. Không phát lệnh bán/đặt.' }
        $go.Set()
        $kq = foreach ($v in $viec) { $v.Ps.EndInvoke($v.Id) }
    } catch {
        Ghi $_.ToString()
        throw
    } finally {
        foreach ($v in $viec) { $v.Ps.Dispose() }
        $pool.Dispose(); $ready.Dispose(); $go.Dispose()
    }
    Ghi ($kq | Format-Table -AutoSize | Out-String)
    $sql = @"
SELECT CONCAT('GHE|',SoLuongGhe) FROM GHETHEOHANG WHERE MaChuyenBay='$ma' AND MaHangVe='H1';
SELECT CONCAT('/api/ve|',MaVe) FROM VE WHERE MaChuyenBay='$ma' AND MaHangVe='H1' AND TinhTrang=N'Đã bán'
UNION ALL
SELECT CONCAT('/api/phieu-dat|',MaPhieuDat) FROM PHIEUDATCHO WHERE MaChuyenBay='$ma' AND MaHangVe='H1' AND TinhTrang=N'Chờ thanh toán';
"@
    $db = @(Chay-SqlHQ -Gon -Sql $sql | ForEach-Object {$_.Trim()} | Where-Object {$_})
    Ghi ($db -join [Environment]::NewLine)
    $ok = @($kq | Where-Object Http -eq 201)
    $het = @($kq | Where-Object {$_.Http -eq 409 -and $_.Ma -ceq 'HET_CHO'})
    Ghi "HTTP 201: $($ok.Count) | HTTP 409 HET_CHO: $($het.Count)"
    $httpIds = @($ok | ForEach-Object {"$($_.Loai)|$($_.Ma)"} | Sort-Object)
    $dbIds = @($db | Where-Object {$_ -like '/api/*'} | Sort-Object)
    if ($ok.Count -ne 5 -or $het.Count -ne 15 -or $db[0] -ne 'GHE|5' -or
        ($httpIds -join ',') -cne ($dbIds -join ',')) { throw "Lượt $luot không khớp. Xem $file." }
    Ghi 'Đạt'
}
Write-Host $file
