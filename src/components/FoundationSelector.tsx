"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Palette, Check, Loader2, Sparkles } from "lucide-react";

interface Foundation {
  sku: string;
  name: string;
  hex: string;
  undertone: "warm" | "neutral" | "cool";
  swatchImage: string;
}

interface FoundationSelectorProps {
  onSelect: (foundation: Foundation) => void;
  selectedSku: string | null;
  isApplying: boolean;
  suggestedSkus?: string[];
}

export default function FoundationSelector({
  onSelect,
  selectedSku,
  isApplying,
  suggestedSkus = [],
}: FoundationSelectorProps) {
  const [foundations, setFoundations] = useState<Foundation[]>([]);
  const [filter, setFilter] = useState<"all" | "warm" | "neutral" | "cool">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/foundations.json")
      .then((res) => res.json())
      .then((data) => {
        setFoundations(data.foundations);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading foundations:", err);
        setLoading(false);
      });
  }, []);

  const filteredFoundations =
    filter === "all"
      ? foundations
      : foundations.filter((f) => f.undertone === filter);

  const undertoneLabel = {
    warm: "Warm",
    neutral: "Neutral",
    cool: "Cool",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="w-full animate-in slide-in-from-bottom duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-secondary/20 rounded-lg">
            <Palette className="w-6 h-6 text-brand-secondary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Try a Foundation</h3>
            <p className="text-sm text-muted-foreground">
              Select a shade to see how it looks on your natural skin
            </p>
          </div>
        </div>
      </div>

      {/* Undertone Filter */}
      <div className="flex gap-2 mb-6">
        {(["all", "warm", "neutral", "cool"] as const).map((tone) => (
          <button
            key={tone}
            onClick={() => setFilter(tone)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === tone
                ? "bg-brand-primary text-brand-dark"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {tone === "all" ? "All Shades" : undertoneLabel[tone]}
            {tone !== "all" && (
              <span className="ml-1 text-xs opacity-70">
                ({foundations.filter((f) => f.undertone === tone).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Foundation Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-11 gap-3">
        {filteredFoundations.map((foundation) => {
          const isSelected = selectedSku === foundation.sku;
          const isCurrentlyApplying = isApplying && isSelected;
          const isSuggested = suggestedSkus.includes(foundation.sku);

          return (
            <button
              key={foundation.sku}
              onClick={() => !isApplying && onSelect(foundation)}
              disabled={isApplying}
              className={`group relative aspect-square rounded-xl overflow-hidden transition-all duration-200 ${
                isSelected
                  ? "ring-3 ring-brand-primary ring-offset-2 ring-offset-brand-dark scale-105"
                  : "hover:scale-105 hover:ring-2 hover:ring-white/30"
              } ${isApplying && !isSelected ? "opacity-50" : ""}`}
              title={`${foundation.name} (${foundation.undertone})${isSuggested ? " - AI Recommended" : ""}`}
            >
              <Image
                src={foundation.swatchImage}
                alt={foundation.name}
                fill
                className="object-cover"
                sizes="80px"
              />

              {/* AI Suggestion indicator */}
              {isSuggested && (
                <div className="absolute top-1 left-1 z-10 p-1 bg-brand-primary rounded-full shadow-lg">
                  <Sparkles className="w-3 h-3 text-brand-dark" />
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && !isCurrentlyApplying && (
                <div className="absolute inset-0 bg-brand-primary/30 flex items-center justify-center">
                  <Check className="w-6 h-6 text-white drop-shadow-lg" />
                </div>
              )}

              {/* Loading indicator */}
              {isCurrentlyApplying && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}

              {/* SKU label on hover */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-bold text-white">
                  {foundation.sku}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected info */}
      {selectedSku && (
        <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-lg shadow-inner"
              style={{
                backgroundColor:
                  foundations.find((f) => f.sku === selectedSku)?.hex || "#ccc",
              }}
            />
            <div>
              <p className="font-bold text-white">
                {foundations.find((f) => f.sku === selectedSku)?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {foundations.find((f) => f.sku === selectedSku)?.undertone} undertone •{" "}
                {foundations.find((f) => f.sku === selectedSku)?.hex}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
