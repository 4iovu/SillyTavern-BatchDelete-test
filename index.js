(async function() {
    // 等待核心组件加载
    const waitForST = () => new Promise(res => {
        const check = () => window.SillyTavern && window.SillyTavern.getContext ? res() : setTimeout(check, 100);
        check();
    });

    await waitForST();
    const { getRequestHeaders, printCharacters } = window.SillyTavern.getContext();

    let isSelectMode = false;
    let selectedSet = new Set();

    // 1. 注入 CSS 样式
    const style = document.createElement('style');
    style.innerHTML = `
        .bd-selected { outline: 3px solid #ff4757 !important; position: relative; }
        .bd-selected::after { content: '✓'; position: absolute; top: 5px; right: 5px; background: #ff4757; color: white; border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px; font-weight: bold; }
        .bd-btn { margin-left: 5px !important; padding: 0 10px !important; }
        .bd-hidden { display: none !important; }
    `;
    document.head.appendChild(style);

    // 2. 注入工具栏
    function injectUI() {
        const container = document.querySelector('#rm_characters_block .rm_tag_controls');
        if (!container || document.getElementById('bd_tools')) return;

        const tools = document.createElement('div');
        tools.id = 'bd_tools';
        tools.style.display = 'inline-flex';
        tools.innerHTML = `
            <button id="bd_toggle" class="menu_button bd-btn" title="批量删除模式"><i class="fa-solid fa-list-check"></i> 批量</button>
            <button id="bd_all" class="menu_button bd-btn bd-hidden">全选</button>
            <button id="bd_del" class="menu_button bd-btn bd-hidden" style="color:#ff4757;"><i class="fa-solid fa-trash"></i> 删除 (<span id="bd_count">0</span>)</button>
        `;
        container.appendChild(tools);

        // 绑定事件
        document.getElementById('bd_toggle').onclick = toggleMode;
        document.getElementById('bd_all').onclick = toggleAll;
        document.getElementById('bd_del').onclick = executeDelete;
    }

    // 3. 切换选择模式
    function toggleMode() {
        isSelectMode = !isSelectMode;
        selectedSet.clear();
        updateUI();
        
        const chars = document.querySelectorAll('.character_select');
        chars.forEach(el => {
            el.classList.remove('bd-selected');
            if (isSelectMode) {
                el.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const avatar = el.getAttribute('id');
                    if (selectedSet.has(avatar)) {
                        selectedSet.delete(avatar);
                        el.classList.remove('bd-selected');
                    } else {
                        selectedSet.add(avatar);
                        el.classList.add('bd-selected');
                    }
                    document.getElementById('bd_count').innerText = selectedSet.size;
                };
            } else {
                el.onclick = null; // 恢复原本点击效果（刷新页面即可）
            }
        });
    }

    function updateUI() {
        const isHidden = !isSelectMode;
        document.getElementById('bd_all').classList.toggle('bd-hidden', isHidden);
        document.getElementById('bd_del').classList.toggle('bd-hidden', isHidden);
        document.getElementById('bd_toggle').classList.toggle('active', isSelectMode);
        document.getElementById('bd_count').innerText = "0";
    }

    function toggleAll() {
        const chars = document.querySelectorAll('.character_select:not(.hidden)');
        const allVisible = Array.from(chars).map(c => c.getAttribute('id'));
        
        if (selectedSet.size === allVisible.length) {
            selectedSet.clear();
            chars.forEach(c => c.classList.remove('bd-selected'));
        } else {
            allVisible.forEach(id => selectedSet.add(id));
            chars.forEach(c => c.classList.add('bd-selected'));
        }
        document.getElementById('bd_count').innerText = selectedSet.size;
    }

    // 4. 执行删除逻辑
    async function executeDelete() {
        if (selectedSet.size === 0) return;
        
        const includeWorldbook = confirm(`确定删除这 ${selectedSet.size} 个角色吗？\n\n【确定】同时尝试删除关联的世界书\n【取消】仅删除角色卡`);
        
        let ok = 0, fail = 0;
        const avatars = Array.from(selectedSet);

        for (const avatar of avatars) {
            try {
                // 如果需要删除世界书
                if (includeWorldbook) {
                    const charData = window.SillyTavern.getContext().characters.find(c => c.avatar === avatar);
                    const wbName = charData?.data?.world || charData?.world;
                    if (wbName) {
                        await fetch('/api/worldinfo/delete', {
                            method: 'POST',
                            headers: getRequestHeaders(),
                            body: JSON.stringify({ name: wbName })
                        });
                    }
                }

                // 删除角色卡
                const res = await fetch('/api/characters/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ avatar_url: avatar })
                });

                if (res.ok) ok++; else fail++;
            } catch (e) {
                console.error('删除失败:', avatar, e);
                fail++;
            }
        }

        alert(`清理完成！\n成功: ${ok}\n失败: ${fail}`);
        toggleMode(); // 退出模式
        printCharacters(); // 刷新酒馆列表
    }

    // 初始化检查
    setInterval(injectUI, 1000);
})();