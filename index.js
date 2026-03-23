import { characters, getCharacters } from '../../../../script.js';
import { getRequestHeaders } from '../../../../scripts/extensions.js';

let modalElement = null;
let currentTab = 'characters'; // 'characters' or 'worldinfo'
let worldInfoList = [];

// 初始化并注入按钮
function init() {
    // 尝试寻找你指定的 #extensionsMenu，如果没有则降级寻找原生的扩展面板底部
    let menu = document.querySelector('#extensionsMenu');
    if (!menu) {
        menu = document.querySelector('#rm_extensions_block .extensions_block');
    }

    if (menu) {
        const btn = document.createElement('div');
        btn.className = 'menu_button menu_button_icon';
        btn.id = 'bd-open-btn';
        btn.innerHTML = '<i class="fa-solid fa-trash"></i><span style="margin-left:5px;">批量删除角色卡</span>';
        btn.addEventListener('click', openModal);
        menu.appendChild(btn);
    }
}

async function fetchWorldInfo() {
    const response = await fetch('/api/worldinfo/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({})
    });
    if (response.ok) {
        worldInfoList = await response.json();
    }
}

async function openModal() {
    if (modalElement) return;
    await fetchWorldInfo();
    
    modalElement = document.createElement('div');
    modalElement.id = 'batch-delete-modal';
    
    modalElement.innerHTML = `
        <div class="bd-header">
            <div class="bd-tabs">
                <div class="bd-tab active" data-tab="characters">角色卡</div>
                <div class="bd-tab" data-tab="worldinfo">世界书</div>
            </div>
            <div class="bd-close fa-solid fa-circle-xmark hoverglow"></div>
        </div>
        <div class="bd-body" id="bd-list-container"></div>
        <div class="bd-footer">
            <label class="checkbox_label">
                <input type="checkbox" id="bd-select-all">
                <span>全选</span>
            </label>
            <div class="bd-actions">
                <label class="checkbox_label" id="bd-delete-wi-checkbox-container">
                    <input type="checkbox" id="bd-delete-associated-wi">
                    <span>同时删除绑定的世界书</span>
                </label>
                <div class="menu_button red_button" id="bd-execute-btn">
                    <i class="fa-solid fa-trash"></i> 删除选中
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalElement);
    
    // 绑定事件
    modalElement.querySelector('.bd-close').addEventListener('click', closeModal);
    modalElement.querySelector('#bd-select-all').addEventListener('change', toggleSelectAll);
    modalElement.querySelector('#bd-execute-btn').addEventListener('click', executeDelete);
    
    modalElement.querySelectorAll('.bd-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            modalElement.querySelectorAll('.bd-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.getAttribute('data-tab');
            document.getElementById('bd-delete-wi-checkbox-container').style.display = currentTab === 'characters' ? 'flex' : 'none';
            document.getElementById('bd-select-all').checked = false;
            renderList();
        });
    });

    renderList();
}

function closeModal() {
    if (modalElement) {
        modalElement.remove();
        modalElement = null;
    }
}

function renderList() {
    const container = document.getElementById('bd-list-container');
    container.innerHTML = '';
    
    if (currentTab === 'characters') {
        characters.forEach((char, index) => {
            const item = document.createElement('div');
            item.className = 'bd-list-item';
            // 头像路径处理
            const avatarUrl = char.avatar ? `/characters/${char.avatar}` : '/img/ai4.png';
            item.innerHTML = `
                <input type="checkbox" class="bd-item-checkbox" data-index="${index}" data-type="character">
                <img src="${avatarUrl}" alt="avatar">
                <span>${char.name}</span>
                <small class="opacity50p">(${char.avatar})</small>
            `;
            container.appendChild(item);
        });
    } else {
        Object.keys(worldInfoList).forEach((wiName, index) => {
            const item = document.createElement('div');
            item.className = 'bd-list-item';
            item.innerHTML = `
                <input type="checkbox" class="bd-item-checkbox" data-name="${wiName}" data-type="worldinfo">
                <i class="fa-solid fa-book-atlas"></i>
                <span>${wiName}</span>
            `;
            container.appendChild(item);
        });
    }
}

function toggleSelectAll(e) {
    const isChecked = e.target.checked;
    document.querySelectorAll('.bd-item-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });
}

async function executeDelete() {
    const checkboxes = document.querySelectorAll('.bd-item-checkbox:checked');
    if (checkboxes.length === 0) return;

    const confirmDelete = confirm(`警告：即将永久删除 ${checkboxes.length} 个项目。此操作无法撤销！是否继续？`);
    if (!confirmDelete) return;

    const deleteAssociatedWI = document.getElementById('bd-delete-associated-wi')?.checked;

    for (let cb of checkboxes) {
        if (currentTab === 'characters') {
            const charIndex = cb.getAttribute('data-index');
            const char = characters[charIndex];
            
            // 删除关联世界书的逻辑 (取决于卡片是如何绑定世界书的，这里检查全局链接)
            if (deleteAssociatedWI && char.data?.extensions?.world_info) {
                for (let wi of char.data.extensions.world_info) {
                    await deleteWorldInfoAPI(wi);
                }
            }
            
            // 删除角色
            await fetch('/api/characters/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar: char.avatar })
            });

        } else if (currentTab === 'worldinfo') {
            const wiName = cb.getAttribute('data-name');
            await deleteWorldInfoAPI(wiName);
        }
    }

    alert('删除完成！UI 即将刷新。');
    closeModal();
    
    // 刷新酒馆数据
    if (currentTab === 'characters') {
        await getCharacters(); // 酒馆自带刷新角色列表函数
    }
    // 暴力一点可以直接 location.reload();
    location.reload(); 
}

async function deleteWorldInfoAPI(name) {
    await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name })
    });
}

// 延迟执行以确保酒馆的 DOM 已经加载完毕
setTimeout(init, 2000);