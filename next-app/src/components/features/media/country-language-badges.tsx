import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// Language code to name mapping (common languages)
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  hi: "Hindi",
  ar: "Arabic",
  tr: "Turkish",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  tl: "Tagalog",
  he: "Hebrew",
  el: "Greek",
  cs: "Czech",
  hu: "Hungarian",
  ro: "Romanian",
  uk: "Ukrainian",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  fa: "Persian",
  ur: "Urdu",
  cn: "Cantonese",
};

interface CountryLanguageBadgesProps {
  originCountry?: string[];
  originalLanguage?: string;
  mediaType: "movie" | "series";
  className?: string;
}

export function CountryLanguageBadges({
  originCountry,
  originalLanguage,
  mediaType,
  className,
}: CountryLanguageBadgesProps) {
  // Don't show English as it's the default
  const showLanguage = originalLanguage && originalLanguage !== "en";
  const languageName = showLanguage ? LANGUAGE_NAMES[originalLanguage] || originalLanguage : null;

  if (!originCountry?.length && !showLanguage) return null;

  // Build topic URL for country
  const getCountryTopicUrl = (countryCode: string) => {
    const type = mediaType === "movie" ? "movie" : "tv";
    return `/topics/country-${countryCode.toLowerCase()}-${type}`;
  };

  // Build topic URL for language
  const getLanguageTopicUrl = (langCode: string) => {
    const langName = LANGUAGE_NAMES[langCode]?.toLowerCase() || langCode;
    const type = mediaType === "movie" ? "movie" : "tv";
    return `/topics/language-${langName}-${type}`;
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Country badges */}
      {originCountry?.slice(0, 2).map((country) => (
        <Link key={country} href={getCountryTopicUrl(country)}>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80 transition-colors gap-2 px-3 py-1.5"
          >
            <Image
              src={`https://flagcdn.com/${country.toLowerCase()}.svg`}
              alt={`Flag of ${country}`}
              width={20}
              height={14}
              className="rounded-sm"
              unoptimized
            />
            <span className="text-xs">{country}</span>
          </Badge>
        </Link>
      ))}

      {/* Language badge */}
      {showLanguage && languageName && (
        <Link href={getLanguageTopicUrl(originalLanguage)}>
          <Badge
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80 transition-colors gap-1.5 px-3 py-1.5"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="text-xs">{languageName}</span>
          </Badge>
        </Link>
      )}
    </div>
  );
}


