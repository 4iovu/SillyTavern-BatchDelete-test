/**
 * Bulk Character & Worldbook Deleter — v1.3.0
 * SillyTavern Extension
 *
 * 修复：
 *   - 与其他插件（RegexLoreHub）的冲突：在 overlay/panel 上拦截
 *     mousedown（不只是 click），避免冒泡到 body 的 outside-click 监听器
 *
 * 新增功能：
 *   - 批量删除预设 / 预设条目 / 正则（新标签页）
 *   - 通过标签筛选删除
 *   - 查看角色卡详情（角色描述 + 开场白）
 *   - 收藏角色卡分组显示（收藏 / 未收藏）
 */

import { getRequestHeaders, characters } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { world_names, deleteWorldInfo } from '../../../../scripts/world-info.js';

// ─── State ──────────────────────────────────────────────────────────────────
let currentTab  = 'characters'; // characters | worldbooks | presets | regex
let selChars    = new Set();
let selWBs      = new Set();
let selPresets  = new Set();     // preset filenames
let selRegex    = new Set();     // regex script_name
let tagFilter   = '';            // active tag filter string
let favFilter   = 'all';         // all | fav | unfav
let detailOpen  = null;          // avatar currently showing detail

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiDeleteChar(avatar) {
    const r = await fetch('/api/characters/delete', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
    });
    if (!r.ok) throw new Error(`角色删除失败: ${avatar} (${r.status})`);
}

async function apiDeleteWB(name) {
    if (typeof deleteWorldInfo === 'function') {
        try { await deleteWorldInfo(name); return; } catch (e) { /* fallback */ }
    }
    const r = await fetch('/api/worldinfo/delete', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`世界书删除失败: ${name} (${r.status})`);
}

async function apiDeletePreset(name) {
    // ST presets stored in /api/presets - try common endpoint patterns
    const endpoints = [
        { url: '/api/presets/delete', body: { name } },
        { url: '/api/settings/delete', body: { name, type: 'preset' } },
    ];
    for (const ep of endpoints) {
        try {
            const r = await fetch(ep.url, {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify(ep.body),
            });
            if (r.ok) return;
        } catch (e) { /* try next */ }
    }
    throw new Error(`预设删除失败: ${name}`);
}

async function apiDeleteRegex(scriptName) {
    // Use TavernHelper if available (injected by the other script)
    const TH = window.TavernHelper;
    if (TH?.getTavernRegexes && TH?.replaceTavernRegexes) {
        const all = await TH.getTavernRegexes({ scope: 'global' });
        const filtered = all.filter(r => r.script_name !== scriptName);
        await TH.replaceTavernRegexes(filtered, { scope: 'global' });
        return;
    }
    // Fallback: ST native API
    const r = await fetch('/api/settings/get', {
        method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
    });
    if (!r.ok) throw new Error('无法获取设置');
    const settings = await r.json();
    const regexes = (settings.regex_scripts || []).filter(rx => rx.script_name !== scriptName);
    const r2 = await fetch('/api/settings/save', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ ...settings, regex_scripts: regexes }),
    });
    if (!r2.ok) throw new Error(`正则删除失败: ${scriptName}`);
}

function getCharWorlds(char) {
    const w = new Set();
    if (char?.data?.extensions?.world) w.add(char.data.extensions.world);
    if (char?.world) w.add(char.world);
    return [...w].filter(Boolean);
}

function getCharTags(char) {
    return char?.tags ?? char?.data?.tags ?? [];
}

function isCharFav(char) {
    return !!(char?.fav || char?.data?.extensions?.fav);
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

function getChars() {
    const ctx = getContext();
    return ctx.characters ?? characters ?? [];
}

function getWBNames() {
    const ctx = getContext();
    return ctx.world_names ?? world_names ?? [];
}

async function getPresets() {
    // ST keeps sampler presets in /api/presets/get  (or similar)
    try {
        const r = await fetch('/api/presets/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            return Array.isArray(d) ? d : Object.keys(d);
        }
    } catch (e) { /* */ }
    // Fallback: try settings
    try {
        const r = await fetch('/api/settings/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            return Object.keys(d.power_user?.preset_settings_novel ?? {});
        }
    } catch (e) { /* */ }
    return [];
}

async function getRegexList() {
    const TH = window.TavernHelper;
    if (TH?.getTavernRegexes) {
        try {
            const all = await TH.getTavernRegexes({ scope: 'global' });
            return all ?? [];
        } catch (e) { /* */ }
    }
    // Fallback
    try {
        const r = await fetch('/api/settings/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            return d.regex_scripts ?? [];
        }
    } catch (e) { /* */ }
    return [];
}

// ─── Progress ─────────────────────────────────────────────────────────────────

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

// ─── Toolbar state ────────────────────────────────────────────────────────────

function updateToolbar(total, sel) {
    const cb  = document.getElementById('bcd-select-all');
    const btn = document.getElementById('bcd-delete-btn');
    const cnt = document.getElementById('bcd-count');
    if (!cb || !btn) return;
    cb.indeterminate = sel > 0 && sel < total;
    cb.checked       = total > 0 && sel === total;
    cnt.textContent  = sel > 0 ? `（${sel}）` : '';
    btn.disabled     = sel === 0;
}

// ─── All tags from chars ───────────────────────────────────────────────────────

function getAllTags() {
    const tags = new Set();
    getChars().forEach(c => getCharTags(c).forEach(t => t && tags.add(t)));
    return [...tags].sort();
}

// ─── Render characters ────────────────────────────────────────────────────────

function renderCharacters() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    let chars = getChars();

    // Tag filter
    if (tagFilter) {
        chars = chars.filter(c => getCharTags(c).includes(tagFilter));
    }
    // Fav filter
    if (favFilter === 'fav')   chars = chars.filter(c => isCharFav(c));
    if (favFilter === 'unfav') chars = chars.filter(c => !isCharFav(c));

    // Search
    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    if (q) chars = chars.filter(c => (c.name || '').toLowerCase().includes(q));

    if (!chars.length) {
        container.innerHTML = '<div class="bcd-empty">暂无匹配角色卡</div>';
        updateToolbar(0, 0);
        return;
    }

    // Group: favorites first if showing "all"
    const favs   = chars.filter(c => isCharFav(c));
    const unfavs = chars.filter(c => !isCharFav(c));
    const groups = favFilter === 'all' && favs.length
        ? [{ label: '⭐ 收藏', items: favs }, { label: '角色卡', items: unfavs }]
        : [{ label: null, items: chars }];

    groups.forEach(({ label, items }) => {
        if (!items.length) return;
        if (label) {
            const h = document.createElement('div');
            h.className = 'bcd-group-header';
            h.textContent = label;
            container.appendChild(h);
        }
        items.forEach(char => {
            const avatar  = char.avatar;
            const name    = char.name || avatar;
            const checked = selChars.has(avatar);
            const worlds  = getCharWorlds(char);
            const tags    = getCharTags(char);
            const fav     = isCharFav(char);
            const src     = avatar ? `/characters/${avatar}` : 'img/ai4.png';

            const wTag  = worlds.length
                ? `<span class="bcd-tag bcd-tag--wb"><i class="fa-solid fa-book fa-xs"></i> ${worlds.length > 1 ? worlds.length + '个世界书' : worlds[0]}</span>`
                : '';
            const tagsList = tags.slice(0, 3).map(t =>
                `<span class="bcd-tag bcd-tag--label">${t}</span>`
            ).join('');
            const favStar = fav ? '<i class="fa-solid fa-star bcd-fav-star"></i>' : '';

            const row = document.createElement('div');
            row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
            row.innerHTML = `
                <label class="bcd-row-label">
                    <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                    <img class="bcd-avatar" src="${src}" onerror="this.src='img/ai4.png'" alt="">
                    <span class="bcd-info">
                        <span class="bcd-name">${favStar}${name}</span>
                        <span class="bcd-tags-row">${wTag}${tagsList}</span>
                    </span>
                    <button class="bcd-detail-btn" data-avatar="${avatar}" title="查看详情" type="button">
                        <i class="fa-solid fa-circle-info"></i>
                    </button>
                </label>
                <div class="bcd-detail-panel" id="bcd-detail-${avatar.replace(/[^a-z0-9]/gi,'_')}" style="display:none"></div>`;

            row.querySelector('.bcd-cb').addEventListener('change', function (e) {
                e.stopPropagation();
                if (this.checked) selChars.add(avatar); else selChars.delete(avatar);
                row.classList.toggle('bcd-row--checked', this.checked);
                updateToolbar(chars.length, selChars.size);
            });

            row.querySelector('.bcd-detail-btn').addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                toggleCharDetail(char, row);
            });

            container.appendChild(row);
        });
    });

    updateToolbar(chars.length, selChars.size);
}

function toggleCharDetail(char, row) {
    const safeId = (char.avatar || '').replace(/[^a-z0-9]/gi, '_');
    const panel = row.querySelector(`#bcd-detail-${safeId}`);
    if (!panel) return;

    if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        return;
    }

    const desc = char.description || char.data?.description || '（无角色描述）';
    const greeting = char.first_mes || char.data?.first_mes || '（无开场白）';

    panel.innerHTML = `
        <div class="bcd-detail-section">
            <div class="bcd-detail-label"><i class="fa-solid fa-id-card"></i> 角色描述</div>
            <div class="bcd-detail-text">${escHtml(desc)}</div>
        </div>
        <div class="bcd-detail-section">
            <div class="bcd-detail-label"><i class="fa-solid fa-comment"></i> 开场白</div>
            <div class="bcd-detail-text">${escHtml(greeting)}</div>
        </div>`;
    panel.style.display = '';
}

function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Render worldbooks ────────────────────────────────────────────────────────

function renderWorldbooks() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    let names = getWBNames();
    if (q) names = names.filter(n => n.toLowerCase().includes(q));

    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无世界书</div>';
        updateToolbar(0, 0);
        return;
    }

    names.forEach(name => {
        const checked = selWBs.has(name);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <span class="bcd-wb-icon"><i class="fa-solid fa-book-open"></i></span>
                <span class="bcd-info"><span class="bcd-name">${name}</span></span>
            </label>`;
        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selWBs.add(name); else selWBs.delete(name);
            row.classList.toggle('bcd-row--checked', this.checked);
            updateToolbar(names.length, selWBs.size);
        });
        container.appendChild(row);
    });

    updateToolbar(names.length, selWBs.size);
}

// ─── Render presets ───────────────────────────────────────────────────────────

async function renderPresets() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '<div class="bcd-empty bcd-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    let names = await getPresets();
    if (q) names = names.filter(n => String(n).toLowerCase().includes(q));

    container.innerHTML = '';
    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无预设</div>';
        updateToolbar(0, 0);
        return;
    }

    names.forEach(name => {
        const checked = selPresets.has(name);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <span class="bcd-wb-icon bcd-wb-icon--preset"><i class="fa-solid fa-sliders"></i></span>
                <span class="bcd-info"><span class="bcd-name">${name}</span></span>
            </label>`;
        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selPresets.add(name); else selPresets.delete(name);
            row.classList.toggle('bcd-row--checked', this.checked);
            updateToolbar(names.length, selPresets.size);
        });
        container.appendChild(row);
    });

    updateToolbar(names.length, selPresets.size);
}

// ─── Render regex ─────────────────────────────────────────────────────────────

async function renderRegex() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '<div class="bcd-empty bcd-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    let items = await getRegexList();
    if (q) items = items.filter(r => (r.script_name || r.scriptName || '').toLowerCase().includes(q));

    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<div class="bcd-empty">暂无全局正则</div>';
        updateToolbar(0, 0);
        return;
    }

    items.forEach(rx => {
        const key     = rx.script_name || rx.scriptName || String(Math.random());
        const name    = rx.script_name || rx.scriptName || '未命名正则';
        const enabled = rx.enabled !== false;
        const checked = selRegex.has(key);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <span class="bcd-wb-icon bcd-wb-icon--regex"><i class="fa-solid fa-code"></i></span>
                <span class="bcd-info">
                    <span class="bcd-name">${name}</span>
                    <span class="bcd-tag ${enabled ? 'bcd-tag--on' : 'bcd-tag--off'}">${enabled ? '启用' : '禁用'}</span>
                </span>
            </label>`;
        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selRegex.add(key); else selRegex.delete(key);
            row.classList.toggle('bcd-row--checked', this.checked);
            updateToolbar(items.length, selRegex.size);
        });
        container.appendChild(row);
    });

    updateToolbar(items.length, selRegex.size);
}

// ─── Tag filter bar ───────────────────────────────────────────────────────────

function renderTagBar() {
    const bar = document.getElementById('bcd-tag-bar');
    if (!bar) return;

    if (currentTab !== 'characters') {
        bar.style.display = 'none';
        return;
    }

    const tags = getAllTags();
    bar.style.display = tags.length ? '' : 'none';
    bar.innerHTML = `
        <button class="bcd-tag-chip${!tagFilter ? ' bcd-tag-chip--active' : ''}" data-tag="">全部</button>
        <button class="bcd-tag-chip${favFilter==='fav' ? ' bcd-tag-chip--active' : ''}" data-fav="fav">⭐ 收藏</button>
        <button class="bcd-tag-chip${favFilter==='unfav' ? ' bcd-tag-chip--active' : ''}" data-fav="unfav">未收藏</button>
        ${tags.map(t => `<button class="bcd-tag-chip${tagFilter===t?' bcd-tag-chip--active':''}" data-tag="${t}">${t}</button>`).join('')}`;

    bar.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            tagFilter = btn.dataset.tag;
            favFilter = 'all';
            selChars.clear();
            renderTagBar();
            renderCharacters();
        });
    });
    bar.querySelectorAll('[data-fav]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            favFilter = favFilter === btn.dataset.fav ? 'all' : btn.dataset.fav;
            tagFilter = '';
            selChars.clear();
            renderTagBar();
            renderCharacters();
        });
    });
}

// ─── Switch tab ───────────────────────────────────────────────────────────────

async function switchTab(tab) {
    currentTab = tab;
    tagFilter = ''; favFilter = 'all';
    selChars.clear(); selWBs.clear(); selPresets.clear(); selRegex.clear();

    ['characters','worldbooks','presets','regex'].forEach(t => {
        document.getElementById(`bcd-tab-${t}`)?.classList.toggle('bcd-tab--active', t === tab);
    });

    const search = document.getElementById('bcd-search');
    if (search) search.value = '';

    renderTagBar();

    if (tab === 'characters')  renderCharacters();
    else if (tab === 'worldbooks') renderWorldbooks();
    else if (tab === 'presets')    await renderPresets();
    else if (tab === 'regex')      await renderRegex();
}

// ─── Select all ───────────────────────────────────────────────────────────────

function handleSelectAll(checked) {
    if (currentTab === 'characters') {
        let chars = getChars();
        if (tagFilter)          chars = chars.filter(c => getCharTags(c).includes(tagFilter));
        if (favFilter==='fav')  chars = chars.filter(c => isCharFav(c));
        if (favFilter==='unfav')chars = chars.filter(c => !isCharFav(c));
        selChars.clear();
        if (checked) chars.forEach(c => selChars.add(c.avatar));
        renderCharacters();
    } else if (currentTab === 'worldbooks') {
        selWBs.clear();
        if (checked) getWBNames().forEach(n => selWBs.add(n));
        renderWorldbooks();
    } else if (currentTab === 'presets') {
        // For async tabs, re-render is needed
        document.querySelectorAll('#bcd-item-list .bcd-cb').forEach(cb => {
            const row = cb.closest('.bcd-row');
            const name = row?.querySelector('.bcd-name')?.textContent;
            if (!name) return;
            cb.checked = checked;
            row.classList.toggle('bcd-row--checked', checked);
            if (checked) selPresets.add(name); else selPresets.delete(name);
        });
        const total = document.querySelectorAll('#bcd-item-list .bcd-row').length;
        updateToolbar(total, selPresets.size);
    } else if (currentTab === 'regex') {
        document.querySelectorAll('#bcd-item-list .bcd-cb').forEach(cb => {
            const row = cb.closest('.bcd-row');
            const name = row?.querySelector('.bcd-name')?.textContent;
            if (!name) return;
            cb.checked = checked;
            row.classList.toggle('bcd-row--checked', checked);
            if (checked) selRegex.add(name); else selRegex.delete(name);
        });
        const total = document.querySelectorAll('#bcd-item-list .bcd-row').length;
        updateToolbar(total, selRegex.size);
    }
}

// ─── Delete dispatch ──────────────────────────────────────────────────────────

async function handleDelete() {
    if (currentTab === 'characters')  await doDeleteChars();
    else if (currentTab === 'worldbooks') await doDeleteWBs();
    else if (currentTab === 'presets')    await doDeletePresets();
    else if (currentTab === 'regex')      await doDeleteRegex();
}

async function doDeleteChars() {
    if (!selChars.size) return;
    const chars = getChars();
    const assocWorlds = new Set();
    for (const av of selChars) {
        const c = chars.find(x => x.avatar === av);
        if (c) getCharWorlds(c).forEach(w => assocWorlds.add(w));
    }
    const go = await showConfirm(`确认删除 ${selChars.size} 个角色卡？不可撤销。`, [...assocWorlds]);
    if (!go) return;

    showProgress(true);
    let done = 0, total = selChars.size + go.worldsToDelete.length;
    for (const av of [...selChars]) {
        try { await apiDeleteChar(av); selChars.delete(av); }
        catch (e) { toastr.error(e.message); }
        setProgress(++done, total);
    }
    for (const n of go.worldsToDelete) {
        try { await apiDeleteWB(n); }
        catch (e) { toastr.error(e.message); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
    await getContext().getCharacters?.();
    renderCharacters();
}

async function doDeleteWBs() {
    if (!selWBs.size) return;
    const go = await showConfirm(`确认删除 ${selWBs.size} 个世界书？不可撤销。`, []);
    if (!go) return;

    showProgress(true);
    let done = 0, total = selWBs.size;
    for (const n of [...selWBs]) {
        try { await apiDeleteWB(n); selWBs.delete(n); }
        catch (e) { toastr.error(e.message); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
    renderWorldbooks();
}

async function doDeletePresets() {
    if (!selPresets.size) return;
    const go = await showConfirm(`确认删除 ${selPresets.size} 个预设？不可撤销。`, []);
    if (!go) return;

    showProgress(true);
    let done = 0, total = selPresets.size;
    for (const n of [...selPresets]) {
        try { await apiDeletePreset(n); selPresets.delete(n); }
        catch (e) { toastr.error(e.message); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
    await renderPresets();
}

async function doDeleteRegex() {
    if (!selRegex.size) return;
    const go = await showConfirm(`确认删除 ${selRegex.size} 个正则脚本？不可撤销。`, []);
    if (!go) return;

    showProgress(true);
    let done = 0, total = selRegex.size;
    for (const n of [...selRegex]) {
        try { await apiDeleteRegex(n); selRegex.delete(n); }
        catch (e) { toastr.error(e.message); }
        setProgress(++done, total);
    }
    showProgress(false);
    toastr.success('批量删除完成');
    await renderRegex();
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

        okBtn.onclick = e => {
            e.stopPropagation(); e.preventDefault();
            modal.style.display = 'none';
            resolve({ worldsToDelete: [...wbList.querySelectorAll('input:checked')].map(i => i.value) });
        };
        noBtn.onclick = e => {
            e.stopPropagation(); e.preventDefault();
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

        <div class="bcd-header">
            <span class="bcd-title"><i class="fa-solid fa-trash-can"></i> 批量删除</span>
            <button id="bcd-close" class="bcd-icon-btn" title="关闭" type="button">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="bcd-tabs">
            <button id="bcd-tab-characters" class="bcd-tab bcd-tab--active" type="button">
                <i class="fa-solid fa-user"></i><span class="bcd-tab-text"> 角色卡</span>
            </button>
            <button id="bcd-tab-worldbooks" class="bcd-tab" type="button">
                <i class="fa-solid fa-book"></i><span class="bcd-tab-text"> 世界书</span>
            </button>
            <button id="bcd-tab-presets" class="bcd-tab" type="button">
                <i class="fa-solid fa-sliders"></i><span class="bcd-tab-text"> 预设</span>
            </button>
            <button id="bcd-tab-regex" class="bcd-tab" type="button">
                <i class="fa-solid fa-code"></i><span class="bcd-tab-text"> 正则</span>
            </button>
        </div>

        <!-- Tag / fav filter bar (角色卡专用) -->
        <div id="bcd-tag-bar" class="bcd-tag-bar" style="display:none"></div>

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
                <i class="fa-solid fa-trash-can"></i> 删除所选<span id="bcd-count"></span>
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

// ─── Bind events ─────────────────────────────────────────────────────────────

function stopAll(e) {
    e.stopPropagation();
    // Do NOT call preventDefault on mousedown otherwise ST inputs break
}

function bindEvents() {
    const overlay    = document.getElementById('bcd-overlay');
    const panel      = document.getElementById('bcd-panel');
    const confirmBox = document.querySelector('.bcd-confirm-box');

    // ── 核心冲突修复 ──────────────────────────────────────────────────────────
    // RegexLoreHub 在 body 上监听 mousedown.rlh-outside-click，
    // 只要面板内的 mousedown 冒泡到 body，它就会关闭自己的面板并触发 ST 页面跳转。
    // 在 panel + confirmBox 上同时拦截 mousedown/click/touchstart，彻底阻断冒泡。
    [panel, confirmBox].forEach(el => {
        if (!el) return;
        el.addEventListener('mousedown',  stopAll);
        el.addEventListener('click',      stopAll);
        el.addEventListener('touchstart', stopAll, { passive: true });
        el.addEventListener('touchend',   stopAll, { passive: true });
    });

    // Overlay 背景点击关闭面板（但不冒泡）
    overlay.addEventListener('mousedown', e => {
        e.stopPropagation();
        if (e.target === overlay) closePanel();
    });
    overlay.addEventListener('click', e => e.stopPropagation());

    // 关闭按钮
    document.getElementById('bcd-close').addEventListener('click', e => {
        e.stopPropagation();
        closePanel();
    });

    // 标签页切换
    ['characters','worldbooks','presets','regex'].forEach(tab => {
        document.getElementById(`bcd-tab-${tab}`)?.addEventListener('click', e => {
            e.stopPropagation();
            switchTab(tab);
        });
    });

    // 全选
    document.getElementById('bcd-select-all').addEventListener('change', function (e) {
        e.stopPropagation();
        handleSelectAll(this.checked);
    });

    // 搜索
    document.getElementById('bcd-search').addEventListener('input', function (e) {
        e.stopPropagation();
        if (currentTab === 'characters')       renderCharacters();
        else if (currentTab === 'worldbooks')  renderWorldbooks();
        else if (currentTab === 'presets')     renderPresets();
        else if (currentTab === 'regex')       renderRegex();
    });

    // 删除按钮
    document.getElementById('bcd-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        handleDelete();
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const conf = document.getElementById('bcd-confirm');
        if (conf?.style.display !== 'none') conf.style.display = 'none';
        else closePanel();
    });
}

// ─── Open / close ─────────────────────────────────────────────────────────────

function openPanel() {
    buildPanel();
    selChars.clear(); selWBs.clear(); selPresets.clear(); selRegex.clear();
    tagFilter = ''; favFilter = 'all';
    currentTab = 'characters';

    document.getElementById('bcd-overlay').style.display = 'flex';
    ['characters','worldbooks','presets','regex'].forEach(t => {
        document.getElementById(`bcd-tab-${t}`)?.classList.toggle('bcd-tab--active', t === 'characters');
    });
    renderTagBar();
    renderCharacters();
}

function closePanel() {
    const overlay = document.getElementById('bcd-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── Menu button injection ────────────────────────────────────────────────────

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
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click',     e => { e.stopPropagation(); openPanel(); });
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
    console.log('[Bulk Deleter] v1.3 loaded.');
});
