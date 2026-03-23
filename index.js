/**
 * Bulk Delete Extension for SillyTavern
 * 批量删除角色卡 & 世界书插件
 *
 * 放置路径: public/extensions/third-party/st-bulk-delete/
 * 需要文件: index.js  style.css  manifest.json
 */

import {
    characters,
    getCharacters,
    deleteCharacter,
    this_chid,
} from '../../../../script.js';

import {
    getContext,
} from '../../../extensions.js';

import {
    world_names,
    deleteWorldInfo,
} from '../../../../scripts/world-info.js';

import { callGenericPopup, POPUP_TYPE } from '../../../../scripts/popup.js';

// ══════════════════════════════════════════════════════════════════════════════
// 常量
// ══════════════════════════════════════════════════════════════════════════════
const EXT_NAME  = 'BulkDelete';
const LOG       = (...a) => console.log(`[${EXT_NAME}]`, ...a);

// ══════════════════════════════════════════════════════════════════════════════
// 状态
// ══════════════════════════════════════════════════════════════════════════════
let panelOpen      = false;
let currentTab     = 'characters';   // 'characters' | 'worldinfo'
let selectedChars  = new Set();      // 存 avatar 文件名
let selectedWI     = new Set();      // 存世界书名
let charQuery      = '';
let wiQuery        = '';

// ══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════════════════════════════

/** 安全转义 HTML */
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 获取角色关联的世界书名（去重） */
function charBooks(ch) {
    const s = new Set();
    if (ch?.data?.extensions?.world)       s.add(ch.data.extensions.world);
    if (ch?.data?.character_book?.name)    s.add(ch.data.character_book.name);
    return [...s].filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════════════
// 面板 HTML
// ══════════════════════════════════════════════════════════════════════════════
function buildHTML() {
    return /* html */`
<div id="bd-overlay" class="bd-overlay">
<div id="bd-panel"   class="bd-panel" role="dialog" aria-modal="true">

  <!-- 顶栏 -->
  <div class="bd-topbar">
    <span class="bd-title">
      <i class="fa-solid fa-trash-can"></i> 批量删除
    </span>
    <button id="bd-close" class="bd-icon-btn" aria-label="关闭">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <!-- Tab -->
  <div class="bd-tabs" role="tablist">
    <button id="bd-tab-chars" class="bd-tab bd-tab--active" role="tab" aria-selected="true">
      <i class="fa-solid fa-address-card"></i> 角色卡
      <span id="bd-cnt-chars" class="bd-badge">0</span>
    </button>
    <button id="bd-tab-wi" class="bd-tab" role="tab" aria-selected="false">
      <i class="fa-solid fa-book-open"></i> 世界书
      <span id="bd-cnt-wi" class="bd-badge">0</span>
    </button>
  </div>

  <!-- 工具栏 -->
  <div class="bd-toolbar">
    <div class="bd-search-wrap">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input id="bd-search" class="bd-search" type="search" placeholder="搜索…" autocomplete="off"/>
    </div>
    <button id="bd-btn-all"   class="bd-chip">全选</button>
    <button id="bd-btn-none"  class="bd-chip">取消</button>
  </div>

  <!-- 已选提示 -->
  <div id="bd-sel-bar" class="bd-sel-bar bd-hidden">
    已选择 <b id="bd-sel-n">0</b> 项
  </div>

  <!-- 列表 -->
  <div id="bd-list" class="bd-list" role="listbox" aria-multiselectable="true"></div>

  <!-- 进度 -->
  <div id="bd-progress" class="bd-progress bd-hidden">
    <div id="bd-prog-bar" class="bd-prog-bar"></div>
    <span id="bd-prog-txt" class="bd-prog-txt"></span>
  </div>

  <!-- 底栏 -->
  <div class="bd-footer">
    <button id="bd-del-btn" class="bd-del-btn" disabled>
      <i class="fa-solid fa-trash-can"></i>
      删除选中 <span id="bd-del-n">(0)</span>
    </button>
  </div>

</div>
</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 渲染列表
// ══════════════════════════════════════════════════════════════════════════════
function renderList() {
    const list = document.getElementById('bd-list');
    if (!list) return;

    if (currentTab === 'characters') {
        renderCharList(list);
    } else {
        renderWIList(list);
    }
    updateFooter();
}

function renderCharList(list) {
    const q = charQuery.toLowerCase().trim();
    const chars = (characters || []).filter(ch =>
        !q || (ch.name || '').toLowerCase().includes(q));

    const badge = document.getElementById('bd-cnt-chars');
    if (badge) badge.textContent = chars.length;

    if (chars.length === 0) {
        list.innerHTML = `<div class="bd-empty"><i class="fa-solid fa-user-slash"></i><p>没有找到角色</p></div>`;
        return;
    }

    list.innerHTML = chars.map(ch => {
        const id       = esc(ch.avatar);
        const selected = selectedChars.has(ch.avatar);
        const isCur    = characters.indexOf(ch) === this_chid;
        const books    = charBooks(ch);
        return /* html */`
<div class="bd-item${selected?' bd-item--sel':''}${isCur?' bd-item--cur':''}"
     data-id="${id}" role="option" aria-selected="${selected}">
  <span class="bd-chk${selected?' bd-chk--on':''}">
    ${selected?'<i class="fa-solid fa-check"></i>':''}
  </span>
  <span class="bd-ava">
    <img src="characters/${id}" onerror="this.src='img/ai4.png'" alt="">
  </span>
  <span class="bd-info">
    <span class="bd-name">${esc(ch.name||'未命名')}${isCur?'<em class="bd-cur-tag">当前</em>':''}</span>
    ${books.length?`<span class="bd-books"><i class="fa-solid fa-book fa-xs"></i>${books.map(b=>`<i>${esc(b)}</i>`).join('')}</span>`:''}
  </span>
</div>`;
    }).join('');

    list.querySelectorAll('.bd-item').forEach(el =>
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            selectedChars.has(id) ? selectedChars.delete(id) : selectedChars.add(id);
            renderList();
        })
    );
}

function renderWIList(list) {
    const q     = wiQuery.toLowerCase().trim();
    const names = (world_names || []).filter(n => !q || n.toLowerCase().includes(q));

    const badge = document.getElementById('bd-cnt-wi');
    if (badge) badge.textContent = names.length;

    if (names.length === 0) {
        list.innerHTML = `<div class="bd-empty"><i class="fa-solid fa-book-open-reader"></i><p>没有找到世界书</p></div>`;
        return;
    }

    list.innerHTML = names.map(name => {
        const selected  = selectedWI.has(name);
        const usedBy    = (characters||[]).filter(ch=>charBooks(ch).includes(name)).map(ch=>ch.name);
        return /* html */`
<div class="bd-item${selected?' bd-item--sel':''}"
     data-id="${esc(name)}" role="option" aria-selected="${selected}">
  <span class="bd-chk${selected?' bd-chk--on':''}">
    ${selected?'<i class="fa-solid fa-check"></i>':''}
  </span>
  <span class="bd-ava bd-ava--wi"><i class="fa-solid fa-book-open"></i></span>
  <span class="bd-info">
    <span class="bd-name">${esc(name)}</span>
    ${usedBy.length?`<span class="bd-books"><i class="fa-solid fa-user fa-xs"></i>${usedBy.map(n=>`<i>${esc(n)}</i>`).join('')}</span>`:''}
  </span>
</div>`;
    }).join('');

    list.querySelectorAll('.bd-item').forEach(el =>
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            selectedWI.has(id) ? selectedWI.delete(id) : selectedWI.add(id);
            renderList();
        })
    );
}

function updateFooter() {
    const n   = currentTab === 'characters' ? selectedChars.size : selectedWI.size;
    const bar = document.getElementById('bd-sel-bar');
    const num = document.getElementById('bd-sel-n');
    const btn = document.getElementById('bd-del-btn');
    const dn  = document.getElementById('bd-del-n');
    if (bar) bar.classList.toggle('bd-hidden', n === 0);
    if (num) num.textContent = n;
    if (btn) btn.disabled = n === 0;
    if (dn)  dn.textContent = `(${n})`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 全选 / 取消
// ══════════════════════════════════════════════════════════════════════════════
function selectAll() {
    if (currentTab === 'characters') {
        const q = charQuery.toLowerCase().trim();
        (characters||[]).filter(ch=>!q||(ch.name||'').toLowerCase().includes(q))
            .forEach(ch=>selectedChars.add(ch.avatar));
    } else {
        const q = wiQuery.toLowerCase().trim();
        (world_names||[]).filter(n=>!q||n.toLowerCase().includes(q))
            .forEach(n=>selectedWI.add(n));
    }
    renderList();
}
function deselectAll() {
    if (currentTab === 'characters') selectedChars.clear();
    else selectedWI.clear();
    renderList();
}

// ══════════════════════════════════════════════════════════════════════════════
// 删除流程
// ══════════════════════════════════════════════════════════════════════════════
async function onDelete() {
    if (currentTab === 'characters') {
        await deleteCharsFlow();
    } else {
        await deleteWIFlow();
    }
}

async function deleteCharsFlow() {
    const count = selectedChars.size;
    if (!count) return;

    // 收集关联世界书（仅限 world_names 中存在的）
    const linked = new Set();
    for (const av of selectedChars) {
        const ch = (characters||[]).find(c=>c.avatar===av);
        if (ch) charBooks(ch).forEach(b=>{
            if ((world_names||[]).includes(b)) linked.add(b);
        });
    }

    let withWI = false;

    if (linked.size > 0) {
        const bookHtml = [...linked].map(b=>`<li>${esc(b)}</li>`).join('');
        const answer = await callGenericPopup(
            `<div class="bd-confirm">
              <p>即将删除 <strong>${count}</strong> 个角色卡。</p>
              <p>检测到 <strong>${linked.size}</strong> 个关联世界书：</p>
              <ul class="bd-confirm-list">${bookHtml}</ul>
              <p>是否<strong>同时删除</strong>这些世界书？</p>
            </div>`,
            POPUP_TYPE.CONFIRM,
            '',
            {
                okButton   : '删除角色卡 + 世界书',
                cancelButton: null,
                customButtons: [
                    { text: '仅删除角色卡', result: 2, classes: ['menu_button'] },
                    { text: '取消',         result: 0, classes: ['menu_button'] },
                ],
            }
        );
        if (!answer) return;            // 0 = 取消
        withWI = (answer === true);     // true = okButton
    } else {
        const ok = await callGenericPopup(
            `确定要删除 <strong>${count}</strong> 个角色卡吗？<br><small>此操作不可撤销。</small>`,
            POPUP_TYPE.CONFIRM
        );
        if (!ok) return;
    }

    await execDeleteChars(withWI ? [...linked] : []);
}

async function execDeleteChars(booksToDelete = []) {
    const list = [...selectedChars];
    let ok = 0, fail = 0;

    setProgress(0, list.length);
    for (let i = 0; i < list.length; i++) {
        try {
            await deleteCharacter(list[i], { deleteChats: false });
            selectedChars.delete(list[i]);
            ok++;
        } catch (e) {
            LOG('删除角色失败', list[i], e);
            fail++;
        }
        setProgress(i + 1, list.length);
    }
    for (const b of booksToDelete) {
        try { await deleteWorldInfo(b); }
        catch (e) { LOG('删除世界书失败', b, e); }
    }
    hideProgress();
    await getCharacters();

    toastr.success(
        `已删除 ${ok} 个角色卡${booksToDelete.length ? `及 ${booksToDelete.length} 个世界书` : ''}` +
        (fail ? `，${fail} 个失败` : ''),
        EXT_NAME
    );
    renderList();
}

async function deleteWIFlow() {
    const count = selectedWI.size;
    if (!count) return;
    const ok = await callGenericPopup(
        `确定要删除 <strong>${count}</strong> 个世界书吗？<br><small>此操作不可撤销。</small>`,
        POPUP_TYPE.CONFIRM
    );
    if (!ok) return;

    const list = [...selectedWI];
    let n = 0;
    setProgress(0, list.length);
    for (let i = 0; i < list.length; i++) {
        try { await deleteWorldInfo(list[i]); selectedWI.delete(list[i]); n++; }
        catch (e) { LOG('删除世界书失败', list[i], e); }
        setProgress(i + 1, list.length);
    }
    hideProgress();
    toastr.success(`已删除 ${n} 个世界书`, EXT_NAME);
    renderList();
}

// ══════════════════════════════════════════════════════════════════════════════
// 进度条
// ══════════════════════════════════════════════════════════════════════════════
function setProgress(cur, total) {
    const wrap = document.getElementById('bd-progress');
    const bar  = document.getElementById('bd-prog-bar');
    const txt  = document.getElementById('bd-prog-txt');
    if (!wrap) return;
    wrap.classList.remove('bd-hidden');
    const pct = total ? Math.round(cur / total * 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent  = `${cur} / ${total}`;
}
function hideProgress() {
    document.getElementById('bd-progress')?.classList.add('bd-hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// 面板开关
// ══════════════════════════════════════════════════════════════════════════════
function openPanel() {
    if (panelOpen) return;
    panelOpen = true;

    // 重置
    selectedChars.clear(); selectedWI.clear();
    charQuery = ''; wiQuery = '';
    currentTab = 'characters';

    document.body.insertAdjacentHTML('beforeend', buildHTML());

    const overlay = document.getElementById('bd-overlay');
    const panel   = document.getElementById('bd-panel');

    // 关闭
    document.getElementById('bd-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

    // Tab
    document.getElementById('bd-tab-chars').addEventListener('click', () => switchTab('characters'));
    document.getElementById('bd-tab-wi').addEventListener('click',    () => switchTab('worldinfo'));

    // 搜索
    document.getElementById('bd-search').addEventListener('input', e => {
        if (currentTab === 'characters') charQuery = e.target.value;
        else wiQuery = e.target.value;
        renderList();
    });

    // 全选 / 取消
    document.getElementById('bd-btn-all').addEventListener('click',  selectAll);
    document.getElementById('bd-btn-none').addEventListener('click', deselectAll);

    // 删除
    document.getElementById('bd-del-btn').addEventListener('click', onDelete);

    // ESC
    document.addEventListener('keydown', onEsc);

    // 渲染
    renderList();

    // 动画（nextFrame 保证 transition 生效）
    requestAnimationFrame(() => {
        overlay.classList.add('bd-overlay--in');
        panel.classList.add('bd-panel--in');
    });
}

function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    document.removeEventListener('keydown', onEsc);

    const overlay = document.getElementById('bd-overlay');
    const panel   = document.getElementById('bd-panel');
    if (overlay) {
        panel?.classList.remove('bd-panel--in');
        overlay.classList.remove('bd-overlay--in');
        setTimeout(() => overlay.remove(), 300);
    }
}

function onEsc(e) { if (e.key === 'Escape') closePanel(); }

function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    document.getElementById('bd-tab-chars').classList.toggle('bd-tab--active', tab === 'characters');
    document.getElementById('bd-tab-wi').classList.toggle('bd-tab--active',    tab === 'worldinfo');
    document.getElementById('bd-tab-chars').setAttribute('aria-selected', tab === 'characters');
    document.getElementById('bd-tab-wi').setAttribute('aria-selected',    tab === 'worldinfo');
    const s = document.getElementById('bd-search');
    if (s) s.value = tab === 'characters' ? charQuery : wiQuery;
    renderList();
}

// ══════════════════════════════════════════════════════════════════════════════
// 注入扩展菜单入口
// extensionsMenu 是 ST 动态生成的 <ul id="extensionsMenu">
// ══════════════════════════════════════════════════════════════════════════════
function injectMenuItem() {
    const inject = () => {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return false;
        if (document.getElementById('bd-menu-item')) return true;

        const li = document.createElement('li');
        li.id = 'bd-menu-item';
        li.innerHTML = `<a id="bd-menu-link" href="javascript:void(0)" class="bd-menu-link">
            <i class="fa-solid fa-trash fa-fw"></i>
            批量删除角色卡
        </a>`;
        li.querySelector('#bd-menu-link').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭扩展下拉菜单本身
            const popup = menu.closest('.list-group, .extensions_list, [id*="extensions"]');
            if (popup) $(popup).hide();
            openPanel();
        });
        menu.appendChild(li);
        LOG('✓ 菜单入口已注入');
        return true;
    };

    if (!inject()) {
        // 等待 ST 动态构建菜单
        const obs = new MutationObserver(() => { if (inject()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 入口
// ══════════════════════════════════════════════════════════════════════════════
jQuery(() => {
    LOG('正在加载…');
    injectMenuItem();
    LOG('就绪 ✓');
});
