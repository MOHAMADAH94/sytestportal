import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

async function hidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('شغّل الأمر من طرفية تفاعلية')
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  return await new Promise((resolve, reject) => {
    let value = ''
    const done = (error) => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.off('data', onData)
      process.stdout.write('\n')
      if (error) reject(error); else resolve(value)
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') return done(new Error('أُلغي الأمر'))
        if (char === '\r' || char === '\n') return done()
        if (char === '\u007f' || char === '\b') {
          if (value) { value = value.slice(0, -1); process.stdout.write('\b \b') }
        } else { value += char; process.stdout.write('*') }
      }
    }
    process.stdin.on('data', onData)
  })
}

const password = await hidden('كلمة مرور admin الجديدة: ')
const confirmation = await hidden('أعد كتابة كلمة المرور: ')
if (password !== confirmation) throw new Error('كلمتا المرور غير متطابقتين')
if (password.length < 14 || Buffer.byteLength(password) > 72 || !/[A-Z]/i.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  throw new Error('يجب أن تكون كلمة المرور من 14 إلى 72 بايت وتحتوي حرفًا ورقمًا ورمزًا')
}

const databasePath = path.join(process.env.EXAM_DATA_DIR || path.resolve('server/data'), 'exams.db')
const db = new Database(databasePath)
try {
  const account = db.prepare("SELECT * FROM admins WHERE username='admin'").get()
  if (!account) throw new Error('حساب admin غير موجود')
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='password_change_log'").get()) throw new Error('شغّل المشروع مرة واحدة لتطبيق ترحيلات قاعدة البيانات')
  const hash = await bcrypt.hash(password, 12)
  db.transaction(() => {
    db.prepare('UPDATE admins SET password_hash=?,must_rotate_password=0,auth_version=auth_version+1 WHERE id=?').run(hash, account.id)
    db.prepare(`INSERT INTO password_change_log
      (id,target_type,target_id,target_username,actor_type,actor_id,actor_username,action,reason,request_id,changed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), 'staff', String(account.id), 'admin', 'developer', null, 'developer', 'developer_reset', 'تغيير محلي من الجهاز المضيف', null, new Date().toISOString())
  })()
  console.log('تم تغيير كلمة مرور admin وإلغاء جلساته السابقة وتسجيل العملية.')
} finally { db.close() }
