import { spawn } from 'node:child_process'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw Error('Il salvataggio della chiave richiede Windows.')
  const operation = decrypt
    ? '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)))'
    : '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)))'
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.Security; $v = [Console]::In.ReadToEnd(); ' + operation], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.on('error', () => reject(Error('Impossibile accedere alla chiave protetta di Windows.')))
    child.stdin.on('error', () => {})
    child.on('close', code => code === 0 ? resolve(output) : reject(Error('Impossibile accedere alla chiave protetta di Windows. Salvala nuovamente.')))
    child.stdin.end(value)
  })
}
export async function loadCredential(root) {
  let encrypted
  try { encrypted = await readFile(join(root, '.catalog-github.local'), 'utf8') } catch (e) { if (e.code === 'ENOENT') return ''; throw e }
  return protect(encrypted, true)
}
export async function saveCredential(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw Error('Inserisci un token GitHub valido.')
  await writeFile(join(root, '.catalog-github.local'), await protect(value.trim()), { mode: 0o600 })
}
export async function forgetCredential(root) {
  await unlink(join(root, '.catalog-github.local')).catch(e => { if (e.code !== 'ENOENT') throw e })
}
