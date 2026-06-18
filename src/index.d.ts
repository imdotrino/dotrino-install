export type InstallOutcome = 'accepted' | 'dismissed' | 'instructions' | 'installed'

/** ¿La app ya corre como instalada (display-mode standalone) o se instaló ya? */
export function isAppInstalled(): boolean

/** Detección de iOS/iPadOS (incluye el iPad que se reporta como Mac). */
export function isIOS(): boolean

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
 * Atributos: `lang` ("es"|"en"), `label` (texto), `icon` ("false" oculta el icono).
 * Eventos: `cc-install` (cancelable), `cc-install-result` (detail.outcome).
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
