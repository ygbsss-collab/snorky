import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const rootDir = process.cwd();
const htmlContent = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf-8');
const adminScript = fs.readFileSync(path.join(rootDir, 'public/js/supabase-admin.js'), 'utf-8');
const moderationScript = fs.readFileSync(path.join(rootDir, 'public/js/admin-moderation.js'), 'utf-8');

const dom = new JSDOM(htmlContent, {
  url: 'http://127.0.0.1:5501/admin.html',
  runScripts: 'dangerously',
  resources: 'usable'
});

const { window } = dom;
const { document } = window;

// Mock Supabase client
window.getSnorkySupabase = () => ({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'admin-uuid-1234' } } }, error: null }),
    signOut: async () => {},
    onAuthStateChange: () => {}
  },
  from: (tableName) => {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (tableName === 'admin_users') return { data: { user_id: 'admin-uuid-1234' }, error: null };
            if (tableName === 'app_settings') return { data: { value: { enabled: true, open_chat_url: 'https://open.kakao.com/o/test', banner_text: '테스트 배너' } }, error: null };
            return { data: null, error: null };
          },
          single: async () => ({ data: {}, error: null })
        }),
        order: () => ({
          order: async () => ({ data: [], error: null }),
          async then(cb) { cb({ data: [], error: null }); }
        }),
        in: async () => ({ data: [], error: null })
      }),
      rpc: async (fnName) => {
        if (fnName === 'get_admin_users') return { data: [{ user_id: 'user-1', nickname: '테스트유저1', email: 'test1@snorky.kr', status: 'ACTIVE', created_at: new Date().toISOString() }], error: null };
        if (fnName === 'get_user_reports_admin') return { data: [], error: null };
        return { data: [], error: null };
      }
    };
  },
  rpc: async (fnName) => {
    if (fnName === 'get_admin_users') return { data: [{ user_id: 'user-1', nickname: '테스트유저1', email: 'test1@snorky.kr', status: 'ACTIVE', created_at: new Date().toISOString() }], error: null };
    if (fnName === 'get_user_reports_admin') return { data: [], error: null };
    return { data: [], error: null };
  }
});

// Load scripts
const script1 = document.createElement('script');
script1.textContent = adminScript;
document.head.appendChild(script1);

const script2 = document.createElement('script');
script2.textContent = moderationScript;
document.head.appendChild(script2);

// Simulate admin login state
window.dispatchEvent(new CustomEvent('snorky:admin-state', { detail: { authorized: true, email: 'admin@snorky.kr' } }));

const tabs = ['dashboard', 'users', 'certification', 'reports', 'services'];
const results = {};

for (const tabName of tabs) {
  const btn = document.querySelector(`[data-admin-tab="${tabName}"]`);
  if (btn) btn.click();

  // Wait a microtick
  await new Promise(r => setTimeout(r, 50));

  const activeBtn = document.querySelector('[data-admin-tab].is-active');
  const panels = Array.from(document.querySelectorAll('[data-admin-panel]'));
  const panelStates = panels.map(p => ({ key: p.dataset.adminPanel, hidden: p.hidden }));
  const visiblePanels = panels.filter(p => !p.hidden);
  
  let headingText = '';
  if (visiblePanels.length > 0) {
    const h = visiblePanels[0].querySelector('h1, h2, h3, .admin-section-head');
    headingText = h ? h.textContent.trim().replace(/\s+/g, ' ') : '';
  }

  let hostChildCount = 0;
  let embeddedModal = false;
  if (tabName === 'users') {
    const host = document.getElementById('adminUsersHost');
    embeddedModal = Boolean(host?.querySelector('#userManagerModal.admin-embedded'));
    hostChildCount = host ? host.children.length : 0;
  } else if (tabName === 'certification') {
    const host = document.getElementById('adminCertificationHost');
    embeddedModal = Boolean(host?.querySelector('#certificationManagerModal.admin-embedded'));
    hostChildCount = host ? host.children.length : 0;
  } else if (tabName === 'reports') {
    const host = document.getElementById('adminReportsHost');
    embeddedModal = Boolean(host?.querySelector('#reportManagerModal.admin-embedded'));
    hostChildCount = host ? host.children.length : 0;
  }

  let rowCount = 0;
  if (tabName === 'users') rowCount = document.querySelectorAll('#userManagerList table tbody tr').length;
  if (tabName === 'certification') rowCount = document.querySelectorAll('#certificationManagerList table tbody tr').length;
  if (tabName === 'reports') rowCount = document.querySelectorAll('#reportManagerList table tbody tr').length;

  results[tabName] = {
    buttonActive: activeBtn?.dataset.adminTab === tabName,
    panelStates,
    visiblePanelCount: visiblePanels.length,
    visiblePanelKey: visiblePanels[0]?.dataset.adminPanel,
    headingText,
    embeddedModal,
    hostChildCount,
    rowCount
  };
}

console.log(JSON.stringify(results, null, 2));
