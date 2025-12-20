import { test, expect } from '@playwright/test'
import { SEOValidator } from '../utils/seo-validators'
import { ContentValidator } from '../utils/content-validators'
import { testMovieIds, testSeriesIds, testPersonIds, criticalPages, seoExpectations } from '../fixtures/test-data'

test.describe('SEO Validation - Critical Pages', () => {
  test.describe.configure({ mode: 'parallel' })

  test('Homepage SEO validation', async ({ page }) => {
    await page.goto('/')
    const seoValidator = new SEOValidator(page)
    const contentValidator = new ContentValidator(page)

    // Basic SEO validation
    const seo = await seoValidator.validateBasicSEO()
    
    // Homepage-specific validation
    await seoValidator.validateHomepageSEO()
    await seoValidator.validateOpenGraph()
    await seoValidator.validateTwitterCard()
    await seoValidator.validateCanonical('https://themoviebrowser.com/')
    
    // Check SSR content and quality
    await seoValidator.validateSSR()
    const contentValidation = await contentValidator.validateHomepageContent()
    
    // Ensure homepage has actual movie/series content without JS
    expect(contentValidation.hasMovieContent, 'Homepage should load with movie content').toBe(true)
    expect(contentValidation.hasSeriesContent, 'Homepage should load with series content').toBe(true)
    expect(contentValidation.contentQuality.hasRealContent, 'Homepage should have real content, not loading states').toBe(true)
    expect(contentValidation.contentQuality.linkCount, 'Homepage should have navigation links').toBeGreaterThan(10)
    
    // Performance check
    const { loadTime } = await seoValidator.validatePerformance()
    console.log(`Homepage load time: ${loadTime}ms`)

    // Validate specific homepage elements
    expect(seo.title).toContain('Movie Browser')
    expect(seo.description).toContain('discover')
    expect(seo.ogType).toBe('website')
    
    console.log(`✅ Homepage loaded with ${contentValidation.contentQuality.linkCount} navigation links`)
  })

  test('Movie page SEO validation', async ({ page }) => {
    const movieId = testMovieIds.popular
    await page.goto(`/movie/${movieId}/fight-club`)
    const validator = new SEOValidator(page)

    // Movie-specific SEO validation
    const { seo, movieData } = await validator.validateMovieSEO(movieId)
    await validator.validateOpenGraph()
    await validator.validateTwitterCard()
    await validator.validateCanonical()
    
    // Check structured data
    const structuredData = await validator.validateStructuredData('Movie')
    expect(movieData.name || movieData.title).toBeTruthy()
    expect(movieData.datePublished || movieData.releasedEvent).toBeTruthy()
    
    // Check SSR content
    await validator.validateSSR()
    
    // Movie-specific assertions
    expect(seo.ogType).toBe('video.movie')
    expect(seo.title).toMatch(seoExpectations.movie.titlePattern)
    
    console.log(`Movie page title: ${seo.title}`)
    console.log(`Movie structured data:`, movieData)
  })

  test('Series page SEO validation', async ({ page }) => {
    const seriesId = testSeriesIds.popular
    await page.goto(`/series/${seriesId}/game-of-thrones`)
    const validator = new SEOValidator(page)

    // Series-specific SEO validation
    const { seo, seriesData } = await validator.validateSeriesSEO(seriesId)
    await validator.validateOpenGraph()
    await validator.validateTwitterCard()
    await validator.validateCanonical()
    
    // Check structured data
    await validator.validateStructuredData('TVSeries')
    expect(seriesData.name).toBeTruthy()
    
    // Check SSR content
    await validator.validateSSR()
    
    // Series-specific assertions
    expect(seo.ogType).toBe('video.tv_show')
    expect(seo.title).toMatch(seoExpectations.series.titlePattern)
    
    console.log(`Series page title: ${seo.title}`)
    console.log(`Series structured data:`, seriesData)
  })

  test('Person page SEO validation', async ({ page }) => {
    const personId = testPersonIds.actor
    await page.goto(`/person/${personId}/brad-pitt`)
    const validator = new SEOValidator(page)

    // Person-specific SEO validation
    const { seo, personData } = await validator.validatePersonSEO(personId)
    await validator.validateOpenGraph()
    await validator.validateTwitterCard()
    await validator.validateCanonical()
    
    // Check structured data
    await validator.validateStructuredData('Person')
    expect(personData.name).toBeTruthy()
    
    // Check SSR content
    await validator.validateSSR()
    
    // Person-specific assertions
    expect(seo.ogType).toBe('profile')
    expect(seo.title).toMatch(seoExpectations.person.titlePattern)
    
    console.log(`Person page title: ${seo.title}`)
    console.log(`Person structured data:`, personData)
  })

  test('Browse page SEO validation', async ({ page }) => {
    await page.goto('/browse')
    const validator = new SEOValidator(page)

    const seo = await validator.validateBasicSEO()
    await validator.validateOpenGraph()
    await validator.validateTwitterCard()
    await validator.validateSSR()
    
    expect(seo.title).toContain('Browse')
    expect(seo.title).toContain('Movie Browser')
  })

  test('Topics page SEO validation', async ({ page }) => {
    await page.goto('/topics')
    const validator = new SEOValidator(page)

    const seo = await validator.validateBasicSEO()
    await validator.validateOpenGraph()
    await validator.validateTwitterCard()
    await validator.validateSSR()
    
    expect(seo.title).toContain('Topics')
    expect(seo.title).toContain('Movie Browser')
  })
})

test.describe('SEO Edge Cases', () => {
  test('404 pages should have proper SEO', async ({ page }) => {
    await page.goto('/non-existent-page')
    const validator = new SEOValidator(page)

    const seo = await validator.extractSEOElements()
    expect(seo.title).toBeTruthy()
    expect(seo.description).toBeTruthy()
    // Should not be indexed
    const metaRobots = await page.getAttribute('meta[name="robots"]', 'content')
    expect(metaRobots).toContain('noindex')
  })

  test('Movie with collection should have proper structured data', async ({ page }) => {
    const movieId = testMovieIds.collection
    await page.goto(`/movie/${movieId}`)
    const validator = new SEOValidator(page)

    const structuredData = await validator.validateStructuredData('Movie')
    const movieData = structuredData.find(data => data['@type'] === 'Movie')
    
    // Check if collection data is present
    expect(movieData).toBeTruthy()
  })

  test('Adult content should have proper restrictions', async ({ page }) => {
    // Test with an adult movie if available
    // This would require authentication or specific handling
    // await goto('/movie/adult-content-id')
    // ... validation for adult content restrictions
  })
})

test.describe('Technical SEO', () => {
  test('All pages should have unique titles', async ({ page }) => {
    const pages = [
      '/',
      `/movie/${testMovieIds.popular}/fight-club`,
      `/series/${testSeriesIds.popular}/game-of-thrones`,
      `/person/${testPersonIds.actor}/brad-pitt`
    ]

    const titles = new Set()
    
    for (const pagePath of pages) {
      await page.goto(pagePath)
      const title = await page.title()
      expect(titles.has(title)).toBe(false)
      titles.add(title)
    }
  })

  test('All meta descriptions should be unique', async ({ page }) => {
    const pages = [
      '/',
      `/movie/${testMovieIds.popular}/fight-club`,
      `/series/${testSeriesIds.popular}/game-of-thrones`,
      `/person/${testPersonIds.actor}/brad-pitt`
    ]

    const descriptions = new Set()
    
    for (const pagePath of pages) {
      await page.goto(pagePath)
      const description = await page.getAttribute('meta[name="description"]', 'content')
      expect(descriptions.has(description)).toBe(false)
      descriptions.add(description)
    }
  })

  test('All pages should have proper heading hierarchy', async ({ page }) => {
    for (const { path } of criticalPages) {
      await page.goto(path)
      
      // Check for H1
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBe(1)
      
      // Check H1 content
      const h1Text = await page.locator('h1').textContent()
      expect(h1Text?.trim()).toBeTruthy()
      expect(h1Text?.length).toBeGreaterThan(5)
    }
  })
})
