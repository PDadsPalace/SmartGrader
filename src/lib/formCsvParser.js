/**
 * Parse Form Responses from a CSV array (e.g. downloaded from Google Form / Sheet response tab)
 * Matches student by Email or Name, compiles Question Prompts & Student Answers for AI grading.
 */
export function parseGoogleFormCSV(csvRows, studentEmail, studentName) {
    if (!csvRows || csvRows.length < 2) {
        return { error: "CSV file is empty or missing headers." };
    }

    const headers = csvRows[0].map(h => String(h || "").trim());
    if (headers.length === 0) return { error: "No headers found in CSV." };

    // Identify key column indices
    let emailIdx = -1;
    let nameIdx = -1;
    let scoreIdx = -1;
    let timestampIdx = -1;

    headers.forEach((h, idx) => {
        const lower = h.toLowerCase();
        if (lower.includes("email")) emailIdx = idx;
        else if (lower.includes("name") || lower.includes("student")) nameIdx = idx;
        else if (lower.includes("score") || lower.includes("grade") || lower.includes("points")) scoreIdx = idx;
        else if (lower.includes("timestamp")) timestampIdx = idx;
    });

    // Find student's matching row
    let matchedRow = null;

    if (studentEmail && emailIdx !== -1) {
        const targetEmail = studentEmail.toLowerCase().trim();
        matchedRow = csvRows.slice(1).find(row => row[emailIdx] && String(row[emailIdx]).toLowerCase().trim() === targetEmail);
    }

    if (!matchedRow && studentName) {
        const cleanTarget = studentName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetParts = studentName.toLowerCase().split(' ').filter(p => p.length >= 3);

        matchedRow = csvRows.slice(1).find(row => {
            if (nameIdx !== -1 && row[nameIdx]) {
                const cleanRowName = String(row[nameIdx]).toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanRowName && (cleanRowName.includes(cleanTarget) || cleanTarget.includes(cleanRowName))) return true;
            }
            // Check all cells for name match
            const rowText = row.join(" ").toLowerCase().replace(/[^a-z0-9]/g, '');
            if (targetParts.length > 0 && targetParts.every(part => rowText.includes(part))) return true;
            return false;
        });
    }

    if (!matchedRow) {
        return {
            content: `Unmatched Form CSV: Could not find a CSV response row matching student '${studentName || studentEmail}'.`
        };
    }

    // Extract native score if available in Score column (e.g. "18 / 20" or "90%")
    let nativeGrade = null;
    if (scoreIdx !== -1 && matchedRow[scoreIdx]) {
        const rawScore = String(matchedRow[scoreIdx]).trim();
        const fractionMatch = rawScore.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        if (fractionMatch) {
            const earned = parseFloat(fractionMatch[1]);
            const total = parseFloat(fractionMatch[2]);
            if (total > 0) {
                nativeGrade = Math.round((earned / total) * 100).toString();
            }
        } else {
            const pctMatch = rawScore.match(/(\d+(?:\.\d+)?)%/);
            if (pctMatch) {
                nativeGrade = Math.round(parseFloat(pctMatch[1])).toString();
            }
        }
    }

    // Compile Question Prompts and Answers
    let compiledText = `Google Form Responses (CSV Import) for: ${studentName || studentEmail}\n`;
    compiledText += `====================================================\n\n`;

    headers.forEach((header, idx) => {
        if (idx === timestampIdx || idx === scoreIdx) return;
        const answer = matchedRow[idx] !== undefined && matchedRow[idx] !== null ? String(matchedRow[idx]).trim() : "No Answer / Blank";

        compiledText += `Question: ${header}\n`;
        compiledText += `Student Answer: ${answer}\n`;
        compiledText += `\n------------------------\n\n`;
    });

    return {
        isBinary: false,
        mimeType: 'text/plain',
        content: compiledText,
        nativeGrade: nativeGrade
    };
}
