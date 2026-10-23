import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, join, extname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { validateCollection } from '../src/collection.js'
import { publishCatalog } from './publish.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const revisionOf = (products, relations) => createHash('sha256').update(JSON.stringify([products, relations])).digest('hex')
async function readCollection(root) {
  const [products, relations] = await Promise.all(['games', 'relations'].map(name => readFile(join(root, 'public', `${name}.json`), 'utf8').then(JSON.parse)))
  validateCollection(products, relations)
  return { products, relations, revision: revisionOf(products, relations) }
}
function validateInput(products, relations) {
  validateCollection(products, relations)
  for (const p of products) {
    if (typeof p.name !== 'string' || !p.name.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) throw Error('Nome o ID del prodotto non valido.')
    if (p.description != null && typeof p.description !== 'string') throw Error('Descrizione non valida.')
    if (p.image && !/^(https?:\/\/|images\/[^\\]*$)/i.test(p.image)) throw Error('Percorso immagine non valido.')
  }
}
async function body(req, limit = 24 * 1024 * 1024) {
  let size = 0; const chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Error('File troppo grande (massimo 15 MB per file).'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function replaceStagedFile(staged, target, move = rename) {
  try { await move(staged, target) } catch (error) {
    if (!['EPERM','EACCES','EBUSY'].includes(error.code)) throw error
    // Windows may allow writing an existing file while denying its replacement.
    // The caller has already backed up both JSON files and rolls both back on error.
    await writeFile(target, await readFile(staged))
    await unlink(staged).catch(() => {})
  }
}
export function createEditorServer({ root = projectRoot, publish = publishCatalog, sessionToken } = {}) {
  const token = sessionToken || randomUUID()
  let queue = Promise.resolve()
  let publishing = false
  const server = createServer(async (req, res) => {
    const reply = (status, data, type = 'application/json') => { res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); res.end(type === 'application/json' ? JSON.stringify(data) : data) }
    try {
      const origin = `http://127.0.0.1:${server.address().port}`
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { error: 'Accesso consentito solo dal gestore locale.' })
      const url = new URL(req.url, origin)
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-editor-token'] !== token) return reply(403, { error: 'Sessione non valida. Ricarica il gestore.' })
        if (req.method === 'GET' && url.pathname === '/api/collection') return reply(200, await readCollection(root))
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return reply(405, { error: 'Richiesta non supportata.' })
        const input = await body(req)
        if (url.pathname === '/api/upload') {
          const bytes = Buffer.from(input.data || '', 'base64')
          if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw Error('Carica un file fino a 15 MB.')
          let extension
          if (input.kind === 'manual' && bytes.subarray(0,5).toString() === '%PDF-') extension = 'pdf'
          if (input.kind === 'image') {
            if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg'
            if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension = 'png'
            if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') extension = 'webp'
          }
          if (!extension) throw Error('Formato non valido: usa JPG, PNG, WebP per copertine o PDF per manuali.')
          const folder = input.kind === 'manual' ? 'manuals' : 'images'
          const path = `${folder}/${randomUUID()}.${extension}`
          await mkdir(join(root, 'public', folder), { recursive: true })
          await writeFile(join(root, 'public', path), bytes, { flag: 'wx' })
          return reply(200, { path })
        }
        if (url.pathname === '/api/save') {
          const save = async () => {
            const current = await readCollection(root)
            if (current.revision !== input.revision) { const error = Error('Il catalogo è cambiato in un’altra finestra. Ricarica prima di salvare.'); error.status = 409; throw error }
            validateInput(input.products, input.relations)
            const backup = join(root, '.catalog-backups', `${Date.now()}-${randomUUID()}`)
            await mkdir(backup, { recursive: true })
            await Promise.all(['games', 'relations'].map(name => writeFile(join(backup, `${name}.json`), JSON.stringify(name === 'games' ? current.products : current.relations, null, 2))))
            const gamesPath = join(root, 'public', 'games.json'); const relationsPath = join(root, 'public', 'relations.json')
            const suffix = `.${randomUUID()}.tmp`
            await writeFile(gamesPath + suffix, JSON.stringify(input.products, null, 2) + '\n')
            await writeFile(relationsPath + suffix, JSON.stringify(input.relations, null, 2) + '\n')
            try { await replaceStagedFile(gamesPath + suffix, gamesPath); await replaceStagedFile(relationsPath + suffix, relationsPath) }
            catch (e) { await writeFile(gamesPath, JSON.stringify(current.products, null, 2) + '\n'); await writeFile(relationsPath, JSON.stringify(current.relations, null, 2) + '\n'); throw e }
            return { revision: revisionOf(input.products, input.relations), message: 'Catalogo salvato sul PC. Copia di sicurezza creata.' }
          }
          const pending = queue.then(save); queue = pending.catch(() => {})
          return reply(200, await pending)
        }
        if (url.pathname === '/api/publish') {
          if (publishing) return reply(409, { error: 'Pubblicazione già in corso.' })
          publishing = true
          try { return reply(200, await publish({ root, ...input })) } finally { publishing = false }
        }
        return reply(404, { error: 'Operazione non trovata.' })
      }
      if (req.method !== 'GET') return reply(405, { error: 'Metodo non consentito.' })
      if (url.pathname === '/' || url.pathname === '/gestisci') {
        const html = await readFile(join(projectRoot, 'local-editor', 'index.html'), 'utf8')
        return reply(200, html.replace('__SESSION_TOKEN__', token), 'text/html')
      }
      const editorFile = { '/editor.js': ['editor.js','text/javascript'], '/editor.css': ['editor.css','text/css'] }[url.pathname]
      if (editorFile) return reply(200, await readFile(join(projectRoot, 'local-editor', editorFile[0]), 'utf8'), editorFile[1])
      if (/^\/(images|manuals)\/[a-zA-Z0-9._-]+$/.test(url.pathname)) {
        const file = await readFile(join(root, 'public', url.pathname.slice(1)))
        const mime = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf' }[extname(url.pathname)]
        if (!mime) return reply(404, { error: 'File non supportato.' })
        res.writeHead(200, { 'Content-Type':mime, 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox" }); return res.end(file)
      }
      reply(404, { error: 'Pagina non trovata.' })
    } catch (error) { reply(error.status || (error.code === 'ENOENT' ? 404 : 400), { error: error.message }) }
  })
  return server
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const openBrowser = () => {
    if (!process.argv.includes('--open')) return
    const command = process.platform === 'win32' ? ['powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4317'"]] : process.platform === 'darwin' ? ['open',['http://127.0.0.1:4317']] : ['xdg-open',['http://127.0.0.1:4317']]
    const child = spawn(command[0],command[1],{windowsHide:true,stdio:'ignore',detached:true});child.on('error',()=>{});child.unref()
  }
  let sessionToken
  const restartFile = join(projectRoot, '.catalog-session.local')
  try { sessionToken = (await readFile(restartFile,'utf8')).trim(); await unlink(restartFile) } catch (error) { if(error.code !== 'ENOENT') throw error }
  const server = createEditorServer({sessionToken})
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Il gestore è già aperto: visita http://127.0.0.1:4317' : e.message); if(e.code === 'EADDRINUSE') openBrowser(); process.exitCode = 1 })
  server.listen(4317, '127.0.0.1', () => { console.log('Gestisci collezione: http://127.0.0.1:4317\nLascia questa finestra aperta. Ctrl+C per chiudere.'); openBrowser() })
}
