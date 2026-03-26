/**
 * 批量管理 (Bulk Manager)
 * SillyTavern Extension — v2.0.0
 *
 * ─ 修复 ──────────────────────────────────────────────────────────────
 *  · 与 RegexLoreHub 插件冲突：在 overlay/panel/confirmBox 上全面拦截
 *    mousedown，阻止冒泡到 body 的 rlh-outside-click 监听器
 *  · 世界书列表图标改为纯文字图标，去掉丑陋的圆圈背景
 *  · 面板标题改为「批量管理」
 *
 * ─ 新增 ──────────────────────────────────────────────────────────────
 *  · 角色卡：收藏/未收藏分组、标签筛选、详情展开（描述+所有开场白）
 *  · 世界书：删除 + 展开查看条目内容
 *  · 预设：批量删除
 *  · 正则：批量删除 + 查看 find/replace 内容
 *  · 通过标签快速筛选并删除
 */

import { getRequestHeaders, characters } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { world_names, deleteWorldInfo, loadWorldInfoData } from '../../../../scripts/world-info.js';

// ═══════════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════════
let currentTab = 'characters';
let selChars   = new Set();
let selWBs     = new Set();
let selPresets = new Set();
let selRegex   = new Set();
let tagFilter  = '';
let favFilter  = 'all';   // 'all' | 'fav' | 'unfav'

// cache for async data
let _presetCache = null;
let _regexCache  = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════════════════

function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function stopBubble(e) { e.stopPropagation(); }

// ═══════════════════════════════════════════════════════════════════════════════
// Data helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getChars()   { const c = getContext(); return c.characters ?? characters ?? []; }
function getWBNames() { const c = getContext(); return c.world_names ?? world_names ?? []; }

function charWorlds(char) {
    const s = new Set();
    if (char?.data?.extensions?.world) s.add(char.data.extensions.world);
    if (char?.world)                   s.add(char.world);
    return [...s].filter(Boolean);
}

function charTags(char) {
    const t = char?.tags ?? char?.data?.tags ?? [];
    return Array.isArray(t) ? t : [];
}

function isFav(char) {
    return !!(char?.fav || char?.data?.extensions?.fav);
}

function getAllTags() {
    const s = new Set();
    getChars().forEach(c => charTags(c).forEach(t => t && s.add(t)));
    return [...s].sort();
}

// ─── Presets ─────────────────────────────────────────────────────────────────
async function loadPresets() {
    if (_presetCache) return _presetCache;
    // ST presets endpoint
    try {
        const r = await fetch('/api/presets/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            _presetCache = Array.isArray(d) ? d : Object.keys(d);
            return _presetCache;
        }
    } catch (e) { /* */ }
    // fallback: read from settings
    try {
        const r = await fetch('/api/settings/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            // collect all preset arrays from settings
            const names = new Set();
            for (const key of Object.keys(d)) {
                if (Array.isArray(d[key]) && typeof d[key][0] === 'string' && key.includes('preset')) {
                    d[key].forEach(n => names.add(n));
                }
            }
            _presetCache = [...names];
            return _presetCache;
        }
    } catch (e) { /* */ }
    return [];
}

// ─── Regex ────────────────────────────────────────────────────────────────────
async function loadRegex() {
    if (_regexCache) return _regexCache;
    const TH = window.TavernHelper;
    if (TH?.getTavernRegexes) {
        try {
            _regexCache = await TH.getTavernRegexes({ scope: 'global' }) ?? [];
            return _regexCache;
        } catch (e) { /* */ }
    }
    try {
        const r = await fetch('/api/settings/get', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
        });
        if (r.ok) {
            const d = await r.json();
            _regexCache = d.regex_scripts ?? [];
            return _regexCache;
        }
    } catch (e) { /* */ }
    return [];
}

// ─── World info entries ───────────────────────────────────────────────────────
async function loadWBEntries(name) {
    try {
        // Use ST built-in loader
        if (typeof loadWorldInfoData === 'function') {
            const data = await loadWorldInfoData(name);
            return data?.entries ? Object.values(data.entries) : [];
        }
        // fallback HTTP
        const r = await fetch('/api/worldinfo/get', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });
        if (r.ok) {
            const d = await r.json();
            return d?.entries ? Object.values(d.entries) : [];
        }
    } catch (e) { /* */ }
    return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Delete APIs
// ═══════════════════════════════════════════════════════════════════════════════

async function apiDeleteChar(avatar) {
    const r = await fetch('/api/characters/delete', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
    });
    if (!r.ok) throw new Error(`角色删除失败: ${avatar}`);
}

async function apiDeleteWB(name) {
    if (typeof deleteWorldInfo === 'function') {
        try { await deleteWorldInfo(name); _presetCache = null; return; } catch (e) { /* */ }
    }
    const r = await fetch('/api/worldinfo/delete', {
        method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`世界书删除失败: ${name}`);
}

async function apiDeletePreset(name) {
    _presetCache = null;
    // Try multiple known endpoints
    for (const [url, body] of [
        ['/api/presets/delete',  { name }],
        ['/api/settings/delete', { name, type: 'preset' }],
    ]) {
        try {
            const r = await fetch(url, {
                method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body),
            });
            if (r.ok) return;
        } catch (e) { /* */ }
    }
    throw new Error(`预设删除失败: ${name}`);
}

async function apiDeleteRegex(scriptName) {
    _regexCache = null;
    const TH = window.TavernHelper;
    if (TH?.getTavernRegexes && TH?.replaceTavernRegexes) {
        try {
            const all = await TH.getTavernRegexes({ scope: 'global' });
            await TH.replaceTavernRegexes(all.filter(r => r.script_name !== scriptName), { scope: 'global' });
            return;
        } catch (e) { /* fallback */ }
    }
    const r = await fetch('/api/settings/get', {
        method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({}),
    });
    if (!r.ok) throw new Error('无法读取设置');
    const settings = await r.json();
    const filtered = (settings.regex_scripts ?? []).filter(rx => rx.script_name !== scriptName);
    const r2 = await fetch('/api/settings/save', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ ...settings, regex_scripts: filtered }),
    });
    if (!r2.ok) throw new Error(`正则删除失败: ${scriptName}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Progress
// ═══════════════════════════════════════════════════════════════════════════════

function showProgress(on) {
    const el = document.getElementById('bcd-progress');
    if (el) el.style.display = on ? '' : 'none';
}
function setProgress(done, total) {
    const bar = document.getElementById('bcd-prog-bar');
    const txt = document.getElementById('bcd-prog-txt');
    if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    if (txt) txt.textContent = `${done} / ${total}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toolbar
// ═══════════════════════════════════════════════════════════════════════════════

function refreshToolbar() {
    const cb  = document.getElementById('bcd-select-all');
    const btn = document.getElementById('bcd-delete-btn');
    const cnt = document.getElementById('bcd-count');
    if (!cb || !btn) return;

    let sel = 0, total = 0;
    if (currentTab === 'characters') {
        let chars = applyCharFilters(getChars());
        total = chars.length; sel = selChars.size;
    } else if (currentTab === 'worldbooks') {
        total = getWBNames().length; sel = selWBs.size;
    } else {
        total = document.querySelectorAll('#bcd-item-list .bcd-row').length;
        sel   = currentTab === 'presets' ? selPresets.size : selRegex.size;
    }

    cb.indeterminate = sel > 0 && sel < total;
    cb.checked       = total > 0 && sel === total;
    cnt.textContent  = sel > 0 ? `（${sel}）` : '';
    btn.disabled     = sel === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render — Characters
// ═══════════════════════════════════════════════════════════════════════════════

function applyCharFilters(chars) {
    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    if (tagFilter)          chars = chars.filter(c => charTags(c).includes(tagFilter));
    if (favFilter === 'fav')   chars = chars.filter(c =>  isFav(c));
    if (favFilter === 'unfav') chars = chars.filter(c => !isFav(c));
    if (q) chars = chars.filter(c => (c.name || '').toLowerCase().includes(q));
    return chars;
}

function renderCharacters() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    const chars = applyCharFilters(getChars());

    if (!chars.length) {
        container.innerHTML = '<div class="bcd-empty">暂无匹配角色卡</div>';
        refreshToolbar();
        return;
    }

    // Split fav / unfav when showing "all"
    const favs   = chars.filter(c =>  isFav(c));
    const unfavs = chars.filter(c => !isFav(c));
    const groups = (favFilter === 'all' && favs.length && unfavs.length)
        ? [{ label: '⭐ 收藏', items: favs }, { label: '其他角色', items: unfavs }]
        : [{ label: null, items: chars }];

    groups.forEach(({ label, items }) => {
        if (!items.length) return;
        if (label) {
            const h = document.createElement('div');
            h.className = 'bcd-group-header';
            h.textContent = label;
            container.appendChild(h);
        }
        items.forEach(char => appendCharRow(container, char, chars.length));
    });

    refreshToolbar();
}

function appendCharRow(container, char, totalCount) {
    const avatar  = char.avatar;
    const name    = char.name || avatar;
    const checked = selChars.has(avatar);
    const worlds  = charWorlds(char);
    const tags    = charTags(char);
    const fav     = isFav(char);
    const src     = avatar ? `/characters/${avatar}` : 'img/ai4.png';

    const wBadge   = worlds.length
        ? `<span class="bcd-badge bcd-badge--wb"><i class="fa-solid fa-book fa-xs"></i> ${worlds.length > 1 ? worlds.length + ' 个世界书' : esc(worlds[0])}</span>`
        : '';
    const tagBadges = tags.slice(0, 3).map(t => `<span class="bcd-badge bcd-badge--tag">${esc(t)}</span>`).join('');
    const favIcon   = fav ? ' <i class="fa-solid fa-star bcd-fav-star"></i>' : '';

    const row = document.createElement('div');
    row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
    row.innerHTML = `
        <div class="bcd-row-main">
            <label class="bcd-row-label">
                <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                <img class="bcd-avatar" src="${src}" onerror="this.src='img/ai4.png'" alt="">
                <span class="bcd-info">
                    <span class="bcd-name">${favIcon}${esc(name)}</span>
                    <span class="bcd-badges">${wBadge}${tagBadges}</span>
                </span>
            </label>
            <button class="bcd-expand-btn" title="查看详情" type="button">
                <i class="fa-solid fa-chevron-down"></i>
            </button>
        </div>
        <div class="bcd-detail" style="display:none"></div>`;

    row.querySelector('.bcd-cb').addEventListener('change', function (e) {
        e.stopPropagation();
        if (this.checked) selChars.add(avatar); else selChars.delete(avatar);
        row.classList.toggle('bcd-row--checked', this.checked);
        refreshToolbar();
    });

    row.querySelector('.bcd-expand-btn').addEventListener('click', e => {
        e.stopPropagation();
        toggleCharDetail(char, row);
    });

    container.appendChild(row);
}

function toggleCharDetail(char, row) {
    const det = row.querySelector('.bcd-detail');
    if (!det) return;

    const btn  = row.querySelector('.bcd-expand-btn i');
    const open = det.style.display !== 'none';
    if (open) {
        det.style.display = 'none';
        btn?.classList.replace('fa-chevron-up', 'fa-chevron-down');
        return;
    }

    // Build detail content
    const desc      = char.description        || char.data?.description        || '';
    const greeting  = char.first_mes          || char.data?.first_mes          || '';
    const altGreets = char.alternate_greetings || char.data?.alternate_greetings || [];
    const personality = char.personality      || char.data?.personality        || '';
    const scenario    = char.scenario         || char.data?.scenario           || '';

    let html = '';

    if (desc) html += section('角色描述', desc);
    if (personality) html += section('性格', personality);
    if (scenario)    html += section('场景', scenario);
    if (greeting)    html += section('开场白', greeting);
    if (altGreets.length) {
        altGreets.forEach((g, i) => {
            if (g) html += section(`备用开场白 ${i + 1}`, g);
        });
    }
    if (!html) html = '<div class="bcd-detail-empty">暂无内容</div>';

    det.innerHTML = html;
    det.style.display = '';
    btn?.classList.replace('fa-chevron-down', 'fa-chevron-up');
}

function section(label, text) {
    return `<div class="bcd-det-section">
        <div class="bcd-det-label">${esc(label)}</div>
        <div class="bcd-det-text">${esc(text)}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render — Worldbooks
// ═══════════════════════════════════════════════════════════════════════════════

function renderWorldbooks() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    let names = getWBNames();
    if (q) names = names.filter(n => n.toLowerCase().includes(q));

    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无世界书</div>';
        refreshToolbar();
        return;
    }

    names.forEach(name => {
        const checked = selWBs.has(name);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <div class="bcd-row-main">
                <label class="bcd-row-label">
                    <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                    <i class="fa-solid fa-book bcd-type-icon"></i>
                    <span class="bcd-info"><span class="bcd-name">${esc(name)}</span></span>
                </label>
                <button class="bcd-expand-btn" title="查看条目" type="button">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div class="bcd-detail" style="display:none"></div>`;

        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selWBs.add(name); else selWBs.delete(name);
            row.classList.toggle('bcd-row--checked', this.checked);
            refreshToolbar();
        });

        row.querySelector('.bcd-expand-btn').addEventListener('click', async e => {
            e.stopPropagation();
            await toggleWBDetail(name, row);
        });

        container.appendChild(row);
    });

    refreshToolbar();
}

async function toggleWBDetail(name, row) {
    const det = row.querySelector('.bcd-detail');
    const btn = row.querySelector('.bcd-expand-btn i');
    if (!det) return;

    if (det.style.display !== 'none') {
        det.style.display = 'none';
        btn?.classList.replace('fa-chevron-up', 'fa-chevron-down');
        return;
    }

    det.innerHTML = '<div class="bcd-detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';
    det.style.display = '';
    btn?.classList.replace('fa-chevron-down', 'fa-chevron-up');

    const entries = await loadWBEntries(name);
    if (!entries.length) {
        det.innerHTML = '<div class="bcd-detail-empty">暂无条目</div>';
        return;
    }

    det.innerHTML = entries.map(e => {
        const entryName = e.comment || e.key?.join(', ') || '（未命名）';
        const content   = e.content || '';
        const keys      = Array.isArray(e.key) ? e.key.join(', ') : (e.key || '');
        return `<div class="bcd-det-section">
            <div class="bcd-det-label">${esc(entryName)}</div>
            ${keys ? `<div class="bcd-det-keys"><i class="fa-solid fa-key fa-xs"></i> ${esc(keys)}</div>` : ''}
            <div class="bcd-det-text">${esc(content)}</div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render — Presets
// ═══════════════════════════════════════════════════════════════════════════════

async function renderPresets() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '<div class="bcd-empty"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    const allPresets = await loadPresets();
    const names = q ? allPresets.filter(n => String(n).toLowerCase().includes(q)) : allPresets;

    container.innerHTML = '';
    if (!names.length) {
        container.innerHTML = '<div class="bcd-empty">暂无预设</div>';
        refreshToolbar(); return;
    }

    names.forEach(name => {
        const checked = selPresets.has(name);
        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <div class="bcd-row-main">
                <label class="bcd-row-label">
                    <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                    <i class="fa-solid fa-sliders bcd-type-icon bcd-type-icon--preset"></i>
                    <span class="bcd-info"><span class="bcd-name">${esc(name)}</span></span>
                </label>
            </div>`;
        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selPresets.add(name); else selPresets.delete(name);
            row.classList.toggle('bcd-row--checked', this.checked);
            refreshToolbar();
        });
        container.appendChild(row);
    });

    refreshToolbar();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render — Regex
// ═══════════════════════════════════════════════════════════════════════════════

async function renderRegex() {
    const container = document.getElementById('bcd-item-list');
    if (!container) return;
    container.innerHTML = '<div class="bcd-empty"><i class="fa-solid fa-spinner fa-spin"></i> 加载中…</div>';

    const q = (document.getElementById('bcd-search')?.value ?? '').toLowerCase();
    const allRx = await loadRegex();
    const items = q ? allRx.filter(r => (r.script_name || '').toLowerCase().includes(q)) : allRx;

    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<div class="bcd-empty">暂无全局正则</div>';
        refreshToolbar(); return;
    }

    items.forEach(rx => {
        const key     = rx.script_name || String(Math.random());
        const name    = rx.script_name || '未命名';
        const enabled = rx.enabled !== false;
        const checked = selRegex.has(key);

        const row = document.createElement('div');
        row.className = `bcd-row${checked ? ' bcd-row--checked' : ''}`;
        row.innerHTML = `
            <div class="bcd-row-main">
                <label class="bcd-row-label">
                    <input type="checkbox" class="bcd-cb" ${checked ? 'checked' : ''}>
                    <i class="fa-solid fa-code bcd-type-icon bcd-type-icon--regex"></i>
                    <span class="bcd-info">
                        <span class="bcd-name">${esc(name)}</span>
                        <span class="bcd-badge ${enabled ? 'bcd-badge--on' : 'bcd-badge--off'}">${enabled ? '启用' : '禁用'}</span>
                    </span>
                </label>
                <button class="bcd-expand-btn" title="查看内容" type="button">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div class="bcd-detail" style="display:none"></div>`;

        row.querySelector('.bcd-cb').addEventListener('change', function (e) {
            e.stopPropagation();
            if (this.checked) selRegex.add(key); else selRegex.delete(key);
            row.classList.toggle('bcd-row--checked', this.checked);
            refreshToolbar();
        });

        row.querySelector('.bcd-expand-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleRegexDetail(rx, row);
        });

        container.appendChild(row);
    });

    refreshToolbar();
}

function toggleRegexDetail(rx, row) {
    const det = row.querySelector('.bcd-detail');
    const btn = row.querySelector('.bcd-expand-btn i');
    if (!det) return;

    if (det.style.display !== 'none') {
        det.style.display = 'none';
        btn?.classList.replace('fa-chevron-up', 'fa-chevron-down');
        return;
    }

    const find    = rx.find_regex || rx.findRegex || '';
    const replace = rx.replace_string || rx.replaceString || '';
    const scope   = rx.placement?.join(', ') || '';

    let html = '';
    if (find)    html += section('匹配规则 (Find)', find);
    if (replace) html += section('替换内容 (Replace)', replace);
    if (scope)   html += section('作用范围', scope);
    if (!html)   html  = '<div class="bcd-detail-empty">暂无详细内容</div>';

    det.innerHTML = html;
    det.style.display = '';
    btn?.classList.replace('fa-chevron-down', 'fa-chevron-up');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tag filter bar (characters only)
// ═══════════════════════════════════════════════════════════════════════════════

function renderTagBar() {
    const bar = document.getElementById('bcd-tag-bar');
    if (!bar) return;

    if (currentTab !== 'characters') {
        bar.style.display = 'none';
        return;
    }

    const tags = getAllTags();
    bar.style.display = '';

    bar.innerHTML = `
        <button class="bcd-chip${!tagFilter && favFilter==='all' ? ' bcd-chip--active' : ''}" data-tag="" data-fav="">全部</button>
        <button class="bcd-chip bcd-chip--fav${favFilter==='fav' ? ' bcd-chip--active' : ''}" data-fav="fav" data-tag=""><i class="fa-solid fa-star fa-xs"></i> 收藏</button>
        <button class="bcd-chip${favFilter==='unfav' ? ' bcd-chip--active' : ''}" data-fav="unfav" data-tag="">未收藏</button>
        ${tags.map(t =>
            `<button class="bcd-chip${tagFilter===t?' bcd-chip--active':''}" data-tag="${esc(t)}" data-fav="">${esc(t)}</button>`
        ).join('')}`;

    bar.querySelectorAll('.bcd-chip').forEach(btn => {
        btn.addEventListener('mousedown', stopBubble);
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const newTag = btn.dataset.tag;
            const newFav = btn.dataset.fav;
            // Toggle off if already active
            if (newTag && tagFilter === newTag)       tagFilter = '';
            else if (newFav && favFilter === newFav)  favFilter = 'all';
            else { tagFilter = newTag; favFilter = newFav || 'all'; }
            if (!newTag && !newFav) { tagFilter = ''; favFilter = 'all'; }
            selChars.clear();
            renderTagBar();
            renderCharacters();
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab switch
// ═══════════════════════════════════════════════════════════════════════════════

async function switchTab(tab) {
    currentTab = tab;
    tagFilter = ''; favFilter = 'all';
    selChars.clear(); selWBs.clear(); selPresets.clear(); selRegex.clear();

    ['characters','worldbooks','presets','regex'].forEach(t =>
        document.getElementById(`bcd-tab-${t}`)?.classList.toggle('bcd-tab--active', t === tab)
    );

    const s = document.getElementById('bcd-search');
    if (s) s.value = '';

    renderTagBar();

    if (tab === 'characters')       renderCharacters();
    else if (tab === 'worldbooks')  renderWorldbooks();
    else if (tab === 'presets')     await renderPresets();
    else if (tab === 'regex')       await renderRegex();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Select all
// ═══════════════════════════════════════════════════════════════════════════════

function handleSelectAll(checked) {
    if (currentTab === 'characters') {
        const chars = applyCharFilters(getChars());
        selChars.clear();
        if (checked) chars.forEach(c => selChars.add(c.avatar));
        renderCharacters();
    } else if (currentTab === 'worldbooks') {
        selWBs.clear();
        if (checked) getWBNames().forEach(n => selWBs.add(n));
        renderWorldbooks();
    } else {
        // For async-loaded tabs, toggle all visible rows
        const sel = currentTab === 'presets' ? selPresets : selRegex;
        sel.clear();
        document.querySelectorAll('#bcd-item-list .bcd-row').forEach(row => {
            const cb   = row.querySelector('.bcd-cb');
            const name = row.querySelector('.bcd-name')?.textContent?.trim();
            if (!name || !cb) return;
            if (checked) { sel.add(name); cb.checked = true; row.classList.add('bcd-row--checked'); }
            else          { cb.checked = false; row.classList.remove('bcd-row--checked'); }
        });
        refreshToolbar();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Delete dispatch
// ═══════════════════════════════════════════════════════════════════════════════

async function handleDelete() {
    if      (currentTab === 'characters') await doDeleteChars();
    else if (currentTab === 'worldbooks') await doDeleteWBs();
    else if (currentTab === 'presets')    await doDeletePresets();
    else if (currentTab === 'regex')      await doDeleteRegex();
}

async function doDeleteChars() {
    if (!selChars.size) return;
    const chars = getChars();
    const assocWorlds = new Set();
    selChars.forEach(av => {
        const c = chars.find(x => x.avatar === av);
        if (c) charWorlds(c).forEach(w => assocWorlds.add(w));
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// Confirm modal
// ═══════════════════════════════════════════════════════════════════════════════

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
                `<label class="bcd-wbcheck"><input type="checkbox" value="${esc(w)}" checked><span>${esc(w)}</span></label>`
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

// ═══════════════════════════════════════════════════════════════════════════════
// Panel HTML
// ═══════════════════════════════════════════════════════════════════════════════

function buildPanel() {
    if (document.getElementById('bcd-panel')) return;

    document.body.insertAdjacentHTML('beforeend', `
<div id="bcd-overlay" class="bcd-overlay" style="display:none">
    <div id="bcd-panel" class="bcd-panel">

        <div class="bcd-header">
            <span class="bcd-title"><i class="fa-solid fa-layer-group"></i> 批量管理</span>
            <button id="bcd-close" class="bcd-icon-btn" title="关闭" type="button">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="bcd-tabs" role="tablist">
            <button id="bcd-tab-characters" class="bcd-tab bcd-tab--active" type="button">
                <i class="fa-solid fa-user"></i><span class="bcd-tab-lbl"> 角色卡</span>
            </button>
            <button id="bcd-tab-worldbooks" class="bcd-tab" type="button">
                <i class="fa-solid fa-book"></i><span class="bcd-tab-lbl"> 世界书</span>
            </button>
            <button id="bcd-tab-presets" class="bcd-tab" type="button">
                <i class="fa-solid fa-sliders"></i><span class="bcd-tab-lbl"> 预设</span>
            </button>
            <button id="bcd-tab-regex" class="bcd-tab" type="button">
                <i class="fa-solid fa-code"></i><span class="bcd-tab-lbl"> 正则</span>
            </button>
        </div>

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
    <div id="bcd-confirm-box" class="bcd-confirm-box">
        <div class="bcd-confirm-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
        <p id="bcd-confirm-msg" class="bcd-confirm-msg"></p>
        <div id="bcd-confirm-wb" style="display:none">
            <p class="bcd-confirm-wb-title">同时删除关联的世界书？</p>
            <div id="bcd-confirm-wb-list" class="bcd-confirm-wb-list"></div>
        </div>
        <div class="bcd-confirm-btns">
            <button id="bcd-confirm-no"  class="bcd-btn-sec"  type="button">取消</button>
            <button id="bcd-confirm-ok"  class="bcd-btn-del"  type="button">确认删除</button>
        </div>
    </div>
</div>`);

    bindEvents();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════════════════════

function bindEvents() {
    const overlay    = document.getElementById('bcd-overlay');
    const panel      = document.getElementById('bcd-panel');
    const confirmBox = document.getElementById('bcd-confirm-box');
    const confirmOvl = document.getElementById('bcd-confirm');

    // ── 冲突修复核心 ──────────────────────────────────────────────────────────
    // RegexLoreHub 在 body 上绑了 mousedown.rlh-outside-click
    // 只要 mousedown 冒泡到 body 且目标不在 rlh-panel 内，它就会触发 hidePanel()
    // 同时 ST 的扩展菜单也监听了 body click 来关闭面板
    // → 在我们的所有 DOM 层级上拦截 mousedown + click + touchstart，彻底阻断冒泡
    const blockEvents = ['mousedown', 'click', 'touchstart', 'touchend'];
    [panel, confirmBox, confirmOvl].forEach(el => {
        if (!el) return;
        blockEvents.forEach(ev =>
            el.addEventListener(ev, stopBubble, ev.startsWith('touch') ? { passive: true } : false)
        );
    });

    // overlay 背景点击关闭（但不冒泡）
    overlay.addEventListener('mousedown', e => { e.stopPropagation(); if (e.target === overlay) closePanel(); });
    overlay.addEventListener('click',      e => e.stopPropagation());

    document.getElementById('bcd-close').addEventListener('click', e => { e.stopPropagation(); closePanel(); });

    ['characters','worldbooks','presets','regex'].forEach(tab => {
        document.getElementById(`bcd-tab-${tab}`)?.addEventListener('click', e => {
            e.stopPropagation();
            switchTab(tab);
        });
    });

    document.getElementById('bcd-select-all').addEventListener('change', function(e) {
        e.stopPropagation();
        handleSelectAll(this.checked);
    });

    document.getElementById('bcd-search').addEventListener('input', function(e) {
        e.stopPropagation();
        if      (currentTab === 'characters') renderCharacters();
        else if (currentTab === 'worldbooks') renderWorldbooks();
        else if (currentTab === 'presets')    renderPresets();
        else if (currentTab === 'regex')      renderRegex();
    });

    document.getElementById('bcd-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        handleDelete();
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const conf = document.getElementById('bcd-confirm');
        if (conf?.style.display !== 'none') conf.style.display = 'none';
        else closePanel();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Open / Close
// ═══════════════════════════════════════════════════════════════════════════════

function openPanel() {
    buildPanel();
    selChars.clear(); selWBs.clear(); selPresets.clear(); selRegex.clear();
    tagFilter = ''; favFilter = 'all';
    _presetCache = null; _regexCache = null; // always refresh on open

    document.getElementById('bcd-overlay').style.display = 'flex';
    ['characters','worldbooks','presets','regex'].forEach(t =>
        document.getElementById(`bcd-tab-${t}`)?.classList.toggle('bcd-tab--active', t === 'characters')
    );
    currentTab = 'characters';
    renderTagBar();
    renderCharacters();
}

function closePanel() {
    const ov = document.getElementById('bcd-overlay');
    if (ov) ov.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Menu button injection
// ═══════════════════════════════════════════════════════════════════════════════

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
        btn.title     = '批量管理';
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i><span>批量管理</span>';
        // Stop propagation so rlh-outside-click doesn't intercept this click
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openPanel();
        });

    if (!tryInject()) {
        const t = setInterval(() => { if (tryInject()) clearInterval(t); }, 300);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════════════

jQuery(async () => {
    injectMenuButton();
    console.log('[批量管理] v2.0 loaded.');
});
