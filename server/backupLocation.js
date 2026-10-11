import os from 'node:os'
import path from 'node:path'
import { statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const folderName = 'النسخة الاحتياطية'
function readWindowsDesktop() {
  // Ask Windows for the current server account's desktop, including redirected desktops.
  const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); [Environment]::GetFolderPath('DesktopDirectory')"],
  { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^\uFEFF/, '').trim()
}
function directoryExists(value) { try { return statSync(value).isDirectory() } catch { return false } }

export function resolveBackupMirror({ platform = process.platform, home = os.homedir(), env = process.env,
  windowsDesktop = readWindowsDesktop, isDirectory = directoryExists } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const override = env.ARCHIVE_BACKUP_MIRROR_DIR?.trim()
  if (override) {
    if (!paths.isAbsolute(override)) throw new Error('ARCHIVE_BACKUP_MIRROR_DIR must be an absolute path')
    return paths.normalize(override)
  }
  if (platform === 'win32') {
    try {
      const desktop = windowsDesktop()
      if (desktop && paths.isAbsolute(desktop)) return paths.join(desktop, folderName)
    } catch { /* Fall back to directories belonging to the current account, never another machine's path. */ }
    const candidates = [paths.join(home, 'Desktop'), ...[env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial, paths.join(home, 'OneDrive')]
      .filter((root) => root && paths.isAbsolute(root)).map((root) => paths.join(root, 'Desktop'))]
    const desktop = candidates.find(isDirectory) || paths.join(home, 'Desktop')
    return paths.join(desktop, folderName)
  }
  return paths.join(home, 'Desktop', folderName)
}
