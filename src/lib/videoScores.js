// Interactive YouTube question scores (Google Classroom "Class insights") → SmartGrader grades.
// Google never puts these scores into the Classroom grade and the API doesn't expose them, so the
// teacher copies the Class insights list (Ctrl+A, Ctrl+C) and pastes it into SmartGrader.
// The copied HTML keeps each score as aria-label="5 out of 12" next to the student's name.

const SCORE_RE = /(\d+)\s*out of\s*(\d+)/i;

// From the clipboard's HTML (best — the plain text copy drops the numbers).
export function parseInsightsHtml(html) {
    if (!html || typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = [];
    for (const tr of doc.querySelectorAll("tr")) {
        const scoreEl = [...tr.querySelectorAll("[aria-label]")].find((e) => SCORE_RE.test(e.getAttribute("aria-label")));
        if (!scoreEl) continue;
        const [, c, t] = scoreEl.getAttribute("aria-label").match(SCORE_RE);
        const cells = [...tr.querySelectorAll("td,th")];
        const nameCell = cells.find((td) => !td.contains(scoreEl) && /[A-Za-z]/.test(td.textContent));
        const name = (nameCell?.textContent || "").replace(/\s+/g, " ").trim();
        if (name && Number(t) > 0) rows.push([name, Number(c), Number(t)]);
    }
    return rows;
}

// From plain text, in case the numbers did come through ("Name  5 / 12").
export function parseInsightsText(text) {
    const rows = [];
    const re = /(?:^|\n)\s*([^\n\t\d][^\n\t]*?)\s*[\n\t]\s*(\d+)\s*\/\s*(\d+)/g;
    let m;
    while ((m = re.exec(String(text || "")))) {
        const name = m[1].trim();
        if (!/^(score|students|all students|problem \d+)$/i.test(name)) rows.push([name, Number(m[2]), Number(m[3])]);
    }
    return rows;
}

export const scaled = (correct, total, maxPoints) => Math.round((correct / total) * (maxPoints || 100));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

// Match pasted names to the assignment's students (Classroom full names).
export function matchToSubmissions(rows, submissions, similarity) {
    const people = submissions.map((s) => ({ sub: s, full: s.studentProfile?.name?.fullName || "" }));
    return rows.map(([name, correct, total]) => {
        let hit = people.find((p) => norm(p.full) === norm(name));
        if (!hit && similarity && people.length) {
            const best = similarity.findBestMatch(name.toLowerCase(), people.map((p) => p.full.toLowerCase())).bestMatch;
            if (best.rating > 0.7) hit = people.find((p) => p.full.toLowerCase() === best.target);
        }
        return { name, correct, total, sub: hit?.sub || null };
    });
}
