"use client";

// Video Scores → PowerSchool. Receives interactive-YouTube scores from the bookmarklet
// (see src/lib/videoScores.js), matches students, and exports PowerSchool import files.
import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Papa from "papaparse";
import stringSimilarity from "string-similarity";
import { Bookmark, ClipboardPaste, Download, Trash2, Youtube, Upload, Info, ExternalLink } from "lucide-react";
import { BillingShell, Card } from "@/components/BillingShell";
import { BOOKMARKLET, MESSAGE_TYPE, idsFromClassroomUrl, validPayload, splitName, scaled, toCsv, powerSchoolCsv, parseRosterTemplate } from "@/lib/videoScores";

const STORE = "sg_video_imports";
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* private mode */ } };
const rosterKey = (courseId) => `roster_map_${courseId}`;
const getRoster = (courseId) => { try { return JSON.parse(localStorage.getItem(rosterKey(courseId)) || "null"); } catch { return null; } };

function download(name, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[\\/:*?"<>|]+/g, "-");
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const isoDue = (d) => d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : new Date().toISOString().slice(0, 10);

export default function VideoScoresPage() {
    const { status } = useSession();
    const [imports, setImports] = useState([]);
    const [notice, setNotice] = useState(null);
    const [skipZeros, setSkipZeros] = useState(true);
    const [rosterVersion, setRosterVersion] = useState(0);
    const linkRef = useRef(null);
    const fileRefs = useRef({});

    useEffect(() => { setImports(load()); }, []);

    // React won't render javascript: links, so set the bookmarklet href directly on the element.
    useEffect(() => { if (linkRef.current) linkRef.current.setAttribute("href", BOOKMARKLET); });

    // Look up assignment details (title, points, due date, course name, student names) from Classroom.
    const enrich = async (imp) => {
        if (!imp.courseId || !imp.courseWorkId) return imp;
        try {
            const res = await fetch(`/api/courses/${imp.courseId}/assignments/${imp.courseWorkId}/submissions`, { cache: "no-store" });
            if (!res.ok) return imp;
            const json = await res.json();
            const d = json.assignmentDetails || {};
            const people = (json.submissions || []).map((s) => s.studentProfile?.name).filter(Boolean)
                .map((n) => ({ full: n.fullName, given: n.givenName, family: n.familyName }));
            return { ...imp, assignment: d.title || imp.assignment, maxPoints: d.maxPoints || 100, dueDate: isoDue(d.dueDate), courseName: d.courseName || imp.courseName, people };
        } catch { return imp; }
    };

    const addImport = async (p, how) => {
        if (!validPayload(p)) { setNotice({ ok: false, text: "That didn't look like video scores from Classroom." }); return; }
        const ids = idsFromClassroomUrl(p.url);
        let imp = { id: `${ids.courseWorkId || p.assignment}-${p.video}`, ...ids, assignment: p.assignment, video: p.video, rows: p.rows, at: p.at || new Date().toISOString(), maxPoints: 100 };
        imp = await enrich(imp);
        setImports((cur) => {
            const next = [imp, ...cur.filter((x) => x.id !== imp.id)];
            save(next);
            return next;
        });
        setNotice({ ok: true, text: `${how}: ${p.rows.length} scores for "${imp.assignment}"${p.video ? ` (${p.video})` : ""}.` });
    };

    // Scores sent by the bookmarklet from the Classroom tab.
    useEffect(() => {
        const onMsg = (e) => {
            if (e.origin !== "https://classroom.google.com" || e.data?.type !== MESSAGE_TYPE) return;
            try { e.source?.postMessage("sg-video-ack", e.origin); } catch { /* ignore */ }
            addImport(e.data.payload, "Received from Classroom");
        };
        window.addEventListener("message", onMsg);
        return () => window.removeEventListener("message", onMsg);
    }, []);

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            addImport(JSON.parse(text), "Pasted");
        } catch { setNotice({ ok: false, text: "Nothing to paste. Click the bookmark on the Class insights page first." }); }
    };

    const remove = (id) => setImports((cur) => { const next = cur.filter((x) => x.id !== id); save(next); return next; });

    const onRosterFile = (courseId, file) => {
        if (!file) return;
        Papa.parse(file, {
            complete: (r) => {
                try {
                    const map = parseRosterTemplate(r.data);
                    localStorage.setItem(rosterKey(courseId), JSON.stringify(map));
                    setRosterVersion((v) => v + 1);
                    setNotice({ ok: true, text: `PowerSchool roster saved for this class (${Object.keys(map.students).length} students).` });
                } catch (err) { setNotice({ ok: false, text: err.message }); }
            },
            error: () => setNotice({ ok: false, text: "Couldn't read that file." }),
        });
    };

    // Build the student lines for one import: Classroom name → "Last, First" → PowerSchool roster match.
    const linesFor = (imp) => {
        const roster = imp.courseId ? getRoster(imp.courseId) : null;
        const rosterNames = roster ? Object.keys(roster.students) : [];
        return imp.rows.map(([name, correct, total]) => {
            const person = (imp.people || []).find((p) => p.full === name);
            const first = person?.given || splitName(name).first;
            const last = person?.family || splitName(name).last;
            const score = scaled(correct, total, imp.maxPoints);
            let rosterName = "", studentNum = "";
            if (rosterNames.length) {
                const best = stringSimilarity.findBestMatch(`${last}, ${first}`, rosterNames).bestMatch;
                if (best.rating > 0.6) { rosterName = best.target; studentNum = roster.students[best.target]; }
            }
            return { name, first, last, correct, total, score, rosterName, studentNum, blank: skipZeros && correct === 0 };
        }).sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    };

    const exportPowerSchool = (imp) => {
        const roster = getRoster(imp.courseId);
        const lines = linesFor(imp).filter((l) => l.studentNum && !l.blank);
        download(`${imp.assignment}_PowerSchool.csv`, powerSchoolCsv({
            teacherName: roster.teacherName, className: roster.className, assignmentName: imp.assignment,
            dueDate: imp.dueDate, maxPoints: imp.maxPoints, lines,
        }));
    };

    const exportSimple = (imp) => {
        const rows = [["Last", "First", "Correct", "Questions", `Score (out of ${imp.maxPoints})`]];
        linesFor(imp).forEach((l) => rows.push([l.last, l.first, l.correct, l.total, l.blank ? "" : l.score]));
        download(`${imp.assignment}_video_scores.csv`, toCsv(rows));
    };

    if (status === "unauthenticated") {
        return <BillingShell title="Video Scores"><Card><button onClick={() => signIn("google")} className="px-4 py-2 rounded-lg bg-[#760296] text-white font-semibold">Sign in with Google</button></Card></BillingShell>;
    }

    const btn = "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold";
    return (
        <BillingShell title="Video Scores → PowerSchool">
            {notice && <Card className={notice.ok ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40" : "border-rose-300 text-rose-700 dark:text-rose-300"}>{notice.text}</Card>}

            <Card>
                <h2 className="text-lg font-bold flex items-center gap-2"><Youtube className="w-5 h-5 text-red-500" />Get scores from a YouTube video assignment</h2>
                <p className="mt-1 text-sm text-slate-500">Google Classroom doesn't put video question scores into the grade, and Google doesn't let apps read them. This one-click bookmark grabs them from Classroom's Class insights page and sends them here.</p>

                <div className="mt-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
                    <p className="text-sm font-semibold mb-2">One-time setup: drag this button to your bookmarks bar</p>
                    <a ref={linkRef} onClick={(e) => { e.preventDefault(); setNotice({ ok: false, text: "Drag the button to your bookmarks bar instead of clicking it here. (Press Ctrl+Shift+B if you don't see the bookmarks bar.)" }); }}
                        className={`${btn} inline-flex bg-[#760296] text-white cursor-grab`} draggable="true">
                        <Bookmark className="w-4 h-4" />Send to SmartGrAIder
                    </a>
                    <p className="mt-2 text-xs text-slate-500">Don't see your bookmarks bar? Press <strong>Ctrl+Shift+B</strong>.</p>
                </div>

                <ol className="mt-4 text-sm space-y-1 list-decimal pl-5">
                    <li>In Google Classroom, open the video assignment and click <strong>Student work</strong>.</li>
                    <li>Click the <strong>YouTube video card</strong> at the top right (it says "YouTube video · N questions"). The scores list appears.</li>
                    <li>Click the <strong>Send to SmartGrAIder</strong> bookmark. This page opens with the scores.</li>
                </ol>
                <button onClick={pasteFromClipboard} className={`${btn} mt-3 bg-slate-100 dark:bg-slate-800`}><ClipboardPaste className="w-4 h-4" />Paste scores (if the page didn't open by itself)</button>
            </Card>

            {imports.length > 0 && (
                <label className="flex items-center gap-2 text-sm px-1">
                    <input type="checkbox" checked={skipZeros} onChange={(e) => setSkipZeros(e.target.checked)} />
                    Leave students who answered nothing (0 correct) blank instead of exporting a 0
                </label>
            )}

            {imports.length === 0 && <Card className="text-sm text-slate-500">No video scores yet. Follow the steps above.</Card>}

            {imports.map((imp) => {
                const roster = imp.courseId ? getRoster(imp.courseId) : null;
                const lines = linesFor(imp);
                const unmatched = roster ? lines.filter((l) => !l.studentNum && !l.blank) : [];
                return (
                    <Card key={imp.id + rosterVersion}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h3 className="text-lg font-bold">{imp.assignment}</h3>
                                <p className="text-sm text-slate-500">{[imp.courseName, imp.video && `${imp.video} · ${imp.rows[0]?.[2]} questions`, `out of ${imp.maxPoints}`].filter(Boolean).join(" · ")}</p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {roster ? (
                                    <button onClick={() => exportPowerSchool(imp)} className={`${btn} bg-[#760296] hover:bg-[#5e0278] text-white`}><Download className="w-4 h-4" />PowerSchool file</button>
                                ) : imp.courseId ? (
                                    <>
                                        <input type="file" accept=".csv" className="hidden" ref={(el) => { fileRefs.current[imp.id] = el; }} onChange={(e) => onRosterFile(imp.courseId, e.target.files[0])} />
                                        <button onClick={() => fileRefs.current[imp.id]?.click()} className={`${btn} bg-[#760296] hover:bg-[#5e0278] text-white`}><Upload className="w-4 h-4" />Add PowerSchool roster</button>
                                    </>
                                ) : null}
                                <button onClick={() => exportSimple(imp)} className={`${btn} bg-slate-100 dark:bg-slate-800`}><Download className="w-4 h-4" />Spreadsheet</button>
                                <button onClick={() => remove(imp.id)} className="p-2 text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {!roster && imp.courseId && (
                            <p className="mt-3 text-xs text-slate-500 flex gap-1"><Info className="w-4 h-4 shrink-0" />To make a file PowerSchool can import, add this class's PowerSchool score-import template once (the same one SmartGrader's grading page uses). It's remembered for the class.</p>
                        )}
                        {unmatched.length > 0 && (
                            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">Not found in the PowerSchool roster (won't be in the file): {unmatched.map((l) => l.name).join(", ")}</p>
                        )}

                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                                    <tr><th className="py-2 pr-3">Student</th><th className="py-2 pr-3 text-right">Correct</th><th className="py-2 pr-3 text-right">Score</th>{roster && <th className="py-2">PowerSchool</th>}</tr>
                                </thead>
                                <tbody>
                                    {lines.map((l) => (
                                        <tr key={l.name} className="border-b last:border-0 border-slate-100 dark:border-slate-800">
                                            <td className="py-1.5 pr-3">{l.last}, {l.first}</td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums">{l.correct}/{l.total}</td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{l.blank ? <span className="text-slate-400 font-normal">blank</span> : l.score}</td>
                                            {roster && <td className="py-1.5 text-xs text-slate-500">{l.studentNum ? `#${l.studentNum}` : l.blank ? "" : "not matched"}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                );
            })}
        </BillingShell>
    );
}
