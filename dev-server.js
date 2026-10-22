/**
 * dev-server.js - Servidor de desarrollo local ligero (Zero Dependencies)
 * 
 * Permite probar la aplicación frontend y la función Netlify localmente
 * sin requerir la instalación pesada de Netlify CLI.
 * 
 * Ejecución:
 *   npm start   o   node dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler: sendSmsHandler } = require('./netlify/functions/send-sms.js');

// Cargar variables de entorno desde .env si existe (sin dependencias externas)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim();
        process.env[key] = value;
      }
    }
  });
  console.log('📄 Variables de entorno cargadas desde .env');
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Manejo de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Enrutar hacia la Netlify Function send-sms
  if (req.url.startsWith('/.netlify/functions/send-sms') || req.url.startsWith('/api/send-sms')) {
    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });

    req.on('end', async () => {
      try {
        const event = {
          httpMethod: req.method,
          path: req.url,
          headers: req.headers,
          body: bodyData
        };

        const result = await sendSmsHandler(event);

        res.writeHead(result.statusCode || 200, {
          'Content-Type': 'application/json',
          ...(result.headers || {})
        });
        res.end(result.body || '');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
      }
    });
    return;
  }

  // 2. Servir archivos estáticos de public/
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Seguridad: evitar directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acceso denegado');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 No Encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Servidor de desarrollo MRW Envíos activo en: http://localhost:${PORT}`);
  console.log(`📡 Endpoint Netlify Function: http://localhost:${PORT}/api/send-sms`);
  console.log(`💻 Presiona Ctrl+C para detener el servidor.\n`);
});
