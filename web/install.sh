#!/bin/sh
# Dotrino — instalador universal de CLIs/agentes del ecosistema (Linux y macOS).
#
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <paquete-npm> [args...]
#
# Ejemplo:
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- @dotrino/inspector
#   …y a partir de ahí, desde cualquier terminal:  dotrino-inspector
#
# INSTALA DE VERDAD: deja el comando en el PATH, sin root y sin tocar el sistema. Todo
# vive bajo ~/.dotrino (Node incluido si hacía falta bajarlo), así que desinstalar es
# borrar esa carpeta y la línea del rc. Antes esto solo hacía `npx` y no dejaba comando:
# había que repetir el `curl` entero cada vez.
#
#   --run-once      no instala: corre el paquete una vez con npx (lo de antes)
#   --ignore-scripts  no ejecuta los scripts de instalación de las dependencias
#   --no-path       no toca el rc del shell (imprime la línea para pegarla)
# En Windows: https://install.dotrino.com/install.ps1
set -eu

PKG=''
RUN_ONCE=0
NO_PATH=0
IGNORE_SCRIPTS=0
ARGS_START=0

for a in "$@"; do
  if [ "$ARGS_START" = 1 ]; then continue; fi
  case "$a" in
    --run-once) RUN_ONCE=1; shift ;;
    --no-path) NO_PATH=1; shift ;;
    --ignore-scripts) IGNORE_SCRIPTS=1; shift ;;
    -*) shift ;;
    *) PKG="$a"; shift; ARGS_START=1 ;;
  esac
done

if [ -z "$PKG" ]; then
  echo "usage: curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <npm-package> [args]" >&2
  echo "e.g.:  ... | sh -s -- @dotrino/inspector" >&2
  exit 2
fi

NODE_MIN=20
NODE_VER="v20.18.1"                       # LTS embebido para el bootstrap sin root
DOT_DIR="${DOTRINO_HOME:-$HOME/.dotrino}"
BIN_DIR="$DOT_DIR/bin"                    # LO ÚNICO que se mete al PATH: así la línea
NPM_PREFIX="$DOT_DIR/npm"                 # del rc no cambia aunque cambie lo de dentro

log() { printf '%s\n' "$*" >&2; }
# Cada paso se dice EN CUANTO EMPIEZA, no cuando termina: lo que hace que un instalador
# parezca colgado no es que tarde, es que tarde sin decir en qué está.
step() { printf '  · %s\n' "$*" >&2; }

have_node() {
  command -v node >/dev/null 2>&1 || return 1
  v=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$v" -ge "$NODE_MIN" ] 2>/dev/null
}

target() {
  os=$(uname -s); arch=$(uname -m)
  case "$os" in Linux) o=linux ;; Darwin) o=darwin ;;
    *) log "OS not supported by the Node auto-installer: $os. Install Node $NODE_MIN+ and try again."; exit 1 ;;
  esac
  case "$arch" in
    x86_64|amd64) a=x64 ;; arm64|aarch64) a=arm64 ;; armv7l) a=armv7l ;;
    *) log "unsupported architecture: $arch. Install Node $NODE_MIN+ and try again."; exit 1 ;;
  esac
  echo "$o-$a"
}

bootstrap_node() {
  t=$(target)
  dir="$DOT_DIR/node-${NODE_VER}-${t}"
  if [ ! -x "$dir/bin/node" ]; then
    step "Node $NODE_MIN+ not found — downloading Node ${NODE_VER} (${t}), about 25 MB, no root needed"
    url="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${t}.tar.xz"
    mkdir -p "$DOT_DIR"
    tmp=$(mktemp -d)
    # Con barra de progreso (-#), no en silencio: son 25 MB y en una conexión lenta el
    # silencio dura minutos.
    if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar "$url" -o "$tmp/node.tar.xz"
    elif command -v wget >/dev/null 2>&1; then wget --show-progress -qO "$tmp/node.tar.xz" "$url"
    else log "curl or wget is required to download Node."; exit 1
    fi
    step "unpacking Node into $DOT_DIR"
    tar -xJf "$tmp/node.tar.xz" -C "$DOT_DIR"
    rm -rf "$tmp"
  else
    step "using the Node already downloaded in $DOT_DIR"
  fi
  PATH="$dir/bin:$PATH"; export PATH
  BOOTSTRAPPED_DIR="$dir"
}

# `@dotrino/vaultd:latest` es un error fácil: el separador de npm es `@`, no `:`. Sin esto,
# npm lo toma por una RUTA LOCAL y falla buscando `./@dotrino/vaultd:latest/package.json`,
# que no dice nada de lo que pasó.
case "$PKG" in
  *:*) log "\"$PKG\" is not a valid package: the version goes with @, not with :."
       log "  try:  ${PKG%%:*}@${PKG##*:}"
       exit 2 ;;
esac

log "Dotrino installer — $PKG"
if have_node; then
  step "Node $(node -p 'process.versions.node' 2>/dev/null) found, using it"
else
  bootstrap_node
fi

# `curl | sh` deja stdin conectado al pipe, no a la terminal: si la herramienta necesita
# entrada del usuario (p. ej. pegar el código de emparejamiento), hay que darle la tty.
#
# PERO NO CON `exec < /dev/tty`, que es lo que había aquí y rompió el instalador el
# 2026-08-24: con `curl | sh` el stdin del shell **es el propio script**, así que
# reemplazarlo tira a la basura todo lo que quedaba por leer y el shell se queda leyendo
# órdenes del teclado — parado, mudo, y con pinta de colgado. No se notó durante años
# porque el script era corto y esa línea estaba casi al final; al crecer, se comió medio
# instalador.
#
# La tty se le pasa a CADA COMANDO que la pueda necesitar, no al shell. Sin tty usable
# (CI, cron), /dev/null: nunca el pipe, que es el script.
if [ -t 1 ] && { : < /dev/tty; } 2>/dev/null; then STDIN_SRC=/dev/tty; else STDIN_SRC=/dev/null; fi

# ── Lo de antes: correr y no dejar nada ─────────────────────────────────────────────
if [ "$RUN_ONCE" = 1 ]; then
  log "→ npx -y $PKG $*"
  exec npx -y "$PKG" "$@" < "$STDIN_SRC"
fi

# ── Instalar de verdad ──────────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR" "$NPM_PREFIX"

# Los scripts de instalación de las dependencias van ACTIVADOS a propósito, al revés que
# en los repos del ecosistema (CONVENCIONES §1.1): aquí no se está montando un árbol de
# dependencias para desarrollar, se está instalando un programa para USARLO, y algunos
# traen binario nativo que se elige en el `postinstall` (el PTY del agente de terminal).
# Con `--ignore-scripts` quedaría instalado y roto, que es peor que no instalarlo.
SCRIPTS_FLAG=''
if [ "$IGNORE_SCRIPTS" = 1 ]; then SCRIPTS_FLAG='--ignore-scripts'; fi

# npm SIN silenciar: la instalación puede tardar bastante la primera vez y un minuto sin
# una sola línea se lee como un cuelgue. Mejor ver el ruido de npm que dudar.
step "installing $PKG into $DOT_DIR (no root) — the first time this can take a minute"
npm install -g --prefix "$NPM_PREFIX" $SCRIPTS_FLAG "$PKG" < "$STDIN_SRC"

# El nombre del comando lo dice el paquete, no lo adivinamos: así esto vale para
# cualquier pieza del ecosistema sin cablear nada.
PKG_NAME=$(printf '%s' "$PKG" | sed 's/\(.\)@[^@/]*$/\1/')
BINS=$(node -e '
  const { join } = require("node:path")
  const fs = require("node:fs")
  const dir = join(process.argv[1], "lib", "node_modules", process.argv[2])
  const pkg = JSON.parse(fs.readFileSync(join(dir, "package.json"), "utf8"))
  const bin = pkg.bin
  const names = typeof bin === "string" ? [pkg.name.split("/").pop()] : Object.keys(bin || {})
  process.stdout.write(names.join("\n"))
' "$NPM_PREFIX" "$PKG_NAME" 2>/dev/null || true)

if [ -z "$BINS" ]; then
  log "installed, but $PKG_NAME declares no command. Nothing to put in the PATH."
  exit 0
fi

# Un solo directorio en el PATH, con enlaces a lo instalado. Si bajamos Node, entra
# también aquí: si no, el `#!/usr/bin/env node` del comando no encuentra intérprete.
step "linking$(printf ' %s' $BINS) into $BIN_DIR"
for b in $BINS; do
  [ -e "$NPM_PREFIX/bin/$b" ] && ln -sf "$NPM_PREFIX/bin/$b" "$BIN_DIR/$b"
done
if [ -n "${BOOTSTRAPPED_DIR:-}" ]; then
  step "linking node, npm and npx there too (the command needs an interpreter)"
  for n in node npm npx; do
    [ -e "$BOOTSTRAPPED_DIR/bin/$n" ] && ln -sf "$BOOTSTRAPPED_DIR/bin/$n" "$BIN_DIR/$n"
  done
fi

# ── El PATH, una sola vez y diciéndolo ──────────────────────────────────────────────
PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""
MARK_A='# >>> dotrino >>>'
MARK_B='# <<< dotrino <<<'

added=''
if [ "$NO_PATH" = 0 ]; then
  # Los rc del shell interactivo primero. `.profile` SOLO si no hay ninguno: escribir en
  # los dos deja el mismo directorio dos veces en el PATH y toca un archivo de más.
  rcs=''
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc" ] && rcs="$rcs $rc"
  done
  [ -z "$rcs" ] && rcs=" $HOME/.profile"
  for rc in $rcs; do
    if grep -qF "$MARK_A" "$rc" 2>/dev/null; then continue; fi   # idempotente
    printf '\n%s\n%s\n%s\n' "$MARK_A" "$PATH_LINE" "$MARK_B" >> "$rc"
    added="$added $rc"
  done
fi

if [ -n "$added" ]; then step "added to your PATH in:$added"; fi

FIRST=$(printf '%s' "$BINS" | head -n1)
log ""
log "Installed:$(printf ' %s' $BINS)"
if [ -n "$added" ]; then
  log "A NEW terminal will find it. In this one:  export PATH=\"$BIN_DIR:\$PATH\""
else
  log "Your PATH was left untouched. Add this line to your shell config:"
  log "  $PATH_LINE"
fi
log "To update it later, run this same command again."
log ""

# Sin argumentos NO se arranca la herramienta: muchas se quedan corriendo (un servidor,
# un agente, una UI) y el usuario, que pidió «instálame esto», ve una terminal parada sin
# haber pedido arrancar nada. Se instala, se dice el comando, y él decide cuándo.
# Con argumentos sí, porque ahí pidió una acción concreta (`… -- <pkg> enroll`).
PATH="$BIN_DIR:$PATH"; export PATH
if [ "$#" -eq 0 ]; then
  log "Now run it whenever you want:  $FIRST"
  exit 0
fi
log "→ $FIRST $*"
exec "$BIN_DIR/$FIRST" "$@" < "$STDIN_SRC"
