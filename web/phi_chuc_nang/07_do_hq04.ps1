#requires -Version 5.1
param([ValidateRange(1,100)][int]$SoLan=10)
. "$PSScriptRoot/chung.ps1"
$start = Join-Path $PSScriptRoot '03_chay_may_chu_hq.ps1'
$csv = Join-Path $KetQuaHQ ("hq04_{0}.csv" -f (DauGio-HQ))
$rows = @()
for ($lan=1; $lan -le $SoLan; $lan++) {
    Dung-MayChuHQ
    Chay-SqlHQ -Sql @'
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @Nay datetime2(0)=DATEADD(hour,7,SYSUTCDATETIME());
IF (SELECT COUNT(*) FROM PHIEUDATCHO WHERE MaPhieuDat BETWEEN 'PD00600001' AND 'PD00601000') <> 1000
    THROW 50000, 'HQ04 yeu cau du lieu HeSo 1', 1;
IF EXISTS (
    SELECT 1 FROM PHIEUDATCHO p JOIN CHUYENBAY c ON p.MaChuyenBay=c.MaChuyenBay
    CROSS JOIN THAMSOQUYDINH q
    WHERE p.MaPhieuDat NOT BETWEEN 'PD00600001' AND 'PD00601000' AND p.TinhTrang=N'Chờ thanh toán'
        AND (p.ThoiDiemDat<=DATEADD(hour,-24,@Nay)
             OR CAST(c.NgayGioKhoiHanh AS date)<=DATEADD(day,q.ThoiGianHuyDatVe,CAST(@Nay AS date)))
) THROW 50000, 'Co phieu den han ngoai nhom HQ04. Hay nap lai du lieu moi.', 1;
UPDATE PHIEUDATCHO SET TinhTrang=N'Chờ thanh toán', ThoiDiemDat=DATEADD(hour,-25,@Nay)
WHERE MaPhieuDat BETWEEN 'PD00600001' AND 'PD00601000';
IF @@ROWCOUNT<>1000 THROW 50000, 'Khong dat lai duoc dung 1000 phieu', 1;
COMMIT;
'@
    & $start -DungLaiBanDaBuild
    $state = Get-Content -Raw -LiteralPath $TrangThaiHQ | ConvertFrom-Json
    $den = [datetime]::UtcNow.AddSeconds(90)
    do {
        if (-not (Lay-TienTrinhHQ)) { throw 'Máy chủ HQ đã thoát.' }
        $log = Get-Content -LiteralPath $state.stdout
        $ready = $log | Select-String 'Application started\.' | Select-Object -First 1
        $huy = $log | Select-String 'Tu dong huy (\d+) phieu dat cho qua han\.' | Select-Object -First 1
        if ($ready -and $huy) { break }
        Start-Sleep -Milliseconds 100
    } while ([datetime]::UtcNow -lt $den)
    if (-not $ready -or -not $huy -or $huy.Matches[0].Groups[1].Value -ne '1000') {
        throw "Thiếu bằng chứng khởi động và hủy đúng 1.000 phiếu. Xem $($state.stdout)."
    }
    $fmt = 'yyyy-MM-dd HH:mm:ss.fff'
    $batDau = [datetime]::ParseExact($ready.Line.Substring(0,23),$fmt,[Globalization.CultureInfo]::InvariantCulture)
    $ketThuc = [datetime]::ParseExact($huy.Line.Substring(0,23),$fmt,[Globalization.CultureInfo]::InvariantCulture)
    if ($ketThuc -lt $batDau) { throw 'Bộ định thời hoàn thành trước mốc lắng nghe. Không tính được theo cách 2.' }
    $con = Chay-SqlHQ -Gon -Sql "SELECT COUNT(*) FROM PHIEUDATCHO WHERE MaPhieuDat BETWEEN 'PD00600001' AND 'PD00601000' AND TinhTrang=N'Đã hủy';"
    if ([int]($con | Select-Object -First 1) -ne 1000) { throw 'CSDL chưa ghi nhận đủ 1.000 phiếu đã hủy.' }
    $row = [pscustomobject]@{PhepDo='HQ04';Lan=$lan;MiliGiay=($ketThuc-$batDau).TotalMilliseconds;
        SoPhieu=1000;BatDau=$ready.Line;KetThuc=$huy.Line;NhatKy=$state.stdout}
    $rows += $row
    $row | Export-Csv -LiteralPath $csv -Encoding UTF8 -NoTypeInformation -Append
}
TomTat-HQ $rows
Write-Host $csv
