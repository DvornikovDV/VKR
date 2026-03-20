import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientRoot = path.resolve(__dirname, '..', '..')

const hostedStylesPath = path.join(clientRoot, 'dist', 'constructor', 'styles.css')

if (!existsSync(hostedStylesPath)) {
  throw new Error(`Missing hosted constructor asset: ${hostedStylesPath}`)
}

const hostedStyles = readFileSync(hostedStylesPath, 'utf8')
if (!hostedStyles.includes('.toolbar-header')) {
  throw new Error('Hosted constructor styles asset does not contain expected toolbar styles.')
}

console.log('Hosted constructor assets are packaged under dist/constructor.')
