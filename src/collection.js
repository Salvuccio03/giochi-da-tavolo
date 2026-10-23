export function assetUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
export function playerLabel(players) {
  if (!players) return 'Non indicati'
  if (players.max === null) return `${players.min}+`
  return players.min === players.max ? `${players.min}` : `${players.min}–${players.max}`
}
export function validateCollection(products, relations) {
  if (!Array.isArray(products) || !Array.isArray(relations)) throw new Error('I file dati devono contenere array JSON.')
  const ids = new Set()
  const validPlayers = p => p == null || (Number.isInteger(p.min) && p.min > 0 && (p.max === null || (Number.isInteger(p.max) && p.max >= p.min)))
  for (const p of products) {
    if (!p.id || ids.has(p.id) || !p.name || !['base', 'expansion', 'standalone', 'standalone_expansion'].includes(p.type) || !validPlayers(p.players)) throw new Error('Controlla ID, nome, tipo e giocatori dei prodotti.')
    if ((p.playerConfigurations || []).some(c => !c.label || !c.players || !validPlayers(c.players))) throw new Error('Configurazione giocatori non valida.')
    ids.add(p.id)
    if (p.image && (typeof p.image !== 'string' || /^(?!https?:)[a-z]+:/i.test(p.image))) throw new Error('Percorso copertina non valido.')
    for (const m of p.manuals || []) if (!m.label || typeof m.url !== 'string' || !/^(https?:\/\/|\/?manuals\/)/i.test(m.url)) throw new Error('Percorso manuale non valido.')
  }
  const relationIds = new Set()
  for (const r of relations) {
    if (!r.id || relationIds.has(r.id) || !['expansion_for', 'combines_with', 'requires'].includes(r.type) || !ids.has(r.from) || !ids.has(r.to) || r.from === r.to || !validPlayers(r.combinedPlayers) || (r.requiredProductIds || []).some(id => !ids.has(id))) throw new Error('Controlla ID, riferimenti e tipo delle relazioni.')
    relationIds.add(r.id)
  }
  return { products, relations }
}
export async function loadCollection(signal) {
  const [products, relations] = await Promise.all(['games.json', 'relations.json'].map(async file => {
    const response = await fetch(assetUrl(file), { signal })
    if (!response.ok) throw new Error(`Impossibile caricare ${file}.`)
    return response.json()
  }))
  return validateCollection(products, relations)
}
export function relatedProducts(id, products, relations) {
  return relations.filter(r => r.from === id || r.to === id).map(relation => {
    const outgoing = relation.from === id
    const linked = products.find(p => p.id === (outgoing ? relation.to : relation.from))
    const label = relation.type === 'combines_with' ? 'Gioco standalone combinabile' : relation.type === 'requires' ? (outgoing ? 'Prodotto necessario per giocare' : 'Prodotto che richiede questo gioco') : outgoing ? 'Gioco compatibile con questa espansione' : 'Espansione compatibile'
    return { relation, linked, label }
  })
}

export function matchingPlayers(product, relations, count) {
  if (!count) return product.players
  const fits = players => players && count >= players.min && (players.max === null || count <= players.max)
  const ranges = [product.players, ...relations.filter(r => r.type === 'expansion_for' && r.to === product.id).map(r => r.combinedPlayers), ...(product.playerConfigurations || []).map(c => c.players)]
  return ranges.find(fits) || null
}
