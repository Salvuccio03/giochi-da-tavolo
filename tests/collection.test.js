import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateCollection, relatedProducts, playerLabel, matchingPlayers } from '../src/collection.js'
const products = JSON.parse(await readFile(new URL('../examples/games.json', import.meta.url)))
const relations = JSON.parse(await readFile(new URL('../examples/relations.json', import.meta.url)))
test('fixture dimostrative valide e ID univoci', () => assert.doesNotThrow(() => validateCollection(products, relations)))
test('espansioni condivise senza inferire compatibilità tra basi', () => {
  const links = relatedProducts('mare', products, relations)
  assert.ok(links.some(r => r.linked.id === 'orbite'))
  assert.ok(!links.some(r => r.linked.id === 'atlante'))
})
test('combinazione simmetrica e requisito direzionale', () => {
  assert.equal(relatedProducts('luna', products, relations)[0].label, 'Gioco standalone combinabile')
  assert.ok(relatedProducts('orbite', products, relations).some(r => r.label === 'Prodotto necessario per giocare'))
  assert.ok(!relatedProducts('atlante', products, relations).some(r => r.label === 'Prodotto necessario per giocare'))
})
test('riferimenti mancanti e duplicati sono rifiutati', () => {
  assert.throws(() => validateCollection([...products, products[0]], relations))
  assert.throws(() => validateCollection(products, [{id:'bad',type:'requires',from:'missing',to:'atlante'}]))
})
test('giocatori mai calcolati dalle relazioni', () => {
  assert.equal(playerLabel(null), 'Non indicati')
  assert.equal(playerLabel({min:2,max:4}), '2–4')
  assert.equal(playerLabel({min:2,max:2}), '2')
  assert.equal(playerLabel({min:8,max:null}), '8+')
  assert.doesNotThrow(() => validateCollection([{...products[0], players:{min:8,max:null}}], []))
})

test('collezione reale: 45 giochi e 20 espansioni con collegamenti espliciti', async () => {
  const realProducts = JSON.parse(await readFile(new URL('../public/games.json', import.meta.url)))
  const realRelations = JSON.parse(await readFile(new URL('../public/relations.json', import.meta.url)))
  assert.ok(realProducts.length > 0)
  assert.doesNotThrow(() => validateCollection(realProducts, realRelations))
  assert.ok(Array.isArray(realRelations))
  assert.ok(realProducts.every(p => !p.demo))
  assert.ok(realProducts.every(p => !p.pendingExpansion))
})

test('espansioni reali condivise e limiti della configurazione separati', async () => {
 const games = JSON.parse(await readFile(new URL('../examples/owned-games.json', import.meta.url)))
 const links = JSON.parse(await readFile(new URL('../examples/owned-relations.json', import.meta.url)))
 assert.equal(relatedProducts('bang', games, links).length, 8)
 assert.equal(relatedProducts('bang-dice-explosion', games, links).length, 2)
 assert.equal(games.filter(p => p.id === 'block-block-burrito').length, 1)
 assert.equal(links.filter(r => r.from === 'block-block-burrito').length, 2)
 assert.deepEqual(games.find(p => p.id === 'bang').players, {min:4,max:7})
 assert.deepEqual(links.find(r => r.from === 'dodge-city').combinedPlayers, {min:3,max:8})
 assert.ok(links.filter(r => r.to === 'heat').every(r => r.combinedPlayers === null))
 assert.equal(links.find(r => r.to === 'lupus-in-tabula').combinedPlayers, null)
})

test('ricerca per 8 include Bang e Heat con espansioni senza sommare limiti', async () => {
 const games = JSON.parse(await readFile(new URL('../examples/owned-games.json', import.meta.url)))
 const links = JSON.parse(await readFile(new URL('../examples/owned-relations.json', import.meta.url)))
 assert.deepEqual(matchingPlayers(games.find(p => p.id === 'bang'), links, 8), {min:3,max:8})
 assert.deepEqual(matchingPlayers(games.find(p => p.id === 'heat'), links, 8), {min:1,max:8})
 assert.equal(matchingPlayers(games.find(p => p.id === 'heat'), links, 9), null)
 assert.equal(matchingPlayers(games.find(p => p.id === 'bang-the-duel'), links, 8), null)
 assert.deepEqual(matchingPlayers(games.find(p => p.id === 'bang'), links, 0), {min:4,max:7})
})

test('tutte le 20 espansioni hanno una copertina locale e una fonte', async () => {
 const games = JSON.parse(await readFile(new URL('../public/games.json', import.meta.url)))
 for (const product of games.filter(p => p.imageSource && p.type === 'expansion')) {
  assert.ok(product.image?.startsWith('images/'), product.id)
  assert.ok(product.imageSource?.page, product.id)
  const bytes = await readFile(new URL('../public/' + product.image, import.meta.url))
  assert.ok(bytes.length > 1000, product.id)
 }
})
