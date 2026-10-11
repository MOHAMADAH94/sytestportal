import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = path.join(root, 'dist', 'index.html')
let html = fs.readFileSync(indexPath, 'utf8')
html = html.replace(/\s+type="module"/g, '')
html = html.replace(/\s+crossorigin(?=[\s>])/g, '')
html = html.replace(/<script src=/g, '<script defer src=')
fs.writeFileSync(indexPath, html)
