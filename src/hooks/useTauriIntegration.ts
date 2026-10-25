/**
 * 学習メモ: Tauriのメニュー、ファイルオープン、キーボード、クリップボードイベントをReactの操作へ接続する。
 * 処理の位置づけ: コンポーネントから呼ばれ、ストア・API・ブラウザ/Tauriイベント間の副作用を整理する。
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../api";
import { useSequenceStore } from "../store/useSequenceStore";
import { useUiStore } from "../store/useUiStore";
import { ask, open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

function isEditableTarget(el: Element | null): el is HTMLElement {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
}

async function pasteTextIntoActiveEditable(): Promise<boolean> {
    const active = document.activeElement;
    if (!isEditableTarget(active)) return false;

    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    const text = await readText();
    if (typeof text !== "string") return true;

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? active.value.length;
        const nextValue = `${active.value.slice(0, start)}${text}${active.value.slice(end)}`;
        // React tracks controlled fields through an instance-level value setter.
        // Use the native setter so the subsequent input event reaches onChange.
        const prototype = active instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (!nativeSetter) return false;
        nativeSetter.call(active, nextValue);
        const caret = start + text.length;
        active.selectionStart = caret;
        active.selectionEnd = caret;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    document.execCommand("insertText", false, text);
    return true;
}

export function useTauriIntegration() {
    useEffect(() => {
        let closeApproved = false;
        const openFileInNewWindow = async () => {
            const selected = await openDialog({
                multiple: true,
                filters: [{
                    name: 'Sequence Files',
                    extensions: ['fasta', 'fa', 'gbk', 'gb', 'dna', 'ab1', 'gp']
                }]
            });
            if (!selected) return;
            await api.openPathsInNewWindow(Array.isArray(selected) ? selected : [selected]);
        };

        const unlistens = [
            listen("menu-new", () => useUiStore.getState().openModal('newSequence')),
            listen("menu-open", () => useSequenceStore.getState().loadFile("")),
            listen("menu-open-new-window", openFileInNewWindow),
            listen("menu-save", () => { void useSequenceStore.getState().saveFile().catch(() => {}); }),
            listen("menu-export-fasta", () => { /* Handled in App */ }),
            listen("menu-export-gbk", () => { /* Handled in App */ }),
            listen("menu-cut", () => {
                useSequenceStore.getState().cutSelection(useUiStore.getState().selection);
            }),
            listen("menu-copy", async () => {
                useSequenceStore.getState().copyToClipboard(useUiStore.getState().selection);
            }),
            listen("menu-copy-aa", async () => {
                useSequenceStore.getState().copyAsAAToClipboard(useUiStore.getState().selection);
            }),
            listen("menu-paste", async () => {
                if (await pasteTextIntoActiveEditable()) return;
                useSequenceStore.getState().handlePaste(useUiStore.getState().selection, null);
            }),
            listen("menu-paste-rc", async () => {
                if (await pasteTextIntoActiveEditable()) return;
                useSequenceStore.getState().handlePaste(useUiStore.getState().selection, null, { isRC: true });
            }),
            listen("menu-delete", () => {
                useSequenceStore.getState().deleteSelection(useUiStore.getState().selection);
            }),
            listen("menu-select-all", () => {
                const current = useSequenceStore.getState().getCurrentSequence();
                if (current) useUiStore.getState().setSelection({ start: 0, end: current.sequence.length });
            }),
            listen("menu-rc", () => useSequenceStore.getState().reverseComplementSelection(useUiStore.getState().selection)),
            listen("menu-undo", () => useSequenceStore.getState().undo()),
            listen("menu-redo", () => useSequenceStore.getState().redo()),
            listen("menu-view", (event) => useUiStore.getState().setActiveTab(event.payload as any)),
            listen("menu-toggle-dark-mode", () => useUiStore.getState().setDarkMode(d => !d)),
            listen("menu-settings", () => useUiStore.getState().openModal('settings')),
            listen("menu-manage-enzymes", () => {
                useUiStore.getState().setManagerInitialTab('sets');
                useUiStore.getState().openModal('enzymeManager');
            }),
            listen("menu-register-enzyme", () => {
                useUiStore.getState().setManagerInitialTab('register');
                useUiStore.getState().openModal('enzymeManager');
            }),
            listen("menu-import-enzymes", () => {
                useUiStore.getState().setManagerInitialTab('library');
                useUiStore.getState().openModal('enzymeManager');
            }),
            listen("menu-about", () => useUiStore.getState().openModal('about')),
            listen("menu-search", () => {
                useUiStore.getState().setSearchVisible(true);
            }),
            listen("menu-register-primer", () => {
                const current = useSequenceStore.getState().getCurrentSequence();
                if (current) {
                    useUiStore.getState().openModal('primer');
                }
            }),
            listen("file-opened", (event) => useSequenceStore.getState().loadFile(event.payload as string)),
            listen<string[]>("sidebar-drag-import-path", (event) => {
                const paths = Array.isArray(event.payload) ? event.payload : [];
                if (paths.length > 0) {
                    useSequenceStore.getState().loadFile(paths);
                }
            }),
            listen<any>("tauri://drag-drop", (event) => {
                const payload = event.payload;
                if (payload && payload.paths && Array.isArray(payload.paths)) {
                    payload.paths.forEach((path: string) => {
                        useSequenceStore.getState().loadFile(path);
                    });
                }
            }),
        ];

        const closeUnlisten = getCurrentWindow().onCloseRequested(async (event) => {
            if (closeApproved) return;
            const store = useSequenceStore.getState();
            const dirtyBeforeEditsFinish = Object.keys(store.dirtySequenceIds).length;
            if (dirtyBeforeEditsFinish === 0 && !store.hasPendingEdits()) return;

            event.preventDefault();
            await store.waitForPendingEdits();
            const dirtyCount = Object.keys(useSequenceStore.getState().dirtySequenceIds).length;
            if (dirtyCount === 0) {
                closeApproved = true;
                await getCurrentWindow().destroy();
                return;
            }
            const shouldClose = await ask(
                `${dirtyCount} sequence${dirtyCount === 1 ? '' : 's'} have unsaved changes. Quit and discard those changes?`,
                { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Discard and Quit', cancelLabel: 'Keep Working' }
            );
            if (shouldClose) {
                closeApproved = true;
                await getCurrentWindow().destroy();
            }
        }).catch(() => () => {});

        // Initial check for pending files (Startup)
        invoke<string[]>('get_pending_files').then(files => {
            files.forEach(path => {
                useSequenceStore.getState().loadFile(path);
            });
        }).catch(console.error);

        return () => {
            unlistens.forEach(u => u.then(fn => fn()));
            void closeUnlisten.then(fn => fn());
        };
    }, []); // Subscribe once on mount
}
