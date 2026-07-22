#!/bin/bash
echo "========================================="
echo "   INICIANDO SERVIDOR DE IMPRESSÃO"
echo "        BALNEÁRIO RIO PRETO"
echo "========================================="
cd "$(dirname "$0")"

# Verifica se os pacotes necessários estão instalados
if [ ! -d "node_modules/usb" ]; then
    echo "Instalando dependências pela primeira vez..."
    npm install
fi

echo "Iniciando Elgin Printer Server..."
node elgin_printer_server.js
