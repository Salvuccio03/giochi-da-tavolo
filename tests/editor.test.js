import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditorServer, replaceStagedFile } from '../scripts/editor-server.mjs'

async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'catalog-editor-test-'))
 await mkdir(join(root,'public'),{recursive:true})
 await writeFile(join(root,'public/games.json'),JSON.stringify([{id:'test-game',name:'Test',type:'base',players:{min:2,max:4},manuals:[]}]))
 await writeFile(join(root,'public/relations.json'),'[]')
 const server=createEditorServer({root,publish:async()=>({message:'test publication'})})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})})
 const base=`http://127.0.0.1:${server.address().port}`
 const html=await(await fetch(base)).text()
 const token=html.match(/name="editor-token" content="([^"]+)"/)[1]
 const request=async(path,data,headers={})=>fetch(base+path,{method:data?'POST':'GET',headers:{'X-Editor-Token':token,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})})
 return {root,request,base}
}
test('gestore: salva dati e relazioni, crea backup, rifiuta revisioni obsolete',async t=>{
 const {root,request}=await fixture(t)
 const original=await(await request('/api/collection')).json()
 const products=[...original.products,{id:'test-expansion',name:'Expansion',type:'expansion',players:null,manuals:[]}]
 const relations=[{id:'link',from:'test-expansion',to:'test-game',type:'expansion_for',combinedPlayers:{min:2,max:6}}]
 const response=await request('/api/save',{...original,products,relations});assert.equal(response.status,200)
 assert.deepEqual(JSON.parse(await readFile(join(root,'public/relations.json'))),relations)
 const backups=await readdir(join(root,'.catalog-backups'));assert.equal(backups.length,1)
 assert.deepEqual(JSON.parse(await readFile(join(root,'.catalog-backups',backups[0],'games.json'))),original.products)
 assert.equal((await request('/api/save',original)).status,409)
})
test('gestore: rifiuta richieste esterne, riferimenti errati e upload mascherati',async t=>{
 const {request,base}=await fixture(t)
 assert.equal((await fetch(base+'/api/collection')).status,403)
 assert.equal((await request('/api/collection',null,{Origin:'https://example.com'})).status,403)
 const data=await(await request('/api/collection')).json()
 assert.equal((await request('/api/save',{...data,relations:[{id:'bad',type:'requires',from:'missing',to:'test-game'}]})).status,400)
 assert.equal((await request('/api/upload',{kind:'image',data:Buffer.from('<script>test</script>').toString('base64')})).status,400)
 assert.equal((await request('/api/upload',{kind:'manual',data:Buffer.from('%PDF-1.4\nexample').toString('base64')})).status,200)
})
test('gestore: nessun accesso ai backup o a percorsi fuori public',async t=>{
 const {request}=await fixture(t)
 assert.equal((await request('/.catalog-backups/')).status,404)
 assert.equal((await request('/scripts/editor-server.mjs')).status,404)
 assert.equal((await request('/images/%2e%2e%2fpackage.json')).status,404)
})

test('salvataggio Windows: ripiega sulla scrittura se rename restituisce EPERM',async t=>{
 const root=await mkdtemp(join(tmpdir(),'catalog-windows-test-'))
 t.after(()=>rm(root,{recursive:true,force:true}))
 const staged=join(root,'staged.json'),target=join(root,'target.json')
 await writeFile(staged,'{"updated":true}');await writeFile(target,'{"updated":false}')
 await replaceStagedFile(staged,target,async()=>{const e=Error('Windows file locked');e.code='EPERM';throw e})
 assert.equal(await readFile(target,'utf8'),'{"updated":true}')
})
