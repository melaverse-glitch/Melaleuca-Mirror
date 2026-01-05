import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db, storage, admin } from "@/lib/firebaseAdmin";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: Request) {
    try {
        const { image, mimeType, foundation, sessionId } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "Image data is required" },
                { status: 400 }
            );
        }

        if (!foundation || !foundation.sku) {
            return NextResponse.json(
                { error: "Foundation selection is required" },
                { status: 400 }
            );
        }

        if (!sessionId) {
            return NextResponse.json(
                { error: "Session ID is required" },
                { status: 400 }
            );
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "GOOGLE_API_KEY is not set" },
                { status: 500 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // Load the swatch image for the selected foundation
        let swatchBase64: string | null = null;
        let swatchMimeType = "image/png";

        try {
            const swatchPath = path.join(process.cwd(), "public", "swatches", `${foundation.sku}.png`);
            const swatchBuffer = fs.readFileSync(swatchPath);
            swatchBase64 = swatchBuffer.toString("base64");
        } catch (err) {
            console.error("Could not load swatch image:", err);
            // Continue without swatch - will rely on hex color
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-3-pro-image-preview",
            systemInstruction: `You are an expert cosmetic artist and digital makeup specialist. Your task is to apply foundation makeup to the provided portrait image.

IMPORTANT GUIDELINES:
1. Apply the foundation ONLY to the face and neck areas - do not alter hair, eyes, lips, eyebrows, or background.
2. The foundation should create a smooth, polished, professional makeup finish - like real foundation does.
3. Strictly preserve the original facial identity, bone structure, and expression.
4. Even out skin tone and create a smooth, refined complexion by softening pores, fine lines, and minor imperfections.
5. The coverage should be medium to full - creating that polished makeup look with the foundation shade.
6. Blend the foundation seamlessly at the jawline and hairline edges with no harsh lines.
7. The result should look like professionally applied makeup - smooth and polished but still realistic, NOT plastic or heavily airbrushed.`
        });

        // Build the prompt with foundation details
        const prompt = `Apply this foundation to the face in the portrait:
- Foundation shade: ${foundation.name}
- Color: ${foundation.hex}
- Undertone: ${foundation.undertone}

Create a smooth, polished foundation finish that looks like professional makeup application. The skin should appear even-toned and refined with the foundation color, with a natural but polished appearance. Blend seamlessly at all edges.`;

        // Construct the content parts
        const contentParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
            { text: prompt },
            {
                inlineData: {
                    data: image,
                    mimeType: mimeType || "image/jpeg",
                },
            },
        ];

        // If we have the swatch image, include it for better color reference
        if (swatchBase64) {
            contentParts.push({
                inlineData: {
                    data: swatchBase64,
                    mimeType: swatchMimeType,
                },
            });
            contentParts[0] = {
                text: prompt + "\n\nThe second image shows the exact foundation color/texture to apply.",
            };
        }

        const result = await model.generateContent(contentParts);
        const response = await result.response;

        const parts = response.candidates?.[0]?.content?.parts;
        const imageOutput = parts?.find(p => p.inlineData)?.inlineData;

        if (imageOutput) {
            // Update the session with this foundation try-on
            try {
                const timestamp = Date.now();
                const bucket = storage.bucket('melaleuca-mirror.firebasestorage.app');

                // Upload the foundation result image
                const buffer = Buffer.from(imageOutput.data, 'base64');
                const file = bucket.file(`sessions/${sessionId}/foundation-${foundation.sku}-${timestamp}.jpg`);

                await file.save(buffer, {
                    metadata: {
                        contentType: imageOutput.mimeType,
                    },
                    public: true,
                });

                const resultImageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

                // Create the try-on entry
                const tryonEntry = {
                    appliedAt: timestamp,
                    sku: foundation.sku,
                    name: foundation.name,
                    hex: foundation.hex,
                    undertone: foundation.undertone,
                    resultImageUrl,
                    resultMimeType: imageOutput.mimeType,
                };

                // Update the session document by appending to foundationTryons array
                const sessionRef = db.collection('sessions').doc(sessionId);
                await sessionRef.update({
                    foundationTryons: admin.firestore.FieldValue.arrayUnion(tryonEntry)
                });

                console.log(`Successfully added foundation ${foundation.sku} to session ${sessionId}`);
            } catch (storageError) {
                console.error('Error updating session in Firebase:', storageError);
                // Continue even if storage fails
            }

            return NextResponse.json({
                image: imageOutput.data,
                mimeType: imageOutput.mimeType,
                foundation: foundation.sku,
            });
        }

        // Fallback if no image was generated
        const textOutput = response.text();
        if (textOutput) {
            console.log("Model returned text instead of image:", textOutput);
        }

        return NextResponse.json({
            error: "No image generated by model",
            rawText: textOutput
        });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
