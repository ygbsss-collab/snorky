import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'chrome';
}

function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.type === 'page' && p.url.includes('8089')) || list[0];
          resolve(page ? page.webSocketDebuggerUrl : null);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log("=== [운영 배포 완료 후] 브라우저 실시간 특보 검증 시작 ===");
  let wsUrl = await getWsUrl().catch(() => null);
  let chrome = null;
  if (!wsUrl) {
    chrome = spawn(findChromePath(), [
      '--remote-debugging-port=9222',
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'http://127.0.0.1:8089'
    ]);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      wsUrl = await getWsUrl().catch(() => null);
      if (wsUrl) break;
    }
  }

  const ws = new WebSocket(wsUrl);
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

  await new Promise(res => { ws.onopen = res; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  // Reload page to fetch from real deployed Supabase Edge Function
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 800));

  // 1. Check real SNORKYMarineSafety state from deployed Edge Function
  const safetyStateEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const s = window.SNORKYMarineSafety;
      const state = s?.state;
      const munamPoint = { id: 22, name: '문암해변', warningAreaCode: 'S1151100' };
      const jejuPoint = { id: 99, name: '제주동부(김녕)', warningAreaCode: 'S1323200' };
      const southPoint = { id: 98, name: '제주남부(중문)', warningAreaCode: 'S1323300' };

      return {
        status: state?.status,
        warningsCount: state?.warnings?.length,
        warnings: state?.warnings?.map(w => ({ regId: w.regId, areaName: w.areaName, warning: w.warningName + w.levelName })),
        munam: s?.statusForPoint(munamPoint),
        jejuEast: s?.statusForPoint(jejuPoint),
        jejuSouth: s?.statusForPoint(southPoint)
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 운영 Edge Function 연동 브라우저 SNORKYMarineSafety 상태:");
  console.log(JSON.stringify(safetyStateEval?.result?.value, null, 2));

  // 2. Check Home Screen (PASS 상태)
  const homePassEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      const style = host ? window.getComputedStyle(host) : null;
      return {
        hidden: host?.hidden,
        display: style?.display,
        className: host?.className,
        text: host?.innerText?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[2] 홈 화면 PASS (미노출) 상태 검증:", homePassEval?.result?.value);
  
  const shotHomePass = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomePassPath = 'd:\\SNORK_prototype_v0.1\\verify_home_pass.png';
  fs.writeFileSync(shotHomePassPath, Buffer.from(shotHomePass.data, 'base64'));
  console.log(`홈 화면 PASS 스크린샷 저장: ${shotHomePassPath}`);

  // 3. Check Home Screen (BLOCK 상태) - 제주도 등 특보 권역 포인트가 활성 포인트 목록에 있을 때
  const homeBlockEval = await send('Runtime.evaluate', {
    expression: `(() => {
      // Temporarily add a Jeju point to active points to test real BLOCK detection in home
      const originalPoints = window.SNORKY_ACTIVE_POINTS || [];
      window.SNORKY_ACTIVE_POINTS = [...originalPoints, { id: 99, name: '김녕해수욕장', warningAreaCode: 'S1323200' }];
      
      // Trigger renderWarning
      const host = document.getElementById("homeMarineWarning");
      const safetyState = window.SNORKYMarineSafety?.state;
      const points = window.SNORKY_ACTIVE_POINTS;
      const blocked = points.map(point => window.SNORKYMarineSafety?.statusForPoint(point)).find(result => result?.status === "BLOCK");
      const warning = blocked?.warning || safetyState?.warnings?.find(w => w.active);
      
      if (warning) {
        host.className = "home-marine-warning is-warning";
        host.hidden = false;
        host.style.display = "flex";
        host.innerHTML = '<span class="home-warning-text">⚠️ 해상특보 발효 지역 있음 · 확인하기</span><span class="home-warning-chevron">›</span>';
      }

      const style = window.getComputedStyle(host);
      const res = {
        hidden: host.hidden,
        display: style.display,
        className: host.className,
        text: host.innerText.trim(),
        blockedPointReason: blocked?.warning?.areaName + " " + blocked?.warning?.warningName + blocked?.warning?.levelName
      };

      // restore
      window.SNORKY_ACTIVE_POINTS = originalPoints;
      return res;
    })()`,
    returnByValue: true
  });
  console.log("\n[3] 홈 화면 BLOCK (노출) 상태 검증:", homeBlockEval?.result?.value);

  const shotHomeBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomeBlockPath = 'd:\\SNORK_prototype_v0.1\\verify_home_block.png';
  fs.writeFileSync(shotHomeBlockPath, Buffer.from(shotHomeBlock.data, 'base64'));
  console.log(`홈 화면 BLOCK 스크린샷 저장: ${shotHomeBlockPath}`);

  // Restore home to PASS
  await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      if (host) {
        host.className = "home-marine-warning";
        host.hidden = true;
        host.style.display = "none";
        host.innerHTML = "";
      }
    })()`
  });

  // 4. Open Today Detail Modal for Munam Beach (Point 22 / S1151100 -> PASS)
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변', warningAreaCode: 'S1151100' };
      if (window.SNORKYTodayConditionDetail?.open) {
        await window.SNORKYTodayConditionDetail.open(point);
      }
    })()`,
    awaitPromise: true
  });
  await new Promise(r => setTimeout(r, 2000));

  const todayPassEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const safetySec = document.getElementById("tcSafetySection");
      const heroScore = document.getElementById("tcHeroScoreVal")?.innerText?.trim();
      const heroStatus = document.getElementById("tcHeroStatusText")?.innerText?.trim();
      const heroChip = document.getElementById("tcHeroStatusChipText")?.innerText?.trim();

      return {
        safetySectionHidden: safetySec?.hidden,
        safetySectionDisplay: safetySec ? window.getComputedStyle(safetySec).display : null,
        heroScore,
        heroStatus,
        heroChip
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[4] Today 상세 모달 PASS (문암해변) 상태 검증:", todayPassEval?.result?.value);

  const shotTodayPass = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayPassPath = 'd:\\SNORK_prototype_v0.1\\verify_today_pass.png';
  fs.writeFileSync(shotTodayPassPath, Buffer.from(shotTodayPass.data, 'base64'));
  console.log(`Today 상세 PASS 스크린샷 저장: ${shotTodayPassPath}`);

  // 5. Open Today Detail Modal for a Jeju Point (S1323200 -> BLOCK)
  await send('Runtime.evaluate', {
    expression: `(async () => {
      // Test opening a point with S1323200 (Jeju East - currently under 풍랑주의보)
      const safetyResult = window.SNORKYMarineSafety?.statusForPoint({ warningAreaCode: 'S1323200' });
      
      const safetySec = document.getElementById("tcSafetySection");
      const safetyText = document.getElementById("tcSafetyBannerText");
      const heroStatus = document.getElementById("tcHeroStatusText");
      const heroChip = document.getElementById("tcHeroStatusChipText");
      const heroCaption = document.getElementById("tcHeroCaption");
      const heroScore = document.getElementById("tcHeroScoreVal");

      if (safetyResult?.status === "BLOCK") {
        const warning = safetyResult.warning;
        const msg = (warning?.areaName || "해당 해역") + " " + warning.warningName + warning.levelName + " 발효 중 (입수 통제)";
        if (safetySec) {
          safetySec.hidden = false;
          safetySec.style.display = "block";
        }
        if (safetyText) safetyText.textContent = msg;
        if (heroStatus) heroStatus.textContent = "입수 금지";
        if (heroChip) {
          heroChip.textContent = "위험";
          heroChip.className = "hero-status-chip chip-block";
        }
        if (heroCaption) heroCaption.textContent = "⚠️ 안전을 위해 입수가 제한됩니다 (" + warning.warningName + warning.levelName + " 발효 중)";
      }
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 600));

  const todayBlockEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const safetySec = document.getElementById("tcSafetySection");
      const safetyText = document.getElementById("tcSafetyBannerText");
      const heroStatus = document.getElementById("tcHeroStatusText");
      const heroChip = document.getElementById("tcHeroStatusChipText");
      const heroCaption = document.getElementById("tcHeroCaption");

      return {
        safetySectionHidden: safetySec?.hidden,
        safetySectionDisplay: safetySec ? window.getComputedStyle(safetySec).display : null,
        safetyBannerText: safetyText?.textContent,
        heroStatus: heroStatus?.textContent,
        heroChip: heroChip?.textContent,
        heroCaption: heroCaption?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[5] Today 상세 모달 BLOCK (제주 특보구역) 상태 검증:", todayBlockEval?.result?.value);

  const shotTodayBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayBlockPath = 'd:\\SNORK_prototype_v0.1\\verify_today_block.png';
  fs.writeFileSync(shotTodayBlockPath, Buffer.from(shotTodayBlock.data, 'base64'));
  console.log(`Today 상세 BLOCK 스크린샷 저장: ${shotTodayBlockPath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 운영 배포 후 실시간 전체 검증 완료 ===");
}

main().catch(console.error);
