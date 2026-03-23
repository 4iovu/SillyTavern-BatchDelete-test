// ============================================================
// 角色卡批量删除插件 (Bulk Character Deleter)
// 作者: 基于 SillyTavern Extension API
// 触发方式: QR 按钮（通过 getButtonEvent / eventOn 注册）
// ============================================================

const BUTTON_NAME = "批量删角色";

// ---- 等待 TavernHelper 就绪 ----
(async function () {
    // SillyTavern 的全局 context
    const ST = window.SillyTavern;
    if (!ST) {
        console.error("[BulkCharDelete] SillyTavern global not found.");
        return;
    }

    // TavernHelper 是可选依赖，用于获取世界书列表
    // 即使没有也可以运行核心功能
    const TH = window.TavernHelper || null;

    // ---- 核心：获取所有角色卡列表 ----
    async function fetchAllCharacters() {
        try {
            const resp = await fetch("/api/characters/all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            // ST 返回 { characters: [...] } 或直接数组，兼容两种
            return Array.isArray(data) ? data : (data.characters || []);
        } catch (e) {
            console.error("[BulkCharDelete] fetchAllCharacters error:", e);
            return [];
        }
    }

    // ---- 获取世界书列表 ----
    function getWorldbookNames() {
        if (TH && typeof TH.getWorldbookNames === "function") {
            return TH.getWorldbookNames();
        }
        // 回退：从 DOM select2 里读取
        const names = [];
        document.querySelectorAll("#world_info option").forEach((opt) => {
            if (opt.value) names.push(opt.value);
        });
        return names;
    }

    // ---- 删除单个角色（可选同时删世界书）----
    async function deleteCharacter(avatarFile, deleteLinkedWorld) {
        const body = { avatar_url: avatarFile };
        if (deleteLinkedWorld) body.delete_chats = true; // 酒馆原生支持

        const resp = await fetch("/api/characters/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return resp.ok;
    }

    // ---- 删除世界书文件 ----
    async function deleteWorldbook(name) {
        try {
            const resp = await fetch("/api/worldinfo/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            return resp.ok;
        } catch {
            return false;
        }
    }

    // ---- HTML 转义 ----
    function esc(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ---- 主界面弹窗 ----
    async function openBulkDeleteUI() {
        const characters = await fetchAllCharacters();
        if (!characters.length) {
            toastr.warning("没有找到任何角色卡。");
            return;
        }

        const wbNames = getWorldbookNames();

        // 构建角色卡列表 HTML
        const listHtml = characters
            .map((ch, i) => {
                const name = esc(ch.name || ch.avatar || `角色 #${i}`);
                const avatar = esc(ch.avatar || "");
                const imgSrc = ch.avatar ? `/characters/${ch.avatar}` : "";
                const imgHtml = imgSrc
                    ? `<img src="${imgSrc}" class="bcd-avatar" alt="${name}" onerror="this.style.display='none'">`
                    : `<div class="bcd-avatar bcd-no-img">?</div>`;
                return `
                <div class="bcd-char-row" data-avatar="${avatar}">
                    <label class="bcd-char-label">
                        <input type="checkbox" class="bcd-char-chk" value="${avatar}" data-name="${name}">
                        ${imgHtml}
                        <span class="bcd-char-name">${name}</span>
                    </label>
                </div>`;
            })
            .join("");

        // 世界书勾选区（可选）
        const wbSection =
            wbNames.length > 0
                ? `
            <div class="bcd-section">
                <div class="bcd-section-title">
                    <span>🌍 同时删除世界书（可选）</span>
                    <small class="bcd-hint">仅删除您手动勾选的世界书文件</small>
                </div>
                <div class="bcd-search-row">
                    <input type="text" id="bcd-wb-search" class="text_pole bcd-search" placeholder="🔍 搜索世界书...">
                    <label class="bcd-mini-label">
                        <input type="checkbox" id="bcd-wb-all"> 全选
                    </label>
                </div>
                <div id="bcd-wb-list" class="bcd-list bcd-wb-list">
                    ${wbNames
                        .map(
                            (n) => `
                        <div class="bcd-wb-row">
                            <label class="bcd-char-label">
                                <input type="checkbox" class="bcd-wb-chk" value="${esc(n)}">
                                <span class="bcd-wb-icon">📖</span>
                                <span class="bcd-char-name">${esc(n)}</span>
                            </label>
                        </div>`
                        )
                        .join("")}
                </div>
            </div>`
                : `<div class="bcd-no-wb">（未检测到世界书，或 TavernHelper 未加载）</div>`;

        const content = `
<div id="bcd-root">
    <h3 class="bcd-title">🗑️ 批量删除角色卡</h3>

    <div class="bcd-section">
        <div class="bcd-section-title">
            <span>👤 选择要删除的角色卡</span>
            <span class="bcd-count-badge"><span id="bcd-sel-count">0</span> / ${characters.length}</span>
        </div>
        <div class="bcd-search-row">
            <input type="text" id="bcd-char-search" class="text_pole bcd-search" placeholder="🔍 搜索角色...">
            <div class="bcd-bulk-btns">
                <button class="menu_button bcd-btn-sm" id="bcd-sel-all">全选</button>
                <button class="menu_button bcd-btn-sm" id="bcd-inv-sel">反选</button>
                <button class="menu_button bcd-btn-sm" id="bcd-sel-none">清空</button>
            </div>
        </div>
        <div id="bcd-char-list" class="bcd-list">
            ${listHtml}
        </div>
    </div>

    ${wbSection}

    <div class="bcd-danger-zone">
        <div class="bcd-warn-icon">⚠️</div>
        <div class="bcd-warn-text">
            删除操作<strong>不可撤销</strong>，角色卡文件将从磁盘永久移除。
            <br>世界书仅删除您在上方勾选的项目。
        </div>
    </div>
</div>`;

        // 使用 SillyTavern 原生 Popup
        const popup = new ST.Popup(content, "text", null, {
            wider: true,
            okButton: "确认删除",
            cancelButton: "取消",
            async onClosing(p) {
                if (p.result !== ST.POPUP_RESULT.AFFIRMATIVE) return true;
                await executeDelete(p.dlg);
                return true;
            },
        });
        popup.show();

        const $dlg = $(popup.dlg);

        // ---- 绑定角色搜索 ----
        $dlg.on("input", "#bcd-char-search", function () {
            const term = $(this).val().toLowerCase();
            $dlg.find(".bcd-char-row").each(function () {
                const name = $(this).find(".bcd-char-name").text().toLowerCase();
                $(this).toggle(name.includes(term));
            });
        });

        // ---- 绑定世界书搜索 ----
        $dlg.on("input", "#bcd-wb-search", function () {
            const term = $(this).val().toLowerCase();
            $dlg.find(".bcd-wb-row").each(function () {
                const name = $(this).find(".bcd-char-name").text().toLowerCase();
                $(this).toggle(name.includes(term));
            });
        });

        // ---- 全选 / 反选 / 清空 ----
        $dlg.on("click", "#bcd-sel-all", () => {
            $dlg.find(".bcd-char-chk:visible").prop("checked", true).trigger("change");
        });
        $dlg.on("click", "#bcd-inv-sel", () => {
            $dlg.find(".bcd-char-chk:visible").each(function () {
                $(this).prop("checked", !$(this).prop("checked")).trigger("change");
            });
        });
        $dlg.on("click", "#bcd-sel-none", () => {
            $dlg.find(".bcd-char-chk").prop("checked", false).trigger("change");
        });

        // ---- 世界书全选 ----
        $dlg.on("change", "#bcd-wb-all", function () {
            $dlg.find(".bcd-wb-chk:visible").prop("checked", $(this).prop("checked"));
        });

        // ---- 计数更新 ----
        $dlg.on("change", ".bcd-char-chk", () => {
            const n = $dlg.find(".bcd-char-chk:checked").length;
            $dlg.find("#bcd-sel-count").text(n);
        });
    }

    // ---- 执行删除 ----
    async function executeDelete(dlg) {
        const $dlg = $(dlg);
        const selectedChars = $dlg
            .find(".bcd-char-chk:checked")
            .map((_, el) => ({
                avatar: $(el).val(),
                name: $(el).data("name"),
            }))
            .get();

        const selectedWbs = $dlg
            .find(".bcd-wb-chk:checked")
            .map((_, el) => $(el).val())
            .get();

        if (!selectedChars.length && !selectedWbs.length) {
            toastr.warning("未选择任何内容。");
            return;
        }

        // 二次确认
        const confirmMsg =
            `即将永久删除：\n` +
            (selectedChars.length ? `• ${selectedChars.length} 个角色卡\n` : "") +
            (selectedWbs.length ? `• ${selectedWbs.length} 个世界书\n` : "") +
            `\n此操作无法撤销，是否继续？`;

        const confirmed = await ST.callGenericPopup(confirmMsg, ST.POPUP_TYPE.CONFIRM);
        if (!confirmed) return;

        let charOk = 0,
            charFail = 0,
            wbOk = 0,
            wbFail = 0;

        // 删除角色
        for (const ch of selectedChars) {
            const ok = await deleteCharacter(ch.avatar, false);
            ok ? charOk++ : charFail++;
        }

        // 删除世界书
        for (const wb of selectedWbs) {
            const ok = await deleteWorldbook(wb);
            ok ? wbOk++ : wbFail++;
        }

        // 刷新角色列表 UI
        try {
            // 触发酒馆内置的角色列表刷新
            if (typeof window.printCharactersDebounced === "function") {
                window.printCharactersDebounced();
            } else if (typeof window.getCharacters === "function") {
                await window.getCharacters();
            }
        } catch (e) {
            console.warn("[BulkCharDelete] Could not refresh character list:", e);
        }

        // 结果提示
        const parts = [];
        if (charOk) parts.push(`✅ ${charOk} 个角色卡已删除`);
        if (charFail) parts.push(`❌ ${charFail} 个角色卡删除失败`);
        if (wbOk) parts.push(`✅ ${wbOk} 个世界书已删除`);
        if (wbFail) parts.push(`❌ ${wbFail} 个世界书删除失败`);

        if (charFail || wbFail) {
            toastr.warning(parts.join("\n"), "删除完成（部分失败）");
        } else {
            toastr.success(parts.join("\n"), "删除完成");
        }
    }

    // ---- 注册 QR 按钮事件（与参考脚本同样思路）----
    function registerButton(name, callback) {
        const eventType = getButtonEvent(name);
        if (eventType) {
            eventOn(eventType, callback);
            console.log(`[BulkCharDelete] 按钮 "${name}" 注册成功`);
        } else {
            console.warn(`[BulkCharDelete] 未找到按钮 "${name}" 的事件，请在 QR 中创建同名按钮`);
        }
    }

    registerButton(BUTTON_NAME, openBulkDeleteUI);
    toastr.info(`批量删角色插件已加载，请在 QR 中点击「${BUTTON_NAME}」按钮`);
})();
