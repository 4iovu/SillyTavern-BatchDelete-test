import { 
    characters, 
    deleteCharacter, 
    getCharacterById 
} from "../../../script.js";
import { 
    world_info, 
    deleteWorldInfo 
} from "../../world-info.js";

// 插件配置与状态
const MODULE_NAME = "BatchDelete";
let isWorldInfoTab = false;

async function showDeletePanel() {
    const listHtml = generateListHtml();
    const panelHtml = `
        <div id="batch-delete-overlay" class="list-group">
            <div id="batch-delete-panel">
                <div class="panel-header">
                    <div id="tab-chars" class="tab-item ${!isWorldInfoTab ? 'active' : ''}">角色卡</div>
                    <div id="tab-worlds" class="tab-item ${isWorldInfoTab ? 'active' : ''}">世界书</div>
                    <div class="close-panel">×</div>
                </div>
                <div class="panel-controls">
                    <label><input type="checkbox" id="select-all"> 全选</label>
                    <label id="option-del-world" style="${isWorldInfoTab ? 'display:none' : ''}">
                        <input type="checkbox" id="include-world-info"> 同时删除关联世界书
                    </label>
                </div>
                <div class="panel-list">${listHtml}</div>
                <div class="panel-footer">
                    <button id="confirm-batch-delete" class="menu_button red_button">确认删除已选</button>
                </div>
            </div>
        </div>
    `;
    $('body').append(panelHtml);
    bindPanelEvents();
}

function generateListHtml() {
    if (!isWorldInfoTab) {
        // 渲染角色卡列表
        return characters.map((char, index) => `
            <div class="item-row" data-id="${index}">
                <input type="checkbox" class="item-checkbox">
                <img src="${char.avatar}" class="item-avatar">
                <span>${char.name}</span>
            </div>
        `).join('');
    } else {
        // 渲染世界书列表
        return Object.keys(world_info).map(key => `
            <div class="item-row" data-id="${key}">
                <input type="checkbox" class="item-checkbox">
                <span>${key}</span>
            </div>
        `).join('');
    }
}

function bindPanelEvents() {
    // 关闭面板
    $('.close-panel, #batch-delete-overlay').on('click', function(e) {
        if (e.target === this) $('#batch-delete-overlay').remove();
    });

    // 切换页签
    $('#tab-chars').on('click', () => { isWorldInfoTab = false; refreshPanel(); });
    $('#tab-worlds').on('click', () => { isWorldInfoTab = true; refreshPanel(); });

    // 全选逻辑
    $('#select-all').on('change', function() {
        $('.item-checkbox').prop('checked', this.checked);
    });

    // 执行删除
    $('#confirm-batch-delete').on('click', async () => {
        const selected = $('.item-checkbox:checked').closest('.item-row');
        if (selected.length === 0) return toastr.warning("请至少选择一项");
        
        if (confirm(`确定要删除选中的 ${selected.length} 个项目吗？此操作不可撤销！`)) {
            const delWorld = $('#include-world-info').is(':checked');
            
            for (let el of selected) {
                const id = $(el).data('id');
                if (!isWorldInfoTab) {
                    const char = characters[id];
                    // 如果勾选了删除世界书且角色有关联
                    if (delWorld && char.world) await deleteWorldInfo(char.world);
                    await deleteCharacter(id);
                } else {
                    await deleteWorldInfo(id);
                }
            }
            toastr.success("批量删除完成");
            $('#batch-delete-overlay').remove();
        }
    });
}

function refreshPanel() {
    $('#batch-delete-overlay').remove();
    showDeletePanel();
}

// 初始化：注入菜单按钮
jQuery(() => {
    const menuBtn = `
        <div id="batch-delete-btn" class="list-group-item menu_button flex-container">
            <i class="fa-solid fa-trash fa-fw"></i>
            <span data-i18n="Batch Delete Characters">批量删除角色卡</span>
        </div>
    `;
    $('#extensionsMenu').append(menuBtn);
    $(document).on('click', '#batch-delete-btn', showDeletePanel);
});