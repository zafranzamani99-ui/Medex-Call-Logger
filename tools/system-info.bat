@echo off
title System Info
color 0B
echo.
echo   System Info - Scanning...
echo.

:: Self-extracting: PS1 is embedded below EXIT /B
:: PowerShell reads this .bat, grabs everything after the marker, runs it
set "tmpps=%TEMP%\medex-sysinfo.ps1"
powershell -ExecutionPolicy Bypass -Command "$lines = Get-Content -LiteralPath '%~f0'; $start = 0; for ($i=0; $i -lt $lines.Count; $i++) { if ($lines[$i] -eq ':: __PS1__') { $start = $i + 1; break } }; if ($start -gt 0) { $lines[$start..($lines.Count-1)] | Set-Content -LiteralPath '%tmpps%' -Encoding UTF8; & '%tmpps%'; Remove-Item -LiteralPath '%tmpps%' -ErrorAction SilentlyContinue }"
echo.
pause
exit /b

:: __PS1__
$pcName = $env:COMPUTERNAME
$cpu = (Get-CimInstance Win32_Processor).Name -replace '\s+', ' '
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)

$diskInfo = @{}
foreach ($letter in 'C','D') {
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($letter):'"
  if ($drive) {
    $free = [math]::Round($drive.FreeSpace / 1GB)
    $total = [math]::Round($drive.Size / 1GB)
    $diskType = '?'
    try {
      $part = Get-Partition -DriveLetter $letter -ErrorAction Stop
      $phys = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq (Get-Disk -Number $part.DiskNumber).Number }
      if ($phys.MediaType -eq 'SSD') { $diskType = 'SSD' }
      elseif ($phys.MediaType -match 'HDD|Hard') { $diskType = 'HDD' }
      else { $diskType = "$($phys.MediaType)" }
    } catch {}
    $diskInfo[$letter] = "${free}GB free / ${total}GB ($diskType)"
  }
}

$dbLine = ''
$dbPath = 'C:\MDO_DB\DB\MDODB.FDB'
if (Test-Path $dbPath) {
  $f = Get-Item $dbPath
  $mb = [math]::Round($f.Length / 1MB)
  if ($mb -ge 1000) {
    $gb = [math]::Round($f.Length / 1GB, 2)
    $dbLine = "$gb GB"
  } else {
    $kb = '{0:N0}' -f ($f.Length / 1KB)
    $dbLine = "$kb KB ($mb MB)"
  }
}

$uvId = ''
try {
  $uvPaths = @(
    'C:\Program Files\UltraViewer\ConnectionString.ini',
    'C:\Program Files (x86)\UltraViewer\ConnectionString.ini',
    (Join-Path $env:APPDATA 'UltraViewer\ConnectionString.ini')
  )
  foreach ($p in $uvPaths) {
    if (Test-Path $p) {
      $content = Get-Content $p -Raw
      $m = [regex]::Match($content, '(?:ID|ThisID)[=:]\s*(\d[\d\s]+\d)')
      if ($m.Success) { $uvId = $m.Groups[1].Value.Trim(); break }
    }
  }
  if (-not $uvId) {
    $regPaths = @('HKLM:\SOFTWARE\UltraViewer', 'HKLM:\SOFTWARE\WOW6432Node\UltraViewer', 'HKCU:\SOFTWARE\UltraViewer')
    foreach ($rp in $regPaths) {
      if (Test-Path $rp) {
        $val = Get-ItemProperty -Path $rp -ErrorAction SilentlyContinue
        if ($val.ID) { $uvId = "$($val.ID)"; break }
        if ($val.ClientID) { $uvId = "$($val.ClientID)"; break }
      }
    }
  }
} catch {}

$adId = ''
try {
  $adPaths = @(
    (Join-Path $env:PROGRAMDATA 'AnyDesk\system.conf'),
    (Join-Path $env:APPDATA 'AnyDesk\system.conf')
  )
  foreach ($p in $adPaths) {
    if (Test-Path $p) {
      $lines = Get-Content $p
      foreach ($line in $lines) {
        if ($line -match 'ad\.anynet\.id\s*=\s*(\d+)') {
          $adId = $matches[1]; break
        }
      }
      if ($adId) { break }
    }
  }
} catch {}

$backupStatus = 'Not found'
$backupLatest = ''
try {
  $allDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 -or $_.DriveType -eq 2 }
  foreach ($drv in $allDrives) {
    $bkDir = Join-Path $drv.DeviceID '\BACKUP'
    if (Test-Path $bkDir) {
      $latest = Get-ChildItem $bkDir -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($latest) {
        $age = (Get-Date) - $latest.LastWriteTime
        $dateStr = $latest.LastWriteTime.ToString('dd/MM/yyyy HH:mm')
        $backupLatest = "$($latest.Name) - $dateStr"
        if ($age.TotalDays -le 30) { $backupStatus = 'OK' }
        else { $backupStatus = "OLD ($([math]::Round($age.TotalDays)) days ago)" }
        break
      } else {
        $backupStatus = "Folder empty ($bkDir)"
      }
    }
  }
} catch {}

$extHdd = 'No'
try {
  $removable = Get-CimInstance Win32_LogicalDisk | Where-Object {
    ($_.DriveType -eq 2 -or $_.DriveType -eq 3) -and $_.DeviceID -notmatch '[CD]:'
  }
  if ($removable) {
    $letters = ($removable | ForEach-Object { $_.DeviceID }) -join ', '
    $extHdd = "Yes ($letters)"
  }
} catch {}

Write-Host ''
Write-Host '=== SYSTEM INFO ===' -ForegroundColor Cyan
Write-Host "PC Name: $pcName"
Write-Host "Processor: $cpu"
Write-Host "RAM: ${ramGB}GB"
Write-Host ''
Write-Host '=== DISK ===' -ForegroundColor Cyan
if ($diskInfo['C']) { Write-Host "C: $($diskInfo['C'])" }
if ($diskInfo['D']) { Write-Host "D: $($diskInfo['D'])" }
else { Write-Host 'Only have C disk' }
Write-Host ''
Write-Host '=== DATABASE ===' -ForegroundColor Cyan
if ($dbLine) { Write-Host "DB Size: $dbLine" }
else { Write-Host 'MDODB.FDB not found' -ForegroundColor Yellow }
Write-Host ''
Write-Host '=== REMOTE ACCESS ===' -ForegroundColor Cyan
if ($uvId) { Write-Host "UltraViewer: $uvId" }
else { Write-Host 'UltraViewer: Not found' -ForegroundColor Yellow }
if ($adId) { Write-Host "AnyDesk: $adId" }
else { Write-Host 'AnyDesk: Not found' -ForegroundColor Yellow }
Write-Host ''
Write-Host '=== BACKUP ===' -ForegroundColor Cyan
Write-Host "Backup: $backupStatus"
if ($backupLatest) { Write-Host "Latest: $backupLatest" }
Write-Host "Ext HDD: $extHdd"
Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  INFO COPIED - PASTE TO WORK PANEL' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''

$output = @()
$output += "PC Name: $pcName"
$output += "Processor: $cpu"
$output += "RAM: ${ramGB}GB"
if ($diskInfo['C']) { $output += "C: $($diskInfo['C'])" }
if ($diskInfo['D']) { $output += "D: $($diskInfo['D'])" }
else { $output += 'Only have C disk' }
if ($dbLine) { $output += "DB Size: $dbLine" }
if ($uvId) { $output += "UltraViewer: $uvId" }
if ($adId) { $output += "AnyDesk: $adId" }
$output += "Backup: $backupStatus"
if ($backupLatest) { $output += "Latest Backup: $backupLatest" }
$output += "Ext HDD: $extHdd"

$block = $output -join "`n"
Write-Host $block
Write-Host ''
$block | Set-Clipboard
Write-Host 'Info already copied. Please paste to Work Panel notes (Ctrl+V).' -ForegroundColor Green
