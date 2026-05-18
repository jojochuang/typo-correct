# 字音字形改錯（Typo Correct）

叢林風格的字音字形練習遊戲，題目由 Google 試算表載入。支援 **初級版**（挖空＋注音選字）與 **進階版**（錯字取代、點錯字後選答案），可嵌入網頁（iframe）。

## 本地預覽

需用本機伺服器開啟（避免字型與試算表 CORS 問題）：

```bash
cd "/Users/jiawu/Documents/GitHub/typo-correct"
python3 -m http.server 8080
```

瀏覽器開啟：

- 遊戲：<http://localhost:8080/index.html>
- 嵌入頁：<http://localhost:8080/embed.html>
- 嵌入示範：<http://localhost:8080/embed-demo.html>

## 試算表格式

試算表須設為「知道連結的任何人可檢視」。

| 欄 | 內容 |
|----|------|
| A | 相似字（空格分隔，至少 2 個） |
| B 起 | 語詞（每格一個；多音字請用 ToneOZ 字型標好） |

預設試算表可在 `assets/js/config.js` 修改，或以網址參數覆寫：

- `sheet_id` — 試算表 ID  
- `gid` — 工作表 gid  
- `embed=1` — 嵌入模式（用於 `embed.html`）  
- `transparent=1` — 透明背景（嵌入時）

範例：`embed.html?sheet_id=YOUR_ID&gid=YOUR_GID&embed=1`

## 專案結構

```
index.html              # 主遊戲
embed.html              # 可 iframe 嵌入
embed-demo.html         # 嵌入示範
assets/
  css/                  # 樣式
  js/
    config.js           # 試算表設定
    sheet-fetcher.js    # 讀取試算表 CSV
    typo-game-page.js   # 遊戲邏輯
  fonts/                # ToneOZ、BpmfZihiOnly 字型
  img/                  # 叢林底圖、木牌圖
  sounds/               # 答對／答錯音效
```

## 字型授權

- `ToneOZ-Tsuipita-TC.woff2` — 請遵循 [ToneOZ](https://toneoz.com/) 授權條款（由 ttf 轉為 woff2，約 12MB，可一般上傳 GitHub）。
- `BpmfZihiOnly-R.ttf` — 注音顯示用字型，請確認原字型授權後再散佈。

## 上傳 GitHub

```bash
cd "/Users/jiawu/Documents/GitHub/typo-correct"
git init
git add .
git commit -m "Initial commit: 字音字形改錯叢林遊戲"
# gh repo create ... 後再 git push
```
