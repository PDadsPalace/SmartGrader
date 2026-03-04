import { google } from "googleapis";

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
                            data: `The student submitted an unsupported file format (${finalMimeType}). The AI currently only supports Google Docs, Google Sheets, PDFs, text files, and images. Please manually review their file from Google Classroom.`,
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
