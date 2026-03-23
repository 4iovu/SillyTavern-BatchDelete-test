import { 
    characters, 
    deleteCharacter, 
    getCharacters 
} from "../../../script.js";
import { 
    world_info, 
    deleteWorldInfo 
} from "../../world-info.js";

// 插件主类
export class MassDeletePlugin {
    constructor() {
        this.currentTab = 'characters'; // 'characters' 或 'world_info'
        this.selectedItems = new Set();
        this.init();
    }

    async init() {
        this.injectButton();
        this.createPanel();
    }

    // 在快捷回复(QR)面板注入入口按钮
    injectButton() {
        const interval = setInterval(() => {
            const qrHeader = document.querySelector('#quick_reply_editor .drawer-header');
            if (qrHeader) {
                clearInterval(interval);
                const btn = document.createElement('div');
                btn.className = 'menu_button fa-solid fa-trash-sweep';
                btn.title = '批量删除角色/世界书';
                btn.onclick = () => this.showPanel();
                qrHeader.appendChild(btn);
            }
        }, 1000);
    }

    createPanel() {
        const panelHtml = `
        <div id="mass-delete-manager">
            <div class="md-header">
                <h3>批量管理工具</h3>
                <div class="fa-solid fa-circle-xmark" id="md-close"></div>
            </div>
            <div class="md-tabs">
                <div class="md-tab-btn active" id="tab-chars">角色卡</div>
                <div class="md-tab-btn" id="tab-world">世界书</div>
            </div>
            <div class="md-controls">
                <label><input type="checkbox" id="md-select-all"> 全选</label>
            </div>
            <div class="md-list-container" id="md-list"></div>
            <div class="md-footer">
                <label id="delete-linked-wi-label">
                    <input type="checkbox" id="delete-linked-wi"> 同时删除关联的世界书
                </label>
                <button class="menu_button md-danger-btn" id="md-execute-delete">确认删除已选项目</button>
            </div>
        </div>`;
        
        $('body').append(panelHtml);
        this.bindEvents();
    }

    bindEvents() {
        $('#md-close').on('click', () => $('#mass-delete-manager').hide());
        $('#tab-chars').on('click', () => this.switchTab('characters'));
        $('#tab-world').on('click', () => this.switchTab('world_info'));
        $('#md-select-all').on('change', (e) => this.toggleAll(e.target.checked));
        $('#md-execute-delete').on('click', () => this.executeDelete());
    }

    async showPanel() {
        $('#mass-delete-manager').css('display', 'flex');
        this.renderList();
    }

    switchTab(tab) {
        this.currentTab = tab;
        $('.md-tab-btn').removeClass('active');
        $(`#tab-${tab === 'characters' ? 'chars' : 'world'}`).addClass('active');
        
        // 如果是世界书界面，隐藏“删除关联世界书”勾选框
        $('#delete-linked-wi-label').css('visibility', tab === 'characters' ? 'visible' : 'hidden');
        
        this.selectedItems.clear();
        $('#md-select-all').prop('checked', false);
        this.renderList();
    }

    renderList() {
        const container = $('#md-list');
        container.empty();
        
        const list = this.currentTab === 'characters' ? characters : Object.keys(world_info);

        list.forEach((item, index) => {
            const name = this.currentTab === 'characters' ? item.name : item;
            const id = this.currentTab === 'characters' ? index : item;
            
            const itemHtml = `
            <div class="md-item">
                <input type="checkbox" class="md-item-check" data-id="${id}">
                <span style="margin-left:10px;">${name}</span>
            </div>`;
            container.append(itemHtml);
        });

        $('.md-item-check').on('change', (e) => {
            const id = $(e.target).data('id');
            if (e.target.checked) this.selectedItems.add(id);
            else this.selectedItems.delete(id);
        });
    }

    toggleAll(checked) {
        $('.md-item-check').prop('checked', checked).trigger('change');
    }

    async executeDelete() {
        const count = this.selectedItems.size;
        if (count === 0) return toastr.warning("未选择任何项目");
        
        const confirmMsg = `确定要删除这 ${count} 个项目吗？此操作不可逆！`;
        if (!confirm(confirmMsg)) return;

        const deleteLinked = $('#delete-linked-wi').is(':checked');

        for (let id of this.selectedItems) {
            if (this.currentTab === 'characters') {
                const char = characters[id];
                // 如果勾选了删除关联世界书
                if (deleteLinked && char.world_info) {
                    await deleteWorldInfo(char.world_info);
                }
                await deleteCharacter(id);
            } else {
                await deleteWorldInfo(id);
            }
        }

        toastr.success("删除成功");
        this.selectedItems.clear();
        this.renderList();
    }
}

// 自动初始化
$(document).ready(() => {
    new MassDeletePlugin();
});