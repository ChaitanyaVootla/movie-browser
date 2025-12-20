"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TMDB_IMAGE_BASE } from "@/lib/constants";
import type { Image as TMDBImage } from "@/types";

interface PersonImagesProps {
  images: TMDBImage[];
  personName: string;
  className?: string;
}

export function PersonImages({ images, personName, className }: PersonImagesProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Handle keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) => (prev !== null && prev < images.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, images.length]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <section className={cn("px-4 md:px-8 lg:px-12", className)}>
      <h2 className="text-xl font-semibold mb-4">Photos</h2>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4">
          {images.map((image, index) => (
            <button
              key={image.file_path}
              onClick={() => setLightboxIndex(index)}
              className="relative flex-shrink-0 rounded-lg overflow-hidden bg-muted group
                ring-2 ring-transparent hover:ring-primary/50 transition-all focus:outline-none focus:ring-primary"
              style={{
                width: `${Math.round(image.aspect_ratio * 160)}px`,
                height: "160px",
              }}
            >
              <Image
                src={`${TMDB_IMAGE_BASE}/w500${image.file_path}`}
                alt={`${personName} photo ${index + 1}`}
                fill
                className="object-cover"
                sizes="200px"
                unoptimized
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between p-4">
            <span className="text-white/70 text-sm">
              {lightboxIndex + 1} / {images.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLightboxIndex(null)}
              className="text-white hover:bg-white/10"
              aria-label="Close gallery"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          {/* Main image */}
          <div className="flex-1 relative flex items-center justify-center px-16">
            {/* Navigation buttons */}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLightboxIndex(lightboxIndex > 0 ? lightboxIndex - 1 : images.length - 1)
                  }
                  className="absolute left-4 text-white hover:bg-white/10 h-12 w-12"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLightboxIndex(lightboxIndex < images.length - 1 ? lightboxIndex + 1 : 0)
                  }
                  className="absolute right-4 text-white hover:bg-white/10 h-12 w-12"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            {/* Image - using native img for lightbox to allow dynamic sizing without Next.js Image constraints */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${TMDB_IMAGE_BASE}/original${images[lightboxIndex].file_path}`}
              alt={`${personName} photo ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="p-4">
              <ScrollArea className="w-full">
                <div className="flex gap-2 justify-center">
                  {images.map((image, index) => (
                    <button
                      key={image.file_path}
                      onClick={() => setLightboxIndex(index)}
                      className={cn(
                        "relative flex-shrink-0 rounded overflow-hidden transition-all",
                        "w-16 h-16",
                        index === lightboxIndex
                          ? "ring-2 ring-white opacity-100"
                          : "ring-1 ring-white/30 opacity-50 hover:opacity-80"
                      )}
                    >
                      <Image
                        src={`${TMDB_IMAGE_BASE}/w185${image.file_path}`}
                        alt={`Thumbnail ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="64px"
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </section>
  );
}


