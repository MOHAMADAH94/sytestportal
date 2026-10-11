param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$TaskName = 'ExamPlatform',
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'

function Resolve-PlatformNode {
  $candidates = @()
  $toolsNode = Join-Path $ProjectRoot 'tools\node\node.exe'
  if (Test-Path -LiteralPath $toolsNode) { $candidates += $toolsNode }

  $pathNode = Get-Command node -ErrorAction SilentlyContinue
  if ($pathNode) { $candidates += $pathNode.Source }

  $programFilesNode = Join-Path ${env:ProgramFiles} 'nodejs\node.exe'
  if (Test-Path -LiteralPath $programFilesNode) { $candidates += $programFilesNode }

  $portableRoot = Join-Path $env:LOCALAPPDATA 'nodejs-portable'
  if (Test-Path -LiteralPath $portableRoot) {
    Get-ChildItem -LiteralPath $portableRoot -Directory -Filter 'node-v*' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { $candidates += (Join-Path $_.FullName 'node.exe') }
  }

  foreach ($nodeExe in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $nodeExe)) { continue }
    $version = & $nodeExe -v 2>$null
    if ($version -match '^v(\d+)\.') {
      if ([int]$Matches[1] -lt 22) { continue }
      $nodeDir = Split-Path -Parent $nodeExe
      $npmCmd = Join-Path $nodeDir 'npm.cmd'
      if (-not (Test-Path -LiteralPath $npmCmd)) { continue }
      return [pscustomobject]@{ Node = $nodeExe; Npm = $npmCmd; Version = $version }
    }
  }
  throw 'Node.js 22+ was not found. Install Node.js LTS from https://nodejs.org/'
}

$platformNode = Resolve-PlatformNode
$action = New-ScheduledTaskAction -Execute $platformNode.Npm -Argument 'start' -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
if (-not $NoStart) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Installed and started $TaskName using $($platformNode.Version)"
} else {
  Write-Host "Installed $TaskName with $($platformNode.Version); it will start with Windows"
}
