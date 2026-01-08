import { NextResponse } from "next/server";
import { db, storage } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
    try {
        // Optional: Add a simple auth check to prevent unauthorized access
        const { secret } = await req.json().catch(() => ({}));
        const expectedSecret = process.env.SYNC_SECRET;

        if (expectedSecret && secret !== expectedSecret) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const bucket = storage.bucket('melaleuca-mirror.firebasestorage.app');
        const [files] = await bucket.getFiles({ prefix: 'sessions/' });

        // Get unique session folder names
        const sessionFolders = new Set<string>();
        files.forEach(file => {
            const match = file.name.match(/^sessions\/([^\/]+)\//);
            if (match) sessionFolders.add(match[1]);
        });

        console.log(`Found ${sessionFolders.size} session folders in Storage`);

        const results = {
            totalFolders: sessionFolders.size,
            alreadySynced: 0,
            newlyCreated: 0,
            failed: 0,
            details: [] as { sessionId: string; status: string; error?: string }[],
        };

        for (const sessionId of sessionFolders) {
            try {
                const docRef = db.collection('sessions').doc(sessionId);
                const doc = await docRef.get();

                if (doc.exists) {
                    results.alreadySynced++;
                    results.details.push({ sessionId, status: 'already_exists' });
                    continue;
                }

                // Determine createdAt from sessionId (if it's a timestamp) or use current time
                const createdAt = /^\d+$/.test(sessionId)
                    ? parseInt(sessionId)
                    : Date.now();

                // Check which files exist in this session folder
                const sessionFiles = files.filter(f => f.name.startsWith(`sessions/${sessionId}/`));
                const fileNames = sessionFiles.map(f => f.name.split('/').pop());

                const hasOriginal = fileNames.includes('original.jpg');
                const hasDerendered = fileNames.includes('derendered.jpg');

                // Build the session document
                const sessionDoc: Record<string, unknown> = {
                    createdAt,
                    originalImageUrl: hasOriginal
                        ? `https://storage.googleapis.com/${bucket.name}/sessions/${sessionId}/original.jpg`
                        : null,
                    originalMimeType: 'image/jpeg',
                    derenderedImageUrl: hasDerendered
                        ? `https://storage.googleapis.com/${bucket.name}/sessions/${sessionId}/derendered.jpg`
                        : null,
                    derenderedMimeType: 'image/jpeg',
                    model: 'gemini-3-pro-image-preview',
                    derenderPrompt: 'Synced from storage - original prompt not available',
                    foundationTryons: [],
                    status: 'active',
                    completedAt: null,
                    syncedFromStorage: true, // Flag to identify backfilled records
                    syncedAt: Date.now(),
                };

                // Check for foundation try-on images
                const foundationFiles = sessionFiles.filter(f =>
                    f.name.includes('foundation-') && f.name.endsWith('.jpg')
                );

                if (foundationFiles.length > 0) {
                    sessionDoc.foundationTryons = foundationFiles.map(f => {
                        const fileName = f.name.split('/').pop() || '';
                        // Parse foundation-{sku}-{timestamp}.jpg
                        const match = fileName.match(/foundation-([^-]+)-(\d+)\.jpg/);
                        return {
                            sku: match ? match[1] : 'unknown',
                            timestamp: match ? parseInt(match[2]) : Date.now(),
                            imageUrl: `https://storage.googleapis.com/${bucket.name}/${f.name}`,
                        };
                    });
                }

                await docRef.set(sessionDoc);
                results.newlyCreated++;
                results.details.push({ sessionId, status: 'created' });
                console.log(`Created Firestore doc for session: ${sessionId}`);

            } catch (error) {
                results.failed++;
                results.details.push({
                    sessionId,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error)
                });
                console.error(`Failed to sync session ${sessionId}:`, error);
            }
        }

        console.log(`Sync complete: ${results.newlyCreated} created, ${results.alreadySynced} already existed, ${results.failed} failed`);

        return NextResponse.json(results);

    } catch (error) {
        console.error("Sync API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

// GET endpoint to check sync status without making changes (dry run)
export async function GET() {
    try {
        const bucket = storage.bucket('melaleuca-mirror.firebasestorage.app');
        const [files] = await bucket.getFiles({ prefix: 'sessions/' });

        // Get unique session folder names
        const sessionFolders = new Set<string>();
        files.forEach(file => {
            const match = file.name.match(/^sessions\/([^\/]+)\//);
            if (match) sessionFolders.add(match[1]);
        });

        const results = {
            totalFolders: sessionFolders.size,
            inFirestore: 0,
            missingFromFirestore: 0,
            missing: [] as string[],
        };

        for (const sessionId of sessionFolders) {
            const docRef = db.collection('sessions').doc(sessionId);
            const doc = await docRef.get();

            if (doc.exists) {
                results.inFirestore++;
            } else {
                results.missingFromFirestore++;
                results.missing.push(sessionId);
            }
        }

        return NextResponse.json({
            ...results,
            message: `${results.missingFromFirestore} sessions in Storage are missing from Firestore. Use POST to sync them.`,
        });

    } catch (error) {
        console.error("Sync Status API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
