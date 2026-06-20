export type InstallOutcome = 'accepted' | 'dismissed' | 'instructions' | 'installed' | 'relaunch'
export type InstallContext = 'installed' | 'native' | 'ios' | 'relaunch' | 'none'

/** ¿La app ya corre como instalada (display-mode standalone) o se instaló ya? */
export function isAppInstalled(): boolean

/** Atajo legible de `isAppInstalled()`. */
export function isStandalone(): boolean

/** Detección de iOS/iPadOS (incluye el iPad que se reporta como Mac). */
export function isIOS(): boolean

/** Detección de Android. */
export function isAndroid(): boolean

/** Nombre del parámetro marcador ("pwa-install"). */
export const INSTALL_PARAM: string

/** ¿La URL trae el marcador `?pwa-install=1` (tras relanzar en Chrome)? */
export function hasInstallFlag(param?: string): boolean

/**
 * `intent://` que reabre la app en Chrome (no el Custom Tab/webview embebido)
 * con `?pwa-install=1`, con fallback a https. Solo útil en Android. null si falla.
 */
export function chromeInstallUrl(param?: string): string | null

/**
 * Estado de cara a la UI: 'installed' | 'native' (prompt nativo) | 'ios'
 * (instrucciones Safari) | 'relaunch' (Android embebido → abrir en Chrome) | 'none'.
 */
export function installContext(): InstallContext

/** ¿Tiene sentido ofrecer instalar? (prompt nativo disponible, o iOS, y no instalada). */
export function canInstall(): boolean

/** ¿Hay un prompt nativo (Chromium) listo para dispararse sin instrucciones? */
export function hasNativePrompt(): boolean

/** Suscribe un callback a los cambios de estado de instalación. Devuelve el desuscriptor. */
export function onInstallStateChange(fn: () => void): () => void

/**
 * Dispara la instalación. Lanza el prompt nativo si existe; si no, devuelve
 * 'instructions' para que el llamador muestre instrucciones (el Web Component
 * lo hace solo con su modal).
 */
export function promptInstall(): Promise<InstallOutcome>

export const HOME_DEFAULT: string

/**
 * Custom element del botón de instalar (`<dotrino-install>`).
 * Atributos: `lang` ("es"|"en"), `label` (texto), `icon` ("false" oculta el icono),
 * `app-name` y `app-icon` (título e icono del overlay grande de instalación).
 * En Android dentro de un Custom Tab (sin prompt nativo) el botón relanza la app
 * en Chrome; al llegar con `?pwa-install=1` muestra un overlay grande centrado.
 * Eventos: `cc-install` (cancelable), `cc-install-result` (detail.outcome, incluye 'relaunch').
 */
export class DotrinoInstall extends HTMLElement {
  /** Dispara la instalación desde JS (igual que el click del usuario). */
  install(): Promise<void>
}

declare global {
  interface HTMLElementTagNameMap {
    'dotrino-install': DotrinoInstall
  }
}
