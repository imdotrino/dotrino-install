import { chromium } from '../../dotrino-store/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'

const pkgRoot = fileURLToPath(new URL('..', import.meta.url))

const html = `<!doctype html><html lang="es"><body>
<dotrino-install id="btn"></dotrino-install>
<script type="module">
  import * as api from '/src/index.js'
  window.cc = api
  // Simula un BeforeInstallPromptEvent diferido como el de Chromium.
  window.fakePrompt = () => {
    const e = new Event('beforeinstallprompt')
    e.prompt = () => { window._promptCalled = true }
    e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
    window.dispatchEvent(e)
  }
  window.fakeInstalled = () => window.dispatchEvent(new Event('appinstalled'))
</script>
</body></html>`

const server = createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('content-type', 'text/html')
    return res.end(html)
  }
  try {
    const body = await readFile(pkgRoot + req.url.replace(/^\//, ''))
    res.setHeader('content-type', req.url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})
await new Promise((r) => server.listen(0, r))
const baseUrl = `http://localhost:${server.address().port}/`

const browser = await chromium.launch()
const results = {}
const fail = (k, msg) => { results[k] = '✗ ' + msg; console.error('FAIL', k, msg) }
const ok = (k) => { results[k] = '✓' }

// ── Caso A: Chromium de escritorio (no iOS, sin prompt todavía → oculto) ──
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => customElements.get('dotrino-install') && window.cc, null, { timeout: 5000 })

  // 1. registrado
  results['element-registered'] = (await page.evaluate(() => !!customElements.get('dotrino-install'))) ? '✓' : '✗'

  // 2. sin prompt y no-iOS: canInstall=false y host oculto
  const hiddenInit = await page.evaluate(() => window.cc.canInstall() === false && document.querySelector('#btn').hidden === true)
  hiddenInit ? ok('hidden-when-no-prompt') : fail('hidden-when-no-prompt', 'debería estar oculto sin prompt en desktop')

  // 3. tras beforeinstallprompt: aparece el botón con texto "Instalar" (es)
  await page.evaluate(() => window.fakePrompt())
  await page.waitForTimeout(50)
  const shown = await page.evaluate(() => {
    const el = document.querySelector('#btn')
    const lbl = el.shadowRoot?.querySelector('.lbl')?.textContent
    return !el.hidden && window.cc.canInstall() === true && window.cc.hasNativePrompt() === true && lbl === 'Instalar App'
  })
  shown ? ok('shows-on-bip') : fail('shows-on-bip', 'debería mostrar botón "Instalar" tras beforeinstallprompt')

  // 4. click dispara prompt() nativo
  await page.evaluate(() => document.querySelector('#btn').shadowRoot.querySelector('button.trigger').click())
  await page.waitForTimeout(50)
  const promptCalled = await page.evaluate(() => window._promptCalled === true)
  promptCalled ? ok('click-fires-native-prompt') : fail('click-fires-native-prompt', 'el click no llamó a prompt()')

  // 5. tras aceptar (userChoice) y consumir, ya no hay prompt nativo
  const consumed = await page.evaluate(() => window.cc.hasNativePrompt() === false)
  consumed ? ok('prompt-consumed') : fail('prompt-consumed', 'el prompt debería consumirse tras usarse')

  // 6. appinstalled → canInstall false, oculto
  await page.evaluate(() => window.fakeInstalled())
  await page.waitForTimeout(50)
  const afterInstall = await page.evaluate(() => window.cc.isAppInstalled() === true && document.querySelector('#btn').hidden === true)
  afterInstall ? ok('hides-after-appinstalled') : fail('hides-after-appinstalled', 'debería ocultarse tras appinstalled')

  if (errors.length) fail('no-page-errors-desktop', errors.join(' | '))
  else ok('no-page-errors-desktop')
  await page.close()
}

// ── Caso B: iOS (userAgent iPhone) → botón visible sin prompt, click abre modal ──
{
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => customElements.get('dotrino-install') && window.cc, null, { timeout: 5000 })

  // iOS: canInstall true aunque no haya prompt
  const iosShows = await page.evaluate(() => window.cc.isIOS() === true && window.cc.canInstall() === true && !document.querySelector('#btn').hidden)
  iosShows ? ok('ios-shows-without-prompt') : fail('ios-shows-without-prompt', 'iOS debería ofrecer instalar sin beforeinstallprompt')

  // click en iOS → abre modal de instrucciones (sin alert)
  await page.evaluate(() => document.querySelector('#btn').shadowRoot.querySelector('button.trigger').click())
  await page.waitForTimeout(80)
  const modalOpen = await page.evaluate(() => !!document.querySelector('#btn').shadowRoot.querySelector('.backdrop .card h2'))
  modalOpen ? ok('ios-click-opens-modal') : fail('ios-click-opens-modal', 'el click en iOS debería abrir el modal de instrucciones')

  // cerrar modal
  await page.evaluate(() => document.querySelector('#btn').shadowRoot.querySelector('.ok').click())
  await page.waitForTimeout(50)
  const modalClosed = await page.evaluate(() => !document.querySelector('#btn').shadowRoot.querySelector('.backdrop'))
  modalClosed ? ok('ios-modal-closes') : fail('ios-modal-closes', 'el modal debería cerrarse')

  if (errors.length) fail('no-page-errors-ios', errors.join(' | '))
  else ok('no-page-errors-ios')
  await ctx.close()
}

await browser.close()
await new Promise((r) => server.close(r))

console.log('\nResultados smoke @dotrino/install:')
for (const [k, v] of Object.entries(results)) console.log(`  ${v.startsWith('✓') ? '✓' : '✗'} ${k}${v.startsWith('✓') ? '' : ' — ' + v.slice(2)}`)
const failed = Object.values(results).filter((v) => !v.startsWith('✓'))
if (failed.length) { console.error(`\n${failed.length} fallo(s)`); process.exit(1) }
console.log('\nTodo OK')
