/**
 * @dotrino/install/vue
 *
 * Helper opcional para apps Vue 3 que prefieren su PROPIO botón (estilo a medida)
 * pero quieren la lógica compartida de instalación: captura temprana del prompt,
 * detección de iOS/standalone y modal de instrucciones sin alert().
 *
 * La mayoría de apps deberían usar directamente el Web Component
 * <dotrino-install> (funciona en Vue tras importar el paquete). Usá este
 * composable solo si necesitás integrar el botón en tu propio markup reactivo.
 *
 *   import { useInstall } from '@dotrino/install/vue'
 *   const { canInstall, isInstalled, install } = useInstall()
 *   // <button v-if="canInstall" @click="install">Instalar</button>
 *
 * `install()` dispara el prompt nativo si existe; si no (iOS / sin soporte)
 * devuelve 'instructions'. Si querés el modal de instrucciones ya hecho, usá el
 * Web Component; el composable deja esa decisión a tu UI.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import {
  canInstall as _canInstall,
  isAppInstalled,
  isIOS,
  hasNativePrompt,
  promptInstall,
  onInstallStateChange
} from './index.js'

export function useInstall () {
  const canInstall = ref(false)
  const isInstalled = ref(false)
  const native = ref(false)
  let unsub = null

  const sync = () => {
    canInstall.value = _canInstall()
    isInstalled.value = isAppInstalled()
    native.value = hasNativePrompt()
  }

  onMounted(() => {
    sync()
    unsub = onInstallStateChange(sync)
  })
  onUnmounted(() => { if (unsub) { unsub(); unsub = null } })

  return {
    /** ref<boolean>: hay forma de instalar y no está instalada. */
    canInstall,
    /** ref<boolean>: ya corre instalada (standalone). */
    isInstalled,
    /** ref<boolean>: hay prompt nativo (Chromium) listo, sin instrucciones. */
    hasNativePrompt: native,
    /** true si la plataforma es iOS (instalación manual vía Compartir). */
    isIOS,
    /** Dispara la instalación; resuelve 'accepted'|'dismissed'|'instructions'|'installed'. */
    install: () => promptInstall()
  }
}
