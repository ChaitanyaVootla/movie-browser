import Link from "next/link";
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
  size?: "sm" | "xs";
}

export function CountryLanguageBadges({
  originCountry,
  originalLanguage,
  mediaType,
  className,
  size = "sm",
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

  const isXs = size === "xs";

  return (
    <div className={cn("flex flex-wrap items-center", isXs ? "gap-1.5" : "gap-2", className)}>
      {/* Country badges */}
      {originCountry?.slice(0, 2).map((country) => (
        <Link key={country} href={getCountryTopicUrl(country)}>
          <span
            className={cn(
              "inline-flex items-center rounded-full bg-secondary text-secondary-foreground cursor-pointer hover:bg-secondary/80 transition-colors font-medium",
              isXs ? "gap-1 px-1.5 h-5 text-[10px]" : "gap-2 px-3 py-1.5 text-xs"
            )}
          >
            <img
              src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`}
              alt={`Flag of ${country}`}
              width={isXs ? 14 : 20}
              height={isXs ? 10 : 14}
              className="rounded-sm shrink-0 block"
            />
            {country}
          </span>
        </Link>
      ))}

      {/* Language badge */}
      {showLanguage && languageName && (
        <Link href={getLanguageTopicUrl(originalLanguage)}>
          <span
            className={cn(
              "inline-flex items-center rounded-full bg-secondary text-secondary-foreground cursor-pointer hover:bg-secondary/80 transition-colors font-medium",
              isXs ? "gap-1 px-1.5 h-5 text-[10px]" : "gap-1.5 px-3 py-1.5 text-xs"
            )}
          >
            <Globe className={cn("shrink-0", isXs ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />
            {languageName}
          </span>
        </Link>
      )}
    </div>
  );
}


