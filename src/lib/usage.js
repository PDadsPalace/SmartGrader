// Records each Gemini call's tokens and dollar cost against the signed-in teacher.
// Never throws — a logging problem must not break grading.
import { FieldValue } from "firebase-admin/firestore";
import { getDb, isFirestoreConfigured } from "./firebaseAdmin";
import { costFromUsage, monthKey } from "./pricing";

export async function recordUsage({ email, route, model = "gemini-2.5-flash", response }) {
    try {
        if (!email || !response || !isFirestoreConfigured()) return;
        const { inputTokens, cachedTokens, outputTokens, costUsd } = costFromUsage(model, response.usageMetadata);
        const key = email.toLowerCase();
        const month = monthKey();
        const db = getDb();
        const inc = FieldValue.increment;
        await db.collection("usage").doc(month).collection("users").doc(key).set({
            email: key,
            month,
            calls: inc(1),
            inputTokens: inc(inputTokens),
            cachedTokens: inc(cachedTokens),
            outputTokens: inc(outputTokens),
            costUsd: inc(costUsd),
            byRoute: { [route]: { calls: inc(1), costUsd: inc(costUsd) } },
            lastUsed: FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (err) {
        console.error("recordUsage failed (grading unaffected):", err.message);
    }
}
