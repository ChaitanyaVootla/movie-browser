import { expect } from '@playwright/test'
import { load } from 'cheerio'
import type { Page } from '@playwright/test'

export interface SEOElements {
  title: string
  description: string
  canonical: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  ogUrl: string
  ogType: string
  twitterCard: string
  jsonLd: any[]
  lang: string
  viewport: string
}

export class SEOValidator {
  constructor(private page: Page) {}

  /**
   * Extract all SEO elements from the current page
   */
  async extractSEOElements(): Promise<SEOElements> {
    const content = await this.page.content()
    const $ = load(content)

    // Extract JSON-LD structured data
    const jsonLdScripts = $('script[type="application/ld+json"]')
    const jsonLd = jsonLdScripts.toArray().map(script => {
      try {
        return JSON.parse($(script).html() || '{}')
      } catch {
        return {}
      }
    })

    return {
      title: $('title').text() || '',
      description: $('meta[name="description"]').attr('content') || '',
      canonical: $('link[rel="canonical"]').attr('href') || '',
      ogTitle: $('meta[property="og:title"]').attr('content') || '',
      ogDescription: $('meta[property="og:description"]').attr('content') || '',
      ogImage: $('meta[property="og:image"]').attr('content') || '',
      ogUrl: $('meta[property="og:url"]').attr('content') || '',
      ogType: $('meta[property="og:type"]').attr('content') || '',
      twitterCard: $('meta[name="twitter:card"]').attr('content') || '',
      jsonLd,
      lang: $('html').attr('lang') || '',
      viewport: $('meta[name="viewport"]').attr('content') || '',
    }
  }

  /**
   * Validate basic SEO requirements
   */
  async validateBasicSEO() {
    const seo = await this.extractSEOElements()

    // Title requirements
    expect(seo.title).toBeTruthy()
    expect(seo.title.length).toBeGreaterThan(10)
    expect(seo.title.length).toBeLessThan(60)
    expect(seo.title).toContain('Movie Browser')

    // Meta description
    expect(seo.description).toBeTruthy()
    expect(seo.description.length).toBeGreaterThan(50)
    expect(seo.description.length).toBeLessThan(160)

    // Basic meta tags
    expect(seo.lang).toBe('en')
    expect(seo.viewport).toContain('width=device-width')

    return seo
  }

  /**
   * Validate Open Graph tags
   */
  async validateOpenGraph() {
    const seo = await this.extractSEOElements()

    expect(seo.ogTitle).toBeTruthy()
    expect(seo.ogDescription).toBeTruthy()
    expect(seo.ogImage).toBeTruthy()
    expect(seo.ogUrl).toBeTruthy()
    expect(seo.ogType).toBeTruthy()

    // Check image URLs are valid
    expect(seo.ogImage).toMatch(/^https?:\/\//)
    expect(seo.ogUrl).toMatch(/^https?:\/\//)

    return seo
  }

  /**
   * Validate Twitter Card tags
   */
  async validateTwitterCard() {
    const seo = await this.extractSEOElements()
    
    expect(seo.twitterCard).toBeTruthy()
    expect(['summary', 'summary_large_image']).toContain(seo.twitterCard)

    return seo
  }

  /**
   * Validate canonical URL
   */
  async validateCanonical(expectedUrl?: string) {
    const seo = await this.extractSEOElements()
    
    expect(seo.canonical).toBeTruthy()
    expect(seo.canonical).toMatch(/^https?:\/\//)
    
    if (expectedUrl) {
      expect(seo.canonical).toBe(expectedUrl)
    }

    return seo
  }

  /**
   * Validate JSON-LD structured data
   */
  async validateStructuredData(expectedType?: string) {
    const seo = await this.extractSEOElements()
    
    expect(seo.jsonLd).toHaveLength.greaterThan(0)
    
    if (expectedType) {
      const hasExpectedType = seo.jsonLd.some(data => 
        data['@type'] === expectedType
      )
      expect(hasExpectedType).toBe(true)
    }

    return seo.jsonLd
  }

  /**
   * Validate movie-specific SEO
   */
  async validateMovieSEO(movieId: string) {
    const seo = await this.extractSEOElements()
    
    // Movie-specific validations
    expect(seo.title).toMatch(/.*\|.*Movie Browser/)
    expect(seo.ogType).toBe('video.movie')
    
    // Check for Movie structured data
    const movieData = seo.jsonLd.find(data => data['@type'] === 'Movie')
    expect(movieData).toBeTruthy()
    expect(movieData.name || movieData.title).toBeTruthy()
    
    // Check canonical URL contains movie ID
    expect(seo.canonical).toContain(`/movie/${movieId}`)

    return { seo, movieData }
  }

  /**
   * Validate series-specific SEO
   */
  async validateSeriesSEO(seriesId: string) {
    const seo = await this.extractSEOElements()
    
    // Series-specific validations
    expect(seo.title).toMatch(/.*\|.*Movie Browser/)
    expect(seo.ogType).toBe('video.tv_show')
    
    // Check for TVSeries structured data
    const seriesData = seo.jsonLd.find(data => data['@type'] === 'TVSeries')
    expect(seriesData).toBeTruthy()
    expect(seriesData.name).toBeTruthy()
    
    // Check canonical URL contains series ID
    expect(seo.canonical).toContain(`/series/${seriesId}`)

    return { seo, seriesData }
  }

  /**
   * Validate person-specific SEO
   */
  async validatePersonSEO(personId: string) {
    const seo = await this.extractSEOElements()
    
    // Person-specific validations
    expect(seo.title).toMatch(/.*\|.*Movie Browser/)
    expect(seo.ogType).toBe('profile')
    
    // Check for Person structured data
    const personData = seo.jsonLd.find(data => data['@type'] === 'Person')
    expect(personData).toBeTruthy()
    expect(personData.name).toBeTruthy()
    
    // Check canonical URL contains person ID
    expect(seo.canonical).toContain(`/person/${personId}`)

    return { seo, personData }
  }

  /**
   * Validate homepage SEO
   */
  async validateHomepageSEO() {
    const seo = await this.extractSEOElements()
    
    // Homepage-specific validations
    expect(seo.title).toContain('Movie Browser')
    expect(seo.description).toContain('movie')
    expect(seo.ogType).toBe('website')
    expect(seo.canonical).toMatch(/\/$/)

    return seo
  }

  /**
   * Check page load performance (Core Web Vitals)
   */
  async validatePerformance() {
    const startTime = Date.now()
    await this.page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime

    // Should load within 3 seconds for good SEO
    expect(loadTime).toBeLessThan(3000)

    return { loadTime }
  }

  /**
   * Validate that page renders content without JavaScript
   */
  async validateSSR() {
    const content = await this.page.content()
    const $ = load(content)

    // Check for actual content, not just loading states
    const textContent = $('body').text()
    expect(textContent.length).toBeGreaterThan(500)
    
    // Should not contain common loading indicators
    expect(textContent).not.toContain('Loading...')
    expect(textContent).not.toContain('skeleton')

    // Check for semantic HTML
    expect($('main').length).toBeGreaterThan(0)
    expect($('h1').length).toBeGreaterThan(0)

    return { contentLength: textContent.length }
  }
}
