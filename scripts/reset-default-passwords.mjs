import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const dbPath = path.resolve('server/data/exams.db')
const db = new Database(dbPath)

const credentials = {
  admins: {
    admin: 'admin123',
    commander: 'commander123',
  },
  access_accounts: {
    theory: 'theory123',
    theory2: 'theory123',
    office: 'office123',
    oral_tech: 'oral123',
    oral_prog: 'oral123',
    oral_net: 'oral123',
    driving: 'driving123',
    personality: 'person123',
    military_security: 'security123',
  },
  committee_accounts: {
    committee_manager: 'committee123',
  },
}

console.log('جارٍ ضبط كلمات المرور الافتراضية الموثقة...')

db.transaction(() => {
  for (const [user, pass] of Object.entries(credentials.admins)) {
    const hash = bcrypt.hashSync(pass, 12)
    const row = db.prepare('SELECT id FROM admins WHERE username=?').get(user)
    if (row) {
      db.prepare('UPDATE admins SET password_hash=?, must_rotate_password=0, auth_version=auth_version+1 WHERE id=?').run(hash, row.id)
      console.log(`✓ تم ضبط حساب الإدارة [${user}]: ${pass}`)
    }
  }

  for (const [user, pass] of Object.entries(credentials.access_accounts)) {
    const hash = bcrypt.hashSync(pass, 12)
    const row = db.prepare('SELECT id FROM access_accounts WHERE username=?').get(user)
    if (row) {
      db.prepare('UPDATE access_accounts SET password_hash=?, must_rotate_password=0, auth_version=auth_version+1 WHERE id=?').run(hash, row.id)
      console.log(`✓ تم ضبط حساب التخصص [${user}]: ${pass}`)
    }
  }

  for (const [user, pass] of Object.entries(credentials.committee_accounts)) {
    const hash = bcrypt.hashSync(pass, 10)
    let row = db.prepare('SELECT id FROM committee_accounts WHERE username=?').get(user)
    if (!row) {
      const committeeId = randomUUID()
      db.prepare('INSERT INTO committees(id, name) VALUES (?, ?)').run(committeeId, 'لجنة التقييم')
      const id = randomUUID()
      db.prepare('INSERT INTO committee_accounts(id, committee_id, name, username, password_hash, role, weight_bp) VALUES (?, ?, ?, ?, ?, ?, 10000)')
        .run(id, committeeId, 'مدير اللجنة', user, hash, 'committee_manager')
      console.log(`✓ تم إنشاء حساب اللجنة [${user}]: ${pass}`)
    } else {
      db.prepare('UPDATE committee_accounts SET password_hash=?, auth_version=auth_version+1 WHERE id=?').run(hash, row.id)
      console.log(`✓ تم ضبط حساب اللجنة [${user}]: ${pass}`)
    }
  }
})()

console.log('\nاكتمل ضبط جميع كلمات المرور بنجاح.')
db.close()
