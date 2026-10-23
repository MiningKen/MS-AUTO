# KeyPulse

KeyPulse 是一個 Windows 與 macOS 的本機鍵盤連點工具。它可讓多個單鍵或組合鍵以各自的間隔重複送到目前取得焦點的視窗。

## 功能

- 每個任務可設定名稱、單鍵／組合鍵、間隔與啟用狀態
- 多個任務可同時運作；最小間隔是 0.1 秒
- `F12` 啟動／停止所有任務，`Esc` 緊急停止
- 本機保存設定；不建立帳號、不使用網路服務
- 關閉視窗後駐留在系統匣／選單列，可從選單重新開啟或結束
- macOS 會使用系統的「輔助使用」權限來送出鍵盤事件

## 開發

先安裝 Node.js 20+、Rust 1.90+，並依 [Tauri 的 Windows 或 macOS 前置需求](https://v2.tauri.app/start/prerequisites/) 完成系統設定。

```powershell
npm install
npm run lint
npm test
npm run build
npm run tauri dev
```

`npm run tauri build` 會產生平台安裝包。macOS 正式發行前必須以 Apple Developer 憑證簽署並公證；Windows 正式發行建議使用程式碼簽署憑證。

## 使用

1. 新增任務，點選「要連點的按鍵」欄位後直接按下想設定的按鍵或組合鍵。這個步驟只會讀取按鍵，不會錄影。
2. 設定每個任務的間隔秒數，並啟用要執行的項目。
3. 將游標焦點放在目標視窗，再按 F12 啟動。Mac 上若 F12 是媒體鍵，請按 `Fn+F12`。
4. 需要立即停止時按 Esc。

按鍵一律送到目前的焦點視窗。請只用於你有權自動化的桌面工作流程，並遵守目標服務的規則。
