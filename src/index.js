/**
 * @dotrino/install
 *
 * Botón de "Instalar app" (PWA) unificado y reutilizable por CUALQUIER app del
 * ecosistema Dotrino (Vue o vanilla). Resuelve la fragmentación de tener el
 * mismo flujo `beforeinstallprompt` copiado a mano en cada app, con tres bugs
 * recurrentes que aquí se arreglan de una vez:
 *
 *   1. El evento `beforeinstallprompt` se dispara MUY pronto (a veces antes de
 *      montar el componente). Si lo escuchás dentro de onMounted lo perdés y el
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
 * Uso programático (si querés tu propio botón) — ver también ./vue:
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
const _subs = new Set()   // suscriptores a cambios de estado (re-render)

function _emit () {
  for (const fn of _subs) {
    try { fn() } catch (_) {}
  }
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
    close: 'Cerrar'
  },
  en: {
    install: 'Install App',
    title: 'Install the app',
    iosIntro: 'To install this app on your iPhone or iPad:',
    iosStep1: 'Tap the Share button',
    iosStep2: 'Choose “Add to Home Screen”',
    otherIntro: 'Your browser can’t install with one tap. To install it:',
    otherStep: 'Open the browser menu and choose “Install app” (or “Add to Home Screen”).',
    close: 'Close'
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
    background: var(--cc-install-accent, #84cc16); color: #14110f;
  }
  .steps svg { width: 20px; height: 20px; flex: none; }
  .card .ok {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: block; width: 100%; text-align: center;
    padding: 11px; border-radius: 12px; font-weight: 700;
    background: var(--cc-install-accent, #84cc16); color: #14110f;
  }
  .card .ok:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`

class DotrinoInstall extends HTMLElement {
  static get observedAttributes () { return ['lang', 'label', 'icon'] }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._modalOpen = false
    this._unsub = null
    this._onState = this._render.bind(this)
    this._onKey = this._onKey.bind(this)
  }

  connectedCallback () {
    this._unsub = onInstallStateChange(this._onState)
    this._render()
  }

  disconnectedCallback () {
    if (this._unsub) { this._unsub(); this._unsub = null }
    try { document.removeEventListener('keydown', this._onKey) } catch (_) {}
  }

  attributeChangedCallback () {
    if (this.shadowRoot) this._render()
  }

  _render () {
    const show = canInstall()
    // Oculta el host por completo cuando no hay nada que ofrecer (no ocupa espacio).
    this.hidden = !show
    if (!show && !this._modalOpen) {
      this.shadowRoot.innerHTML = ''
      return
    }

    const lang = resolveLang(this.getAttribute('lang'))
    const t = I18N[lang]
    const label = this.getAttribute('label') != null ? this.getAttribute('label') : t.install
    const showIcon = (this.getAttribute('icon') || '').toLowerCase() !== 'false'

    let html = `<style>${STYLE}</style>`
    html += `<button class="trigger" type="button" part="button" aria-label="${label || t.install}">`
    if (showIcon) html += `<span class="ico" part="icon">${ICON_DOWNLOAD}</span>`
    html += `<span class="lbl" part="label">${label}</span></button>`

    if (this._modalOpen) html += this._modalHTML(lang)

    this.shadowRoot.innerHTML = html
    const btn = this.shadowRoot.querySelector('button.trigger')
    if (btn) btn.addEventListener('click', () => this._activate())

    if (this._modalOpen) {
      const close = () => this._closeModal()
      const backdrop = this.shadowRoot.querySelector('.backdrop')
      const okBtn = this.shadowRoot.querySelector('.ok')
      if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })
      if (okBtn) okBtn.addEventListener('click', close)
    }
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

  async _activate () {
    const ev = new CustomEvent('cc-install', { bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(ev)) return // la app canceló para hacer lo suyo

    const outcome = await promptInstall()
    if (outcome === 'instructions') {
      this._openModal()
    }
    this.dispatchEvent(new CustomEvent('cc-install-result', {
      bubbles: true, composed: true, detail: { outcome }
    }))
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
    if (e.key === 'Escape') this._closeModal()
  }

  /** Dispara la instalación desde JS de la app (igual que el click). */
  install () { return this._activate() }
}

if (typeof customElements !== 'undefined' && !customElements.get('dotrino-install')) {
  customElements.define('dotrino-install', DotrinoInstall)
}

export { DotrinoInstall, HOME_DEFAULT }
