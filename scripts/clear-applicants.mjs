/**
 * تصفير تشغيلي كامل عبر ملف «تصفير بيانات المتقدمين»:
 * اختبارات + متقدمون + أرشيف + جلسات تقييم + ربط اللجان.
 * تبقى حسابات الدخول وبنك الأسئلة وهيكل اللجان.
 *
 * الاستخدام: node scripts/clear-applicants.mjs
 *           node scripts/clear-applicants.mjs --yes
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'clear-all.mjs')
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
