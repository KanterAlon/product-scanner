// backend/index.js

// ⚠️ Solo para desarrollo: desactiva la verificación TLS (no usar en producción)
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
require('dotenv').config();

const path    = require('path');
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const axios   = require('axios');
const vision  = require('@google-cloud/vision');
const sharp   = require('sharp');

const app = express();
app.use(cors());

// Ruta a credenciales de Google Vision
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(
  __dirname, 'credentials', 'google-vision.json'
);
// URLs de OpenFoodFacts
const OFF_PROD_URL   = process.env.OPENFOODFACTS_PRODUCT_URL;
const OFF_SEARCH_URL = process.env.OPENFOODFACTS_SEARCH_URL;

const visionClient = new vision.ImageAnnotatorClient();
const upload       = multer({ storage: multer.memoryStorage() });

// Helper: buscar en OFF por texto
async function searchOFF(terms) {
  try {
    const res = await axios.get(OFF_SEARCH_URL, {
      params: { search_terms: terms, search_simple: 1, action: 'process', json: 1 }
    });
    return res.data.count > 0 ? res.data : null;
  } catch (err) {
    console.error('Error al conectar con OpenFoodFacts:', err.message);
    return null;
  }
}

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const buffer = req.file.buffer;

    // Preparar respuesta en streaming (NDJSON)
    res.setHeader('Content-Type', 'application/x-ndjson');

    // 1) Localizar objetos para identificar posibles productos
    let objResp;
    try {
      [objResp] = await visionClient.annotateImage({
        image: { content: buffer },
        // MaxResults alto para detectar objetos pequeños y grandes
        features: [ { type: 'OBJECT_LOCALIZATION', maxResults: 100 } ]
      });
    } catch (err) {
      console.error('Error al conectar con Google Vision:', err.message);
      res.status(502).end(JSON.stringify({ error: 'Google Vision: ' + err.message }) + '\n');
      return;
    }

    const { width, height } = await sharp(buffer).metadata();
    const objects = objResp.localizedObjectAnnotations || [];
    const regions = objects.length ? objects.map(o => {
      const verts = o.boundingPoly.normalizedVertices || [];
      const xs = verts.map(v => (v.x || 0) * width);
      const ys = verts.map(v => (v.y || 0) * height);
      let left = Math.max(0, Math.min(...xs));
      let top = Math.max(0, Math.min(...ys));
      let right = Math.min(width, Math.max(...xs));
      let bottom = Math.min(height, Math.max(...ys));

      // Añade un margen alrededor para capturar mejor objetos pequeños
      const padX = Math.floor((right - left) * 0.1);
      const padY = Math.floor((bottom - top) * 0.1);
      left   = Math.max(0, left - padX);
      top    = Math.max(0, top - padY);
      right  = Math.min(width, right + padX);
      bottom = Math.min(height, bottom + padY);

      return {
        left: Math.floor(left),
        top: Math.floor(top),
        width: Math.floor(right - left),
        height: Math.floor(bottom - top)
      };
    }) : [{ left: 0, top: 0, width, height }];

    // Enviar conteo de regiones detectadas
    res.write(JSON.stringify({ type: 'count', count: regions.length }) + '\n');

    for (let idx = 0; idx < regions.length; idx++) {
      const region = regions[idx];

      let cropBuffer;
      try {
        cropBuffer = await sharp(buffer).extract(region).toBuffer();
      } catch (err) {
        console.error('Error al recortar imagen:', err.message);
        res.write(JSON.stringify({ type: 'product', index: idx, aiResponse: 'error', title: 'Error', offImage: null }) + '\n');
        continue;
      }

      // 2) Analizar recorte con todas las features
      let vResp;
      try {
        [vResp] = await visionClient.annotateImage({
          image: { content: cropBuffer },
          features: [
            { type: 'BARCODE_DETECTION' },
            { type: 'LOGO_DETECTION',    maxResults: 5 },
            { type: 'DOCUMENT_TEXT_DETECTION' },
            { type: 'WEB_DETECTION',     maxResults: 5 },
            { type: 'LABEL_DETECTION',   maxResults: 10 },
            { type: 'OBJECT_LOCALIZATION' }
          ]
        });
      } catch (err) {
        console.error('Error Vision en recorte:', err.message);
        continue;
      }

      // 3) Parsear resultados de Vision
      const barcodes = (vResp.barcodeAnnotations || []).map(b => b.rawValue);
      const logos    = (vResp.logoAnnotations   || []).map(l => ({ name: l.description, score: l.score }));
      const text     = vResp.fullTextAnnotation?.text?.trim() || '';
      const webEnts  = (vResp.webDetection?.webEntities || []).map(e => ({ desc: e.description, score: e.score }));
      const labels   = (vResp.labelAnnotations || []).map(l => ({ desc: l.description, score: l.score }));
      const objs     = (vResp.localizedObjectAnnotations || []).map(o => o.name);

      const visionData = { barcodes, logos, text, webEnts, labels, objects: objs };

      // 4) Prompt para OpenAI
      const prompt = `
    Eres un asistente en ESPAÑOL experto en productos alimenticios. Recibes un JSON con datos de Google Vision sobre un envase.
Tu tarea es devolver SOLO el término de búsqueda más corto y útil para buscar ese producto en OpenFoodFacts.

    ✅ REGLAS CLARAS:
    1. Usa el texto OCR (\`text\`) como fuente PRINCIPAL para identificar el nombre genérico.
       - Si hay varias líneas, elige la más descriptiva en ESPAÑOL que indique qué es el producto.
       - Omite frases de marketing, ingredientes o instrucciones.
    2. Solo incluye la marca si aparece en \`logos\`.
    3. El resultado debe estar en SINGULAR, sin sabores, variantes ni cantidades.
    4. Si el nombre genérico está en otro idioma, TRADÚCELO al español.
    5. Usa \`webEnts\` y \`labels\` solo como APOYO para confirmar el OCR, NUNCA como reemplazo.
    6. No inventes datos. Si no está claro, deja fuera esa parte.
    7. Devuelve SOLO el término limpio, sin comillas ni explicaciones.

    ✅ EJEMPLOS:
    - "Barritas Íntegra de Proteína con Arándanos y Semillas" → Barrita Íntegra
    - "Font Vella Agua Mineral Natural" (con logo Font Vella) → Font Vella Agua Mineral
    - "Nestlé Chocolate KitKat 4 barras" (con logo KitKat) → KitKat

    Ahora, procesa este JSON y devuelve SOLO la línea con el término final (sin comillas ni nada más):

    \`\`\`json
    ${JSON.stringify(visionData, null, 2)}
    \`\`\`
    `.trim();

      // 5) Llamada a OpenAI
      let aiResp;
      try {
        aiResp = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'Eres un asistente que genera términos de búsqueda para OpenFoodFacts, en español y con marcas reales.' },
              { role: 'user',   content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 32
          },
          {
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
          }
        );
      } catch (err) {
        console.error('Error al conectar con OpenAI:', err.message);
        continue;
      }

      const aiResponse = aiResp.data.choices[0].message.content.trim();

      // 6) Consultar OpenFoodFacts
      let offData = null;
      for (const code of barcodes) {
        try {
          const byCode = await axios.get(`${OFF_PROD_URL}/${encodeURIComponent(code)}.json`);
          if (byCode.data.status === 1) {
            offData = byCode.data.product;
            break;
          }
        } catch (err) {
          console.error('Error en OpenFoodFacts por código de barras:', err.message);
        }
      }

      if (!offData) {
        const offSearch = await searchOFF(aiResponse);
        if (offSearch) {
          offData = offSearch.products?.[0] || offSearch;
        }
      }

      const offLink  = offData?.url || (offData?.code ? `${OFF_PROD_URL}/${offData.code}` : null);
      const offImage = offData?.image_url || offData?.image_front_url || null;

      const title = offData?.product_name || aiResponse;

      res.write(
        JSON.stringify({
          type: 'product',
          index: idx,
          aiResponse,
          title,
          offImage,
          offLink
        }) + '\n'
      );
    }

    // 7) Finalizar stream
    res.write(JSON.stringify({ type: 'done' }) + '\n');
    res.end();
  } catch (err) {
    console.error('Error en /upload:', err.message);
    res.status(500).end(JSON.stringify({ error: err.message || 'Internal error' }) + '\n');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend escuchando en http://localhost:${PORT}`));
