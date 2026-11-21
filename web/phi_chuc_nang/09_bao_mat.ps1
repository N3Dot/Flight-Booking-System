#requires -Version 5.1
# BMT01–BMT09 (Bảng 5.31 dòng 1–9): gọi máy chủ HQ với phiên Quản lý, Nhân viên bán vé và một tài khoản thử.
# Mật khẩu tài khoản thử được sinh ngẫu nhiên trong bộ nhớ, không ghi ra tệp; tài khoản thử bị khóa khi kết thúc.
param([string]$Ra)
. "$PSScriptRoot/chung.ps1"
if (-not $Ra) { $Ra = $KetQuaHQ }
$Ra = (New-Item -ItemType Directory -Force -Path $Ra).FullName
Kiem-MayChuHQ $DiaChiHQ
$moc = DauGio-HQ
$CsvHQ = Join-Path $Ra "bao_mat_$moc.csv"
$LogHQ = Join-Path $Ra "bao_mat_$moc.txt"
function Phien-Moi { New-Object Microsoft.PowerShell.Commands.WebRequestSession }
function Sinh-MatKhau {
    $bo = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    $b = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    'Aa1!' + (-join ($b | ForEach-Object { $bo[$_ % $bo.Length] }))
}
$nam = (NgayGio-HQ).Year
$ma = Ma-HQ

# BMT01: chưa đăng nhập, sai mật khẩu, tài khoản khóa, chèn SQL, cookie phiên, cột mật khẩu, ô mật khẩu
$an = Phien-Moi
$chuaDN = @(
    @('GET','/api/phien'), @('GET','/api/tai-khoan'), @('POST','/api/tai-khoan'),
    @('GET','/api/chuyen-bay'), @('POST','/api/chuyen-bay'), @('GET','/api/chuyen-bay/xuat-excel'),
    @('POST','/api/ve'), @('GET','/api/ve'), @('POST','/api/phieu-dat'), @('GET','/api/phieu-dat'),
    @('GET',"/api/bao-cao/thang?thang=6&nam=$nam"), @('GET','/api/quy-dinh'),
    @('PUT','/api/quy-dinh/tham-so/thoiGianBayToiThieu'), @('DELETE','/api/phieu-dat/da-huy?truocNgay=2000-01-01')
)
foreach ($c in $chuaDN) {
    $data = if ($c[0] -in 'POST','PUT') { @{} } else { $null }
    $null = Luot BMT01 'chưa đăng nhập' $c[1] $c[0] $an $data 401 CHUA_DANG_NHAP
}
$null = Luot BMT01 'quanly sai mật khẩu' '/api/dang-nhap' POST (Phien-Moi) @{tenDangNhap='quanly';matKhau='SaiMatKhau@1'} 401 SAI_THONG_TIN_DANG_NHAP
$null = Luot BMT01 'nhanvien2 (Đã khóa) đúng mật khẩu' '/api/dang-nhap' POST (Phien-Moi) @{tenDangNhap='nhanvien2';matKhau='Nhanvien2@123'} 403 TAI_KHOAN_BI_KHOA
foreach ($chen in @(@{tenDangNhap="' OR '1'='1' --";matKhau='x'}, @{tenDangNhap="quanly'--";matKhau='x'}, @{tenDangNhap='quanly';matKhau="' OR '1'='1"})) {
    $null = Luot BMT01 ("chèn SQL {0} / {1}" -f $chen.tenDangNhap,$chen.matKhau) '/api/dang-nhap' POST (Phien-Moi) $chen 401 SAI_THONG_TIN_DANG_NHAP
}
$ql = Phien-Moi
$kq = Luot BMT01 'quanly đăng nhập' '/api/dang-nhap' POST $ql @{tenDangNhap='quanly';matKhau='Quanly@123'} 200
# che giá trị cookie, chỉ giữ tên và thuộc tính
Ghi ("Set-Cookie: " + ($kq.PhanHoi.Headers['Set-Cookie'] -replace '=[^;,]{20,}', '=***'))
Ghi ("Header bảo mật: X-Frame-Options={0}; X-Content-Type-Options={1}; CSP={2}" -f $kq.PhanHoi.Headers['X-Frame-Options'],$kq.PhanHoi.Headers['X-Content-Type-Options'],[bool]$kq.PhanHoi.Headers['Content-Security-Policy'])
$nv = Phien-Moi
$null = Luot BMT01 'nhanvien đăng nhập' '/api/dang-nhap' POST $nv @{tenDangNhap='nhanvien';matKhau='Nhanvien@123'} 200
Ghi (Sql-Dong @"
SELECT CONCAT('MATKHAU|',TenDangNhap,'|do dai ',LEN(MatKhau),'|',LEFT(MatKhau,CHARINDEX('$',MatKhau+'$$',CHARINDEX('$',MatKhau+'$')+1)),'|chua mat khau goc ',
  CASE WHEN MatKhau LIKE '%Quanly@123%' OR MatKhau LIKE '%Nhanvien@123%' OR MatKhau LIKE '%Nhanvien2@123%' THEN 'CO' ELSE 'khong' END) FROM TAIKHOAN ORDER BY TenDangNhap;
"@ | Out-String)
$trang = (Invoke-WebRequest "$DiaChiHQ/" -UseBasicParsing).Content
$js = [regex]::Matches($trang, 'src="(/assets/[^"]+\.js)"') | ForEach-Object { $_.Groups[1].Value }
$coPassword = $false
foreach ($j in $js) { if ((Invoke-WebRequest "$DiaChiHQ$j" -UseBasicParsing).Content -match '"password"') { $coPassword = $true } }
Ghi "Bản giao diện đang chạy có ô kiểu password: $coPassword ($($js -join ', '))"

# BMT02: phân quyền tài khoản; khóa, mở khóa, đổi nhóm quyền tài khoản thử
$ten = 'bmt' + [guid]::NewGuid().ToString('N').Substring(0,8)
$mk = Sinh-MatKhau
Ghi "Tài khoản thử: $ten"
try {
    $null = Luot BMT02 "Quản lý tạo $ten" '/api/tai-khoan' POST $ql @{tenDangNhap=$ten;matKhau=$mk;nhomQuyen='NhanVien'} 201
    $null = Luot BMT02 'NV xem danh sách tài khoản' '/api/tai-khoan' GET $nv $null 403 KHONG_CO_QUYEN
    $null = Luot BMT02 'NV thêm tài khoản' '/api/tai-khoan' POST $nv @{tenDangNhap=($ten+'x');matKhau=(Sinh-MatKhau);nhomQuyen='QuanLy'} 403 KHONG_CO_QUYEN
    $null = Luot BMT02 'NV sửa nhóm quyền' "/api/tai-khoan/$ten" PUT $nv @{nhomQuyen='QuanLy'} 403 KHONG_CO_QUYEN
    $null = Luot BMT02 'NV khóa tài khoản' "/api/tai-khoan/$ten/khoa" POST $nv @{} 403 KHONG_CO_QUYEN
    $null = Luot BMT02 'NV mở khóa tài khoản' "/api/tai-khoan/$ten/mo-khoa" POST $nv @{} 403 KHONG_CO_QUYEN
    $tk = Phien-Moi
    $null = Luot BMT02 "$ten đăng nhập" '/api/dang-nhap' POST $tk @{tenDangNhap=$ten;matKhau=$mk} 200
    $null = Luot BMT02 "$ten xem phiên" '/api/phien' GET $tk $null 200
    $null = Luot BMT02 "Quản lý khóa $ten" "/api/tai-khoan/$ten/khoa" POST $ql @{} 204
    $null = Luot BMT02 "$ten gọi tiếp bằng phiên cũ" "/api/chuyen-bay?maChuyenBay=$ma" GET $tk $null 401 CHUA_DANG_NHAP
    $null = Luot BMT02 "$ten đăng nhập lại khi bị khóa" '/api/dang-nhap' POST (Phien-Moi) @{tenDangNhap=$ten;matKhau=$mk} 403 TAI_KHOAN_BI_KHOA
    $null = Luot BMT02 "Quản lý mở khóa $ten" "/api/tai-khoan/$ten/mo-khoa" POST $ql @{} 204
    $tk = Phien-Moi
    $null = Luot BMT02 "$ten đăng nhập sau mở khóa" '/api/dang-nhap' POST $tk @{tenDangNhap=$ten;matKhau=$mk} 200
    $null = Luot BMT02 "$ten (NV) xem tài khoản" '/api/tai-khoan' GET $tk $null 403 KHONG_CO_QUYEN
    $null = Luot BMT02 "Quản lý đổi $ten sang Quản lý" "/api/tai-khoan/$ten" PUT $ql @{nhomQuyen='QuanLy'} 204
    $null = Luot BMT02 "$ten gọi bằng phiên trước khi đổi quyền" '/api/phien' GET $tk $null 401 CHUA_DANG_NHAP
    $tk = Phien-Moi
    $null = Luot BMT02 "$ten đăng nhập lại" '/api/dang-nhap' POST $tk @{tenDangNhap=$ten;matKhau=$mk} 200
    $null = Luot BMT02 "$ten (Quản lý) xem tài khoản" '/api/tai-khoan' GET $tk $null 200
    $null = Luot BMT02 "Quản lý đổi $ten về Nhân viên bán vé" "/api/tai-khoan/$ten" PUT $ql @{nhomQuyen='NhanVien'} 204
    $null = Luot BMT02 "$ten gọi bằng phiên Quản lý cũ" '/api/tai-khoan' GET $tk $null 401 CHUA_DANG_NHAP
    $null = Luot BMT02 'Quản lý tự khóa mình' '/api/tai-khoan/quanly/khoa' POST $ql @{} 409 KHONG_DUOC_TU_KHOA
} finally {
    $null = Luot BMT02 "Quản lý khóa $ten khi kết thúc" "/api/tai-khoan/$ten/khoa" POST $ql @{} 204
    $mk = $null
    Ghi (Sql-Dong "SELECT CONCAT('TAIKHOAN THU|',TenDangNhap,'|',NhomQuyen,'|',TrangThai) FROM TAIKHOAN WHERE TenDangNhap='$ten';" | Out-String)
}

# BMT03: NV không thao tác lịch chuyến bay
$null = Luot BMT03 "Quản lý tạo chuyến bay thử $ma" '/api/chuyen-bay' POST $ql (Chuyen-HQ $ma) 201
$null = Luot BMT03 'NV thêm chuyến bay' '/api/chuyen-bay' POST $nv (Chuyen-HQ (Ma-HQ)) 403 KHONG_CO_QUYEN
$null = Luot BMT03 'NV sửa chuyến bay' "/api/chuyen-bay/$ma" PUT $nv (Chuyen-HQ $ma 30) 403 KHONG_CO_QUYEN
$null = Luot BMT03 'NV xóa chuyến bay' "/api/chuyen-bay/$ma" DELETE $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT03 'NV tải tập tin mẫu' '/api/chuyen-bay/mau-excel' GET $nv $null 403 KHONG_CO_QUYEN
$mau = Join-Path $KetQuaHQ "bao_mat_mau_$moc.xlsx"
$kq = Thu-HQ '/api/chuyen-bay/mau-excel' -Session $ql
[IO.File]::WriteAllBytes($mau, $kq.PhanHoi.RawContentStream.ToArray())
$null = Luot BMT03 'NV nhập lịch từ tập tin (multipart)' '/api/chuyen-bay/nhap-excel' POST $nv -Mong 403 -MaMong KHONG_CO_QUYEN -TepXlsx $mau
Remove-Item -LiteralPath $mau
$kq = Luot BMT03 'chuyến bay thử vẫn còn' "/api/chuyen-bay/$ma" GET $ql $null 200
Ghi ("Số ghế H1 sau các lượt của NV: " + (($kq.Than | ConvertFrom-Json).gheTheoHang | Where-Object maHangVe -eq 'H1').soLuongGhe)

# BMT04, BMT05: NV bán, tra cứu, sửa, hủy vé; lập, tra cứu, hủy phiếu
$kq = Luot BMT04 'NV bán vé' '/api/ve' POST $nv @{maChuyenBay=$ma;maHangVe='H1';hanhKhach=(Khach-HQ)} 201
$maVe = ($kq.Than | ConvertFrom-Json).maVe
$null = Luot BMT04 'NV tra cứu vé' "/api/ve?maVe=$maVe" GET $nv $null 200
$null = Luot BMT04 'NV sửa vé' "/api/ve/$maVe/hanh-khach" PUT $nv (Khach-HQ) 204
$null = Luot BMT04 'NV hủy vé' "/api/ve/$maVe/huy" POST $nv @{} 204
$kq = Luot BMT05 'NV lập phiếu' '/api/phieu-dat' POST $nv @{maChuyenBay=$ma;maHangVe='H1';hanhKhach=(Khach-HQ)} 201
$maPhieu = ($kq.Than | ConvertFrom-Json).maPhieuDat
$null = Luot BMT05 'NV tra cứu phiếu' "/api/phieu-dat?maPhieuDat=$maPhieu" GET $nv $null 200
$null = Luot BMT05 'NV hủy phiếu' "/api/phieu-dat/$maPhieu/huy" POST $nv @{} 204
Ghi "Vé $maVe, phiếu $maPhieu"

# BMT06: tra cứu, xuất Excel, chèn SQL vào ô tra cứu
$veTruoc = [long](Sql-Dong 'SELECT COUNT_BIG(*) FROM VE;' | Select-Object -First 1)
$null = Luot BMT06 'NV tra cứu chuyến bay' "/api/chuyen-bay?maChuyenBay=$ma" GET $nv $null 200
$null = Luot BMT06 'NV xuất Excel' "/api/chuyen-bay/xuat-excel?maChuyenBay=$ma" GET $nv $null 200
$chen = @(
    @('/api/chuyen-bay?maChuyenBay=', "$ma' OR '1'='1"),
    @('/api/ve?soGiayTo=', "' OR 1=1 --"),
    @('/api/phieu-dat?maPhieuDat=', "'; DROP TABLE VE; --"),
    @('/api/ve?maVe=', "x' UNION SELECT TenDangNhap,MatKhau FROM TAIKHOAN --")
)
foreach ($c in $chen) {
    $kq = Luot BMT06 ("chèn SQL {0}{1}" -f $c[0],$c[1]) ($c[0] + [uri]::EscapeDataString($c[1])) GET $nv $null 200
    # gán trước rồi mới @(): PowerShell 5.1 trả mảng JSON rỗng thành một phần tử nếu lấy thẳng từ đường ống
    $ds = $kq.Than | ConvertFrom-Json
    Ghi "    số dòng trả về: $(@($ds).Count), thân phản hồi $($kq.Than.Length) ký tự"
}
$veSau = [long](Sql-Dong 'SELECT COUNT_BIG(*) FROM VE;' | Select-Object -First 1)
Ghi "Bảng VE trước/sau các chuỗi chèn SQL: $veTruoc / $veSau"

# BMT07: báo cáo
$null = Luot BMT07 'NV báo cáo tháng' "/api/bao-cao/thang?thang=6&nam=$nam" GET $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT07 'NV báo cáo năm' "/api/bao-cao/nam?nam=$nam" GET $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT07 'NV xuất PDF' "/api/bao-cao/thang/xuat?thang=6&nam=$nam&dinhDang=pdf" GET $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT07 'NV xuất Excel' "/api/bao-cao/nam/xuat?nam=$nam&dinhDang=excel" GET $nv $null 403 KHONG_CO_QUYEN

# BMT08: quy định, sân bay, hạng vé
$null = Luot BMT08 'NV đổi tham số' '/api/quy-dinh/tham-so/thoiGianBayToiThieu' PUT $nv @{giaTriMoi=25} 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV thêm sân bay' '/api/san-bay' POST $nv @{maSanBay='QQQ';tenSanBay='Sân bay thử'} 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV sửa sân bay' '/api/san-bay/SGN' PUT $nv @{tenSanBay='Tên sửa thử'} 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV xóa sân bay' '/api/san-bay/SGN' DELETE $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV thêm hạng vé' '/api/hang-ve' POST $nv @{maHangVe='H9';tenHangVe='Hạng thử';tiLeDonGia=90} 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV sửa hạng vé' '/api/hang-ve/H1' PUT $nv @{tenHangVe='Tên sửa thử'} 403 KHONG_CO_QUYEN
$null = Luot BMT08 'NV xóa hạng vé' '/api/hang-ve/H1' DELETE $nv $null 403 KHONG_CO_QUYEN
$kq = Luot BMT08 'NV đọc quy định' '/api/quy-dinh' GET $nv $null 200
$qd = $kq.Than | ConvertFrom-Json
Ghi ("Quy định đọc được: thời gian bay tối thiểu {0}, {1} sân bay, {2} hạng vé" -f $qd.thamSo.thoiGianBayToiThieu,@($qd.sanBay).Count,@($qd.hangVe).Count)
Ghi (Sql-Dong @"
SELECT CONCAT('CSDL|ThoiGianBayToiThieu ',ThoiGianBayToiThieu) FROM THAMSOQUYDINH;
SELECT CONCAT('CSDL|SANBAY ',COUNT(*),'|ten SGN ',MAX(CASE WHEN MaSanBay='SGN' THEN TenSanBay END)) FROM SANBAY;
SELECT CONCAT('CSDL|HANGVE ',COUNT(*),'|ten H1 ',MAX(CASE WHEN MaHangVe='H1' THEN TenHangVe END)) FROM HANGVE;
"@ | Out-String)

# BMT09: đếm, xóa phiếu đã hủy (mốc 01/01/2000 để lượt gọi không xóa dữ liệu nếu phân quyền hỏng)
$null = Luot BMT09 'NV đếm phiếu đã hủy' '/api/phieu-dat/da-huy/dem?truocNgay=2000-01-01' GET $nv $null 403 KHONG_CO_QUYEN
$null = Luot BMT09 'NV xóa phiếu đã hủy' '/api/phieu-dat/da-huy?truocNgay=2000-01-01' DELETE $nv $null 403 KHONG_CO_QUYEN

foreach ($s in $ql,$nv) { $null = Thu-HQ '/api/dang-xuat' POST $s }
TongKet-Luot
Write-Host $CsvHQ
