// ---------------------------------------------------------------------------
// SmartGrader Trap Words
//
// The teacher hides small gray "trap words" (walrus, pancake, volcano…) in a
// test sheet and tells students to skip them. Students who type the sheet
// leave them out; students who copy it with Google Lens paste them in.
//
//   0 trap words      → nothing
//   1 trap word       → amber warning flag, no grade change
//   2+ trap words     → red flag and the grade becomes 0 (teacher can still
//                       change it before returning)
// Pure functions — no network, no React.
// ---------------------------------------------------------------------------

export const TRAP_FAIL_MIN = 2;

/** "walrus, pancake\nvolcano" → ["walrus", "pancake", "volcano"] */
export function parseTrapWords(input) {
    if (!input) return [];
    const seen = new Set();
    for (const raw of String(input).split(/[,;\n\r\t]+|\s+/)) {
        const w = raw.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
        if (w.length >= 2) seen.add(w);
    }
    return [...seen];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Which trap words appear in the text (whole word, any capitalization, plurals count). */
export function findTrapWords(text, trapWords) {
    if (!text || !trapWords || trapWords.length === 0) return [];
    const hay = String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return trapWords.filter(w => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}(s|es)?(?=[^a-z0-9]|$)`).test(hay));
}

/** Integrity flag in the same shape as integrityAnalysis.js flags (or null). */
export function trapWordFlag(found) {
    if (!found || found.length === 0) return null;
    if (found.length >= TRAP_FAIL_MIN) {
        return {
            id: "trap-words",
            type: "trapWords",
            severity: "high",
            examples: found,
            title: `${found.length} trap words found — copied with Google Lens`,
            detail: `The submission contains trap words students were told to skip. Grade set to 0 (you can change it).`,
        };
    }
    return {
        id: "trap-words",
        type: "trapWords",
        severity: "medium",
        examples: found,
        title: "1 trap word found",
        detail: `The submission contains a trap word. One could be a slip — take a look. No grade change.`,
    };
}

/** If 2+ trap words were found, turn a grade result into a 0 with a note. */
export function applyTrapPenalty(result, found) {
    if (!result || !found || found.length < TRAP_FAIL_MIN) return result;
    const list = found.join(", ");
    return {
        ...result,
        grade: "0",
        originalGrade: result.grade,
        trapWords: found,
        feedback: `⚠️ Trap words found (${list}). This report was copied with Google Lens instead of typed, so it receives a 0. (Grade before the trap-word check: ${result.grade}.)\n\n${result.feedback || ""}`.trim(),
    };
}
