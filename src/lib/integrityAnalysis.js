// ---------------------------------------------------------------------------
// SmartGrader Integrity Check
//
// Pure functions (no network, no React) that turn file history + text into
// plain-English "look into this" flags. They NEVER change a grade.
//
//   Severity:  "high"   – strong sign of copying/pasting (red 🚩)
//              "medium" – worth a look (amber 🚩)
//              "low"    – information only (shown in the panel, no badge)
// ---------------------------------------------------------------------------

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const TYPED_TYPES = [GOOGLE_DOC, GOOGLE_SLIDES];

// Tunables (kept in one place so they're easy to adjust later)
export const INTEGRITY_SETTINGS = {
    minWordsForTimingChecks: 100,   // ignore tiny docs
    fewVersionsMax: 3,              // ≤ this many saved versions on a long doc = suspicious
    fastMinutes: 3,                 // all text added within this many minutes = suspicious
    fastMinWords: 150,
    maxRealisticWpm: 70,            // typical HS typing is 30–45 wpm
    sessionGapMinutes: 20,          // gaps longer than this split editing sessions
    createdBeforeTurnInMinutes: 10, // "file created X min before turn-in"
    lensBreaksMin: 3,               // mid-sentence line breaks needed to flag
    sameTextMedian: 0.3,            // class median wording overlap above this = "everyone types the same text"
    freeTextMatch: 0.5,             // free-response assignments: wording overlap to flag (0.75+ = strong)
    sharedMistakesMinCount: 3,
    sharedMistakesMinScore: 2.5,
    sharedMistakesHighScore: 5,
    minClassSizeForMistakes: 5,
};

const S = INTEGRITY_SETTINGS;

const lc = (v) => (v || "").trim().toLowerCase();

export function countWords(text) {
    if (!text) return 0;
    return (text.match(/[A-Za-z0-9À-ɏ']+/g) || []).length;
}

/**
 * Google Lens copies text line-by-line from the picture, so pasted text keeps
 * hard line breaks wherever the picture's lines ended — usually mid-sentence.
 * Typed text only breaks at the end of paragraphs.
 */
export function findLensLineBreaks(text) {
    if (!text) return { count: 0, examples: [] };
    const lines = text.replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let count = 0;
    const examples = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const a = lines[i];
        const b = lines[i + 1];
        if (a.length < 15) continue; // skip titles / short labels
        const hyphenSplit = /[A-Za-z]-$/.test(a) && /^[a-z]/.test(b);
        const midSentence = /[A-Za-z,]$/.test(a) && /^[a-z]/.test(b);
        if (hyphenSplit || midSentence) {
            count++;
            if (examples.length < 3) {
                examples.push(`…${a.slice(-28)} ⏎ ${b.slice(0, 28)}…`);
            }
        }
    }
    return { count, examples };
}

/** Summary stats about a file's text, computed on the server so we don't ship the text twice. */
export function textStats(text) {
    return { words: countWords(text), lensBreaks: findLensLineBreaks(text) };
}

function minutesBetween(a, b) {
    return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

function fmtMinutes(m) {
    if (m < 1) return "under a minute";
    if (m < 1.5) return "about 1 minute";
    if (m < 90) return `about ${Math.round(m)} minutes`;
    return `about ${Math.round(m / 60 * 10) / 10} hours`;
}

/** Estimate active editing time from saved-version timestamps. */
export function estimateEditing(revisions) {
    const times = (revisions || [])
        .map(r => new Date(r.time).getTime())
        .filter(t => !Number.isNaN(t))
        .sort((a, b) => a - b);
    if (times.length === 0) return { versions: 0, activeMinutes: 0, sessions: 0 };
    let active = 0;
    let sessions = 1;
    for (let i = 1; i < times.length; i++) {
        const gap = (times[i] - times[i - 1]) / 60000;
        if (gap <= S.sessionGapMinutes) active += gap;
        else sessions++;
    }
    // Give every session a little time — a single save still means *some* editing.
    active += sessions * 0.5;
    return { versions: times.length, activeMinutes: active, sessions };
}

/**
 * Flags for ONE student's submission, from its file history.
 *
 * @param {object} args
 * @param {object} args.integrity   – `integrity` object returned by the submission API
 * @param {object} args.student     – { subId, email, name }
 * @param {Array}  args.roster      – [{ subId, email, name }] for everyone in the class
 */
export function analyzeSubmissionIntegrity({ integrity, student, roster = [] }) {
    const flags = [];
    if (!integrity || !Array.isArray(integrity.files)) return flags;

    const viewer = lc(integrity.viewerEmail);
    const meEmail = lc(student?.email);
    const meName = lc(student?.name);
    const byEmail = new Map();
    const byName = new Map();
    for (const r of roster) {
        if (r.subId === student?.subId) continue;
        if (r.email) byEmail.set(lc(r.email), r);
        if (r.name) byName.set(lc(r.name), r);
    }
    const findClassmate = (email, name) =>
        (email && byEmail.get(lc(email))) || (!email && name && byName.get(lc(name))) || null;
    const isMe = (email, name) =>
        (email && meEmail && lc(email) === meEmail) || (!email && name && meName && lc(name) === meName);

    const multiFile = integrity.files.length > 1;

    for (const file of integrity.files) {
        const tag = multiFile ? ` (${file.title || "file"})` : "";
        const base = { fileId: file.fileId, fileTitle: file.title };
        const words = file.stats?.words ?? null;
        const typed = TYPED_TYPES.includes(file.mimeType);

        // 1. Who owns the file?
        for (const owner of file.owners || []) {
            if (!owner.email || isMe(owner.email, owner.name) || lc(owner.email) === viewer) continue;
            const mate = findClassmate(owner.email, owner.name);
            if (mate) {
                flags.push({
                    ...base, id: `owner-${file.fileId}`, severity: "high", matchSubId: mate.subId,
                    title: `File belongs to {student}${tag}`,
                    detail: `The turned-in file is owned by {student}, not by this student. They may have turned in a friend's file.`,
                });
            } else {
                flags.push({
                    ...base, id: `owner-${file.fileId}`, severity: "medium",
                    title: `File is owned by someone else${tag}`,
                    detail: `Owner: ${owner.email}. Normally the student owns their own file.`,
                    ownerEmail: owner.email,
                });
            }
        }

        // 2. Did someone else type in it?
        const otherEditors = new Map();
        for (const rev of file.revisions || []) {
            if (isMe(rev.email, rev.name)) continue;
            if (rev.email && lc(rev.email) === viewer) continue;
            const mate = findClassmate(rev.email, rev.name);
            const key = mate ? `sub:${mate.subId}` : (rev.email ? `email:${lc(rev.email)}` : null);
            if (!key) continue;
            const prev = otherEditors.get(key) || { mate, email: rev.email, count: 0 };
            prev.count++;
            otherEditors.set(key, prev);
        }
        for (const [key, ed] of otherEditors) {
            if (ed.mate) {
                flags.push({
                    ...base, id: `editor-${file.fileId}-${key}`, severity: "high", matchSubId: ed.mate.subId,
                    title: `{student} edited this file${tag}`,
                    detail: `{student} saved ${ed.count} version${ed.count === 1 ? "" : "s"} of this file.`,
                });
            } else {
                flags.push({
                    ...base, id: `editor-${file.fileId}-${key}`, severity: "low",
                    title: `Edited by someone outside the class${tag}`,
                    detail: `${ed.email} saved ${ed.count} version${ed.count === 1 ? "" : "s"} (could be a co-teacher or aide).`,
                });
            }
        }

        // 3. Timing & version history (typed Google Docs/Slides only)
        if (!typed) {
            if (words !== null && words >= S.minWordsForTimingChecks) {
                flags.push({
                    ...base, id: `upload-${file.fileId}`, severity: "low",
                    title: `Uploaded file — no typing history${tag}`,
                    detail: "This isn't a Google Doc, so SmartGrader can't see how it was written.",
                });
            }
        } else if (words !== null && words >= S.minWordsForTimingChecks && Array.isArray(file.revisions)) {
            const { versions, activeMinutes } = estimateEditing(file.revisions);
            const wpm = words / Math.max(activeMinutes, 1);

            let timingFlagged = false;
            if (versions > 0 && words >= S.fastMinWords && activeMinutes <= S.fastMinutes) {
                flags.push({
                    ...base, id: `fast-${file.fileId}`, severity: "high",
                    title: `${words} words appeared in ${fmtMinutes(activeMinutes)}${tag}`,
                    detail: `Google's history shows almost no time spent typing. This is what copy-and-paste looks like.`,
                });
                timingFlagged = true;
            } else if (versions > 0 && wpm > S.maxRealisticWpm) {
                flags.push({
                    ...base, id: `fast-${file.fileId}`, severity: versions <= 6 ? "high" : "medium",
                    title: `About ${Math.round(wpm)} words per minute${tag}`,
                    detail: `${words} words in ${fmtMinutes(activeMinutes)} of editing. Most high-school students type 30–45 words per minute.`,
                });
                timingFlagged = true;
            }

            if (versions > 0 && versions <= S.fewVersionsMax) {
                flags.push({
                    ...base, id: `versions-${file.fileId}`, severity: versions === 1 || timingFlagged ? "high" : "medium",
                    title: `Only ${versions} saved version${versions === 1 ? "" : "s"} for ${words} words${tag}`,
                    detail: `Typed work leaves a long trail of saved versions. A short history means the text arrived in one or two big chunks.`,
                });
            }

            if (file.createdTime && integrity.turnedInAt) {
                const mins = (new Date(integrity.turnedInAt) - new Date(file.createdTime)) / 60000;
                if (mins >= 0 && mins < S.createdBeforeTurnInMinutes) {
                    flags.push({
                        ...base, id: `created-${file.fileId}`, severity: "medium",
                        title: `File created ${fmtMinutes(mins)} before it was turned in${tag}`,
                        detail: `Not enough time to type ${words} words. Often a sign of "Make a copy" on someone else's file.`,
                    });
                }
            }
        }

        // 4. Google Lens leftovers
        const lens = file.stats?.lensBreaks;
        if (lens && lens.count >= S.lensBreaksMin) {
            flags.push({
                ...base, id: `lens-${file.fileId}`, severity: "medium",
                title: `${lens.count} lines break in the middle of a sentence${tag}`,
                detail: `Google Lens keeps the picture's line breaks when text is copied. Typed work only breaks at the end of a paragraph.`,
                examples: lens.examples,
            });
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Class-wide checks: shared mistakes, near-identical text, identical images
// ---------------------------------------------------------------------------

const tokenize = (text) => (text.toLowerCase().match(/[a-z0-9À-ɏ']+/g) || []);

function median(nums) {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {Array} entries – [{ subId, text, imageFingerprints: string[] }]
 * @returns {{ mode: "same-text"|"free-text"|"too-few", flags: { [subId]: Flag[] } }}
 */
export function analyzeClassIntegrity(entries) {
    const flags = {};
    const add = (subId, flag) => { (flags[subId] = flags[subId] || []).push(flag); };

    // --- Identical screenshots / image files ---
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const a = entries[i].imageFingerprints || [];
            const b = entries[j].imageFingerprints || [];
            if (a.length && b.length && a.some(fp => b.includes(fp))) {
                const detail = "An attached image is byte-for-byte identical — the same screenshot or file was shared.";
                add(entries[i].subId, { id: `img-${entries[j].subId}`, severity: "high", matchSubId: entries[j].subId, title: "Same image file as {student}", detail });
                add(entries[j].subId, { id: `img-${entries[i].subId}`, severity: "high", matchSubId: entries[i].subId, title: "Same image file as {student}", detail });
            }
        }
    }

    // --- Text checks ---
    const docs = entries
        .filter(e => e.text && countWords(e.text) >= 30)
        .map(e => ({ subId: e.subId, text: e.text, tokens: tokenize(e.text) }));

    if (docs.length < 3) return { mode: "too-few", flags };

    // How alike is the class overall? Typing-from-a-picture assignments are all
    // ~90% alike, so a plain "% match" is useless there.
    // Wording overlap = share of 3-word phrases two students have in common.
    // Different essays share ~0–5%; typing the same picture shares 60–95%.
    for (const d of docs) {
        d.shingles = new Set();
        for (let k = 0; k < d.tokens.length - 2; k++) d.shingles.add(`${d.tokens[k]} ${d.tokens[k + 1]} ${d.tokens[k + 2]}`);
    }
    const jaccard = (a, b) => {
        if (a.size === 0 || b.size === 0) return 0;
        const [small, big] = a.size < b.size ? [a, b] : [b, a];
        let inter = 0;
        for (const x of small) if (big.has(x)) inter++;
        return inter / (a.size + b.size - inter);
    };
    const sims = [];
    const simOf = new Map();
    for (let i = 0; i < docs.length; i++) {
        for (let j = i + 1; j < docs.length; j++) {
            const s = jaccard(docs[i].shingles, docs[j].shingles);
            sims.push(s);
            simOf.set(`${i}|${j}`, s);
        }
    }
    const classMedian = median(sims);
    const mode = classMedian >= S.sameTextMedian ? "same-text" : "free-text";

    if (mode === "free-text") {
        // Open-ended work: a very high match really does mean copying.
        for (let i = 0; i < docs.length; i++) {
            for (let j = i + 1; j < docs.length; j++) {
                const s = simOf.get(`${i}|${j}`);
                if (s >= S.freeTextMatch) {
                    const pct = Math.round(s * 100);
                    const sev = s >= 0.75 ? "high" : "medium";
                    const detail = `${pct}% of their wording is the same. For this assignment, most students' wording overlaps only about ${Math.round(classMedian * 100)}%.`;
                    add(docs[i].subId, { id: `sim-${docs[j].subId}`, severity: sev, matchSubId: docs[j].subId, title: `${pct}% same wording as {student}`, detail, score: pct });
                    add(docs[j].subId, { id: `sim-${docs[i].subId}`, severity: sev, matchSubId: docs[i].subId, title: `${pct}% same wording as {student}`, detail, score: pct });
                }
            }
        }
    }

    // --- Shared mistakes ---
    // Find words (and word pairs) that only a few students have. In a
    // "type what's in the picture" assignment those are mistakes; when two
    // students share several of the SAME unusual mistakes, one copied the other.
    if (docs.length >= S.minClassSizeForMistakes) {
        const n = docs.length;
        const rareMax = Math.max(2, Math.floor(n * 0.15));     // "only a couple of students have this"
        const minorityMax = Math.max(rareMax, Math.floor(n / 3)); // "most of the class did NOT do this"

        const wordDf = new Map();
        for (const d of docs) {
            d.wordSet = new Set(d.tokens);
            for (const w of d.wordSet) wordDf.set(w, (wordDf.get(w) || 0) + 1);
        }

        const bigramDf = new Map();
        for (const d of docs) {
            d.bigramSet = new Set();
            for (let k = 0; k < d.tokens.length - 1; k++) {
                const a = d.tokens[k], b = d.tokens[k + 1];
                // Only pairs of *common* words — catches skipped/doubled/swapped words.
                if ((wordDf.get(a) || 0) > minorityMax && (wordDf.get(b) || 0) > minorityMax) d.bigramSet.add(`${a} ${b}`);
            }
            for (const bg of d.bigramSet) bigramDf.set(bg, (bigramDf.get(bg) || 0) + 1);
        }

        // Each student's "deviations": things most of the class did differently.
        // In free-text work, unusual words are normal, so only word pairs count there.
        docs.forEach(d => {
            d.devs = new Map(); // token -> df
            if (mode === "same-text") {
                for (const w of d.wordSet) { const df = wordDf.get(w); if (df <= minorityMax) d.devs.set(w, df); }
            }
            for (const bg of d.bigramSet) { const df = bigramDf.get(bg); if (df <= minorityMax) d.devs.set(bg, df); }
        });

        const index = new Map(); // token -> [docIdx] (only tokens shared by 2+ students)
        docs.forEach((d, idx) => {
            for (const [tok, df] of d.devs) {
                if (df >= 2) (index.get(tok) || index.set(tok, []).get(tok)).push(idx);
            }
        });

        const pairs = new Map(); // "i|j" -> { score, items }
        for (const [token, idxs] of index) {
            const df = idxs.length;
            for (let a = 0; a < idxs.length; a++) {
                for (let b = a + 1; b < idxs.length; b++) {
                    const key = `${idxs[a]}|${idxs[b]}`;
                    const p = pairs.get(key) || { score: 0, items: [] };
                    if (df <= rareMax) p.score += 1 / (df - 1);
                    p.items.push({ token, df });
                    pairs.set(key, p);
                }
            }
        }

        const scoreBar = mode === "same-text" ? S.sharedMistakesMinScore : S.sharedMistakesMinScore * 2;
        for (const [key, p] of pairs) {
            const [i, j] = key.split("|").map(Number);
            const shared = p.items.length;
            const exclusive = p.items.filter(x => x.df === 2).length;
            // How much of the smaller student's set of mistakes is shared with the other?
            const overlap = shared / Math.max(1, Math.min(docs[i].devs.size, docs[j].devs.size));

            const byScore = shared >= S.sharedMistakesMinCount && p.score >= scoreBar && overlap >= 0.4;
            const byOverlap = exclusive >= 2 && overlap >= 0.6;
            if (!byScore && !byOverlap) continue;

            const severity = (p.score >= S.sharedMistakesHighScore || (overlap >= 0.7 && exclusive >= 2 && shared >= 3)) ? "high" : "medium";
            // Most telling examples first: ones ONLY these two students have.
            const examples = [...p.items].sort((x, y) => x.df - y.df).slice(0, 6).map(x => x.token);
            const detail = mode === "same-text"
                ? `${exclusive > 0 ? `${exclusive} of these appear in nobody else's work. ` : ""}The rest of the class typed these parts correctly or differently — matching mistakes usually mean a shared file.`
                : `These unusual word combinations appear in only these students' work.`;
            const mk = (other) => ({
                id: `mistakes-${docs[other].subId}`, severity, matchSubId: docs[other].subId,
                title: `Shares ${shared} unusual mistake${shared === 1 ? "" : "s"} with {student}`,
                detail, examples, score: Math.round(p.score * 10) / 10, count: shared, overlap: Math.round(overlap * 100) / 100,
            });
            add(docs[i].subId, mk(j));
            add(docs[j].subId, mk(i));
        }
    }

    return { mode, flags, classMedian };
}

/** Replace the {student} placeholder with a display name. */
export function fillStudent(text, flag, nameFor) {
    if (!text || !text.includes("{student}")) return text;
    const name = flag?.matchSubId && nameFor ? nameFor(flag.matchSubId) : "another student";
    return text.split("{student}").join(name);
}

/** Highest severity in a list of flags (ignores "low"). */
export function topSeverity(flags) {
    if (!flags || flags.length === 0) return null;
    if (flags.some(f => f.severity === "high")) return "high";
    if (flags.some(f => f.severity === "medium")) return "medium";
    return "low";
}
