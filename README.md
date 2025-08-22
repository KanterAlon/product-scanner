# Product Scanner

Este proyecto detecta productos alimenticios usando una foto. El backend usa Google Vision para reconocer texto, códigos de barras y logos, luego utiliza OpenAI para generar un término de búsqueda y consulta OpenFoodFacts para obtener información del producto.

## Instalación

1. Copia `.env.example` a `backend/.env` y completa las variables necesarias.
2. Coloca tus credenciales de Google Vision en `backend/credentials/google-vision.json` (revisa `backend/credentials/README.md`).
3. Instala las dependencias desde la raíz del proyecto. Gracias a [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) esto también instalará las del backend:
   ```bash
   npm install
   ```

## Uso

Levanta el backend y un servidor simple para el frontend con:
```bash
npm run dev
```
Luego abre `http://127.0.0.1:8080/main.html` en un navegador para probar la aplicación.

## Variables de entorno

Revisa `backend/.env.example` para conocer todas las variables necesarias:
- `PORT` puerto del servidor.
- `OPENAI_API_KEY` clave de API para OpenAI.
- `OPENFOODFACTS_PRODUCT_URL` y `OPENFOODFACTS_SEARCH_URL` URLs de la API de OpenFoodFacts.
