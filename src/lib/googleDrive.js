import { google } from "googleapis";
import { workbookToText } from "./spreadsheetText";

// Initialize the Google Drive client using an OAuth2 access token
export function getDriveClient(accessToken) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

// Specifically exports a Google Doc file to plain text
export async function exportGoogleDocToText(accessToken, fileId) {
    try {
        const drive = getDriveClient(accessToken);

        // 1. Get file metadata to check its mimeType
        const fileMeta = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name'
        });

        const mimeType = fileMeta.data.mimeType;
        let response;

        // Spreadsheets (Google Sheets and uploaded Excel files): send the AI the cell values and formulas
        // as text. A PDF picture of a sparse sheet often looked blank and got a 0.
        const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (mimeType === 'application/vnd.google-apps.spreadsheet' || mimeType === XLSX) {
            try {
                const res = mimeType === XLSX
                    ? await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
                    : await drive.files.export({ fileId, mimeType: XLSX }, { responseType: 'arraybuffer' });
                const { text } = await workbookToText(Buffer.from(res.data));
                // Also send the usual picture of a Google Sheet (as before), so the AI still sees
                // formatting: bold headers, borders, colors, $ and % number formats, and how charts look.
                let extraBinary = null;
                if (mimeType !== XLSX) {
                    try {
                        const pdf = await drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
                        const b64 = Buffer.from(pdf.data).toString('base64');
                        if (b64.length < 2_000_000) extraBinary = { data: b64, mimeType: 'application/pdf' };
                    } catch { /* picture is optional */ }
                }
                return { data: text, mimeType: 'text/plain', isBinary: false, extraBinary };
            } catch (sheetErr) {
                console.error(`Spreadsheet-to-text failed for ${fileId}, falling back to PDF:`, sheetErr.message);
                if (mimeType === XLSX) {
                    return { data: 'Fatal Error: This Excel file could not be read. Ask the student to open it in Google Sheets (File > Save as Google Sheets) and turn that in.', mimeType: 'text/plain', isBinary: false };
                }
            }
        }

        // 2. Export if it's a Google Workspace Document, otherwise Download
        let finalMimeType = mimeType;
        if (mimeType.startsWith('application/vnd.google-apps.')) {
            // Choose export format based on Google App type
            finalMimeType = 'text/plain';
            if (mimeType === 'application/vnd.google-apps.spreadsheet') {
                finalMimeType = 'application/pdf'; // Export as PDF so Gemini inlineData supports it
            }

            response = await drive.files.export({
                fileId: fileId,
                mimeType: finalMimeType,
            }, { responseType: 'stream' });
        } else {
            // It's a binary file (PDF, MS Word, plain text, etc) stored in Drive
            response = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'stream' });
        }

        return new Promise((resolve, reject) => {
            const chunks = [];
            response.data
                .on('data', chunk => { chunks.push(chunk); })
                .on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const isBinary = !finalMimeType.startsWith('text/') && finalMimeType !== 'application/rtf';

                    const supportedBinaryPrefixes = ['image/', 'audio/', 'video/'];
                    const isSupportedInlineData = finalMimeType === 'application/pdf' || supportedBinaryPrefixes.some(p => finalMimeType.startsWith(p));

                    if (isBinary && !isSupportedInlineData) {
                        resolve({
                            data: `Fatal Error: The student submitted an unsupported file format (${finalMimeType}). The AI currently only supports Google Docs, Google Sheets, PDFs, text files, and images.\n\nTo prevent this, ensure your Google Classroom attachments are native Google Workspace formats (like Google Sheets), rather than Microsoft formats (.xls / .docx).`,
                            mimeType: 'text/plain',
                            isBinary: false
                        });
                    } else {
                        resolve({
                            data: isBinary ? buffer.toString('base64') : buffer.toString('utf-8'),
                            mimeType: finalMimeType,
                            isBinary: isBinary
                        });
                    }
                })
                .on('error', err => {
                    console.error("Error streaming Google Drive file:", err);
                    reject(err);
                });
        });
    } catch (error) {
        console.error(`Error exporting Google Doc ${fileId}:`, error);
        return null; // Return null on failure instead of throwing so it doesn't crash the whole UI
    }
}
