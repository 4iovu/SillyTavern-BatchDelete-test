/**
 * 批量删除角色卡扩展
 * 在角色列表 tag filter 栏最右侧注入批量选择/删除工具栏
 */

const MODULE_NAME = 'batch_delete';

// ── 状态 ────────────────────────────────────────────────────────
let selectMode = false;
let selectedAvatars = new Set();

// ── 等待目标元素出现 ─────────────────────────────────────────────
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const obs = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) {
                obs.disconnect();
                resolve(found);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            obs.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

// ── 注入工具栏 ──────────────────────────────────────────────────
async function injectToolbar() {
    // 防止重复注入
    if (document.getElementById('bd_toolbar')) return;

    // rm_characters_block 内的 rm_tag_controls
    let tagControls;
    try {
        tagControls = await waitForElement('#rm_characters_block .rm_tag_controls');
    } catch (e) {
        console.error('[BatchDelete] 找不到 rm_tag_controls，放弃注入', e);
        return;
    }

    const toolbar = document.createElement('div');
    toolbar.id = 'bd_toolbar';
    toolbar.innerHTML = `
        <button id="bd_toggle" class="menu_button bd_btn" title="批量选择角色卡">
            <i class="fa-solid fa-check-square"></i>
            <span>批量</span>
        </button>
        <button id="bd_all" class="menu_button bd_btn bd_hidden" title="全选 / 取消全选">
            <i class="fa-solid fa-check-double"></i>
        </button>
        <span id="bd_count" class="bd_count bd_hidden">0</span>
        <label id="bd_wb_label" class="bd_wb_label bd_hidden" title="同时删除角色绑定的世界书">
            <input type="checkbox" id="bd_wb_cb"> 含世界书
        </label>
        <button id="bd_delete" class="menu_button bd_btn bd_danger bd_hidden" title="删除已选角色卡">
            <i class="fa-solid fa-trash"></i>
            <span>删除</span>
        </button>
    `;

    tagControls.appendChild(toolbar);

    document.getElementById('bd_toggle').addEventListener('click', toggleSelectMode);
    document.getElementById('bd_all').addEventListener('click', toggleSelectAll);
    document.getElementById('bd_delete').addEventListener('click', deleteSelected);

    console.log('[BatchDelete] 工具栏注入成功 ✓');
}

// ── 切换选择模式 ─────────────────────────────────────────────────
function toggleSelectMode() {
    selectMode = !selectMode;

    const toggleBtn = document.getElementById('bd_toggle');
    const extraEls = document.querySelectorAll('.bd_hidden_ctrl');

    if (selectMode) {
        toggleBtn.classList.add('bd_active');
        toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i><span>退出</span>';
        showExtraControls(true);
        attachOverlays();
    } else {
        toggleBtn.classList.remove('bd_active');
        toggleBtn.innerHTML = '<i class="fa-solid fa-check-square"></i><span>批量</span>';
        showExtraControls(false);
        clearSelection();
        detachOverlays();
    }
}

function showExtraControls(show) {
    ['bd_all', 'bd_count', 'bd_wb_label', 'bd_delete'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (show) el.classList.remove('bd_hidden');
        else el.classList.add('bd_hidden');
    });
}

// ── 为角色卡添加勾选层 ──────────────────────────────────────────
function attachOverlays() {
    document.querySelectorAll('.character_select.entity_block').forEach(attachOne);

    // 监听动态渲染（翻页/搜索）
    const block = document.getElementById('rm_print_characters_block');
    if (!block) return;

    window._bdObserver = new MutationObserver((mutations) => {
        if (!selectMode) return;
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches?.('.character_select.entity_block')) attachOne(node);
                node.querySelectorAll?.('.character_select.entity_block').forEach(attachOne);
            });
        });
    });
    window._bdObserver.observe(block, { childList: true, subtree: true });
}

function detachOverlays() {
    document.querySelectorAll('.bd_overlay').forEach(el => el.remove());
    document.querySelectorAll('.bd_selected').forEach(el => el.classList.remove('bd_selected'));
    window._bdObserver?.disconnect();
    window._bdObserver = null;
}

function attachOne(card) {
    if (card.querySelector('.bd_overlay')) return;

    // 角色 avatar 文件名存在 id 属性上（如 "char_name.png"）
    const avatar = card.getAttribute('id');
    if (!avatar) return;

    const overlay = document.createElement('div');
    overlay.className = 'bd_overlay';
    if (selectedAvatars.has(avatar)) {
        overlay.classList.add('bd_checked');
        card.classList.add('bd_selected');
    }

    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleCard(card, overlay, avatar);
    });

    // 点击卡片本体也触发（在捕获阶段拦截，阻止打开角色）
    card._bdClickHandler = (e) => {
        if (!selectMode) return;
        if (e.target.closest('.bd_overlay')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        toggleCard(card, overlay, avatar);
    };
    card.addEventListener('click', card._bdClickHandler, true);

    card.appendChild(overlay);
}

function toggleCard(card, overlay, avatar) {
    if (selectedAvatars.has(avatar)) {
        selectedAvatars.delete(avatar);
        overlay.classList.remove('bd_checked');
        card.classList.remove('bd_selected');
    } else {
        selectedAvatars.add(avatar);
        overlay.classList.add('bd_checked');
        card.classList.add('bd_selected');
    }
    updateCount();
}

// ── 全选 / 取消全选 ─────────────────────────────────────────────
function toggleSelectAll() {
    const cards = [...document.querySelectorAll('.character_select.entity_block')];
    const avatars = cards.map(c => c.getAttribute('id')).filter(Boolean);
    const allSelected = avatars.length > 0 && avatars.every(a => selectedAvatars.has(a));

    cards.forEach(card => {
        const av = card.getAttribute('id');
        if (!av) return;
        const overlay = card.querySelector('.bd_overlay');

        if (allSelected) {
            selectedAvatars.delete(av);
            overlay?.classList.remove('bd_checked');
            card.classList.remove('bd_selected');
        } else {
            selectedAvatars.add(av);
            overlay?.classList.add('bd_checked');
            card.classList.add('bd_selected');
        }
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

// ── 获取角色数据（通过 SillyTavern getContext） ─────────────────
function getCharByAvatar(avatar) {
    try {
        const ctx = SillyTavern.getContext();
        return ctx.characters?.find(c => c.avatar === avatar) ?? null;
    } catch {
        return null;
    }
}

// ── 获取选中角色的显示名称列表 ──────────────────────────────────
function getSelectedNames() {
    return [...selectedAvatars].map(av => {
        const card = document.querySelector(`.character_select.entity_block[id="${CSS.escape(av)}"]`);
        return card?.querySelector('.ch_name')?.textContent?.trim() || av;
    });
}

// ── 删除选中角色 ─────────────────────────────────────────────────
async function deleteSelected() {
    if (selectedAvatars.size === 0) {
        alert('请先勾选要删除的角色卡');
        return;
    }

    const withWB = document.getElementById('bd_wb_cb')?.checked ?? false;
    const names = getSelectedNames();
    const wbTip = withWB ? '\n⚠️ 同时删除绑定世界书' : '';
    const preview = names.slice(0, 15).join('\n') + (names.length > 15 ? `\n…等共 ${names.length} 个` : '');

    const ok = confirm(`即将删除 ${selectedAvatars.size} 个角色卡${wbTip}：\n\n${preview}\n\n此操作不可恢复，确认？`);
    if (!ok) return;

    const list = [...selectedAvatars];
    const delBtn = document.getElementById('bd_delete');
    if (delBtn) { delBtn.disabled = true; delBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    let ok_n = 0, fail_n = 0;

    for (const avatar of list) {
        try {
            if (withWB) await tryDeleteWorldbook(avatar);
            await deleteCharacter(avatar);

            // 乐观删除 DOM
            document.querySelector(`.character_select.entity_block[id="${CSS.escape(avatar)}"]`)?.remove();
            selectedAvatars.delete(avatar);
            updateCount();
            ok_n++;
        } catch (e) {
            fail_n++;
            console.error(`[BatchDelete] 删除失败 ${avatar}:`, e);
        }
    }

    if (delBtn) { delBtn.disabled = false; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i><span>删除</span>'; }

    // 刷新角色列表
    refreshCharacterList();

    alert(`完成：成功 ${ok_n}${fail_n ? `，失败 ${fail_n}（见控制台）` : ''}`);

    if (ok_n > 0) toggleSelectMode(); // 自动退出选择模式
}

// ── 删除单个角色 API ─────────────────────────────────────────────
async function deleteCharacter(avatar) {
    const res = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar, delete_chats: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── 删除绑定世界书 ───────────────────────────────────────────────
async function tryDeleteWorldbook(avatar) {
    const char = getCharByAvatar(avatar);
    const worldName = char?.data?.world || char?.world;
    if (!worldName) return;

    const res = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: worldName }),
    });
    if (!res.ok) console.warn(`[BatchDelete] 世界书删除失败 ${worldName}: HTTP ${res.status}`);
    else console.log(`[BatchDelete] 已删除世界书: ${worldName}`);
}

// ── 触发酒馆内部角色列表刷新 ────────────────────────────────────
function refreshCharacterList() {
    try {
        const ctx = SillyTavern.getContext();
        // 从 context 同步删除角色数据，让 printCharacters 拿到最新列表
        if (ctx.characters) {
            // 过滤掉已删除的角色（selectedAvatars 此时已清空，从删除前的 list 拿）
            // printCharacters 会自动重排，只需触发
        }
        if (typeof ctx.printCharacters === 'function') {
            ctx.printCharacters(true);
        }
    } catch (e) {
        // 兜底：触发页面级刷新事件
        try { jQuery(document).trigger('characterListUpdated'); } catch {}
    }
}

// ── 入口：等待页面稳定后注入 ────────────────────────────────────
jQuery(async () => {
    try {
        await injectToolbar();
    } catch (e) {
        console.error('[BatchDelete] 初始化失败', e);
    }
});
