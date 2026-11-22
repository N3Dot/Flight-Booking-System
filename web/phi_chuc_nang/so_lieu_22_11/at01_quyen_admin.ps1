# AT01: thu dung muc 6.1.6 o quyen Administrator, tren QLBANVE_HQ; ghi ket qua ra ket_qua.txt
$ErrorActionPreference = 'Stop'
$kq = Join-Path $PSScriptRoot 'ket_qua.txt'
function Ghi($s) { $d = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $s"; Add-Content -LiteralPath $kq -Value $d -Encoding UTF8; Write-Host $d }
$ten = 'Sao luu QLBANVE_HQ'
try {
  $laAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  Remove-Item -LiteralPath $kq -ErrorAction SilentlyContinue; Ghi "Quyen Administrator: $laAdmin; tai khoan: $env:USERDOMAIN\$env:USERNAME"
  # Buoc 1
  New-Item -ItemType Directory -Force D:\SaoLuu | Out-Null
  icacls D:\SaoLuu /grant "NT SERVICE\MSSQL`$SQLEXPRESS:(OI)(CI)M" | Out-Null
  Ghi "Buoc 1: tao D:\SaoLuu, cap quyen ghi cho NT SERVICE\MSSQL`$SQLEXPRESS"
  # Buoc 2
  @'
$ngay = Get-Date -Format "yyyyMMdd"
$tep = "D:\SaoLuu\QLBANVE_HQ_$ngay.bak"
$lenh = "BACKUP DATABASE QLBANVE_HQ TO DISK = N'$tep' WITH INIT, CHECKSUM"
sqlcmd -S localhost\SQLEXPRESS -E -C -b -Q $lenh
Get-ChildItem D:\SaoLuu\QLBANVE_HQ_*.bak |
Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
Remove-Item
'@ | Set-Content -LiteralPath D:\SaoLuu\sao_luu.ps1 -Encoding UTF8
  Ghi "Buoc 2: tao D:\SaoLuu\sao_luu.ps1"
  # Buoc 3 (dung lenh cua muc 6.1.6)
  $hanhDong = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File D:\SaoLuu\sao_luu.ps1"
  $lich = New-ScheduledTaskTrigger -Daily -At 22:00
  # tai khoan khong co mat khau: dung S4U (chay ca khi khong dang nhap, khong luu mat khau)
  $nguoi = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
  Register-ScheduledTask -TaskName $ten -Action $hanhDong -Trigger $lich -Principal $nguoi | Out-Null
  $t = Get-ScheduledTask -TaskName $ten
  Ghi "Buoc 3: dang ky '$ten': LogonType=$($t.Principal.LogonType), RunLevel=$($t.Principal.RunLevel), lich=$($t.Triggers[0].StartBoundary) hang ngay"
  # Buoc 4: chay thu bang Start-ScheduledTask
  $bd = Get-Date; Start-ScheduledTask -TaskName $ten
  do { Start-Sleep 1 } while ((Get-ScheduledTask -TaskName $ten).State -eq 'Running' -and ((Get-Date) - $bd).TotalMinutes -lt 10)
  Start-Sleep 2; $i = Get-ScheduledTaskInfo -TaskName $ten
  $tep = "D:\SaoLuu\QLBANVE_HQ_$(Get-Date -Format yyyyMMdd).bak"
  Ghi ("Buoc 4: Start-ScheduledTask xong sau {0:N1} giay, LastTaskResult={1}, tep {2} co: {3}, kich thuoc {4:N0} byte" -f ((Get-Date)-$bd).TotalSeconds, $i.LastTaskResult, $tep, (Test-Path $tep), (Get-Item $tep -ErrorAction SilentlyContinue).Length)
  $v = sqlcmd -S localhost\SQLEXPRESS -E -C -b -Q "RESTORE VERIFYONLY FROM DISK = N'$tep'" 2>&1 | Out-String
  Ghi "RESTORE VERIFYONLY (ma $LASTEXITCODE): $($v.Trim())"
  # Thu tac vu TU CHAY theo lich (khong bam Start): tam dat lich mot lan sau 2 phut
  $lanTruoc = $i.LastRunTime; $moc = (Get-Date).AddMinutes(2)
  Set-ScheduledTask -TaskName $ten -Trigger (New-ScheduledTaskTrigger -Once -At $moc) | Out-Null
  Ghi "Tu chay: tam dat lich mot lan luc $($moc.ToString('HH:mm:ss')), cho toi da 5 phut"
  $den = (Get-Date).AddMinutes(5)
  do { Start-Sleep 5; $i = Get-ScheduledTaskInfo -TaskName $ten } while (($i.LastRunTime -eq $lanTruoc -or (Get-ScheduledTask -TaskName $ten).State -eq 'Running') -and (Get-Date) -lt $den)
  Ghi ("Tu chay: LastRunTime={0:HH:mm:ss}, LastTaskResult={1}, tep cap nhat luc {2:HH:mm:ss}" -f $i.LastRunTime, $i.LastTaskResult, (Get-Item $tep).LastWriteTime)
} catch { Ghi "LOI: $($_.Exception.Message)" }
finally {
  # Don dep: xoa tac vu, tep sao luu, thu muc thu
  if (Get-ScheduledTask -TaskName $ten -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $ten -Confirm:$false }
  Remove-Item -Recurse -Force D:\SaoLuu -ErrorAction SilentlyContinue
  Ghi "Don dep: xoa tac vu '$ten' va thu muc D:\SaoLuu (con tac vu: $([bool](Get-ScheduledTask -TaskName $ten -ErrorAction SilentlyContinue)), con thu muc: $(Test-Path D:\SaoLuu))"
  Ghi 'XONG'
  Start-Sleep 5
}
