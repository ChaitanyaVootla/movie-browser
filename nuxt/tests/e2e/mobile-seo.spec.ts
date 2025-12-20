import { test, expect } from '@playwright/test'
import { SEOValidator } from '../utils/seo-validators'
import { testMovieIds, testSeriesIds, performanceThresholds } from '../fixtures/test-data'

test.describe('Mobile SEO Validation', () => {
  test.use({ 
    viewport: { width: 390, height: 844 }, // iPhone 12 Pro dimensions
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  })

  test('Homepage mobile viewport and meta tags', async ({ page }) => {
    await page.goto('/')
    const validator = new SEOValidator(page)

    const seo = await validator.extractSEOElements()
    
    // Viewport meta tag should be present
    expect(seo.viewport).toBeTruthy()
    expect(seo.viewport).toContain('width=device-width')
    expect(seo.viewport).toContain('initial-scale=1')
    
    // Check mobile-specific meta tags
    const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href')
    expect(appleIcon).toBeTruthy()
    
    // Check theme color
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content')
    expect(themeColor).toBeTruthy()
  })

  test('Mobile page load performance', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime

    // Mobile should load within 4 seconds (more lenient than desktop)
    expect(loadTime).toBeLessThan(4000)
    
    // Check for mobile-optimized content
    const contentLength = (await page.textContent('body'))?.length || 0
    expect(contentLength).toBeGreaterThan(performanceThresholds.contentLength)
  })

  test('Movie page mobile optimization', async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`)
    const validator = new SEOValidator(page)

    // Basic SEO should work on mobile
    await validator.validateBasicSEO()
    await validator.validateOpenGraph()
    
    // Check mobile-specific elements
    await validator.validateSSR()
    
    // Check for touch-friendly elements (meta tag)
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content')
    expect(viewport).not.toContain('user-scalable=no') // Should allow zoom for accessibility
  })

  test('Series page mobile responsiveness', async ({ page }) => {
    await page.goto(`/series/${testSeriesIds.popular}/game-of-thrones`)
    const validator = new SEOValidator(page)

    await validator.validateBasicSEO()
    await validator.validateSSR()
    
    // Check that images have proper alt text for mobile readers
    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      const src = await img.getAttribute('src')
      if (src && !src.includes('skeleton')) {
        expect(alt).toBeTruthy()
      }
    }
  })

  test('PWA manifest and mobile app tags', async ({ page }) => {
    await page.goto('/')
    
    // Check for PWA manifest
    const manifest = await page.getAttribute('link[rel="manifest"]', 'href')
    if (manifest) {
      expect(manifest).toBeTruthy()
      
      // Check apple mobile web app tags
      const appleMeta = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')
      const appleTitle = await page.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content')
      
      // These might be present for PWA
      if (appleMeta) expect(appleMeta).toBe('yes')
      if (appleTitle) expect(appleTitle).toContain('Movie Browser')
    }
  })

  test('Mobile structured data validation', async ({ page }) => {
    await page.goto(`/movie/${testMovieIds.popular}/fight-club`)
    const validator = new SEOValidator(page)

    // Structured data should be the same on mobile
    const structuredData = await validator.validateStructuredData('Movie')
    expect(structuredData).toBeTruthy()
    
    const movieData = structuredData.find((data: any) => data['@type'] === 'Movie')
    expect(movieData).toBeTruthy()
    expect(movieData.name || movieData.title).toBeTruthy()
  })

  test('Mobile Core Web Vitals simulation', async ({ page }) => {
    // Simulate slower mobile connection
    await page.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 100)) // Add 100ms delay
      await route.continue()
    })

    const startTime = Date.now()
    await page.goto('/')
    
    // Wait for largest contentful paint
    await page.waitForFunction(() => {
      return document.readyState === 'complete'
    })
    
    const loadTime = Date.now() - startTime
    console.log(`Mobile simulated load time: ${loadTime}ms`)
    
    // Should still be reasonable even with simulated slow connection
    expect(loadTime).toBeLessThan(6000)
  })
})

test.describe('Mobile Accessibility & SEO', () => {
  test.use({ 
    viewport: { width: 390, height: 844 }
  })

  test('Touch targets and mobile usability', async ({ page }) => {
    await page.goto('/')
    
    // Check for minimum touch target sizes
    const buttons = await page.locator('button, a').all()
    
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const button = buttons[i]
      const box = await button.boundingBox()
      
      if (box) {
        // Minimum 44px touch target recommended
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(32) // Relaxed for dense UI
      }
    }
  })

  test('Mobile text readability', async ({ page }) => {
    await page.goto('/')
    
    // Check font sizes are readable on mobile
    const textElements = await page.locator('p, span, div').all()
    
    for (let i = 0; i < Math.min(textElements.length, 5); i++) {
      const element = textElements[i]
      const fontSize = await element.evaluate(el => {
        return window.getComputedStyle(el).fontSize
      })
      
      const size = parseInt(fontSize.replace('px', ''))
      if (size > 0) {
        expect(size).toBeGreaterThanOrEqual(14) // Minimum readable size
      }
    }
  })

  test('Mobile navigation accessibility', async ({ page }) => {
    await page.goto('/')
    
    // Check for proper ARIA labels on navigation
    const navElements = await page.locator('nav, [role="navigation"]').all()
    expect(navElements.length).toBeGreaterThan(0)
    
    // Check for hamburger menu or mobile navigation
    const mobileMenu = await page.locator('[aria-label*="menu"], [aria-label*="navigation"]').first()
    if (await mobileMenu.isVisible()) {
      const ariaLabel = await mobileMenu.getAttribute('aria-label')
      expect(ariaLabel).toBeTruthy()
    }
  })
})
