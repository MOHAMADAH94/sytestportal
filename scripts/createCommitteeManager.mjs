import { randomBytes } from 'node:crypto'
import { db } from '../server/db.js'
import { createCommitteeService } from '../server/committees.js'

const service = createCommitteeService(db)
const username = 'committee_manager'
try {
  const existing = db.prepare('SELECT id FROM committee_accounts WHERE username=?').get(username)
  if (existing) {
    console.log('حساب مدير اللجنة موجود بالفعل؛ لم يتم تغيير كلمة مروره.')
  } else {
    const password = randomBytes(15).toString('base64url')
    service.create({ role: 'admin', username: 'local-setup' }, {
      name: 'لجنة التقييم', managerName: 'مدير اللجنة', username, password,
    })
    console.log(JSON.stringify({ username, password, message: 'احفظ كلمة المرور؛ لا تحفظ كنص صريح في قاعدة البيانات.' }))
  }
} finally { db.close() }
