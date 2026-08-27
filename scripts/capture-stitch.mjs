import http from 'http';
import fs from 'fs';

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const tabs = await fetchJSON('http://127.0.0.1:9222/json');
  console.log('Tabs:', tabs);
  
  const pageTab = tabs.find(t => t.type === 'page');
  if (!pageTab) {
    console.error('No page tab found');
    return;
  }
  
  const wsUrl = pageTab.webSocketDebuggerUrl;
  console.log('WS URL:', wsUrl);
  
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };
  
  ws.onopen = async () => {
    console.log('Connected to CDP');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Runtime.enable');
    
    // wait 10 seconds for stitch to render
    console.log('Waiting 10s for page render...');
    await new Promise(r => setTimeout(r, 10000));
    
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    if (screenshot && screenshot.data) {
      fs.writeFileSync('d:/SNORK_prototype_v0.1/stitch_screen.png', Buffer.from(screenshot.data, 'base64'));
      console.log('Saved d:/SNORK_prototype_v0.1/stitch_screen.png');
    }
    
    // Evaluate document title and text content
    const evalRes = await send('Runtime.evaluate', {
      expression: `({
        title: document.title,
        bodyText: document.body.innerText,
        html: document.body.innerHTML.slice(0, 5000)
      })`,
      returnByValue: true
    });
    console.log('Evaluation:', JSON.stringify(evalRes.result.value, null, 2));
    
    ws.close();
    process.exit(0);
  };
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
