# @dotrino/install

> **Parte del ecosistema [Dotrino](https://dotrino.com).** Misión: aplicaciones que resuelven problemas comunes, respetando tu privacidad — sin anuncios, sin cookies, sin rastreo de datos, sin vender tu identidad a nadie.

Botón de **"Instalar app"** (PWA) unificado para todo el ecosistema
[Dotrino](https://dotrino.com).

Resuelve la fragmentación de tener el mismo flujo `beforeinstallprompt` copiado a
mano en cada app (Vue y vanilla), donde cada copia divergió y arrastra los mismos
bugs sutiles. Un solo Web Component, testeado, igual en todas las apps.

Sin JS de terceros, sin cookies, autohosteado (Shadow DOM). Bilingüe es/en.

## Por qué un paquete y no copiar el snippet

El botón es trivial; lo que **no** lo es —y por eso se centraliza— son tres
detalles que casi todas las copias hacían mal:

1. **`beforeinstallprompt` se dispara muy pronto**, a veces antes de montar el
   componente. Si lo escuchás en `onMounted` lo perdés y el botón nunca aparece.
   Aquí se captura a nivel de módulo, en el `import`.
2. **iOS/Safari no soporta `beforeinstallprompt`** ni API de instalación: la
   única vía es *Compartir → Añadir a pantalla de inicio*. Sin esto, en iPhone la
   app simplemente no se puede instalar. Lo resolvemos con un **modal de
   instrucciones propio** (no `alert()`, prohibido en el ecosistema).
3. **No reaparecer** cuando la app ya corre instalada (`display-mode: standalone`)
   ni tras `appinstalled`.

## Uso — Web Component (recomendado)

```js
// Vue: importa el paquete una vez (p. ej. en main.js) y usa el tag.
import '@dotrino/install'
```

```html
<header class="topbar">
  <dotrino-install></dotrino-install>
</header>
```

```html
<!-- vanilla -->
<script type="module" src=".../@dotrino/install/src/index.js"></script>
<dotrino-install lang="es"></dotrino-install>
```

El elemento se **oculta solo** (no ocupa espacio) cuando no hay forma de instalar
o la app ya está instalada. En Chromium muestra el botón cuando llega el prompt y
lo dispara al hacer click. En iOS muestra el botón siempre (hasta que se instale)
y al hacer click abre el modal con las instrucciones de *Compartir*.

### Atributos

| Atributo | Valores | Default |
|---|---|---|
| `lang` | `es` \| `en` | `<html lang>` / navegador |
| `label` | texto del botón | `Instalar` / `Install` |
| `icon` | `false` para ocultar el icono | icono visible |
| `android-apk` | URL del APK (release) o de Play de la TWA | — |
| `android-package` | id del paquete (`com.dotrino.<app>`) | — |
| `android-label` | texto del botón en modo Android | `Instalar app Android` |

#### Preferir la TWA en Android

Si pasás `android-apk`, en **Android** el botón **prefiere la app nativa (TWA)** sobre
el PWA: al tocarlo descarga/abre ese APK (o la ficha de Play). Con `android-package` +
`related_applications` en tu manifest, usa `getInstalledRelatedApps()` para **ocultarse
si la app ya está instalada**. En desktop/iOS se comporta como siempre (prompt PWA /
instrucciones). Ver la receta para generar la TWA en `TWA.md` del ecosistema.

```html
<dotrino-install
  android-apk="https://github.com/imdotrino/dotrino-wallet/releases/latest/download/wallet.apk"
  android-package="com.dotrino.wallet">
</dotrino-install>
```

### Estilo (custom properties)

`--cc-install-color`, `--cc-install-bg`, `--cc-install-bg-hover`,
`--cc-install-radius`, `--cc-install-pad`, `--cc-install-gap`,
`--cc-install-font-size`, `--cc-install-icon`, `--cc-install-focus`,
`--cc-install-accent` (acento del modal), `--cc-install-modal-bg`,
`--cc-install-modal-color`.

Parts: `button`, `icon`, `label`, `modal`, `modal-card`.

### Eventos

- `cc-install` — cancelable, antes de actuar (`preventDefault()` para hacer lo tuyo).
- `cc-install-result` — `detail.outcome`: `accepted` \| `dismissed` \| `instructions` \| `installed`.

## Uso programático

Para apps que quieren su propio botón con la lógica compartida:

```js
import { canInstall, promptInstall, onInstallStateChange, isIOS } from '@dotrino/install'

const unsub = onInstallStateChange(() => { miBoton.hidden = !canInstall() })
miBoton.onclick = async () => {
  const outcome = await promptInstall() // 'accepted' | 'dismissed' | 'instructions' | 'installed'
  if (outcome === 'instructions') mostrarMisInstrucciones() // iOS / navegador sin soporte
}
```

API: `isAppInstalled()`, `isIOS()`, `canInstall()`, `hasNativePrompt()`,
`promptInstall()`, `onInstallStateChange(fn) → unsub`.

### Composable Vue 3

```js
import { useInstall } from '@dotrino/install/vue'
const { canInstall, isInstalled, install } = useInstall()
```
```html
<button v-if="canInstall" @click="install">Instalar</button>
```

> Para el botón ya hecho (con modal iOS incluido) usá el Web Component; el
> composable es solo para botones a medida.

## Test

```sh
npm test   # Playwright contra Chromium: prompt nativo, appinstalled y rama iOS
```

## Licencia

MIT
