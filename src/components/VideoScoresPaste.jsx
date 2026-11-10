"use client";

// "Paste Video Scores" pop-up on the assignment page.
import { useMemo, useState } from "react";
import stringSimilarity from "string-similarity";
import { X, Youtube, ClipboardPaste, CheckCircle2 } from "lucide-react";
import { parseInsightsHtml, parseInsightsText, scaled, matchToSubmissions } from "@/lib/videoScores";

export default function VideoScoresPaste({ submissions, maxPoints, onApply, onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");
    const [skipZeros, setSkipZeros] = useState(false);

    const onPaste = (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain");
        let parsed = parseInsightsHtml(html);
        if (!parsed.length) parsed = parseInsightsText(text);
        if (!parsed.length) {
            setRows(null);
            setError("No scores found in what you pasted. In Classroom, open the video's Class insights, click on the student list, press Ctrl+A, then Ctrl+C, and paste here again.");
            return;
        }
        setError("");
        setRows(parsed);
    };

    const matched = useMemo(() => rows ? matchToSubmissions(rows, submissions, stringSimilarity) : [], [rows, submissions]);
    const toApply = matched.filter((m) => m.sub && !(skipZeros && m.correct === 0));
    const unmatched = matched.filter((m) => !m.sub);

    const apply = () => {
        const results = {};
        toApply.forEach((m) => {
            results[m.sub.id] = {
                grade: String(scaled(m.correct, m.total, maxPoints)),
                feedback: `YouTube video questions: ${m.correct} of ${m.total} correct.`,
                confidence: "high",
                source: "video",
            };
        });
        onApply(results);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 text-slate-800 dark:text-slate-200">
                <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Youtube className="w-5 h-5 text-red-500" />Paste video scores</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X className="w-5 h-5" /></button>
                </div>

                <ol className="mt-3 text-sm space-y-1 list-decimal pl-5 text-slate-600 dark:text-slate-300">
                    <li>In Classroom, open this assignment → <strong>Student work</strong> → click the <strong>YouTube video card</strong> (top right).</li>
                    <li>Click anywhere on the student list, press <strong>Ctrl+A</strong>, then <strong>Ctrl+C</strong>.</li>
                    <li>Come back here, click the box below, and press <strong>Ctrl+V</strong>.</li>
                </ol>

                <div onPaste={onPaste} tabIndex={0} contentEditable suppressContentEditableWarning
                    className="mt-4 min-h-[70px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 flex items-center justify-center gap-2 focus:outline-none focus:border-[#760296] caret-transparent">
                    <ClipboardPaste className="w-5 h-5" />{rows ? `${rows.length} students pasted — paste again to replace` : "Click here and press Ctrl+V"}
                </div>
                {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                {rows && (
                    <>
                        <label className="mt-4 flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={skipZeros} onChange={(e) => setSkipZeros(e.target.checked)} />
                            Skip students who answered nothing (0 correct)
                        </label>
                        <div className="mt-3 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-800 sticky top-0">
                                    <tr><th className="p-2">Student</th><th className="p-2 text-right">Correct</th><th className="p-2 text-right">Grade</th></tr>
                                </thead>
                                <tbody>
                                    {matched.map((m) => {
                                        const skipped = skipZeros && m.correct === 0;
                                        return (
                                            <tr key={m.name} className={`border-t border-slate-100 dark:border-slate-800 ${!m.sub || skipped ? "text-slate-400" : ""}`}>
                                                <td className="p-2">{m.name}{!m.sub && <span className="ml-1 text-xs text-amber-600">(not in this class)</span>}</td>
                                                <td className="p-2 text-right tabular-nums">{m.correct}/{m.total}</td>
                                                <td className="p-2 text-right tabular-nums font-semibold">{skipped ? "skip" : m.sub ? `${scaled(m.correct, m.total, maxPoints)}/${maxPoints || 100}` : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {unmatched.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{unmatched.length} name(s) didn't match a student in this assignment and will be skipped.</p>}
                        <button onClick={apply} disabled={!toApply.length}
                            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white font-semibold disabled:opacity-60">
                            <CheckCircle2 className="w-4 h-4" />Add {toApply.length} grades to SmartGrAIder
                        </button>
                        <p className="mt-2 text-xs text-slate-500">Grades are saved in SmartGrAIder only. Then use <strong>Export to Gradebook</strong> for PowerSchool.</p>
                    </>
                )}
            </div>
        </div>
    );
}
