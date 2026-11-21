#requires -Version 5.1
# AT01–AT04 (Bảng 5.36). AT01 và LichTuDong chỉ cần SQL Server; AT02–AT04 cần bản HQ đang chạy (script 03).
# Bản sao lưu ghi vào ket_qua\sao_luu; tài khoản dịch vụ SQL Server cần quyền ghi:
#   icacls ket_qua\sao_luu /grant "NT SERVICE\MSSQL`$SQLEXPRESS:(OI)(CI)M"
# AT04 xóa thật các phiếu Đã hủy trước mốc trong QLBANVE_HQ.
param([string]$Ra, [ValidateSet('AT01','LichTuDong','AT02','AT03','AT04')][string[]]$Phan=@('AT01','LichTuDong','AT02','AT03','AT04'),
      [string]$MocXoa='2025-01-01')
. "$PSScriptRoot/chung.ps1"
if (-not $Ra) { $Ra = $KetQuaHQ }
$Ra = (New-Item -ItemType Directory -Force -Path $Ra).FullName
$SaoLuu = (New-Item -ItemType Directory -Force -Path (Join-Path $KetQuaHQ 'sao_luu')).FullName
$moc = DauGio-HQ
$LogHQ = Join-Path $Ra "an_toan_$moc.txt"
$CsvHQ = Join-Path $Ra "an_toan_$moc.csv"
$xoaPhucHoi = @'
IF DB_ID(N'QLBANVE_HQ_PHUCHOI') IS NOT NULL
BEGIN
    ALTER DATABASE [QLBANVE_HQ_PHUCHOI] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [QLBANVE_HQ_PHUCHOI];
END;
SELECT CONCAT('CON QLBANVE_HQ_PHUCHOI|', COUNT(*)) FROM sys.databases WHERE name = N'QLBANVE_HQ_PHUCHOI';
'@

if ('AT01' -in $Phan) {
    Ghi '== AT01: sao lưu, phục hồi, so sánh =='
    if ((Chay-SqlHQ -Database master -Gon -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'QLBANVE_HQ_PHUCHOI';" | Select-Object -First 1).Trim() -ne '0') {
        throw 'QLBANVE_HQ_PHUCHOI đã có từ trước. Kiểm tra rồi xóa bằng tay.'
    }
    $bak = Join-Path $SaoLuu "QLBANVE_HQ_AT01_$moc.bak"
    $sql = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '10_an_toan.sql')).Replace('$(TepSaoLuu)', $bak)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        Ghi (Chay-SqlHQ -Database master -Gon -Sql $sql | Out-String)
        Ghi ("Kích thước tệp .bak: {0} byte" -f (Get-Item -LiteralPath $bak).Length)
        Ghi "Thời gian cả script SQL đo từ PowerShell: $([math]::Round($sw.Elapsed.TotalSeconds,2)) s"
    } finally {
        $sw2 = [Diagnostics.Stopwatch]::StartNew()
        Ghi (Chay-SqlHQ -Database master -Gon -Sql $xoaPhucHoi | Out-String)
        Ghi "Xóa QLBANVE_HQ_PHUCHOI: $([math]::Round($sw2.Elapsed.TotalSeconds,2)) s"
        if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak }
        Ghi "Còn tệp .bak: $(Test-Path -LiteralPath $bak)"
    }
}

if ('LichTuDong' -in $Phan) {
    # theo mục 6.1.6 của báo cáo, áp dụng cho QLBANVE_HQ và thư mục ket_qua\sao_luu
    Ghi '== AT01: lịch sao lưu tự động bằng Task Scheduler =='
    $tenTacVu = 'Sao luu QLBANVE_HQ'
    if (Get-ScheduledTask -TaskName $tenTacVu -ErrorAction SilentlyContinue) { throw "Tác vụ $tenTacVu đã có từ trước." }
    $tepPs = Join-Path $SaoLuu 'sao_luu.ps1'
    $sqlcmd = (Get-Command sqlcmd -CommandType Application).Source
    $noiDung = @"
`$ngay = Get-Date -Format "yyyyMMdd"
`$tep = "$SaoLuu\QLBANVE_HQ_`$ngay.bak"
`$lenh = "BACKUP DATABASE QLBANVE_HQ TO DISK = N'`$tep' WITH INIT, CHECKSUM"
& "$sqlcmd" -S localhost\SQLEXPRESS -E -C -b -Q `$lenh
`$ma = `$LASTEXITCODE
Get-ChildItem "$SaoLuu\QLBANVE_HQ_*.bak" |
Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
Remove-Item
exit `$ma
"@
    [IO.File]::WriteAllText($tepPs, $noiDung, [Text.UTF8Encoding]::new($true))
    $laQuanTri = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Ghi "PowerShell chạy với quyền Administrator: $laQuanTri"
    $hanhDong = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$tepPs`""
    $lich = New-ScheduledTaskTrigger -Daily -At 22:00
    $nguoi = "$env:USERDOMAIN\$env:USERNAME"
    $daTao = $false
    try {
        try {
            # đúng hướng dẫn: -RunLevel Highest; hướng dẫn còn nhập mật khẩu Windows, ở đây không có nên dùng kiểu đăng nhập Interactive
            $null = Register-ScheduledTask -TaskName $tenTacVu -Action $hanhDong -Trigger $lich `
                -Principal (New-ScheduledTaskPrincipal -UserId $nguoi -LogonType Interactive -RunLevel Highest) -ErrorAction Stop
            $daTao = $true; Ghi 'Đã tạo tác vụ với -RunLevel Highest.'
        } catch {
            Ghi "Không tạo được tác vụ với -RunLevel Highest: $($_.Exception.Message.Trim())"
            $null = Register-ScheduledTask -TaskName $tenTacVu -Action $hanhDong -Trigger $lich `
                -Principal (New-ScheduledTaskPrincipal -UserId $nguoi -LogonType Interactive -RunLevel Limited) -ErrorAction Stop
            $daTao = $true; Ghi 'Đã tạo tác vụ với -RunLevel Limited, chạy khi người dùng đang đăng nhập.'
        }
        $t = Get-ScheduledTask -TaskName $tenTacVu
        Ghi ("Tác vụ: {0}; lịch {1}; chạy {2} {3}" -f $t.TaskName, (($t.Triggers | ForEach-Object { $_.StartBoundary }) -join ','), $t.Actions[0].Execute, $t.Actions[0].Arguments)
        $truoc = (Get-ScheduledTaskInfo -TaskName $tenTacVu).LastRunTime
        $sw = [Diagnostics.Stopwatch]::StartNew()
        Start-ScheduledTask -TaskName $tenTacVu
        do {
            Start-Sleep -Milliseconds 500
            $info = Get-ScheduledTaskInfo -TaskName $tenTacVu
            $state = (Get-ScheduledTask -TaskName $tenTacVu).State
        } while (($state -eq 'Running' -or $info.LastRunTime -eq $truoc) -and $sw.Elapsed.TotalMinutes -lt 10)
        Ghi ("Start-ScheduledTask: xong sau {0} s, LastRunTime {1}, LastTaskResult {2}" -f [math]::Round($sw.Elapsed.TotalSeconds,1), $info.LastRunTime, $info.LastTaskResult)
        $tep = Join-Path $SaoLuu ("QLBANVE_HQ_{0}.bak" -f (Get-Date -Format 'yyyyMMdd'))
        if (Test-Path -LiteralPath $tep) {
            Ghi ("Tệp tạo ra: {0}, {1} byte" -f [IO.Path]::GetFileName($tep), (Get-Item -LiteralPath $tep).Length)
            $sw = [Diagnostics.Stopwatch]::StartNew()
            Ghi (Chay-SqlHQ -Database master -Sql "RESTORE VERIFYONLY FROM DISK = N'$tep' WITH CHECKSUM;" | Out-String)
            Ghi "RESTORE VERIFYONLY: $([math]::Round($sw.Elapsed.TotalSeconds,2)) s"
        } else { Ghi "Không thấy tệp $tep." }
    } catch {
        Ghi "Bỏ qua phần lịch tự động: $($_.Exception.Message.Trim())"
    } finally {
        if ($daTao) { Unregister-ScheduledTask -TaskName $tenTacVu -Confirm:$false }
        Get-ChildItem -LiteralPath $SaoLuu -Filter 'QLBANVE_HQ_*.bak' | Remove-Item
        if (Test-Path -LiteralPath $tepPs) { Remove-Item -LiteralPath $tepPs }
        Ghi ("Sau khi dọn: còn tác vụ {0}, còn {1} tệp .bak" -f [bool](Get-ScheduledTask -TaskName $tenTacVu -ErrorAction SilentlyContinue), @(Get-ChildItem -LiteralPath $SaoLuu -Filter '*.bak').Count)
    }
}

if ($Phan | Where-Object { $_ -in 'AT02','AT03','AT04' }) {
    Kiem-MayChuHQ $DiaChiHQ
    $ql = DangNhap-HQ
    $nv = DangNhap-HQ -NhanVien
}
function Tao-Chuyen { $m = Ma-HQ; $null = Luot $args[0] "Quản lý tạo chuyến bay $m" '/api/chuyen-bay' POST $ql (Chuyen-HQ $m) 201; $m }
function Ban-Ve($Yc, $Ma) { (Luot $Yc "bán vé trên $Ma" '/api/ve' POST $nv @{maChuyenBay=$Ma;maHangVe='H1';hanhKhach=(Khach-HQ)} 201).Than | ConvertFrom-Json }
function Dat-Cho($Yc, $Ma) { (Luot $Yc "lập phiếu trên $Ma" '/api/phieu-dat' POST $nv @{maChuyenBay=$Ma;maHangVe='H1';hanhKhach=(Khach-HQ)} 201).Than | ConvertFrom-Json }

if ('AT02' -in $Phan) {
    Ghi '== AT02: xóa dữ liệu đang được dùng =='
    $null = Luot AT02 'xóa sân bay SGN' '/api/san-bay/SGN' DELETE $ql $null 409 DANG_DUOC_SU_DUNG
    $null = Luot AT02 'xóa hạng vé H1' '/api/hang-ve/H1' DELETE $ql $null 409 DANG_DUOC_SU_DUNG
    $coVe = (Sql-Dong "SELECT TOP (1) MaChuyenBay FROM VE WHERE TinhTrang=N'Đã bán' AND MaChuyenBay LIKE 'HQ%' ORDER BY MaVe;" | Select-Object -First 1)
    $null = Luot AT02 "xóa chuyến bay đã có vé $coVe" "/api/chuyen-bay/$coVe" DELETE $ql $null 409 DA_CO_VE_HOAC_PHIEU
    $daHuy = Tao-Chuyen AT02
    $ve = Ban-Ve AT02 $daHuy
    $null = Luot AT02 "hủy vé $($ve.maVe)" "/api/ve/$($ve.maVe)/huy" POST $nv @{} 204
    $pd = Dat-Cho AT02 $daHuy
    $null = Luot AT02 "hủy phiếu $($pd.maPhieuDat)" "/api/phieu-dat/$($pd.maPhieuDat)/huy" POST $nv @{} 204
    $null = Luot AT02 "xóa chuyến bay chỉ có vé, phiếu Đã hủy $daHuy" "/api/chuyen-bay/$daHuy" DELETE $ql $null 409 DA_CO_VE_HOAC_PHIEU
    $trong = Tao-Chuyen AT02
    $null = Luot AT02 "xóa chuyến bay trống $trong" "/api/chuyen-bay/$trong" DELETE $ql $null 204
    $dsSb = @(((Thu-HQ '/api/quy-dinh' -Session $ql).Than | ConvertFrom-Json).sanBay.maSanBay)
    $sbMoi = @('QZX','QZY','QZW','QXZ') | Where-Object { $_ -notin $dsSb } | Select-Object -First 1
    $null = Luot AT02 "thêm sân bay mới $sbMoi" '/api/san-bay' POST $ql @{maSanBay=$sbMoi;tenSanBay='Sân bay thử AT02'} 201
    $null = Luot AT02 "xóa sân bay mới $sbMoi" "/api/san-bay/$sbMoi" DELETE $ql $null 204
    Ghi (Sql-Dong @"
SELECT CONCAT('CSDL|SGN con ',COUNT(*)) FROM SANBAY WHERE MaSanBay='SGN';
SELECT CONCAT('CSDL|H1 con ',COUNT(*)) FROM HANGVE WHERE MaHangVe='H1';
SELECT CONCAT('CSDL|$coVe con ',COUNT(*)) FROM CHUYENBAY WHERE MaChuyenBay='$coVe';
SELECT CONCAT('CSDL|$daHuy con ',COUNT(*),'|ve ',(SELECT COUNT(*) FROM VE WHERE MaChuyenBay='$daHuy'),'|phieu ',(SELECT COUNT(*) FROM PHIEUDATCHO WHERE MaChuyenBay='$daHuy')) FROM CHUYENBAY WHERE MaChuyenBay='$daHuy';
SELECT CONCAT('CSDL|$trong con ',COUNT(*),'|ghe ',(SELECT COUNT(*) FROM GHETHEOHANG WHERE MaChuyenBay='$trong')) FROM CHUYENBAY WHERE MaChuyenBay='$trong';
SELECT CONCAT('CSDL|$sbMoi con ',COUNT(*),'|so san bay ',(SELECT COUNT(*) FROM SANBAY)) FROM SANBAY WHERE MaSanBay='$sbMoi';
"@ | Out-String)
}

if ('AT03' -in $Phan) {
    Ghi '== AT03: hủy không xóa dữ liệu =='
    $cb = Tao-Chuyen AT03
    $ve = Ban-Ve AT03 $cb
    $null = Luot AT03 "hủy vé $($ve.maVe)" "/api/ve/$($ve.maVe)/huy" POST $nv @{} 204
    $pd = Dat-Cho AT03 $cb
    $null = Luot AT03 "hủy phiếu $($pd.maPhieuDat)" "/api/phieu-dat/$($pd.maPhieuDat)/huy" POST $nv @{} 204
    $pd2 = Dat-Cho AT03 $cb
    $kq = Luot AT03 "bán vé từ phiếu $($pd2.maPhieuDat)" '/api/ve/tu-phieu' POST $nv @{maPhieuDat=$pd2.maPhieuDat} 201
    $ve2 = $kq.Than | ConvertFrom-Json
    $null = Luot AT03 "bán lần hai từ phiếu $($pd2.maPhieuDat)" '/api/ve/tu-phieu' POST $nv @{maPhieuDat=$pd2.maPhieuDat} 409
    Ghi (Sql-Dong @"
SELECT CONCAT('VE|',MaVe,'|',TinhTrang,'|phieu ',ISNULL(MaPhieuDat,'-')) FROM VE WHERE MaChuyenBay='$cb' ORDER BY MaVe;
SELECT CONCAT('PHIEU|',MaPhieuDat,'|',TinhTrang) FROM PHIEUDATCHO WHERE MaChuyenBay='$cb' ORDER BY MaPhieuDat;
SELECT CONCAT('UC06|PD00600001-PD00601000|con ',COUNT(*),'|Da huy ',SUM(CASE WHEN TinhTrang=N'Đã hủy' THEN 1 ELSE 0 END)) FROM PHIEUDATCHO WHERE MaPhieuDat BETWEEN 'PD00600001' AND 'PD00601000';
"@ | Out-String)
    Ghi "Vé $($ve.maVe), phiếu $($pd.maPhieuDat), phiếu $($pd2.maPhieuDat) thành vé $($ve2.maVe)"
}

if ('AT04' -in $Phan) {
    Ghi "== AT04: xóa phiếu Đã hủy trước $MocXoa =="
    $demSql = @"
SELECT CONCAT('PHIEU TRUOC MOC|tong ',COUNT(*),
  '|Da huy chua thanh ve ',SUM(CASE WHEN p.TinhTrang=N'Đã hủy' AND v.MaVe IS NULL THEN 1 ELSE 0 END),
  '|Da huy da thanh ve ',SUM(CASE WHEN p.TinhTrang=N'Đã hủy' AND v.MaVe IS NOT NULL THEN 1 ELSE 0 END),
  '|Cho thanh toan ',SUM(CASE WHEN p.TinhTrang=N'Chờ thanh toán' THEN 1 ELSE 0 END))
FROM PHIEUDATCHO p LEFT JOIN VE v ON v.MaPhieuDat=p.MaPhieuDat WHERE p.ThoiDiemDat < '$MocXoa';
SELECT CONCAT('PHIEU|tong ',COUNT(*),'|Cho thanh toan ',SUM(CASE WHEN TinhTrang=N'Chờ thanh toán' THEN 1 ELSE 0 END)) FROM PHIEUDATCHO;
"@
    Ghi 'Trước khi xóa:'
    Ghi (Sql-Dong $demSql | Out-String)
    $kq = Luot AT04 "đếm phiếu Đã hủy trước $MocXoa" "/api/phieu-dat/da-huy/dem?truocNgay=$MocXoa" GET $ql $null 200
    Ghi "    phản hồi $($kq.Than)"
    $kq = Luot AT04 "xóa phiếu Đã hủy trước $MocXoa" "/api/phieu-dat/da-huy?truocNgay=$MocXoa" DELETE $ql $null 200
    Ghi "    phản hồi $($kq.Than)"
    Ghi 'Sau khi xóa:'
    Ghi (Sql-Dong $demSql | Out-String)
    $kq = Luot AT04 "đếm lại sau khi xóa" "/api/phieu-dat/da-huy/dem?truocNgay=$MocXoa" GET $ql $null 200
    Ghi "    phản hồi $($kq.Than)"
}
if ($ql) { foreach ($s in $ql,$nv) { $null = Thu-HQ '/api/dang-xuat' POST $s } }
if (@($DongHQ).Count) { TongKet-Luot }
Write-Host $LogHQ
