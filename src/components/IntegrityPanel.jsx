"use client";

import { useState } from "react";
import { topSeverity, fillStudent } from "@/lib/integrityAnalysis";

const DOC_TYPES = {
    "application/vnd.google-apps.document": "document",
    "application/vnd.google-apps.presentation": "presentation",
};

const SEVERITY_STYLES = {
    high: {
        badge: "bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700",
        row: "border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/40",
        dot: "bg-red-500",
        label: "Strong sign",
    },
    medium: {
        badge: "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
        row: "border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40",
        dot: "bg-amber-500",
        label: "Worth a look",
    },
    low: {
        badge: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
        row: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60",
        dot: "bg-slate-400",
        label: "FYI",
    },
};

/** Small 🚩 badge for the student list. Shows nothing for "low"-only flags. */
export function IntegrityBadge({ flags, nameFor }) {
    const level = topSeverity(flags);
    if (!level || level === "low") return null;
    const count = flags.filter(f => f.severity === "high" || f.severity === "medium").length;
    const titles = flags.filter(f => f.severity !== "low").map(f => "• " + fillStudent(f.title, f, nameFor)).join("\n");
    return (
        <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${SEVERITY_STYLES[level].badge}`}
            title={`Integrity check — look into this:\n${titles}`}
        >
            🚩 {count} {count === 1 ? "Flag" : "Flags"}
        </span>
    );
}

function fileUrl(file) {
    const kind = DOC_TYPES[file.mimeType];
    if (kind) return `https://docs.google.com/${kind}/d/${file.fileId}/edit`;
    return `https://drive.google.com/file/d/${file.fileId}/view`;
}

const fmtTime = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Word count over time, drawn from Google's saved versions. */
function TypingTimeline({ fileId }) {
    const [state, setState] = useState({ status: "idle" });

    const load = async () => {
        setState({ status: "loading" });
        try {
            const res = await fetch(`/api/drive/typing-timeline?fileId=${encodeURIComponent(fileId)}`);
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Failed");
            setState({ status: "done", data });
        } catch (e) {
            setState({ status: "done", data: { supported: false, reason: "Couldn't load the typing timeline. Try again, or use File → Version history in the Doc." } });
        }
    };

    if (state.status === "idle") {
        return (
            <button
                onClick={load}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Downloads this file's saved versions and charts how the word count grew. Only runs when you click."
            >
                📈 Show typing timeline
            </button>
        );
    }
    if (state.status === "loading") {
        return <div className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Reading saved versions from Google…</div>;
    }

    const { data } = state;
    if (!data.supported) {
        return <div className="text-xs text-slate-600 dark:text-slate-400 italic">{data.reason}</div>;
    }
    const pts = (data.points || []).filter(p => p.words !== null);
    if (pts.length < 2) {
        return (
            <div className="text-xs text-slate-700 dark:text-slate-300">
                Google only has <strong>{pts.length}</strong> saved version{pts.length === 1 ? "" : "s"} of this file
                {pts[0] ? <> — it already had <strong>{pts[0].words}</strong> words at {fmtTime(pts[0].time)}</> : null}. Typed work normally builds up over many versions.
            </div>
        );
    }

    // Biggest jump between two saved versions
    let jump = { add: 0, i: 0 };
    for (let i = 1; i < pts.length; i++) {
        const add = pts[i].words - pts[i - 1].words;
        if (add > jump.add) jump = { add, i };
    }
    const finalWords = Math.max(...pts.map(p => p.words), 1);
    const jumpShare = jump.add / finalWords;

    // Chart geometry
    const W = 320, H = 110, P = 8;
    // Use version order (not clock time) on the x-axis so days-long gaps don't squash the chart.
    const x = (i) => P + (i / (pts.length - 1)) * (W - 2 * P);
    const y = (w) => H - P - (w / finalWords) * (H - 2 * P);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.words).toFixed(1)}`).join(" ");

    return (
        <div className="mt-1">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md h-28 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700" role="img" aria-label="Word count over saved versions">
                <line x1={P} y1={H - P} x2={W - P} y2={H - P} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
                <path d={path} fill="none" className="stroke-indigo-500" strokeWidth="2" strokeLinejoin="round" />
                {jump.add > 0 && (
                    <line x1={x(jump.i - 1)} y1={y(pts[jump.i - 1].words)} x2={x(jump.i)} y2={y(pts[jump.i].words)} className="stroke-red-500" strokeWidth="3.5" strokeLinecap="round" />
                )}
                {pts.map((p, i) => (
                    <circle key={i} cx={x(i)} cy={y(p.words)} r="2" className="fill-indigo-500">
                        <title>{`${fmtTime(p.time)} — ${p.words} words${p.name ? " (" + p.name + ")" : ""}`}</title>
                    </circle>
                ))}
            </svg>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Word count across {pts.length} saved versions{data.sampled ? ` (sampled from ${data.totalVersions})` : ""}, {fmtTime(pts[0].time)} → {fmtTime(pts[pts.length - 1].time)}. Hover the dots for details.
            </div>
            <div className={`text-xs mt-1 font-semibold ${jumpShare >= 0.5 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {jumpShare >= 0.5
                    ? <>⚠️ One save added <strong>{jump.add}</strong> words ({Math.round(jumpShare * 100)}% of the paper) between {fmtTime(pts[jump.i - 1].time)} and {fmtTime(pts[jump.i].time)} — likely pasted.</>
                    : <>✓ The words built up gradually (biggest single jump: {jump.add} words). This looks typed.</>}
            </div>
        </div>
    );
}

/**
 * Detail panel for the selected student.
 * @param flags        – flags for this student
 * @param integrity    – the submission's integrity data (for file links + timeline)
 * @param nameFor      – (subId) => display name (respects Privacy Mode)
 * @param onOpenStudent – (subId) => void, jumps to the other student
 */
export default function IntegrityPanel({ flags = [], integrity, nameFor, onOpenStudent }) {
    const files = integrity?.files || [];
    const typedFiles = files.filter(f => DOC_TYPES[f.mimeType]);
    const level = topSeverity(flags);
    const serious = flags.filter(f => f.severity !== "low");
    const [open, setOpen] = useState(true);

    if (!integrity && flags.length === 0) return null;

    // Calm, one-line summary when nothing stands out.
    if (serious.length === 0) {
        return (
            <div className="mt-6 mb-4 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold">✓ Integrity check: nothing unusual found</span>
                    {typedFiles.length > 0 && <TypingTimelineToggle files={typedFiles} />}
                </div>
                {flags.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                        {flags.map(f => <li key={f.id}>• {fillStudent(f.title, f, nameFor)} — {fillStudent(f.detail, f, nameFor)}</li>)}
                    </ul>
                )}
            </div>
        );
    }

    const style = SEVERITY_STYLES[level];
    return (
        <div className={`mt-6 mb-4 rounded-xl border ${style.row} shadow-sm text-xs`}>
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 font-bold text-slate-900 dark:text-slate-100 cursor-pointer">
                <span className="flex items-center gap-1.5">🚩 Integrity check — look into this ({serious.length})</span>
                <span className="text-slate-500">{open ? "▲" : "▼"}</span>
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-2">
                    {flags.map(f => {
                        const s = SEVERITY_STYLES[f.severity];
                        return (
                            <div key={f.id} className="rounded-lg bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 p-2.5">
                                <div className="flex items-start gap-2">
                                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} title={s.label} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-900 dark:text-slate-100">
                                            {fillStudent(f.title, f, nameFor)}
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                                            {fillStudent(f.detail, f, nameFor)}
                                        </div>
                                        {f.examples && f.examples.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {f.examples.map((ex, i) => (
                                                    <code key={i} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px]">“{ex}”</code>
                                                ))}
                                            </div>
                                        )}
                                        {f.matchSubId && onOpenStudent && (
                                            <button
                                                onClick={() => onOpenStudent(f.matchSubId)}
                                                className="mt-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
                                            >
                                                Open {nameFor(f.matchSubId)}&apos;s work →
                                            </button>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${s.badge}`}>{s.label}</span>
                                </div>
                            </div>
                        );
                    })}

                    {files.length > 0 && (
                        <div className="pt-1 space-y-2">
                            {typedFiles.length > 0 && <TypingTimelineToggle files={typedFiles} />}
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {files.map(f => (
                                    <a key={f.fileId} href={fileUrl(f)} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 hover:underline">
                                        Open {files.length > 1 ? `“${f.title}”` : "the file"} ↗
                                    </a>
                                ))}
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">then File → Version history → See version history</span>
                            </div>
                        </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                        These are clues, not proof, and they never change the grade. Check Version History before talking with a student.
                    </p>
                </div>
            )}
        </div>
    );
}

function TypingTimelineToggle({ files }) {
    return (
        <div className="space-y-2">
            {files.map(f => (
                <div key={f.fileId}>
                    {files.length > 1 && <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{f.title}</div>}
                    <TypingTimeline fileId={f.fileId} />
                </div>
            ))}
        </div>
    );
}
