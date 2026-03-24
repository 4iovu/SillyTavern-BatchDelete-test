/**
 * Bulk Character & Worldbook Deleter
 * SillyTavern Extension
 * https://github.com/YOUR_USERNAME/st-bulk-character-deleter
 */

import { getRequestHeaders, characters, this_chid } from '../../../../script.js';
import { getContext, extension_settings } from '../../../extensions.js';
import { world_names, deleteWorldInfo } from '../../../../scripts/world-info.js';

const extensionName = 'bulk-character-deleter';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ─── State ────────────────────────────────────────────────────────────────────
let currentTab = 'characters'; // 'characters' | 'worldbooks'
let selectedCharacters = new Set();   // avatar filenames
let selectedWorldbooks  = new Set();  // worldbook names

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a deduplicated list of world-info names attached to a character.
 * Reads from char.data?.extensions?.world (V2 spec) and char.world (legacy).
 */
function getCharacterWorlds(char) {
    const worlds = new Set();
    if (char?.data?.extensions?.world) worlds.add(char.data.extensions.world);
    if (char?.world) worlds.add(char.world);
    return [...worlds].filter(Boolean);
}

/**
 * Deletes a single character by avatar filename.
 * Uses the same endpoint SillyTavern itself uses.
 */
async function apiDeleteCharacter(avatar) {
    const response = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
    });
    if (!response.ok) throw new Error(`Delete character failed: ${avatar}`);
}

/**
 * Deletes a single worldbook by name via the world-info API.
 */
async function apiDeleteWorldbook(name) {
    const response = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(`Delete worldbook failed: ${name}`);
}

// ─── Panel render helpers ─────────────────────────────────────────────────────

function renderCharacterList() {
    const ctx = getContext();
    const chars = ctx.characters ?? characters ?? [];
    const container = document.getElementById('bcd-item-list');
    if (!container) return;

    container.innerHTML = '';

    if (!chars.length) {
        container.innerHTML = '<div class="bcd-empty">暂无角色卡</div>';
        return;
    }

    chars.forEach((char, idx) => {
        const avatar   = char.avatar;
        const name     = char.name || avatar;
        const checked  = selectedCharacters.has(avatar);
        const isActive = (ctx.characterId !== undefined && ctx.characters?.[ctx.characterId]?.avatar === avatar);
        const worlds   = getCharacterWorlds(char);
        const worldTag = worlds.length
            ? `<span class="bcd-world-tag" title="${worlds.join(', ')}"><i class="fa-solid fa-book"></i> ${worlds.length > 1 ? worlds.length + '个世界书' : worlds[0]}</span>`
            : '';

        const avatarUrl = char.avatar
            ? `/characters/${char.avatar}`
            : 'img/ai4.png';

        const row = document.createElement('div');
        row.className = `bcd-item-row${checked ? ' bcd-selected' : ''}${isActive ? ' bcd-active-char' : ''}`;
        row.dataset.avatar = avatar;
        row.innerHTML = `
            <label class="bcd-row-inner">
                <input type="checkbox" class="bcd-checkbox" data-avatar="${avatar}" ${checked ? 'checked' : ''}>
                <img class="bcd-avatar" src="${avatarUrl}" onerror="this.src='img/ai4.png'" alt="">
                <div class="bcd-info">
                    <span class="bcd-name">${name}</span>
                    ${worldTag}
                </div>
            </label>`;

        row.querySelector('.bcd-checkbox').addEventListener('change', function () {
            if (this.checked) {
                selectedCharacters.add(avatar);
                row.classList.add('bcd-selected');
            } else {
                selectedCharacters.delete(avatar);
                row.classList.remove('bcd-selected');
            }
            syncSelectAllState('characters');
            updateDeleteButton();
        });

        container.appendChild(row);
    });

    syncSelectAllState('characters');
    updateDeleteButton();
}

function renderWorldbookList() {
    const names = world_names ?? [];
    const container = document.getElementById('bcd-item-list');
    if (!container) return;

    container.innerHTML = '';

    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无世界书</div>';
        return;
    }

    names.forEach(name => {
        const checked = selectedWorldbooks.has(name);
        const row = document.createElement('div');
        row.className = `bcd-item-row${checked ? ' bcd-selected' : ''}`;
        row.dataset.name = name;
        row.innerHTML = `
            <label class="bcd-row-inner">
                <input type="checkbox" class="bcd-checkbox" data-name="${name}" ${checked ? 'checked' : ''}>
                <div class="bcd-wb-icon"><i class="fa-solid fa-book-open"></i></div>
                <div class="bcd-info">
                    <span class="bcd-name">${name}</span>
                </div>
            </label>`;

        row.querySelector('.bcd-checkbox').addEventListener('change', function () {
            if (this.checked) {
                selectedWorldbooks.add(name);
                row.classList.add('bcd-selected');
            } else {
                selectedWorldbooks.delete(name);
                row.classList.remove('bcd-selected');
            }
            syncSelectAllState('worldbooks');
            updateDeleteButton();
        });

        container.appendChild(row);
    });

    syncSelectAllState('worldbooks');
    updateDeleteButton();
}

function syncSelectAllState(tab) {
    const cb = document.getElementById('bcd-select-all');
    if (!cb) return;

    if (tab === 'characters') {
        const ctx   = getContext();
        const chars = ctx.characters ?? characters ?? [];
        const total = chars.length;
        const sel   = selectedCharacters.size;
        cb.indeterminate = sel > 0 && sel < total;
        cb.checked = total > 0 && sel === total;
    } else {
        const names = world_names ?? [];
        const total = names.length;
        const sel   = selectedWorldbooks.size;
        cb.indeterminate = sel > 0 && sel < total;
        cb.checked = total > 0 && sel === total;
    }
}

function updateDeleteButton() {
    const btn  = document.getElementById('bcd-delete-btn');
    const span = document.getElementById('bcd-delete-count');
    if (!btn || !span) return;

    const count = currentTab === 'characters' ? selectedCharacters.size : selectedWorldbooks.size;
    span.textContent = count > 0 ? ` (${count})` : '';
    btn.disabled = count === 0;
    btn.classList.toggle('bcd-btn-danger', count > 0);
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('bcd-tab-characters').classList.toggle('bcd-tab-active', tab === 'characters');
    document.getElementById('bcd-tab-worldbooks').classList.toggle('bcd-tab-active', tab === 'worldbooks');

    const searchInput = document.getElementById('bcd-search');
    if (searchInput) searchInput.value = '';

    if (tab === 'characters') {
        renderCharacterList();
    } else {
        renderWorldbookList();
    }
}

// ─── Delete flow ──────────────────────────────────────────────────────────────

async function confirmAndDelete() {
    if (currentTab === 'characters') {
        await deleteSelectedCharacters();
    } else {
        await deleteSelectedWorldbooks();
    }
}

async function deleteSelectedCharacters() {
    if (!selectedCharacters.size) return;

    const ctx   = getContext();
    const chars = ctx.characters ?? characters ?? [];

    // Collect associated worlds
    const associatedWorlds = new Set();
    for (const avatar of selectedCharacters) {
        const char = chars.find(c => c.avatar === avatar);
        if (char) getCharacterWorlds(char).forEach(w => associatedWorlds.add(w));
    }

    // Show confirmation dialog
    const modal = document.getElementById('bcd-confirm-modal');
    const msgEl = document.getElementById('bcd-confirm-msg');
    const wbSection = document.getElementById('bcd-confirm-wb-section');
    const wbList    = document.getElementById('bcd-confirm-wb-list');

    msgEl.textContent = `确认删除 ${selectedCharacters.size} 个角色卡？此操作不可撤销。`;

    if (associatedWorlds.size > 0) {
        wbSection.style.display = '';
        wbList.innerHTML = [...associatedWorlds]
            .map(w => `<label class="bcd-wb-check"><input type="checkbox" class="bcd-wb-del-cb" value="${w}" checked> ${w}</label>`)
            .join('');
    } else {
        wbSection.style.display = 'none';
        wbList.innerHTML = '';
    }

    modal.style.display = 'flex';

    return new Promise(resolve => {
        document.getElementById('bcd-confirm-ok').onclick = async () => {
            modal.style.display = 'none';

            // Worlds user opted to delete
            const worldsToDelete = [...wbList.querySelectorAll('.bcd-wb-del-cb:checked')]
                .map(cb => cb.value);

            showProgress(true);
            let done = 0;
            const total = selectedCharacters.size + worldsToDelete.length;

            for (const avatar of [...selectedCharacters]) {
                try {
                    await apiDeleteCharacter(avatar);
                    selectedCharacters.delete(avatar);
                } catch (e) {
                    console.error(e);
                    toastr.error(`删除失败: ${avatar}`);
                }
                done++;
                setProgress(done, total);
            }

            for (const name of worldsToDelete) {
                try {
                    await apiDeleteWorldbook(name);
                } catch (e) {
                    console.error(e);
                    toastr.error(`删除世界书失败: ${name}`);
                }
                done++;
                setProgress(done, total);
            }

            showProgress(false);
            toastr.success('批量删除完成');

            // Re-fetch characters and re-render
            await ctx.getCharacters?.();
            renderCharacterList();
            resolve();
        };

        document.getElementById('bcd-confirm-cancel').onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
}

async function deleteSelectedWorldbooks() {
    if (!selectedWorldbooks.size) return;

    const modal = document.getElementById('bcd-confirm-modal');
    const msgEl = document.getElementById('bcd-confirm-msg');
    const wbSection = document.getElementById('bcd-confirm-wb-section');

    msgEl.textContent = `确认删除 ${selectedWorldbooks.size} 个世界书？此操作不可撤销。`;
    wbSection.style.display = 'none';
    modal.style.display = 'flex';

    return new Promise(resolve => {
        document.getElementById('bcd-confirm-ok').onclick = async () => {
            modal.style.display = 'none';
            showProgress(true);
            let done = 0;
            const total = selectedWorldbooks.size;

            for (const name of [...selectedWorldbooks]) {
                try {
                    await apiDeleteWorldbook(name);
                    selectedWorldbooks.delete(name);
                } catch (e) {
                    console.error(e);
                    toastr.error(`删除世界书失败: ${name}`);
                }
                done++;
                setProgress(done, total);
            }

            showProgress(false);
            toastr.success('批量删除完成');
            renderWorldbookList();
            resolve();
        };

        document.getElementById('bcd-confirm-cancel').onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function showProgress(show) {
    const el = document.getElementById('bcd-progress-wrap');
    if (el) el.style.display = show ? '' : 'none';
    if (!show) setProgress(0, 1);
}

function setProgress(done, total) {
    const bar  = document.getElementById('bcd-progress-bar');
    const text = document.getElementById('bcd-progress-text');
    if (!bar || !text) return;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    bar.style.width = pct + '%';
    text.textContent = `${done} / ${total}`;
}

// ─── Search filter ─────────────────────────────────────────────────────────────

function applySearch(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#bcd-item-list .bcd-item-row').forEach(row => {
        const name = row.querySelector('.bcd-name')?.textContent.toLowerCase() ?? '';
        row.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
}

// ─── Build HTML panel ─────────────────────────────────────────────────────────

function buildPanelHTML() {
    return `
<div id="bcd-overlay" class="bcd-overlay">
    <div id="bcd-panel" class="bcd-panel">

        <!-- Header -->
        <div class="bcd-header">
            <span class="bcd-title"><i class="fa-solid fa-trash-can"></i> 批量删除</span>
            <button id="bcd-close-btn" class="bcd-close-btn" title="关闭"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Tabs -->
        <div class="bcd-tabs">
            <button id="bcd-tab-characters" class="bcd-tab bcd-tab-active">
                <i class="fa-solid fa-user"></i> 角色卡
            </button>
            <button id="bcd-tab-worldbooks" class="bcd-tab">
                <i class="fa-solid fa-book"></i> 世界书
            </button>
        </div>

        <!-- Toolbar -->
        <div class="bcd-toolbar">
            <label class="bcd-select-all-label" title="全选/取消全选">
                <input type="checkbox" id="bcd-select-all">
                <span>全选</span>
            </label>
            <input type="text" id="bcd-search" class="bcd-search" placeholder="搜索...">
        </div>

        <!-- Progress bar (hidden by default) -->
        <div id="bcd-progress-wrap" class="bcd-progress-wrap" style="display:none">
            <div class="bcd-progress-track">
                <div id="bcd-progress-bar" class="bcd-progress-bar"></div>
            </div>
            <span id="bcd-progress-text" class="bcd-progress-text">0 / 0</span>
        </div>

        <!-- List -->
        <div id="bcd-item-list" class="bcd-item-list"></div>

        <!-- Footer -->
        <div class="bcd-footer">
            <button id="bcd-delete-btn" class="bcd-btn bcd-btn-delete" disabled>
                <i class="fa-solid fa-trash"></i> 删除所选<span id="bcd-delete-count"></span>
            </button>
        </div>
    </div>
</div>

<!-- Confirmation modal -->
<div id="bcd-confirm-modal" class="bcd-confirm-modal" style="display:none">
    <div class="bcd-confirm-box">
        <div class="bcd-confirm-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
        <p id="bcd-confirm-msg" class="bcd-confirm-msg"></p>
        <div id="bcd-confirm-wb-section" class="bcd-confirm-wb-section" style="display:none">
            <p class="bcd-confirm-wb-title">同时删除关联的世界书？</p>
            <div id="bcd-confirm-wb-list" class="bcd-confirm-wb-list"></div>
        </div>
        <div class="bcd-confirm-actions">
            <button id="bcd-confirm-cancel" class="bcd-btn">取消</button>
            <button id="bcd-confirm-ok" class="bcd-btn bcd-btn-danger">确认删除</button>
        </div>
    </div>
</div>`;
}

// ─── Open / close panel ───────────────────────────────────────────────────────

function openPanel() {
    // Reset state
    selectedCharacters.clear();
    selectedWorldbooks.clear();
    currentTab = 'characters';

    let overlay = document.getElementById('bcd-overlay');
    if (!overlay) {
        document.body.insertAdjacentHTML('beforeend', buildPanelHTML());
        overlay = document.getElementById('bcd-overlay');
        bindPanelEvents();
    } else {
        overlay.style.display = 'flex';
        document.getElementById('bcd-confirm-modal').style.display = 'none';
    }

    switchTab('characters');
    overlay.style.display = 'flex';

    // Close on overlay click
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closePanel();
    });
}

function closePanel() {
    const overlay = document.getElementById('bcd-overlay');
    if (overlay) overlay.style.display = 'none';
}

function bindPanelEvents() {
    document.getElementById('bcd-close-btn').addEventListener('click', closePanel);

    document.getElementById('bcd-tab-characters').addEventListener('click', () => {
        selectedCharacters.clear();
        selectedWorldbooks.clear();
        switchTab('characters');
    });

    document.getElementById('bcd-tab-worldbooks').addEventListener('click', () => {
        selectedCharacters.clear();
        selectedWorldbooks.clear();
        switchTab('worldbooks');
    });

    document.getElementById('bcd-select-all').addEventListener('change', function () {
        if (currentTab === 'characters') {
            const ctx   = getContext();
            const chars = ctx.characters ?? characters ?? [];
            selectedCharacters.clear();
            if (this.checked) chars.forEach(c => selectedCharacters.add(c.avatar));
            renderCharacterList();
        } else {
            const names = world_names ?? [];
            selectedWorldbooks.clear();
            if (this.checked) names.forEach(n => selectedWorldbooks.add(n));
            renderWorldbookList();
        }
    });

    document.getElementById('bcd-search').addEventListener('input', function () {
        applySearch(this.value);
    });

    document.getElementById('bcd-delete-btn').addEventListener('click', confirmAndDelete);

    // Keyboard close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('bcd-confirm-modal');
            if (modal?.style.display !== 'none') {
                modal.style.display = 'none';
            } else {
                closePanel();
            }
        }
    });
}

// ─── Inject menu entry ────────────────────────────────────────────────────────

function injectMenuButton() {
    // extensionsMenu is the <ul> rendered inside #rm_extensions_block by extensions.js
    // We wait for it to exist (it may appear after script load).
    const tryInject = () => {
        // SillyTavern dynamically creates #extensionsMenu inside rm_extensions_block
        let menu = document.getElementById('extensionsMenu');

        // Fallback: append a standalone entry to the extensions block header area
        if (!menu) {
            menu = document.querySelector('#rm_extensions_block .extensions_block');
        }

        if (!menu) return false;

        // Avoid duplicate
        if (document.getElementById('bcd-menu-entry')) return true;

        const li = document.createElement('li');
        li.id = 'bcd-menu-entry';
        li.innerHTML = `<a id="bcd-menu-link" href="#" title="批量删除角色卡和世界书">
            <i class="fa-solid fa-trash"></i>
            <span>批量删除角色卡</span>
        </a>`;
        li.querySelector('#bcd-menu-link').addEventListener('click', e => {
            e.preventDefault();
            openPanel();
        });

        // If it's a <ul> (extensionsMenu), append as <li>
        if (menu.tagName === 'UL') {
            menu.appendChild(li);
        } else {
            // Fallback: add a styled button in extensions block header
            const btn = document.createElement('div');
            btn.id = 'bcd-menu-entry';
            btn.className = 'menu_button menu_button_icon';
            btn.title = '批量删除角色卡';
            btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>批量删除角色卡</span>';
            btn.addEventListener('click', openPanel);
            menu.appendChild(btn);
        }
        return true;
    };

    if (!tryInject()) {
        // Poll until the menu exists
        const timer = setInterval(() => {
            if (tryInject()) clearInterval(timer);
        }, 500);
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

jQuery(async () => {
    injectMenuButton();
    console.log('[Bulk Character Deleter] Extension loaded.');
});
