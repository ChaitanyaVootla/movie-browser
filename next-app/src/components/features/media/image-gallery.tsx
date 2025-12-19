"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Image as TMDBImage } from "@/types";

interface ImageGalleryProps {
  images: TMDBImage[];
  title?: string;
  className?: string;
  maxVisible?: number;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function ImageGallery({
  images,
  title = "Gallery",
  className,
  maxVisible = 12,
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  const visibleImages = images.slice(0, maxVisible);
  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null;
  const isOpen = selectedIndex !== null;

  const goToPrevious = useCallback(() => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex === 0 ? images.length - 1 : selectedIndex - 1);
  }, [selectedIndex, images.length]);

  const goToNext = useCallback(() => {
    if (selectedIndex === null) return;
    setSelectedIndex(selectedIndex === images.length - 1 ? 0 : selectedIndex + 1);
  }, [selectedIndex, images.length]);

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  // Scroll thumbnail into view when selected
  useEffect(() => {
    if (selectedIndex !== null && thumbnailsRef.current) {
      const thumbnail = thumbnailsRef.current.children[selectedIndex] as HTMLElement;
      if (thumbnail) {
        thumbnail.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goToPrevious, goToNext, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!images?.length) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 md:px-8 lg:px-12">
        <ImageIcon className="h-5 w-5 text-brand" />
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {images.length > maxVisible && (
          <span className="text-sm text-muted-foreground">
            ({images.length} images)
          </span>
        )}
      </div>

      {/* Horizontal scroll gallery */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 px-4 md:px-8 lg:px-12 pb-4">
          {visibleImages.map((image, index) => {
            const aspectRatio = image.aspect_ratio || 1.78;
            const height = 120;
            const width = Math.min(aspectRatio * height, 220);

            return (
              <button
                key={image.file_path}
                onClick={() => setSelectedIndex(index)}
                className="group relative flex-shrink-0 overflow-hidden rounded-lg transition-all hover:ring-2 hover:ring-brand/50"
              >
                <div
                  className="relative"
                  style={{ height: `${height}px`, width: `${width}px` }}
                >
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w500${image.file_path}`}
                    alt={`Gallery image ${index + 1}`}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="220px"
                    unoptimized
                  />
                </div>
              </button>
            );
          })}
          {images.length > maxVisible && (
            <button
              onClick={() => setSelectedIndex(maxVisible)}
              className="flex-shrink-0 flex items-center justify-center rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              style={{ height: "120px", width: "120px" }}
            >
              <div className="text-center">
                <span className="text-2xl font-bold text-muted-foreground">
                  +{images.length - maxVisible}
                </span>
                <p className="text-xs text-muted-foreground mt-1">more</p>
              </div>
            </button>
          )}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      {/* Lightbox Modal - Custom full screen overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-50 rounded-full bg-white/10 hover:bg-white/20 text-white h-10 w-10"
            onClick={handleClose}
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Navigation arrows */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-7 w-7" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-white/10 hover:bg-white/20 text-white h-12 w-12"
            onClick={goToNext}
          >
            <ChevronRight className="h-7 w-7" />
          </Button>

          {/* Counter - positioned at top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 text-white/90 text-sm bg-white/10 px-4 py-1.5 rounded-full">
            {selectedIndex + 1} / {images.length}
          </div>

          {/* Main content area */}
          <div className="flex flex-col h-full">
            {/* Main image - takes most of the space */}
            <div className="flex-1 flex items-center justify-center p-4 pt-16 pb-4">
              {selectedImage && (
                // eslint-disable-next-line @next/next/no-img-element -- Lightbox requires native img for full-res external TMDB images
                <img
                  src={`${TMDB_IMAGE_BASE}/original${selectedImage.file_path}`}
                  alt={`Gallery image ${selectedIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                  style={{ maxHeight: "calc(100vh - 160px)" }}
                />
              )}
            </div>

            {/* Thumbnail strip at bottom */}
            <div className="h-[100px] bg-black/60 backdrop-blur-sm border-t border-white/10 flex-shrink-0">
              <ScrollArea className="h-full w-full">
                <div ref={thumbnailsRef} className="flex gap-2 px-4 py-2 h-full items-center">
                  {images.map((image, index) => {
                    const thumbWidth = Math.min((image.aspect_ratio || 1.78) * 60, 110);
                    return (
                      <button
                        key={image.file_path}
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          "relative flex-shrink-0 h-[60px] rounded overflow-hidden transition-all",
                          selectedIndex === index
                            ? "ring-2 ring-brand opacity-100 scale-105"
                            : "opacity-40 hover:opacity-70"
                        )}
                        style={{ width: `${thumbWidth}px` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Thumbnails use external TMDB images */}
                        <img
                          src={`${TMDB_IMAGE_BASE}/w185${image.file_path}`}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
