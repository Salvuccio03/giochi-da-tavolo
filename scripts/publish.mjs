import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { validateCollection } from '../src/collection.js'

export async function publishCatalog({ root, repository, githubToken, revision, request = fetch }) {
  const match = /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repository || '')
  if (!match || !githubToken || !revision) throw Error('Inserisci il link del repository e il token GitHub nel gestore locale.')
  const [, owner, name] = match; const repo = `${owner}/${name}`
  const api = async (path, method = 'GET', body) => {
    const response = await request(`https://api.github.com${path}`, { method, headers: { Authorization:`Bearer ${githubToken}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}), signal:AbortSignal.timeout(60000) })
    const result = response.status === 204 ? {} : await response.json()
    if (!response.ok) { const error = Error(response.status === 401 ? 'Token GitHub non valido o scaduto.' : response.status === 403 || response.status === 404 ? 'Repository o permessi GitHub insufficienti. Controlla Contents, Workflows e Pages in lettura e scrittura.' : `GitHub: ${result.message || response.status}`); error.message += ` (${method} ${path}, HTTP ${response.status})`; error.status = response.status; throw error }
    return result
  }
  const [products, relations] = await Promise.all(['games','relations'].map(file => readFile(join(root,'public',`${file}.json`),'utf8').then(JSON.parse)))
  validateCollection(products, relations)
  const actualRevision = createHash('sha256').update(JSON.stringify([products, relations])).digest('hex')
  if (actualRevision !== revision) throw Error('Il catalogo è cambiato. Salva nuovamente prima di pubblicare.')
  const metadata = await api(`/repos/${repo}`)
  if (metadata.private) throw Error('Per questo flusso gratuito seleziona un repository pubblico.')
  const branch = metadata.default_branch
  if (!branch) throw Error('Inizializza il repository su GitHub spuntando Add a README file.')
  const ref = await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
  const head = ref.object.sha
  let prior
  try { prior = JSON.parse(await readFile(join(root,'.catalog-publish.json'),'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (prior?.repository === repo && prior.sha !== head) throw Error('Il repository è stato modificato online dopo l’ultima pubblicazione. Sincronizza le modifiche prima di riprovare; nessun file remoto è stato sovrascritto.')
  const commit = await api(`/repos/${repo}/git/commits/${head}`)
  const tree = await api(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`)
  if (tree.truncated) throw Error('Repository troppo grande per questo gestore.')
  if (prior?.repository !== repo && tree.tree.some(f => f.type === 'blob' && !['README.md','.gitignore','LICENSE'].includes(f.path))) throw Error('Per il primo collegamento usa un repository dedicato vuoto, inizializzato soltanto con README. Non sovrascrivo un progetto esistente.')
  const referencedFiles = new Set(products.flatMap(p => [p.image, ...(p.manuals || []).map(m => m.url)]).filter(path => path && !/^https?:/i.test(path)).map(path => 'public/' + path.replace(/^\/+/,'')))
  const files = []
  const directories = ['src','public','tests','examples','scripts','local-editor','.github/workflows']
  const collect = async (dir) => {
    for (const entry of await readdir(join(root,dir),{withFileTypes:true})) {
      const path = `${dir}/${entry.name}`
      if (entry.isSymbolicLink()) throw Error('Collegamento simbolico non supportato nella pubblicazione.')
      if (entry.isDirectory()) await collect(path)
      else if (entry.isFile() && !entry.name.endsWith('.tmp') && (!/^public\/(images|manuals)\//.test(path) || referencedFiles.has(path))) files.push(path)
    }
  }
  for (const dir of directories) await collect(dir)
  files.push('index.html','package.json','package-lock.json','vite.config.js','eslint.config.js','README.md','.gitignore','LEGGIMI-GESTORE.md','Gestisci collezione.bat')
  const changes = []
  for (const path of files) {
    const buffer = await readFile(join(root,path))
    if (buffer.length > 25 * 1024 * 1024) throw Error(`File troppo grande: ${path}`)
    const sha = createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex')
    if (tree.tree.some(item => item.path === path && item.sha === sha)) continue
    const blob = await api(`/repos/${repo}/git/blobs`,'POST',{ content:buffer.toString('base64'), encoding:'base64' })
    changes.push({path,mode:'100644',type:'blob',sha:blob.sha})
  }
  const actionsUrl = `https://github.com/${repo}/actions`
  const settingsUrl = `https://github.com/${repo}/settings/pages`
  const configurePages = async (sha) => {
    let pages
    try {
      try { pages = await api(`/repos/${repo}/pages`) } catch (error) { if(error.status !== 404) throw error; pages = await api(`/repos/${repo}/pages`, 'POST', {build_type:'workflow'}) }
      if(pages.build_type !== 'workflow') throw Error('Imposta Source su GitHub Actions nelle impostazioni Pages.')
      return {message:'Progetto caricato su GitHub. Controlla il workflow Pubblica catalogo per l’esito del deploy.',actionsUrl,siteUrl:pages.html_url,sha,uploaded:true}
    } catch (error) {
      const siteUrl = `https://${owner.toLowerCase()}.github.io/${name}/`
      try {
        const response = await request(`${siteUrl}games.json?v=${Date.now()}`,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(12000)})
        if(response.ok && Array.isArray(await response.json())) return {message:'Modifiche inviate. Attendo il completamento della pubblicazione.',actionsUrl,siteUrl,sha,uploaded:true}
      } catch { /* Pages may not yet be configured on the first upload. */ }
      return {message:'Progetto caricato su GitHub. Resta da attivare il sito: apri Settings → Pages, scegli GitHub Actions, poi Actions → Pubblica catalogo → Run workflow. ' + error.message,actionsUrl,settingsUrl,sha,uploaded:true,needsPagesSetup:true}
    }
  }
  if (!changes.length) return configurePages(head)
  const nextTree = await api(`/repos/${repo}/git/trees`,'POST',{base_tree:commit.tree.sha,tree:changes})
  const nextCommit = await api(`/repos/${repo}/git/commits`,'POST',{message:'Aggiorna collezione dal gestore locale',tree:nextTree.sha,parents:[head]})
  // A second check prevents silently replacing changes made remotely during upload.
  const latestProducts = JSON.parse(await readFile(join(root,'public/games.json'),'utf8'))
  const latestRelations = JSON.parse(await readFile(join(root,'public/relations.json'),'utf8'))
  if (createHash('sha256').update(JSON.stringify([latestProducts,latestRelations])).digest('hex') !== revision) throw Error('Il catalogo locale è cambiato durante il caricamento. Salva e riprova.')
  const latest = await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
  if (latest.object.sha !== head) throw Error('Il repository è cambiato durante il caricamento. Nessuna modifica è stata pubblicata sul ramo.')
  await api(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,'PATCH',{sha:nextCommit.sha,force:false})
  await writeFile(join(root,'.catalog-publish.json'),JSON.stringify({repository:repo,sha:nextCommit.sha},null,2))
  return configurePages(nextCommit.sha)
}
