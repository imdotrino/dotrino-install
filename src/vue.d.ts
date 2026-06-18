import type { Ref } from 'vue'
import type { InstallOutcome } from './index'

export interface UseInstall {
  /** hay forma de instalar y la app no está instalada. */
  canInstall: Ref<boolean>
  /** ya corre instalada (standalone). */
  isInstalled: Ref<boolean>
  /** hay prompt nativo (Chromium) listo, sin instrucciones. */
  hasNativePrompt: Ref<boolean>
  /** true si la plataforma es iOS (instalación manual vía Compartir). */
  isIOS(): boolean
  /** Dispara la instalación; resuelve el desenlace. */
  install(): Promise<InstallOutcome>
}

/**
 * Composable Vue 3: lógica compartida de instalación PWA para apps que usan su
 * propio botón. Para el botón ya hecho, usá el Web Component <dotrino-install>.
 */
export function useInstall(): UseInstall
