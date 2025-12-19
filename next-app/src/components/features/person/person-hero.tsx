"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Star,
  ExternalLink,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TMDB_IMAGE_BASE, TMDB_PROFILE_SIZES } from "@/lib/constants";
import type { Person } from "@/types";

interface PersonHeroProps {
  person: Person;
  className?: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

// Format age from birthday
function calculateAge(birthday: string | null, deathday?: string | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Format date
function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Truncate biography for initial display
function truncateBio(bio: string, maxLength = 600): { text: string; truncated: boolean } {
  if (!bio || bio.length <= maxLength) return { text: bio, truncated: false };
  const truncated = bio.slice(0, maxLength).trim();
  const lastSpace = truncated.lastIndexOf(" ");
  return {
    text: lastSpace > maxLength - 100 ? truncated.slice(0, lastSpace) + "..." : truncated + "...",
    truncated: true,
  };
}

// Gender label
function getGenderLabel(gender: number): string {
  switch (gender) {
    case 1:
      return "Female";
    case 2:
      return "Male";
    case 3:
      return "Non-binary";
    default:
      return "";
  }
}

export function PersonHero({ person, className }: PersonHeroProps) {
  const age = calculateAge(person.birthday, person.deathday);
  const formattedBirthday = formatDate(person.birthday);
  const formattedDeathday = formatDate(person.deathday);
  const { text: bioText, truncated: isBioTruncated } = truncateBio(person.biography);

  // Get external links
  const externalIds = person.external_ids;
  const hasExternalLinks =
    externalIds?.instagram_id ||
    externalIds?.twitter_id ||
    externalIds?.facebook_id ||
    externalIds?.youtube_id ||
    person.homepage ||
    person.imdb_id;

  return (
    <section className={cn("relative bg-gradient-to-b from-background/50 to-background", className)}>
      <div className="px-4 md:px-8 lg:px-12 pt-16 md:pt-20 pb-8 md:pb-12">
        <motion.div
          className="flex flex-col md:flex-row gap-8 md:gap-12"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Profile Image */}
          <motion.div variants={itemVariants} className="flex-shrink-0 mx-auto md:mx-0">
            <div className="relative w-48 h-72 md:w-64 md:h-96 rounded-2xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
              {person.profile_path ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/${TMDB_PROFILE_SIZES.large}${person.profile_path}`}
                  alt={`${person.name} profile photo`}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 768px) 192px, 256px"
                  priority
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <span className="text-6xl font-light text-muted-foreground/50">
                    {person.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Info Section */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <motion.h1
              variants={itemVariants}
              className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-center md:text-left"
            >
              {person.name}
            </motion.h1>

            {/* Known For Department */}
            {person.known_for_department && (
              <motion.div variants={itemVariants} className="mt-2 text-center md:text-left">
                <Badge variant="secondary" className="text-sm">
                  {person.known_for_department}
                </Badge>
              </motion.div>
            )}

            {/* Meta Info */}
            <motion.div
              variants={itemVariants}
              className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-sm text-muted-foreground"
            >
              {formattedBirthday && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {formattedBirthday}
                    {age !== null && !person.deathday && (
                      <span className="text-foreground/70"> ({age} years old)</span>
                    )}
                  </span>
                </div>
              )}
              {formattedDeathday && (
                <div className="flex items-center gap-1.5 text-muted-foreground/70">
                  <span>— {formattedDeathday}</span>
                  {age !== null && <span>({age} years old)</span>}
                </div>
              )}
              {person.place_of_birth && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>{person.place_of_birth}</span>
                </div>
              )}
              {person.popularity > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span>Popularity: {person.popularity.toFixed(0)}</span>
                </div>
              )}
            </motion.div>

            {/* External Links */}
            {hasExternalLinks && (
              <motion.div
                variants={itemVariants}
                className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2"
              >
                {externalIds?.instagram_id && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link
                      href={`https://instagram.com/${externalIds.instagram_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Instagram className="h-4 w-4 mr-1.5" />
                      Instagram
                    </Link>
                  </Button>
                )}
                {externalIds?.twitter_id && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link
                      href={`https://twitter.com/${externalIds.twitter_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Twitter className="h-4 w-4 mr-1.5" />
                      Twitter
                    </Link>
                  </Button>
                )}
                {externalIds?.facebook_id && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link
                      href={`https://facebook.com/${externalIds.facebook_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Facebook className="h-4 w-4 mr-1.5" />
                      Facebook
                    </Link>
                  </Button>
                )}
                {externalIds?.youtube_id && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link
                      href={`https://youtube.com/${externalIds.youtube_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Youtube className="h-4 w-4 mr-1.5" />
                      YouTube
                    </Link>
                  </Button>
                )}
                {person.imdb_id && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link
                      href={`https://imdb.com/name/${person.imdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      IMDb
                    </Link>
                  </Button>
                )}
                {person.homepage && (
                  <Button variant="outline" size="sm" asChild className="h-9">
                    <Link href={person.homepage} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      Website
                    </Link>
                  </Button>
                )}
              </motion.div>
            )}

            {/* Biography */}
            {person.biography && (
              <motion.div variants={itemVariants} className="mt-6">
                <h2 className="text-lg font-semibold mb-2">Biography</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {bioText}
                </p>
                {isBioTruncated && (
                  <details className="mt-2">
                    <summary className="text-sm text-primary cursor-pointer hover:underline">
                      Read more
                    </summary>
                    <p className="mt-2 text-muted-foreground leading-relaxed whitespace-pre-line">
                      {person.biography}
                    </p>
                  </details>
                )}
              </motion.div>
            )}

            {/* Also Known As */}
            {person.also_known_as && person.also_known_as.length > 0 && (
              <motion.div variants={itemVariants} className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1.5">Also Known As</h3>
                <p className="text-sm text-muted-foreground/80">
                  {person.also_known_as.slice(0, 5).join(" • ")}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

