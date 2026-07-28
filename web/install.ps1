# Dotrino — instalador universal de CLIs/agentes del ecosistema (Windows PowerShell).
#
#   & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) <paquete-npm> [args...]
#
# Ejemplo (agente de la terminal):
#   & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) @dotrino/terminal-agent enroll
#
# Es una ALTERNATIVA a `npx <paquete>` (no lo reemplaza): asegura Node 20+ —lo baja
# LOCAL a %USERPROFILE%\.dotrino si falta, SIN admin— y corre `npx -y <paquete> [args]`.
# Reutilizable por cualquier app: solo cambia el paquete. En Linux/macOS:
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <paquete-npm> [args]
param(
  [Parameter(Position = 0)][string]$Pkg,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = 'Stop'

if (-not $Pkg) { $Pkg = $env:DOTRINO_PKG }
if (-not $Pkg) {
  Write-Host 'usage: & ([scriptblock]::Create((irm https://install.dotrino.com/install.ps1))) <npm-package> [args]'
  Write-Host 'e.g.:  ... @dotrino/terminal-agent enroll'
  exit 2
}

$NodeMin = 20
$NodeVer = 'v20.18.1'
$DotDir = if ($env:DOTRINO_HOME) { $env:DOTRINO_HOME } else { Join-Path $env:USERPROFILE '.dotrino' }

function Test-NodeOk {
  try { return ([int](& node -p 'process.versions.node.split(".")[0]' 2>$null) -ge $NodeMin) }
  catch { return $false }
}

$HadNode = Test-NodeOk
$dir = $null
if (-not $HadNode) {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $dir = Join-Path $DotDir "node-$NodeVer-win-$arch"
  if (-not (Test-Path (Join-Path $dir 'node.exe'))) {
    Write-Host "Node $NodeMin+ not found -> downloading Node $NodeVer (win-$arch) into $DotDir (no admin needed)..."
    New-Item -ItemType Directory -Force -Path $DotDir | Out-Null
    $zip = Join-Path $env:TEMP "dotrino-node-$NodeVer-$arch.zip"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-$arch.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $DotDir -Force
    Remove-Item $zip -Force
  }
  $env:Path = "$dir;$env:Path"
}

# Node bajado por nosotros: esta ventana lo tiene en el PATH, pero UNA VENTANA NUEVA NO.
# Sin decirlo, el segundo comando de cualquier herramienta (emparejar, ver estado, la TUI)
# falla con «npx no se reconoce» y parece que la instalación salió mal. Así que se dice,
# con la línea exacta que hay que pegar.
$Bootstrapped = (-not $HadNode) -and $dir -and (Test-Path $dir)

Write-Host "-> npx -y $Pkg $($Rest -join ' ')"
& npx.cmd -y $Pkg @Rest
$rc = $LASTEXITCODE

if ($Bootstrapped) {
  Write-Host ''
  Write-Host 'Node was installed for THIS window only. To use the tool from another one,'
  Write-Host 'paste this first:'
  Write-Host ''
  Write-Host "  `$env:Path = `"$dir;`$env:Path`""
  Write-Host ''
  Write-Host 'Or, if you will use it often, install it for good (no administrator needed):'
  Write-Host ''
  Write-Host "  `$env:Path = `"$dir;`$env:Path`"; npm i -g $Pkg"
  Write-Host ''
}
exit $rc
