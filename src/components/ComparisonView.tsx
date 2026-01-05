"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Check, RotateCcw, Download, Maximize2, X, Sparkles } from "lucide-react";
import FoundationSelector from "./FoundationSelector";

interface Foundation {
    sku: string;
    name: string;
    hex: string;
    undertone: "warm" | "neutral" | "cool";
    swatchImage: string;
}

interface ComparisonViewProps {
    originalImage: string;
    processedImage: string | null;
    foundationImage: string | null;
    selectedFoundation: Foundation | null;
    isApplyingFoundation: boolean;
    suggestedFoundations: string[];
    onReset: () => void;
    onFoundationSelect: (foundation: Foundation) => void;
}

export default function ComparisonView({
    originalImage,
    processedImage,
    foundationImage,
    selectedFoundation,
    isApplyingFoundation,
    suggestedFoundations,
    onReset,
    onFoundationSelect,
}: ComparisonViewProps) {
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [showFoundation, setShowFoundation] = useState(true);

    // Determine which image to show on the right side
    const rightImage = foundationImage && showFoundation ? foundationImage : processedImage;
    const rightLabel = foundationImage && showFoundation ? selectedFoundation?.name || "With Foundation" : "Clean Canvas";
    const isFoundationView = foundationImage && showFoundation;

    // Use white text for darker foundations (500 and above)
    const needsLightText = selectedFoundation?.sku
        ? parseInt(selectedFoundation.sku.replace(/\D/g, '')) >= 500
        : false;

    const handleDownload = () => {
        const imageToDownload = rightImage;
        if (imageToDownload) {
            const link = document.createElement("a");
            link.href = imageToDownload;
            const filename = isFoundationView
                ? `mirror-foundation-${selectedFoundation?.sku || "applied"}.png`
                : "mirror-clean-canvas.png";
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="w-full flex flex-col h-full animate-in slide-in-from-bottom duration-700 items-center">
            {/* Lightbox Modal */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-200"
                    onClick={() => setLightboxImage(null)}
                >
                    <button
                        className="absolute top-6 right-6 p-4 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                        onClick={() => setLightboxImage(null)}
                    >
                        <X className="w-8 h-8 text-white" />
                    </button>
                    <div className="relative w-full max-w-4xl h-full max-h-[90vh] aspect-[3/4]">
                        <Image
                            src={lightboxImage}
                            alt="Full View"
                            fill
                            className="object-contain"
                            quality={100}
                        />
                    </div>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 w-full max-w-5xl">

                {/* Original */}
                <div
                    className="kiosk-card flex flex-col relative group aspect-[3/4] cursor-zoom-in"
                    onClick={() => setLightboxImage(originalImage)}
                >
                    <div className="absolute top-6 left-6 z-10 bg-black/50 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
                        <span className="text-white font-bold tracking-wide uppercase">Original</span>
                    </div>
                    <div className="absolute bottom-6 right-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-2 rounded-full">
                        <Maximize2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="relative w-full h-full">
                        <Image
                            src={originalImage}
                            alt="Original"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                </div>

                {/* Processed / Result */}
                <div
                    className={`kiosk-card flex flex-col relative overflow-hidden aspect-[3/4] group cursor-zoom-in ${
                        isFoundationView
                            ? "border-brand-secondary/50 shadow-[0_0_50px_-12px_rgba(255,200,221,0.3)]"
                            : "border-brand-primary/50 shadow-[0_0_50px_-12px_rgba(165,180,252,0.3)]"
                    }`}
                    onClick={() => rightImage && setLightboxImage(rightImage)}
                >
                    <div
                        className={`absolute top-6 left-6 z-10 px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 ${
                            isFoundationView
                                ? needsLightText ? "text-white" : "text-brand-dark"
                                : "bg-brand-primary/90 text-brand-dark"
                        }`}
                        style={isFoundationView && selectedFoundation ? { backgroundColor: selectedFoundation.hex } : undefined}
                    >
                        {isFoundationView ? (
                            <>
                                <Sparkles className="w-5 h-5" />
                                <span className="tracking-wide uppercase">{rightLabel}</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-5 h-5" />
                                <span className="tracking-wide uppercase">Clean Canvas</span>
                            </>
                        )}
                    </div>

                    {/* Toggle button when foundation is applied */}
                    {foundationImage && processedImage && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFoundation(!showFoundation);
                            }}
                            className="absolute top-6 right-6 z-10 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors"
                        >
                            {showFoundation ? "View Clean" : "View Foundation"}
                        </button>
                    )}

                    {rightImage && (
                        <div className="absolute bottom-6 right-6 z-10 flex gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload();
                                }}
                                className={`p-3 rounded-full hover:scale-110 transition-transform shadow-lg ${
                                    isFoundationView
                                        ? "bg-brand-secondary text-brand-dark"
                                        : "bg-brand-primary text-brand-dark"
                                }`}
                                title="Download Image"
                            >
                                <Download className="w-6 h-6" />
                            </button>
                            <div className="p-3 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-6 h-6" />
                            </div>
                        </div>
                    )}

                    <div className="relative w-full h-full bg-black/20">
                        {rightImage ? (
                            <Image
                                src={rightImage}
                                alt={isFoundationView ? "With Foundation" : "Natural Skin"}
                                fill
                                className="object-cover animate-in fade-in duration-1000"
                                priority
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 space-y-6">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 rounded-full border-4 border-muted/30"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-t-brand-primary animate-spin"></div>
                                </div>
                                <p className="text-2xl text-brand-primary font-medium animate-pulse">Analyzing skin tones...</p>
                                <p className="text-muted-foreground text-center max-w-xs">
                                    Removing makeup while preserving natural features and texture...
                                </p>
                            </div>
                        )}

                        {/* Overlay when applying foundation */}
                        {isApplyingFoundation && (
                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-8 space-y-6 animate-in fade-in duration-200">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 rounded-full border-4 border-muted/30"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-t-brand-secondary animate-spin"></div>
                                </div>
                                <p className="text-2xl text-brand-secondary font-medium animate-pulse">
                                    Applying {selectedFoundation?.name}...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Foundation Selector - shows after derendering is complete */}
            {processedImage && (
                <div className="w-full max-w-5xl mb-8">
                    <FoundationSelector
                        onSelect={onFoundationSelect}
                        selectedSku={selectedFoundation?.sku || null}
                        isApplying={isApplyingFoundation}
                        suggestedSkus={suggestedFoundations}
                    />
                </div>
            )}

            {processedImage && (
                <div className="flex justify-center pb-8">
                    <button
                        onClick={onReset}
                        className="kiosk-btn bg-white text-black hover:bg-slate-200 flex items-center gap-3"
                    >
                        <RotateCcw className="w-6 h-6" />
                        Start Over
                    </button>
                </div>
            )}
        </div>
    );
}
