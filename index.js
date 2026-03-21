/**
 * SillyTavern 角色卡批量删除插件脚本
 * 集成位置：角色面板标签栏右侧
 */
(function() {
    let isSelectMode = false;
    let selectedAvatars = new Set();

    // 1. 核心删除函数：调用酒馆原生API
    async function deleteCharacter(avatar, deleteWorldbook) {
        try {
            const { getRequestHeaders, characters, printCharacters } = SillyTavern.getContext();
            
            // 如果需要删除世界书
            if (deleteWorldbook) {
                const char = characters.find(c => c.avatar === avatar);
                const worldName = char?.data?.world || char?.world;
                if (worldName) {
                    await fetch('/api/worldinfo/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ name: worldName }),
                    });
                }
            }

            // 删除角色卡
            const res = await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: avatar, delete_chats: true }),
            });

            return res.ok;
        } catch (e) {
            console.error(`删除 ${avatar} 失败:`, e);
            return false;
        }
    }

    // 2. 注入UI按钮
    function injectUI() {
        const container = document.querySelector('.rm_tag_controls .tags.rm_tag_filter');
        if (!container || document.getElementById('batch-delete-tool')) return;

        const toolWrapper = document.createElement('div');
        toolWrapper.id = 'batch-delete-tool';
        toolWrapper.style = 'display:inline-flex; gap:5px; margin-left:auto; padding:2px;';

        toolWrapper.innerHTML = `
            <button id="btn-batch-toggle" class="menu_button" title="开启批量选择">
                <i class="fa-solid fa-list-check"></i>
            </button>
            <div id="batch-actions" style="display:none; gap:5px;">
                <button id="btn-batch-all" class="menu_button">全选</button>
                <button id="btn-batch-confirm" class="menu_button" style="color: #ff4d4d;">
                    <i class="fa-solid fa-trash-can"></i> 删除(<span id="batch-count">0</span>)
                </button>
            </div>
        `;
        container.parentElement.appendChild(toolWrapper);

        // 事件绑定
        document.getElementById('btn-batch-toggle').onclick = toggleMode;
        document.getElementById('btn-batch-all').onclick = selectAll;
        document.getElementById('btn-batch-confirm').onclick = executeDelete;
    }

    // 3. 切换选择模式
    function toggleMode() {
        isSelectMode = !isSelectMode;
        const actions = document.getElementById('batch-actions');
        actions.style.display = isSelectMode ? 'flex' : 'none';
        selectedAvatars.clear();
        updateView();
    }

    // 4. 更新视图（添加勾选框样式）
    function updateView() {
        const chars = document.querySelectorAll('.character_select');
        chars.forEach(el => {
            const avatar = el.getAttribute('id'); // 酒馆用avatar文件名作为ID
            if (isSelectMode) {
                el.style.position = 'relative';
                el.style.border = selectedAvatars.has(avatar) ? '2px solid #00e5ff' : 'none';
                el.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedAvatars.has(avatar)) selectedAvatars.delete(avatar);
                    else selectedAvatars.add(avatar);
                    updateView();
                };
            } else {
                el.style.border = 'none';
                el.onclick = null; // 恢复原状
            }
        });
        document.getElementById('batch-count').innerText = selectedAvatars.size;
    }

    // 5. 全选当前可见
    function selectAll() {
        const chars = document.querySelectorAll('.character_select');
        chars.forEach(el => selectedAvatars.add(el.getAttribute('id')));
        updateView();
    }

    // 6. 执行批量删除
    async function executeDelete() {
        if (selectedAvatars.size === 0) return;
        
        const includeWorld = confirm(`确认删除选中的 ${selectedAvatars.size} 个角色吗？\n\n注意：这将同时删除聊天记录。\n是否连带删除关联的【世界书】？`);
        
        let successCount = 0;
        const avatarsArray = Array.from(selectedAvatars);
        
        // 禁用按钮防止重复点击
        const btn = document.getElementById('btn-batch-confirm');
        btn.disabled = true;
        btn.innerText = "处理中...";

        for (const avatar of avatarsArray) {
            const ok = await deleteCharacter(avatar, includeWorld);
            if (ok) successCount++;
        }

        alert(`清理完成！成功删除 ${successCount} 个角色。`);
        location.reload(); // 刷新页面以同步酒馆内部状态
    }

    // 自动初始化
    const observer = new MutationObserver((mutations) => {
        if (document.querySelector('.rm_tag_controls')) {
            injectUI();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();