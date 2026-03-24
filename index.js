/**
 * SillyTavern Bulk Delete Extension
 * 批量删除角色卡 & 世界书插件
 * 
 * 在扩展菜单底部添加"批量删除"入口，
 * 点击弹出面板可多选/全选角色卡或世界书并批量删除。
 */

import { characters, getRequestHeaders, printCharacters } from '../../../../script.js';
import { getWorldInfoFileName, deleteWorldInfo } from '../../../world-info.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { callPopup, POPUP_TYPE } from '../../../popup.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────
const EXT_NAME = 'bulk-delete';
const PANEL_ID = 'bulk-delete-panel';
const OVERLAY_ID = 'bulk-delete-overlay';

// ─── 初始化入口 ──────────────────────────────────────────────────────────────
jQuery(async () => {
    await loadStyles();
    injectMenuButton();
});

// ─── 注入样式 ────────────────────────────────────────────────────────────────
async function loadStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/extensions/bulk-delete/style.css';
    document.head.appendChild(link);
}

// ─── 在扩展菜单底部注入按钮 ───────────────────────────────────────────────────
function injectMenuButton() {
    // extensionsMenu 是 ST 动态生成的，需要等它就绪
    // 用 MutationObserver + 轮询双保险
    const tryInject = () => {
        const menu = document.getElementById('extensionsMenu');
        if (menu && !document.getElementById('bulk-delete-menu-btn')) {
            const li = document.createElement('li');
            li.id = 'bulk-delete-menu-btn';
            li.innerHTML = `<i class="fa-solid fa-trash"></i><span>批量删除</span>`;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                // 关闭扩展菜单
                menu.style.display = 'none';
                openPanel();
            });
            menu.appendChild(li);
            return true;
        }
        return false;
    };

    if (!tryInject()) {
        // 观察 body，等 extensionsMenu 出现
        const obs = new MutationObserver(() => {
            if (tryInject()) obs.disconnect();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }
}

// ─── 打开面板 ────────────────────────────────────────────────────────────────
function openPanel() {
    // 已存在则直接显示
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
        overlay.classList.remove('bd-hidden');
        renderTab('characters');
        return;
    }

    // 创建遮罩
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = buildPanelHTML();
    document.body.appendChild(overlay);

    // 关闭按钮
    overlay.querySelector('#bd-close-btn').addEventListener('click', closePanel);
    overlay.querySelector('#bd-overlay-bg').addEventListener('click', closePanel);

    // Tab 切换
    overlay.querySelector('#bd-tab-chars').addEventListener('click', () => switchTab('characters'));
    overlay.querySelector('#bd-tab-worlds').addEventListener('click', () => switchTab('worldbooks'));

    // 全选
    overlay.querySelector('#bd-select-all').addEventListener('change', (e) => {
        overlay.querySelectorAll('.bd-item-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateDeleteBtn();
    });

    // 删除按钮
    overlay.querySelector('#bd-delete-btn').addEventListener('click', handleDelete);

    renderTab('characters');
}

// ─── 关闭面板 ────────────────────────────────────────────────────────────────
function closePanel() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.add('bd-hidden');
}

// ─── 构建面板 HTML ────────────────────────────────────────────────────────────
function buildPanelHTML() {
    return `
<div id="bd-overlay-bg"></div>
<div id="${PANEL_ID}" role="dialog" aria-modal="true" aria-label="批量删除">
  <div class="bd-panel-header">
    <div class="bd-tabs">
      <button id="bd-tab-chars" class="bd-tab active" data-tab="characters">
        <i class="fa-solid fa-user"></i> 角色卡
      </button>
      <button id="bd-tab-worlds" class="bd-tab" data-tab="worldbooks">
        <i class="fa-solid fa-book-atlas"></i> 世界书
      </button>
    </div>
    <button id="bd-close-btn" class="bd-close-btn" title="关闭">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <div class="bd-toolbar">
    <label class="bd-select-all-label">
      <input type="checkbox" id="bd-select-all">
      <span>全选</span>
    </label>
    <span id="bd-selected-count" class="bd-count">已选 0 项</span>
  </div>

  <div id="bd-list-container" class="bd-list-container">
    <div class="bd-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>
  </div>

  <div class="bd-panel-footer">
    <button id="bd-delete-btn" class="bd-delete-btn" disabled>
      <i class="fa-solid fa-trash"></i> 删除所选
    </button>
  </div>
</div>`;
}

// ─── 当前激活 Tab ─────────────────────────────────────────────────────────────
let currentTab = 'characters';

function switchTab(tab) {
    currentTab = tab;
    const overlay = document.getElementById(OVERLAY_ID);
    overlay.querySelectorAll('.bd-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // 重置全选
    overlay.querySelector('#bd-select-all').checked = false;
    renderTab(tab);
}

// ─── 渲染列表 ─────────────────────────────────────────────────────────────────
async function renderTab(tab) {
    currentTab = tab;
    const container = document.getElementById('bd-list-container');
    if (!container) return;
    container.innerHTML = '<div class="bd-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>';

    try {
        if (tab === 'characters') {
            await renderCharacters(container);
        } else {
            await renderWorldbooks(container);
        }
    } catch (err) {
        container.innerHTML = `<div class="bd-empty">加载失败：${err.message}</div>`;
    }

    updateDeleteBtn();
}

// ─── 渲染角色卡列表 ───────────────────────────────────────────────────────────
async function renderCharacters(container) {
    // characters 是 ST 全局变量，已从 script.js 导入
    const chars = Array.isArray(characters) ? characters : [];

    if (chars.length === 0) {
        container.innerHTML = '<div class="bd-empty"><i class="fa-solid fa-ghost"></i><br>暂无角色卡</div>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'bd-list';

    chars.forEach((char, idx) => {
        if (!char || !char.name) return;
        const avatar = char.avatar || '';
        const avatarUrl = avatar ? `/characters/${encodeURIComponent(avatar)}` : '/img/default-avatar.png';
        const li = document.createElement('li');
        li.className = 'bd-item';
        li.dataset.index = idx;
        li.dataset.avatar = avatar;
        li.innerHTML = `
<label class="bd-item-label">
  <input type="checkbox" class="bd-item-checkbox" data-type="character" data-avatar="${avatar}" data-index="${idx}">
  <img class="bd-avatar" src="${avatarUrl}" alt="${escHtml(char.name)}" onerror="this.src='/img/default-avatar.png'">
  <span class="bd-item-name">${escHtml(char.name)}</span>
</label>`;
        li.querySelector('.bd-item-checkbox').addEventListener('change', () => {
            syncSelectAll();
            updateDeleteBtn();
        });
        ul.appendChild(li);
    });

    container.innerHTML = '';
    container.appendChild(ul);
}

// ─── 渲染世界书列表 ───────────────────────────────────────────────────────────
async function renderWorldbooks(container) {
    const response = await fetch('/api/worldinfo/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const worlds = data?.entries || data || [];

    if (!worlds.length) {
        container.innerHTML = '<div class="bd-empty"><i class="fa-solid fa-book-open"></i><br>暂无世界书</div>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'bd-list';

    worlds.forEach((name) => {
        if (!name) return;
        const li = document.createElement('li');
        li.className = 'bd-item';
        li.innerHTML = `
<label class="bd-item-label">
  <input type="checkbox" class="bd-item-checkbox" data-type="worldbook" data-name="${escHtml(name)}">
  <i class="fa-solid fa-book bd-world-icon"></i>
  <span class="bd-item-name">${escHtml(name)}</span>
</label>`;
        li.querySelector('.bd-item-checkbox').addEventListener('change', () => {
            syncSelectAll();
            updateDeleteBtn();
        });
        ul.appendChild(li);
    });

    container.innerHTML = '';
    container.appendChild(ul);
}

// ─── 同步全选状态 ─────────────────────────────────────────────────────────────
function syncSelectAll() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const all = [...overlay.querySelectorAll('.bd-item-checkbox')];
    const checked = all.filter(cb => cb.checked);
    const selectAll = overlay.querySelector('#bd-select-all');
    if (selectAll) {
        selectAll.checked = all.length > 0 && checked.length === all.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    }
    const countEl = overlay.querySelector('#bd-selected-count');
    if (countEl) countEl.textContent = `已选 ${checked.length} 项`;
}

// ─── 更新删除按钮状态 ─────────────────────────────────────────────────────────
function updateDeleteBtn() {
    syncSelectAll();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const checked = overlay.querySelectorAll('.bd-item-checkbox:checked');
    const btn = overlay.querySelector('#bd-delete-btn');
    if (btn) btn.disabled = checked.length === 0;
}

// ─── 执行删除 ─────────────────────────────────────────────────────────────────
async function handleDelete() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const checked = [...overlay.querySelectorAll('.bd-item-checkbox:checked')];
    if (!checked.length) return;

    if (currentTab === 'characters') {
        await handleDeleteCharacters(checked, overlay);
    } else {
        await handleDeleteWorldbooks(checked);
    }
}

async function handleDeleteCharacters(checked, overlay) {
    const selectedAvatars = checked.map(cb => cb.dataset.avatar).filter(Boolean);
    if (!selectedAvatars.length) return;

    // 询问是否同时删除关联世界书
    const withWorlds = await confirmDeleteWithWorldbooks(selectedAvatars.length);
    if (withWorlds === null) return; // 用户取消

    const confirmed = await showConfirm(
        `确认删除 ${selectedAvatars.length} 个角色卡${withWorlds ? '及其关联世界书' : ''}？\n此操作不可撤销。`
    );
    if (!confirmed) return;

    const deleteBtn = overlay.querySelector('#bd-delete-btn');
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 删除中...';

    let successCount = 0;
    let failCount = 0;

    for (const avatar of selectedAvatars) {
        try {
            // 如果需要删除关联世界书，先找到角色绑定的世界书
            if (withWorlds) {
                const char = characters.find(c => c.avatar === avatar);
                if (char) {
                    const boundWorld = char.data?.extensions?.world || char.character_book?.name;
                    if (boundWorld) {
                        await tryDeleteWorldbook(boundWorld);
                    }
                }
            }
            // 删除角色
            const res = await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: avatar, delete_chats: false }),
            });
            if (res.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (e) {
            failCount++;
        }
    }

    // 刷新角色列表
    await getContext().getCharacters();

    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> 删除所选';

    showToast(successCount, failCount, '角色卡');
    renderTab('characters');
}

async function handleDeleteWorldbooks(checked) {
    const names = checked.map(cb => cb.dataset.name).filter(Boolean);
    if (!names.length) return;

    const confirmed = await showConfirm(`确认删除 ${names.length} 个世界书？\n此操作不可撤销。`);
    if (!confirmed) return;

    const overlay = document.getElementById(OVERLAY_ID);
    const deleteBtn = overlay.querySelector('#bd-delete-btn');
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 删除中...';

    let successCount = 0;
    let failCount = 0;

    for (const name of names) {
        const ok = await tryDeleteWorldbook(name);
        ok ? successCount++ : failCount++;
    }

    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> 删除所选';

    showToast(successCount, failCount, '世界书');
    renderTab('worldbooks');
}

async function tryDeleteWorldbook(name) {
    try {
        const res = await fetch('/api/worldinfo/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ─── 确认弹窗（是否删除世界书）────────────────────────────────────────────────
function confirmDeleteWithWorldbooks(charCount) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'bd-confirm-modal';
        modal.innerHTML = `
<div class="bd-confirm-box">
  <div class="bd-confirm-icon"><i class="fa-solid fa-circle-question"></i></div>
  <p class="bd-confirm-title">删除 ${charCount} 个角色卡</p>
  <p class="bd-confirm-sub">是否同时删除这些角色卡绑定的世界书？</p>
  <div class="bd-confirm-btns">
    <button class="bd-btn-secondary" id="bd-cf-cancel">取消</button>
    <button class="bd-btn-outline" id="bd-cf-no">仅删除角色卡</button>
    <button class="bd-btn-danger" id="bd-cf-yes">一并删除世界书</button>
  </div>
</div>`;
        document.body.appendChild(modal);

        modal.querySelector('#bd-cf-cancel').onclick = () => { modal.remove(); resolve(null); };
        modal.querySelector('#bd-cf-no').onclick = () => { modal.remove(); resolve(false); };
        modal.querySelector('#bd-cf-yes').onclick = () => { modal.remove(); resolve(true); };
    });
}

function showConfirm(msg) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'bd-confirm-modal';
        modal.innerHTML = `
<div class="bd-confirm-box">
  <div class="bd-confirm-icon bd-danger-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
  <p class="bd-confirm-title" style="white-space:pre-line">${escHtml(msg)}</p>
  <div class="bd-confirm-btns">
    <button class="bd-btn-secondary" id="bd-cf-cancel">取消</button>
    <button class="bd-btn-danger" id="bd-cf-confirm">确认删除</button>
  </div>
</div>`;
        document.body.appendChild(modal);
        modal.querySelector('#bd-cf-cancel').onclick = () => { modal.remove(); resolve(false); };
        modal.querySelector('#bd-cf-confirm').onclick = () => { modal.remove(); resolve(true); };
    });
}

// ─── Toast 通知 ───────────────────────────────────────────────────────────────
function showToast(success, fail, type) {
    const msg = fail > 0
        ? `成功删除 ${success} 个${type}，${fail} 个失败`
        : `成功删除 ${success} 个${type}`;
    if (typeof toastr !== 'undefined') {
        fail > 0 ? toastr.warning(msg) : toastr.success(msg);
    } else {
        console.log(`[bulk-delete] ${msg}`);
    }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
