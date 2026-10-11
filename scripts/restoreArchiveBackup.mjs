import path from 'node:path'
import { restoreBackup } from '../server/archiveBackups.js'

const [source, target] = process.argv.slice(2)
if (!source || !target) throw new Error('Usage: node scripts/restoreArchiveBackup.mjs <backup.db> <new-recovered.db> (never overwrites a file)')
await restoreBackup(path.resolve(source), path.resolve(target))
console.log('Verified database recovered to: ' + path.resolve(target))
