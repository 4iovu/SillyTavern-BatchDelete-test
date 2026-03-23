/**
 * Bulk Delete Extension for SillyTavern
 * 批量删除角色卡 & 世界书插件
 * Author: bulk-delete-extension
 * Version: 1.0.0
 */

import { getRequestHeaders, characters, callPopup } from '../../../../script.js';
import { world_names, deleteWorldInfo } from '../../../world-info.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { showLoader, hideLoader } from '../../../../loader.js';

const extensionName = 'bulk-delete-extension';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ─── 插入扩展菜单入口 ─────────────────────────────────────────────────────────
function injectMenuButton() {
    // extensionsMenu 由 ST 动态生成，需要等它存在
    const tryInject = () => {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return false;

        // 避免重复注入
        if (document.getElementById('bulk_delete_menu_item')) return true;

        const li = document.createElement('li');
        li.id = 'bulk_delete_menu_item';
        li.style.cssText = 'border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px;';

        const btn = document.createElement('a');
        btn.id = 'bulk_delete_open_btn';
        btn.href = '#';
        btn.innerHTML = '<i class="fa-solid fa-trash fa-fw"></i><span> 批量删除角色卡</span>';
        btn.title = '批量删除角色卡 / 世界书';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭扩展菜单
            menu.classList.remove('open');
            menu.style.display = 'none';
            openPanel();
        });

        li.appendChild(btn);
        menu.appendChild(li);
        return true;
    };

    // 立即尝试，失败则用 MutationObserver 等待
    if (!tryInject()) {
        const observer = new MutationObserver(() => {
            if (tryInject()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// ─── 面板 HTML 模板 ────────────────────────────────────────────────────────────
function createPanelHTML() {
    return `
<div id="bulk_delete_overlay" class="bulk-delete-overlay">
  <div id="bulk_delete_panel" class="bulk-delete-panel">
    <!-- 标题栏 -->
    <div class="bd-header">
      <span class="bd-title"><i class="fa-solid fa-trash-can"></i> 批量删除</span>
      <button class="bd-close-btn" id="bd_close_btn" title="关闭">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- Tab 切换 -->
    <div class="bd-tabs">
      <button class="bd-tab active" id="bd_tab_chars" data-tab="chars">
        <i class="fa-solid fa-user-group"></i> 角色卡
        <span class="bd-tab-count" id="bd_chars_count">0</span>
      </button>
      <button class="bd-tab" id="bd_tab_worlds" data-tab="worlds">
        <i class="fa-solid fa-book-atlas"></i> 世界书
        <span class="bd-tab-count" id="bd_worlds_count">0</span>
      </button>
    </div>

    <!-- 工具栏 -->
    <div class="bd-toolbar">
      <label class="bd-select-all-label">
        <input type="checkbox" id="bd_select_all" class="bd-checkbox-input">
        <span class="bd-checkbox-box"></span>
        <span>全选</span>
      </label>
      <span class="bd-selected-info" id="bd_selected_info">已选 0 项</span>
      <div class="bd-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="bd_search" class="bd-search" placeholder="搜索…">
      </div>
    </div>

    <!-- 列表区域 -->
    <div class="bd-list-wrap">
      <!-- 角色卡列表 -->
      <div id="bd_chars_list" class="bd-list active">
        <div class="bd-empty-hint" id="bd_chars_empty">
          <i class="fa-solid fa-circle-info"></i> 没有找到角色卡
        </div>
      </div>
      <!-- 世界书列表 -->
      <div id="bd_worlds_list" class="bd-list">
        <div class="bd-empty-hint" id="bd_worlds_empty">
          <i class="fa-solid fa-circle-info"></i> 没有找到世界书
        </div>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="bd-footer">
      <button class="bd-btn bd-btn-danger" id="bd_delete_btn" disabled>
        <i class="fa-solid fa-trash"></i> 删除所选
      </button>
      <button class="bd-btn bd-btn-secondary" id="bd_cancel_btn">取消</button>
    </div>
  </div>
</div>

<!-- 确认弹窗（角色卡专用，询问是否同时删除世界书）-->
<div id="bd_confirm_modal" class="bd-confirm-overlay" style="display:none;">
  <div class="bd-confirm-box">
    <div class="bd-confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
    <div class="bd-confirm-title">确认删除</div>
    <div class="bd-confirm-body" id="bd_confirm_body">
      即将删除 <strong id="bd_confirm_count">0</strong> 个角色卡，此操作不可撤销。
    </div>
    <div class="bd-confirm-worldbook" id="bd_confirm_worldbook_section">
      <div class="bd-confirm-worldbook-label">
        <i class="fa-solid fa-book-atlas"></i> 同时删除关联的世界书？
      </div>
      <div class="bd-confirm-toggle-group">
        <label class="bd-confirm-radio">
          <input type="radio" name="bd_delete_wb" value="no" checked>
          <span class="bd-radio-box"></span>
          <span>不删除世界书</span>
        </label>
        <label class="bd-confirm-radio">
          <input type="radio" name="bd_delete_wb" value="yes">
          <span class="bd-radio-box"></span>
          <span>删除关联的世界书</span>
        </label>
      </div>
    </div>
    <div class="bd-confirm-actions">
      <button class="bd-btn bd-btn-danger" id="bd_confirm_ok">
        <i class="fa-solid fa-check"></i> 确认删除
      </button>
      <button class="bd-btn bd-btn-secondary" id="bd_confirm_cancel">取消</button>
    </div>
  </div>
</div>
    `;
}

// ─── 状态 ─────────────────────────────────────────────────────────────────────
let currentTab = 'chars';
let selectedChars = new Set();
let selectedWorlds = new Set();
let charData = [];
let worldData = [];
let searchQuery = '';

// ─── 打开面板 ─────────────────────────────────────────────────────────────────
function openPanel() {
    // 如果面板已存在，直接显示
    let overlay = document.getElementById('bulk_delete_overlay');
    if (!overlay) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = createPanelHTML();
        document.body.appendChild(wrapper.children[0]); // overlay
        document.body.appendChild(wrapper.children[0]); // confirm modal
        bindPanelEvents();
    }
    overlay = document.getElementById('bulk_delete_overlay');
    overlay.style.display = 'flex';
    resetState();
    loadData();
}

// ─── 关闭面板 ─────────────────────────────────────────────────────────────────
function closePanel() {
    const overlay = document.getElementById('bulk_delete_overlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── 重置状态 ─────────────────────────────────────────────────────────────────
function resetState() {
    selectedChars.clear();
    selectedWorlds.clear();
    searchQuery = '';
    currentTab = 'chars';

    const searchInput = document.getElementById('bd_search');
    if (searchInput) searchInput.value = '';

    switchTab('chars');
    updateFooter();
}

// ─── 加载数据 ─────────────────────────────────────────────────────────────────
async function loadData() {
    showPanelLoader(true);
    try {
        // 加载角色卡
        charData = await fetchCharacters();
        // 加载世界书
        worldData = await fetchWorldBooks();

        updateCounts();
        renderCurrentTab();
    } catch (err) {
        console.error('[BulkDelete] loadData error:', err);
    } finally {
        showPanelLoader(false);
    }
}

function showPanelLoader(show) {
    const list = document.getElementById(currentTab === 'chars' ? 'bd_chars_list' : 'bd_worlds_list');
    if (!list) return;
    let spinner = list.querySelector('.bd-spinner');
    if (show) {
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.className = 'bd-spinner';
            spinner.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 加载中…';
            list.prepend(spinner);
        }
    } else {
        if (spinner) spinner.remove();
    }
}

// ─── 获取角色卡列表 ───────────────────────────────────────────────────────────
async function fetchCharacters() {
    try {
        const response = await fetch('/api/characters/all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error('Failed to fetch characters');
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        // Fallback: use global characters array from ST
        if (window.characters && Array.isArray(window.characters)) {
            return window.characters.map(c => ({
                avatar: c.avatar,
                name: c.name,
                data: c.data,
                chat: c.chat,
            }));
        }
        return [];
    }
}

// ─── 获取世界书列表 ───────────────────────────────────────────────────────────
async function fetchWorldBooks() {
    try {
        const response = await fetch('/api/worldinfo/all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error('Failed to fetch worldbooks');
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        // Fallback: use world_names from ST
        if (typeof window.world_names !== 'undefined' && Array.isArray(window.world_names)) {
            return window.world_names.map(name => ({ name }));
        }
        // Try alternative global
        try {
            const ctx = getContext();
            if (ctx && ctx.world_names) return ctx.world_names.map(n => ({ name: n }));
        } catch (_) {}
        return [];
    }
}

// ─── 更新标签数量 ─────────────────────────────────────────────────────────────
function updateCounts() {
    const charCount = document.getElementById('bd_chars_count');
    const worldCount = document.getElementById('bd_worlds_count');
    if (charCount) charCount.textContent = charData.length;
    if (worldCount) worldCount.textContent = worldData.length;
}

// ─── 切换标签页 ───────────────────────────────────────────────────────────────
function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.bd-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`bd_tab_${tab}`);
    if (activeTab) activeTab.classList.add('active');

    document.querySelectorAll('.bd-list').forEach(l => l.classList.remove('active'));
    const activeList = document.getElementById(`bd_${tab}_list`);
    if (activeList) activeList.classList.add('active');

    updateSelectAllState();
    updateFooter();
    renderCurrentTab();
}

// ─── 渲染当前标签页 ────────────────────────────────────────────────────────────
function renderCurrentTab() {
    if (currentTab === 'chars') renderCharList();
    else renderWorldList();
}

// ─── 渲染角色卡列表 ────────────────────────────────────────────────────────────
function renderCharList() {
    const list = document.getElementById('bd_chars_list');
    const empty = document.getElementById('bd_chars_empty');
    if (!list) return;

    // 清空旧内容（保留 empty hint）
    Array.from(list.children).forEach(child => {
        if (!child.classList.contains('bd-empty-hint') && !child.classList.contains('bd-spinner')) {
            child.remove();
        }
    });

    const q = searchQuery.toLowerCase();
    const filtered = charData.filter(c => {
        const name = (c.name || c.avatar || '').toLowerCase();
        return !q || name.includes(q);
    });

    if (empty) empty.style.display = filtered.length === 0 ? 'flex' : 'none';

    filtered.forEach(char => {
        const key = char.avatar || char.name;
        const item = createCharItem(char, key);
        list.appendChild(item);
    });
}

function createCharItem(char, key) {
    const item = document.createElement('div');
    item.className = 'bd-item' + (selectedChars.has(key) ? ' selected' : '');
    item.dataset.key = key;

    const avatarSrc = char.avatar
        ? `/characters/${encodeURIComponent(char.avatar)}`
        : 'img/ai4.png';

    // 检测关联世界书
    const linkedWorld = char.data?.extensions?.world || char.character_book?.name || '';

    item.innerHTML = `
        <label class="bd-item-label">
          <input type="checkbox" class="bd-checkbox-input bd-item-check" data-key="${escHtml(key)}" ${selectedChars.has(key) ? 'checked' : ''}>
          <span class="bd-checkbox-box"></span>
          <div class="bd-avatar">
            <img src="${escHtml(avatarSrc)}" alt="" onerror="this.src='img/ai4.png'">
          </div>
          <div class="bd-item-info">
            <div class="bd-item-name">${escHtml(char.name || key)}</div>
            ${linkedWorld ? `<div class="bd-item-sub"><i class="fa-solid fa-book-atlas"></i> ${escHtml(linkedWorld)}</div>` : ''}
          </div>
        </label>
    `;

    item.querySelector('.bd-item-check').addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedChars.add(key);
            item.classList.add('selected');
        } else {
            selectedChars.delete(key);
            item.classList.remove('selected');
        }
        updateSelectAllState();
        updateFooter();
    });

    return item;
}

// ─── 渲染世界书列表 ────────────────────────────────────────────────────────────
function renderWorldList() {
    const list = document.getElementById('bd_worlds_list');
    const empty = document.getElementById('bd_worlds_empty');
    if (!list) return;

    Array.from(list.children).forEach(child => {
        if (!child.classList.contains('bd-empty-hint') && !child.classList.contains('bd-spinner')) {
            child.remove();
        }
    });

    const q = searchQuery.toLowerCase();
    const filtered = worldData.filter(w => {
        const name = (w.name || '').toLowerCase();
        return !q || name.includes(q);
    });

    if (empty) empty.style.display = filtered.length === 0 ? 'flex' : 'none';

    filtered.forEach(world => {
        const key = world.name;
        const item = createWorldItem(world, key);
        list.appendChild(item);
    });
}

function createWorldItem(world, key) {
    const item = document.createElement('div');
    item.className = 'bd-item' + (selectedWorlds.has(key) ? ' selected' : '');
    item.dataset.key = key;

    item.innerHTML = `
        <label class="bd-item-label">
          <input type="checkbox" class="bd-checkbox-input bd-item-check" data-key="${escHtml(key)}" ${selectedWorlds.has(key) ? 'checked' : ''}>
          <span class="bd-checkbox-box"></span>
          <div class="bd-avatar bd-avatar-icon">
            <i class="fa-solid fa-book-atlas"></i>
          </div>
          <div class="bd-item-info">
            <div class="bd-item-name">${escHtml(world.name || key)}</div>
          </div>
        </label>
    `;

    item.querySelector('.bd-item-check').addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedWorlds.add(key);
            item.classList.add('selected');
        } else {
            selectedWorlds.delete(key);
            item.classList.remove('selected');
        }
        updateSelectAllState();
        updateFooter();
    });

    return item;
}

// ─── 全选逻辑 ─────────────────────────────────────────────────────────────────
function handleSelectAll(checked) {
    const q = searchQuery.toLowerCase();

    if (currentTab === 'chars') {
        const filtered = charData.filter(c => {
            const name = (c.name || c.avatar || '').toLowerCase();
            return !q || name.includes(q);
        });
        filtered.forEach(c => {
            const key = c.avatar || c.name;
            if (checked) selectedChars.add(key);
            else selectedChars.delete(key);
        });
    } else {
        const filtered = worldData.filter(w => {
            const name = (w.name || '').toLowerCase();
            return !q || name.includes(q);
        });
        filtered.forEach(w => {
            if (checked) selectedWorlds.add(w.name);
            else selectedWorlds.delete(w.name);
        });
    }

    renderCurrentTab();
    updateFooter();
}

function updateSelectAllState() {
    const selectAll = document.getElementById('bd_select_all');
    if (!selectAll) return;

    const q = searchQuery.toLowerCase();
    let total = 0, selected = 0;

    if (currentTab === 'chars') {
        const filtered = charData.filter(c => {
            const name = (c.name || c.avatar || '').toLowerCase();
            return !q || name.includes(q);
        });
        total = filtered.length;
        selected = filtered.filter(c => selectedChars.has(c.avatar || c.name)).length;
    } else {
        const filtered = worldData.filter(w => {
            const name = (w.name || '').toLowerCase();
            return !q || name.includes(q);
        });
        total = filtered.length;
        selected = filtered.filter(w => selectedWorlds.has(w.name)).length;
    }

    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
}

function updateFooter() {
    const info = document.getElementById('bd_selected_info');
    const btn = document.getElementById('bd_delete_btn');
    const total = selectedChars.size + selectedWorlds.size;
    const cur = currentTab === 'chars' ? selectedChars.size : selectedWorlds.size;

    if (info) info.textContent = `已选 ${cur} 项`;
    if (btn) btn.disabled = cur === 0;
}

// ─── 绑定面板事件 ─────────────────────────────────────────────────────────────
function bindPanelEvents() {
    // 关闭按钮
    document.getElementById('bd_close_btn')?.addEventListener('click', closePanel);
    document.getElementById('bd_cancel_btn')?.addEventListener('click', closePanel);

    // 点击遮罩关闭
    document.getElementById('bulk_delete_overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'bulk_delete_overlay') closePanel();
    });

    // Tab 切换
    document.querySelectorAll('.bd-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // 全选
    document.getElementById('bd_select_all')?.addEventListener('change', (e) => {
        handleSelectAll(e.target.checked);
    });

    // 搜索
    document.getElementById('bd_search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        updateSelectAllState();
        renderCurrentTab();
    });

    // 删除按钮
    document.getElementById('bd_delete_btn')?.addEventListener('click', showConfirm);

    // 确认弹窗
    document.getElementById('bd_confirm_ok')?.addEventListener('click', executeDelete);
    document.getElementById('bd_confirm_cancel')?.addEventListener('click', hideConfirm);
    document.getElementById('bd_confirm_modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'bd_confirm_modal') hideConfirm();
    });
}

// ─── 确认弹窗 ─────────────────────────────────────────────────────────────────
function showConfirm() {
    const modal = document.getElementById('bd_confirm_modal');
    if (!modal) return;

    const cur = currentTab === 'chars' ? selectedChars.size : selectedWorlds.size;
    const countEl = document.getElementById('bd_confirm_count');
    const bodyEl = document.getElementById('bd_confirm_body');
    const wbSection = document.getElementById('bd_confirm_worldbook_section');

    if (countEl) countEl.textContent = cur;

    if (currentTab === 'chars') {
        if (bodyEl) bodyEl.innerHTML = `即将删除 <strong>${cur}</strong> 个角色卡，此操作<strong>不可撤销</strong>。`;
        // 检查选中角色中是否有关联世界书的
        const hasLinkedWorld = [...selectedChars].some(key => {
            const char = charData.find(c => (c.avatar || c.name) === key);
            return char && (char.data?.extensions?.world || char.character_book?.name);
        });
        if (wbSection) wbSection.style.display = hasLinkedWorld ? 'block' : 'none';
    } else {
        if (bodyEl) bodyEl.innerHTML = `即将删除 <strong>${cur}</strong> 个世界书，此操作<strong>不可撤销</strong>。`;
        if (wbSection) wbSection.style.display = 'none';
    }

    // 重置单选
    const radios = modal.querySelectorAll('input[name="bd_delete_wb"]');
    radios.forEach(r => { if (r.value === 'no') r.checked = true; });

    modal.style.display = 'flex';
}

function hideConfirm() {
    const modal = document.getElementById('bd_confirm_modal');
    if (modal) modal.style.display = 'none';
}

// ─── 执行删除 ─────────────────────────────────────────────────────────────────
async function executeDelete() {
    hideConfirm();

    const deleteLinkedWorlds = document.querySelector('input[name="bd_delete_wb"]:checked')?.value === 'yes';

    const deleteBtn = document.getElementById('bd_delete_btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 删除中…';
    }

    let successCount = 0;
    let failCount = 0;

    try {
        if (currentTab === 'chars') {
            const toDelete = [...selectedChars];

            for (const key of toDelete) {
                const char = charData.find(c => (c.avatar || c.name) === key);
                if (!char) continue;

                // 收集关联世界书
                const linkedWorld = char.data?.extensions?.world || char.character_book?.name;

                try {
                    await deleteCharacter(char.avatar || char.name);
                    successCount++;

                    // 同时删除关联世界书
                    if (deleteLinkedWorlds && linkedWorld) {
                        try {
                            await deleteWorldInfoByName(linkedWorld);
                        } catch (_) {
                            console.warn(`[BulkDelete] Failed to delete world: ${linkedWorld}`);
                        }
                    }
                } catch (e) {
                    failCount++;
                    console.error(`[BulkDelete] Failed to delete char: ${key}`, e);
                }
            }

            selectedChars.clear();
        } else {
            const toDelete = [...selectedWorlds];

            for (const name of toDelete) {
                try {
                    await deleteWorldInfoByName(name);
                    successCount++;
                } catch (e) {
                    failCount++;
                    console.error(`[BulkDelete] Failed to delete world: ${name}`, e);
                }
            }

            selectedWorlds.clear();
        }
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> 删除所选';
        }
    }

    // 反馈
    const label = currentTab === 'chars' ? '角色卡' : '世界书';
    if (failCount === 0) {
        toastr.success(`成功删除 ${successCount} 个${label}`);
    } else {
        toastr.warning(`删除完成：成功 ${successCount}，失败 ${failCount}`);
    }

    // 刷新数据并重新渲染
    await loadData();
    updateFooter();

    // 通知 ST 刷新角色列表
    if (currentTab === 'chars') {
        try {
            // 触发 ST 内部的角色列表刷新
            const event = new CustomEvent('character-deleted');
            document.dispatchEvent(event);
            // 也尝试调用 ST 的刷新函数
            if (typeof window.getCharacters === 'function') {
                await window.getCharacters();
            }
            if (typeof window.printCharacters === 'function') {
                window.printCharacters(true);
            }
        } catch (_) {}
    }
}

// ─── 删除单个角色卡 (API) ─────────────────────────────────────────────────────
async function deleteCharacter(avatar) {
    const response = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: false }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Delete failed: ${err}`);
    }
    return response.json();
}

// ─── 删除世界书 (API) ─────────────────────────────────────────────────────────
async function deleteWorldInfoByName(name) {
    // 尝试使用 ST 内置的 deleteWorldInfo
    if (typeof deleteWorldInfo === 'function') {
        await deleteWorldInfo(name);
        return;
    }
    // Fallback: 直接调用 API
    const response = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Delete world failed: ${err}`);
    }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── 初始化 ───────────────────────────────────────────────────────────────────
jQuery(async () => {
    // 注入扩展菜单按钮
    injectMenuButton();
    // 注入面板 HTML（预先创建以加速首次打开）
    const wrapper = document.createElement('div');
    wrapper.innerHTML = createPanelHTML();
    Array.from(wrapper.children).forEach(el => document.body.appendChild(el));
    bindPanelEvents();

    // 确保面板默认隐藏
    const overlay = document.getElementById('bulk_delete_overlay');
    if (overlay) overlay.style.display = 'none';
    const confirmModal = document.getElementById('bd_confirm_modal');
    if (confirmModal) confirmModal.style.display = 'none';

    console.log('[BulkDelete] Extension loaded ✓');
});
