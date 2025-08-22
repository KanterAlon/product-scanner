#!/usr/bin/env bash
# Envia una imagen al backend local y muestra la respuesta JSON.
# Uso: ./curl-upload.sh [ruta_de_imagen]

IMAGE=${1:-../frontend/test-image.png}

curl -s -F "image=@${IMAGE}" http://localhost:5000/upload
