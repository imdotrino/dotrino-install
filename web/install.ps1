# Dotrino — instalador universal de CLIs/agentes del ecosistema (Windows PowerShell).
#
#   & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) <paquete-npm> [args...]
#
# Ejemplo:
#   & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) @dotrino/inspector
#   …y a partir de ahí, desde cualquier ventana:  dotrino-inspector
#
# INSTALA DE VERDAD: deja el comando en el PATH del USUARIO, sin administrador. Todo vive
# bajo %USERPROFILE%\.dotrino (Node incluido si hubo que bajarlo), así que desinstalar es
# borrar esa carpeta y quitar la entrada del PATH. En Linux/macOS:
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <paquete-npm> [args]
param(
  [Parameter(Position = 0)][string]$Pkg,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = 'Stop'

# Banderas, con la misma forma que en install.sh: van ANTES del paquete.
$RunOnce = $false; $NoPath = $false; $IgnoreScripts = $false
while ($Pkg -and $Pkg.StartsWith('-')) {
  switch ($Pkg) {
    '--run-once' { $RunOnce = $true }
    '--no-path' { $NoPath = $true }
    '--ignore-scripts' { $IgnoreScripts = $true }
  }
  $Pkg = if ($Rest.Count) { $Rest[0] } else { $null }
  $Rest = if ($Rest.Count -gt 1) { $Rest[1..($Rest.Count - 1)] } else { @() }
}

if (-not $Pkg) { $Pkg = $env:DOTRINO_PKG }
if (-not $Pkg) {
  Write-Host 'usage: & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) <npm-package> [args]'
  Write-Host 'e.g.:  ... @dotrino/inspector'
  exit 2
}

# Cada paso se dice EN CUANTO EMPIEZA, no cuando termina: lo que hace que un instalador
# parezca colgado no es que tarde, es que tarde sin decir en qué está.
function Step($m) { Write-Host "  . $m" }

$NodeMin = 20
$NodeVer = 'v20.18.1'
$DotDir = if ($env:DOTRINO_HOME) { $env:DOTRINO_HOME } else { Join-Path $env:USERPROFILE '.dotrino' }
$BinDir = Join-Path $DotDir 'bin'          # lo ÚNICO que entra al PATH
$NpmPrefix = Join-Path $DotDir 'npm'

function Test-NodeOk {
  try { return ([int](& node -p 'process.versions.node.split(".")[0]' 2>$null) -ge $NodeMin) }
  catch { return $false }
}

Write-Host "Dotrino installer - $Pkg"
$HadNode = Test-NodeOk
$NodeDir = $null
if ($HadNode) { Step "Node $(& node -p 'process.versions.node') found, using it" }
if (-not $HadNode) {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $NodeDir = Join-Path $DotDir "node-$NodeVer-win-$arch"
  if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
    Step "Node $NodeMin+ not found - downloading Node $NodeVer (win-$arch), about 25 MB, no admin needed"
    New-Item -ItemType Directory -Force -Path $DotDir | Out-Null
    $zip = Join-Path $env:TEMP "dotrino-node-$NodeVer-$arch.zip"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-$arch.zip" -OutFile $zip
    Step "unpacking Node into $DotDir"
    Expand-Archive -Path $zip -DestinationPath $DotDir -Force
    Remove-Item $zip -Force
  } else { Step "using the Node already downloaded in $DotDir" }
  $env:Path = "$NodeDir;$env:Path"
}

if ($Pkg -match ':') {
  $base, $ver = $Pkg -split ':', 2
  Write-Host "`"$Pkg`" is not a valid package: the version goes with @, not with :."
  Write-Host "  try:  $base@$ver"
  exit 2
}

# ── Lo de antes: correr y no dejar nada ─────────────────────────────────────────────
if ($RunOnce) {
  Write-Host "-> npx -y $Pkg $($Rest -join ' ')"
  & npx.cmd -y $Pkg @Rest
  exit $LASTEXITCODE
}

# ── Instalar de verdad ──────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BinDir, $NpmPrefix | Out-Null

# Los scripts de instalación van ACTIVADOS a propósito, al revés que en los repos del
# ecosistema (CONVENCIONES §1.1): aquí se instala un programa para USARLO, y alguno trae
# binario nativo que se elige en su `postinstall`. Con --ignore-scripts quedaría
# instalado y roto, que es peor que no instalarlo.
$scriptsFlag = if ($IgnoreScripts) { '--ignore-scripts' } else { $null }

# npm SIN silenciar: la instalación puede tardar bastante la primera vez y una ventana sin
# una sola línea se lee como un cuelgue.
Step "installing $Pkg into $DotDir (no admin) - the first time this can take a minute"
if ($scriptsFlag) { & npm.cmd install -g --prefix "$NpmPrefix" $scriptsFlag $Pkg }
else { & npm.cmd install -g --prefix "$NpmPrefix" $Pkg }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# El nombre del comando lo dice el paquete, no lo adivinamos.
$PkgName = $Pkg -replace '(.)@[^@/]*$', '$1'
$reader = @'
const { join } = require("node:path")
const fs = require("node:fs")
const dir = join(process.argv[1], "node_modules", process.argv[2])
const pkg = JSON.parse(fs.readFileSync(join(dir, "package.json"), "utf8"))
const bin = pkg.bin
const names = typeof bin === "string" ? [pkg.name.split("/").pop()] : Object.keys(bin || {})
process.stdout.write(names.join("\n"))
'@
$bins = @()
try { $bins = (& node -e $reader $NpmPrefix $PkgName) -split "`n" | Where-Object { $_ } } catch {}

if (-not $bins) {
  Write-Host "installed, but $PkgName declares no command. Nothing to put in the PATH."
  exit 0
}

# En Windows npm deja los shims (.cmd/.ps1) en la RAÍZ del prefijo; se copian al único
# directorio que va al PATH. Si bajamos Node, entra también aquí: si no, el shim no
# encuentra intérprete.
Step "copying $($bins -join ' ') into $BinDir"
foreach ($b in $bins) {
  foreach ($ext in @('', '.cmd', '.ps1')) {
    $src = Join-Path $NpmPrefix "$b$ext"
    if (Test-Path $src) { Copy-Item $src (Join-Path $BinDir "$b$ext") -Force }
  }
}
if ($NodeDir -and (Test-Path $NodeDir)) {
  Step "copying node, npm and npx there too (the command needs an interpreter)"
  foreach ($n in @('node.exe', 'npm.cmd', 'npx.cmd')) {
    $src = Join-Path $NodeDir $n
    if (Test-Path $src) { Copy-Item $src (Join-Path $BinDir $n) -Force }
  }
}

# ── El PATH del usuario, una sola vez y diciéndolo ──────────────────────────────────
$added = $false
if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$BinDir*") {                      # idempotente
    $newPath = if ($userPath) { "$BinDir;$userPath" } else { $BinDir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Step "added to your user PATH"
    $added = $true
  }
}

Write-Host ''
Write-Host "Installed: $($bins -join ' ')"
if ($added) {
  Write-Host "Added to your user PATH. A NEW window will find it. In this one:"
  Write-Host "  `$env:Path = `"$BinDir;`$env:Path`""
} else {
  Write-Host 'Your PATH already had it (or --no-path was used). If needed, add:'
  Write-Host "  `$env:Path = `"$BinDir;`$env:Path`""
}
Write-Host 'To update it later, run this same command again.'
Write-Host ''

# Sin argumentos NO se arranca la herramienta: muchas se quedan corriendo (un servidor,
# un agente, una UI) y el usuario, que pidió «instálame esto», ve una ventana parada sin
# haber pedido arrancar nada. Con argumentos sí, porque ahí pidió una acción concreta.
$env:Path = "$BinDir;$env:Path"
$first = $bins[0]
if (-not $Rest -or $Rest.Count -eq 0) {
  Write-Host "Now run it whenever you want:  $first"
  exit 0
}
Write-Host "-> $first $($Rest -join ' ')"
& (Join-Path $BinDir "$first.cmd") @Rest
exit $LASTEXITCODE
