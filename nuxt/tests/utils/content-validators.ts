import { expect } from '@playwright/test'
import { load } from 'cheerio'
import type { Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

export interface ContentValidationResult {
  hasNavigationLinks: boolean
  hasMovieContent: boolean
  hasSeriesContent: boolean
  hasPersonContent: boolean
  hasUserActions: boolean
  contentQuality: {
    textLength: number
    linkCount: number
    imageCount: number
    hasRealContent: boolean
    hasLoadingStates: boolean
  }
}

export class ContentValidator {
  constructor(private page: Page) {}

  /**
   * Save HTML snapshot for manual inspection
   */
  private async saveHtmlSnapshot(filename: string, content?: string): Promise<void> {
    const htmlContent = content || await this.page.content()
    const snapshotsDir = path.join(process.cwd(), 'tests', 'html-snapshots')
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    const fullFilename = `${timestamp}-${filename}.html`
    const filePath = path.join(snapshotsDir, fullFilename)
    
    fs.writeFileSync(filePath, htmlContent, 'utf8')
    console.log(`📄 HTML snapshot saved: ${fullFilename}`)
  }

  /**
   * Validate SSR content structure for search engines
   */
  async validateSSRStructure(pageType: string): Promise<{
    hasProperStructure: boolean
    hasVisibleContent: boolean
    hasWorkingLinks: boolean
    hasProperImages: boolean
    contentBlocked: boolean
    issues: string[]
  }> {
    const content = await this.page.content()
    const $ = load(content)
    const issues: string[] = []

    // Save HTML snapshot for manual inspection
    await this.saveHtmlSnapshot(`${pageType}-ssr-structure`)

    // Check semantic structure
    const hasMain = $('main').length > 0
    const hasArticle = $('article').length > 0
    const hasNav = $('nav, [role="navigation"], .navbar').length > 0
    const hasProperStructure = hasMain || hasArticle || hasNav

    if (!hasProperStructure) {
      issues.push('Missing semantic HTML structure (main, article, or nav)')
    }

    // Check for visible content (not hidden by CSS or loading states)
    const bodyText = $('body').text().trim()
    const hasVisibleContent = bodyText.length > 500 && 
                             !bodyText.toLowerCase().includes('loading...') &&
                             !bodyText.toLowerCase().includes('please wait')

    if (!hasVisibleContent) {
      issues.push('Insufficient visible content or blocked by loading states')
    }

    // Check working navigation links  
    const workingLinks = $('a[href]').filter((_: number, el: any) => {
      const href = $(el).attr('href')
      return !!(href && href.startsWith('/') && !href.includes('javascript:'))
    }).length

    const hasWorkingLinks = workingLinks >= 5

    if (!hasWorkingLinks) {
      issues.push(`Only ${workingLinks} working internal links found (need at least 5)`)
    }

    // Enhanced image validation for SeoImg component
    const imageValidation = this.validateImages($)
    const hasProperImages = imageValidation.isValid
    
    if (!hasProperImages) {
      issues.push(...imageValidation.issues)
    }

    // Check if content is blocked by loading states - be very specific
    const hasSkeletonElements = $('.skeleton, .v-skeleton-loader, [class*="skeleton"]').length > 0
    const hasLoadingSpinners = $('.loading, [class*="loading"]:not([class*="v-"]):not([aria-label])').length > 0
    
    // Only flag actual loading text, not comments, labels, or technical terms  
    const hasLoadingText = (bodyText.toLowerCase().includes('loading...') ||
                           bodyText.toLowerCase().includes('please wait') ||
                           bodyText.toLowerCase().includes('loading content')) &&
                          !bodyText.toLowerCase().includes('lazy load on client') &&
                          !bodyText.toLowerCase().includes('error loading') &&
                          !bodyText.toLowerCase().includes('loading="')

    const hasLoadingBlockers = hasSkeletonElements || hasLoadingSpinners || hasLoadingText

    if (hasLoadingBlockers) {
      issues.push('Content appears to be blocked by loading states or skeletons')
    }

    return {
      hasProperStructure,
      hasVisibleContent,
      hasWorkingLinks,
      hasProperImages,
      contentBlocked: hasLoadingBlockers,
      issues
    }
  }

  /**
   * Enhanced image validation for SeoImg components
   */
  private validateImages($: any): {
    isValid: boolean
    issues: string[]
    totalImages: number
    properImages: number
    seoImages: number
    cdnImages: number
    tmdbImages: number
  } {
    const issues: string[] = []
    let totalImages = 0
    let properImages = 0
    let seoImages = 0
    let cdnImages = 0
    let tmdbImages = 0

    // Check all img tags (should be native img elements from SeoImg)
    const images = $('img')
    
    images.each((_: number, img: any) => {
      totalImages++
      const src = $(img).attr('src')
      const alt = $(img).attr('alt')
      const loading = $(img).attr('loading')
      const parent = $(img).parent()
      
      // Check if it's a SeoImg component (parent should have SeoImg characteristics)
      const isSeoImg = parent.hasClass('seo-img') || 
                       parent.find('.seo-img').length > 0 ||
                       $(img).closest('[data-seo-img]').length > 0
      
      if (isSeoImg) {
        seoImages++
      }
      
      // Check source URL patterns
      if (src) {
        if (src.includes('image.themoviebrowser.com')) {
          cdnImages++
        } else if (src.includes('image.tmdb.org')) {
          tmdbImages++
        }
      }
      
      // Validate core image requirements
      let isProperImage = true
      
      // Must have src attribute
      if (!src || src.includes('skeleton') || src.includes('placeholder')) {
        issues.push(`Image missing valid src: ${src || 'undefined'}`)
        isProperImage = false
      }
      
      // Must have descriptive alt text
      if (!alt || alt.length < 5) {
        issues.push(`Image missing descriptive alt text: ${alt || 'undefined'}`)
        isProperImage = false
      }
      
      // Should have proper loading attribute for SEO
      if (loading && !['lazy', 'eager'].includes(loading)) {
        issues.push(`Image has invalid loading attribute: ${loading}`)
        isProperImage = false
      }
      
      // Check for suspicious patterns that indicate broken images
      if (src && (src.includes('undefined') || src.includes('null') || src === '')) {
        issues.push(`Image has invalid src URL: ${src}`)
        isProperImage = false
      }
      
      if (isProperImage) {
        properImages++
      }
    })
    
    // Validation thresholds
    const imageSuccessRate = totalImages > 0 ? (properImages / totalImages) : 1
    const hasMinImages = totalImages >= 3 // Should have at least some images on content pages
    const hasGoodSuccessRate = imageSuccessRate >= 0.8
    
    // Overall validation
    let isValid = true
    
    if (totalImages > 0 && !hasGoodSuccessRate) {
      issues.push(`Only ${properImages}/${totalImages} images (${Math.round(imageSuccessRate * 100)}%) have proper attributes`)
      isValid = false
    }
    
    // Check for balanced CDN/TMDB usage (should have fallbacks working)
    if (totalImages > 5 && cdnImages === 0 && tmdbImages === 0) {
      issues.push('No CDN or TMDB images found - image system may not be working')
      isValid = false
    }
    
    return {
      isValid,
      issues,
      totalImages,
      properImages,
      seoImages,
      cdnImages,
      tmdbImages
    }
  }

  /**
   * Validate that homepage loads with actual movie/series content
   */
  async validateHomepageContent(): Promise<ContentValidationResult> {
    const content = await this.page.content()
    const $ = load(content)

    // Check for navigation links (Vuetify navigation + movie/series links)
    const navLinks = $('.navbar a, .v-bottom-navigation a, a[href*="/movie/"], a[href*="/series/"], a[href*="/browse"], a[href*="/topics"]').length
    const hasNavigationLinks = navLinks >= 5 // Should have multiple nav or content links

    // Check for movie/series content
    const movieLinks = $('a[href*="/movie/"]').length
    const seriesLinks = $('a[href*="/series/"]').length
    const personLinks = $('a[href*="/person/"]').length

    // Check for trending/featured content sections
    const trendingSection = $('h1, h2, h3').filter((_, el) => {
      const text = $(el).text().toLowerCase()
      return text.includes('trending') || text.includes('popular') || text.includes('featured')
    }).length

    // Content quality checks
    const bodyText = $('body').text()
    const contentLength = bodyText.length
    const allLinks = $('a[href]').length
    const images = $('img[src]').length

    // Use consistent loading state detection (same as SSR structure validator)
    const hasSkeletonElements = $('.skeleton, .v-skeleton-loader, [class*="skeleton"]').length > 0
    const hasLoadingSpinners = $('.loading, [class*="loading"]:not([class*="v-"]):not([aria-label])').length > 0
    
    // Only flag actual loading text, not comments, labels, or technical terms  
    const hasLoadingText = (bodyText.toLowerCase().includes('loading...') ||
                           bodyText.toLowerCase().includes('please wait') ||
                           bodyText.toLowerCase().includes('loading content')) &&
                          !bodyText.toLowerCase().includes('lazy load on client') &&
                          !bodyText.toLowerCase().includes('error loading') &&
                          !bodyText.toLowerCase().includes('loading="')

    // Check for actual content vs placeholders
    const hasRealMovieTitles = movieLinks > 5 // Should have multiple movies
    const hasRealContent = contentLength > 500 && hasRealMovieTitles && !hasSkeletonElements && !hasLoadingText

    return {
      hasNavigationLinks,
      hasMovieContent: movieLinks > 0,
      hasSeriesContent: seriesLinks > 0,
      hasPersonContent: personLinks > 0,
      hasUserActions: $('button, [role="button"]').length > 0,
      contentQuality: {
        textLength: contentLength,
        linkCount: allLinks,
        imageCount: images,
        hasRealContent,
        hasLoadingStates: hasSkeletonElements || hasLoadingSpinners || hasLoadingText
      }
    }
  }

  /**
   * Validate movie page loads with complete content
   */
  async validateMoviePageContent(movieId: string): Promise<ContentValidationResult> {
    const content = await this.page.content()
    const $ = load(content)

    // Check for movie-specific content
    const hasMovieTitle = $('h1').length === 1 && $('h1').text().length > 0
    const hasOverview = $('div, p, section').filter((_, el) => {
      const text = $(el).text()
      return text.length > 100 && text.toLowerCase().includes('overview') ||
             text.length > 200 // Long descriptive text
    }).length > 0

    // Check for cast/crew
    const castLinks = $('a[href*="/person/"]').length
    const hasRecommendations = $('a[href*="/movie/"]').length > 1 // More than just self

    // Check for interactive elements that should work without JS
    const ratingElements = $('[class*="rating"], [aria-label*="rating"]').length
    const watchlistButtons = $('button, [role="button"]').filter((_, el) => {
      const text = $(el).text().toLowerCase()
      return text.includes('watchlist') || text.includes('watch')
    }).length

    // Content quality for movie page
    const bodyText = $('body').text()
    // Use consistent loading state detection (same as SSR structure validator)
    const hasSkeletonElements = $('.skeleton, .v-skeleton-loader, [class*="skeleton"]').length > 0
    const hasLoadingSpinners = $('.loading, [class*="loading"]:not([class*="v-"]):not([aria-label])').length > 0
    const hasLoadingText = (bodyText.toLowerCase().includes('loading...') ||
                           bodyText.toLowerCase().includes('please wait') ||
                           bodyText.toLowerCase().includes('loading content')) &&
                          !bodyText.toLowerCase().includes('lazy load on client') &&
                          !bodyText.toLowerCase().includes('error loading') &&
                          !bodyText.toLowerCase().includes('loading="')
    const hasLoadingStates = hasSkeletonElements || hasLoadingSpinners || hasLoadingText

    // Check navigation with Vuetify components and content links
    const navLinks = $('nav a, header a, .navbar a, .v-bottom-navigation a, a[href*="/movie/"], a[href*="/series/"], a[href*="/person/"], a[href*="/topics"], a[href*="/browse"]').length
    const hasNavigation = navLinks >= 5

    return {
      hasNavigationLinks: hasNavigation,
      hasMovieContent: hasMovieTitle && hasOverview,
      hasSeriesContent: false, // Movie page
      hasPersonContent: castLinks > 0,
      hasUserActions: ratingElements > 0 || watchlistButtons > 0 || $('button, [role="button"], .v-btn').length > 0,
      contentQuality: {
        textLength: bodyText.length,
        linkCount: $('a[href]').length,
        imageCount: $('img[src], [role="img"][aria-label]').length,
        hasRealContent: bodyText.length > 1500 && hasMovieTitle && hasOverview,
        hasLoadingStates
      }
    }
  }

  /**
   * Validate series page loads with complete content
   */
  async validateSeriesPageContent(seriesId: string): Promise<ContentValidationResult> {
    const content = await this.page.content()
    const $ = load(content)
    const bodyText = $('body').text()

    // Check for series-specific content
    const hasSeriesTitle = $('h1').length === 1 && $('h1').text().length > 0
    const hasEpisodes = $('[class*="episode"], [data-episode]').length > 0 ||
                       bodyText.toLowerCase().includes('episode')
    const hasSeason = bodyText.toLowerCase().includes('season') ||
                     $('select, [class*="season"]').length > 0

    // Cast and recommendations
    const castLinks = $('a[href*="/person/"]').length
    const hasRecommendations = $('a[href*="/series/"]').length > 1
    // Use consistent loading state detection (same as SSR structure validator)
    const hasSkeletonElements = $('.skeleton, .v-skeleton-loader, [class*="skeleton"]').length > 0
    const hasLoadingSpinners = $('.loading, [class*="loading"]:not([class*="v-"]):not([aria-label])').length > 0
    const hasLoadingText = (bodyText.toLowerCase().includes('loading...') ||
                           bodyText.toLowerCase().includes('please wait') ||
                           bodyText.toLowerCase().includes('loading content')) &&
                          !bodyText.toLowerCase().includes('lazy load on client') &&
                          !bodyText.toLowerCase().includes('error loading') &&
                          !bodyText.toLowerCase().includes('loading="')
    const hasLoadingStates = hasSkeletonElements || hasLoadingSpinners || hasLoadingText

    // Check navigation with Vuetify components and content links
    const navLinks = $('nav a, header a, .navbar a, .v-bottom-navigation a, a[href*="/movie/"], a[href*="/series/"], a[href*="/person/"], a[href*="/topics"], a[href*="/browse"]').length
    const hasNavigation = navLinks >= 5

    return {
      hasNavigationLinks: hasNavigation,
      hasMovieContent: false, // Series page
      hasSeriesContent: hasSeriesTitle && (hasEpisodes || hasSeason),
      hasPersonContent: castLinks > 0,
      hasUserActions: $('button, [role="button"]').length > 0,
      contentQuality: {
        textLength: bodyText.length,
        linkCount: $('a[href]').length,
        imageCount: $('img[src], [role="img"][aria-label]').length,
        hasRealContent: bodyText.length > 1500 && hasSeriesTitle,
        hasLoadingStates
      }
    }
  }

  /**
   * Validate person page loads with filmography
   */
  async validatePersonPageContent(personId: string): Promise<ContentValidationResult> {
    const content = await this.page.content()
    const $ = load(content)
    const bodyText = $('body').text()

    const hasPersonName = $('h1').length === 1 && $('h1').text().length > 0
    const hasBiography = bodyText.length > 200 // Should have substantial bio text
    const hasFilmography = $('a[href*="/movie/"], a[href*="/series/"]').length > 2
    // Use consistent loading state detection (same as SSR structure validator)
    const hasSkeletonElements = $('.skeleton, .v-skeleton-loader, [class*="skeleton"]').length > 0
    const hasLoadingSpinners = $('.loading, [class*="loading"]:not([class*="v-"]):not([aria-label])').length > 0
    const hasLoadingText = (bodyText.toLowerCase().includes('loading...') ||
                           bodyText.toLowerCase().includes('please wait') ||
                           bodyText.toLowerCase().includes('loading content')) &&
                          !bodyText.toLowerCase().includes('lazy load on client') &&
                          !bodyText.toLowerCase().includes('error loading') &&
                          !bodyText.toLowerCase().includes('loading="')
    const hasLoadingStates = hasSkeletonElements || hasLoadingSpinners || hasLoadingText

    // Check navigation with Vuetify components and content links
    const navLinks = $('nav a, header a, .navbar a, .v-bottom-navigation a, a[href*="/movie/"], a[href*="/series/"], a[href*="/person/"], a[href*="/topics"], a[href*="/browse"]').length
    const hasNavigation = navLinks >= 5

    return {
      hasNavigationLinks: hasNavigation,
      hasMovieContent: $('a[href*="/movie/"]').length > 0,
      hasSeriesContent: $('a[href*="/series/"]').length > 0,
      hasPersonContent: hasPersonName && hasBiography,
      hasUserActions: $('button, [role="button"]').length > 0,
      contentQuality: {
        textLength: bodyText.length,
        linkCount: $('a[href]').length,
        imageCount: $('img[src], [role="img"][aria-label]').length,
        hasRealContent: bodyText.length > 800 && hasPersonName && hasFilmography,
        hasLoadingStates
      }
    }
  }

  /**
   * Validate navigation works without JavaScript
   */
  async validateNavigationContent(): Promise<{
    hasMainNavigation: boolean
    hasWorkingLinks: boolean
    hasBreadcrumbs: boolean
    hasSearchFunctionality: boolean
  }> {
    const content = await this.page.content()
    const $ = load(content)

    // Check for main navigation (including v-bottom-navigation and navbar classes)
    const navElements = $('nav, [role="navigation"], .navbar, .v-bottom-navigation, header')
    const hasMainNavigation = navElements.length > 0

    // Check for working links (non-empty href)
    const workingLinks = $('a[href]').filter((_: number, el: any) => {
      const href = $(el).attr('href')
      return !!(href && href !== '#' && href !== 'javascript:void(0)')
    }).length

    const totalLinks = $('a').length
    const hasWorkingLinks = workingLinks > 0 && (workingLinks / Math.max(totalLinks, 1)) > 0.8

    // Check for breadcrumbs
    const hasBreadcrumbs = $('[aria-label*="breadcrumb"], .breadcrumb, nav ol, nav ul').length > 0

    // Check for search (should have form element)
    const hasSearchFunctionality = $('form, input[type="search"], [role="search"]').length > 0

    return {
      hasMainNavigation,
      hasWorkingLinks,
      hasBreadcrumbs,
      hasSearchFunctionality
    }
  }

  /**
   * Check for common SSR issues
   */
  async validateSSRQuality(): Promise<{
    hasHydrationMismatches: boolean
    hasEmptyContent: boolean
    hasJavaScriptDependencies: boolean
    contentReadiness: 'good' | 'warning' | 'poor'
  }> {
    const content = await this.page.content()
    const $ = load(content)
    const bodyText = $('body').text()

    // Check for hydration mismatch indicators
    const hasHydrationMismatches = bodyText.includes('hydration') ||
                                   content.includes('data-ssr-id') ||
                                   $('.mismatch, [data-hydration]').length > 0

    // Check for empty or minimal content
    const hasEmptyContent = bodyText.trim().length < 500 ||
                           $('main, [role="main"], #app, #__nuxt').text().trim().length < 300

    // Check for JavaScript dependencies in visible content
    const hasJavaScriptDependencies = bodyText.includes('JavaScript is required') ||
                                     bodyText.includes('Enable JavaScript') ||
                                     content.includes('noscript') &&
                                     $('noscript').text().includes('JavaScript')

    // Determine content readiness
    let contentReadiness: 'good' | 'warning' | 'poor' = 'good'
    if (hasEmptyContent || hasJavaScriptDependencies) {
      contentReadiness = 'poor'
    } else if (hasHydrationMismatches || bodyText.length < 500) {
      contentReadiness = 'warning'
    }

    return {
      hasHydrationMismatches,
      hasEmptyContent,
      hasJavaScriptDependencies,
      contentReadiness
    }
  }

  /**
   * Comprehensive content validation
   */
  async runFullContentValidation(pageType: 'homepage' | 'movie' | 'series' | 'person', id?: string) {
    console.log(`🔍 Running full content validation for ${pageType} page...`)

    // Get page-specific content validation
    let pageValidation: ContentValidationResult
    switch (pageType) {
      case 'homepage':
        pageValidation = await this.validateHomepageContent()
        break
      case 'movie':
        pageValidation = await this.validateMoviePageContent(id!)
        break
      case 'series':
        pageValidation = await this.validateSeriesPageContent(id!)
        break
      case 'person':
        pageValidation = await this.validatePersonPageContent(id!)
        break
    }

    // Get common validations
    const navigation = await this.validateNavigationContent()
    const ssrQuality = await this.validateSSRQuality()
    
    // NEW: Validate SSR structure for search engines
    const ssrStructure = await this.validateSSRStructure(pageType)

    // Log any SSR structure issues
    if (ssrStructure.issues.length > 0) {
      console.log(`⚠️  SSR structure issues found:`)
      ssrStructure.issues.forEach(issue => console.log(`   - ${issue}`))
    }

    // Assert critical requirements
    expect(pageValidation.contentQuality.hasRealContent).toBe(true)
    expect(pageValidation.contentQuality.hasLoadingStates).toBe(false)
    expect(pageValidation.hasNavigationLinks).toBe(true)
    expect(ssrQuality.hasEmptyContent).toBe(false)
    expect(ssrQuality.hasJavaScriptDependencies).toBe(false)
    expect(navigation.hasWorkingLinks).toBe(true)

    // NEW: Assert SSR structure requirements
    expect(ssrStructure.hasProperStructure, 'Page should have semantic HTML structure').toBe(true)
    expect(ssrStructure.hasVisibleContent, 'Page should have visible content without JavaScript').toBe(true)
    expect(ssrStructure.hasWorkingLinks, 'Page should have working internal links').toBe(true)
    expect(ssrStructure.hasProperImages, 'Images should have proper src and alt attributes').toBe(true)
    expect(ssrStructure.contentBlocked, 'Content should not be blocked by loading states').toBe(false)

    // Content-specific assertions
    if (pageType === 'homepage') {
      expect(pageValidation.hasMovieContent).toBe(true)
      expect(pageValidation.contentQuality.linkCount).toBeGreaterThan(10)
    }

    console.log(`✅ Content validation passed for ${pageType}`)
    console.log(`📊 Content stats: ${pageValidation.contentQuality.textLength} chars, ${pageValidation.contentQuality.linkCount} links`)

    return { pageValidation, navigation, ssrQuality, ssrStructure }
  }
}
