param(
  [string]$PublicHost = '192.168.1.20',
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$CaddyExe = '',
  [switch]$InstallStartupTasks
)
$ErrorActionPreference = 'Stop'

if ($PublicHost -notmatch '^[A-Za-z0-9.-]+$') { throw 'PublicHost غير صالح' }
if (-not $CaddyExe) {
  $command = Get-Command caddy -ErrorAction SilentlyContinue
  if ($command) { $CaddyExe = $command.Source }
  else {
    $CaddyExe = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages') -Filter caddy.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $CaddyExe -or -not (Test-Path -LiteralPath $CaddyExe)) { throw 'ثبّت Caddy أولًا عبر winget install CaddyServer.Caddy' }

function New-SecureValue([int]$Bytes = 48) {
  $buffer = [byte[]]::new($Bytes)
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$envFile = Join-Path $ProjectRoot '.env.production'
$values = [ordered]@{}
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line.Trim() -and -not $line.Trim().StartsWith('#') -and $line.Contains('=')) {
      $at = $line.IndexOf('='); $values[$line.Substring(0,$at).Trim()] = $line.Substring($at+1).Trim().Trim('"').Trim("'")
    }
  }
}
$publicUrl = "https://$PublicHost"
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) {
  $desktop = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction SilentlyContinue).Desktop
  if ($desktop) { $desktop = [Environment]::ExpandEnvironmentVariables($desktop) }
}
if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }
$values['PORT'] = '3001'
$values['HOST'] = '127.0.0.1'
$values['APP_ORIGIN'] = $publicUrl
$values['PUBLIC_APP_URL'] = $publicUrl
$values['TRUST_PROXY'] = 'loopback'
if (-not $values['JWT_SECRET']) { $values['JWT_SECRET'] = New-SecureValue }
$values['SESSION_MAX_AGE_SECONDS'] = '2592000'
$values['EXAM_SECONDS_PER_QUESTION_THEORY'] = '60'
$values['EXAM_SECONDS_PER_QUESTION_ORAL'] = '300'
$values['EXAM_SECONDS_PER_QUESTION_DRIVING'] = '300'
$values['EXAM_SECONDS_PER_QUESTION_PERSONALITY'] = '90'
$values['ARCHIVE_BACKUP_DIR'] = Join-Path $ProjectRoot 'backups\archive'
$values['ARCHIVE_BACKUP_MIRROR_DIR'] = Join-Path $desktop 'النسخة الاحتياطية لمنصة الاختبارات'
if (-not $values['ARCHIVE_BACKUP_ENCRYPTION_KEY']) { $values['ARCHIVE_BACKUP_ENCRYPTION_KEY'] = New-SecureValue }
$values['ARCHIVE_BACKUP_INTERVAL_SECONDS'] = '300'
$values['ARCHIVE_BACKUP_RETENTION'] = '72'
$content = $values.GetEnumerator() | ForEach-Object { $_.Key + '="' + ($_.Value -replace '"','') + '"' }
[IO.File]::WriteAllLines($envFile, $content, [Text.UTF8Encoding]::new($false))

$deploy = Join-Path $ProjectRoot 'deploy'; New-Item -ItemType Directory -Path $deploy -Force | Out-Null
$caddyFile = Join-Path $deploy 'Caddyfile.lan'
$caddyConfig = @"
https://$PublicHost {
	tls internal
	encode zstd gzip
	reverse_proxy 127.0.0.1:3001
}
"@
[IO.File]::WriteAllText($caddyFile, $caddyConfig, [Text.UTF8Encoding]::new($false))

if (-not (Get-NetFirewallRule -DisplayName 'منصة الاختبارات HTTPS المحلية' -ErrorAction SilentlyContinue)) {
  try {
    New-NetFirewallRule -DisplayName 'منصة الاختبارات HTTPS المحلية' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
  } catch {
    throw 'تعذر إضافة قاعدة جدار الحماية. افتح PowerShell بالنقر على تشغيل كمسؤول ثم أعد تشغيل السكربت.'
  }
}

if ($InstallStartupTasks) {
  & (Join-Path $PSScriptRoot 'install-windows-service.ps1') -ProjectRoot $ProjectRoot -NoStart
  $arguments = 'run --config "' + $caddyFile + '" --adapter caddyfile'
  $action = New-ScheduledTaskAction -Execute $CaddyExe -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName 'ExamPlatformHttps' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
}

$rootCertificate = Join-Path $env:APPDATA 'Caddy\pki\authorities\local\root.crt'
$desktopCertificate = Join-Path $desktop 'شهادة منصة الاختبارات المحلية.crt'
if (Test-Path -LiteralPath $rootCertificate) {
  Copy-Item -LiteralPath $rootCertificate -Destination $desktopCertificate -Force
}

[pscustomobject]@{
  PublicUrl = $publicUrl
  EnvironmentFile = $envFile
  CaddyFile = $caddyFile
  CaddyExecutable = $CaddyExe
  ClientRootCertificate = $rootCertificate
  DesktopCertificate = if (Test-Path -LiteralPath $desktopCertificate) { $desktopCertificate } else { 'يظهر بعد أول تشغيل لـ Caddy' }
  StartupTasksInstalled = [bool]$InstallStartupTasks
}
