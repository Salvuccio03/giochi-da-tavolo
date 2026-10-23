const $ = selector => document.querySelector(selector)
const token = $('meta[name="editor-token"]').content
const form = $('#product-form')
const typeNames = {base:'Gioco base',standalone:'Standalone',expansion:'Espansione',standalone_expansion:'Espansione standalone'}
let state, selected = null, dirty = false, busy = false, idTouched = false
const field = name => form.elements.namedItem(name)
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const slug = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
function notice(message, kind = '') { $('#notice').textContent = message; $('#notice').className = kind }
function markDirty() { dirty = true; $('#dirty-state').textContent = 'Modifiche da salvare' }
async function api(path, data) {
  const r = await fetch(`/api/${path}`, { method:data ? 'POST':'GET', headers:{'X-Editor-Token':token,'Content-Type':'application/json'}, ...(data ? {body:JSON.stringify(data)} : {}) })
  const result = await r.json()
  if (!r.ok) throw Error(result.error || 'Operazione non riuscita.')
  return result
}
async function perform(action) {
  if (busy) return
  busy = true
  const controls = [...document.querySelectorAll('button,input,select,textarea')].map(el => [el,el.disabled])
  controls.forEach(([el]) => { el.disabled = true })
  try { await action() } catch(e) { notice(e.message,'error') }
  finally { busy = false; controls.forEach(([el,disabled]) => { el.disabled = disabled }); syncOpen() }
}
function renderList() {
  const list = $('#product-list'); list.replaceChildren()
  const query = $('#filter').value.toLocaleLowerCase('it')
  const products = state.products.filter(p=>p.name.toLocaleLowerCase('it').includes(query))
  $('#count').textContent = `${state.products.filter(p=>p.type!=='expansion').length} giochi · ${state.products.filter(p=>p.type==='expansion').length} esp.`
  for (const p of products) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `product-item${p.id === selected ? ' active' : ''}`
    if (p.image) { const img = document.createElement('img'); img.src = p.image.startsWith('http') ? p.image : `/${p.image}`; img.alt = ''; img.addEventListener('error',()=>{img.hidden=true}); button.append(img) }
    const text = document.createElement('span'); text.textContent=p.name
    const small = document.createElement('small'); small.textContent=typeNames[p.type];text.append(small);button.append(text)
    button.addEventListener('click',()=>select(p.id));list.append(button)
  }
  if (!products.length) list.textContent='Nessun prodotto trovato.'
}
function confirmDiscard() {
  const dialog = $('#discard-dialog');dialog.showModal()
  return new Promise(resolve => {
    const finish = result => {dialog.close();dialog.oncancel=null;resolve(result)}
    $('#keep-draft').onclick = () => finish(false)
    $('#discard-draft').onclick = () => finish(true)
    dialog.oncancel = e => {e.preventDefault();finish(false)}
  })
}
function syncOpen() { field('max').disabled = field('open').checked }
function preview() {
  const value = field('image').value.trim(); const img = $('#image-preview')
  img.hidden=!value; img.src = /^https?:\/\//.test(value) ? value : `/${value}`
  img.onerror = () => { img.hidden=true }
}
function removableRow(container, title) {
  const row = document.createElement('div');row.className='row-editor'
  const heading = document.createElement('div');heading.className='row-title';const label=document.createElement('span');label.textContent=title
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Rimuovi';remove.addEventListener('click',()=>{row.remove();markDirty()})
  heading.append(label,remove);row.append(heading);container.append(row);return row
}
async function upload(file, kind) {
  if (!file) return null
  if(file.size>15*1024*1024) throw Error('Il file supera 15 MB.')
  notice(`Caricamento di ${file.name}…`,'busy')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary='';for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768))
  return (await api('upload',{kind,data:btoa(binary)})).path
}
function addManual(manual={label:'',url:''}) {
  const row=removableRow($('#manual-list'),'Manuale PDF')
  const content=document.createElement('div');content.innerHTML=`<div class="fields"><label>Nome del manuale<input data-key="label" required value="${escape(manual.label)}" placeholder="Regolamento italiano"></label><label>Percorso o URL PDF<input data-key="url" required value="${escape(manual.url)}" placeholder="manuals/regolamento.pdf o https://…"></label></div><label>Carica PDF<input type="file" accept="application/pdf" data-upload></label>`
  row.append(content)
  row.querySelector('[data-upload]').addEventListener('change',e=>{const file=e.target.files[0];perform(async()=>{const path=await upload(file,'manual');if(path){row.querySelector('[data-key="url"]').value=path;if(!row.querySelector('[data-key="label"]').value)row.querySelector('[data-key="label"]').value=file.name.replace(/\.pdf$/i,'');markDirty();notice('PDF caricato. Premi Salva per collegarlo al prodotto.')}})})
}
const options = (current, exclude) => state.products.filter(p=>p.id!==exclude).map(p=>`<option value="${escape(p.id)}" ${p.id===current?'selected':''}>${escape(p.name)} · ${escape(typeNames[p.type])}</option>`).join('')
function rangeHTML(players) { return `<div class="range"><label>Minimo<input data-min type="number" min="1" step="1" value="${players?.min || ''}"></label><label>Massimo<input data-max type="number" min="1" step="1" value="${players?.max ?? ''}"></label><label class="check"><input data-open type="checkbox" ${players && players.max===null?'checked':''}> Senza massimo</label></div>` }
function wireRange(row) { const sync=()=>{row.querySelector('[data-max]').disabled=row.querySelector('[data-open]').checked};row.querySelector('[data-open]').addEventListener('change',sync);sync() }
function addRelation(relation={}) {
  const row=removableRow($('#relation-list'),'Collegamento dal prodotto attuale')
  row.dataset.id=relation.id || crypto.randomUUID(); row.relationOriginal=relation
  const content=document.createElement('div');content.innerHTML=`<div class="fields"><label>Relazione<select data-key="type"><option value="expansion_for">È un’espansione compatibile con</option><option value="combines_with">È uno standalone combinabile con</option><option value="requires">Richiede per giocare</option></select></label><label>Prodotto collegato<select data-key="to" required><option value="">Scegli un prodotto</option>${options(relation.to,selected)}</select></label></div><label>Condizioni particolari<textarea data-key="conditions" rows="2" placeholder="Modalità compatibili, limitazioni, edizione…">${escape(relation.conditions)}</textarea></label><label>Giocatori nella configurazione con questo collegamento</label>${rangeHTML(relation.combinedPlayers)}<label>Ulteriori prodotti necessari alla configurazione</label><div class="requirements">${state.products.filter(p=>p.id!==selected).map(p=>`<label><input type="checkbox" data-required value="${escape(p.id)}" ${(relation.requiredProductIds||[]).includes(p.id)?'checked':''}>${escape(p.name)}</label>`).join('')}</div>`
  row.append(content);row.querySelector('[data-key="type"]').value=relation.type||'expansion_for';wireRange(row)
}
function addConfiguration(configuration={}) {
  const row=removableRow($('#configuration-list'),'Configurazione con espansioni');row.configurationOriginal=configuration
  const content=document.createElement('div');content.innerHTML=`<label>Nome della configurazione<input data-key="label" required value="${escape(configuration.label)}" placeholder="Con entrambe le espansioni"></label>${rangeHTML(configuration.players)}`;row.append(content);wireRange(row)
}
async function select(id) {
  if(busy) return
  if(dirty && !await confirmDiscard())return
  selected=id;dirty=false;idTouched=false
  const p=state.products.find(p=>p.id===id)||{id:'',name:'',type:'standalone',description:'',image:'',manuals:[]}
  form.hidden=false;form.reset();$('#form-title').textContent=id?p.name:'Nuovo gioco o espansione'
  for(const name of ['id','name','type','description','image'])field(name).value=p[name]||''
  field('id').readOnly=!!id;field('min').value=p.players?.min||'';field('max').value=p.players?.max??'';field('open').checked=!!p.players&&p.players.max===null;syncOpen();preview()
  for(const selector of ['#manual-list','#relation-list','#configuration-list','#incoming-relations'])$(selector).replaceChildren()
  for(const m of p.manuals||[])addManual(m)
  for(const r of state.relations.filter(r=>r.from===id))addRelation(r)
  const incoming=state.relations.filter(r=>r.to===id)
  if(incoming.length){const container=$('#incoming-relations');container.className='incoming';container.append(document.createTextNode('Espansioni e altri collegamenti verso questo prodotto (modificali dalla relativa scheda): '));for(const r of incoming){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=state.products.find(p=>p.id===r.from).name;button.addEventListener('click',()=>select(r.from));container.append(button,document.createTextNode(' '))}}
  for(const c of p.playerConfigurations||[])addConfiguration(c)
  $('#dirty-state').textContent='Nessuna modifica';renderList()
}
function readRange(min,max,open) {
  if(!min && !max && !open)return null
  const result={min:Number(min),max:open?null:Number(max)}
  if(!Number.isInteger(result.min)||result.min<1||(!open&&(!Number.isInteger(result.max)||result.max<result.min)))throw Error('Indica minimo e massimo validi oppure spunta “Senza massimo”.')
  return result
}
function rowRange(row){return readRange(row.querySelector('[data-min]').value,row.querySelector('[data-max]').value,row.querySelector('[data-open]').checked)}
async function save() {
  if(!form.reportValidity())throw Error('Completa i campi evidenziati prima di salvare.')
  const id=field('id').value.trim();const existing=state.products.find(p=>p.id===selected)
  if(!selected&&state.products.some(p=>p.id===id))throw Error('Questo ID esiste già: scegline uno diverso.')
  const image=field('image').value.trim()||null
  const product={...existing,id,name:field('name').value.trim(),type:field('type').value,demo:false,description:field('description').value.trim()||null,image,players:readRange(field('min').value,field('max').value,field('open').checked),manuals:[...$('#manual-list').children].map(row=>({label:row.querySelector('[data-key="label"]').value.trim(),url:row.querySelector('[data-key="url"]').value.trim()}))}
  if(image!==existing?.image)delete product.imageSource
  if(JSON.stringify(product.players)!==JSON.stringify(existing?.players))product.playersSource='Inserito dal proprietario nel gestore locale.'
  product.playerConfigurations=[...$('#configuration-list').children].map(row=>({...row.configurationOriginal,label:row.querySelector('[data-key="label"]').value.trim(),players:rowRange(row)}))
  const outgoing=[...$('#relation-list').children].map(row=>({...row.relationOriginal,id:row.dataset.id,from:id,type:row.querySelector('[data-key="type"]').value,to:row.querySelector('[data-key="to"]').value,conditions:row.querySelector('[data-key="conditions"]').value.trim(),combinedPlayers:rowRange(row),requiredProductIds:[...row.querySelectorAll('[data-required]:checked')].map(el=>el.value)}))
  const products=existing?state.products.map(p=>p.id===selected?product:p):[...state.products,product]
  const relations=[...state.relations.filter(r=>r.from!==selected),...outgoing]
  for(const r of outgoing){if(r.from===r.to)throw Error('Un prodotto non può essere collegato a sé stesso.');if(relations.filter(other=>other.type===r.type&&other.from===r.from&&other.to===r.to).length>1)throw Error('Hai inserito due volte lo stesso collegamento.');if(r.type==='combines_with'&&products.some(p=>(p.id===r.from||p.id===r.to)&&p.type==='expansion'))throw Error('Un’espansione non autonoma non può essere uno standalone combinabile.')}
  notice('Salvataggio sul PC…','busy')
  const result=await api('save',{products,relations,revision:state.revision});state={products,relations,revision:result.revision};selected=id;field('id').readOnly=true;dirty=false;$('#dirty-state').textContent='Salvato sul PC';$('#form-title').textContent=product.name;renderList();notice(result.message)
}
form.addEventListener('input',markDirty);form.addEventListener('change',markDirty)
field('name').addEventListener('input',()=>{if(!selected&&!idTouched)field('id').value=slug(field('name').value)})
field('id').addEventListener('input',()=>{idTouched=true})
field('open').addEventListener('change',syncOpen);field('image').addEventListener('input',preview)
$('#remove-image').addEventListener('click',()=>{field('image').value='';preview();markDirty()})
$('#image-upload').addEventListener('change',e=>{const file=e.target.files[0];perform(async()=>{const path=await upload(file,'image');if(path){field('image').value=path;preview();markDirty();notice('Copertina caricata. Premi Salva per associarla al prodotto.')}})})
$('#new-product').addEventListener('click',()=>select(null));$('#filter').addEventListener('input',renderList)
$('#add-manual').addEventListener('click',()=>{addManual();markDirty()});$('#add-relation').addEventListener('click',()=>{addRelation();markDirty()});$('#add-configuration').addEventListener('click',()=>{addConfiguration();markDirty()})
form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())perform(save)})
$('#github-toggle').addEventListener('click',()=>{$('#github-panel').hidden=!$('#github-panel').hidden})
$('#repository').value=localStorage.getItem('catalog-repository')||'https://github.com/Salvuccio03/giochi-da-tavolo'
$('#repository').addEventListener('change',()=>localStorage.setItem('catalog-repository',$('#repository').value.trim()))
$('#save-publish').addEventListener('click',()=>{ if(!form.reportValidity()) return; perform(async()=>{
  await save()
  if(!$('#github-token').value.trim()){ $('#github-panel').hidden=false;throw Error('Salvato sul PC. Per aggiornare online inserisci il token GitHub nel pannello in alto.') }
  notice('Invio a GitHub in corso. Lascia aperta questa pagina…','busy')
  const result=await api('publish',{repository:$('#repository').value.trim(),githubToken:$('#github-token').value.trim(),revision:state.revision})
  notice(result.message)
  const links=$('#publish-links');links.replaceChildren()
  for(const [label,url]of [['Controlla pubblicazione su GitHub Actions',result.actionsUrl],['Impostazioni GitHub Pages',result.settingsUrl],['Apri catalogo online',result.siteUrl]].filter(([,url])=>url)){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noreferrer';links.append(a,document.createTextNode(' · '))}
  $('#github-panel').hidden=false
})})
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue=''}})
try { state=await api('collection');renderList();select(state.products[0]?.id||null);notice('Gestore pronto. Le modifiche rimangono sul PC finché non premi “Salva e aggiorna online”.') } catch(e){notice(e.message,'error')}
