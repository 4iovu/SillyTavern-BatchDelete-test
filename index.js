/**
 * 批量删除角色卡扩展
 * 在角色列表 tag filter 栏最右侧注入批量选择/删除工具栏
 */

// ── 从 ST 核心模块导入 getRequestHeaders ────────────────────────
import { getRequestHeaders } from '../../../../script.js';

// ── 状态 ────────────────────────────────────────────────────────
let selectMode = false;
let selectedAvatars = new Set();

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const obs = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) { obs.disconnect(); resolve(found); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
    });
}

async function injectToolbar() {
    if (document.getElementById('bd_toolbar')) return;
    let tagControls;
    try {
        tagControls = await waitForElement('#rm_characters_block .rm_tag_controls');
    } catch (e) {
        console.error('[BatchDelete] 找不到 rm_tag_controls', e);
        return;
    }
    const toolbar = document.createElement('div');
    toolbar.id = 'bd_toolbar';
    toolbar.innerHTML = `
        <button id="bd_toggle" class="menu_button bd_btn" title="批量选择角色卡">
            <i class="fa-solid fa-check-square"></i><span>批量</span>
        </button>
        <button id="bd_all" class="menu_button bd_btn bd_hidden" title="全选/取消全选">
            <i class="fa-solid fa-check-double"></i>
        </button>
        <span id="bd_count" class="bd_count bd_hidden">0</span>
        <label id="bd_wb_label" class="bd_wb_label bd_hidden" title="同时删除角色绑定的世界书">
            <input type="checkbox" id="bd_wb_cb"> 含世界书
        </label>
        <button id="bd_delete" class="menu_button bd_btn bd_danger bd_hidden" title="删除已选角色卡">
            <i class="fa-solid fa-trash"></i><span>删除</span>
        </button>
    `;
    tagControls.appendChild(toolbar);
    document.getElementById('bd_toggle').addEventListener('click', toggleSelectMode);
    document.getElementById('bd_all').addEventListener('click', toggleSelectAll);
    document.getElementById('bd_delete').addEventListener('click', deleteSelected);
    console.log('[BatchDelete] 工具栏注入成功 ✓');
}

function toggleSelectMode() {
    selectMode = !selectMode;
    const btn = document.getElementById('bd_toggle');
    if (selectMode) {
        btn.classList.add('bd_active');
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i><span>退出</span>';
        showExtra(true);
        attachOverlays();
    } else {
        btn.classList.remove('bd_active');
        btn.innerHTML = '<i class="fa-solid fa-check-square"></i><span>批量</span>';
        showExtra(false);
        clearSelection();
        detachOverlays();
    }
}

function showExtra(show) {
    ['bd_all', 'bd_count', 'bd_wb_label', 'bd_delete'].forEach(id => {
        document.getElementById(id)?.classList.toggle('bd_hidden', !show);
    });
}

function attachOverlays() {
    document.querySelectorAll('.character_select.entity_block').forEach(attachOne);
    const block = document.getElementById('rm_print_characters_block');
    if (!block) return;
    window._bdObs = new MutationObserver(muts => {
        if (!selectMode) return;
        muts.forEach(m => m.addedNodes.forEach(n => {
            if (n.nodeType !== 1) return;
            if (n.matches?.('.character_select.entity_block')) attachOne(n);
            n.querySelectorAll?.('.character_select.entity_block').forEach(attachOne);
        }));
    });
    window._bdObs.observe(block, { childList: true, subtree: true });
}

function detachOverlays() {
    document.querySelectorAll('.bd_overlay').forEach(el => el.remove());
    document.querySelectorAll('.bd_selected').forEach(el => el.classList.remove('bd_selected'));
    window._bdObs?.disconnect();
    window._bdObs = null;
}

function attachOne(card) {
    if (card.querySelector('.bd_overlay')) return;
    const avatar = card.getAttribute('id');
    if (!avatar) return;
    const ov = document.createElement('div');
    ov.className = 'bd_overlay';
    if (selectedAvatars.has(avatar)) { ov.classList.add('bd_checked'); card.classList.add('bd_selected'); }
    ov.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); toggle(card, ov, avatar); });
    card._bdH = e => {
        if (!selectMode || e.target.closest('.bd_overlay')) return;
        e.stopImmediatePropagation(); e.preventDefault();
        toggle(card, ov, avatar);
    };
    card.addEventListener('click', card._bdH, true);
    card.appendChild(ov);
}

function toggle(card, ov, avatar) {
    if (selectedAvatars.has(avatar)) {
        selectedAvatars.delete(avatar); ov.classList.remove('bd_checked'); card.classList.remove('bd_selected');
    } else {
        selectedAvatars.add(avatar); ov.classList.add('bd_checked'); card.classList.add('bd_selected');
    }
    updateCount();
}

function toggleSelectAll() {
    const cards = [...document.querySelectorAll('.character_select.entity_block')];
    const avatars = cards.map(c => c.getAttribute('id')).filter(Boolean);
    const all = avatars.length > 0 && avatars.every(a => selectedAvatars.has(a));
    cards.forEach(card => {
        const av = card.getAttribute('id'); if (!av) return;
        const ov = card.querySelector('.bd_overlay');
        if (all) { selectedAvatars.delete(av); ov?.classList.remove('bd_checked'); card.classList.remove('bd_selected'); }
        else { selectedAvatars.add(av); ov?.classList.add('bd_checked'); card.classList.add('bd_selected'); }
    });
    updateCount();
}

function clearSelection() {
    selectedAvatars.clear();
    document.querySelectorAll('.bd_selected').forEach(el => el.classList.remove('bd_selected'));
    document.querySelectorAll('.bd_overlay.bd_checked').forEach(el => el.classList.remove('bd_checked'));
    updateCount();
}

function updateCount() {
    const el = document.getElementById('bd_count');
    if (el) el.textContent = selectedAvatars.size;
}

async function deleteSelected() {
    if (selectedAvatars.size === 0) { alert('请先勾选要删除的角色卡'); return; }
    const withWB = document.getElementById('bd_wb_cb')?.checked ?? false;
    const names = [...selectedAvatars].map(av => {
        const c = document.querySelector(`.character_select.entity_block[id="${CSS.escape(av)}"]`);
        return c?.querySelector('.ch_name')?.textContent?.trim() || av;
    });
    const preview = names.slice(0, 15).join('\n') + (names.length > 15 ? `\n…共 ${names.length} 个` : '');
    if (!confirm(`即将删除 ${selectedAvatars.size} 个角色卡${withWB ? '\n⚠️ 含绑定世界书' : ''}：\n\n${preview}\n\n不可恢复，确认？`)) return;

    const list = [...selectedAvatars];
    const btn = document.getElementById('bd_delete');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    let ok = 0, fail = 0;
    for (const avatar of list) {
        try {
            if (withWB) await delWorldbook(avatar);
            await delChar(avatar);
            document.querySelector(`.character_select.entity_block[id="${CSS.escape(avatar)}"]`)?.remove();
            selectedAvatars.delete(avatar);
            updateCount();
            ok++;
        } catch (e) {
            fail++;
            console.error(`[BatchDelete] 失败 ${avatar}:`, e);
        }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>删除</span>'; }
    try { SillyTavern.getContext().printCharacters(true); } catch {}
    alert(`完成：成功 ${ok}${fail ? `，失败 ${fail}（见控制台）` : ''}`);
    if (ok > 0) toggleSelectMode();
}

async function delChar(avatar) {
    const res = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar, delete_chats: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
}

async function delWorldbook(avatar) {
    try {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.find(c => c.avatar === avatar);
        const world = char?.data?.world || char?.world;
        if (!world) return;
        const res = await fetch('/api/worldinfo/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: world }),
        });
        if (!res.ok) console.warn(`[BatchDelete] 世界书删除失败 ${world}`);
    } catch (e) { console.warn('[BatchDelete] 世界书异常', e); }
}

jQuery(async () => {
    try { await injectToolbar(); }
    catch (e) { console.error('[BatchDelete] 初始化失败', e); }
});
