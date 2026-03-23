/**
 * Bulk Character Delete — SillyTavern Extension
 * GitHub: https://github.com/YOUR_USERNAME/st-bulk-character-delete
 *
 * 一键批量删除角色卡（可选同步删除关联世界书）
 */

import { characters, getRequestHeaders, callPopup, POPUP_TYPE } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { world_names, deleteWorldInfo } from '../../../world-info.js';

const EXT_NAME = 'Bulk Character Delete';
const EXT_PREFIX = 'bulk_char_delete';

// ── 状态 ──────────────────────────────────────────────────────────────
let selectedCharacters = new Set();   // 存 avatar 文件名（唯一标识）
let isSelectionMode = false;

// ── 工具函数 ──────────────────────────────────────────────────────────

/**
 * 获取角色绑定的世界书名称列表
 * SillyTavern 把世界书名存在 character.data.extensions.world 或 character.character_book
 */
function getCharacterWorldBooks(character) {
    const books = [];
    // v2 spec: character_book 直接内嵌
    if (character.data?.character_book?.name) {
        books.push(character.data.character_book.name);
    }
    // extensions.world 字段（部分卡片写法）
    if (character.data?.extensions?.world) {
        const w = character.data.extensions.world;
        if (typeof w === 'string' && w.trim()) books.push(w.trim());
    }
    // 去重 & 过滤空
    return [...new Set(books)].filter(Boolean);
}

/**
 * 根据 avatar 文件名找角色对象
 */
function findCharByAvatar(avatar) {
    return characters.find(c => c.avatar === avatar);
}

// ── 渲染选择 UI ────────────────────────────────────────────────────────

function renderPanel() {
    const existing = document.getElementById(`${EXT_PREFIX}_panel`);
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = `${EXT_PREFIX}_panel`;
    panel.className = `${EXT_PREFIX}_panel`;

    panel.innerHTML = `
        <div class="${EXT_PREFIX}_header">
            <span class="${EXT_PREFIX}_title">
                <i class="fa-solid fa-trash-can"></i>
                批量删除角色
            </span>
            <div class="${EXT_PREFIX}_header_actions">
                <button id="${EXT_PREFIX}_select_all" class="menu_button ${EXT_PREFIX}_btn" title="全选 / 取消全选">
                    <i class="fa-solid fa-check-double"></i> 全选
                </button>
                <button id="${EXT_PREFIX}_deselect_all" class="menu_button ${EXT_PREFIX}_btn" title="清除选择">
                    <i class="fa-solid fa-xmark"></i> 清除
                </button>
                <button id="${EXT_PREFIX}_close_panel" class="menu_button ${EXT_PREFIX}_btn ${EXT_PREFIX}_btn_close" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        </div>

        <div class="${EXT_PREFIX}_filter_row">
            <input id="${EXT_PREFIX}_search" class="text_pole ${EXT_PREFIX}_search" type="search" placeholder="搜索角色名…" />
            <span id="${EXT_PREFIX}_count_badge" class="${EXT_PREFIX}_count_badge">已选 0 / ${characters.length}</span>
        </div>

        <div id="${EXT_PREFIX}_char_list" class="${EXT_PREFIX}_char_list">
            ${buildCharListHTML()}
        </div>

        <div class="${EXT_PREFIX}_footer">
            <label class="${EXT_PREFIX}_worldbook_option checkbox_label">
                <input type="checkbox" id="${EXT_PREFIX}_delete_worldbooks" />
                <span>同步删除关联世界书</span>
                <i class="fa-solid fa-circle-question ${EXT_PREFIX}_help_icon"
                   title="若角色卡内嵌了 character_book 或填写了 extensions.world，将一并删除对应世界书文件。&#10;&#10;注意：共享世界书（多角色共用同一个世界书名）会被一并删除，请谨慎勾选。"></i>
            </label>
            <button id="${EXT_PREFIX}_delete_btn" class="menu_button ${EXT_PREFIX}_btn ${EXT_PREFIX}_btn_delete" disabled>
                <i class="fa-solid fa-trash"></i>
                删除选中 (<span id="${EXT_PREFIX}_delete_count">0</span>)
            </button>
        </div>
    `;

    // 插入到角色列表面板顶部（紧跟 charListFixedTop 之后）
    const target = document.getElementById('rm_characters_block');
    if (target) {
        target.insertBefore(panel, target.querySelector('#rm_print_characters_pagination') || target.firstChild);
    } else {
        document.body.appendChild(panel);
    }

    bindPanelEvents(panel);
}

function buildCharListHTML(filter = '') {
    const lc = filter.toLowerCase();
    const filtered = filter
        ? characters.filter(c => c.name?.toLowerCase().includes(lc))
        : characters;

    if (!filtered.length) {
        return `<div class="${EXT_PREFIX}_empty">没有找到角色</div>`;
    }

    return filtered.map(char => {
        const avatar = char.avatar;
        const isChecked = selectedCharacters.has(avatar);
        const worldBooks = getCharacterWorldBooks(char);
        const wbBadge = worldBooks.length
            ? `<span class="${EXT_PREFIX}_wb_badge" title="关联世界书: ${worldBooks.join(', ')}">
                   <i class="fa-solid fa-book"></i> ${worldBooks.length}
               </span>`
            : '';
        const avatarSrc = char.avatar
            ? `/characters/${encodeURIComponent(char.avatar)}`
            : '/img/ai4.png';

        return `
            <label class="${EXT_PREFIX}_char_item ${isChecked ? EXT_PREFIX + '_selected' : ''}"
                   data-avatar="${escapeAttr(avatar)}">
                <input type="checkbox"
                       class="${EXT_PREFIX}_char_checkbox"
                       data-avatar="${escapeAttr(avatar)}"
                       ${isChecked ? 'checked' : ''} />
                <img class="${EXT_PREFIX}_char_avatar"
                     src="${avatarSrc}"
                     onerror="this.src='/img/ai4.png'"
                     alt="${escapeAttr(char.name || '')}" />
                <span class="${EXT_PREFIX}_char_name">${escapeHTML(char.name || avatar)}</span>
                ${wbBadge}
            </label>
        `;
    }).join('');
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function updateCountBadge() {
    const badge = document.getElementById(`${EXT_PREFIX}_count_badge`);
    if (badge) badge.textContent = `已选 ${selectedCharacters.size} / ${characters.length}`;

    const deleteCount = document.getElementById(`${EXT_PREFIX}_delete_count`);
    if (deleteCount) deleteCount.textContent = selectedCharacters.size;

    const deleteBtn = document.getElementById(`${EXT_PREFIX}_delete_btn`);
    if (deleteBtn) deleteBtn.disabled = selectedCharacters.size === 0;
}

// ── 事件绑定 ──────────────────────────────────────────────────────────

function bindPanelEvents(panel) {
    // 关闭
    panel.querySelector(`#${EXT_PREFIX}_close_panel`).addEventListener('click', closePanelUI);

    // 全选
    panel.querySelector(`#${EXT_PREFIX}_select_all`).addEventListener('click', () => {
        const searchVal = document.getElementById(`${EXT_PREFIX}_search`)?.value || '';
        const lc = searchVal.toLowerCase();
        const visible = searchVal
            ? characters.filter(c => c.name?.toLowerCase().includes(lc))
            : characters;
        visible.forEach(c => selectedCharacters.add(c.avatar));
        refreshCharList();
        updateCountBadge();
    });

    // 清除选择
    panel.querySelector(`#${EXT_PREFIX}_deselect_all`).addEventListener('click', () => {
        selectedCharacters.clear();
        refreshCharList();
        updateCountBadge();
    });

    // 搜索框
    panel.querySelector(`#${EXT_PREFIX}_search`).addEventListener('input', (e) => {
        refreshCharList(e.target.value);
    });

    // 角色勾选（事件委托）
    panel.querySelector(`#${EXT_PREFIX}_char_list`).addEventListener('change', (e) => {
        if (!e.target.classList.contains(`${EXT_PREFIX}_char_checkbox`)) return;
        const avatar = e.target.dataset.avatar;
        if (!avatar) return;
        if (e.target.checked) {
            selectedCharacters.add(avatar);
        } else {
            selectedCharacters.delete(avatar);
        }
        // 更新该 label 的选中样式
        const label = e.target.closest(`.${EXT_PREFIX}_char_item`);
        if (label) label.classList.toggle(`${EXT_PREFIX}_selected`, e.target.checked);
        updateCountBadge();
    });

    // 删除按钮
    panel.querySelector(`#${EXT_PREFIX}_delete_btn`).addEventListener('click', onDeleteClick);
}

function refreshCharList(filter = '') {
    const list = document.getElementById(`${EXT_PREFIX}_char_list`);
    if (list) list.innerHTML = buildCharListHTML(filter);
}

function closePanelUI() {
    const panel = document.getElementById(`${EXT_PREFIX}_panel`);
    if (panel) panel.remove();
    selectedCharacters.clear();
    isSelectionMode = false;

    // 恢复工具栏按钮状态
    const triggerBtn = document.getElementById(`${EXT_PREFIX}_trigger_btn`);
    if (triggerBtn) triggerBtn.classList.remove(`${EXT_PREFIX}_active`);
}

// ── 删除逻辑 ──────────────────────────────────────────────────────────

async function onDeleteClick() {
    if (selectedCharacters.size === 0) return;

    const deleteWorldbooks = document.getElementById(`${EXT_PREFIX}_delete_worldbooks`)?.checked ?? false;

    // 收集需要删除的世界书
    let worldbooksToDelete = [];
    if (deleteWorldbooks) {
        for (const avatar of selectedCharacters) {
            const char = findCharByAvatar(avatar);
            if (char) {
                const books = getCharacterWorldBooks(char);
                worldbooksToDelete.push(...books);
            }
        }
        worldbooksToDelete = [...new Set(worldbooksToDelete)];
    }

    // 构建确认信息
    const charNames = [...selectedCharacters]
        .map(av => findCharByAvatar(av)?.name || av)
        .slice(0, 10)
        .join('\n• ');

    const moreCount = selectedCharacters.size > 10 ? `\n… 以及另外 ${selectedCharacters.size - 10} 个角色` : '';

    let confirmMsg = `⚠️ 即将永久删除以下 ${selectedCharacters.size} 个角色：\n\n• ${charNames}${moreCount}`;

    if (deleteWorldbooks && worldbooksToDelete.length > 0) {
        confirmMsg += `\n\n📚 同时删除 ${worldbooksToDelete.length} 个关联世界书：\n• ${worldbooksToDelete.slice(0, 5).join('\n• ')}`;
        if (worldbooksToDelete.length > 5) confirmMsg += `\n… 以及另外 ${worldbooksToDelete.length - 5} 个`;
    }

    confirmMsg += '\n\n此操作无法撤销，确定继续？';

    // 使用 ST 原生确认弹窗
    const confirmed = await callPopup(
        `<p style="white-space:pre-wrap">${escapeHTML(confirmMsg)}</p>`,
        POPUP_TYPE.CONFIRM
    );
    if (!confirmed) return;

    // 执行删除
    const deleteBtn = document.getElementById(`${EXT_PREFIX}_delete_btn`);
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 删除中…';
    }

    let successCount = 0;
    let failCount = 0;
    const failedNames = [];

    for (const avatar of selectedCharacters) {
        try {
            await deleteCharacterByAvatar(avatar);
            successCount++;
        } catch (err) {
            failCount++;
            failedNames.push(findCharByAvatar(avatar)?.name || avatar);
            console.error(`[${EXT_NAME}] 删除角色失败: ${avatar}`, err);
        }
    }

    // 删除世界书
    let wbSuccessCount = 0;
    let wbFailCount = 0;
    if (deleteWorldbooks && worldbooksToDelete.length > 0) {
        for (const bookName of worldbooksToDelete) {
            try {
                await deleteWorldbookByName(bookName);
                wbSuccessCount++;
            } catch (err) {
                wbFailCount++;
                console.error(`[${EXT_NAME}] 删除世界书失败: ${bookName}`, err);
            }
        }
    }

    // 通知结果
    let resultMsg = `✅ 成功删除 ${successCount} 个角色`;
    if (failCount > 0) resultMsg += `\n❌ 失败 ${failCount} 个: ${failedNames.join(', ')}`;
    if (wbSuccessCount > 0) resultMsg += `\n📚 世界书删除 ${wbSuccessCount} 个`;
    if (wbFailCount > 0) resultMsg += `\n⚠️ 世界书失败 ${wbFailCount} 个`;

    toastr.info(resultMsg, EXT_NAME, { timeOut: 5000, escapeHtml: false });

    // 刷新角色列表并关闭面板
    await getContext().reloadCurrentChat?.();
    // 强制刷新角色列表
    await printCharacters();

    closePanelUI();
}

/**
 * 调用 ST 后端 API 删除单个角色
 */
async function deleteCharacterByAvatar(avatar) {
    const response = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            avatar_url: avatar,
            delete_chats: false,   // 默认不删聊天记录，用户可自行处理
        }),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    // 从本地 characters 数组中移除（保持内存同步）
    const idx = characters.findIndex(c => c.avatar === avatar);
    if (idx !== -1) characters.splice(idx, 1);
}

/**
 * 删除世界书
 * ST 的 world-info.js 提供 deleteWorldInfo(name) 函数
 */
async function deleteWorldbookByName(name) {
    // 检查世界书是否存在于当前加载的列表中
    if (!world_names.includes(name)) {
        console.warn(`[${EXT_NAME}] 世界书 "${name}" 不在列表中，跳过`);
        return;
    }
    await deleteWorldInfo(name);
}

/**
 * 刷新角色列表显示
 * 调用 ST 内部的 printCharacters 函数
 */
async function printCharacters() {
    // ST 通过全局事件系统刷新列表
    const ctx = getContext();
    if (typeof ctx.printCharacters === 'function') {
        ctx.printCharacters();
    } else {
        // Fallback：触发 ST 内部的角色列表重绘事件
        document.dispatchEvent(new CustomEvent('character_deleted'));
        // 或者通过 jQuery 触发
        if (typeof $ !== 'undefined') {
            $(document).trigger('characterListChanged');
        }
    }
}

// ── 工具栏按钮（注入到角色列表顶部） ─────────────────────────────────

function injectToolbarButton() {
    if (document.getElementById(`${EXT_PREFIX}_trigger_btn`)) return;

    const btn = document.createElement('i');
    btn.id = `${EXT_PREFIX}_trigger_btn`;
    btn.className = `fa-solid fa-trash-list menu_button ${EXT_PREFIX}_trigger_btn`;
    btn.title = '批量删除角色 (Bulk Delete)';
    btn.setAttribute('data-i18n', '[title]Bulk Delete Characters');

    btn.addEventListener('click', () => {
        const panel = document.getElementById(`${EXT_PREFIX}_panel`);
        if (panel) {
            closePanelUI();
        } else {
            isSelectionMode = true;
            btn.classList.add(`${EXT_PREFIX}_active`);
            renderPanel();
        }
    });

    // 插入到 #rm_print_characters_pagination 内，紧跟 bulkDeleteButton 之后
    const paginationRow = document.getElementById('rm_print_characters_pagination');
    if (paginationRow) {
        paginationRow.appendChild(btn);
    }
}

// ── 扩展入口 ──────────────────────────────────────────────────────────

jQuery(async () => {
    console.log(`[${EXT_NAME}] 扩展加载中…`);

    // 等待 ST 完全加载
    await new Promise(resolve => {
        const check = () => {
            if (document.getElementById('rm_print_characters_pagination')) {
                resolve();
            } else {
                setTimeout(check, 300);
            }
        };
        check();
    });

    injectToolbarButton();

    // 监听角色列表更新（ST 刷新后重新注入按钮）
    const observer = new MutationObserver(() => {
        if (!document.getElementById(`${EXT_PREFIX}_trigger_btn`)) {
            injectToolbarButton();
        }
    });
    const paginationRow = document.getElementById('rm_print_characters_pagination');
    if (paginationRow) {
        observer.observe(paginationRow.parentElement || document.body, {
            childList: true,
            subtree: true,
        });
    }

    console.log(`[${EXT_NAME}] 扩展加载完成 ✓`);
});
