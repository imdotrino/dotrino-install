#!/bin/sh
# Dotrino — instalador universal de CLIs/agentes del ecosistema (Linux y macOS).
#
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <paquete-npm> [args...]
#
# Ejemplo (agente de la terminal):
#   curl -fsSL https://install.dotrino.com/install.sh | sh -s -- @dotrino/terminal-agent enroll
#
# Es una ALTERNATIVA a `npx <paquete>` (no reemplaza npx): asegura Node 20+ —lo
# baja LOCAL a ~/.dotrino si falta, SIN root ni tocar el sistema— y luego corre
# `npx -y <paquete> [args]`. Reutilizable por cualquier app: solo cambia el paquete.
# En Windows usa el equivalente PowerShell: https://install.dotrino.com/install.ps1
set -eu

PKG="${1:-}"
if [ -z "$PKG" ]; then
  echo "uso: curl -fsSL https://install.dotrino.com/install.sh | sh -s -- <paquete-npm> [args]" >&2
  echo "ej.: ... | sh -s -- @dotrino/terminal-agent enroll" >&2
  exit 2
fi
shift 2>/dev/null || true

NODE_MIN=20
NODE_VER="v20.18.1"                       # LTS embebido para el bootstrap sin root
DOT_DIR="${DOTRINO_HOME:-$HOME/.dotrino}"

log() { printf '%s\n' "$*" >&2; }

have_node() {
  command -v node >/dev/null 2>&1 || return 1
  v=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$v" -ge "$NODE_MIN" ] 2>/dev/null
}

target() {
  os=$(uname -s); arch=$(uname -m)
  case "$os" in Linux) o=linux ;; Darwin) o=darwin ;;
    *) log "SO no soportado por el auto-instalador de Node: $os. Instala Node $NODE_MIN+ y reintenta."; exit 1 ;;
  esac
  case "$arch" in
    x86_64|amd64) a=x64 ;; arm64|aarch64) a=arm64 ;; armv7l) a=armv7l ;;
    *) log "arquitectura no soportada: $arch. Instala Node $NODE_MIN+ y reintenta."; exit 1 ;;
  esac
  echo "$o-$a"
}

bootstrap_node() {
  t=$(target)
  dir="$DOT_DIR/node-${NODE_VER}-${t}"
  if [ ! -x "$dir/bin/node" ]; then
    log "Node $NODE_MIN+ no encontrado → bajando Node ${NODE_VER} (${t}) a ${DOT_DIR} (sin root)…"
    url="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${t}.tar.xz"
    mkdir -p "$DOT_DIR"
    tmp=$(mktemp -d)
    if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$tmp/node.tar.xz"
    elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp/node.tar.xz" "$url"
    else log "hace falta curl o wget para bajar Node."; exit 1
    fi
    tar -xJf "$tmp/node.tar.xz" -C "$DOT_DIR"
    rm -rf "$tmp"
  fi
  PATH="$dir/bin:$PATH"; export PATH
}

have_node || bootstrap_node

# `curl | sh` deja stdin conectado al pipe, no a la terminal: si el comando necesita
# entrada del usuario (p. ej. pegar el código de emparejamiento), reengancha la tty
# real. Solo si la salida es una terminal ([ -t 1 ]) Y /dev/tty se puede abrir — en
# CI/pipes sin terminal de control, reenganchar haría que el shell muriera.
if [ -t 1 ] && { : < /dev/tty; } 2>/dev/null; then exec < /dev/tty; fi

log "→ npx -y $PKG $*"
exec npx -y "$PKG" "$@"
