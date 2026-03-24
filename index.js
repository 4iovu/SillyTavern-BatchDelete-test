/**
 * Bulk Character & Worldbook Deleter
 * SillyTavern Extension — v1.1.0
 */

import { getRequestHeaders, characters } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { world_names } from '../../../../scripts/world-info.js';

// ─── State ─────────────────────────────────────────────────────────────────
let currentTab = 'characters';
let selectedCharacters = new Set();
let selectedWorldbooks  = new Set();

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiDeleteCharacter(avatar) {
    const r = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
    });
    if (!r.ok) throw new Error(`Failed: ${avatar}`);
}

async function apiDeleteWorldbook(name) {
    const r = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`Failed: ${name}`);
}

function getCharacterWorlds(char) {
    const w = new Set();
    if (char?.data?.extensions?.world) w.add(char.data.extensions.world);
    if (char?.world) w.add(char.world);
    return [...w].filter(Boolean);
}

// ─── Render ─────────────────────────────────────────────────────────────────

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
        const avatar  = char.avatar;
        const name    = char.name || avatar;
        const checked = selectedCharacters.has(avatar);
        const worlds  = getCharacterWorlds(char);
        const wTag    = worlds.length
            ? `<span class="bcd-tag"><i class="fa-solid fa-book fa-xs"></i> ${worlds.length > 1 ? worlds.length + ' 个世界书' : worlds[0]}</span>`
            : '';
        const avatarSrc = avatar ? `/characters/${avatar}` : 'img/ai4.png';

        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.dataset.avatar = avatar;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <img class="bcd-avatar" src="${avatarSrc}" onerror="this.src='img/ai4.png'" alt="">
                <span class="bcd-info">
                    <span class="bcd-name">${name}</span>
                    ${wTag}
                </span>
            </label>`;

        row.querySelector('.bcd-cb').addEventListener('change', function () {
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
    const names = world_names ?? [];
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
        row.dataset.name = name;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <span class="bcd-wb-icon"><i class="fa-solid fa-book-open"></i></span>
                <span class="bcd-info">
                    <span class="bcd-name">${name}</span>
                </span>
            </label>`;

        row.querySelector('.bcd-cb').addEventListener('change', function () {
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
        const chars = ctx.characters ?? characters ?? [];
        const total = chars.length;
        const sel   = selectedCharacters.size;
        selectAllCb.indeterminate = sel > 0 && sel < total;
        selectAllCb.checked       = total > 0 && sel === total;
        countSpan.textContent     = sel > 0 ? `（${sel}）` : '';
        delBtn.disabled           = sel === 0;
    } else {
        const names = world_names ?? [];
        const total = names.length;
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

// ─── Delete flow ─────────────────────────────────────────────────────────────

async function handleDelete() {
    if (currentTab === 'characters') await deleteChars();
    else await deleteWBs();
}

async function deleteChars() {
    if (!selectedCharacters.size) return;
    const ctx   = getContext();
    const chars = ctx.characters ?? characters ?? [];

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
        try { await apiDeleteCharacter(av); selectedCharacters.delete(av); }
        catch (e) { console.error(e); toastr.error(`删除失败: ${av}`); }
        setProgress(++done, total);
    }
    for (const n of go.worldsToDelete) {
        try { await apiDeleteWorldbook(n); }
        catch (e) { console.error(e); toastr.error(`删除世界书失败: ${n}`); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
    await ctx.getCharacters?.();
    renderCharacterList();
}

async function deleteWBs() {
    if (!selectedWorldbooks.size) return;
    const go = await showConfirm(`确认删除 ${selectedWorldbooks.size} 个世界书？此操作不可撤销。`, []);
    if (!go) return;

    showProgress(true);
    let done = 0, total = selectedWorldbooks.size;
    for (const n of [...selectedWorldbooks]) {
        try { await apiDeleteWorldbook(n); selectedWorldbooks.delete(n); }
        catch (e) { console.error(e); toastr.error(`删除失败: ${n}`); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
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

        okBtn.onclick = () => {
            modal.style.display = 'none';
            const worldsToDelete = [...wbList.querySelectorAll('input:checked')].map(i => i.value);
            resolve({ worldsToDelete });
        };
        noBtn.onclick = () => { modal.style.display = 'none'; resolve(null); };
    });
}

// ─── Drag to move ─────────────────────────────────────────────────────────────

function makeDraggable(panel, handle) {
    let startX, startY, origLeft, origTop, isDragging = false;

    function getPos(e) {
        return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                         : { x: e.clientX, y: e.clientY };
    }

    function onDown(e) {
        if (e.target.closest('button,input,label,select,a')) return;
        const pos  = getPos(e);
        startX     = pos.x;
        startY     = pos.y;
        const rect = panel.getBoundingClientRect();
        origLeft   = rect.left;
        origTop    = rect.top;
        isDragging = true;

        // Lock to absolute pixel position, remove centering transform
        panel.style.transition = 'none';
        panel.style.transform  = 'none';
        panel.style.left       = origLeft + 'px';
        panel.style.top        = origTop  + 'px';
        panel.style.margin     = '0';

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup',   onUp);
        document.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const pos  = getPos(e);
        const dx   = pos.x - startX;
        const dy   = pos.y - startY;
        const vw   = window.innerWidth;
        const vh   = window.innerHeight;
        const pw   = panel.offsetWidth;
        const ph   = panel.offsetHeight;
        const gap  = 12;
        panel.style.left = Math.min(Math.max(origLeft + dx, gap), vw - pw - gap) + 'px';
        panel.style.top  = Math.min(Math.max(origTop  + dy, gap), vh - ph - gap) + 'px';
    }

    function onUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.removeEventListener('touchend',  onUp);
    }

    handle.addEventListener('mousedown',  onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    handle.style.cursor = 'grab';
}

// ─── Panel HTML ───────────────────────────────────────────────────────────────

function buildPanel() {
    if (document.getElementById('bcd-panel')) return;

    document.body.insertAdjacentHTML('beforeend', `
<div id="bcd-overlay" class="bcd-overlay" style="display:none">
    <div id="bcd-panel" class="bcd-panel">

        <div id="bcd-header" class="bcd-header">
            <span class="bcd-title">
                <i class="fa-solid fa-grip bcd-grip"></i>
                <i class="fa-solid fa-trash-can"></i>
                批量删除
            </span>
            <button id="bcd-close" class="bcd-icon-btn" title="关闭">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="bcd-tabs">
            <button id="bcd-tab-chars" class="bcd-tab bcd-tab--active">
                <i class="fa-solid fa-user"></i> 角色卡
            </button>
            <button id="bcd-tab-wb" class="bcd-tab">
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
            <button id="bcd-delete-btn" class="bcd-delete-btn" disabled>
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
            <button id="bcd-confirm-no"  class="bcd-btn-secondary">取消</button>
            <button id="bcd-confirm-ok"  class="bcd-btn-danger-confirm">确认删除</button>
        </div>
    </div>
</div>`);

    makeDraggable(
        document.getElementById('bcd-panel'),
        document.getElementById('bcd-header')
    );
    bindEvents();
}

function bindEvents() {
    const overlay = document.getElementById('bcd-overlay');

    document.getElementById('bcd-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

    document.getElementById('bcd-tab-chars').addEventListener('click', () => {
        selectedCharacters.clear(); selectedWorldbooks.clear(); switchTab('characters');
    });
    document.getElementById('bcd-tab-wb').addEventListener('click', () => {
        selectedCharacters.clear(); selectedWorldbooks.clear(); switchTab('worldbooks');
    });

    document.getElementById('bcd-select-all').addEventListener('change', function () {
        if (currentTab === 'characters') {
            const chars = (getContext().characters ?? characters ?? []);
            selectedCharacters.clear();
            if (this.checked) chars.forEach(c => selectedCharacters.add(c.avatar));
        } else {
            const names = world_names ?? [];
            selectedWorldbooks.clear();
            if (this.checked) names.forEach(n => selectedWorldbooks.add(n));
        }
        currentTab === 'characters' ? renderCharacterList() : renderWorldbookList();
    });

    document.getElementById('bcd-search').addEventListener('input', function () {
        applySearch(this.value);
    });

    document.getElementById('bcd-delete-btn').addEventListener('click', handleDelete);

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const conf = document.getElementById('bcd-confirm');
        if (conf?.style.display !== 'none') conf.style.display = 'none';
        else closePanel();
    });
}

function openPanel() {
    buildPanel();
    selectedCharacters.clear();
    selectedWorldbooks.clear();
    currentTab = 'characters';

    const panel   = document.getElementById('bcd-panel');
    const overlay = document.getElementById('bcd-overlay');

    // Reset to CSS-centered position
    panel.style.cssText = '';
    overlay.style.display = 'flex';

    document.getElementById('bcd-tab-chars').classList.add('bcd-tab--active');
    document.getElementById('bcd-tab-wb').classList.remove('bcd-tab--active');
    renderCharacterList();
}

function closePanel() {
    const overlay = document.getElementById('bcd-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── Inject menu button ───────────────────────────────────────────────────────
// Uses the exact same `menu_button menu_button_icon` class as the native
// "Manage extensions" and "Install extension" buttons → identical look & spacing.

function injectMenuButton() {
    const tryInject = () => {
        if (document.getElementById('bcd-menu-btn')) return true;

        // Target: the header flex row inside .extensions_block
        const row = document.querySelector(
            '#rm_extensions_block .extensions_block > .flex-container.alignitemscenter'
        );
        if (!row) return false;

        const btn = document.createElement('div');
        btn.id        = 'bcd-menu-btn';
        btn.className = 'menu_button menu_button_icon';
        btn.title     = '批量删除角色卡';
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i><span>批量删除角色卡</span>';
        btn.addEventListener('click', openPanel);
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
    console.log('[Bulk Character Deleter] Loaded.');
});
