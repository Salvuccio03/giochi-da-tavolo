import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishCatalog } from '../scripts/publish.mjs'
import { revisionOf } from '../scripts/editor-server.mjs'
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'catalog-publish-test-'))
 for(const dir of ['src','public','tests','examples','scripts','local-editor','.github/workflows'])await mkdir(join(root,dir),{recursive:true})
 const products=[{id:'game',name:'Game',type:'base',players:{min:2,max:4}}], relations=[]
 await writeFile(join(root,'public/games.json'),JSON.stringify(products));await writeFile(join(root,'public/relations.json'),'[]')
 for(const file of ['index.html','package.json','package-lock.json','vite.config.js','eslint.config.js','README.md','.gitignore','LEGGIMI-GESTORE.md','Gestisci collezione.bat'])await writeFile(join(root,file),'test')
 t.after(()=>rm(root,{recursive:true,force:true}))
 const calls=[]
 const request=async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,options})
  let data={};const method=options.method
  if(path.endsWith('/repos/owner/catalog'))data={private:false,default_branch:'main'}
  else if(path.endsWith('/git/ref/heads/main'))data={object:{sha:'initial'}}
  else if(path.endsWith('/git/commits/initial'))data={tree:{sha:'base'}}
  else if(path.endsWith('/git/trees/base'))data={tree:[{path:'README.md',type:'blob',sha:'old'}]}
  else if(path.endsWith('/pages'))data={build_type:'workflow',html_url:'https://owner.github.io/catalog/'}
  else if(path.endsWith('/git/blobs'))data={sha:'blob'}
  else if(path.endsWith('/git/trees')&&method==='POST')data={sha:'new-tree'}
  else if(path.endsWith('/git/commits')&&method==='POST')data={sha:'new-commit'}
  else if(path.endsWith('/git/refs/heads/main'))data={object:{sha:'new-commit'}}
  return new Response(JSON.stringify(data),{status:200})
 }
 return {root,repository:'https://github.com/owner/catalog',githubToken:'fake-test-token',revision:revisionOf(products,relations),request,calls}
}
test('pubblicazione: commit unico senza force, token escluso dai file, stato locale',async t=>{
 const f=await fixture(t);const result=await publishCatalog(f)
 assert.equal(result.sha,'new-commit')
 const patch=f.calls.find(c=>c.path.endsWith('/git/refs/heads/main'));assert.equal(JSON.parse(patch.options.body).force,false)
 assert.ok(f.calls.every(c=>!c.options.body?.includes('fake-test-token')))
 assert.deepEqual(JSON.parse(await readFile(join(f.root,'.catalog-publish.json'))),{repository:'owner/catalog',sha:'new-commit'})
})
test('pubblicazione: blocca repository privati nel flusso gratuito',async t=>{
 const f=await fixture(t);f.request=async()=>new Response(JSON.stringify({private:true,default_branch:'main'}))
 await assert.rejects(()=>publishCatalog(f),/pubblico/)
})
test('pubblicazione: blocca modifiche remote sopraggiunte e revisioni locali obsolete',async t=>{
 const f=await fixture(t)
 await writeFile(join(f.root,'.catalog-publish.json'),JSON.stringify({repository:'owner/catalog',sha:'different'}))
 await assert.rejects(()=>publishCatalog(f),/modificato online/)
 await assert.rejects(()=>publishCatalog({...f,revision:'stale'}),/cambiato/)
})

test('il progetto viene caricato anche quando manca il permesso di attivare Pages',async t=>{
 const f=await fixture(t);const base=f.request
 f.request=async(url,options)=>url.endsWith('/pages') ? new Response(JSON.stringify({message:'Resource not accessible by personal access token'}),{status:403}) : base(url,options)
 const result=await publishCatalog(f)
 assert.equal(result.uploaded,true);assert.equal(result.needsPagesSetup,true)
 assert.ok(f.calls.some(c=>c.path.endsWith('/git/refs/heads/main')))
 assert.equal(JSON.parse(await readFile(join(f.root,'.catalog-publish.json'))).sha,'new-commit')
})
