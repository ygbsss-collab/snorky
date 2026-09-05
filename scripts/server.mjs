import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HOST = '127.0.0.1';
const PORT = 5501;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  // CORS & Host headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      });
      file.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} is already in use.`);
    process.exit(1);
  } else {
    console.error(`[ERROR] Server error:`, err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SNORKY Server running on http://${HOST}:${PORT}`);
  console.log(`- Local:             http://127.0.0.1:${PORT}/`);
});
