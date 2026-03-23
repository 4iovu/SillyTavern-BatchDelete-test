/**
 * Batch Character Deleter - SillyTavern Extension
 * 
 * Adds a "Batch Delete" button to the rm_tag_filter area (rightmost).
 * Allows selecting characters (with optional worldbook deletion) and deleting them in bulk.
 * 
 * Install: Place this folder in SillyTavern/public/scripts/extensions/batch-character-deleter/
 */

import { characters, deleteCharacter, getRequestHeaders } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { world_names, deleteWorldInfo } from '../../../world-info.js';

const extensionName = 'batch-character-deleter';
const extensionFolderPath = `scripts/extensions/${extensionName}`;

// ── State ──────────────────────────────────────────────────────────────────────
let batchModeActive = false;
let selectedChids = new Set();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Return the avatar filename (key) for a given chid */
function getAvatarByChid(chid) {
    return characters[chid]?.avatar ?? null;
}

/** Collect all worldbooks bound to a character (primary + extras stored in char data) */
function getCharacterWorldbooks(chid) {
    const char = characters[chid];
    if (!char) return [];
    const books = new Set();

    // Primary lorebook stored in extensions.world
    const primary = char.data?.extensions?.world || char.extensions?.world;
    if (primary) books.add(primary);

    // Try character_book embedded name (v2 spec)
    const embeddedName = char.data?.character_book?.name;
    if (embeddedName && world_names?.includes(embeddedName)) books.add(embeddedName);

    return [...books];
}

/** Toggle selection highlight on a character card */
function toggleCardHighlight(chid, selected) {
    const card = document.querySelector(`.character_select[chid="${chid}"]`);
    if (!card) return;
    card.classList.toggle('bcd-selected', selected);
}

/** Update the counter badge */
function updateCounter() {
    const el = document.getElementById('bcd-selected-count');
    if (el) el.textContent = selectedChids.size > 0 ? `${selectedChids.size} selected` : '';
    const delBtn = document.getElementById('bcd-delete-btn');
    if (delBtn) delBtn.disabled = selectedChids.size === 0;
}

/** Add / remove click handlers on all visible character cards */
function bindCardClicks(bind) {
    document.querySelectorAll('#rm_print_characters_block .character_select').forEach(card => {
        if (bind) {
            card.addEventListener('click', onCardClick, true);
        } else {
            card.removeEventListener('click', onCardClick, true);
        }
    });
}

/** Card click handler in batch mode – capture phase to prevent opening the character */
function onCardClick(e) {
    if (!batchModeActive) return;
    e.preventDefault();
    e.stopPropagation();

    const card = e.currentTarget;
    const chid = parseInt(card.getAttribute('chid'), 10);
    if (isNaN(chid)) return;

    if (selectedChids.has(chid)) {
        selectedChids.delete(chid);
        toggleCardHighlight(chid, false);
    } else {
        selectedChids.add(chid);
        toggleCardHighlight(chid, true);
    }
    updateCounter();
}

// ── Core Actions ───────────────────────────────────────────────────────────────

function enterBatchMode() {
    batchModeActive = true;
    selectedChids.clear();

    document.getElementById('bcd-batch-btn')?.classList.add('bcd-active');
    document.getElementById('bcd-toolbar')?.classList.remove('bcd-hidden');

    // Add cursor hint to character list
    const block = document.getElementById('rm_print_characters_block');
    if (block) block.classList.add('bcd-picking');

    bindCardClicks(true);
    updateCounter();
}

function exitBatchMode() {
    batchModeActive = false;

    // Clear highlights
    selectedChids.forEach(chid => toggleCardHighlight(chid, false));
    selectedChids.clear();

    document.getElementById('bcd-batch-btn')?.classList.remove('bcd-active');
    document.getElementById('bcd-toolbar')?.classList.add('bcd-hidden');

    const block = document.getElementById('rm_print_characters_block');
    if (block) block.classList.remove('bcd-picking');

    bindCardClicks(false);
    updateCounter();
}

function selectAll() {
    document.querySelectorAll('#rm_print_characters_block .character_select').forEach(card => {
        const chid = parseInt(card.getAttribute('chid'), 10);
        if (!isNaN(chid)) {
            selectedChids.add(chid);
            toggleCardHighlight(chid, true);
        }
    });
    updateCounter();
}

function deselectAll() {
    selectedChids.forEach(chid => toggleCardHighlight(chid, false));
    selectedChids.clear();
    updateCounter();
}

async function confirmAndDelete() {
    if (selectedChids.size === 0) return;

    const deleteWorldbooks = document.getElementById('bcd-worldbook-check')?.checked ?? false;
    const total = selectedChids.size;

    // Build confirmation message
    const charNames = [...selectedChids]
        .map(chid => characters[chid]?.name ?? `#${chid}`)
        .join('\n• ');

    const wbWarning = deleteWorldbooks
        ? '\n\n⚠️ The primary worldbook bound to each character will also be DELETED.'
        : '';

    const confirmed = window.confirm(
        `Delete ${total} character(s)?\n\n• ${charNames}${wbWarning}\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    const chidsToDelete = [...selectedChids];
    exitBatchMode();

    let successCount = 0;
    let failCount = 0;

    for (const chid of chidsToDelete) {
        try {
            const avatar = getAvatarByChid(chid);
            if (!avatar) { failCount++; continue; }

            // Optionally delete worldbooks first
            if (deleteWorldbooks) {
                const books = getCharacterWorldbooks(chid);
                for (const bookName of books) {
                    try {
                        await deleteWorldInfo(bookName);
                    } catch (wbErr) {
                        console.warn(`[BCD] Failed to delete worldbook "${bookName}":`, wbErr);
                    }
                }
            }

            // Delete the character via SillyTavern's own function
            await deleteCharacter(avatar, /* deleteChats */ false);
            successCount++;
        } catch (err) {
            console.error(`[BCD] Failed to delete chid ${chid}:`, err);
            failCount++;
        }
    }

    const msg = failCount > 0
        ? `Deleted ${successCount} character(s). ${failCount} failed.`
        : `Successfully deleted ${successCount} character(s).`;
    toastr.success(msg, 'Batch Delete');
}

// ── UI Injection ───────────────────────────────────────────────────────────────

    // ── Button in tag filter row ──
    // The rm_characters_block has TWO .rm_tag_filter divs — we want the one
    // inside #rm_characters_block (not the group add-members panel).
    const charBlock = document.getElementById('rm_characters_block');
    if (!charBlock) {
        console.error('[BCD] #rm_characters_block not found — cannot inject button');
        return;
    }

    const tagControls = charBlock.querySelector('.rm_tag_controls');
    if (!tagControls) {
        console.error('[BCD] .rm_tag_controls not found inside #rm_characters_block');
        return;
    }

    const batchBtn = document.createElement('i');
    batchBtn.id = 'bcd-batch-btn';
    batchBtn.className = 'fa-solid fa-list-check menu_button';
    batchBtn.title = 'Batch Delete Characters';
    batchBtn.setAttribute('data-i18n', '[title]Batch Delete Characters');
    batchBtn.addEventListener('click', () => {
        if (batchModeActive) exitBatchMode();
        else enterBatchMode();
    });
    tagControls.appendChild(batchBtn);

    // ── Toolbar (injected right after charListFixedTop, inside rm_characters_block) ──
    const toolbar = document.createElement('div');
    toolbar.id = 'bcd-toolbar';
    toolbar.className = 'bcd-hidden';
    toolbar.innerHTML = `
        <i id="bcd-selectall-btn"   class="fa-solid fa-check-double menu_button" title="Select all visible"></i>
        <i id="bcd-deselectall-btn" class="fa-solid fa-square menu_button"       title="Deselect all"></i>
        <span id="bcd-selected-count"></span>
        <label id="bcd-wb-label" title="Also delete the primary worldbook bound to each selected character">
            <input type="checkbox" id="bcd-worldbook-check">
            <span>Delete worldbooks</span>
        </label>
        <i id="bcd-delete-btn" class="fa-solid fa-trash menu_button" title="Delete selected" disabled></i>
        <i id="bcd-cancel-btn" class="fa-solid fa-xmark menu_button" title="Cancel"></i>
    `;

    const fixedTop = charBlock.querySelector('#charListFixedTop');
    if (fixedTop && fixedTop.nextSibling) {
        charBlock.insertBefore(toolbar, fixedTop.nextSibling);
    } else {
        charBlock.appendChild(toolbar);
    }

    // Toolbar event listeners
    document.getElementById('bcd-selectall-btn').addEventListener('click', selectAll);
    document.getElementById('bcd-deselectall-btn').addEventListener('click', deselectAll);
    document.getElementById('bcd-delete-btn').addEventListener('click', confirmAndDelete);
    document.getElementById('bcd-cancel-btn').addEventListener('click', exitBatchMode);
}

// ── Re-bind after pagination / filter ─────────────────────────────────────────
// SillyTavern re-renders the character list on search/tag/page changes.
// We observe #rm_print_characters_block for DOM mutations and re-attach listeners.

function observeCharacterList() {
    const target = document.getElementById('rm_print_characters_block');
    if (!target) return;

    const observer = new MutationObserver(() => {
        if (!batchModeActive) return;
        // Re-attach click handlers to newly rendered cards
        bindCardClicks(true);
        // Re-apply highlights for already-selected chids
        selectedChids.forEach(chid => toggleCardHighlight(chid, true));
    });

    observer.observe(target, { childList: true, subtree: true });
}

// ── Entry Point ────────────────────────────────────────────────────────────────

jQuery(async () => {
    // Wait a tick for ST to finish its own DOM setup
    await new Promise(r => setTimeout(r, 500));

    injectUI();
    observeCharacterList();

    console.log('[Batch Character Deleter] Loaded ✓');
});
