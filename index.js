/**
 * st-bulk-delete — 批量删除角色卡 & 世界书
 * 放置路径: public/extensions/third-party/st-bulk-delete/
 */

import {
    characters,
    getCharacters,
    this_chid,
} from '../../../../script.js';

import { callGenericPopup, POPUP_TYPE } from '../../../../scripts/popup.js';

// ══════════════════════════════════════════════════════════════════════════════
const EXT  = 'BulkDelete';
const log  = (...a) => console.log(`[${EXT}]`, ...a);

// ══════════════════════════════════════════════════════════════════════════════
// 状态
// ══════════════════════════════════════════════════════════════════════════════
let panelOpen  = false;
let tab        = 'chars';   // 'chars' | 'wi'
let selChars   = new Set();
let selWI      = new Set();
let qChars     = '';
let qWI        = '';

// ══════════════════════════════════════════════════════════════════════════════
// ST API 包装（直接 fetch，最稳定）
// ══════════════════════════════════════════════════════════════════════════════

/** 删除角色卡（avatar = 文件名，如 "Alice.png"） */
async function apiDeleteChar(avatar) {
    const r = await fetch('/api/characters/delete', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ avatar, delete_chats: false }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

/** 获取所有世界书名列表 */
async function apiGetWINames() {
    const r = await fetch('/api/worldinfo/get', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({}),
    });
    if (!r.ok) return [];
    const data = await r.json();
    // ST 返回 { entries: [...] }  或  { file_name, entries }
    // world_names 存的就是各 lorebook 的 name，GET /api/worldinfo/list 更直接
    return Array.isArray(data) ? data : (data.world_names ?? []);
}

/** 获取世界书名列表（用 /api/worldinfo/list 或 fallback window.world_names） */
async function getWINames() {
    // 优先从全局变量读（ST 已加载时最准确）
    try {
        const { world_names } = await import('../../../../scripts/world-info.js');
        if (Array.isArray(world_names) && world_names.length > 0) return [...world_names];
    } catch (_) {}

    // fallback: window
    if (Array.isArray(window.world_names) && window.world_names.length > 0)
        return [...window.world_names];

    // fallback: fetch list
    try {
        const r = await fetch('/api/worldinfo/list', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            return Array.isArray(d) ? d : (d.world_names ?? []);
        }
    } catch (_) {}
    return [];
}

/** 删除世界书（按名称） */
async function apiDeleteWI(name) {
    // ST 1.12+: POST /api/worldinfo/delete  { name }
    const endpoints = [
        { url: '/api/worldinfo/delete',       body: { name } },
        { url: '/api/worldinfo/delete-book',  body: { name } },
    ];
    for (const ep of endpoints) {
        try {
            const r = await fetch(ep.url, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify(ep.body),
            });
            if (r.ok) return;
        } catch (_) {}
    }

    // 最终 fallback：触发 ST 的 world_popup_delete 按钮
    // 先通过 world-info.js 导出的函数
    try {
        const wi = await import('../../../../scripts/world-info.js');
        if (typeof wi.deleteWorldInfo === 'function') {
            await wi.deleteWorldInfo(name);
            return;
        }
        if (typeof wi.deleteWIBook === 'function') {
            await wi.deleteWIBook(name);
            return;
        }
    } catch (_) {}

    throw new Error(`无法删除世界书: ${name}`);
}

/** 获取角色关联世界书名 */
function charBooks(ch) {
    const s = new Set();
    if (ch?.data?.extensions?.world)    s.add(ch.data.extensions.world);
    if (ch?.data?.character_book?.name) s.add(ch.data.character_book.name);
    return [...s].filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML 转义
// ══════════════════════════════════════════════════════════════════════════════
const esc = s => String(s??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ══════════════════════════════════════════════════════════════════════════════
// 面板骨架
// ══════════════════════════════════════════════════════════════════════════════
function buildHTML() {
    return `
<div id="bd-overlay" class="bd-overlay">
<div id="bd-panel" class="bd-panel">

  <div class="bd-topbar">
    <span class="bd-title"><i class="fa-solid fa-trash-can"></i> 批量删除</span>
    <button id="bd-close" class="bd-icon-btn"><i class="fa-solid fa-xmark"></i></button>
  </div>

  <div class="bd-tabs">
    <button id="bd-tab-chars" class="bd-tab bd-tab--on">
      <i class="fa-solid fa-address-card"></i> 角色卡
      <span id="bd-cnt-c" class="bd-badge">0</span>
    </button>
    <button id="bd-tab-wi" class="bd-tab">
      <i class="fa-solid fa-book-open"></i> 世界书
      <span id="bd-cnt-w" class="bd-badge">0</span>
    </button>
  </div>

  <div class="bd-toolbar">
    <div class="bd-sw">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input id="bd-q" class="bd-q" type="search" placeholder="搜索…" autocomplete="off"/>
    </div>
    <button id="bd-all"  class="bd-chip">全选</button>
    <button id="bd-none" class="bd-chip">取消</button>
  </div>

  <div id="bd-sel-bar" class="bd-sel-bar bd-hide">
    已选 <b id="bd-sel-n">0</b> 项
  </div>

  <div id="bd-list" class="bd-list"></div>

  <div id="bd-prog" class="bd-prog bd-hide">
    <div id="bd-prog-fill" class="bd-prog-fill"></div>
    <span id="bd-prog-txt" class="bd-prog-txt"></span>
  </div>

  <div class="bd-footer">
    <button id="bd-del" class="bd-del" disabled>
      <i class="fa-solid fa-trash-can"></i> 删除选中 <span id="bd-del-n">(0)</span>
    </button>
  </div>

</div>
</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 渲染
// ══════════════════════════════════════════════════════════════════════════════
async function render() {
    if (tab === 'chars') renderChars();
    else                 await renderWI();
    syncFooter();
}

function renderChars() {
    const list = document.getElementById('bd-list');
    if (!list) return;
    const q   = qChars.toLowerCase().trim();
    const arr = (characters||[]).filter(c => !q || (c.name||'').toLowerCase().includes(q));
    const cnt = document.getElementById('bd-cnt-c');
    if (cnt) cnt.textContent = arr.length;

    if (!arr.length) {
        list.innerHTML = `<div class="bd-empty"><i class="fa-solid fa-user-slash"></i><p>没有角色</p></div>`;
        return;
    }
    list.innerHTML = arr.map(ch => {
        const sel  = selChars.has(ch.avatar);
        const cur  = characters.indexOf(ch) === this_chid;
        const bks  = charBooks(ch);
        return `
<div class="bd-item${sel?' bd-item--s':''}${cur?' bd-item--cur':''}" data-id="${esc(ch.avatar)}">
  <span class="bd-chk${sel?' bd-chk--on':''}">${sel?'<i class="fa-solid fa-check"></i>':''}</span>
  <span class="bd-av"><img src="characters/${esc(ch.avatar)}" onerror="this.src='img/ai4.png'" alt=""/></span>
  <span class="bd-inf">
    <span class="bd-nm">${esc(ch.name||'未命名')}${cur?'<em class="bd-cur">当前</em>':''}</span>
    ${bks.length?`<span class="bd-bks"><i class="fa-solid fa-book fa-xs"></i>${bks.map(b=>`<i>${esc(b)}</i>`).join('')}</span>`:''}
  </span>
</div>`;
    }).join('');

    list.querySelectorAll('.bd-item').forEach(el =>
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            selChars.has(id) ? selChars.delete(id) : selChars.add(id);
            render();
        })
    );
}

async function renderWI() {
    const list = document.getElementById('bd-list');
    if (!list) return;
    list.innerHTML = `<div class="bd-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>加载中…</p></div>`;

    const names = await getWINames();
    const q     = qWI.toLowerCase().trim();
    const arr   = names.filter(n => !q || n.toLowerCase().includes(q));
    const cnt   = document.getElementById('bd-cnt-w');
    if (cnt) cnt.textContent = arr.length;

    if (!arr.length) {
        list.innerHTML = `<div class="bd-empty"><i class="fa-solid fa-book-open-reader"></i><p>没有世界书</p></div>`;
        return;
    }
    list.innerHTML = arr.map(name => {
        const sel   = selWI.has(name);
        const users = (characters||[]).filter(c=>charBooks(c).includes(name)).map(c=>c.name);
        return `
<div class="bd-item${sel?' bd-item--s':''}" data-id="${esc(name)}">
  <span class="bd-chk${sel?' bd-chk--on':''}">${sel?'<i class="fa-solid fa-check"></i>':''}</span>
  <span class="bd-av bd-av--wi"><i class="fa-solid fa-book-open"></i></span>
  <span class="bd-inf">
    <span class="bd-nm">${esc(name)}</span>
    ${users.length?`<span class="bd-bks"><i class="fa-solid fa-user fa-xs"></i>${users.map(u=>`<i>${esc(u)}</i>`).join('')}</span>`:''}
  </span>
</div>`;
    }).join('');

    list.querySelectorAll('.bd-item').forEach(el =>
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            selWI.has(id) ? selWI.delete(id) : selWI.add(id);
            syncFooter();
            // 只更新选中态，不重新 fetch
            el.classList.toggle('bd-item--s', selWI.has(id));
            el.querySelector('.bd-chk').className = 'bd-chk' + (selWI.has(id) ? ' bd-chk--on' : '');
            el.querySelector('.bd-chk').innerHTML  = selWI.has(id) ? '<i class="fa-solid fa-check"></i>' : '';
        })
    );
}

function syncFooter() {
    const n   = tab === 'chars' ? selChars.size : selWI.size;
    const bar = document.getElementById('bd-sel-bar');
    const num = document.getElementById('bd-sel-n');
    const btn = document.getElementById('bd-del');
    const dn  = document.getElementById('bd-del-n');
    if (bar) bar.classList.toggle('bd-hide', n === 0);
    if (num) num.textContent = n;
    if (btn) btn.disabled = n === 0;
    if (dn)  dn.textContent = `(${n})`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 全选 / 取消
// ══════════════════════════════════════════════════════════════════════════════
async function doSelectAll() {
    if (tab === 'chars') {
        const q = qChars.toLowerCase().trim();
        (characters||[]).filter(c=>!q||(c.name||'').toLowerCase().includes(q))
            .forEach(c=>selChars.add(c.avatar));
        render();
    } else {
        const q = qWI.toLowerCase().trim();
        const names = await getWINames();
        names.filter(n=>!q||n.toLowerCase().includes(q)).forEach(n=>selWI.add(n));
        render();
    }
}
function doDeselectAll() {
    if (tab === 'chars') { selChars.clear(); render(); }
    else                 { selWI.clear();    render(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// 进度
// ══════════════════════════════════════════════════════════════════════════════
function prog(cur, tot) {
    const w = document.getElementById('bd-prog');
    const f = document.getElementById('bd-prog-fill');
    const t = document.getElementById('bd-prog-txt');
    if (!w) return;
    w.classList.remove('bd-hide');
    if (f) f.style.width = (tot ? Math.round(cur/tot*100) : 0) + '%';
    if (t) t.textContent = `${cur} / ${tot}`;
}
function hideProg() { document.getElementById('bd-prog')?.classList.add('bd-hide'); }

// ══════════════════════════════════════════════════════════════════════════════
// 删除
// ══════════════════════════════════════════════════════════════════════════════
async function onDelete() {
    if (tab === 'chars') await deleteCharsFlow();
    else                 await deleteWIFlow();
}

async function deleteCharsFlow() {
    const cnt = selChars.size;
    if (!cnt) return;

    // 收集关联世界书（需在现有 world_names 中）
    const wiNames = await getWINames();
    const linked  = new Set();
    for (const av of selChars) {
        const ch = (characters||[]).find(c=>c.avatar===av);
        if (ch) charBooks(ch).forEach(b=>{ if(wiNames.includes(b)) linked.add(b); });
    }

    let withWI = false;

    if (linked.size > 0) {
        const bkHtml = [...linked].map(b=>`<li>${esc(b)}</li>`).join('');
        const ans = await callGenericPopup(
            `<div class="bd-confirm">
              <p>即将删除 <strong>${cnt}</strong> 个角色卡。</p>
              <p>检测到 <strong>${linked.size}</strong> 个关联世界书：</p>
              <ul class="bd-clist">${bkHtml}</ul>
              <p>是否<strong>同时删除</strong>这些世界书？</p>
            </div>`,
            POPUP_TYPE.CONFIRM, '',
            {
                okButton    : '删除角色卡 + 世界书',
                cancelButton: null,
                customButtons: [
                    { text:'仅删除角色卡', result:2, classes:['menu_button'] },
                    { text:'取消',         result:0, classes:['menu_button'] },
                ],
            }
        );
        if (!ans) return;
        withWI = (ans === true);
    } else {
        const ok = await callGenericPopup(
            `确定要删除 <strong>${cnt}</strong> 个角色卡吗？<br><small>不可撤销。</small>`,
            POPUP_TYPE.CONFIRM
        );
        if (!ok) return;
    }

    // ── 执行删除角色卡 ──
    const list  = [...selChars];
    let ok = 0, fail = 0;
    prog(0, list.length);
    for (let i=0;i<list.length;i++) {
        try {
            await apiDeleteChar(list[i]);
            selChars.delete(list[i]);
            ok++;
        } catch(e) {
            log('删除角色失败', list[i], e);
            fail++;
        }
        prog(i+1, list.length);
    }

    // ── 执行删除关联世界书 ──
    const booksArr = withWI ? [...linked] : [];
    let wiOk = 0;
    for (const b of booksArr) {
        try { await apiDeleteWI(b); wiOk++; }
        catch(e) { log('删除世界书失败', b, e); }
    }

    hideProg();
    await getCharacters();

    const msg = `已删除 ${ok} 个角色卡` +
        (booksArr.length ? `，${wiOk} 个世界书` : '') +
        (fail ? `（${fail} 个失败）` : '');
    toastr.success(msg, EXT);
    render();
}

async function deleteWIFlow() {
    const cnt = selWI.size;
    if (!cnt) return;
    const ok = await callGenericPopup(
        `确定要删除 <strong>${cnt}</strong> 个世界书吗？<br><small>不可撤销。</small>`,
        POPUP_TYPE.CONFIRM
    );
    if (!ok) return;

    const list = [...selWI];
    let n = 0;
    prog(0, list.length);
    for (let i=0;i<list.length;i++) {
        try { await apiDeleteWI(list[i]); selWI.delete(list[i]); n++; }
        catch(e) { log('删除世界书失败', list[i], e); }
        prog(i+1, list.length);
    }
    hideProg();
    toastr.success(`已删除 ${n} 个世界书`, EXT);
    render();
}

// ══════════════════════════════════════════════════════════════════════════════
// 面板开关
// ══════════════════════════════════════════════════════════════════════════════
function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    selChars.clear(); selWI.clear();
    qChars = ''; qWI = '';
    tab = 'chars';

    document.body.insertAdjacentHTML('beforeend', buildHTML());

    const overlay = document.getElementById('bd-overlay');
    const panel   = document.getElementById('bd-panel');

    document.getElementById('bd-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target===overlay) closePanel(); });

    document.getElementById('bd-tab-chars').addEventListener('click', () => switchTab('chars'));
    document.getElementById('bd-tab-wi').addEventListener('click',    () => switchTab('wi'));

    document.getElementById('bd-q').addEventListener('input', e => {
        if (tab==='chars') qChars=e.target.value; else qWI=e.target.value;
        render();
    });

    document.getElementById('bd-all').addEventListener('click',  doSelectAll);
    document.getElementById('bd-none').addEventListener('click', doDeselectAll);
    document.getElementById('bd-del').addEventListener('click',  onDelete);
    document.addEventListener('keydown', onEsc);

    render();

    requestAnimationFrame(() => {
        overlay.classList.add('bd-ov-in');
        panel.classList.add('bd-p-in');
    });
}

function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    document.removeEventListener('keydown', onEsc);
    const ov = document.getElementById('bd-overlay');
    const p  = document.getElementById('bd-panel');
    p?.classList.remove('bd-p-in');
    ov?.classList.remove('bd-ov-in');
    setTimeout(() => ov?.remove(), 300);
}

function onEsc(e) { if (e.key==='Escape') closePanel(); }

function switchTab(t) {
    if (tab===t) return;
    tab = t;
    document.getElementById('bd-tab-chars').classList.toggle('bd-tab--on', t==='chars');
    document.getElementById('bd-tab-wi').classList.toggle('bd-tab--on',    t==='wi');
    const q = document.getElementById('bd-q');
    if (q) q.value = t==='chars' ? qChars : qWI;
    render();
}

// ══════════════════════════════════════════════════════════════════════════════
// 注入扩展面板入口
// ST 的扩展块 = #rm_extensions_block (抽屉面板)，没有 #extensionsMenu
// 我们在 extensions_block 内部 flex-container 底部插一个按钮行
// ══════════════════════════════════════════════════════════════════════════════
function injectEntry() {
    const inject = () => {
        if (document.getElementById('bd-entry')) return true;

        // 目标：extensions_block 内部的 flex-container
        const block = document.querySelector('#rm_extensions_block .extensions_block');
        if (!block) return false;

        const wrap = document.createElement('div');
        wrap.id        = 'bd-entry';
        wrap.className = 'bd-entry-wrap wide100p';
        wrap.innerHTML = `
<div id="bd-entry-btn" class="menu_button menu_button_icon bd-entry-btn" title="批量删除角色卡 / 世界书">
  <i class="fa-solid fa-trash fa-fw"></i>
  <span>批量删除角色卡</span>
</div>`;
        wrap.querySelector('#bd-entry-btn').addEventListener('click', () => {
            // 关闭扩展抽屉（可选，不影响功能）
            openPanel();
        });
        block.appendChild(wrap);
        log('✓ 入口已注入');
        return true;
    };

    if (!inject()) {
        const obs = new MutationObserver(() => { if (inject()) obs.disconnect(); });
        obs.observe(document.body, { childList:true, subtree:true });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
jQuery(() => {
    log('加载中…');
    injectEntry();
    log('就绪 ✓');
});
