#requires -Version 5.1
param([int[]]$Muc=@(5,10,20,50,100,200),[ValidateRange(1,10)][int]$SoLan=3,[int]$MucHoiPhuc=5)
. "$PSScriptRoot/chung.ps1"
Kiem-MayChuHQ $DiaChiHQ
$ra = (New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'so_lieu_22_11')).FullName
$moc = DauGio-HQ
$script:CsvHQ = Join-Path $ra "tang_tai_$moc.csv"
$script:LogHQ = Join-Path $ra "tang_tai_$moc.txt"
# Mỗi luồng giữ một kết nối riêng, nên nâng giới hạn kết nối của .NET lên hơn mức cao nhất.
$gioiHan = ($Muc | Measure-Object -Maximum).Maximum + 20
[Net.ServicePointManager]::DefaultConnectionLimit = $gioiHan
([Net.ServicePointManager]::FindServicePoint([uri]$DiaChiHQ)).ConnectionLimit = $gioiHan
$ql = DangNhap-HQ
$nam = (NgayGio-HQ).Year
$duongTraCuu = "/api/chuyen-bay?sanBayDi=SGN&sanBayDen=HAN&tuNgay=$nam-01-01&denNgay=$nam-12-31"
$SO_GHE = 1000   # SO_GHE_TOI_DA của một hạng vé; mức 200 cần 3 x 200 vé cộng lượt hồi phục

# Luồng đo: chờ lệnh phát chung, rồi đo thời gian của đúng một yêu cầu bằng phiên đã đăng nhập sẵn.
$worker = {
    param($Phien,$Method,$Uri,$Than,$SanSang,$BatDau)
    $null = $SanSang.Signal()
    if (-not $BatDau.Wait(180000)) { throw 'Hết thời gian chờ phát lệnh.' }
    $gui = [datetime]::UtcNow.ToString('o')
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $yc = @{Uri=$Uri;Method=$Method;UseBasicParsing=$true;MaximumRedirection=0;TimeoutSec=120;WebSession=$Phien
            Headers=@{'X-Requested-With'='XMLHttpRequest'}}
    if ($Than) { $yc.Body = $Than; $yc.ContentType = 'application/json; charset=utf-8' }
    try {
        $r = Invoke-WebRequest @yc
        $http = [int]$r.StatusCode; $noi = $r.Content
    } catch [Net.WebException] {
        $resp = $_.Exception.Response
        if (-not $resp) { $http = 0; $noi = $_.Exception.Message }
        else {
            $http = [int]$resp.StatusCode
            $noi = $_.ErrorDetails.Message
            if (-not $noi) { $doc = New-Object IO.StreamReader($resp.GetResponseStream()); $noi = $doc.ReadToEnd(); $doc.Dispose() }
        }
    }
    $sw.Stop()
    $ma = $null; $soKq = $null
    try {
        $j = $noi | ConvertFrom-Json
        if ($Method -eq 'GET' -and $http -eq 200) { $soKq = if ($null -eq $j) { 0 } else { @($j).Count } }
        elseif ($http -eq 201) { $ma = [string]$j.maVe } else { $ma = [string]$j.ma }
    } catch { $ma = 'KHONG_DOC_DUOC' }
    [pscustomobject]@{Http=$http;Ma=$ma;SoKetQua=$soKq;MiliGiay=[math]::Round($sw.Elapsed.TotalMilliseconds,1);GuiUtc=$gui}
}

# Một đợt: N luồng đã đăng nhập cùng gửi một loại yêu cầu tại cùng thời điểm.
function Chay-Dot($GiaiDoan,$MucN,$Loai,$Luot,$Phien,$Ma) {
    $san = [Threading.CountdownEvent]::new($MucN)
    $di = [Threading.ManualResetEventSlim]::new($false)
    $pool = [RunspaceFactory]::CreateRunspacePool($MucN,$MucN)
    $viec = @()
    try {
        $pool.Open()
        foreach ($i in 0..($MucN-1)) {
            if ($Loai -eq 'TraCuu') { $method='GET'; $uri="$DiaChiHQ$duongTraCuu"; $than=$null }
            else {
                $method='POST'; $uri="$DiaChiHQ/api/ve"
                $than=[Text.Encoding]::UTF8.GetBytes((@{maChuyenBay=$Ma;maHangVe='H1';hanhKhach=(Khach-HQ)} | ConvertTo-Json -Depth 8 -Compress))
            }
            $ps = [PowerShell]::Create(); $ps.RunspacePool = $pool
            $null = $ps.AddScript($worker.ToString()).AddArgument($Phien[$i]).AddArgument($method).AddArgument($uri).
                AddArgument($than).AddArgument($san).AddArgument($di)
            $viec += @{Ps=$ps;Id=$ps.BeginInvoke()}
        }
        if (-not $san.Wait(180000)) { throw "Chưa đủ $MucN luồng sẵn sàng. Không phát lệnh." }
        $di.Set()
        $kq = @(foreach ($v in $viec) { $v.Ps.EndInvoke($v.Id) })
    } finally {
        foreach ($v in $viec) { $v.Ps.Dispose() }
        $pool.Dispose(); $san.Dispose(); $di.Dispose()
    }
    $stt = 0
    $dong = foreach ($k in $kq) {
        $stt++
        [pscustomobject]@{GiaiDoan=$GiaiDoan;Muc=$MucN;Loai=$Loai;Luot=$Luot;Stt=$stt;Http=$k.Http;Ma=$k.Ma
            SoKetQua=$k.SoKetQua;MiliGiay=$k.MiliGiay;GuiUtc=$k.GuiUtc}
    }
    $dong | Export-Csv -LiteralPath $script:CsvHQ -Append -NoTypeInformation -Encoding UTF8
    $ms = @($dong.MiliGiay | Sort-Object)
    Ghi ("  {0} N={1} {2} lượt {3}: nhỏ nhất {4} | lớn nhất {5} ms | HTTP {6}" -f $GiaiDoan,$MucN,$Loai,$Luot,$ms[0],$ms[-1],
        (($dong | Group-Object Http | ForEach-Object { "$($_.Name)x$($_.Count)" }) -join ', '))
    $dong
}

function Phan-Vi([double[]]$Ms,[double]$P) { $s = @($Ms | Sort-Object); $s[[math]::Max(0,[int][math]::Ceiling($P*$s.Count)-1)] }

# So vé Đã bán trong CSDL với số yêu cầu trả 201 và với tổng số ghế của chuyến.
function Kiem-Csdl($Ma,$Dong201) {
    $hang = @(Sql-Dong "SELECT CONCAT(SoLuongGhe,'|',(SELECT COUNT(*) FROM VE WHERE MaChuyenBay='$Ma' AND MaHangVe='H1' AND TinhTrang=N'Đã bán'),'|',(SELECT COUNT(DISTINCT MaVe) FROM VE WHERE MaChuyenBay='$Ma' AND MaHangVe='H1')) FROM GHETHEOHANG WHERE MaChuyenBay='$Ma' AND MaHangVe='H1'")[0] -split '\|'
    $dsDb = @(Sql-Dong "SELECT MaVe FROM VE WHERE MaChuyenBay='$Ma' AND MaHangVe='H1' AND TinhTrang=N'Đã bán'" | Sort-Object)
    $dsHttp = @($Dong201 | ForEach-Object { [string]$_.Ma } | Sort-Object)
    $khop = (($dsDb -join ',') -ceq ($dsHttp -join ','))
    $ketQua = ([int]$hang[1] -le [int]$hang[0]) -and ([int]$hang[1] -eq $dsHttp.Count) -and ([int]$hang[2] -eq [int]$hang[1]) -and $khop
    Ghi ("  CSDL {0}: tổng ghế {1} | vé Đã bán {2} | MaVe khác nhau {3} | yêu cầu 201 {4} | khớp mã vé {5} => {6}" -f $Ma,$hang[0],$hang[1],$hang[2],$dsHttp.Count,$khop,$(if($ketQua){'Đạt'}else{'KHÔNG ĐẠT'}))
    $ketQua
}

$tatCa = @()
$chuyen = @{}
$dat = $true
Ghi "Tăng tải $moc | mức $($Muc -join ',') | $SoLan lượt | tra cứu $duongTraCuu"
try {
    foreach ($n in $Muc) {
        $ma = Ma-HQ
        $null = Goi-HQ '/api/chuyen-bay' POST $ql (Chuyen-HQ $ma $SO_GHE) 201
        $chuyen[$n] = $ma
        Ghi "Mức $n | chuyến đo $ma | $SO_GHE ghế H1"
        $sw = [Diagnostics.Stopwatch]::StartNew()
        $phien = @(1..$n | ForEach-Object { DangNhap-HQ -NhanVien })
        Ghi ("  Đăng nhập {0} phiên trước khi phát lệnh: {1} s (không tính vào thời gian đo)" -f $n,[math]::Round($sw.Elapsed.TotalSeconds,1))
        $ban = @()
        foreach ($luot in 1..$SoLan) {
            $tatCa += Chay-Dot 'TangDan' $n 'TraCuu' $luot $phien $ma
            $d = Chay-Dot 'TangDan' $n 'BanVe' $luot $phien $ma
            $tatCa += $d; $ban += @($d | Where-Object Http -eq 201)
        }
        $chuyen["ban$n"] = $ban
        if (-not (Kiem-Csdl $ma $ban)) { $dat = $false }
        foreach ($p in $phien) { try { $null = Goi-HQ '/api/dang-xuat' POST $p -Status 204 } catch { Write-Verbose $_ } }
        # Mức 200 là mức quá tải: giữ chuyến để đo hồi phục trên cùng chuyến.
    }
    $nCao = [int]($Muc | Measure-Object -Maximum).Maximum
    Ghi "Hồi phục sau mức $nCao | tải về $MucHoiPhuc | chuyến $($chuyen[$nCao])"
    $phien = @(1..$MucHoiPhuc | ForEach-Object { DangNhap-HQ -NhanVien })
    $tatCa += Chay-Dot 'HoiPhuc' $MucHoiPhuc 'TraCuu' 1 $phien $chuyen[$nCao]
    $d = Chay-Dot 'HoiPhuc' $MucHoiPhuc 'BanVe' 1 $phien $chuyen[$nCao]
    $tatCa += $d
    $tong = @($chuyen["ban$nCao"]) + @($d | Where-Object Http -eq 201)
    if (-not (Kiem-Csdl $chuyen[$nCao] $tong)) { $dat = $false }
    foreach ($p in $phien) { try { $null = Goi-HQ '/api/dang-xuat' POST $p -Status 204 } catch { Write-Verbose $_ } }
} finally {
    try { $null = Goi-HQ '/api/dang-xuat' POST $ql -Status 204 } catch { Write-Verbose $_ }
}

Ghi 'BẢNG TỔNG HỢP (mili giây, gộp các lượt của cùng mức)'
$bang = foreach ($g in ($tatCa | Group-Object GiaiDoan,Muc,Loai)) {
    $ms = [double[]]@($g.Group.MiliGiay)
    $ma0 = $g.Group[0]
    $nguong = if ($ma0.Loai -eq 'BanVe') { 5000 } else { 10000 }
    $p95 = Phan-Vi $ms 0.95
    [pscustomobject]@{GiaiDoan=$ma0.GiaiDoan;Muc=$ma0.Muc;Loai=$ma0.Loai;SoYeuCau=$ms.Count
        NhoNhat=($ms | Measure-Object -Minimum).Minimum;TrungVi=(Phan-Vi $ms 0.5);P95=$p95
        LonNhat=($ms | Measure-Object -Maximum).Maximum
        Loi=@($g.Group | Where-Object { $_.Http -ne 200 -and $_.Http -ne 201 }).Count
        MaHttp=(($g.Group | Group-Object Http | ForEach-Object { "$($_.Name)x$($_.Count)" }) -join ' ')
        VuotNguong=$(if ($p95 -gt $nguong -or ($ms | Measure-Object -Maximum).Maximum -gt $nguong) {'CÓ'} else {'không'})}
}
Ghi ($bang | Format-Table -AutoSize | Out-String)
foreach ($loai in 'TraCuu','BanVe') {
    $dau = $bang | Where-Object { $_.GiaiDoan -eq 'TangDan' -and $_.Loai -eq $loai -and $_.VuotNguong -eq 'CÓ' } | Sort-Object Muc | Select-Object -First 1
    Ghi ("Mức đầu tiên vượt ngưỡng ({0}): {1}" -f $loai,$(if ($dau) { $dau.Muc } else { "không có tới mức $(($Muc | Measure-Object -Maximum).Maximum)" }))
}
$loi = @($tatCa | Where-Object { $_.Http -ne 200 -and $_.Http -ne 201 })
Ghi ("Yêu cầu lỗi: {0} / {1}. Mã HTTP lỗi: {2}. Lỗi 5xx: {3}" -f $loi.Count,@($tatCa).Count,
    (($loi | Group-Object Http,Ma | ForEach-Object { "$($_.Name) x$($_.Count)" }) -join '; '),@($loi | Where-Object { $_.Http -ge 500 -or $_.Http -eq 0 }).Count)
$trangThai = Get-Content -Raw -LiteralPath $TrangThaiHQ | ConvertFrom-Json
$nhatKy = @(Select-String -LiteralPath $trangThai.stdout,$trangThai.stderr -Pattern 'fail:|crit:|Exception' -ErrorAction SilentlyContinue)
Ghi "Dòng fail/crit/Exception trong nhật ký máy chủ HQ: $($nhatKy.Count)"
$nhatKy | Select-Object -First 5 | ForEach-Object { Ghi ("  " + $_.Line.Trim()) }
Ghi ("Kiểm tra CSDL tổng: {0}" -f $(if ($dat) {'Đạt'} else {'KHÔNG ĐẠT'}))
Ghi "Chuyến đo: $((($Muc | ForEach-Object { "N=$_ $($chuyen[$_])" }) -join '; '))"
Write-Host $script:CsvHQ
Write-Host $script:LogHQ
