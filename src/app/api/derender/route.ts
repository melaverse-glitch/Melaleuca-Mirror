import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { db, storage } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
    try {
        const { image, mimeType } = await req.json();

        if (!image) {
            return NextResponse.json(
                { error: "Image data is required" },
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

        // Using the specific model requested: gemini-3-pro-image-preview
        // Note: If this model ID is not available, we might need fallback logic or user confirmation
        const model = genAI.getGenerativeModel({
            model: "gemini-3-pro-image-preview",
            systemInstruction: "You are an expert digital retoucher and dermatologist. Your goal is to reveal the subject's natural, healthy skin by digitally removing all cosmetic makeup.\n\n1. Remove all foundation, blush, eyeshadow, eyeliner, lipstick, and contour.\n2. Reveal the underlying skin tone consistent with the neck/hairline.\n3. The resulting skin should appear **naturally clear, hydrated, and healthy**. It should NOT look airbrushed, plastic, or blurry.\n4. RETAIN natural skin micro-texture (pores) to ensure realism, but DO NOT GENERATE blemishes, acne, redness, or blotchiness that is not present.\n5. Strictly preserve the original facial identity, bone structure, and expression."
        });

        const prompt = "Remove all makeup to reveal a clean, fresh-faced, natural look. The skin should look healthy and clear with realistic micro-texture, but free of blemishes. Do not smooth the skin excessively.";

        // Construct the image part
        const imagePart = {
            inlineData: {
                data: image,
                mimeType: mimeType || "image/jpeg",
            },
        };

        // The instruction implies an Image-to-Image capability where the output is an image.
        // Standard Gemini models (pro-vision) output text, but 'image-preview' or specialized experimental models might output an image 
        // or we might need to be using a different endpoint if this is a generated image model (like Imagen).
        // However, based on the specific "gemini-3-pro-image-preview" name, it sounds like an experimental multimodal-to-multimodal model.
        // We will assume standard generateContent flow but look for image in payload if it comes back as such, 
        // OR if it returns a path/url/base64 in the text.

        // CRITICAL ASSUMPTION CHECK:
        // If the model generates an image, the SDK response format might be different. 
        // For now, we will try `model.generateContent`.

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;

        // Logic to handle Image Output if supported natively by SDK for this model
        // Usually, image generation models return an 'images' array or similar.
        // If this is a text-model describing the change, this will fail the user expectation. 
        // But since the user INSISTED on this model and "Image-to-Image", we assume functionality.

        // Note for User: Currently the standard Node SDK `generateContent` returns text parts. 
        // If the model returns regular image bytes, they might be in `candidates[0].content.parts[0].inlineData` or similar if the SDK supports reception.
        // If not, we might need to parse. 

        // Let's assume standard response handling first, but if this was 'imagen', we'd use a different method.
        // Since I cannot know the exact shape of this unreleased/experimental model's response without docs,
        // I will look for any "inlineData" in the parts.

        const parts = response.candidates?.[0]?.content?.parts;
        const imageOutput = parts?.find(p => p.inlineData)?.inlineData;

        if (imageOutput) {
            let sessionId: string | null = null;

            // Store both images in Cloud Storage and save URLs to Firestore
            try {
                const timestamp = Date.now();
                const bucket = storage.bucket('melaleuca-mirror.firebasestorage.app');

                // Helper function to upload base64 image to Cloud Storage
                const uploadImage = async (base64Data: string, fileName: string, imageMimeType: string) => {
                    const buffer = Buffer.from(base64Data, 'base64');
                    const file = bucket.file(`sessions/${timestamp}/${fileName}`);

                    await file.save(buffer, {
                        metadata: {
                            contentType: imageMimeType,
                        },
                        public: true,
                    });

                    return `https://storage.googleapis.com/${bucket.name}/${file.name}`;
                };

                // Upload both images
                const originalImageUrl = await uploadImage(
                    image,
                    'original.jpg',
                    mimeType || "image/jpeg"
                );

                const processedImageUrl = await uploadImage(
                    imageOutput.data,
                    'derendered.jpg',
                    imageOutput.mimeType
                );

                // Create a new session document using timestamp as ID for consistency
                // This ensures Cloud Storage folder and Firestore doc ID match
                sessionId = timestamp.toString();

                const sessionDoc = {
                    createdAt: timestamp,
                    originalImageUrl,
                    originalMimeType: mimeType || "image/jpeg",
                    derenderedImageUrl: processedImageUrl,
                    derenderedMimeType: imageOutput.mimeType,
                    model: "gemini-3-pro-image-preview",
                    derenderPrompt: prompt,
                    foundationTryons: [], // Will be populated as user tries foundations
                    status: 'active', // active, completed
                    completedAt: null,
                };

                await db.collection('sessions').doc(sessionId).set(sessionDoc);
                console.log('Successfully created session in Firestore:', sessionId);
            } catch (storageError) {
                console.error('Error storing to Firebase:', storageError);
                // Continue even if storage fails - don't block the user
            }

            // Get AI foundation suggestions based on the derendered skin tone
            let suggestedFoundations: string[] = [];
            try {
                const suggestionModel = genAI.getGenerativeModel({
                    model: "gemini-3-flash-preview",
                });

                const foundationsList = [
                    { sku: "30W", name: "30 Warm", hex: "#e8c5a7", undertone: "warm" },
                    { sku: "40N", name: "40 Neutral", hex: "#deba95", undertone: "neutral" },
                    { sku: "50N", name: "50 Neutral", hex: "#d6b28f", undertone: "neutral" },
                    { sku: "60C", name: "60 Cool", hex: "#d9a781", undertone: "cool" },
                    { sku: "80N", name: "80 Neutral", hex: "#daa981", undertone: "neutral" },
                    { sku: "100N", name: "100 Neutral", hex: "#e3b287", undertone: "neutral" },
                    { sku: "110W", name: "110 Warm", hex: "#dfb382", undertone: "warm" },
                    { sku: "120W", name: "120 Warm", hex: "#d9ae8b", undertone: "warm" },
                    { sku: "180C", name: "180 Cool", hex: "#daab7d", undertone: "cool" },
                    { sku: "220N", name: "220 Neutral", hex: "#d7a372", undertone: "neutral" },
                    { sku: "240N", name: "240 Neutral", hex: "#c98d61", undertone: "neutral" },
                    { sku: "280N", name: "280 Neutral", hex: "#d9ad7c", undertone: "neutral" },
                    { sku: "325C", name: "325 Cool", hex: "#d7a77c", undertone: "cool" },
                    { sku: "330W", name: "330 Warm", hex: "#d49353", undertone: "warm" },
                    { sku: "340N", name: "340 Neutral", hex: "#e0b27f", undertone: "neutral" },
                    { sku: "380N", name: "380 Neutral", hex: "#e5b481", undertone: "neutral" },
                    { sku: "400N", name: "400 Neutral", hex: "#d4a074", undertone: "neutral" },
                    { sku: "440W", name: "440 Warm", hex: "#ca8859", undertone: "warm" },
                    { sku: "460N", name: "460 Neutral", hex: "#d8a472", undertone: "neutral" },
                    { sku: "470W", name: "470 Warm", hex: "#bf804c", undertone: "warm" },
                    { sku: "480C", name: "480 Cool", hex: "#d6976b", undertone: "cool" },
                    { sku: "485N", name: "485 Neutral", hex: "#c47a40", undertone: "neutral" },
                    { sku: "490N", name: "490 Neutral", hex: "#b8835b", undertone: "neutral" },
                    { sku: "500W", name: "500 Warm", hex: "#b66d3d", undertone: "warm" },
                    { sku: "540W", name: "540 Warm", hex: "#bc713d", undertone: "warm" },
                    { sku: "550W", name: "550 Warm", hex: "#b3662a", undertone: "warm" },
                    { sku: "555W", name: "555 Warm", hex: "#b76629", undertone: "warm" },
                    { sku: "560N", name: "560 Neutral", hex: "#b47141", undertone: "neutral" },
                    { sku: "600N", name: "600 Neutral", hex: "#b06733", undertone: "neutral" },
                    { sku: "610W", name: "610 Warm", hex: "#9d5629", undertone: "warm" },
                    { sku: "620C", name: "620 Cool", hex: "#995028", undertone: "cool" },
                    { sku: "640W", name: "640 Warm", hex: "#965430", undertone: "warm" },
                    { sku: "720N", name: "720 Neutral", hex: "#652f18", undertone: "neutral" },
                ];

                const suggestionPrompt = `Analyze this person's natural skin tone in the portrait and recommend exactly 3 foundation shades that would be the best match.

Available foundations:
${foundationsList.map(f => `- ${f.sku}: ${f.name} (${f.hex}, ${f.undertone} undertone)`).join('\n')}

Consider:
1. The person's skin depth (light to deep)
2. Their undertone (warm, cool, or neutral)
3. Match to face, neck, and visible skin areas

Return ONLY a JSON array with exactly 3 SKU codes, ordered from best match to third best match.
Example: ["110W", "120W", "100N"]

Do not include any other text, just the JSON array.`;

                const suggestionResult = await suggestionModel.generateContent([
                    suggestionPrompt,
                    {
                        inlineData: {
                            data: imageOutput.data,
                            mimeType: imageOutput.mimeType,
                        },
                    },
                ]);

                let suggestionText = suggestionResult.response.text().trim();
                console.log('Raw AI suggestion response:', suggestionText);

                // Strip markdown code blocks if present (e.g., ```json ... ```)
                if (suggestionText.includes('```')) {
                    suggestionText = suggestionText
                        .replace(/```json\s*/gi, '')
                        .replace(/```\s*/g, '')
                        .trim();
                }

                // Extract JSON array if there's extra text
                const jsonMatch = suggestionText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    suggestionText = jsonMatch[0];
                }

                console.log('Cleaned suggestion text:', suggestionText);

                // Parse the JSON array from the response
                const parsed = JSON.parse(suggestionText);
                if (Array.isArray(parsed) && parsed.length >= 1) {
                    // Take up to 3 suggestions
                    suggestedFoundations = parsed.slice(0, 3);
                    console.log('AI suggested foundations:', suggestedFoundations);
                }
            } catch (suggestionError) {
                console.error('Error getting foundation suggestions:', suggestionError);
                // Continue without suggestions - non-blocking
            }

            return NextResponse.json({
                image: imageOutput.data,
                mimeType: imageOutput.mimeType,
                sessionId: sessionId,
                suggestedFoundations: suggestedFoundations,
            });
        }

        // Fallback: Check if it returned a text that IS a base64 string or URL (unlikely but possible)
        const textOutput = response.text();
        if (textOutput) {
            // If the model refused or returned text, we pass it back (or error out if it needs to be an image)
            // For this specific 'derender' task, text is useless.
            console.log("Model returned text instead of image:", textOutput);
            // We'll return it for debugging, but the UI expects an image.
            // In a real scenario, this is where we'd likely hit an error if the model isn't set up for straight image-out.
        }

        return NextResponse.json({ error: "No image generated by model", rawText: textOutput });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
