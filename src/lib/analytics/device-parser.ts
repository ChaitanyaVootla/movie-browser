/**
 * Device Parser
 *
 * Parses user agent strings to extract device, browser, and OS information.
 * Uses regex patterns to avoid adding a heavy dependency like ua-parser-js.
 */

import type { DeviceType } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface ParsedDevice {
  type: DeviceType;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
}

// =============================================================================
// Browser Detection Patterns
// =============================================================================

interface BrowserPattern {
  name: string;
  pattern: RegExp;
  versionPattern?: RegExp;
}

const BROWSER_PATTERNS: BrowserPattern[] = [
  // Order matters - more specific patterns first
  { name: "Edge", pattern: /Edg(?:e|A|iOS)?\//, versionPattern: /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/ },
  { name: "Opera", pattern: /OPR\/|Opera/, versionPattern: /(?:OPR|Opera)[/ ](\d+[\d.]*)/ },
  {
    name: "Samsung Internet",
    pattern: /SamsungBrowser\//,
    versionPattern: /SamsungBrowser\/(\d+[\d.]*)/,
  },
  { name: "UC Browser", pattern: /UCBrowser\//, versionPattern: /UCBrowser\/(\d+[\d.]*)/ },
  { name: "Firefox", pattern: /Firefox\//, versionPattern: /Firefox\/(\d+[\d.]*)/ },
  { name: "Safari", pattern: /Safari\//, versionPattern: /Version\/(\d+[\d.]*)/ },
  { name: "Chrome", pattern: /Chrome\//, versionPattern: /Chrome\/(\d+[\d.]*)/ },
  { name: "IE", pattern: /MSIE|Trident/, versionPattern: /(?:MSIE |rv:)(\d+[\d.]*)/ },
];

// =============================================================================
// OS Detection Patterns
// =============================================================================

interface OSPattern {
  name: string;
  pattern: RegExp;
  versionPattern?: RegExp;
}

const OS_PATTERNS: OSPattern[] = [
  { name: "iOS", pattern: /iPhone|iPad|iPod/, versionPattern: /OS (\d+[_\d]*)/ },
  { name: "Android", pattern: /Android/, versionPattern: /Android (\d+[\d.]*)/ },
  { name: "macOS", pattern: /Mac OS X/, versionPattern: /Mac OS X (\d+[_\d.]*)/ },
  { name: "Windows", pattern: /Windows/, versionPattern: /Windows NT (\d+[\d.]*)/ },
  { name: "Linux", pattern: /Linux/, versionPattern: undefined },
  { name: "Chrome OS", pattern: /CrOS/, versionPattern: undefined },
];

// Windows NT version mapping
const WINDOWS_VERSIONS: Record<string, string> = {
  "10.0": "10/11",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
  "6.0": "Vista",
  "5.1": "XP",
};

// =============================================================================
// Device Type Detection
// =============================================================================

/**
 * Detect device type from user agent
 */
function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();

  // Mobile patterns
  if (
    /mobile|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|opera mobi/i.test(
      ua
    )
  ) {
    return "mobile";
  }

  // Tablet patterns
  if (/ipad|android(?!.*mobile)|tablet|kindle|silk|playbook/i.test(ua)) {
    return "tablet";
  }

  return "desktop";
}

/**
 * Detect browser from user agent
 */
function detectBrowser(userAgent: string): { name: string; version: string } {
  for (const { name, pattern, versionPattern } of BROWSER_PATTERNS) {
    if (pattern.test(userAgent)) {
      let version = "";
      if (versionPattern) {
        const match = userAgent.match(versionPattern);
        if (match) {
          version = match[1];
        }
      }
      return { name, version };
    }
  }

  return { name: "unknown", version: "" };
}

/**
 * Detect OS from user agent
 */
function detectOS(userAgent: string): { name: string; version: string } {
  for (const { name, pattern, versionPattern } of OS_PATTERNS) {
    if (pattern.test(userAgent)) {
      let version = "";
      if (versionPattern) {
        const match = userAgent.match(versionPattern);
        if (match) {
          version = match[1].replace(/_/g, ".");

          // Map Windows NT versions to marketing names
          if (name === "Windows" && WINDOWS_VERSIONS[version]) {
            version = WINDOWS_VERSIONS[version];
          }
        }
      }
      return { name, version };
    }
  }

  return { name: "unknown", version: "" };
}

// =============================================================================
// Main Parser Function
// =============================================================================

/**
 * Parse a user agent string into device, browser, and OS information
 */
export function parseUserAgent(userAgent: string): ParsedDevice {
  if (!userAgent) {
    return {
      type: "desktop",
      browser: "unknown",
      browserVersion: "",
      os: "unknown",
      osVersion: "",
    };
  }

  const deviceType = detectDeviceType(userAgent);
  const { name: browser, version: browserVersion } = detectBrowser(userAgent);
  const { name: os, version: osVersion } = detectOS(userAgent);

  return {
    type: deviceType,
    browser,
    browserVersion,
    os,
    osVersion,
  };
}

/**
 * Get a simple browser string (name + major version)
 */
export function getSimpleBrowser(parsed: ParsedDevice): string {
  if (parsed.browser === "unknown") {
    return "unknown";
  }

  const majorVersion = parsed.browserVersion.split(".")[0];
  return majorVersion ? `${parsed.browser} ${majorVersion}` : parsed.browser;
}

/**
 * Get a simple OS string (name + major version)
 */
export function getSimpleOS(parsed: ParsedDevice): string {
  if (parsed.os === "unknown") {
    return "unknown";
  }

  // For some OSes, don't include version
  if (parsed.os === "Linux" || parsed.os === "Chrome OS") {
    return parsed.os;
  }

  const majorVersion = parsed.osVersion.split(".")[0];
  return majorVersion ? `${parsed.os} ${majorVersion}` : parsed.os;
}
