import fs from 'fs'
const s = fs.readFileSync('server/committees.test.js', 'utf8')
const i = s.indexOf("test('oral, driving")
const j = s.indexOf("test('all active members", i)
console.log('idx', i, 'next', j)
console.log(JSON.stringify(s.slice(j - 20, j + 40)))
const assign = s.indexOf("const committee = service.create(admin")
console.log('assign', assign)
