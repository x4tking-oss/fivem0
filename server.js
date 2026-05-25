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

// FiveM Proxy végpont
app.get('/api/fivem', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'API Error', message: error.message });
  }
});

// JAVÍTOTT ÚTVONAL: Express 5 kompatibilis minden kérést elkapó route
app.get('/:any*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Szerver fut a ${PORT} porton`);
});
