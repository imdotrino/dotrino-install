/**
 * @dotrino/install
 *
 * Botón de "Instalar app" (PWA) unificado y reutilizable por CUALQUIER app del
 * ecosistema Dotrino (Vue o vanilla). Resuelve la fragmentación de tener el
 * mismo flujo `beforeinstallprompt` copiado a mano en cada app, con tres bugs
 * recurrentes que aquí se arreglan de una vez:
 *
 *   1. El evento `beforeinstallprompt` se dispara MUY pronto (a veces antes de
 *      montar el componente). Si lo escuchas dentro de onMounted lo pierdes y el
 *      botón nunca aparece. Aquí lo capturamos a nivel de módulo, en import.
 *   2. iOS/Safari NO dispara `beforeinstallprompt` y no hay API de instalación:
 *      la única vía es "Compartir → Añadir a pantalla de inicio". Mostramos esas
 *      instrucciones en un modal propio (Shadow DOM), NUNCA con alert() — el
 *      ecosistema prohíbe alert/confirm/prompt del navegador.
 *   3. No mostrar el botón si la app ya corre instalada (display-mode standalone)
 *      ni reaparecerlo tras `appinstalled`.
 *
 * Filosofía Dotrino: sin JS de terceros, sin cookies, autohosteado,
 * bilingüe es/en (español neutro, tuteo).
 *
 * Uso (vanilla o Vue) — Web Component:
 *   import '@dotrino/install'   // registra el custom element
 *   <dotrino-install></dotrino-install>
 *   <dotrino-install lang="en" label="Install"></dotrino-install>
 *
 * Uso programático (si quieres tu propio botón) — ver también ./vue:
 *   import { canInstall, promptInstall, onInstallStateChange } from '@dotrino/install'
 *   if (canInstall()) showMyButton()
 *   await promptInstall()   // dispara el prompt nativo o el modal iOS/fallback
 */

const HOME_DEFAULT = 'https://dotrino.com'

/* ────────────────────────────────────────────────────────────────────────────
   Estado singleton a nivel de módulo.
   Capturamos `beforeinstallprompt`/`appinstalled` UNA sola vez, en import, para
   no perder el evento temprano. Todos los <dotrino-install> y cualquier
   código de la app leen de aquí y se suscriben a los cambios.
   ──────────────────────────────────────────────────────────────────────────── */

let _deferred = null      // el BeforeInstallPromptEvent diferido (o null)
let _installed = false    // se marcó appinstalled en esta sesión
let _settled = false      // pasó el margen de espera del prompt nativo
const _subs = new Set()   // suscriptores a cambios de estado (re-render)

function _emit () {
  for (const fn of _subs) {
    try { fn() } catch (_) {}
  }
}

// Tras un margen sin prompt nativo (Android), asumimos contexto embebido (Custom
// Tab abierto desde otra PWA): ahí Chrome NO dispara `beforeinstallprompt`, así
// que en vez de ocultar el botón ofreceremos relanzar en Chrome (ver más abajo).
if (typeof window !== 'undefined') {
  try { setTimeout(() => { _settled = true; _emit() }, 1400) } catch (_) {}
}

function _onBIP (e) {
  // Evita que el navegador muestre su mini-infobar; nosotros decidimos cuándo.
  try { e.preventDefault() } catch (_) {}
  _deferred = e
  _emit()
}

function _onInstalled () {
  _deferred = null
  _installed = true
  _emit()
}

if (typeof window !== 'undefined') {
  try {
    window.addEventListener('beforeinstallprompt', _onBIP)
    window.addEventListener('appinstalled', _onInstalled)
  } catch (_) {}
}

/** ¿La app ya corre como instalada (standalone) o se instaló en esta sesión? */
export function isAppInstalled () {
  if (_installed) return true
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
    // iOS Safari expone navigator.standalone (no es estándar).
    if (window.navigator && window.navigator.standalone === true) return true
  } catch (_) {}
  return false
}

/** Detección de iOS/iPadOS (incluye el iPad que se hace pasar por Mac). */
export function isIOS () {
  try {
    const ua = navigator.userAgent || ''
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true
    // iPadOS 13+ se reporta como "Macintosh"; lo delatan los eventos táctiles.
    if (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document) return true
  } catch (_) {}
  return false
}

/** ¿Corre como app instalada (standalone)? Atajo legible. */
export function isStandalone () {
  return isAppInstalled()
}

/** Detección de Android. */
export function isAndroid () {
  try { return /Android/i.test(navigator.userAgent || '') } catch (_) { return false }
}

const INSTALL_PARAM = 'pwa-install'
const HUB_PARAM = 'hub'

/** ¿La URL trae el marcador de "abrir para instalar" (tras relanzar en Chrome)? */
export function hasInstallFlag (param = INSTALL_PARAM) {
  try { return new URLSearchParams(location.search).has(param) } catch (_) { return false }
}

/**
 * ¿La app fue abierta DESDE el hub instalado (el home le puso `?hub=1`)? En ese
 * caso corre embebida en un Custom Tab que puede reportarse como standalone; este
 * marcador es la señal fiable de "estoy embebido, ofrece instalar en Chrome".
 */
export function isEmbeddedHub () {
  try { return new URLSearchParams(location.search).has(HUB_PARAM) } catch (_) { return false }
}

/**
 * Construye un `intent://` que reabre ESTA misma app en **Chrome** (no en el
 * Custom Tab/webview embebido) con el marcador `?pwa-install=1`, con fallback a
 * la URL https normal si Chrome no está. Solo tiene sentido en Android.
 */
export function chromeInstallUrl (param = INSTALL_PARAM) {
  try {
    const u = new URL(location.href)
    u.searchParams.delete(HUB_PARAM) // el marcador del hub no debe viajar a Chrome
    u.searchParams.set(param, '1')
    const target = `${u.host}${u.pathname}${u.search}`
    const fallback = encodeURIComponent(u.toString())
    return `intent://${target}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
  } catch (_) { return null }
}

/**
 * Estado de instalación de cara a la UI:
 *  - 'installed'  ya instalada / standalone → no ofrecer.
 *  - 'native'     hay prompt nativo (Chrome instalable) → instalar de un toque.
 *  - 'ios'        iOS/Safari → instrucciones "Añadir a pantalla de inicio".
 *  - 'relaunch'   Android sin prompt nativo (probable Custom Tab embebido) →
 *                 relanzar en Chrome con `chromeInstallUrl()`.
 *  - 'none'       nada que ofrecer (todavía esperando, o navegador sin soporte).
 */
export function installContext () {
  // Prompt nativo (Chrome real) siempre gana.
  if (_deferred) return 'native'
  // Embebido desde el hub (Android): ofrecer relanzar en Chrome AUNQUE el Custom
  // Tab se reporte como standalone (por eso esto va ANTES de isAppInstalled()).
  if (isEmbeddedHub() && isAndroid()) return 'relaunch'
  if (isAppInstalled()) return 'installed'
  if (isIOS()) return 'ios'
  if (_settled && isAndroid()) return 'relaunch'
  return 'none'
}

/**
 * ¿Tiene sentido ofrecer instalar? true si hay prompt nativo disponible, o si es
 * iOS (instalable a mano vía Compartir), siempre que NO esté ya instalada.
 */
export function canInstall () {
  if (isAppInstalled()) return false
  return !!_deferred || isIOS()
}

/** ¿Hay un prompt nativo (Chromium) listo para dispararse sin instrucciones? */
export function hasNativePrompt () {
  return !!_deferred
}

/**
 * Suscribe un callback a los cambios de estado de instalación
 * (llega prompt, se instala, etc.). Devuelve la función para desuscribir.
 */
export function onInstallStateChange (fn) {
  _subs.add(fn)
  return () => _subs.delete(fn)
}

/**
 * Dispara la instalación.
 *  - Si hay prompt nativo: lo lanza y devuelve 'accepted' | 'dismissed'.
 *  - Si no (iOS / navegador sin soporte): devuelve 'instructions' para que el
 *    llamador muestre las instrucciones. El Web Component lo hace solo.
 * @returns {Promise<'accepted'|'dismissed'|'instructions'|'installed'>}
 */
export async function promptInstall () {
  if (isAppInstalled()) return 'installed'
  if (_deferred) {
    const evt = _deferred
    try {
      evt.prompt()
      const choice = await evt.userChoice
      _deferred = null
      _emit()
      return (choice && choice.outcome) || 'dismissed'
    } catch (_) {
      _deferred = null
      _emit()
      return 'dismissed'
    }
  }
  return 'instructions'
}

/* ────────────────────────────────────────────────────────────────────────────
   i18n
   ──────────────────────────────────────────────────────────────────────────── */

const I18N = {
  es: {
    install: 'Instalar App',
    title: 'Instalar la app',
    iosIntro: 'Para instalar esta app en tu iPhone o iPad:',
    iosStep1: 'Pulsa el botón Compartir',
    iosStep2: 'Elige «Añadir a pantalla de inicio»',
    otherIntro: 'Tu navegador no permite la instalación con un toque. Para instalarla:',
    otherStep: 'Abre el menú del navegador y elige «Instalar app» (o «Añadir a pantalla de inicio»).',
    close: 'Cerrar',
    bigTitle: 'Instala la app',
    bigTitleNamed: (n) => `Instala ${n}`,
    bigSub: 'Acceso directo en tu pantalla de inicio, sin tienda de apps.',
    preparing: 'Preparando…',
    notNow: 'Ahora no'
  },
  en: {
    install: 'Install App',
    title: 'Install the app',
    iosIntro: 'To install this app on your iPhone or iPad:',
    iosStep1: 'Tap the Share button',
    iosStep2: 'Choose “Add to Home Screen”',
    otherIntro: 'Your browser can’t install with one tap. To install it:',
    otherStep: 'Open the browser menu and choose “Install app” (or “Add to Home Screen”).',
    close: 'Close',
    bigTitle: 'Install the app',
    bigTitleNamed: (n) => `Install ${n}`,
    bigSub: 'A shortcut on your home screen, no app store.',
    preparing: 'Preparing…',
    notNow: 'Not now'
  }
}

function resolveLang (attr) {
  const a = (attr || '').toLowerCase()
  if (a === 'es' || a === 'en') return a
  let doc = 'es'
  try { doc = (document.documentElement.lang || navigator.language || 'es').slice(0, 2) } catch (_) {}
  return doc === 'en' ? 'en' : 'es'
}

/* ────────────────────────────────────────────────────────────────────────────
   Iconos (inline SVG, sin assets externos)
   ──────────────────────────────────────────────────────────────────────────── */

// Flecha de descarga "instalar" (consistente con el ⬇ que ya usan varias apps).
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>'

// Icono "Compartir" de iOS (caja con flecha hacia arriba) para las instrucciones.
const ICON_IOS_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><polyline points="8 7 12 3 16 7"/><path d="M7 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>'

/* ────────────────────────────────────────────────────────────────────────────
   Web Component: <dotrino-install>
   Botón de instalar para el header de cualquier app. Se oculta solo si ya está
   instalada o si no hay forma de instalar. En iOS abre un modal con instrucciones.

   Atributos:
     lang   "es" | "en"  (default: <html lang> / navigator)
     label  texto del botón (default i18n "Instalar"/"Install")
     icon   "false" para ocultar el icono y dejar solo texto
   Custom properties (estilo):
     --cc-install-color, --cc-install-bg, --cc-install-bg-hover, --cc-install-radius,
     --cc-install-pad, --cc-install-gap, --cc-install-font-size, --cc-install-icon,
     --cc-install-focus
   Parts: button, icon, label, modal, modal-card
   Eventos: cc-install (cancelable, antes de actuar), cc-install-result (detail.outcome)
   ──────────────────────────────────────────────────────────────────────────── */

const STYLE = `
  :host { all: initial; display: inline-flex; vertical-align: middle; font-family: inherit; }
  :host([hidden]) { display: none; }
  button.trigger {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--cc-install-gap, 6px);
    padding: var(--cc-install-pad, 7px 12px);
    border-radius: var(--cc-install-radius, 12px);
    color: var(--cc-install-color, currentColor);
    background: var(--cc-install-bg, transparent);
    font-size: var(--cc-install-font-size, .95em);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background .15s ease, transform .1s ease, opacity .15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  button.trigger:hover { background: var(--cc-install-bg-hover, rgba(127,127,127,.16)); }
  button.trigger:active { transform: scale(.96); }
  button.trigger:focus-visible { outline: 2px solid var(--cc-install-focus, currentColor); outline-offset: 2px; }
  .ico { display: inline-flex; }
  .ico svg { width: var(--cc-install-icon, 18px); height: var(--cc-install-icon, 18px); display: block; }
  .lbl:empty { display: none; }

  /* Modal de instrucciones (iOS / fallback). */
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483600;
    display: flex; align-items: center; justify-content: center;
    padding: 16px; box-sizing: border-box;
    background: rgba(0,0,0,.5);
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  }
  .card {
    box-sizing: border-box;
    width: 100%; max-width: 360px;
    background: var(--cc-install-modal-bg, #fff);
    color: var(--cc-install-modal-color, #14110f);
    border-radius: 18px;
    padding: 22px 20px 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,.35);
    font-size: 15px; line-height: 1.5;
    font-family: inherit;
  }
  @media (prefers-color-scheme: dark) {
    .card {
      background: var(--cc-install-modal-bg, #1c1917);
      color: var(--cc-install-modal-color, #f5f3f0);
    }
  }
  .card h2 { margin: 0 0 10px; font-size: 18px; font-weight: 700; }
  .card p { margin: 0 0 12px; }
  .steps { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 10px; }
  .steps li { display: flex; align-items: center; gap: 10px; }
  .steps .n {
    flex: none; width: 24px; height: 24px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    background: var(--cc-install-accent, #84cc16); color: var(--cc-install-accent-color, #14110f);
  }
  .steps svg { width: 20px; height: 20px; flex: none; }
  .card .ok {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: block; width: 100%; text-align: center;
    padding: 11px; border-radius: 12px; font-weight: 700;
    background: var(--cc-install-accent, #84cc16); color: var(--cc-install-accent-color, #14110f);
  }
  .card .ok:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

  /* Overlay grande y centrado: aparece al llegar con ?pwa-install=1 (relanzado en Chrome). */
  .big { text-align: center; }
  .big .app-icon { width: 72px; height: 72px; border-radius: 18px; margin: 2px auto 14px; display: block; }
  .big h2 { font-size: 20px; }
  .big .sub { margin: 0 0 18px; opacity: .8; }
  .big .cta {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 16px;
    background: var(--cc-install-accent, #84cc16); color: var(--cc-install-accent-color, #14110f);
  }
  .big .cta[disabled] { opacity: .6; cursor: default; }
  .big .cta svg { width: 20px; height: 20px; }
  .big .manual { margin: 14px 2px 0; font-size: 14px; opacity: .85; }
  .big .dismiss {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: block; width: 100%; text-align: center;
    margin-top: 10px; padding: 8px; font-weight: 600; opacity: .7;
  }
`

class DotrinoInstall extends HTMLElement {
  static get observedAttributes () { return ['lang', 'label', 'icon', 'app-name', 'app-icon'] }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._modalOpen = false   // modal de instrucciones (iOS/fallback)
    this._bigOpen = false     // overlay grande de instalación (?pwa-install=1)
    this._bigManual = false   // el overlay grande pasó a instrucciones manuales
    this._unsub = null
    this._onState = this._render.bind(this)
    this._onKey = this._onKey.bind(this)
  }

  connectedCallback () {
    this._unsub = onInstallStateChange(this._onState)
    // Si llegamos con el marcador (relanzados en Chrome para instalar), abrimos
    // el overlay grande centrado. Solo el primero monta el overlay (singleton).
    if (hasInstallFlag() && !isAppInstalled() && !DotrinoInstall._bigClaimed) {
      DotrinoInstall._bigClaimed = true
      this._bigOpen = true
      try { document.addEventListener('keydown', this._onKey) } catch (_) {}
      // Si en unos segundos no hay prompt nativo, ofrecemos la vía manual.
      setTimeout(() => {
        if (this._bigOpen && !hasNativePrompt() && !isAppInstalled()) { this._bigManual = true; this._render() }
      }, 4000)
    }
    this._render()
  }

  disconnectedCallback () {
    if (this._unsub) { this._unsub(); this._unsub = null }
    try { document.removeEventListener('keydown', this._onKey) } catch (_) {}
    if (this._portal) { try { this._portal.remove() } catch (_) {} this._portal = null; this._portalShadow = null }
  }

  /* Los modales (instrucciones / overlay grande) usan position:fixed para
     centrarse en la ventana. Si el <dotrino-install> vive dentro de un ancestro
     con `backdrop-filter`/`transform` (topbars), ese ancestro se vuelve el bloque
     contenedor del fixed y el modal se descoloca. Por eso los renderizamos en un
     PORTAL colgado de <body>, con su propio shadow root y el tema copiado. */
  _portalRoot () {
    if (!this._portal) {
      this._portal = document.createElement('div')
      this._portal.setAttribute('data-dotrino-install-portal', '')
      this._portalShadow = this._portal.attachShadow({ mode: 'open' })
      try {
        const cs = getComputedStyle(this)
        for (const v of ['--cc-install-accent', '--cc-install-modal-bg', '--cc-install-modal-color']) {
          const val = cs.getPropertyValue(v)
          if (val && val.trim()) this._portal.style.setProperty(v, val.trim())
        }
      } catch (_) {}
      document.body.appendChild(this._portal)
    }
    return this._portalShadow
  }

  _renderPortal (innerHTML) {
    const root = this._portalRoot()
    root.innerHTML = innerHTML ? `<style>${STYLE}</style>${innerHTML}` : ''
    return root
  }

  attributeChangedCallback () {
    if (this.shadowRoot) this._render()
  }

  _render () {
    const ctx = installContext()                 // installed|native|ios|relaunch|none
    const showBtn = ctx === 'native' || ctx === 'ios' || ctx === 'relaunch'
    // Oculta el host por completo cuando no hay botón ni modal abierto.
    this.hidden = !showBtn && !this._modalOpen && !this._bigOpen
    if (this.hidden) { this.shadowRoot.innerHTML = ''; return }

    const lang = resolveLang(this.getAttribute('lang'))
    const t = I18N[lang]
    const label = this.getAttribute('label') != null ? this.getAttribute('label') : t.install
    const showIcon = (this.getAttribute('icon') || '').toLowerCase() !== 'false'

    // Botón pequeño en el shadow propio (inline en la topbar).
    let html = `<style>${STYLE}</style>`
    if (showBtn) {
      html += `<button class="trigger" type="button" part="button" aria-label="${label || t.install}">`
      if (showIcon) html += `<span class="ico" part="icon">${ICON_DOWNLOAD}</span>`
      html += `<span class="lbl" part="label">${label}</span></button>`
    }
    this.shadowRoot.innerHTML = html
    const btn = this.shadowRoot.querySelector('button.trigger')
    if (btn) btn.addEventListener('click', () => this._activate(ctx))

    // Modales en el PORTAL (body), para que el fixed se centre en la ventana.
    if (this._bigOpen) {
      const root = this._renderPortal(this._bigHTML(lang))
      const backdrop = root.querySelector('.backdrop')
      if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this._closeBig() })
      root.querySelector('.dismiss')?.addEventListener('click', () => this._closeBig())
      root.querySelector('.cta')?.addEventListener('click', () => this._bigInstall())
    } else if (this._modalOpen) {
      const root = this._renderPortal(this._modalHTML(lang))
      const backdrop = root.querySelector('.backdrop')
      const okBtn = root.querySelector('.ok')
      if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this._closeModal() })
      if (okBtn) okBtn.addEventListener('click', () => this._closeModal())
    } else if (this._portalShadow) {
      this._renderPortal('') // limpia el portal cuando no hay modal
    }
  }

  /** Overlay grande y centrado de instalación (al llegar con ?pwa-install=1). */
  _bigHTML (lang) {
    const t = I18N[lang]
    const name = this.getAttribute('app-name')
    const icon = this.getAttribute('app-icon')
    const title = name ? t.bigTitleNamed(name) : t.bigTitle
    const ready = hasNativePrompt()
    let body
    if (this._bigManual) {
      const step = isIOS() ? `${t.iosStep1} → ${t.iosStep2}` : t.otherStep
      body = `<p class="manual">${step}</p>`
    } else {
      body = `<button class="cta" type="button" ${ready ? '' : 'disabled'}>${ICON_DOWNLOAD}` +
        `<span>${ready ? t.install : t.preparing}</span></button>`
    }
    return `<div class="backdrop" part="modal" role="dialog" aria-modal="true" aria-label="${title}">` +
      `<div class="card big" part="modal-card">` +
      (icon ? `<img class="app-icon" src="${icon}" alt="" width="72" height="72" />` : '') +
      `<h2>${title}</h2><p class="sub">${t.bigSub}</p>${body}` +
      `<button class="dismiss" type="button">${t.notNow}</button></div></div>`
  }

  _modalHTML (lang) {
    const t = I18N[lang]
    let steps
    if (isIOS()) {
      steps = `<p>${t.iosIntro}</p><ul class="steps">` +
        `<li><span class="n">1</span><span>${t.iosStep1}</span>${ICON_IOS_SHARE}</li>` +
        `<li><span class="n">2</span><span>${t.iosStep2}</span></li></ul>`
    } else {
      steps = `<p>${t.otherIntro}</p><ul class="steps"><li><span class="n">1</span><span>${t.otherStep}</span></li></ul>`
    }
    return `<div class="backdrop" part="modal" role="dialog" aria-modal="true" aria-label="${t.title}">` +
      `<div class="card" part="modal-card"><h2>${t.title}</h2>${steps}` +
      `<button class="ok" type="button">${t.close}</button></div></div>`
  }

  async _activate (ctx) {
    const ev = new CustomEvent('cc-install', { bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(ev)) return // la app canceló para hacer lo suyo

    // Contexto embebido (Custom Tab desde otra PWA): no hay prompt nativo, así que
    // relanzamos la app en Chrome, donde la instalación sí funciona.
    if (ctx === 'relaunch') {
      const url = chromeInstallUrl()
      this.dispatchEvent(new CustomEvent('cc-install-result', { bubbles: true, composed: true, detail: { outcome: 'relaunch' } }))
      if (url) { try { location.href = url } catch (_) {} }
      return
    }

    const outcome = await promptInstall()
    if (outcome === 'instructions') {
      this._openModal()
    }
    this.dispatchEvent(new CustomEvent('cc-install-result', {
      bubbles: true, composed: true, detail: { outcome }
    }))
    this._render()
  }

  /** Botón grande del overlay: dispara el prompt nativo; si no hay, instrucciones. */
  async _bigInstall () {
    if (!hasNativePrompt()) { this._bigManual = true; this._render(); return }
    const outcome = await promptInstall()
    this.dispatchEvent(new CustomEvent('cc-install-result', { bubbles: true, composed: true, detail: { outcome } }))
    if (outcome === 'accepted' || outcome === 'installed') this._closeBig()
    else if (outcome === 'instructions') { this._bigManual = true; this._render() }
    else this._render()
  }

  _closeBig () {
    this._bigOpen = false
    try { document.removeEventListener('keydown', this._onKey) } catch (_) {}
    this._render()
  }

  _openModal () {
    this._modalOpen = true
    try { document.addEventListener('keydown', this._onKey) } catch (_) {}
    this._render()
  }

  _closeModal () {
    this._modalOpen = false
    try { document.removeEventListener('keydown', this._onKey) } catch (_) {}
    this._render()
  }

  _onKey (e) {
    if (e.key !== 'Escape') return
    if (this._bigOpen) this._closeBig()
    else this._closeModal()
  }

  /** Dispara la instalación desde JS de la app (igual que el click). */
  install () { return this._activate() }
}

if (typeof customElements !== 'undefined' && !customElements.get('dotrino-install')) {
  customElements.define('dotrino-install', DotrinoInstall)
}

DotrinoInstall._bigClaimed = false

export { DotrinoInstall, HOME_DEFAULT, INSTALL_PARAM }
