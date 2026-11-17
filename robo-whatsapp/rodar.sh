#!/data/data/com.termux/files/usr/bin/bash
# Mantém o robô rodando: se o programa parar, espera 10s e liga de novo.
# Usado pelo Termux:Boot (~/.termux/boot) para ligar sozinho quando o celular reinicia.
cd "$(dirname "$0")" || exit 1
termux-wake-lock 2>/dev/null
LOG="$(pwd)/robo.log"
log() { echo "[$(date '+%d/%m/%Y, %H:%M:%S')] $*" >>"$LOG"; }

# Não subir dois robôs ao mesmo tempo (boot e loop podem se cruzar).
if command -v pgrep >/dev/null 2>&1 && pgrep -f "node index.mjs" >/dev/null 2>&1; then
  log 'Já existia um robô rodando; não subi outro.'
  exit 0
fi

inicio=$(date +%s)
while true; do
  node index.mjs
  codigo=$?
  [ "$codigo" = "2" ] && { log 'Robô desconectado do WhatsApp: precisa parear de novo.'; exit 2; }
  rodou=$(( $(date +%s) - inicio ))
  log "Robô parou (código $codigo depois de ${rodou}s). Reiniciando em 10s."
  sleep 10
  inicio=$(date +%s)
done
