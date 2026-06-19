---
paths:
  - "src/app/globals.css"
  - "src/stores/preferences.ts"
  - "src/components/providers/color-palette-provider.tsx"
  - "src/components/features/auth/settings-menu.tsx"
  - "src/components/features/auth/user-menu.tsx"
  - "src/components/features/layout/theme-toggle.tsx"
  - "src/components/features/media/hero-backdrop-shell.tsx"
  - "src/components/features/media/media-backdrop.tsx"
---

# Theming System

## Architecture

The app uses a 3-tier theming system:

1. **Mode** (light/dark/system) - Handled by `next-themes`
2. **Style** (background aesthetic) - Handled by Zustand + CSS classes
3. **Accent** (brand color) - Handled by Zustand + CSS classes

## CSS Variables

### Color Space
All colors use **OKLch** for perceptual uniformity:
```css
--brand: oklch(0.59 0.235 22);  /* Scarlet — default accent (dark). lightness, chroma, hue */
```

### Key Variables

| Variable | Purpose |
|----------|---------|
| `--background` | Page background |
| `--foreground` | Text color |
| `--brand` | Accent/brand color — default **Scarlet** `oklch(0.59 0.235 22)` (dark) / `oklch(0.52 0.215 22)` (light); white `--brand-foreground` (specs/2026-06-16-social-signals) |
| `--brand-rgb` | RGB values for gradients (space-separated: `234 36 52` dark / `200 30 46` light) |
| `--sig` | Dulled personal-signal tone (social signals on cards) — `color-mix(in oklab, var(--brand) 78%, #8a8a8a)`; references `--brand` so it re-resolves per mode/accent. See DESIGN.md → Social signals. |
| `--hero-base` | Hero section background (oklch) |
| `--hero-base-rgb` | Hero gradient RGB (space-separated) |

### Hero Gradient Variables
For gradients to work with CSS variables, use space-separated RGB:
```css
--hero-base-rgb: 0 0 0;  /* NOT 0, 0, 0 */
```

Usage in gradients (modern `/` alpha syntax):
```javascript
background: `linear-gradient(to right,
  rgb(var(--hero-base-rgb)) 0%,
  rgb(var(--hero-base-rgb) / 0.7) 10%,
  transparent 30%)`
```

## Style Variants

Applied via `.style-*` classes on `<html>`:

| Style | Description | Background |
|-------|-------------|------------|
| default | Pure Black (OLED) | `oklch(0 0 0)` |
| dim | OLED-adjacent | `oklch(0.08 0 0)` |
| charcoal | Softer dark | `oklch(0.16 0 0)` |
| slate | Blue-tinted grey | `oklch(0.18 0.006 260)` |
| warm | Sepia-tinted | `oklch(0.12 0.015 60)` |
| cool | Blue-tinted | `oklch(0.12 0.015 250)` |
| cream | Light mode warm | `oklch(0.97 0.01 85)` |

**Critical**: `--hero-base` and `--hero-base-rgb` MUST match `--background` for seamless gradient blending.

## Accent Colors

Applied via `.accent-*` classes on `<html>`:

| Accent | Description | Dark Mode Brand |
|--------|-------------|-----------------|
| default | Cinematic red (Scarlet) | `oklch(0.59 0.235 22)` |
| midnight | Electric blue | `oklch(0.72 0.24 255)` |
| forest | Spring green | `oklch(0.75 0.26 145)` |
| golden | Bright yellow | `oklch(0.92 0.22 95)` |
| ocean | Tropical cyan | `oklch(0.82 0.17 195)` |
| sunset | Vibrant orange | `oklch(0.8 0.24 50)` |
| violet | Playful purple | `oklch(0.75 0.28 295)` |
| rose | Fun pink | `oklch(0.78 0.26 350)` |

## State Management

### Preferences Store (`src/stores/preferences.ts`)

```typescript
type BackgroundStyle = "default" | "charcoal" | "slate" | "dim" | "warm" | "cool" | "cream";
type AccentColor = "default" | "midnight" | "forest" | "golden" | "ocean" | "sunset" | "violet" | "rose";

interface PreferencesState {
  cardDisplayMode: CardDisplayMode;
  backgroundStyle: BackgroundStyle;
  accentColor: AccentColor;
}
```

### ColorPaletteProvider

Applies style and accent classes to `document.documentElement`:
```typescript
// On style change
html.classList.remove(...STYLE_CLASSES);
if (style !== "default") html.classList.add(`style-${style}`);

// On accent change
html.classList.remove(...ACCENT_CLASSES);
if (accent !== "default") html.classList.add(`accent-${accent}`);
```

## Hero Section Gradients

### Left Edge Gradient (Desktop)
Fades from solid hero-base on left to transparent on right:
```javascript
background: `linear-gradient(to right,
  rgb(var(--hero-base-rgb)) 0%,
  rgb(var(--hero-base-rgb) / 0.9) 3%,
  rgb(var(--hero-base-rgb) / 0.7) 8%,
  rgb(var(--hero-base-rgb) / 0.4) 15%,
  rgb(var(--hero-base-rgb) / 0.15) 25%,
  transparent 35%)`
```

### Bottom Gradient (Mobile)
Fades from solid at bottom to transparent at top:
```javascript
background: `linear-gradient(to top,
  rgb(var(--hero-base-rgb)) 0%,
  rgb(var(--hero-base-rgb) / 0.95) 20%,
  rgb(var(--hero-base-rgb) / 0.7) 45%,
  rgb(var(--hero-base-rgb) / 0.3) 70%,
  transparent 100%)`
```

## Tailwind Utilities

```css
.bg-hero-base {
  background-color: rgb(var(--hero-base-rgb));
}
```

Use `bg-brand`, `text-brand`, `border-brand` for accent-colored elements.

## Adding New Themes

1. Add type to `BackgroundStyle` or `AccentColor` in preferences store
2. Add CSS class in globals.css (`.style-*` or `.accent-*`)
3. Add to `STYLE_CLASSES` or `ACCENT_CLASSES` in ColorPaletteProvider
4. Add option to settings menus (settings-menu.tsx, user-menu.tsx, theme-toggle.tsx)
5. **For styles**: Ensure `--hero-base` equals `--background` for seamless gradients
6. **For accents**: Include `--brand-rgb` for glow effects
