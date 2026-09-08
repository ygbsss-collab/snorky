import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const htmlContent = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf-8');
const adminScript = fs.readFileSync(path.join(rootDir, 'public/js/supabase-admin.js'), 'utf-8');
const moderationScript = fs.readFileSync(path.join(rootDir, 'public/js/admin-moderation.js'), 'utf-8');

// Minimal DOM simulation for tabs
class Element {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attrs;
    this.children = [];
    this.parentElement = null;
    this.hidden = attrs.hidden !== undefined;
    this.classList = {
      set: new Set((attrs.class || '').split(' ').filter(Boolean)),
      has(c) { return this.set.has(c); },
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      toggle(c, force) {
        if (force === true) this.set.add(c);
        else if (force === false) this.set.delete(c);
        else if (this.set.has(c)) this.set.delete(c);
        else this.set.add(c);
      }
    };
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-')) {
        const camelKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camelKey] = v;
      }
    }
    this.listeners = {};
    this.id = attrs.id || '';
    this.textContent = '';
    this.innerHTML = '';
  }

  getAttribute(attr) { return this.attributes[attr] || null; }
  setAttribute(attr, val) { this.attributes[attr] = val; }
  removeAttribute(attr) { delete this.attributes[attr]; }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    for (const fn of list) fn(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    for (const node of nodes) {
      if (node.parentElement) {
        const idx = node.parentElement.children.indexOf(node);
        if (idx >= 0) node.parentElement.children.splice(idx, 1);
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.replaceChildren(...this.children, node);
    return node;
  }

  querySelector(sel) {
    const matches = this.querySelectorAll(sel);
    return matches[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      if (node !== this && matchSelector(node, sel)) results.push(node);
      for (const child of node.children) walk(child);
    };
    walk(this);
    return results;
  }

  insertInto(html) {
    if (html.includes('userManagerModal')) {
      const modal = new Element('div', { id: 'userManagerModal', class: 'admin-dialog' });
      const list = new Element('div', { id: 'userManagerList' });
      const detail = new Element('div', { id: 'userManagerDetail', hidden: '' });
      modal.appendChild(list);
      modal.appendChild(detail);
      this.appendChild(modal);
    }
    if (html.includes('certificationManagerModal')) {
      const modal = new Element('div', { id: 'certificationManagerModal', class: 'admin-dialog' });
      const list = new Element('div', { id: 'certificationManagerList' });
      const detail = new Element('div', { id: 'certificationManagerDetail', hidden: '' });
      modal.appendChild(list);
      modal.appendChild(detail);
      this.appendChild(modal);
    }
    if (html.includes('reportManagerModal')) {
      const modal = new Element('div', { id: 'reportManagerModal', class: 'admin-dialog' });
      const list = new Element('div', { id: 'reportManagerList' });
      const detail = new Element('div', { id: 'reportManagerDetail', hidden: '' });
      modal.appendChild(list);
      modal.appendChild(detail);
      this.appendChild(modal);
    }
  }

  insertAdjacentHTML(where, html) {
    this.insertInto(html);
  }
}

function matchSelector(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.has(sel.slice(1));
  if (sel.includes('data-admin-tab')) {
    if (sel.includes('=')) {
      const match = sel.match(/data-admin-tab=["']?([^"']+)["']?/);
      return el.dataset.adminTab === match?.[1];
    }
    return Boolean(el.dataset.adminTab);
  }
  if (sel.includes('data-admin-panel')) {
    if (sel.includes('=')) {
      const match = sel.match(/data-admin-panel=["']?([^"']+)["']?/);
      return el.dataset.adminPanel === match?.[1];
    }
    return Boolean(el.dataset.adminPanel);
  }
  return false;
}

// Parse HTML tags
const documentElements = [];
function parseSimpleHtml(html) {
  const root = new Element('root');
  
  // Create mock elements from admin.html manually for essential test
  const panels = ['dashboard', 'users', 'certification', 'reports', 'services'].map(key => {
    const sec = new Element('section', { class: 'admin-tab-panel', 'data-admin-panel': key, hidden: '' });
    if (key === 'users') {
      const host = new Element('div', { id: 'adminUsersHost' });
      sec.appendChild(host);
    }
    if (key === 'certification') {
      const host = new Element('div', { id: 'adminCertificationHost' });
      sec.appendChild(host);
    }
    if (key === 'reports') {
      const host = new Element('div', { id: 'adminReportsHost' });
      sec.appendChild(host);
    }
    sec.hidden = key !== 'dashboard';
    return sec;
  });

  const buttons = ['dashboard', 'users', 'certification', 'reports', 'services'].map((key, idx) => {
    const btn = new Element('button', { 'data-admin-tab': key, class: idx === 0 ? 'is-active' : '' });
    if (key === 'users') btn.id = 'adminUserManager';
    if (key === 'certification') btn.id = 'adminCertificationManager';
    if (key === 'reports') btn.id = 'adminReportManager';
    return btn;
  });

  const body = new Element('body');
  const main = new Element('main');
  const pageIntro = new Element('div', { id: 'adminPageIntro' });
  pageIntro.hidden = false;

  panels.forEach(p => pageIntro.appendChild(p));
  buttons.forEach(b => main.appendChild(b));
  main.appendChild(pageIntro);
  body.appendChild(main);
  root.appendChild(body);
  return root;
}

const root = parseSimpleHtml(htmlContent);
const docBody = root.children[0];
const globalWin = {
  document: {
    body: docBody,
    getElementById: (id) => id === 'body' ? docBody : root.querySelector(`#${id}`),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    insertAdjacentHTML: (where, html) => {
      docBody.insertInto(html);
    },
    addEventListener: () => {}
  },
  confirm: () => true,
  SNORKYAdmin: {
    loadUsersAdmin: async () => [{ user_id: 'u1', nickname: 'user1', status: 'ACTIVE', created_at: new Date() }],
    loadCertificationRequestsAdmin: async () => [{ id: 1, nickname: 'cert1', status: 'PENDING', organization: 'AIDA', level: 'Level 2' }],
    loadUserReportsAdmin: async () => [{ id: 10, target_user_id: 'u2', reason: '욕설', status: 'PENDING' }]
  },
  Object,
  Array,
  Promise
};

const mockDoc = globalWin.document;
globalThis.docBody = docBody;
globalThis.document = mockDoc;
global.document = mockDoc;

const modifiedScript = moderationScript.replaceAll('document.body', 'globalThis.docBody');
const fn = new Function('global', 'window', 'document', modifiedScript);
fn(globalWin, globalWin, mockDoc);

const tabs = ['dashboard', 'users', 'certification', 'reports', 'services'];
const auditLog = [];

for (const key of tabs) {
  const btn = globalWin.document.querySelector(`[data-admin-tab="${key}"]`);
  btn.click();
  await new Promise(r => setTimeout(r, 20));

  const panels = globalWin.document.querySelectorAll('[data-admin-panel]');
  const visiblePanels = panels.filter(p => !p.hidden);
  
  let embedded = false;
  if (key === 'users') embedded = Boolean(globalWin.document.querySelector('#adminUsersHost #userManagerModal'));
  if (key === 'certification') embedded = Boolean(globalWin.document.querySelector('#adminCertificationHost #certificationManagerModal'));
  if (key === 'reports') embedded = Boolean(globalWin.document.querySelector('#adminReportsHost #reportManagerModal'));

  auditLog.push({
    tab: key,
    buttonActive: btn.classList.has('is-active'),
    visiblePanelsCount: visiblePanels.length,
    visiblePanelKey: visiblePanels[0]?.dataset.adminPanel,
    hiddenStates: panels.map(p => ({ [p.dataset.adminPanel]: p.hidden })),
    embedded
  });
}

console.log(JSON.stringify(auditLog, null, 2));
