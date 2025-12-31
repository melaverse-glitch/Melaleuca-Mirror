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
            // Store both images in Cloud Storage and save URLs to Firestore
            try {
                const timestamp = Date.now();
                const bucket = storage.bucket('melaleuca-mirror.firebasestorage.app');

                // Helper function to upload base64 image to Cloud Storage
                const uploadImage = async (base64Data: string, fileName: string, imageMimeType: string) => {
                    const buffer = Buffer.from(base64Data, 'base64');
                    const file = bucket.file(`generations/${timestamp}/${fileName}`);

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
                    'processed.jpg',
                    imageOutput.mimeType
                );

                // Store metadata and URLs in Firestore
                const generationDoc = {
                    timestamp,
                    originalImageUrl,
                    originalMimeType: mimeType || "image/jpeg",
                    processedImageUrl,
                    processedMimeType: imageOutput.mimeType,
                    model: "gemini-3-pro-image-preview",
                    prompt: prompt,
                };

                await db.collection('generations').add(generationDoc);
                console.log('Successfully stored generation in Cloud Storage and Firestore');
            } catch (storageError) {
                console.error('Error storing to Firebase:', storageError);
                // Continue even if storage fails - don't block the user
            }

            return NextResponse.json({
                image: imageOutput.data,
                mimeType: imageOutput.mimeType
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
