"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ArrowLeft, Calendar, FileText, CheckCircle2, Plus, X, Link as LinkIcon, Youtube, File as FileIcon, RefreshCw, Zap } from "lucide-react";
import useDrivePicker from "react-google-drive-picker";
import { BrandLogo } from "@/components/BrandLogo";

export default function CourseAssignments() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const courseId = pathname.split("/").pop(); // Simple way to extract courseId from /courses/[courseId]

    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [gradedStatus, setGradedStatus] = useState({});
    const [averageGrades, setAverageGrades] = useState({});
    const [filterMode, setFilterMode] = useState("All");
    const [edpuzzleFlags, setEdpuzzleFlags] = useState({}); // { [assignmentId]: true/false }

    const filteredAssignments = assignments.filter(assignment => {
        const isGraded = gradedStatus[assignment.id];
        if (filterMode === "Graded") return isGraded;
        if (filterMode === "Ungraded") return !isGraded;
        return true;
    });

    const [googleKeys, setGoogleKeys] = useState({ clientId: "", apiKey: "" });
    const [openPicker, authResponse] = useDrivePicker();

    const handleOpenPicker = () => {
        if (!googleKeys.clientId || !session?.accessToken) return;
        openPicker({
            clientId: googleKeys.clientId,
            developerKey: googleKeys.apiKey,
            viewId: "DOCS",
            token: session.accessToken,
            showUploadView: true,
            showUploadFolders: true,
            supportDrives: true,
            multiselect: true,
            callbackFunction: (data) => {
                if (data.action === "picked") {
                    const newDocs = data.docs.map(doc => ({ url: doc.url, name: doc.name }));
                    setCreateForm(prev => ({
                        ...prev,
                        attachments: [...prev.attachments, ...newDocs]
                    }));
                }
            },
        });
    };

    // Create Assignment Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [createForm, setCreateForm] = useState({
        title: "",
        description: "",
        maxPoints: 100,
        dueDate: "",
        dueTime: "",
        attachments: [],
        targetCourseIds: [courseId], // Default to current course
        schedulePublish: false,
        targetCourseSchedules: {}
    });

    // Multi-Class Support State
    const [availableCourses, setAvailableCourses] = useState([]);
    const [hiddenCourseIds, setHiddenCourseIds] = useState([]);
    const [fetchingCourses, setFetchingCourses] = useState(false);

    // Reuse Assignment State
    const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
    const [reuseSelectedCourse, setReuseSelectedCourse] = useState("");
    const [reuseAssignments, setReuseAssignments] = useState([]);
    const [fetchingReuseAssignments, setFetchingReuseAssignments] = useState(false);
    const [reuseError, setReuseError] = useState(null);

    useEffect(() => {
        const savedHidden = localStorage.getItem("smartgraider_hidden_courses");
        if (savedHidden) {
            try {
                setHiddenCourseIds(JSON.parse(savedHidden));
            } catch (e) { }
        }
    }, []);

    const addAttachment = () => {
        setCreateForm(prev => ({
            ...prev,
            attachments: [...prev.attachments, { url: "" }]
        }));
    };

    const removeAttachment = (index) => {
        setCreateForm(prev => {
            const newAttachments = [...prev.attachments];
            newAttachments.splice(index, 1);
            return { ...prev, attachments: newAttachments };
        });
    };

    const updateAttachment = (index, value) => {
        setCreateForm(prev => {
            const newAttachments = [...prev.attachments];
            newAttachments[index] = { ...newAttachments[index], url: value };
            return { ...prev, attachments: newAttachments };
        });
    };

    useEffect(() => {
        if (isReuseModalOpen && reuseSelectedCourse) {
            setFetchingReuseAssignments(true);
            setReuseError(null);
            fetch(`/api/courses/${reuseSelectedCourse}/assignments`)
                .then(res => {
                    if (!res.ok) throw new Error("Failed to fetch assignments");
                    return res.json();
                })
                .then(data => {
                    setReuseAssignments(data.assignments || []);
                })
                .catch(err => {
                    console.error(err);
                    setReuseError("Could not load past assignments.");
                })
                .finally(() => {
                    setFetchingReuseAssignments(false);
                });
        }
    }, [reuseSelectedCourse, isReuseModalOpen]);

    const handleSelectReuseAssignment = (assignment) => {
        let formattedDate = "";
        if (assignment.dueDate && assignment.dueDate.year) {
            const m = String(assignment.dueDate.month || 1).padStart(2, '0');
            const d = String(assignment.dueDate.day || 1).padStart(2, '0');
            formattedDate = `${assignment.dueDate.year}-${m}-${d}`;
        }

        let formattedTime = "";
        if (assignment.dueTime && typeof assignment.dueTime.hours !== 'undefined') {
            const h = String(assignment.dueTime.hours).padStart(2, '0');
            const m = String(assignment.dueTime.minutes || 0).padStart(2, '0');
            formattedTime = `${h}:${m}`;
        }

        const extractedAttachments = [];
        if (assignment.materials && Array.isArray(assignment.materials)) {
            assignment.materials.forEach(mat => {
                let url = "";
                if (mat.driveFile && mat.driveFile.driveFile) {
                    url = mat.driveFile.driveFile.alternateLink || "";
                } else if (mat.youtubeVideo) {
                    url = mat.youtubeVideo.alternateLink || "";
                } else if (mat.link) {
                    url = mat.link.url || "";
                } else if (mat.form) {
                    url = mat.form.formUrl || "";
                }

                if (url) {
                    extractedAttachments.push({ url });
                }
            });
        }

        setCreateForm({
            title: assignment.title || "",
            description: assignment.description || "",
            maxPoints: assignment.maxPoints || 100,
            dueDate: formattedDate,
            dueTime: formattedTime,
            attachments: extractedAttachments,
            targetCourseIds: [courseId],
            schedulePublish: false,
            targetCourseSchedules: {}
        });

        setIsReuseModalOpen(false);
        setIsCreateModalOpen(true);
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setCreateError(null);
        setIsCreating(true);

        try {
            const payload = { ...createForm };
            payload.targetCourseISO = {};

            // Save schedules to default next time
            if (Object.keys(payload.targetCourseSchedules).length > 0) {
                const existingStr = localStorage.getItem("smartgraider_class_schedules");
                let existing = {};
                if (existingStr) {
                    try { existing = JSON.parse(existingStr); } catch (e) { }
                }
                const merged = { ...existing, ...payload.targetCourseSchedules };
                localStorage.setItem("smartgraider_class_schedules", JSON.stringify(merged));
            }

            // If scheduling is enabled, generate ISO strings from local browser time for each class
            if (payload.schedulePublish) {
                for (const targetId of payload.targetCourseIds) {
                    const schedule = payload.targetCourseSchedules[targetId];
                    if (schedule && schedule.date && schedule.time) {
                        const localDateStr = `${schedule.date}T${schedule.time}`;
                        try {
                            const localDate = new Date(localDateStr);
                            payload.targetCourseISO[targetId] = localDate.toISOString();
                        } catch (e) { console.error("Invalid date parsing", e); }
                    }
                }
            }

            const res = await fetch(`/api/courses/${courseId}/assignments/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to create assignment");
            }

            // Immediately close the modal and append the new assignment to the list
            setIsCreateModalOpen(false);
            setAssignments(prev => [data.assignment, ...prev]);

            // Reset form
            setCreateForm({
                title: "",
                description: "",
                maxPoints: 100,
                dueDate: "",
                dueTime: "",
                attachments: [],
                targetCourseIds: [courseId],
                schedulePublish: false,
                targetCourseSchedules: {}
            });

        } catch (err) {
            console.error(err);
            setCreateError(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    // Check localStorage for each assignment
    useEffect(() => {
        if (assignments.length > 0 && courseId) {
            const statuses = {};
            const averages = {};
            const epFlags = {};

            assignments.forEach(a => {
                // Auto-detect EdPuzzle from assignment data
                const isEdpuzzle = (() => {
                    if (a.title?.toLowerCase().includes("edpuzzle")) return true;
                    if (a.materials) {
                        for (const mat of a.materials) {
                            if (mat.link?.url?.includes("edpuzzle.com")) return true;
                        }
                    }
                    return false;
                })();

                // Check saved flag (manual override or auto-saved)
                const savedFlag = localStorage.getItem(`edpuzzle_${courseId}_${a.id}`);
                if (savedFlag === "true") {
                    epFlags[a.id] = true;
                } else if (savedFlag === "false") {
                    epFlags[a.id] = false;
                } else if (isEdpuzzle) {
                    epFlags[a.id] = true;
                    localStorage.setItem(`edpuzzle_${courseId}_${a.id}`, "true");
                }

                // Check if manually marked as graded
                if (localStorage.getItem(`manual_graded_${courseId}_${a.id}`) === "true") {
                    statuses[a.id] = true;
                }

                const savedGrades = localStorage.getItem(`grades_${courseId}_${a.id}`);
                if (savedGrades) {
                    try {
                        const grades = JSON.parse(savedGrades);
                        const gradeValues = Object.values(grades).filter(g => g && g.grade !== "Error" && g.grade !== "Failed" && g.grade !== undefined && g.grade !== null && !isNaN(parseFloat(g.grade)));
                        if (gradeValues.length > 0) {
                            statuses[a.id] = true;
                            const sum = gradeValues.reduce((acc, curr) => acc + parseFloat(curr.grade), 0);
                            averages[a.id] = Math.round(sum / gradeValues.length);
                        } else if (Object.keys(grades).length > 0) {
                            // Graded, but no numerical averages (e.g. only errors)
                            statuses[a.id] = true;
                        }
                    } catch (e) { }
                }
            });
            setGradedStatus(statuses);
            setAverageGrades(averages);
            setEdpuzzleFlags(epFlags);
        }
    }, [assignments, courseId]);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        }
    }, [status, router]);

    useEffect(() => {
        if (session?.accessToken && courseId) {
            setLoading(true);
            fetch(`/api/courses/${courseId}/assignments`)
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to fetch assignments");
                    return res.json();
                })
                .then((data) => {
                    setAssignments(data.assignments || []);
                    setError(null);
                })
                .catch((err) => {
                    console.error(err);
                    setError("Could not load assignments for this class.");
                })
                .finally(() => {
                    setLoading(false);
                });

            // Also fetch available courses for the multi-select dropdown
            setFetchingCourses(true);
            fetch(`/api/courses`)
                .then(res => res.json())
                .then(data => setAvailableCourses(data.courses || []))
                .catch(err => console.error("Failed to load available courses", err))
                .finally(() => setFetchingCourses(false));

            // Fetch Google Picker keys
            fetch(`/api/config/google`)
                .then(res => res.json())
                .then(data => setGoogleKeys(data))
                .catch(err => console.error("Failed to load generic google config", err));
        }
    }, [session, courseId]);

    useEffect(() => {
        if (isCreateModalOpen) {
            const savedStr = localStorage.getItem("smartgraider_class_schedules");
            if (savedStr) {
                try {
                    const parsed = JSON.parse(savedStr);
                    setCreateForm(prev => ({ ...prev, targetCourseSchedules: parsed }));
                } catch (e) { }
            }
        }
    }, [isCreateModalOpen]);

    if (status === "loading" || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                <div className="animate-pulse text-indigo-900 dark:text-indigo-300 font-medium">Fetching Assignments...</div>
            </div>
        );
    }

    if (!session) return null; // Prevent flicker while redirecting

    return (
        <>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
                {/* Sidebar - Same as Dashboard */}
                <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col hidden md:flex">
                    <div className="h-24 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 cursor-pointer" onClick={() => router.push('/')}>
                        <div className="flex items-center gap-1 text-lg">
                            <img src="/robot-avatar.png" alt="SmartGrAIder Mascot" className="w-16 h-16 object-contain" />
                            <BrandLogo />
                        </div>
                    </div>

                    <div className="flex-1 p-4 space-y-2">
                        <button
                            onClick={() => router.push('/')}
                            className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 transition-colors"
                        >
                            <BookOpen className="w-5 h-5" />
                            My Classes
                        </button>

                        <div className="flex items-center gap-3 px-3 py-2 text-indigo-700 dark:text-indigo-400 font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/40 mt-2">
                            <FileText className="w-5 h-5" />
                            Assignments
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-auto">
                    <header className="h-16 flex items-center justify-between px-8 bg-white dark:bg-slate-950/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-all duration-200">
                        <div className="flex items-center">
                            <button
                                onClick={() => router.push('/')}
                                className="mr-4 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 group flex items-center gap-2"
                            >
                                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                                <span className="text-sm font-medium">Back to Classes</span>
                            </button>
                        </div>
                        {availableCourses.find(c => String(c.id) === String(courseId)) && (
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                                {availableCourses.find(c => String(c.id) === String(courseId)).name}
                                {availableCourses.find(c => String(c.id) === String(courseId)).section && <span className="font-normal text-slate-500 ml-2">{availableCourses.find(c => String(c.id) === String(courseId)).section}</span>}
                            </div>
                        )}
                    </header>

                    <div className="p-8 max-w-6xl mx-auto">
                        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2">Active Assignments</h1>
                                <p className="text-slate-500 dark:text-slate-400">Select an assignment to begin the AI grading process.</p>
                            </div>
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <select
                                    value={filterMode}
                                    onChange={(e) => setFilterMode(e.target.value)}
                                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                >
                                    <option value="All">Show All</option>
                                    <option value="Ungraded">Needs Grading</option>
                                    <option value="Graded">Graded</option>
                                </select>
                                <button
                                    onClick={() => setIsReuseModalOpen(true)}
                                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 active:scale-95 whitespace-nowrap"
                                >
                                    <RefreshCw className="w-5 h-5" /> Reuse Assignment
                                </button>
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 active:scale-95 whitespace-nowrap"
                                >
                                    <Plus className="w-5 h-5" /> Create
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl border border-red-200 dark:border-red-800 mb-6 font-medium">
                                {error}
                            </div>
                        )}

                        {assignments.length === 0 && !error ? (
                            <div className="text-center py-20 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">All Caught Up!</h3>
                                <p className="text-slate-500 dark:text-slate-400">There are no active or published assignments for this class right now.</p>
                            </div>
                        ) : filteredAssignments.length === 0 && !error ? (
                            <div className="text-center py-20 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                <CheckCircle2 className="w-16 h-16 text-indigo-400 dark:text-indigo-600 mx-auto mb-4 opacity-50" />
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">No Matches</h3>
                                <p className="text-slate-500 dark:text-slate-400">No assignments match your current filter ({filterMode}).</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {filteredAssignments.map((assignment) => (
                                    <div key={assignment.id} className="bg-white dark:bg-slate-950 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col h-full">
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex gap-2 items-center">
                                                    <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase">
                                                        {assignment.workType || "Assignment"}
                                                    </span>
                                                    {edpuzzleFlags[assignment.id] && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/60 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800 uppercase tracking-wider">
                                                            <Zap className="w-3 h-3" /> EdPuzzle
                                                        </span>
                                                    )}
                                                    {gradedStatus[assignment.id] && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 uppercase tracking-wider">
                                                            <CheckCircle2 className="w-3 h-3" /> Graded
                                                        </span>
                                                    )}
                                                    {averageGrades[assignment.id] !== undefined && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full border border-indigo-200 uppercase tracking-wider shadow-sm">
                                                            AVG {averageGrades[assignment.id]}
                                                        </span>
                                                    )}
                                                </div>
                                                {assignment.maxPoints && (
                                                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                                        {assignment.maxPoints} pts
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2 line-clamp-2" title={assignment.title}>
                                                {assignment.title}
                                            </h3>

                                            {assignment.description && (
                                                <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 mb-4">
                                                    {assignment.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                                    <Calendar className="w-4 h-4" />
                                                    <span>
                                                        {assignment.dueDate
                                                            ? `Due: ${assignment.dueDate.month}/${assignment.dueDate.day}/${assignment.dueDate.year}`
                                                            : "No due date"}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {/* EdPuzzle toggle button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const next = !edpuzzleFlags[assignment.id];
                                                            setEdpuzzleFlags(prev => ({ ...prev, [assignment.id]: next }));
                                                            localStorage.setItem(`edpuzzle_${courseId}_${assignment.id}`, String(next));
                                                        }}
                                                        title={edpuzzleFlags[assignment.id] ? 'Turn off EdPuzzle mode' : 'Mark as EdPuzzle / Externally Graded'}
                                                        className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold ${
                                                            edpuzzleFlags[assignment.id]
                                                                ? 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200'
                                                                : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30'
                                                        }`}
                                                    >
                                                        <Zap className="w-4 h-4" />
                                                    </button>
                                                    {!gradedStatus[assignment.id] && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                localStorage.setItem(`manual_graded_${courseId}_${assignment.id}`, "true");
                                                                setGradedStatus(prev => ({ ...prev, [assignment.id]: true }));
                                                            }}
                                                            title="Mark as Graded Manually"
                                                            className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" /> Mark Graded
                                                        </button>
                                                    )}
                                                    {localStorage.getItem(`manual_graded_${courseId}_${assignment.id}`) === "true" && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                localStorage.removeItem(`manual_graded_${courseId}_${assignment.id}`);
                                                                setGradedStatus(prev => ({ ...prev, [assignment.id]: false }));
                                                            }}
                                                            title="Remove Manual Graded Status"
                                                            className="p-2 text-emerald-500 hover:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                        >
                                                            <X className="w-4 h-4" /> Unmark Graded
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => router.push(`/courses/${courseId}/assignments/${assignment.id}`)}
                                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 active:scale-95 ${
                                                            edpuzzleFlags[assignment.id]
                                                                ? 'bg-violet-600 hover:bg-violet-700 text-white font-bold'
                                                                : gradedStatus[assignment.id]
                                                                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-200 font-bold'
                                                                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                                                        }`}
                                                    >
                                                        {edpuzzleFlags[assignment.id]
                                                            ? <><Zap className="w-4 h-4" /> Import Grades</>
                                                            : gradedStatus[assignment.id]
                                                                ? 'Review Grades'
                                                                : 'Grade with AI'
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Create Assignment Modal Overlay */}
            {
                isCreateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                            {/* Modal Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
                                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Create New Assignment
                                </h2>
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Form Body */}
                            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                                {createError && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800 font-medium">
                                        {createError}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Assignment Title <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={createForm.title}
                                        onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                                        placeholder="e.g. Chapter 4 Reading Quiz"
                                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 font-medium text-slate-900 dark:text-slate-50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Instructions / Description</label>
                                    <textarea
                                        value={createForm.description}
                                        onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                                        placeholder="Add any specific instructions for the students..."
                                        rows={3}
                                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-sm text-slate-800 dark:text-slate-200"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Max Points</label>
                                        <input
                                            type="number"
                                            value={createForm.maxPoints}
                                            onChange={e => setCreateForm({ ...createForm, maxPoints: parseInt(e.target.value) || 0 })}
                                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Due Date <i>(Opt)</i></label>
                                        <input
                                            type="date"
                                            value={createForm.dueDate}
                                            onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })}
                                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 dark:text-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Due Time <i>(Opt)</i></label>
                                        <input
                                            type="time"
                                            value={createForm.dueTime}
                                            onChange={e => setCreateForm({ ...createForm, dueTime: e.target.value })}
                                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 dark:text-slate-50"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={createForm.schedulePublish}
                                            onChange={e => setCreateForm({ ...createForm, schedulePublish: e.target.checked })}
                                            className="w-4 h-4 text-indigo-600 dark:text-indigo-400 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                                        />
                                        Schedule Publish Times (per class)
                                    </label>
                                </div>

                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Assign to Classes</label>
                                    {fetchingCourses ? (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading classes...</div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto p-1">
                                            {availableCourses.filter(c => !hiddenCourseIds.includes(c.id)).map(c => {
                                                const isSelected = createForm.targetCourseIds.includes(c.id);
                                                const schedule = createForm.targetCourseSchedules[c.id] || { date: "", time: "" };

                                                return (
                                                    <div key={c.id} className={`flex flex-col p-3 rounded-lg border transition-colors ${isSelected ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200 dark:border-slate-800'}`}>
                                                        <label className="flex items-start gap-3 cursor-pointer w-full">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setCreateForm(prev => {
                                                                        let newIds = [...prev.targetCourseIds];
                                                                        if (checked) {
                                                                            if (!newIds.includes(c.id)) newIds.push(c.id);
                                                                        } else {
                                                                            newIds = newIds.filter(id => id !== c.id);
                                                                        }
                                                                        if (newIds.length === 0) newIds = [courseId];
                                                                        return { ...prev, targetCourseIds: newIds };
                                                                    });
                                                                }}
                                                                className="mt-1 w-4 h-4 text-indigo-600 dark:text-indigo-400 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                                                            />
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{c.name}</div>
                                                                {c.section && <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{c.section}</div>}
                                                            </div>
                                                        </label>

                                                        {createForm.schedulePublish && isSelected && (
                                                            <div className="mt-3 pl-7 grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Publish Date</div>
                                                                    <input
                                                                        type="date"
                                                                        required
                                                                        value={schedule.date}
                                                                        onChange={e => setCreateForm(prev => ({
                                                                            ...prev,
                                                                            targetCourseSchedules: {
                                                                                ...prev.targetCourseSchedules,
                                                                                [c.id]: { ...schedule, date: e.target.value }
                                                                            }
                                                                        }))}
                                                                        className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-950"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Publish Time</div>
                                                                    <input
                                                                        type="time"
                                                                        required
                                                                        value={schedule.time}
                                                                        onChange={e => setCreateForm(prev => ({
                                                                            ...prev,
                                                                            targetCourseSchedules: {
                                                                                ...prev.targetCourseSchedules,
                                                                                [c.id]: { ...schedule, time: e.target.value }
                                                                            }
                                                                        }))}
                                                                        className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-950"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">Attachments</label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleOpenPicker}
                                                disabled={!googleKeys.clientId}
                                                className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                            >
                                                <FileIcon className="w-3.5 h-3.5" /> Google Drive
                                            </button>
                                            <button
                                                type="button"
                                                onClick={addAttachment}
                                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:bg-indigo-900/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Add Link
                                            </button>
                                        </div>
                                    </div>

                                    {createForm.attachments.length === 0 ? (
                                        <p className="text-sm text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">No attachments. Students will just see the description.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {createForm.attachments.map((att, idx) => (
                                                <div key={idx} className="flex items-center gap-2 group">
                                                    <div className="flex-1 relative">
                                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                                            {att.url.includes("youtube.com") || att.url.includes("youtu.be") ? (
                                                                <Youtube className="w-4 h-4 text-red-500" />
                                                            ) : att.url.includes("drive.google.com") || att.url.includes("docs.google.com") ? (
                                                                <FileIcon className="w-4 h-4 text-blue-500" />
                                                            ) : (
                                                                <LinkIcon className="w-4 h-4" />
                                                            )}
                                                        </div>
                                                        <input
                                                            type="url"
                                                            value={att.url}
                                                            onChange={(e) => updateAttachment(idx, e.target.value)}
                                                            placeholder="Paste a YouTube, Google Drive, or matching website URL..."
                                                            className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm text-slate-900 dark:text-slate-50"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(idx)}
                                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:bg-red-900/30 rounded-lg transition-colors"
                                                        title="Remove Attachment"
                                                    >
                                                        <X className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            </form>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    disabled={isCreating}
                                    className="px-5 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateSubmit}
                                    disabled={isCreating}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isCreating ? (
                                        <><div className="w-4 h-4 rounded-full border-b-2 border-white animate-spin" /> Publishing...</>
                                    ) : (
                                        "Publish to Classroom"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {/* Reuse Assignment Modal Overlay */}
            {
                isReuseModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                            {/* Modal Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
                                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Reuse Past Assignment
                                </h2>
                                <button
                                    onClick={() => setIsReuseModalOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {reuseError && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800 font-medium">
                                        {reuseError}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">1. Select a Class</label>
                                    <select
                                        value={reuseSelectedCourse}
                                        onChange={(e) => setReuseSelectedCourse(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-900 shadow-sm"
                                    >
                                        <option value="">-- Choose a Class --</option>
                                        {availableCourses.filter(c => !hiddenCourseIds.includes(c.id)).map(course => (
                                            <option key={course.id} value={course.id}>
                                                {course.name} {course.section ? `- ${course.section}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {reuseSelectedCourse && (
                                    <div className="space-y-3 pt-2">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
                                            2. Select an Assignment
                                            {fetchingReuseAssignments && (
                                                <div className="w-3.5 h-3.5 rounded-full border-b-2 border-indigo-600 animate-spin" />
                                            )}
                                        </label>

                                        {!fetchingReuseAssignments && reuseAssignments.length === 0 && !reuseError && (
                                            <div className="text-center p-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No published assignments found in this class.</p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1">
                                            {reuseAssignments.map(assignment => (
                                                <button
                                                    key={assignment.id}
                                                    onClick={() => handleSelectReuseAssignment(assignment)}
                                                    className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group active:scale-[0.99]"
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                                                            {assignment.title}
                                                        </h4>
                                                        {assignment.maxPoints && (
                                                            <span className="text-xs font-bold text-slate-500 whitespace-nowrap ml-2 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                                                {assignment.maxPoints} pts
                                                            </span>
                                                        )}
                                                    </div>
                                                    {assignment.description && (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                                                            {assignment.description}
                                                        </p>
                                                    )}
                                                    {assignment.materials && assignment.materials.length > 0 && (
                                                        <div className="mt-2.5 flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                                            <FileIcon className="w-3.5 h-3.5" />
                                                            {assignment.materials.length} Attachment{assignment.materials.length !== 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                )}
        </>
    );
}
