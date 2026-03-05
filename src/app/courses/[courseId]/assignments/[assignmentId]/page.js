"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, User, FileText, Settings2, Sparkles, CheckCircle2, ListChecks, Download, RefreshCw, X, AlertTriangle, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import stringSimilarity from "string-similarity";

export default function GradingWorkspace() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    // Extract IDs from /courses/[courseId]/assignments/[assignmentId]
    const pathParts = pathname.split("/");
    const courseId = pathParts[2];
    const assignmentId = pathParts[4];

    const [submissions, setSubmissions] = useState([]);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [assignmentName, setAssignmentName] = useState("");
    const [courseName, setCourseName] = useState("");

    // Grading Controls
    const [rubric, setRubric] = useState("");
    const [strictness, setStrictness] = useState(5); // 1 = Easy, 10 = Hard
    const [studentNotes, setStudentNotes] = useState("");
    const [studentGradeFloor, setStudentGradeFloor] = useState("");
    const [rubricFile, setRubricFile] = useState(null);

    // Active Submission Data
    const [submissionContent, setSubmissionContent] = useState("");
    const [submissionMime, setSubmissionMime] = useState(null);
    const [submissionIsBinary, setSubmissionIsBinary] = useState(false);
    const [contentLoading, setContentLoading] = useState(false);

    // States
    const [loading, setLoading] = useState(true);
    const [grading, setGrading] = useState(false);
    const [error, setError] = useState(null);
    const [aiFeedback, setAiFeedback] = useState(null);
    const [generateFeedback, setGenerateFeedback] = useState(true);

    // Batch Grading
    const [batchGrading, setBatchGrading] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [batchResults, setBatchResults] = useState({}); // { [submissionId]: { grade, feedback } }
    const stopGradingRef = useRef(false);

    // Sync to Classroom
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

    // Phase 12: PowerSchool CSV Formatter
    const [rosterMap, setRosterMap] = useState(null);
    const [showRosterModal, setShowRosterModal] = useState(false);
    const [rosterSetupError, setRosterSetupError] = useState("");
    const [assignmentInfo, setAssignmentInfo] = useState(null); // Full assignment object

    const [useStudentAsKey, setUseStudentAsKey] = useState(false);
    const [keyStudentId, setKeyStudentId] = useState("");
    const [filterMode, setFilterMode] = useState("All");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        }
    }, [status, router]);

    // Load saved rubric and strictness on mount (Wait for assignmentName)
    useEffect(() => {
        if (assignmentName) {
            const savedRubric = localStorage.getItem(`rubric_${assignmentName}`);
            if (savedRubric) setRubric(savedRubric);

            const savedStrictness = localStorage.getItem(`strictness_${assignmentName}`);
            if (savedStrictness) setStrictness(parseInt(savedStrictness));

            const savedFile = localStorage.getItem(`rubricFile_${assignmentName}`);
            if (savedFile) {
                try {
                    setRubricFile(JSON.parse(savedFile));
                } catch (e) {
                    console.error("Failed to parse rubric file from local storage", e);
                }
            }
        }
    }, [assignmentName]);

    // Save rubric/strictness/file when they change
    useEffect(() => {
        if (assignmentName) {
            if (rubric !== "") {
                localStorage.setItem(`rubric_${assignmentName}`, rubric);
            }
            localStorage.setItem(`strictness_${assignmentName}`, strictness);
            if (rubricFile) {
                localStorage.setItem(`rubricFile_${assignmentName}`, JSON.stringify(rubricFile));
            }
        }
    }, [rubric, strictness, rubricFile, assignmentName]);

    // Save batchResults when they change
    useEffect(() => {
        if (assignmentId && courseId && Object.keys(batchResults).length > 0) {
            localStorage.setItem(`grades_${courseId}_${assignmentId}`, JSON.stringify(batchResults));
        }
    }, [batchResults, courseId, assignmentId]);

    // Load saved batchResults on mount
    useEffect(() => {
        if (courseId && assignmentId) {
            const savedGrades = localStorage.getItem(`grades_${courseId}_${assignmentId}`);
            if (savedGrades) {
                try {
                    setBatchResults(JSON.parse(savedGrades));
                } catch (e) {
                    console.error("Failed to parse saved grades", e);
                }
            }
        }
    }, [courseId, assignmentId]);

    // Load PowerSchool Roster Map on mount
    useEffect(() => {
        if (courseId) {
            const savedMap = localStorage.getItem(`roster_map_${courseId}`);
            if (savedMap) {
                try {
                    setRosterMap(JSON.parse(savedMap));
                } catch (e) {
                    console.error("Failed to parse roster map", e);
                }
            }
        }
    }, [courseId]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setRubricFile({
                    base64: reader.result,
                    mimeType: file.type,
                    name: file.name
                });
            };
            reader.readAsDataURL(file);
        } else {
            setRubricFile(null);
        }
    };

    useEffect(() => {
        if (session?.accessToken && courseId && assignmentId) {
            setLoading(true);
            fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) throw new Error(data.error);
                    setSubmissions(data.submissions || []);
                    if (data.assignmentDetails) {
                        setAssignmentName(data.assignmentDetails.title || "");
                        setAssignmentInfo(data.assignmentDetails);
                        if (data.assignmentDetails.courseName) {
                            setCourseName(data.assignmentDetails.courseName);
                        }
                    }
                    if (data.submissions?.length > 0) {
                        const firstSub = data.submissions[0];
                        setSelectedSubmission(firstSub);
                        // Load saved student notes & floor
                        const savedNotes = localStorage.getItem(`student_notes_${firstSub.userId}`);
                        setStudentNotes(savedNotes || "");
                        const savedFloor = localStorage.getItem(`student_floor_${firstSub.userId}`);
                        setStudentGradeFloor(savedFloor || "");
                    }
                    setError(null);
                })
                .catch((err) => {
                    console.error(err);
                    setError("Could not load student submissions.");
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [session, courseId, assignmentId]);

    // Fetch the actual Google Doc content when a student is selected
    useEffect(() => {
        if (session?.accessToken && courseId && assignmentId && selectedSubmission) {
            setContentLoading(true);
            setSubmissionContent("");

            fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions/${selectedSubmission.id}`)
                .then((res) => {
                    if (res.status === 401) {
                        throw new Error("Google API token expired. Please log out and log back in to renew your session.");
                    }
                    if (res.status === 403) {
                        throw new Error("Google Drive access denied. Please log out and log back in to grant permission.");
                    }
                    if (!res.ok) throw new Error("Failed to load document content.");
                    return res.json();
                })
                .then((data) => {
                    if (data.data) {
                        setSubmissionContent(data.data);
                        setSubmissionMime(data.mimeType);
                        setSubmissionIsBinary(data.isBinary);
                    } else {
                        // Fallback handling if an old API response accidentally slips in
                        setSubmissionContent(data.content || "Empty document or non-text attachment.");
                        setSubmissionIsBinary(false);
                        setSubmissionMime("text/plain");
                    }

                    // Clear major error if this succeeds (in case they just logged back in)
                    if (error?.includes("Google Drive access")) setError(null);
                })
                .catch((err) => {
                    console.error(err);
                    setSubmissionContent("Error loading content. Ask the student to ensure it is a Google Doc.");
                })
                .finally(() => {
                    setContentLoading(false);
                });
        }
    }, [session, courseId, assignmentId, selectedSubmission]);

    const handleGradeWithAI = async () => {
        if (!selectedSubmission) return;
        setGrading(true);
        setAiFeedback(null);

        try {
            let inlineDataContent = null;
            let submissionTextOnly = submissionContent;

            // If it's a binary file like XLSX, send it as an inline attachment instead of text
            if (submissionIsBinary && submissionContent) {
                submissionTextOnly = "See attached student file.";
                inlineDataContent = {
                    data: submissionContent,
                    mimeType: submissionMime
                };
            }

            // Phase 8: Hardcode Missing Work Logic
            const isNotTurnedIn = selectedSubmission.state !== "TURNED_IN";
            const isTextEmpty = !submissionTextOnly ||
                submissionTextOnly === "Empty document or non-text attachment." ||
                submissionTextOnly.includes("No attachments found") ||
                submissionTextOnly.includes("none of them are Google Drive files") ||
                !submissionTextOnly.trim();

            if (isNotTurnedIn || (isTextEmpty && !inlineDataContent)) {
                let mockGrade = "50";
                if (/\b0\b/.test(studentNotes) || /\bzero\b/i.test(studentNotes)) {
                    mockGrade = "0";
                }
                const mockFeedback = "Missing assignment. No file or text was submitted.";

                // Clamp Grade Floor for mockGrade
                const floorVal = parseFloat(studentGradeFloor);
                const returnedVal = parseFloat(mockGrade);
                if (!isNaN(floorVal) && !isNaN(returnedVal) && returnedVal < floorVal) {
                    mockGrade = floorVal.toString();
                }

                setAiFeedback({ grade: mockGrade, feedback: mockFeedback });
                setBatchResults(prev => ({
                    ...prev,
                    [selectedSubmission.id]: { grade: mockGrade, feedback: mockFeedback }
                }));
                setGrading(false);
                return; // Stop here, no API call
            }

            let runtimeRubric = rubric;
            let runtimeRubricFile = rubricFile ? { data: rubricFile.base64.split(",")[1], mimeType: rubricFile.mimeType } : null;

            if (useStudentAsKey && keyStudentId) {
                const keySub = submissions.find(s => s.userId === keyStudentId);
                if (keySub) {
                    try {
                        const keyRes = await fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions/${keySub.id}`);
                        const docData = await keyRes.json();
                        let keyText = "";
                        if (docData.data) keyText = docData.data;
                        else if (docData.content) keyText = docData.content;
                        if (keyText) {
                            runtimeRubric = `Use the following student submission as the perfect 100% Answer Key. Every other student must be graded strictly against how well their answers match this master student's answers.\n\nAdditional Instructions from Teacher:\n${rubric}\n\n[MASTER STUDENT TEXT]:\n\n` + keyText;
                            runtimeRubricFile = null;
                            if (docData.isBinary && docData.data) {
                                runtimeRubricFile = { data: docData.data, mimeType: docData.mimeType };
                            }
                        }
                    } catch (e) {
                        console.error("Failed to fetch student key", e);
                    }
                }
            }

            const res = await fetch('/api/grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rubric: runtimeRubric,
                    strictness: strictness,
                    submissionText: submissionTextOnly, // Use the real text now or the placeholder if binary
                    studentId: selectedSubmission.userId,
                    studentNotes: studentNotes,
                    studentFile: inlineDataContent,
                    rubricFile: runtimeRubricFile,
                    generateFeedback: generateFeedback
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Failed to generate AI grade.");

            // Clamp Grade Floor
            let finalGradeCalculated = data.grade || "N/A";
            const floorVal = parseFloat(studentGradeFloor);
            const returnedVal = parseFloat(finalGradeCalculated);
            if (!isNaN(floorVal) && !isNaN(returnedVal) && returnedVal < floorVal) {
                finalGradeCalculated = floorVal.toString();
            }

            setAiFeedback({
                grade: finalGradeCalculated,
                feedback: data.feedback || "No feedback returned."
            });
            setBatchResults(prev => ({
                ...prev,
                [selectedSubmission.id]: {
                    ...prev[selectedSubmission.id],
                    grade: finalGradeCalculated,
                    feedback: data.feedback || "No feedback returned."
                }
            }));
        } catch (err) {
            console.error("AI Grading Error:", err);
            setError(err.message || "An error occurred while calling the AI. Did you add the GEMINI_API_KEY to your .env.local?");
        } finally {
            setGrading(false);
        }
    };

    const handleRosterUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            complete: (results) => {
                const data = results.data;
                if (data.length < 9) {
                    setRosterSetupError("Invalid PowerSchool format. Provide the full template.");
                    return;
                }

                try {
                    // Extract headers
                    const teacherName = data[0][1];
                    const className = data[1][1];

                    // Extract Roster
                    // PowerSchool usually has "Student Num,Student Name,Score" on row 8 (index 7)
                    // Data rows start at index 8
                    const map = {};
                    for (let i = 8; i < data.length; i++) {
                        const row = data[i];
                        if (row.length >= 2 && row[0] && row[1]) {
                            const studentNum = row[0].trim();
                            const studentName = row[1].trim(); // "LastName, FirstName"
                            map[studentName] = studentNum;
                        }
                    }

                    const mapObject = {
                        teacherName,
                        className,
                        students: map
                    };

                    setRosterMap(mapObject);
                    localStorage.setItem(`roster_map_${courseId}`, JSON.stringify(mapObject));
                    setShowRosterModal(false);
                    setRosterSetupError("");

                } catch (err) {
                    setRosterSetupError("Failed to parse the PowerSchool template.");
                }
            },
            error: () => {
                setRosterSetupError("Error reading the CSV file.");
            }
        });
    };

    const handleExportCSV = () => {
        if (submissions.length === 0) return;

        // If no map, open Roster Interceptor
        if (!rosterMap || !rosterMap.students) {
            setShowRosterModal(true);
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";

        // 1. Build PowerSchool Header
        const dueDate = assignmentInfo?.dueDate ? `${assignmentInfo.dueDate.year}-${String(assignmentInfo.dueDate.month).padStart(2, '0')}-${String(assignmentInfo.dueDate.day).padStart(2, '0')}` : "";
        const maxPoints = assignmentInfo?.maxPoints ? `${assignmentInfo.maxPoints}.0` : "100.0";

        // PowerSchool requires exactly this structure with exact precision
        csvContent += `Teacher Name:,${rosterMap.teacherName},\n`;
        csvContent += `Class:,${rosterMap.className},\n`;
        csvContent += `Assignment Name:,${assignmentName},\n`;
        csvContent += `Due Date:,${dueDate},\n`;
        csvContent += `Points Possible:,${maxPoints},\n`;
        csvContent += `Extra Points:,0.0,\n`;
        csvContent += `Score Type:,POINTS,\n`;
        csvContent += `Student Num,Student Name,Score\n`;

        // 2. Build Student Rows
        const rosterNames = Object.keys(rosterMap.students);

        submissions.forEach(sub => {
            const result = batchResults[sub.id];
            if (!result || result.grade === "Not Graded" || result.grade === "Error" || result.grade === "Failed" || result.grade === "N/A") return;

            // Generate "LastName, FirstName" string from Google Classroom
            const gn = sub.studentProfile?.name?.givenName || "";
            const fn = sub.studentProfile?.name?.familyName || "";
            const googleConstructedName = `${fn}, ${gn}`;

            // Find best fuzzy match in our Roster Map
            let studentNum = "";
            let matchedName = "";

            if (rosterNames.length > 0) {
                const matchResult = stringSimilarity.findBestMatch(googleConstructedName, rosterNames);
                if (matchResult.bestMatch.rating > 0.6) {
                    matchedName = matchResult.bestMatch.target;
                    studentNum = rosterMap.students[matchedName];
                }
            }

            // Only export if we matched them to a PowerSchool Student Num
            if (studentNum && matchedName) {
                const draftGrade = parseFloat(result.grade);
                if (!isNaN(draftGrade)) {
                    csvContent += `${studentNum},"${matchedName}",${draftGrade}\n`;
                }
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${assignmentName || 'Grading_Results'}_PowerSchool.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleRegradeAll = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to regrade this assignment?\n\nThis will completely erase all existing drafted grades and feedback, and generate brand new evaluations for the entire class."
        );
        if (!confirmed) return;

        // Clear local storage and state
        setBatchResults({});
        localStorage.removeItem(`grades_${courseId}_${assignmentId}`);
        setAiFeedback(null);

        // We can't rely on the synchronous batchResults clear inside handleGradeAll, 
        // because setState is asynchronous. 
        // We'll pass an explicit "forceRegrade" flag to avoid the skip check.
        setTimeout(() => {
            handleGradeAll(true); // Pass a boolean flag
        }, 100);
    };

    const handleGradeAll = async (forceRegrade = false) => {
        if (submissions.length === 0) return;
        setBatchGrading(true);
        setBatchProgress({ current: 0, total: submissions.length });
        setError(null);

        let baselineRubric = rubric;
        let baselineRubricFile = rubricFile ? { data: rubricFile.base64.split(",")[1], mimeType: rubricFile.mimeType } : null;

        if (useStudentAsKey && keyStudentId) {
            const keySub = submissions.find(s => s.userId === keyStudentId);
            if (keySub) {
                try {
                    const keyRes = await fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions/${keySub.id}`);
                    const docData = await keyRes.json();
                    let keyText = "";
                    if (docData.data) keyText = docData.data;
                    else if (docData.content) keyText = docData.content;
                    if (keyText) {
                        baselineRubric = `Use the following student submission as the perfect 100% Answer Key. Every other student must be graded strictly against how well their answers match this master student's answers.\n\nAdditional Instructions from Teacher:\n${rubric}\n\n[MASTER STUDENT TEXT]:\n\n` + keyText;
                        baselineRubricFile = null;
                        if (docData.isBinary && docData.data) {
                            baselineRubricFile = { data: docData.data, mimeType: docData.mimeType };
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch batch student key", e);
                }
            }
        }

        stopGradingRef.current = false;
        let completedCount = 0;
        const CHUNK_SIZE = 5; // Process 5 students simultaneously

        for (let i = 0; i < submissions.length; i += CHUNK_SIZE) {
            if (stopGradingRef.current) break;
            const chunk = submissions.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (sub) => {
                if (stopGradingRef.current) return;

                try {
                    // Skip if already graded in this session (unless forced)
                    // We check the captured batchResults from the top of the function
                    if (!forceRegrade && batchResults[sub.id]) {
                        completedCount++;
                        setBatchProgress({ current: completedCount, total: submissions.length });
                        return;
                    }

                    // 1. Fetch content
                    const docRes = await fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}`);

                    if (docRes.status === 401) {
                        throw new Error("Google API token expired. Please log out and log back in to renew your session.");
                    }
                    if (docRes.status === 403) {
                        throw new Error("Google Drive access denied. Please log out and log back in to grant permission.");
                    }

                    const docData = await docRes.json();

                    if (!docRes.ok) {
                        throw new Error(docData.error || "Failed to load document content.");
                    }

                    let submissionTextForAI = "Empty document or non-text attachment.";
                    let inlineDataForAI = null;

                    if (docData.data && docData.isBinary) {
                        submissionTextForAI = "See attached student file.";
                        inlineDataForAI = {
                            data: docData.data,
                            mimeType: docData.mimeType
                        };
                    } else if (docData.data) {
                        submissionTextForAI = docData.data;
                    } else if (docData.content) {
                        submissionTextForAI = docData.content;
                    }

                    // Get their specific note
                    const sNotes = localStorage.getItem(`student_notes_${sub.userId}`) || "";

                    const isFormSubmission = submissionTextForAI && submissionTextForAI.includes("Google Form Responses for:");
                    const isNotTurnedIn = sub.state !== "TURNED_IN" && !isFormSubmission;
                    const isTextEmpty = !submissionTextForAI ||
                        submissionTextForAI === "Empty document or non-text attachment." ||
                        submissionTextForAI.includes("No attachments found") ||
                        submissionTextForAI.includes("none of them are Google Drive files") ||
                        !submissionTextForAI.trim();

                    if (isNotTurnedIn || (isTextEmpty && !inlineDataForAI)) {
                        let mockGrade = "50";
                        if (/\b0\b/.test(sNotes) || /\bzero\b/i.test(sNotes)) {
                            mockGrade = "0";
                        }
                        const mockFeedback = "Missing assignment. No file or text was submitted.";

                        const sFloor = localStorage.getItem(`student_floor_${sub.userId}`);
                        if (sFloor) {
                            const floorVal = parseFloat(sFloor);
                            const returnedVal = parseFloat(mockGrade);
                            if (!isNaN(floorVal) && !isNaN(returnedVal) && returnedVal < floorVal) {
                                mockGrade = floorVal.toString();
                            }
                        }

                        const resultObj = { grade: mockGrade, feedback: mockFeedback };
                        setBatchResults(prev => ({ ...prev, [sub.id]: resultObj }));

                        if (selectedSubmission && selectedSubmission.id === sub.id) {
                            setAiFeedback(resultObj);
                        }
                        completedCount++;
                        setBatchProgress({ current: completedCount, total: submissions.length });
                        return; // Skip the API call for this student
                    }

                    // 2. Grade
                    const gradeRes = await fetch('/api/grade', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rubric: baselineRubric,
                            strictness: strictness,
                            submissionText: submissionTextForAI,
                            studentId: sub.userId,
                            studentNotes: sNotes,
                            studentFile: inlineDataForAI,
                            rubricFile: baselineRubricFile,
                            generateFeedback: generateFeedback
                        })
                    });

                    const gradeData = await gradeRes.json();

                    if (gradeRes.ok) {
                        let finalGradeCalculated = gradeData.grade || "N/A";

                        // Clamp Grade Floor for Batch Process
                        const sFloor = localStorage.getItem(`student_floor_${sub.userId}`);
                        if (sFloor) {
                            const floorVal = parseFloat(sFloor);
                            const returnedVal = parseFloat(finalGradeCalculated);
                            if (!isNaN(floorVal) && !isNaN(returnedVal) && returnedVal < floorVal) {
                                finalGradeCalculated = floorVal.toString();
                            }
                        }

                        const resultObj = {
                            grade: finalGradeCalculated,
                            feedback: gradeData.feedback || "No feedback returned."
                        };
                        setBatchResults(prev => ({ ...prev, [sub.id]: resultObj }));

                        if (selectedSubmission && selectedSubmission.id === sub.id) {
                            setAiFeedback(resultObj);
                        }
                    } else {
                        const errObj = {
                            grade: "Error",
                            feedback: gradeData.error || "The AI rejected the request."
                        };
                        setBatchResults(prev => ({ ...prev, [sub.id]: errObj }));
                    }

                } catch (err) {
                    console.error("Batch grading error for submission", sub.id, err);
                    const failObj = {
                        grade: "Failed",
                        feedback: err.message || "An unexpected system error occurred."
                    };
                    setBatchResults(prev => ({ ...prev, [sub.id]: failObj }));
                } finally {
                    completedCount++;
                    setBatchProgress({ current: completedCount, total: submissions.length });
                }
            }));
        }

        setBatchGrading(false);
    };

    const handleSyncToClassroom = async () => {
        const studentIdsToSync = Object.keys(batchResults).filter(id => batchResults[id].grade !== "Error" && batchResults[id].grade !== "Failed" && batchResults[id].grade !== "N/A");
        if (studentIdsToSync.length === 0) return;

        setIsSyncing(true);
        let current = 0;

        for (const sub of submissions) {
            if (!studentIdsToSync.includes(sub.id)) continue;

            const gradeString = batchResults[sub.id].grade;
            // Parse to a float to ensure it's a valid number for Google API
            const draftGrade = parseFloat(gradeString);

            if (isNaN(draftGrade)) continue;

            current++;
            setSyncProgress({ current, total: studentIdsToSync.length });

            try {
                const res = await fetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions/${sub.id}/grade`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ draftGrade })
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    console.error("Failed to sync grade for", sub.id, errorData);
                    alert(`Failed to sync a grade: ${errorData.error || res.statusText}`);
                    break;
                }
            } catch (e) {
                console.error("Error syncing grade", e);
                alert("Network error occurred while syncing.");
                break;
            }
        }

        setIsSyncing(false);
        setSyncProgress({ current: 0, total: 0 });
    };

    if (status === "loading" || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                <div className="animate-pulse text-indigo-900 dark:text-indigo-300 font-medium">Loading Workspace...</div>
            </div>
        );
    }

    if (!session) return null;

    const filteredSubmissions = submissions.filter(sub => {
        const result = batchResults[sub.id];
        const isGraded = result && result.grade !== "Not Graded" && result.grade !== "Error" && result.grade !== "Failed" && result.grade !== "N/A";

        if (filterMode === "Graded") return isGraded;
        if (filterMode === "Ungraded") return !isGraded;
        return true;
    });

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/courses/${courseId}`)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300 group flex-shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="min-w-0 pr-4">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-0.5">{courseName || "Loading Course..."}</h2>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-tight truncate">{assignmentName || "Grading Workspace"}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Gemini AI Ready
                    </div>
                </div>
            </header>

            {/* Main Split Layout */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Panel: Roster & Submissions */}
                <div className="w-1/3 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 z-10">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 flex justify-between items-center flex-wrap gap-y-3">
                        <div className="flex w-full justify-between items-center">
                            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                Submissions ({filteredSubmissions.length}/{submissions.length})
                            </h2>
                            <select
                                value={filterMode}
                                onChange={(e) => setFilterMode(e.target.value)}
                                className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="All">Show All</option>
                                <option value="Ungraded">Ungraded Only</option>
                                <option value="Graded">Graded Only</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 w-full justify-end">
                            {Object.keys(batchResults).length > 0 && (
                                <div className="text-xs font-black px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 text-indigo-700 dark:text-indigo-400 mr-2 flex items-center gap-1.5 shadow-sm">
                                    <span className="opacity-70 font-semibold tracking-wider">AVG:</span>
                                    <span className="text-sm">
                                        {Math.round(Object.values(batchResults).reduce((sum, result) => {
                                            const val = parseFloat(result.grade);
                                            return sum + (isNaN(val) ? 0 : val);
                                        }, 0) / Math.max(1, Object.values(batchResults).filter(r => !isNaN(parseFloat(r.grade))).length))}
                                    </span>
                                </div>
                            )}
                            {submissions.length > 0 && (
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm mr-2">
                                    <input
                                        type="checkbox"
                                        checked={generateFeedback}
                                        onChange={(e) => setGenerateFeedback(e.target.checked)}
                                        className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                                    />
                                    Generate Feedback Note
                                </label>
                            )}
                            {submissions.length > 0 && Object.keys(batchResults).length > 0 && (
                                <button
                                    onClick={handleExportCSV}
                                    className="text-xs bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> Export CSV
                                </button>
                            )}
                            {submissions.length > 0 && Object.keys(batchResults).length > 0 && (
                                <button
                                    onClick={handleSyncToClassroom}
                                    disabled={loading || isSyncing}
                                    className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                    {isSyncing ? (
                                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing {syncProgress.current}/{syncProgress.total}</>
                                    ) : (
                                        <><RefreshCw className="w-3.5 h-3.5" /> Sync to Google</>
                                    )}
                                </button>
                            )}
                            {submissions.length > 0 && (
                                batchGrading ? (
                                    <button
                                        onClick={() => { stopGradingRef.current = true; }}
                                        className="text-xs bg-red-100 text-red-700 dark:text-red-400 hover:bg-red-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors"
                                    >
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-700"></div> Stop Grading
                                    </button>
                                ) : (
                                    <>
                                        {Object.keys(batchResults).length > 0 && (
                                            <button
                                                onClick={handleRegradeAll}
                                                disabled={loading}
                                                className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" /> Regrade All
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleGradeAll(false)}
                                            disabled={loading}
                                            className="text-xs bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                        >
                                            <ListChecks className="w-3.5 h-3.5" /> {Object.keys(batchResults).length > 0 ? "Grade Remaining" : "Grade All"}
                                        </button>
                                    </>
                                )
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {filteredSubmissions.length === 0 ? (
                            <div className="text-center p-6 text-slate-500 dark:text-slate-400 text-sm">No submissions match the current view.</div>
                        ) : (
                            filteredSubmissions.map((sub) => (
                                <div
                                    key={sub.id}
                                    onClick={() => {
                                        setSelectedSubmission(sub);
                                        setAiFeedback(batchResults[sub.id] || null);
                                        const savedNotes = localStorage.getItem(`student_notes_${sub.userId}`);
                                        setStudentNotes(savedNotes || "");
                                        const savedFloor = localStorage.getItem(`student_floor_${sub.userId}`);
                                        setStudentGradeFloor(savedFloor || "");
                                    }}
                                    className={`relative p-4 rounded-xl cursor-pointer border transition-all ${selectedSubmission?.id === sub.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 shadow-sm' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 hover:bg-slate-50'}`}
                                >
                                    {batchResults[sub.id] && (
                                        <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-indigo-500 text-white px-2 py-0.5 min-w-[1.5rem] rounded-full flex items-center justify-center shadow-sm border-2 border-white text-xs font-bold z-10">
                                            {batchResults[sub.id].grade}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-slate-900 dark:text-slate-50">{sub.studentProfile?.name?.fullName || "Student Name"}</span>
                                        {sub.state === "TURNED_IN" && (
                                            <span className="text-[10px] uppercase tracking-wider font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                        <FileText className="w-3 h-3" />
                                        {sub.assignmentSubmission?.attachments?.length || 0} Attachments
                                    </div>

                                    {/* Thumbnail Previews */}
                                    <div className="flex flex-wrap gap-2">
                                        {sub.assignmentSubmission?.attachments?.map((att, i) => (
                                            att.driveFile?.thumbnailUrl && (
                                                <div key={i} className="flex-1 min-w-[30%] max-w-[80px] bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm aspect-video relative">
                                                    <a href={att.driveFile?.alternateLink || "#"} target="_blank" rel="noopener noreferrer">
                                                        <img
                                                            src={`/api/drive/thumbnail?url=${encodeURIComponent(att.driveFile.thumbnailUrl)}`}
                                                            alt="Attachment Thumbnail"
                                                            className="absolute inset-0 w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                                                        />
                                                    </a>
                                                </div>
                                            )
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Panel: Grading & AI */}
                <div className="flex-1 flex flex-col bg-slate-50/50 overflow-y-auto relative">
                    {error ? (
                        <div className="m-8 p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800">{error}</div>
                    ) : !selectedSubmission ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3">
                            <FileText className="w-12 h-12 opacity-50" />
                            <p>Select a student submission to begin grading</p>
                        </div>
                    ) : (
                        <div className="p-8 max-w-4xl mx-auto w-full space-y-8 pb-24">

                            {/* Submission Content Area */}
                            <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                                <h3 className="text-lg font-bold border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 flex justify-between items-center text-slate-900 dark:text-slate-50">
                                    {selectedSubmission.studentProfile?.name?.fullName}'s Work
                                </h3>

                                {contentLoading ? (
                                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 justify-center p-8 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                                        Fetching Document from Drive...
                                    </div>
                                ) : submissionIsBinary ? (
                                    <div className="bg-indigo-50 dark:bg-indigo-900/40 p-6 rounded-xl text-center border border-indigo-100 shadow-inner my-4">
                                        <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2 text-xl">Spreadsheet / Binary File Attached</h4>
                                        <p className="text-sm text-indigo-700 dark:text-indigo-400 max-w-md mx-auto">This file has been securely imported as a binary document to preserve its formulas and formatting. You cannot preview it here, but it will be safely sent directly to Gemini when you generate the grade.</p>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl text-sm text-slate-800 dark:text-slate-200 font-serif border border-slate-200 dark:border-slate-800 shadow-inner max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                        {submissionContent}
                                    </div>
                                )}
                            </div>

                            {/* AI Grading Controls */}
                            <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                                <h3 className="text-lg font-bold border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2 text-slate-900 dark:text-slate-50">
                                    <Settings2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    AI Grading Controls
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Grading Strictness</label>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">Easy (1)</span>
                                            <input
                                                type="range"
                                                min="1" max="10"
                                                value={strictness}
                                                onChange={(e) => setStrictness(parseInt(e.target.value))}
                                                className="flex-1 accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded">Hard (10)</span>
                                        </div>
                                        <div className="text-center text-sm font-bold text-indigo-700 dark:text-indigo-400 mt-2 mb-4">Level: {strictness}</div>

                                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer p-2 hover:bg-slate-50 dark:bg-slate-900 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:border-slate-800">
                                            <input
                                                type="checkbox"
                                                checked={generateFeedback}
                                                onChange={(e) => setGenerateFeedback(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 dark:text-indigo-400 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                                            />
                                            Generate AI Feedback Note for Student
                                        </label>
                                    </div>

                                    <div>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Student-Specific Context</label>
                                                <textarea
                                                    value={studentNotes}
                                                    onChange={(e) => {
                                                        setStudentNotes(e.target.value);
                                                        localStorage.setItem(`student_notes_${selectedSubmission.userId}`, e.target.value);
                                                    }}
                                                    placeholder="e.g. Needs easier grading because they are ELL..."
                                                    className="w-full h-20 p-3 text-sm border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y bg-yellow-50/30 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                                                ></textarea>
                                            </div>
                                            <div className="w-32">
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Grade Floor</label>
                                                <input
                                                    type="number"
                                                    value={studentGradeFloor}
                                                    onChange={(e) => {
                                                        setStudentGradeFloor(e.target.value);
                                                        localStorage.setItem(`student_floor_${selectedSubmission.userId}`, e.target.value);
                                                    }}
                                                    placeholder="e.g. 50"
                                                    className="w-full h-20 p-3 text-center text-xl font-black border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-indigo-50/50 text-indigo-700 dark:text-indigo-400 placeholder:text-indigo-300 placeholder:font-normal placeholder:text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-end mb-2">
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Answer Key / Rubric</label>

                                            <label className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-400 cursor-pointer bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-800/60">
                                                <input
                                                    type="checkbox"
                                                    checked={useStudentAsKey}
                                                    onChange={(e) => setUseStudentAsKey(e.target.checked)}
                                                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                                                />
                                                Use a Student as Key
                                            </label>

                                            {!useStudentAsKey && (
                                                <div className="flex items-center gap-2">
                                                    {rubricFile && (
                                                        <button
                                                            onClick={() => setRubricFile(null)}
                                                            className="text-xs bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-400 px-2 py-1.5 rounded-lg flex items-center gap-1 font-bold border border-red-200 dark:border-red-800 transition-colors z-10"
                                                            title="Remove attached Answer Key"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Clear
                                                        </button>
                                                    )}
                                                    <div className="relative">
                                                        <input
                                                            type="file"
                                                            accept="image/*,.pdf"
                                                            onChange={handleFileChange}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                        />
                                                        <button type="button" className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium border border-slate-300 dark:border-slate-700 transition-colors">
                                                            <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                                            <span className="max-w-[150px] truncate">{rubricFile ? rubricFile.name : "Upload File (PDF/Image)"}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {useStudentAsKey && (
                                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 mt-2 mb-4">
                                                <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2 uppercase tracking-wide">Select Master Student</label>
                                                <select
                                                    value={keyStudentId}
                                                    onChange={(e) => setKeyStudentId(e.target.value)}
                                                    className="w-full p-2.5 text-sm font-semibold border-2 border-indigo-200 dark:border-indigo-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm"
                                                >
                                                    <option value="" disabled>-- Select a student who got 100% --</option>
                                                    {submissions.map(sub => (
                                                        <option key={sub.userId} value={sub.userId}>
                                                            {sub.studentProfile?.name?.fullName || sub.userId}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">Every other student will be graded based on how closely their answers match this selected student's work.</p>
                                            </div>
                                        )}
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{useStudentAsKey ? "Additional Instructions for AI (Optional)" : "Rubric / Answer Key Content"}</label>
                                        <textarea
                                            value={rubric}
                                            onChange={(e) => setRubric(e.target.value)}
                                            placeholder={useStudentAsKey ? "e.g. Ignore minor spelling mistakes..." : "Paste the grading rubric or correct answers here, or upload a file above..."}
                                            className="w-full h-32 p-3 text-sm border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                                        ></textarea>
                                    </div>

                                    <button
                                        onClick={handleGradeWithAI}
                                        disabled={grading}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.99]"
                                    >
                                        {grading ? (
                                            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Analyzing...</>
                                        ) : (
                                            <><Sparkles className="w-5 h-5" /> Generate AI Grade</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* AI Feedback Results */}
                            {!aiFeedback && !contentLoading && (
                                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-4 duration-300 mt-6">
                                    <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-2">Manual Grade Entry</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">This submission is ungraded. You can manually assign a grade bypassing the AI.</p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            placeholder="Grade"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const newGrade = e.target.value;
                                                    if (!newGrade) return;
                                                    setAiFeedback({ grade: newGrade, feedback: "Manually graded by teacher." });
                                                    setBatchResults(prev => ({
                                                        ...prev,
                                                        [selectedSubmission.id]: {
                                                            grade: newGrade,
                                                            feedback: "Manually graded by teacher."
                                                        }
                                                    }));
                                                }
                                            }}
                                            className="text-lg font-bold text-slate-900 dark:text-slate-50 border border-slate-300 rounded inline-block w-24 px-3 py-1 outline-none text-center"
                                        />
                                        <span className="text-xs text-slate-400">Press Enter to save</span>
                                    </div>
                                </div>
                            )}

                            {aiFeedback && (
                                <div className="bg-indigo-50 dark:bg-indigo-900/40 p-6 rounded-2xl border border-indigo-100 animate-in slide-in-from-bottom-4 duration-300 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200 rounded-full blur-3xl opacity-30 -mr-10 -mt-10 pointer-events-none"></div>
                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <h3 className="font-bold text-indigo-900 dark:text-indigo-300 border-b border-indigo-200/50 pb-2 w-full flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-5 h-5" />
                                                AI Evaluation Result
                                            </div>
                                        </h3>
                                    </div>

                                    <div className="mb-4 relative z-10">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs uppercase tracking-wider font-bold text-indigo-500 block">Final Grade Override</span>
                                            <button onClick={() => {
                                                setAiFeedback(null);
                                                setBatchResults(prev => {
                                                    const next = { ...prev };
                                                    delete next[selectedSubmission.id];
                                                    return next;
                                                });
                                            }} className="text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded transition-colors">🗑️ Clear Grade</button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                value={aiFeedback.grade}
                                                onChange={(e) => {
                                                    const newGrade = e.target.value;
                                                    setAiFeedback({ ...aiFeedback, grade: newGrade });
                                                    setBatchResults(prev => ({
                                                        ...prev,
                                                        [selectedSubmission.id]: {
                                                            ...prev[selectedSubmission.id],
                                                            grade: newGrade,
                                                            feedback: prev[selectedSubmission.id]?.feedback || aiFeedback.feedback
                                                        }
                                                    }));
                                                }}
                                                className="text-3xl font-black text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-950 border border-indigo-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none w-24 rounded-lg text-center shadow-sm py-1"
                                            />
                                            <div className="flex flex-col gap-1 text-indigo-500">
                                                <button onClick={() => {
                                                    const current = parseFloat(aiFeedback.grade) || 0;
                                                    const updated = String(current + 1);
                                                    setAiFeedback({ ...aiFeedback, grade: updated });
                                                    setBatchResults(prev => ({
                                                        ...prev,
                                                        [selectedSubmission.id]: {
                                                            ...prev[selectedSubmission.id],
                                                            grade: updated,
                                                            feedback: prev[selectedSubmission.id]?.feedback || aiFeedback.feedback
                                                        }
                                                    }));
                                                }} className="hover:bg-indigo-100 dark:bg-indigo-900/60 hover:text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-950 border border-indigo-100 shadow-sm rounded p-1 transition-colors leading-none font-bold text-lg px-2">▲</button>
                                                <button onClick={() => {
                                                    const current = parseFloat(aiFeedback.grade) || 0;
                                                    const updated = String(Math.max(0, current - 1));
                                                    setAiFeedback({ ...aiFeedback, grade: updated });
                                                    setBatchResults(prev => ({
                                                        ...prev,
                                                        [selectedSubmission.id]: {
                                                            ...prev[selectedSubmission.id],
                                                            grade: updated,
                                                            feedback: prev[selectedSubmission.id]?.feedback || aiFeedback.feedback
                                                        }
                                                    }));
                                                }} className="hover:bg-indigo-100 dark:bg-indigo-900/60 hover:text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-950 border border-indigo-100 shadow-sm rounded p-1 transition-colors leading-none font-bold text-lg px-2">▼</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative z-10">
                                        <span className="text-xs uppercase tracking-wider font-bold text-indigo-500 mb-2 block">Feedback to Student</span>
                                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap shadow-sm border border-indigo-100/50">
                                            {aiFeedback.feedback}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* PowerSchool Map Interceptor Modal */}
            {showRosterModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-indigo-50/50">
                            <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                                <ListChecks className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                Roster Mapping Required
                            </h2>
                            <button onClick={() => setShowRosterModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 p-1 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 text-sm text-slate-700 dark:text-slate-300">
                            <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200/50">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                                <p>
                                    To export an <strong>exact PowerSchool CSV</strong>, SmartGrader needs to learn how to map Google Classroom names to your PowerSchool Student Numbers.
                                </p>
                            </div>
                            <p className="font-medium text-slate-900 dark:text-slate-50">
                                Please upload one standard PowerSchool Export CSV for this specific class. You only need to do this once per class!
                            </p>

                            {rosterSetupError && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 border border-red-200 dark:border-red-800 rounded-lg text-sm font-semibold">
                                    {rosterSetupError}
                                </div>
                            )}

                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-700 border-dashed rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:bg-indigo-900/40 hover:border-indigo-300 transition-colors group relative overflow-hidden">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:text-indigo-400 transition-colors z-10 p-4 text-center">
                                    <UploadCloud className="w-8 h-8 mb-2" />
                                    <p className="mb-1 text-sm font-bold">Select Roster CSV</p>
                                    <p className="text-xs text-slate-400 group-hover:text-indigo-400">Must be a direct PowerSchool export</p>
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept=".csv"
                                    onChange={handleRosterUpload}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
