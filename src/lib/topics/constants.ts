/**
 * Topic Constants - Languages, Countries, etc.
 */

export interface Language {
  iso_639_1: string;
  english_name: string;
  name: string;
}

// Popular languages (prioritized at top of list)
export const POPULAR_LANGUAGES: Language[] = [
  { iso_639_1: "en", english_name: "English", name: "English" },
  { iso_639_1: "es", english_name: "Spanish", name: "Español" },
  { iso_639_1: "fr", english_name: "French", name: "Français" },
  { iso_639_1: "de", english_name: "German", name: "Deutsch" },
  { iso_639_1: "ja", english_name: "Japanese", name: "日本語" },
  { iso_639_1: "ko", english_name: "Korean", name: "한국어" },
  { iso_639_1: "zh", english_name: "Mandarin", name: "普通话" },
  { iso_639_1: "hi", english_name: "Hindi", name: "हिन्दी" },
  { iso_639_1: "te", english_name: "Telugu", name: "తెలుగు" },
  { iso_639_1: "ta", english_name: "Tamil", name: "தமிழ்" },
  { iso_639_1: "it", english_name: "Italian", name: "Italiano" },
  { iso_639_1: "pt", english_name: "Portuguese", name: "Português" },
  { iso_639_1: "ru", english_name: "Russian", name: "Pусский" },
  { iso_639_1: "tr", english_name: "Turkish", name: "Türkçe" },
  { iso_639_1: "th", english_name: "Thai", name: "ภาษาไทย" },
];

// Full language list
export const ALL_LANGUAGES: Language[] = [
  ...POPULAR_LANGUAGES,
  { iso_639_1: "ar", english_name: "Arabic", name: "العربية" },
  { iso_639_1: "bn", english_name: "Bengali", name: "বাংলা" },
  { iso_639_1: "nl", english_name: "Dutch", name: "Nederlands" },
  { iso_639_1: "pl", english_name: "Polish", name: "Polski" },
  { iso_639_1: "sv", english_name: "Swedish", name: "svenska" },
  { iso_639_1: "da", english_name: "Danish", name: "Dansk" },
  { iso_639_1: "fi", english_name: "Finnish", name: "suomi" },
  { iso_639_1: "no", english_name: "Norwegian", name: "Norsk" },
  { iso_639_1: "cs", english_name: "Czech", name: "Český" },
  { iso_639_1: "hu", english_name: "Hungarian", name: "Magyar" },
  { iso_639_1: "el", english_name: "Greek", name: "ελληνικά" },
  { iso_639_1: "he", english_name: "Hebrew", name: "עִבְרִית" },
  { iso_639_1: "id", english_name: "Indonesian", name: "Bahasa indonesia" },
  { iso_639_1: "ms", english_name: "Malay", name: "Bahasa melayu" },
  { iso_639_1: "vi", english_name: "Vietnamese", name: "Tiếng Việt" },
  { iso_639_1: "uk", english_name: "Ukrainian", name: "Український" },
  { iso_639_1: "ro", english_name: "Romanian", name: "Română" },
  { iso_639_1: "fa", english_name: "Persian", name: "فارسی" },
  { iso_639_1: "cn", english_name: "Cantonese", name: "广州话 / 廣州話" },
  { iso_639_1: "ml", english_name: "Malayalam", name: "മലയാളം" },
  { iso_639_1: "kn", english_name: "Kannada", name: "ಕನ್ನಡ" },
  { iso_639_1: "mr", english_name: "Marathi", name: "मराठी" },
  { iso_639_1: "pa", english_name: "Punjabi", name: "ਪੰਜਾਬੀ" },
];

// Popular countries for movie production
export interface Country {
  code: string;
  name: string;
  flag?: string;
}

export const POPULAR_COUNTRIES: Country[] = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
];

export function getLanguageByCode(code: string): Language | undefined {
  return ALL_LANGUAGES.find((l) => l.iso_639_1 === code);
}

export function getLanguageByName(name: string): Language | undefined {
  const lowerName = name.toLowerCase();
  return ALL_LANGUAGES.find(
    (l) => l.english_name.toLowerCase() === lowerName || l.name.toLowerCase() === lowerName
  );
}

export function getCountryByCode(code: string): Country | undefined {
  return POPULAR_COUNTRIES.find((c) => c.code === code);
}

export function getCountryByName(name: string): Country | undefined {
  const lowerName = name.toLowerCase();
  return POPULAR_COUNTRIES.find((c) => c.name.toLowerCase() === lowerName);
}
