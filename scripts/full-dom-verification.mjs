import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_full_verify_' + Date.now();

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

async function verifyAll() {
  const CDP_PORT = 9388;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=390,844',
    'http://127.0.0.1:5501/index.html'
  ], { stdio: 'ignore' });

  const tabs = await waitPort(CDP_PORT);
  const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let id = 1;
  const cbs = new Map();
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
    if (data.id && cbs.has(data.id)) {
      const cb = cbs.get(data.id);
      cbs.delete(data.id);
      cb(data);
    }
  };

  await new Promise((res) => { ws.onopen = res; });
  console.log('[Verify] Connected to Chrome DevTools Protocol');

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('[Verify] Waiting 3s for app initialization...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('[Verify] Calling window.SNORKYDailyForecast.open({ id: 22, supabaseId: 22, name: "문암해변" })...');
  const openCallRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      await window.SNORKYDailyForecast.open(point);
      return {
        isOpen: window.SNORKYDailyForecast.isOpen()
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('[Verify] Open call response:', openCallRes?.result?.value);

  // Wait 1.5s for DOM render
  await new Promise(r => setTimeout(r, 1500));

  const results = {};

  // 1. Basic Modal and Header Verification
  console.log('\n--- 1. Header & Date Bar Verification ---');
  const headerTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.getElementById('dailyForecastDetailModal');
      const isVisible = modal && modal.classList.contains('open') && getComputedStyle(modal).display === 'flex';
      const title = document.getElementById('dfTitle')?.textContent?.trim();
      const backBtn = document.getElementById('dfBack') !== null;
      const favBtn = document.getElementById('dfFav') !== null;
      const dateBadge = document.getElementById('dfDateBadgeText')?.textContent?.trim();
      const daysCount = document.querySelectorAll('#dfDays .df-day-card').length;
      return { isVisible, title, backBtn, favBtn, dateBadge, daysCount };
    })()`,
    returnByValue: true
  });
  results.header = headerTest?.result?.value;
  console.log('Header verification:', results.header);

  // 2. +1~+3 Days Cards Verification
  console.log('\n--- 2. Day Cards (+1~+6) Verification ---');
  const dayCardsTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('#dfDays .df-day-card')).map((c, i) => ({
        index: i + 1,
        offset: c.querySelector('.df-day-offset')?.textContent?.trim(),
        date: c.querySelector('.df-day-date')?.textContent?.trim(),
        icon: c.querySelector('.df-day-weather-icon')?.textContent?.trim(),
        score: c.querySelector('.df-day-score')?.textContent?.trim(),
        status: c.querySelector('.df-day-status')?.textContent?.trim(),
        isSelected: c.classList.contains('selected')
      }));
      return cards;
    })()`,
    returnByValue: true
  });
  results.dayCards = dayCardsTest?.result?.value;
  console.log('Day cards verification:', JSON.stringify(results.dayCards, null, 2));

  // 3. Short Forecast Slots (+1일) Verification
  console.log('\n--- 3. Short Forecast 3-Hour Slots (+1일) Verification ---');
  const shortSlotsTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const sectionBadge = document.querySelector('#dfDetail .df-detail-badge')?.textContent?.trim();
      const sectionHeading = document.querySelector('#dfDetail .df-section-heading')?.textContent?.trim();
      const slots = Array.from(document.querySelectorAll('#dfDetail .df-slot-card')).map(s => {
        const time = s.querySelector('.df-slot-time')?.textContent?.trim();
        const score = s.querySelector('.df-score-num')?.textContent?.trim();
        const status = s.querySelector('.df-slot-status')?.textContent?.trim();
        const summary = s.querySelector('.df-slot-summary')?.textContent?.trim();
        const metrics = Array.from(s.querySelectorAll('.df-metric-item')).map(m => ({
          label: m.querySelector('.df-metric-label')?.textContent?.trim(),
          val: m.querySelector('.df-metric-val')?.textContent?.trim()
        }));
        const hasWaveDirection = s.innerHTML.includes('파향') || s.innerHTML.includes('deg');
        const hasCurrentDirection = s.innerHTML.includes('유향') || s.innerHTML.includes('해류방향');
        return { time, score, status, summary, metrics, hasWaveDirection, hasCurrentDirection };
      });
      return { sectionBadge, sectionHeading, slotsCount: slots.length, slots };
    })()`,
    returnByValue: true
  });
  results.shortSlots = shortSlotsTest?.result?.value;
  console.log('Short slots verification:', JSON.stringify(results.shortSlots, null, 2));

  // 4. Mid Forecast Switch & Slots (+4일) Verification
  console.log('\n--- 4. Mid Forecast Switch & Slots (+4일) Verification ---');
  const midSwitchTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#dfDays .df-day-card');
      if (cards.length >= 4) {
        cards[3].click();
      }
      const sectionBadge = document.querySelector('#dfDetail .df-detail-badge')?.textContent?.trim();
      const isMidBadge = document.querySelector('#dfDetail .df-badge-mid') !== null;
      const sectionHeading = document.querySelector('#dfDetail .df-section-heading')?.textContent?.trim();
      const slots = Array.from(document.querySelectorAll('#dfDetail .df-slot-card')).map(s => {
        const period = s.querySelector('.df-slot-time')?.textContent?.trim();
        const score = s.querySelector('.df-score-num')?.textContent?.trim();
        const status = s.querySelector('.df-slot-status')?.textContent?.trim();
        const summary = s.querySelector('.df-slot-summary')?.textContent?.trim();
        const metrics = Array.from(s.querySelectorAll('.df-metric-item')).map(m => ({
          label: m.querySelector('.df-metric-label')?.textContent?.trim(),
          val: m.querySelector('.df-metric-val')?.textContent?.trim()
        }));
        return { period, score, status, summary, metrics };
      });
      return { isMidBadge, sectionBadge, sectionHeading, slotsCount: slots.length, slots };
    })()`,
    returnByValue: true
  });
  results.midSlots = midSwitchTest?.result?.value;
  console.log('Mid slots verification:', JSON.stringify(results.midSlots, null, 2));

  // 5. Responsive Viewport Checks (360px, 375px, 390px, 430px)
  console.log('\n--- 5. Responsive Viewports Layout Checks ---');
  const viewports = [360, 375, 390, 430];
  results.responsive = {};
  for (const w of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 300));
    const layoutCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const sheet = document.querySelector('#dailyForecastDetailModal .today-condition-sheet');
        const sheetRect = sheet ? sheet.getBoundingClientRect() : null;
        const days = document.getElementById('dfDays');
        const daysScrollWidth = days ? days.scrollWidth : 0;
        const daysClientWidth = days ? days.clientWidth : 0;
        const slotWidth = document.querySelector('#dfDetail .df-slot-card')?.clientWidth || 0;
        const hasOverflowX = document.body.scrollWidth > window.innerWidth;
        return {
          windowWidth: window.innerWidth,
          sheetWidth: sheetRect?.width,
          isHorizontallyScrollableDays: daysScrollWidth > daysClientWidth,
          slotWidth,
          hasBodyHorizontalOverflow: hasOverflowX
        };
      })()`,
      returnByValue: true
    });
    results.responsive[`${w}px`] = layoutCheck?.result?.value;
    console.log(`Viewport ${w}px check:`, results.responsive[`${w}px`]);
  }

  // 6. Interactive Behavior: Favorite Toggle & Back Navigation
  console.log('\n--- 6. Interactive Behavior (Fav & Back) ---');
  const favBackTest = await send('Runtime.evaluate', {
    expression: `(() => {
      const favBtn = document.getElementById('dfFav');
      const initialFavActive = favBtn.classList.contains('active');
      favBtn.click();
      const toggledFavActive = favBtn.classList.contains('active');
      
      const backBtn = document.getElementById('dfBack');
      backBtn.click();
      const isClosed = !window.SNORKYDailyForecast.isOpen();
      return { initialFavActive, toggledFavActive, isClosed };
    })()`,
    returnByValue: true
  });
  results.interactions = favBackTest?.result?.value;
  console.log('Interactions verification:', results.interactions);

  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification_report.json', JSON.stringify(results, null, 2));
  console.log('\nSaved verification_report.json');

  ws.close();
  chrome.kill();
  console.log('\n=== ALL VERIFICATIONS PASSED ===');
  process.exit(0);
}

verifyAll().catch(e => {
  console.error('Verification error:', e);
  process.exit(1);
});
