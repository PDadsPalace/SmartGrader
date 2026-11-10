// Interactive YouTube question scores → PowerSchool.
// Google Classroom never puts these scores into the assignment grade and the Classroom API doesn't
// expose them, so a bookmarklet reads them from the assignment's "Class insights" page and hands
// them to SmartGrader's /video-scores page (window.postMessage, with a clipboard copy as backup).

export const SG_ORIGIN = "https://www.smartgraider.com";
export const MESSAGE_TYPE = "sg-video-scores";

// Runs on classroom.google.com. Kept free of // comments so it works as a one-line bookmark.
const BOOKMARKLET_SOURCE = `(()=>{
const f=[...document.querySelectorAll('iframe')].find(x=>x.src.includes('/ps/dashboard'));
if(!f||!f.contentDocument){alert('SmartGrAIder: open the video\\'s Class insights first.\\n\\nIn Classroom: open the assignment, click Student work, then click the YouTube video card at the top right. Then click this bookmark again.');return;}
const t=f.contentDocument.body.innerText;
const a=t.indexOf('All students');const b=t.indexOf('Problem 1\\n');
const seg=t.slice(a<0?0:a,b>a?b:undefined);
const re=/\\n([^\\n\\t\\d][^\\n]*?)\\s*\\n\\s*(\\d+)\\s*\\/\\s*(\\d+)/g;const rows=[];let m;
while((m=re.exec(seg)))rows.push([m[1].trim(),+m[2],+m[3]]);
if(!rows.length){alert('SmartGrAIder: no scores found yet. Wait for the student list to load, then try again.');return;}
const v=(t.slice(t.lastIndexOf('All students',b)+12,b).trim().split('\\n')[0]||'').trim();
const p={v:1,url:location.href,assignment:document.title.replace(/\\s*-\\s*Classroom\\s*$/,''),video:v,course:(document.querySelector('[data-course-id] h1, header h1')||{}).innerText||'',rows,at:new Date().toISOString()};
try{navigator.clipboard.writeText(JSON.stringify(p)).catch(()=>{});}catch(e){}
const w=window.open('${SG_ORIGIN}/video-scores','sgVideoScores');
if(!w){alert('SmartGrAIder: '+rows.length+' scores copied. Pop-ups are blocked, so open SmartGrAIder > Video Scores and click Paste.');return;}
let n=0;const h=setInterval(()=>{try{w.postMessage({type:'${MESSAGE_TYPE}',payload:p},'${SG_ORIGIN}');}catch(e){}if(++n>60)clearInterval(h);},500);
window.addEventListener('message',e=>{if(e.origin==='${SG_ORIGIN}'&&e.data==='sg-video-ack')clearInterval(h);});
})();`;

export const BOOKMARKLET = "javascript:" + encodeURIComponent(BOOKMARKLET_SOURCE.replace(/\n/g, ""));

// Classroom URLs carry base64 ids: /c/<courseId b64>/a/<courseWorkId b64>/...
export function idsFromClassroomUrl(url) {
    try {
        const m = String(url).match(/\/c\/([A-Za-z0-9_-]+)\/a\/([A-Za-z0-9_-]+)/);
        if (!m) return {};
        const dec = (s) => { const v = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return /^\d+$/.test(v) ? v : null; };
        return { courseId: dec(m[1]), courseWorkId: dec(m[2]) };
    } catch { return {}; }
}

export function validPayload(p) {
    return p && p.v === 1 && typeof p.url === "string" && p.url.startsWith("https://classroom.google.com/")
        && Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length < 500
        && p.rows.every((r) => Array.isArray(r) && typeof r[0] === "string" && Number.isFinite(r[1]) && Number.isFinite(r[2]) && r[2] > 0);
}

export function splitName(full) {
    const parts = String(full).trim().split(/\s+/);
    return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

export const scaled = (correct, total, maxPoints) => Math.round((correct / total) * (maxPoints || 100));

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

// Same layout SmartGrader's assignment-page PowerSchool export uses.
export function powerSchoolCsv({ teacherName, className, assignmentName, dueDate, maxPoints, lines }) {
    let s = "";
    s += `Teacher Name:,${teacherName || ""},\n`;
    s += `Class:,${className || ""},\n`;
    s += `Assignment Name:,${csvCell(assignmentName)},\n`;
    s += `Due Date:,${dueDate || ""},\n`;
    s += `Points Possible:,${Number(maxPoints || 100).toFixed(1)},\n`;
    s += `Extra Points:,0.0,\n`;
    s += `Score Type:,POINTS,\n`;
    s += `Student Num,Student Name,Score\n`;
    for (const l of lines) s += `${l.studentNum},"${l.rosterName}",${l.score}\n`;
    return s;
}

// Parse a PowerSchool score-import template (same rules as the assignment page).
export function parseRosterTemplate(data) {
    if (!Array.isArray(data) || data.length < 9) throw new Error("That doesn't look like a PowerSchool template. Use the full score-import template file.");
    const students = {};
    for (let i = 8; i < data.length; i++) {
        const row = data[i];
        if (row && row.length >= 2 && row[0] && row[1]) students[String(row[1]).trim()] = String(row[0]).trim();
    }
    if (!Object.keys(students).length) throw new Error("No students found in that template.");
    return { teacherName: data[0][1], className: data[1][1], students };
}
