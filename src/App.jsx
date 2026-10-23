import { useEffect, useRef, useState } from 'react'
import { assetUrl, loadCollection, playerLabel, relatedProducts, matchingPlayers } from './collection'
import './App.css'

const types = { base: 'Gioco base', expansion: 'Espansione', standalone: 'Gioco standalone', standalone_expansion: 'Espansione standalone' }
function Icon({ name, ...props }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>{name === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> : name === 'people' ? <><circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></> : <><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8" cy="8" r=".6"/><circle cx="16" cy="16" r=".6"/><circle cx="12" cy="12" r=".6"/></>}</svg>
}
function Cover({ product, badge = false }) {
  const [failedImage, setFailedImage] = useState(null)
  return <div className="cover">{product.image && failedImage !== product.image ? <img src={assetUrl(product.image)} alt={`Copertina di ${product.name}`} onError={() => setFailedImage(product.image)} /> : <div className="cover-placeholder"><Icon/><span>Copertina non disponibile</span></div>}{badge && product.players && <span className="players" aria-label={`Numero ufficiale di giocatori: ${playerLabel(product.players)}`}>{playerLabel(product.players)}</span>}</div>
}
function GameCard({ product, players }) {
  return <a className="game-card" href={`#/game/${encodeURIComponent(product.id)}`}><Cover product={{...product, players}} badge/><h3>{product.name}</h3></a>
}
function Relations({ product, products, relations }) {
  const groups = relatedProducts(product.id, products, relations)
  return <section className="relations"><h2>Intorno a questo gioco</h2>{groups.length ? <div className="related-grid">{groups.map(({ relation, linked, label }) => <article className="relation" key={`${relation.id}-${linked.id}`}><div><span className="eyebrow">{label}</span><GameCard product={linked} players={relation.combinedPlayers || linked.players}/>{relation.conditions && <p>{relation.conditions}</p>}{relation.requiredProductIds?.length > 0 && <p>Questa configurazione richiede: {relation.requiredProductIds.map((id, i) => <span key={id}>{i > 0 && ', '}<a href={`#/game/${encodeURIComponent(id)}`}>{products.find(p => p.id === id).name}</a></span>)}</p>}{relation.combinedPlayers && <p>Giocatori con questa espansione: {playerLabel(relation.combinedPlayers)}</p>}</div></article>)}</div> : <p className="muted">Nessuna espansione o altro prodotto collegato nella collezione.</p>}</section>
}
function Detail({ product, products, relations }) {
  return <><a className="back" href="#/">← Torna al catalogo</a><div className="detail"><Cover key={product.id} product={product} badge/><div><span className="eyebrow">{types[product.type]}{product.demo && ' · Esempio'}</span><h1>{product.name}</h1><p className="description">{product.description || 'Descrizione non ancora disponibile.'}</p>{product.playerConfigurations?.map((configuration, index) => <p className="muted" key={index}>{configuration.label}: {playerLabel(configuration.players)}</p>)}<section className="manuals"><h2>Regolamenti e manuali</h2>{product.manuals?.length ? product.manuals.map((manual, index) => <div className="manual" key={index}><span>{manual.label}</span><a className="button" href={assetUrl(manual.url)} target="_blank" rel="noreferrer">Visualizza PDF ↗</a><a className="download" href={assetUrl(manual.url)} download>Scarica PDF ↓</a></div>) : <p className="muted">Nessun manuale disponibile per questo prodotto.</p>}</section><Relations product={product} products={products} relations={relations}/></div></div></>
}
function currentId() {
  const match = window.location.hash.match(/^#\/game\/(.+)$/)
  try { return match ? decodeURIComponent(match[1]) : null } catch { return '__invalid__' }
}
export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [playerCount, setPlayerCount] = useState('')
  const [id, setId] = useState(currentId)
  const main = useRef(null)
  useEffect(() => {
    let active = true
    let pending = false
    const controller = new AbortController()
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try { const next = await loadCollection(controller.signal); if (active) { setData(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setError('') } }
      catch (e) { if (active && e.name !== 'AbortError') setError(previous => previous || e.message) }
      finally { pending = false }
    }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  useEffect(() => { const update = () => { setId(currentId()); window.scrollTo(0, 0); main.current?.focus() }; window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, [])
  const product = data?.products.find(p => p.id === id)
  useEffect(() => { document.title = product ? `${product.name} · Al tavolo` : 'Al tavolo · La mia collezione' }, [product])
  const catalog = data?.products.filter(p => p.type !== 'expansion') || []
  const count = Number(playerCount)
  const filtered = catalog.filter(p => p.name.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it')) && (!count || matchingPlayers(p, data.relations, count)))
  return <div className="app"><a className="skip" href="#content">Vai al contenuto</a><header><a className="brand" href="#/"><span className="brand-icon"><Icon/></span>al tavolo<span className="brand-dot">.</span></a><span className="header-note">LA MIA COLLEZIONE PERSONALE</span><span className="header-tag"><span/> Una serata, un gioco.</span></header><main id="content" ref={main} tabIndex="-1">{error ? <div className="status" role="alert"><h1>Il catalogo non è disponibile</h1><p>{error}</p><button onClick={() => window.location.reload()}>Riprova</button></div> : !data ? <p className="status" role="status">Sto preparando il tavolo…</p> : id ? product ? <Detail product={product} {...data}/> : <div className="status"><h1>Prodotto non trovato</h1><a href="#/">Torna al catalogo</a></div> : <><section className="intro"><div><span className="eyebrow"><span className="small-line"/> BENVENUTI NELLA MIA LUDOTECA</span><h1>La prossima serata<br/>inizia <em>da qui.</em></h1><p>Scegli una scatola. Raduna gli amici. Al resto pensa il gioco.</p></div><div className="intro-art" aria-hidden="true"><div className="orbit"/><span className="die die-one">✦</span><span className="die die-two">⠿</span><span className="spark">✧</span></div></section><section aria-labelledby="catalog-title"><div className="catalog-toolbar"><div className="catalog-heading"><h2 id="catalog-title">Scegli cosa portare al tavolo</h2><span>{catalog.length} giochi</span></div><div className="search-controls"><label className="player-filter">Giocatori<input type="number" min="1" step="1" inputMode="numeric" placeholder="Tutti" aria-label="Numero di giocatori" value={playerCount} onChange={e => setPlayerCount(e.target.value)} /></label><label className="search"><Icon name="search"/><input type="search" placeholder="Cerca un gioco…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Cerca un gioco per nome"/></label></div></div>{count > 0 && <p className="search-hint" role="status">{filtered.length} giochi per {count} persone · Incluse le configurazioni dichiarate con le espansioni possedute. Il badge mostra l’intervallo compatibile.</p>}{catalog.some(p => p.demo) && <div className="demo-note"><span>COLLEZIONE DI ESEMPIO</span> Titoli e copertine illustrativi. Dati ufficiali da aggiungere.</div>}<div className="game-grid">{filtered.map(p => <GameCard product={p} players={matchingPlayers(p, data.relations, count)} key={p.id}/>)}</div>{filtered.length === 0 && <div className="status" role="status"><h2>{catalog.length ? 'Nessun gioco trovato' : 'La collezione aspetta la prima scatola'}</h2><p>{catalog.length ? 'Prova un altro nome o un altro numero di giocatori.' : 'Aggiungi i tuoi prodotti in games.json.'}</p>{(query || playerCount) && <button onClick={() => { setQuery(''); setPlayerCount('') }}>Cancella ricerca</button>}</div>}</section></>}</main><footer><a className="brand" href="#/">al tavolo.</a><p>Le scatole sono mie. I bei momenti sono di tutti.</p><span>FATTO PER GIOCARE INSIEME</span></footer></div>
}
