import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// Ez a végpont fogja lekérni a FiveM adatokat a szerver oldalon
app.get('/api/fivem', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`Lekérés: ${url}`);
    
    // TRÜKK: Úgy teszünk, mintha maga a FiveM játék kliens lennénk, így átverjük a szerver védelmét
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'CitizenFX/1', // Ez a legfontosabb sor, ez játssza ki a cenzúrát!
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'X-CitizenFX-Token': '1'
      },
      timeout: 15000
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Hiba a lekérés során:', error.message);
    res.status(500).json({ 
      error: 'Nem sikerült lekérni a FiveM API-t',
      message: error.message 
    });
  }
});

// Minden más kérésre a React appot adjuk vissza
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Szerver fut a ${PORT} porton`);
});
