#!/usr/bin/env bash
# Envia una imagen al backend local y muestra la respuesta JSON.
# Uso: ./curl-upload.sh [ruta_de_imagen]

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
IMAGE=${1:-$SCRIPT_DIR/test-image.png}

curl -s -F "image=@${IMAGE}" http://localhost:5000/upload
