/**
 * 字音字形改錯 — 試算表（須「知道連結的任何人可檢視」）
 * A 欄：相似字（空格）；B 欄起：語詞（請用多音字字型標好，程式原樣顯示）
 *
 * 網址參數：sheet_id、gid、embed=1、transparent=1
 */
window.TypoCorrectConfig = {
  sheetId: "18yl3VhCmGH1bOVsCQF7cCRFAbyi8VkTaQH9vhJ3g9Rw",
  gid: "1734865438",
  title: "字音字形改錯",
  bookLabel: "美洲一課本",
  embed: false
};

(function applyTypoCorrectParams() {
  const sp = new URLSearchParams(window.location.search);
  const cfg = window.TypoCorrectConfig;
  const sheetId = (sp.get("sheet_id") || sp.get("sheetId") || "").trim();
  const gid = (sp.get("gid") || "").trim();
  if (sheetId) cfg.sheetId = sheetId;
  if (gid) cfg.gid = gid;
  if (sp.get("embed") === "1" || /embed\.html$/i.test(window.location.pathname)) {
    cfg.embed = true;
  }
  if (sp.get("transparent") === "1") {
    cfg.transparent = true;
  }
})();
