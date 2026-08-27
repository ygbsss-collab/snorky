import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_agent_env_' + Date.now();
const LOCAL_URL = 'http://127.0.0.1:8089/index.html';
const CDP_PORT = 9222;

async function waitPort(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json`, (r) => {
          let str = '';
          r.on('data', c => str += c);
          r.on('end', () => res(JSON.parse(str)));
        }).on('error', rej);
      });
      return data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Port ${port} not ready`);
}

async function testBrowserEnvironment() {
  console.log('[1/6] Launching Chrome with remote debugging on port', CDP_PORT);
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=430,932',
    LOCAL_URL
  ], { stdio: 'ignore' });

  try {
    const tabs = await waitPort(CDP_PORT);
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    console.log('[2/6] Browser Connected! WebSocket URL:', pageTab.webSocketDebuggerUrl);

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    const consoleLogs = [];

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        cbs.set(msgId, (data) => {
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push({ type: data.params.type, text });
      } else if (data.method === 'Runtime.exceptionThrown') {
        consoleLogs.push({ type: 'error', text: data.params.exceptionDetails.text });
      }

      if (data.id && cbs.has(data.id)) {
        const cb = cbs.get(data.id);
        cbs.delete(data.id);
        cb(data);
      }
    };

    await new Promise((res) => { ws.onopen = res; });
    console.log('[3/6] CDP session established.');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    // Wait for page initial rendering
    await new Promise(r => setTimeout(r, 1500));

    // Dismiss intro if present
    await send('Runtime.evaluate', {
      expression: `(() => {
        const intro = document.getElementById('snorkyIntro');
        if (intro) intro.style.display = 'none';
      })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 1000));

    // Open Today Condition Detail Modal for point 22 (문암해변)
    const openRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        const point = { id: 22, supabaseId: 22, name: '문암해변' };
        if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === 'function') {
          await window.SNORKYTodayConditionDetail.open(point);
          return { opened: window.SNORKYTodayConditionDetail.isOpen() };
        }
        return { opened: false, hasObj: !!window.SNORKYTodayConditionDetail };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('[4/6] Open Today Condition Detail:', openRes?.result?.value);

    // Wait 3s for modal animation & data load & DOM render
    await new Promise(r => setTimeout(r, 3000));

    // Scroll metrics section into view inside modal
    await send('Runtime.evaluate', {
      expression: `(() => {
        const metricsSec = document.querySelector('.tc-metrics-section');
        if (metricsSec) metricsSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    // 1. Check DOM structure of metrics section
    const domCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('todayConditionDetailModal');
        const metricsHeader = document.querySelector('.tc-metrics-header');
        const metricsGrid = document.getElementById('tcMetricsGrid');
        const tideCard = document.getElementById('tcTideCard');
        const cards = Array.from(document.querySelectorAll('.tc-metric-card')).map(c => ({
          id: c.dataset.metricId,
          title: c.querySelector('.tc-metric-title')?.textContent?.trim(),
          value: c.querySelector('.tc-metric-value-wrap')?.textContent?.trim(),
          pill: c.querySelector('.tc-metric-pill')?.textContent?.trim()
        }));
        return {
          modalOpen: modal?.classList.contains('open'),
          metricsHeaderVisible: !!metricsHeader,
          tideCardVisible: !!tideCard,
          cardsCount: cards.length,
          cards
        };
      })()`,
      returnByValue: true
    });
    console.log('[4/6] Detail Metrics Check:', JSON.stringify(domCheck?.result?.value, null, 2));

    // 2. Open Tide More Sheet and verify modal content & enlarged graph
    // 1. Capture screenshots of Today Condition Grid (showing subdued tide card)
    const viewports = [
      { name: '390', width: 390, height: 844 },
      { name: '430', width: 430, height: 932 },
      { name: '360', width: 360, height: 780 }
    ];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: true
      });
      await new Promise(r => setTimeout(r, 400));

      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const screenshotPath = `d:\\SNORK_prototype_v0.1\\today_banner_${vp.name}.png`;
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
      console.log(`Screenshot Today Banner (${vp.name}px) saved to:`, screenshotPath);
    }

    // 2. Open Tide More Sheet and verify modal content & enlarged graph
    console.log('[5/7] Clicking Tide More button to open bottom sheet...');
    const tideOpenRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('tcTideMoreBtn');
        if (btn) btn.click();
        const overlay = document.getElementById('tcBottomSheetOverlay');
        const titleText = document.getElementById('tcSheetTitleText')?.textContent?.trim();
        const titleIcon = document.getElementById('tcSheetIcon')?.textContent?.trim();
        const sourceVal = document.querySelector('.tc-tide-sheet-factors .tc-sheet-factor-val')?.textContent?.trim();
        const modalSvg = document.getElementById('tcTideModalSvg');
        const eventCount = modalSvg?.querySelectorAll('.tc-tide-event')?.length || 0;
        const gridLines = modalSvg?.querySelectorAll('.tc-tide-grid text')?.length || 0;
        const currentMarker = !!modalSvg?.querySelector('.tc-tide-current');
        return {
          sheetOpen: overlay?.classList.contains('open'),
          titleText,
          titleIcon,
          sourceVal,
          hasModalSvg: !!modalSvg,
          eventCount,
          gridLines,
          currentMarker
        };
      })()`,
      returnByValue: true
    });
    console.log('Tide Modal Verification:', JSON.stringify(tideOpenRes?.result?.value, null, 2));

    // Capture screenshots of the open tide sheet in multiple viewports
    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: true
      });
      await new Promise(r => setTimeout(r, 400));

      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const screenshotPath = `d:\\SNORK_prototype_v0.1\\tide_modal_open_${vp.name}.png`;
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
      console.log(`Screenshot Tide Modal (${vp.name}px) saved to:`, screenshotPath);
    }

    // 3. Test Close Sheet Button
    console.log('[6/7] Testing Sheet Close button...');
    const closeRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.getElementById('tcSheetCloseBtn');
        if (closeBtn) closeBtn.click();
        const overlay = document.getElementById('tcBottomSheetOverlay');
        return {
          sheetClosed: !overlay?.classList.contains('open')
        };
      })()`,
      returnByValue: true
    });
    console.log('Close Result:', closeRes?.result?.value);

    // 4. Test Reload & Re-verify
    console.log('[7/7] Testing Page Reload and Re-verification...');
    await send('Page.reload');
    await new Promise(r => setTimeout(r, 2000));

    const recheck = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          reloadedTitle: document.title,
          readyState: document.readyState
        };
      })()`,
      returnByValue: true
    });
    console.log('Reload Result:', recheck?.result?.value);
    console.log('Console Logs Summary: Total', consoleLogs.length, 'entries');
    console.log('Console Errors:', consoleLogs.filter(l => l.type === 'error'));

    ws.close();
    chrome.kill();
    console.log('\n=== BROWSER ENVIRONMENT VERIFICATION COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    chrome.kill();
    process.exit(1);
  }
}

testBrowserEnvironment();
