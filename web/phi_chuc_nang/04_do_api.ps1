#requires -Version 5.1
param([string]$DiaChi='http://localhost:5095',[ValidateRange(1,50)][int]$SoLan=10)
. "$PSScriptRoot/chung.ps1"
Kiem-MayChuHQ $DiaChi
$ql = DangNhap-HQ
$nv = DangNhap-HQ -NhanVien
$moc = DauGio-HQ
$csv = Join-Path $KetQuaHQ "api_$moc.csv"
$body = Join-Path $KetQuaHQ "api_$moc.json.tmp"
$dong = @()
$thamSo = '/api/quy-dinh/tham-so/thoiGianBayToiThieu'
$cu = ((Goi-HQ /api/quy-dinh -Session $ql).Content | ConvertFrom-Json).thamSo.thoiGianBayToiThieu
function Do-Api($Ten,$Path,$Session,$Method='GET',$Data=$null,$Status=200,$Ext='') {
    $file = $null
    if ($null -ne $Data) {
        [IO.File]::WriteAllText($body,($Data | ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
        $file = $body
    }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Goi-HQ -Path $Path -Method $Method -Session $Session -Status $Status -BodyFile $file
    $sw.Stop()
    if ($Ext) {
        $bytes = $r.RawContentStream.ToArray()
        $chuKy = if ($Ext -eq 'pdf') { '%PDF-' } else { 'PK' }
        if (-not [Text.Encoding]::ASCII.GetString($bytes,0,[math]::Min(5,$bytes.Length)).StartsWith($chuKy)) {
            throw "Tệp $Ext sai định dạng."
        }
        [IO.File]::WriteAllBytes((Join-Path $KetQuaHQ "$moc-${Ten}_$lan.$Ext"),$bytes)
    }
    $soKetQua = if ($Ten -like 'HQ05_*') {
        $ds = $r.Content | ConvertFrom-Json
        if ($null -eq $ds) { 0 } else { @($ds).Count }
    }
    $row = [pscustomobject]@{PhepDo=$Ten;Lan=$lan;MiliGiay=[math]::Round($sw.Elapsed.TotalMilliseconds,3)
        Http=$r.StatusCode;Byte=$r.RawContentLength;SoKetQua=$soKetQua}
    $row | Export-Csv -LiteralPath $csv -Append -NoTypeInformation -Encoding UTF8
    $row
}

$ngay = NgayGio-HQ
$nam = $ngay.Year
$thang = $ngay.Month
$thangBaoCao = 6
$dauThang = $ngay.ToString('yyyy-MM-01')
$cuoiThang = '{0}-{1:00}-{2:00}' -f $nam,$thang,[datetime]::DaysInMonth($nam,$thang)
try {
    for ($lan=1; $lan -le $SoLan; $lan++) {
        $dong += Do-Api HQ01 '/api/chuyen-bay' $ql POST (Chuyen-HQ (Ma-HQ) -HaiHang) 201
        $ve = @{maChuyenBay='HQBAN100';maHangVe='H2';hanhKhach=(Khach-HQ)}
        $dong += Do-Api HQ02 '/api/ve' $nv POST $ve 201
        $ve.hanhKhach = Khach-HQ
        $dong += Do-Api HQ03 '/api/phieu-dat' $nv POST $ve 201
        $dong += Do-Api HQ05_tat_ca '/api/chuyen-bay' $nv
        $dong += Do-Api HQ05_tuyen "/api/chuyen-bay?sanBayDi=SGN&sanBayDen=HAN&tuNgay=$nam-01-01&denNgay=$nam-12-31" $nv
        $dong += Do-Api HQ05_thang "/api/chuyen-bay?tuNgay=$dauThang&denNgay=$cuoiThang" $nv
        $dong += Do-Api HQ05_ma '/api/chuyen-bay?maChuyenBay=HQ1234' $nv
        $dong += Do-Api HQ06_thang "/api/bao-cao/thang?thang=$thangBaoCao&nam=$nam" $ql
        $dong += Do-Api HQ06_nam "/api/bao-cao/nam?nam=$nam" $ql
        foreach ($dinhDang in 'excel','pdf') {
            $ext = if ($dinhDang -eq 'excel') { 'xlsx' } else { 'pdf' }
            $dong += Do-Api "HQ06_thang_$dinhDang" "/api/bao-cao/thang/xuat?thang=$thangBaoCao&nam=$nam&dinhDang=$dinhDang" $ql GET $null 200 $ext
            $dong += Do-Api "HQ06_nam_$dinhDang" "/api/bao-cao/nam/xuat?nam=$nam&dinhDang=$dinhDang" $ql GET $null 200 $ext
        }
        $moi = 30 + ($lan % 2)
        $dong += Do-Api HQ07 $thamSo $ql PUT @{giaTriMoi=$moi} 204
        if (((Goi-HQ /api/quy-dinh -Session $nv).Content | ConvertFrom-Json).thamSo.thoiGianBayToiThieu -ne $moi) {
            throw 'HQ07: phiên Nhân viên chưa đọc được giá trị mới.'
        }
    }
} finally {
    try { $null = Goi-HQ $thamSo -Method PUT -Session $ql -Data @{giaTriMoi=$cu} -Status 204 }
    finally { if (Test-Path -LiteralPath $body) { Remove-Item -LiteralPath $body } }
}
TomTat-HQ $dong
Write-Host $csv
