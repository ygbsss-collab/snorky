import { spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 8089;

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join('d:\\SNORK_prototype_v0.1', reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Server started on http://127.0.0.1:${PORT}`);
  
  const testCases = [
    {
      name: '390px Short Forecast (+1~+3)',
      file: path.resolve('d:/SNORK_prototype_v0.1/verification-daily-390-short.png'),
      url: `http://127.0.0.1:${PORT}/index.html?testDaily=22`,
      w: 390,
      h: 844
    },
    {
      name: '390px Mid Forecast (+4~+6)',
      file: path.resolve('d:/SNORK_prototype_v0.1/verification-daily-390-mid.png'),
      url: `http://127.0.0.1:${PORT}/index.html?testDaily=22&tab=mid`,
      w: 390,
      h: 844
    },
    {
      name: '360px Viewport',
      file: path.resolve('d:/SNORK_prototype_v0.1/verification-daily-360.png'),
      url: `http://127.0.0.1:${PORT}/index.html?testDaily=22`,
      w: 360,
      h: 780
    },
    {
      name: '375px Viewport',
      file: path.resolve('d:/SNORK_prototype_v0.1/verification-daily-375.png'),
      url: `http://127.0.0.1:${PORT}/index.html?testDaily=22`,
      w: 375,
      h: 812
    },
    {
      name: '430px Viewport',
      file: path.resolve('d:/SNORK_prototype_v0.1/verification-daily-430.png'),
      url: `http://127.0.0.1:${PORT}/index.html?testDaily=22`,
      w: 430,
      h: 932
    }
  ];

  for (const tc of testCases) {
    console.log(`\nCapturing: ${tc.name}...`);
    const tempDir = `C:\\Users\\user\\AppData\\Local\\Temp\\chrome_snap_${Date.now()}_${tc.w}`;
    const res = spawnSync(chromePath, [
      '--headless=new',
      `--user-data-dir=${tempDir}`,
      '--disable-gpu',
      '--no-sandbox',
      '--run-all-compositor-stages-before-draw',
      `--window-size=${tc.w},${tc.h}`,
      `--screenshot=${tc.file}`,
      '--virtual-time-budget=7000',
      tc.url
    ], { timeout: 25000 });

    if (fs.existsSync(tc.file)) {
      const stats = fs.statSync(tc.file);
      console.log(`✓ Saved ${tc.file} (${stats.size} bytes)`);
    } else {
      console.error(`✗ Failed to save ${tc.file}`);
      if (res.stderr) console.error(res.stderr.toString());
    }
  }

  server.close();
  console.log('\nAll captures completed!');
  process.exit(0);
});
