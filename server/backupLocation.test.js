import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBackupMirror } from './backupLocation.js'

const defaults = { platform:'win32', home:'C:\\Users\\new-user', env:{}, windowsDesktop:() => '', isDirectory:() => false }
test('new installations resolve the current Windows desktop without any config file', () => {
  for (const desktop of ['C:\\Users\\new-user\\Desktop', 'D:\\Accounts\\مستخدم جديد\\سطح المكتب', 'C:\\Users\\someone-else\\OneDrive\\Desktop']) {
    assert.equal(resolveBackupMirror({ ...defaults, windowsDesktop:() => desktop }), desktop + '\\النسخة الاحتياطية')
  }
})
test('redirected Windows desktop is authoritative even before its backup folder exists', () => {
  assert.equal(resolveBackupMirror({ ...defaults, windowsDesktop:() => 'D:\\RedirectedDesktop', isDirectory:() => false }), 'D:\\RedirectedDesktop\\النسخة الاحتياطية')
})
test('unavailable Windows API falls back to this account OneDrive desktop when it exists', () => {
  assert.equal(resolveBackupMirror({ ...defaults, env:{ OneDrive:'E:\\Cloud\\CurrentUser' }, windowsDesktop:() => { throw new Error('unavailable') }, isDirectory:(p) => p === 'E:\\Cloud\\CurrentUser\\Desktop' }), 'E:\\Cloud\\CurrentUser\\Desktop\\النسخة الاحتياطية')
})
test('missing directories use a creatable path under the new user instead of an old hardcoded profile', () => {
  assert.equal(resolveBackupMirror(defaults), 'C:\\Users\\new-user\\Desktop\\النسخة الاحتياطية')
  assert.equal(resolveBackupMirror({ ...defaults, platform:'darwin', home:'/Users/new-user' }), '/Users/new-user/Desktop/النسخة الاحتياطية')
})
test('explicit installation override is optional and must be absolute', () => {
  assert.equal(resolveBackupMirror({ ...defaults, env:{ ARCHIVE_BACKUP_MIRROR_DIR:'F:\\Backups' }, windowsDesktop:() => { throw new Error('should not run') } }), 'F:\\Backups')
  assert.throws(() => resolveBackupMirror({ ...defaults, env:{ ARCHIVE_BACKUP_MIRROR_DIR:'relative' } }), /absolute/)
})
