import { getRequestHeaders } from '../../../../script.js';

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
        setTimeout(() => { obs.disconnect(); reject(new Error('Timeout')); }, timeout);
    });
}

async function injectToolbar() {
    if (document.getElementById('bd_toolbar')) return;
    let tagControls;
    try { tagControls = await waitForElement('#rm_characters_block .rm_tag_controls'); }
    catch (e) { console.error('[BD] 找不到容器', e); return; }
    const toolbar = document.createElement('div');
    toolbar.id = 'bd_toolbar';
    toolbar.innerHTML = `
        <button id="bd_toggle" class="menu_button" title="批量选择"><i class="fa-solid fa-check-square"></i> 批量</button>
        <button id="bd_all" class="menu_button bd_hidden">全选</button>
        <span id="bd_count" class="bd_hidden" style="padding:0 4px">0</span>
        <label id="bd_wb_label" class="bd_hidden" style="font-size:0.85em;cursor:pointer"><input type="checkbox" id="bd_wb_cb"> 含世界书</label>
        <button id="bd_delete" class="menu_button bd_hidden" style="color:#ff7b7b" title="删除选中"><i class="fa-solid fa-trash"></i> 删除</button>
    `;
    tagControls.appendChild(toolbar);
    document.getElementById('bd_toggle').addEventListener('click', toggleSelectMode);
    document.getElementById('bd_all').addEventListener('click', toggleSelectAll);
    document.getElementById('bd_delete').addEventListener('click', deleteSelected);
    console.log('[BD] 注入成功');
}

function toggleSelectMode() {
    selectMode = !selectMode;
    const btn = document.getElementById('bd_toggle');
    if (selectMode) {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> 退出';
        showExtra(true); attachOverlays();
    } else {
        btn.innerHTML = '<i class="fa-solid fa-check-square"></i> 批量';
        showExtra(false); clearSelection(); detachOverlays();
    }
}

function showExtra(show) {
    ['bd_all','bd_count','bd_wb_label','bd_delete'].forEach(id => {
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
    window._bdObs?.disconnect(); window._bdObs = null;
}

function attachOne(card) {
    if (card.querySelector('.bd_overlay')) return;
    const avatar = card.getAttribute('id');
    if (!avatar) return;
    const ov = document.createElement('div');
    ov.className = 'bd_overlay';
    ov.style.cssText = 'position:absolute;top:6px;left:6px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.6);border:2px solid rgba(255,255,255,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:20;font-size:13px;color:#fff;font-weight:bold';
    if (selectedAvatars.has(avatar)) { ov.textContent = '✓'; ov.style.background = 'rgba(70,140,255,0.85)'; card.classList.add('bd_selected'); }
    ov.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); toggle(card, ov, avatar); });
    card._bdH = e => {
        if (!selectMode || e.target.closest('.bd_overlay')) return;
        e.stopImmediatePropagation(); e.preventDefault(); toggle(card, ov, avatar);
    };
    card.addEventListener('click', card._bdH, true);
    card.style.position = 'relative';
    card.appendChild(ov);
}

function toggle(card, ov, avatar) {
    if (selectedAvatars.has(avatar)) {
        selectedAvatars.delete(avatar); ov.textContent = ''; ov.style.background = 'rgba(0,0,0,0.6)'; card.classList.remove('bd_selected');
    } else {
        selectedAvatars.add(avatar); ov.textContent = '✓'; ov.style.background = 'rgba(70,140,255,0.85)'; card.classList.add('bd_selected');
    }
    document.getElementById('bd_count').textContent = selectedAvatars.size;
}

function toggleSelectAll() {
    const cards = [...document.querySelectorAll('.character_select.entity_block')];
    const avatars = cards.map(c => c.getAttribute('id')).filter(Boolean);
    const all = avatars.length > 0 && avatars.every(a => selectedAvatars.has(a));
    cards.forEach(card => {
        const av = card.getAttribute('id'); if (!av) return;
        const ov = card.querySelector('.bd_overlay');
        if (all) { selectedAvatars.delete(av); if(ov){ov.textContent='';ov.style.background='rgba(0,0,0,0.6)';} card.classList.remove('bd_selected'); }
        else { selectedAvatars.add(av); if(ov){ov.textContent='✓';ov.style.background='rgba(70,140,255,0.85)';} card.classList.add('bd_selected'); }
    });
    document.getElementById('bd_count').textContent = selectedAvatars.size;
}

function clearSelection() {
    selectedAvatars.clear();
    document.querySelectorAll('.bd_selected').forEach(el => el.classList.remove('bd_selected'));
    document.querySelectorAll('.bd_overlay').forEach(el => { el.textContent=''; el.style.background='rgba(0,0,0,0.6)'; });
    const c = document.getElementById('bd_count'); if(c) c.textContent = '0';
}

async function deleteSelected() {
    if (selectedAvatars.size === 0) { alert('请先勾选角色卡'); return; }
    const withWB = document.getElementById('bd_wb_cb')?.checked ?? false;
    const names = [...selectedAvatars].map(av => {
        const c = document.querySelector(`.character_select.entity_block[id="${CSS.escape(av)}"]`);
        return c?.querySelector('.ch_name')?.textContent?.trim() || av;
    });
    const preview = names.slice(0,15).join('\n') + (names.length>15 ? `\n…共${names.length}个`:'');
    if (!confirm(`删除 ${selectedAvatars.size} 个角色卡${withWB?'\n含绑定世界书':''}：\n\n${preview}\n\n不可恢复，确认？`)) return;

    const list = [...selectedAvatars];
    const btn = document.getElementById('bd_delete');
    if (btn) { btn.disabled = true; btn.textContent = '删除中...'; }

    let ok = 0, fail = 0;
    for (const avatar of list) {
        try {
            if (withWB) await delWorldbook(avatar);
            const res = await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: avatar, delete_chats: false }),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${txt}`);
            }
            document.querySelector(`.character_select.entity_block[id="${CSS.escape(avatar)}"]`)?.remove();
            selectedAvatars.delete(avatar);
            document.getElementById('bd_count').textContent = selectedAvatars.size;
            ok++;
        } catch(e) {
            fail++;
            console.error('[BD] 失败', avatar, e);
        }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> 删除'; }
    try { SillyTavern.getContext().printCharacters(true); } catch {}
    alert(`完成：成功 ${ok}${fail ? `，失败 ${fail}（见控制台）` : ''}`);
    if (ok > 0) toggleSelectMode();
}

async function delWorldbook(avatar) {
    try {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.find(c => c.avatar === avatar);
        const world = char?.data?.world || char?.world;
        if (!world) return;
        await fetch('/api/worldinfo/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name: world }),
        });
    } catch(e) { console.warn('[BD] 世界书异常', e); }
}

jQuery(async () => {
    try { await injectToolbar(); }
    catch(e) { console.error('[BD] 初始化失败', e); }
});
