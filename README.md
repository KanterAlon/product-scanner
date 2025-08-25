# Product Scanner

Aplicación demo que reconoce productos alimenticios a partir de una fotografía y devuelve información pública de OpenFoodFacts.

## Características
- Backend en Node.js que usa Google Cloud Vision para detectar texto, códigos de barras, logos y objetos.
- Genera un término de búsqueda mediante OpenAI.
- Consulta OpenFoodFacts y expone los datos como JSON.
- Frontend estático mínimo para probar el flujo completo.

## Requisitos
- [Node.js](https://nodejs.org/) ≥ 18 y npm.
- Cuenta de Google Cloud con la API de Vision habilitada.
- Clave de API de OpenAI.

## Instalación
1. Clona este repositorio.
2. Copia `backend/.env.example` a `backend/.env` y completa las variables:
   ```env
   PORT=5000
   OPENAI_API_KEY=tu_clave_de_openai
   OPENFOODFACTS_PRODUCT_URL=https://world.openfoodfacts.org/api/v0/product
   OPENFOODFACTS_SEARCH_URL=https://world.openfoodfacts.org/cgi/search.pl
   ```
3. Descarga una clave de servicio de Google Cloud y guárdala como `backend/credentials/google-vision.json`. **Nunca** la subas al repositorio.
4. Instala dependencias desde la raíz (usa npm workspaces):
   ```bash
   npm install
   ```

## Ejecución
Inicia el backend y un servidor para el frontend:
```bash
npm run dev
```
El backend quedará en `http://localhost:5000` y el frontend en `http://localhost:8080/main.html`.

## Ejemplo de uso
Con el servidor en marcha puedes probar el endpoint `/upload` con el script incluido:
```bash
examples/curl-upload.sh examples/test-image.png
```
Esto envía la imagen y devuelve un JSON similar a:
```json
{
  "products": [
    {
      "aiResponse": "Ejemplo de producto",
      "offData": { "code": "0000000000000", "product_name": "Producto" }
    }
  ]
}
```

## Estructura del proyecto
```
backend/    # API Node.js
frontend/   # HTML de prueba
examples/   # Scripts y ejemplos de consumo
```

## Variables y credenciales
- `backend/.env` y `backend/credentials/google-vision.json` están ignorados por git.
- Utiliza un gestor de secretos o variables de entorno en producción.
- El TLS solo se desactiva cuando `NODE_ENV` ≠ `production`.

---
Este repositorio es solo un ejemplo educativo; no se recomienda su uso directo en producción.
