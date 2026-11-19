// Turns a spreadsheet (Google Sheet exported as .xlsx, or an uploaded .xlsx) into plain text the AI can
// grade reliably: every filled-in cell with its address, plus each formula and its result.
// (We used to send Google Sheets to the AI as a PDF picture. Sparse sheets came out looking blank,
// so the AI treated them as "no work" and gave 0.)
import ExcelJS from "exceljs";
import JSZip from "jszip";

const MAX_CHARS = 40000;

function cellText(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
        if (v.richText) return v.richText.map((t) => t.text).join("");
        if (v.text !== undefined) return String(v.text);           // hyperlink
        if (v.error) return String(v.error);
        if (v.formula || v.sharedFormula) return cellText(v.result);
        if (v.result !== undefined) return cellText(v.result);
        return "";
    }
    return String(v);
}

const decode = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const texts = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => decode(m[1]));

// Text boxes, shapes and charts live in the .xlsx zip, not in cells. Students often answer questions in a
// text box and make a chart, so read those too.
async function extrasFromZip(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const boxes = [];
    const charts = [];
    for (const name of Object.keys(zip.files).sort()) {
        if (/^xl\/drawings\/drawing\d+\.xml$/.test(name)) {
            const xml = await zip.file(name).async("string");
            // each shape's paragraphs → one text box
            for (const sp of xml.match(/<xdr:sp[\s>][\s\S]*?<\/xdr:sp>/g) || []) {
                const paras = (sp.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[\s\S]*?<\/a:p>/g) || []).map((p) => texts(p, "a:t").join("")).filter((x) => x.trim());
                if (paras.length) boxes.push(paras.join("\n"));
            }
        }
        if (/^xl\/charts\/chart\d+\.xml$/.test(name)) {
            const xml = await zip.file(name).async("string");
            const types = [...new Set([...xml.matchAll(/<c:(\w+)Chart>/g)].map((m) => m[1]))].filter((t) => !/^(plot|view3D)$/.test(t));
            const titleXml = (xml.match(/<c:title>[\s\S]*?<\/c:title>/) || [""])[0];
            const title = texts(titleXml, "a:t").join("").trim();
            const refs = [...new Set(texts(xml, "c:f"))];
            const axisTitles = (xml.match(/<c:(?:catAx|valAx|dateAx)>[\s\S]*?<\/c:(?:catAx|valAx|dateAx)>/g) || [])
                .map((ax) => texts((ax.match(/<c:title>[\s\S]*?<\/c:title>/) || [""])[0], "a:t").join("").trim()).filter(Boolean);
            charts.push(`${types.join("/") || "unknown"} chart${title ? ` titled "${title}"` : " (no title)"}${axisTitles.length ? `, axis titles: ${axisTitles.map((a) => `"${a}"`).join(", ")}` : ""}${refs.length ? `, data from ${refs.join(", ")}` : ""}`);
        }
    }
    return { boxes, charts };
}

export async function workbookToText(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out = [];
    let filled = 0;
    wb.eachSheet((ws) => {
        const lines = [];
        const formulas = [];
        ws.eachRow({ includeEmpty: false }, (row, r) => {
            const cells = [];
            row.eachCell({ includeEmpty: false }, (cell) => {
                const text = cellText(cell.value).trim();
                const f = cell.formula || (cell.value && typeof cell.value === "object" && (cell.value.formula || cell.value.sharedFormula));
                if (!text && !f) return;
                filled++;
                cells.push(`${cell.address}=${text === "" ? '""' : JSON.stringify(text)}`);
                if (f) formulas.push(`${cell.address}: =${typeof f === "string" ? f : cell.formula} → ${text || "(blank)"}`);
            });
            if (cells.length) lines.push(`Row ${r}: ${cells.join(" | ")}`);
        });
        out.push(`=== Sheet "${ws.name}" ===`);
        out.push(lines.length ? lines.join("\n") : "(this sheet is empty)");
        if (formulas.length) out.push(`Formulas on "${ws.name}":\n${formulas.join("\n")}`);
    });
    let extras = { boxes: [], charts: [] };
    try { extras = await extrasFromZip(buffer); } catch { /* not critical */ }
    if (extras.boxes.length) out.push(`=== Text boxes / shapes (${extras.boxes.length}) ===\n` + extras.boxes.map((b, i) => `[Text box ${i + 1}]\n${b}`).join("\n\n"));
    out.push(extras.charts.length ? `=== Charts (${extras.charts.length}) ===\n` + extras.charts.map((c, i) => `Chart ${i + 1}: ${c}`).join("\n") : "=== Charts ===\n(no charts in this spreadsheet)");
    let text = `[Spreadsheet contents: each filled-in cell is listed as Address="value". ${filled} filled cells, ${extras.boxes.length} text box(es), ${extras.charts.length} chart(s).]\n` + out.join("\n\n");
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + "\n[...cut off — spreadsheet too large]";
    return { text, filled, boxes: extras.boxes.length, charts: extras.charts.length };
}
