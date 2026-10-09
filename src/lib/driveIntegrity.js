import { getDriveClient } from "@/lib/googleDrive";

// ---------------------------------------------------------------------------
// Academic-integrity data collection (Drive side)
//
// These helpers only READ metadata that SmartGrader's existing drive.readonly
// permission already covers. They never throw — on any failure they return
// null / partial data so grading is never blocked by an integrity check.
// ---------------------------------------------------------------------------

const GOOGLE_TEXT_TYPES = [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
];

/**
 * Lightweight file history: owner, created/modified times and the list of
 * saved versions (timestamps + who saved them). Two small API calls run in
 * parallel; designed to run alongside the text export so it adds ~no time.
 */
export async function getFileIntegrity(accessToken, fileId) {
    try {
        const drive = getDriveClient(accessToken);

        const [metaRes, revRes] = await Promise.allSettled([
            drive.files.get({
                fileId,
                fields: "id, name, mimeType, createdTime, modifiedTime, owners(displayName, emailAddress), lastModifyingUser(displayName, emailAddress)",
                supportsAllDrives: true,
            }),
            listAllRevisions(drive, fileId, "revisions(id, modifiedTime, lastModifyingUser(displayName, emailAddress))"),
        ]);

        if (metaRes.status !== "fulfilled") return null;
        const meta = metaRes.value.data;

        const revisions = revRes.status === "fulfilled"
            ? revRes.value.map(r => ({
                time: r.modifiedTime,
                name: r.lastModifyingUser?.displayName || null,
                email: r.lastModifyingUser?.emailAddress || null,
            }))
            : null; // null = "couldn't read history" (not the same as zero versions)

        return {
            fileId: meta.id,
            title: meta.name,
            mimeType: meta.mimeType,
            createdTime: meta.createdTime || null,
            modifiedTime: meta.modifiedTime || null,
            owners: (meta.owners || []).map(o => ({ name: o.displayName || null, email: o.emailAddress || null })),
            revisions,
        };
    } catch (err) {
        console.warn(`Integrity metadata unavailable for ${fileId}:`, err?.message);
        return null;
    }
}

async function listAllRevisions(drive, fileId, fields) {
    let all = [];
    let pageToken;
    let guard = 0;
    do {
        const res = await drive.revisions.list({
            fileId,
            pageSize: 1000,
            pageToken,
            fields: `nextPageToken, ${fields}`,
        });
        all = all.concat(res.data.revisions || []);
        pageToken = res.data.nextPageToken;
    } while (pageToken && ++guard < 5);
    return all;
}

const countWords = (text) => (text.match(/[A-Za-z0-9À-ɏ']+/g) || []).length;

/**
 * Deeper, on-demand check (only runs when the teacher clicks "Show typing
 * timeline"): downloads the text of each saved version and counts words, so
 * we can show how the document grew over time. A paste shows up as a big
 * one-step jump.
 */
export async function getTypingTimeline(accessToken, fileId, { maxPoints = 40 } = {}) {
    const drive = getDriveClient(accessToken);

    const meta = await drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true });
    if (!GOOGLE_TEXT_TYPES.includes(meta.data.mimeType)) {
        return { supported: false, reason: "The typing timeline works for Google Docs and Slides only." };
    }

    const revisions = await listAllRevisions(
        drive,
        fileId,
        "revisions(id, modifiedTime, exportLinks, lastModifyingUser(displayName, emailAddress))"
    );
    if (revisions.length === 0) {
        return { supported: true, points: [], totalVersions: 0 };
    }

    // Sample evenly if the history is long, always keeping first and last.
    let sample = revisions;
    if (revisions.length > maxPoints) {
        const step = (revisions.length - 1) / (maxPoints - 1);
        const idx = new Set();
        for (let i = 0; i < maxPoints; i++) idx.add(Math.round(i * step));
        sample = [...idx].sort((a, b) => a - b).map(i => revisions[i]);
    }

    // Reuse the OAuth client's token for raw export-link downloads.
    const token = accessToken;
    const fetchWords = async (rev) => {
        const link = rev.exportLinks?.["text/plain"];
        if (!link) return null;
        try {
            const res = await fetch(link, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return null;
            const text = await res.text();
            return countWords(text);
        } catch {
            return null;
        }
    };

    // Small worker pool so we don't hammer Google.
    const results = new Array(sample.length).fill(null);
    let cursor = 0;
    const workers = Array(Math.min(6, sample.length)).fill(null).map(async () => {
        while (cursor < sample.length) {
            const i = cursor++;
            results[i] = await fetchWords(sample[i]);
        }
    });
    await Promise.all(workers);

    const points = sample
        .map((rev, i) => ({
            time: rev.modifiedTime,
            words: results[i],
            name: rev.lastModifyingUser?.displayName || null,
            email: rev.lastModifyingUser?.emailAddress || null,
        }))
        .filter(p => p.words !== null);

    if (points.length === 0) {
        return { supported: false, reason: "Google didn't allow SmartGrader to download the old versions of this file. Use File → Version history in the Doc instead." };
    }

    return { supported: true, points, totalVersions: revisions.length, sampled: sample.length < revisions.length };
}
