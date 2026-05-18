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

  function isUnitSheetFormat(rows) {
    if (!rows.length) return false;
    if (/第幾單元/.test(cell(rows[0], 0))) return true;
    for (let i = 1; i < Math.min(rows.length, 8); i++) {
      const unit = cell(rows[i], 0);
      const similar = cell(rows[i], 1);
      if (unit && similar && /^-?\d+(\.\d+)?$/.test(unit) && similar.split(/\s+/).filter(Boolean).length >= 2) {
        return true;
      }
    }
    return false;
  }

  /** @returns {{ unit?: string, similarChars: string[], words: string[] }[]} */
  function parseLegacyTypoRows(rows) {
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

  /** A=第幾單元, B=相似字形, C+=語詞 */
  function parseUnitTypoRows(rows) {
    const out = [];
    let start = 0;
    if (rows.length && /第幾單元/.test(cell(rows[0], 0))) start = 1;

    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      const unit = cell(row, 0);
      const similarRaw = cell(row, 1);
      if (!unit || !similarRaw) continue;

      const similarChars = similarRaw.split(/\s+/).filter(Boolean);
      const words = [];
      for (let j = 2; j < row.length; j++) {
        const w = cell(row, j);
        if (!w || /^語詞$/i.test(w) || /^相似字形$/i.test(w)) continue;
        words.push(w);
      }
      if (similarChars.length >= 2 && words.length) {
        out.push({ unit, similarChars, words });
      }
    }
    return out;
  }

  function parseTypoRows(rows) {
    return isUnitSheetFormat(rows) ? parseUnitTypoRows(rows) : parseLegacyTypoRows(rows);
  }

  function listUnits(rows) {
    const units = [];
    const seen = new Set();
    for (const row of rows) {
      if (row.unit == null || row.unit === "") continue;
      const u = String(row.unit);
      if (!seen.has(u)) {
        seen.add(u);
        units.push(u);
      }
    }
    units.sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b), "zh-Hant");
    });
    return units;
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
    parseTypoRows,
    listUnits,
    isUnitSheetFormat
  };
})();
