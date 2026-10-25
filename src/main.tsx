/**
 * 学習メモ: Reactアプリの起動点。ブラウザ開発時のTauriモックを初期化し、AppをDOMへマウントする。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { initializeTauriMocks } from "./mockTauri";

// Enable Tauri mock server in plain browser environment for testing and preview
if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
    initializeTauriMocks();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
