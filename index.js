/**
 * Bulk Character & Worldbook Deleter
 * SillyTavern Extension — v1.2.0
 *
 * 修复：
 * 1. 确认弹窗偏上 → 改用独立 overlay 居中
 * 2. 世界书删不掉 → 修正 API 端点，改用 /deleteWI
 * 3. 世界书界面单独多选删除，不再走角色卡的确认弹窗
 * 4. 移除拖拽功能
 * 5. 面板内点击不触发扩展页面关闭 → stopPropagation 阻止冒泡
 */

import { getRequestHeaders, characters } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { world_names, deleteWorldInfo } from '../../../../scripts/world-info.js';

// ─── State ──────────────────────────────────────────────────────────────────
let currentTab = 'characters';
let selectedCharacters = new Set();
let selectedWorldbooks  = new Set();

// ─── API ────────────────────────────────────────────────────────────────────

async function apiDeleteCharacter(avatar) {
    const r = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
    });
    if (!r.ok) throw new Error(`角色卡删除失败: ${avatar} (${r.status})`);
}

/**
 * 世界书删除：优先用 ST 内置函数 deleteWorldInfo()，
 * 如果不可用则回退到 HTTP 端点。
 * ST 源码里世界书删除用的是 /api/worldinfo/delete，body: { name }
 */
async function apiDeleteWorldbook(name) {
    // 方式一：调用 ST 内置函数（最可靠）
    if (typeof deleteWorldInfo === 'function') {
        try {
            await deleteWorldInfo(name);
            return;
        } catch (e) {
            console.warn('[BCD] deleteWorldInfo() failed, falling back to API:', e);
        }
    }
    // 方式二：直接调用 HTTP 端点
    const r = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`世界书删除失败: ${name} (${r.status})`);
}

function getCharacterWorlds(char) {
    const w = new Set();
    if (char?.data?.extensions?.world) w.add(char.data.extensions.world);
    if (char?.world) w.add(char.world);
    return [...w].filter(Boolean);
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderCharacterList() {
    const ctx   = getContext();
    const chars = ctx.characters ?? characters ?? [];
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    if (!chars.length) {
        container.innerHTML = '<div class="bcd-empty">暂无角色卡</div>';
        updateToolbar();
        return;
    }

    chars.forEach(char => {
        const avatar    = char.avatar;
        const name      = char.name || avatar;
        const checked   = selectedCharacters.has(avatar);
        const worlds    = getCharacterWorlds(char);
        const wTag      = worlds.length
            ? `<span class="bcd-tag"><i class="fa-solid fa-book fa-xs"></i> ${worlds.length > 1 ? worlds.length + ' 个世界书' : worlds[0]}</span>`
            : '';
        const avatarSrc = avatar ? `/characters/${avatar}` : 'img/ai4.png';

        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <img class="bcd-avatar" src="${avatarSrc}" onerror="this.src='img/ai4.png'" alt="">
                <span class="bcd-info">
                    <span class="bcd-name">${name}</span>
                    ${wTag}
                </span>
            </label>`;

        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selectedCharacters.add(avatar);
            else selectedCharacters.delete(avatar);
            row.classList.toggle('bcd-row--checked', this.checked);
            updateToolbar();
        });
        container.appendChild(row);
    });
    updateToolbar();
}

function renderWorldbookList() {
    // 每次渲染时重新读取，确保反映最新状态
    const ctx   = getContext();
    const names = ctx.world_names ?? world_names ?? [];
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无世界书</div>';
        updateToolbar();
        return;
    }

    names.forEach(name => {
        const checked = selectedWorldbooks.has(name);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <span class="bcd-wb-icon"><i class="fa-solid fa-book-open"></i></span>
                <span class="bcd-info">
                    <span class="bcd-name">${name}</span>
                </span>
            </label>`;

        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selectedWorldbooks.add(name);
            else selectedWorldbooks.delete(name);
            row.classList.toggle('bcd-row--checked', this.checked);
            updateToolbar();
        });
        container.appendChild(row);
    });
    updateToolbar();
}

function updateToolbar() {
    const selectAllCb = document.getElementById('bcd-select-all');
    const delBtn      = document.getElementById('bcd-delete-btn');
    const countSpan   = document.getElementById('bcd-count');
    if (!selectAllCb || !delBtn) return;

    if (currentTab === 'characters') {
        const ctx   = getContext();
        const total = (ctx.characters ?? characters ?? []).length;
        const sel   = selectedCharacters.size;
        selectAllCb.indeterminate = sel > 0 && sel < total;
        selectAllCb.checked       = total > 0 && sel === total;
        countSpan.textContent     = sel > 0 ? `（${sel}）` : '';
        delBtn.disabled           = sel === 0;
    } else {
        const ctx   = getContext();
        const total = (ctx.world_names ?? world_names ?? []).length;
        const sel   = selectedWorldbooks.size;
        selectAllCb.indeterminate = sel > 0 && sel < total;
        selectAllCb.checked       = total > 0 && sel === total;
        countSpan.textContent     = sel > 0 ? `（${sel}）` : '';
        delBtn.disabled           = sel === 0;
    }
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('bcd-tab-chars').classList.toggle('bcd-tab--active', tab === 'characters');
    document.getElementById('bcd-tab-wb').classList.toggle('bcd-tab--active',    tab === 'worldbooks');
    const s = document.getElementById('bcd-search');
    if (s) s.value = '';
    tab === 'characters' ? renderCharacterList() : renderWorldbookList();
}

function applySearch(q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('#bcd-item-list .bcd-row').forEach(row => {
        const name = row.querySelector('.bcd-name')?.textContent.toLowerCase() ?? '';
        row.style.display = (!lq || name.includes(lq)) ? '' : 'none';
    });
}

// ─── Progress ────────────────────────────────────────────────────────────────

function showProgress(show) {
    const el = document.getElementById('bcd-progress');
    if (el) el.style.display = show ? '' : 'none';
}

function setProgress(done, total) {
    const bar = document.getElementById('bcd-prog-bar');
    const txt = document.getElementById('bcd-prog-txt');
    if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    if (txt) txt.textContent = `${done} / ${total}`;
}

// ─── Delete flows ─────────────────────────────────────────────────────────────

async function handleDelete() {
    if (currentTab === 'characters') await deleteChars();
    else await deleteWBs();
}

async function deleteChars() {
    if (!selectedCharacters.size) return;
    const ctx   = getContext();
    const chars = ctx.characters ?? characters ?? [];

    // 收集关联世界书
    const assocWorlds = new Set();
    for (const av of selectedCharacters) {
        const c = chars.find(x => x.avatar === av);
        if (c) getCharacterWorlds(c).forEach(w => assocWorlds.add(w));
    }

    const go = await showConfirm(
        `确认删除 ${selectedCharacters.size} 个角色卡？此操作不可撤销。`,
        [...assocWorlds]
    );
    if (!go) return;

    showProgress(true);
    let done = 0;
    const total = selectedCharacters.size + go.worldsToDelete.length;

    for (const av of [...selectedCharacters]) {
        try {
            await apiDeleteCharacter(av);
            selectedCharacters.delete(av);
        } catch (e) {
            console.error(e);
            toastr.error(e.message);
        }
        setProgress(++done, total);
    }

    for (const n of go.worldsToDelete) {
        try {
            await apiDeleteWorldbook(n);
        } catch (e) {
            console.error(e);
            toastr.error(e.message);
        }
        setProgress(++done, total);
    }

    showProgress(false);
    toastr.success('批量删除完成');
    await ctx.getCharacters?.();
    renderCharacterList();
}

async function deleteWBs() {
    if (!selectedWorldbooks.size) return;

    // 世界书界面：直接弹简单确认，不涉及角色卡
    const go = await showConfirm(
        `确认删除 ${selectedWorldbooks.size} 个世界书？此操作不可撤销。`,
        [] // 无关联列表
    );
    if (!go) return;

    showProgress(true);
    let done = 0;
    const total = selectedWorldbooks.size;

    for (const n of [...selectedWorldbooks]) {
        try {
            await apiDeleteWorldbook(n);
            selectedWorldbooks.delete(n);
        } catch (e) {
            console.error(e);
            toastr.error(e.message);
        }
        setProgress(++done, total);
    }

    showProgress(false);
    toastr.success('批量删除完成');
    // 重新渲染世界书列表（world_names 已被 deleteWorldInfo 更新）
    renderWorldbookList();
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function showConfirm(msg, worlds) {
    return new Promise(resolve => {
        const modal  = document.getElementById('bcd-confirm');
        const msgEl  = document.getElementById('bcd-confirm-msg');
        const wbSec  = document.getElementById('bcd-confirm-wb');
        const wbList = document.getElementById('bcd-confirm-wb-list');
        const okBtn  = document.getElementById('bcd-confirm-ok');
        const noBtn  = document.getElementById('bcd-confirm-no');

        msgEl.textContent = msg;

        if (worlds.length) {
            wbSec.style.display = '';
            wbList.innerHTML = worlds.map(w =>
                `<label class="bcd-wbcheck"><input type="checkbox" value="${w}" checked><span>${w}</span></label>`
            ).join('');
        } else {
            wbSec.style.display = 'none';
            wbList.innerHTML = '';
        }

        modal.style.display = 'flex';

        // 每次都重新绑定，避免残留旧的回调
        okBtn.onclick = (e) => {
            e.stopPropagation();
            modal.style.display = 'none';
            const worldsToDelete = [...wbList.querySelectorAll('input:checked')].map(i => i.value);
            resolve({ worldsToDelete });
        };
        noBtn.onclick = (e) => {
            e.stopPropagation();
            modal.style.display = 'none';
            resolve(null);
        };
    });
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────

function buildPanel() {
    if (document.getElementById('bcd-panel')) return;

    document.body.insertAdjacentHTML('beforeend', `
<div id="bcd-overlay" class="bcd-overlay" style="display:none">
    <div id="bcd-panel" class="bcd-panel">

        <div id="bcd-header" class="bcd-header">
            <span class="bcd-title">
                <i class="fa-solid fa-trash-can"></i>
                批量删除
            </span>
            <button id="bcd-close" class="bcd-icon-btn" title="关闭" type="button">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="bcd-tabs">
            <button id="bcd-tab-chars" class="bcd-tab bcd-tab--active" type="button">
                <i class="fa-solid fa-user"></i> 角色卡
            </button>
            <button id="bcd-tab-wb" class="bcd-tab" type="button">
                <i class="fa-solid fa-book"></i> 世界书
            </button>
        </div>

        <div class="bcd-toolbar">
            <label class="bcd-select-all-label">
                <input type="checkbox" id="bcd-select-all">
                <span>全选</span>
            </label>
            <input id="bcd-search" class="bcd-search" type="text" placeholder="搜索…">
        </div>

        <div id="bcd-progress" class="bcd-progress" style="display:none">
            <div class="bcd-prog-track"><div id="bcd-prog-bar" class="bcd-prog-bar"></div></div>
            <span id="bcd-prog-txt">0 / 0</span>
        </div>

        <div id="bcd-item-list" class="bcd-list"></div>

        <div class="bcd-footer">
            <button id="bcd-delete-btn" class="bcd-delete-btn" disabled type="button">
                <i class="fa-solid fa-trash-can"></i>
                删除所选<span id="bcd-count"></span>
            </button>
        </div>
    </div>
</div>

<div id="bcd-confirm" class="bcd-confirm-overlay" style="display:none">
    <div class="bcd-confirm-box">
        <div class="bcd-confirm-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
        <p id="bcd-confirm-msg" class="bcd-confirm-msg"></p>
        <div id="bcd-confirm-wb" style="display:none">
            <p class="bcd-confirm-wb-title">同时删除关联的世界书？</p>
            <div id="bcd-confirm-wb-list" class="bcd-confirm-wb-list"></div>
        </div>
        <div class="bcd-confirm-btns">
            <button id="bcd-confirm-no"  class="bcd-btn-secondary"      type="button">取消</button>
            <button id="bcd-confirm-ok"  class="bcd-btn-danger-confirm" type="button">确认删除</button>
        </div>
    </div>
</div>`);

    bindEvents();
}

function bindEvents() {
    const overlay = document.getElementById('bcd-overlay');
    const panel   = document.getElementById('bcd-panel');

    // ── 阻止面板内所有点击冒泡到 ST 的 document 监听器 ──
    // 这是导致"点击面板后跳回扩展页面"的根本原因：
    // ST 在 document 上监听了 click，点击面板内容会冒泡触发它。
    panel.addEventListener('click',      e => e.stopPropagation());
    panel.addEventListener('mousedown',  e => e.stopPropagation());
    panel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

    // 确认弹窗同样要阻止冒泡
    const confirmBox = document.querySelector('.bcd-confirm-box');
    if (confirmBox) {
        confirmBox.addEventListener('click',      e => e.stopPropagation());
        confirmBox.addEventListener('mousedown',  e => e.stopPropagation());
        confirmBox.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    }

    // 点 overlay 背景关闭面板
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closePanel();
    });

    document.getElementById('bcd-close').addEventListener('click', e => {
        e.stopPropagation();
        closePanel();
    });

    document.getElementById('bcd-tab-chars').addEventListener('click', e => {
        e.stopPropagation();
        selectedCharacters.clear();
        selectedWorldbooks.clear();
        switchTab('characters');
    });

    document.getElementById('bcd-tab-wb').addEventListener('click', e => {
        e.stopPropagation();
        selectedCharacters.clear();
        selectedWorldbooks.clear();
        switchTab('worldbooks');
    });

    document.getElementById('bcd-select-all').addEventListener('change', function (e) {
        e.stopPropagation();
        if (currentTab === 'characters') {
            const chars = (getContext().characters ?? characters ?? []);
            selectedCharacters.clear();
            if (this.checked) chars.forEach(c => selectedCharacters.add(c.avatar));
            renderCharacterList();
        } else {
            const ctx   = getContext();
            const names = ctx.world_names ?? world_names ?? [];
            selectedWorldbooks.clear();
            if (this.checked) names.forEach(n => selectedWorldbooks.add(n));
            renderWorldbookList();
        }
    });

    document.getElementById('bcd-search').addEventListener('input', function (e) {
        e.stopPropagation();
        applySearch(this.value);
    });

    document.getElementById('bcd-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        handleDelete();
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const conf = document.getElementById('bcd-confirm');
        if (conf?.style.display !== 'none') {
            conf.style.display = 'none';
        } else {
            closePanel();
        }
    });
}

function openPanel() {
    buildPanel();
    selectedCharacters.clear();
    selectedWorldbooks.clear();
    currentTab = 'characters';

    document.getElementById('bcd-overlay').style.display = 'flex';
    document.getElementById('bcd-tab-chars').classList.add('bcd-tab--active');
    document.getElementById('bcd-tab-wb').classList.remove('bcd-tab--active');
    renderCharacterList();
}

function closePanel() {
    const overlay = document.getElementById('bcd-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── Inject menu button ───────────────────────────────────────────────────────

function injectMenuButton() {
    const tryInject = () => {
        if (document.getElementById('bcd-menu-btn')) return true;

        const row = document.querySelector(
            '#rm_extensions_block .extensions_block > .flex-container.alignitemscenter'
        );
        if (!row) return false;

        const btn = document.createElement('div');
        btn.id        = 'bcd-menu-btn';
        btn.className = 'menu_button menu_button_icon';
        btn.title     = '批量删除角色卡';
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i><span>批量删除角色卡</span>';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openPanel();
        });
        row.appendChild(btn);
        return true;
    };

    if (!tryInject()) {
        const t = setInterval(() => { if (tryInject()) clearInterval(t); }, 300);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
jQuery(async () => {
    injectMenuButton();
    console.log('[Bulk Character Deleter] v1.2 Loaded.');
});
