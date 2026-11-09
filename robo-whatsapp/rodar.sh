#!/data/data/com.termux/files/usr/bin/bash
# Mantém o robô rodando: se o programa parar, espera 10s e liga de novo.
# Usado pelo Termux:Boot (~/.termux/boot) para ligar sozinho quando o celular reinicia.
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null
while true; do
  node index.mjs
  codigo=$?
  [ "$codigo" = "2" ] && { echo "Robô desconectado do WhatsApp: precisa parear de novo."; exit 2; }
  sleep 10
done
