import { characters, deleteCharacter, getCharacters } from "../../../script.js";
import { world_info, deleteWorldInfo } from "../../world-info.js";

(function() {
    const extensionName = "batch-delete";
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    // 在扩展菜单中添加按钮
    function addMenuButton() {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return;

        const menuItem = document.createElement('div');
        menuItem.classList.add('list-group-item', 'menu_button', 'fa-solid', 'fa-trash');
        menuItem.style.cursor = 'pointer';
        menuItem.innerHTML = ' <span style="margin-left:10px;">批量删除角色卡</span>';
        
        menuItem.addEventListener('click', () => {
            showBatchDeletePanel();
        });

        menu.appendChild(menuItem);
    }

    // 显示弹出面板
    async function showBatchDeletePanel() {
        const panelHtml = `
            <div id="batch-delete-panel" class="draggable">
                <div class="dragTitle">批量删除管理器</div>
                <div class="panelControlBar">
                    <div class="fa-solid fa-circle-xmark dragClose" id="close-batch-panel"></div>
                </div>
                <div class="batch-tabs">
                    <button id="tab-chars" class="menu_button active">角色卡</button>
                    <button id="tab-world" class="menu_button">世界书</button>
                </div>
                <div class="batch-content">
                    <div class="batch-controls">
                        <label><input type="checkbox" id="select-all"> 全选</label>
                        <label id="wi-option-label"><input type="checkbox" id="delete-linked-wi"> 同时删除关联世界书</label>
                    </div>
                    <div id="batch-list" class="list-group">
                        </div>
                </div>
                <div class="batch-footer">
                    <button id="exec-delete" class="menu_button redWarningBG">确认删除所选</button>
                </div>
            </div>
        `;

        $('body').append(panelHtml);
        $('#batch-delete-panel').draggable({ handle: '.dragTitle' });

        let currentTab = 'chars';
        
        const refreshList = () => {
            const list = $('#batch-list');
            list.empty();
            if (currentTab === 'chars') {
                $('#wi-option-label').show();
                characters.forEach((char, index) => {
                    list.append(`<label class="list-group-item"><input type="checkbox" class="item-check" data-id="${index}"> ${char.name}</label>`);
                });
            } else {
                $('#wi-option-label').hide();
                Object.keys(world_info).forEach(key => {
                    list.append(`<label class="list-group-item"><input type="checkbox" class="item-check" data-id="${key}"> ${key}</label>`);
                });
            }
        };

        refreshList();

        // 切换标签
        $('#tab-chars').click(() => { currentTab = 'chars'; $('.batch-tabs button').removeClass('active'); $('#tab-chars').addClass('active'); refreshList(); });
        $('#tab-world').click(() => { currentTab = 'world'; $('.batch-tabs button').removeClass('active'); $('#tab-world').addClass('active'); refreshList(); });

        // 全选逻辑
        $('#select-all').change(function() {
            $('.item-check').prop('checked', $(this).prop('checked'));
        });

        // 执行删除
        $('#exec-delete').click(async () => {
            const selected = $('.item-check:checked');
            if (selected.length === 0) return toastr.info("请先勾选项目");
            if (!confirm(`确定要删除选中的 ${selected.length} 个项目吗？此操作不可逆！`)) return;

            const deleteWI = $('#delete-linked-wi').is(':checked');

            for (let el of selected) {
                const id = $(el).data('id');
                if (currentTab === 'chars') {
                    const char = characters[id];
                    // 如果勾选了同时删除世界书且角色有关联
                    if (deleteWI && char.world_info && world_info[char.world_info]) {
                        await deleteWorldInfo(char.world_info);
                    }
                    await deleteCharacter(id);
                } else {
                    await deleteWorldInfo(id);
                }
            }
            toastr.success("批量删除完成");
            $('#batch-delete-panel').remove();
            location.reload(); // 刷新页面以同步状态
        });

        $('#close-batch-panel').click(() => $('#batch-delete-panel').remove());
    }

    // 初始化插件
    $(document).ready(() => {
        addMenuButton();
    });
})();