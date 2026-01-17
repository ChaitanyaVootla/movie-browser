"use client";

import { ImageGallery } from "@/components/features/media/image-gallery";
import { cn } from "@/lib/utils";
import type { PersonProfileImage } from "@/types/client-props";

interface PersonImagesProps {
  images: PersonProfileImage[];
  personName: string;
  className?: string;
}

/**
 * PersonImages - Displays a gallery of profile images for a person
 *
 * Reuses the ImageGallery component from media features for consistent
 * gallery behavior (horizontal scroll, lightbox, thumbnails, keyboard nav).
 */
export function PersonImages({ images, personName, className }: PersonImagesProps) {
  if (!images || images.length === 0) {
    return null;
  }

  return (
    <ImageGallery
      images={images}
      title={`Photos of ${personName}`}
      className={cn(className)}
      maxVisible={12}
    />
  );
}
