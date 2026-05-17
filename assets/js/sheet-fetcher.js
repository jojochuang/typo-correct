(function () {
  function parseCsv(text) {
    text = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
    const rows = [];
    let cur = "";
    let inQ = false;
    const line = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if ((ch === "," && !inQ) || (ch === "\n" && !inQ)) {
        line.push(cur);
        cur = "";
        if (ch === "\n") {
          rows.push(line.slice());
          line.length = 0;
        }
      } else if (ch === "\r" && !inQ) {
        // skip
      } else {
        cur += ch;
      }
    }
    if (cur || line.length) {
      line.push(cur);
      rows.push(line);
    }
    return rows;
  }

  function cell(row, idx) {
    return ((row[idx] || "") + "").trim();
  }

  /** @returns {{ similarChars: string[], words: string[] }[]} */
  function parseTypoRows(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const a = cell(row, 0);
      if (!a) continue;
      if (/^字音字形$/i.test(a.replace(/\s/g, ""))) continue;

      const similarChars = a.split(/\s+/).filter(Boolean);
      const words = [];
      for (let j = 1; j < row.length; j++) {
        const w = cell(row, j);
        if (!w || /^語詞$/i.test(w)) continue;
        words.push(w);
      }
      if (similarChars.length >= 2 && words.length) {
        out.push({ similarChars, words });
      }
    }
    return out;
  }

  async function fetchTypoRows(sheetId, gid) {
    const url =
      "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(sheetId) +
      "/export?format=csv&gid=" +
      encodeURIComponent(gid) +
      "&_ts=" +
      Date.now();
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(
        "無法載入試算表（HTTP " + resp.status + "）。請確認試算表已設為「知道連結的任何人可檢視」。"
      );
    }
    const text = await resp.text();
    return parseTypoRows(parseCsv(text));
  }

  window.TypoCorrectSheet = {
    fetchTypoRows,
    parseCsv,
    parseTypoRows
  };
})();
