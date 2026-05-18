/**
 * 字音字形改錯 — 試算表（須「知道連結的任何人可檢視」）
 * 分單元表：A 第幾單元、B 相似字形、C 起語詞（多音字字型標好）
 *
 * 網址參數：sheet_id、gid、unit、embed=1、transparent=1
 */
window.TypoCorrectConfig = {
  sheetId: "18yl3VhCmGH1bOVsCQF7cCRFAbyi8VkTaQH9vhJ3g9Rw",
  gid: "548356451",
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
  const unit = (sp.get("unit") || "").trim();
  if (unit) cfg.unit = unit;
  if (sp.get("embed") === "1" || /embed\.html$/i.test(window.location.pathname)) {
    cfg.embed = true;
  }
  if (sp.get("transparent") === "1") {
    cfg.transparent = true;
  }
})();
