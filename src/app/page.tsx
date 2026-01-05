"use client";

import React, { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import ComparisonView from "@/components/ComparisonView";
import { Sparkles, Camera } from "lucide-react";

interface Foundation {
  sku: string;
  name: string;
  hex: string;
  undertone: "warm" | "neutral" | "cool";
  swatchImage: string;
}

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [foundationImage, setFoundationImage] = useState<string | null>(null);
  const [selectedFoundation, setSelectedFoundation] = useState<Foundation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplyingFoundation, setIsApplyingFoundation] = useState(false);

  // Store the base64 of the derendered image for foundation application
  const [derenderedBase64, setDerenderedBase64] = useState<string | null>(null);

  // Store the session ID to track the entire user journey
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Store AI-suggested foundation SKUs
  const [suggestedFoundations, setSuggestedFoundations] = useState<string[]>([]);

  const handleImageSelected = async (file: File) => {
    // Convert to base64 for display
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOriginalImage(e.target.result as string);
        processImage(file);
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper function to compress image before sending to API
  const compressImage = async (file: File, maxWidth: number = 1024, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if image is too large
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Convert to base64 with compression
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedReader = new FileReader();
                compressedReader.readAsDataURL(blob);
                compressedReader.onload = () => {
                  const result = compressedReader.result as string;
                  const base64 = result.split(',')[1];
                  resolve(base64);
                };
                compressedReader.onerror = reject;
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setProcessedImage(null);
    setFoundationImage(null);
    setSelectedFoundation(null);
    setDerenderedBase64(null);
    setSessionId(null);
    setSuggestedFoundations([]);

    try {
      // 1. Compress and convert file to base64 for API (prevents 413 errors)
      // Aggressive compression to stay under Vercel's 4.5MB limit
      const base64 = await compressImage(file, 800, 0.75);

      // 2. Call API
      const response = await fetch("/api/derender", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
      });

      if (!response.ok) {
        throw new Error("Failed to process image");
      }

      const data = await response.json();

      if (data.image) {
        // Store the base64 for later foundation application
        setDerenderedBase64(data.image);

        // Store the session ID for tracking foundation try-ons
        if (data.sessionId) {
          setSessionId(data.sessionId);
          console.log("Session created:", data.sessionId);
        }

        // Store AI-suggested foundations
        if (data.suggestedFoundations && Array.isArray(data.suggestedFoundations)) {
          setSuggestedFoundations(data.suggestedFoundations);
          console.log("AI suggested foundations:", data.suggestedFoundations);
        }

        // Assume API returns base64 or URL
        // If base64 and not prefixed, add prefix
        let resultImg = data.image;
        if (!resultImg.startsWith("http") && !resultImg.startsWith("data:")) {
          resultImg = `data:image/png;base64,${resultImg}`;
        }
        setProcessedImage(resultImg);
      }
    } catch (error) {
      console.error("Error processing image:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFoundationSelect = async (foundation: Foundation) => {
    if (!derenderedBase64) {
      console.error("No derendered image available");
      return;
    }

    if (!sessionId) {
      console.error("No session ID available");
      return;
    }

    setSelectedFoundation(foundation);
    setIsApplyingFoundation(true);

    try {
      const response = await fetch("/api/apply-foundation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: derenderedBase64,
          mimeType: "image/jpeg",
          foundation: {
            sku: foundation.sku,
            name: foundation.name,
            hex: foundation.hex,
            undertone: foundation.undertone,
          },
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to apply foundation");
      }

      const data = await response.json();

      if (data.image) {
        let resultImg = data.image;
        if (!resultImg.startsWith("http") && !resultImg.startsWith("data:")) {
          resultImg = `data:image/png;base64,${resultImg}`;
        }
        setFoundationImage(resultImg);
      } else if (data.error) {
        console.error("Foundation application error:", data.error);
        alert("Could not apply foundation. Please try again.");
      }
    } catch (error) {
      console.error("Error applying foundation:", error);
      alert("Something went wrong applying the foundation. Please try again.");
    } finally {
      setIsApplyingFoundation(false);
    }
  };

  const handleReset = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setFoundationImage(null);
    setSelectedFoundation(null);
    setDerenderedBase64(null);
    setSessionId(null);
    setSuggestedFoundations([]);
    setIsProcessing(false);
    setIsApplyingFoundation(false);
  };

  return (
    <div className="min-h-screen p-8 md:p-12 flex flex-col font-sans">
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand-primary rounded-xl text-brand-dark shadow-lg shadow-brand-primary/20">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">MIRROR</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest">Natural Skin Visualizer</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/5">
          <Camera className="w-4 h-4 text-brand-secondary" />
          <span className="text-sm font-medium text-white/80">Kiosk Mode Active</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative max-w-7xl mx-auto w-full">
        {!originalImage ? (
          <div className="flex-1 flex flex-col justify-center">
            <ImageUploader onImageSelected={handleImageSelected} />
          </div>
        ) : (
          <ComparisonView
            originalImage={originalImage}
            processedImage={processedImage}
            foundationImage={foundationImage}
            selectedFoundation={selectedFoundation}
            isApplyingFoundation={isApplyingFoundation}
            suggestedFoundations={suggestedFoundations}
            onReset={handleReset}
            onFoundationSelect={handleFoundationSelect}
          />
        )}
      </main>

      <footer className="mt-8 text-center text-muted-foreground text-sm">
        <p>AI Cosmetic Derenderer v1.0 • Powered by Gemini 3 Pro</p>
      </footer>
    </div>
  );
}
