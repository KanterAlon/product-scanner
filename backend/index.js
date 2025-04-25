process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // ⚠️ Solo para pruebas en desarrollo
require('dotenv').config();
process.env.GOOGLE_APPLICATION_CREDENTIALS = __dirname + '/credentials/google-vision.json'; // 👈 Add this

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const axios   = require('axios');
const vision  = require('@google-cloud/vision');

const app    = express();
app.use(cors());

// cliente Vision (ImageAnnotator para webDetection)
const client = new vision.ImageAnnotatorClient();

// multer en memoria
const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const buffer = req.file.buffer;

    // 1) Detectar entidades web en la imagen
    const [result] = await client.annotateImage({
      image: { content: buffer },
      features: [{ type: 'WEB_DETECTION', maxResults: 5 }],
    });
    const entities = result.webDetection.webEntities || [];
    if (!entities.length) {
      return res.status(404).json({ error: 'No se reconoció ningún producto' });
    }
    // Tomar la entidad con más relevancia
    const productName = entities[0].description;

    // 2) Buscar en OpenFoodFacts
    const offRes = await axios.get(process.env.OPENFOODFACTS_API_URL, {
      params: {
        search_terms: productName,
        search_simple: 1,
        action: 'process',
        json: 1,
      }
    });

    // 3) Enviar resultado
    return res.json({
      producto_detectado: productName,
      datos_openfoodfacts: offRes.data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
});
