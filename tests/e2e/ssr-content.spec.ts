import { test, expect } from '@playwright/test'
import { ContentValidator } from '../utils/content-validators'
import { testMovieIds, testSeriesIds, testPersonIds } from '../fixtures/test-data'

test.describe('SSR Content Validation - Critical Content Without JavaScript', () => {
  test.describe.configure({ mode: 'parallel' })

  test('Homepage loads with complete movie/series content (no JS)', async ({ page }) => {
    await page.goto('/')
    const validator = new ContentValidator(page)

    console.log('🏠 Testing homepage content without JavaScript...')
    
    const result = await validator.runFullContentValidation('homepage')

    // Specific homepage assertions
    expect(result.pageValidation.hasMovieContent, 'Homepage should have movie links').toBe(true)
    expect(result.pageValidation.hasSeriesContent, 'Homepage should have series links').toBe(true)
    expect(result.pageValidation.contentQuality.linkCount, 'Homepage should have many navigation links').toBeGreaterThan(15)
    
    // Navigation should work without JS
    expect(result.navigation.hasMainNavigation, 'Homepage should have main navigation').toBe(true)
    expect(result.navigation.hasWorkingLinks, 'Navigation links should work without JS').toBe(true)
    
    // Content quality checks
    expect(result.pageValidation.contentQuality.textLength, 'Homepage should have substantial content').toBeGreaterThan(1000)
    expect(result.pageValidation.contentQuality.hasLoadingStates, 'Homepage should not show loading states in SSR').toBe(false)
    expect(['good', 'warning']).toContain(result.ssrQuality.contentReadiness) // Homepage content should be ready

    // Image validation for homepage
    expect(result.pageValidation.contentQuality.imageCount, 'Homepage should have multiple images for movie/series posters').toBeGreaterThan(10)
    expect(result.ssrStructure.hasProperImages, 'Homepage images should be properly rendered in SSR').toBe(true)

    console.log(`✅ Homepage loaded with ${result.pageValidation.contentQuality.linkCount} links, ${result.pageValidation.contentQuality.imageCount} images, and ${result.pageValidation.contentQuality.textLength} characters`)
  })

  test('Movie page loads with complete content (no JS)', async ({ page }) => {
    const movieId = testMovieIds.popular
    await page.goto(`/movie/${movieId}/fight-club`)
    const validator = new ContentValidator(page)

    console.log(`🎬 Testing movie page content without JavaScript...`)
    
    const result = await validator.runFullContentValidation('movie', movieId)

    // Movie-specific content assertions
    expect(result.pageValidation.hasMovieContent, 'Movie page should have movie content').toBe(true)
    expect(result.pageValidation.hasPersonContent, 'Movie page should have cast links').toBe(true)
    expect(result.pageValidation.hasUserActions, 'Movie page should have interactive elements').toBe(true)
    
    // Content quality for movie page
    expect(result.pageValidation.contentQuality.textLength, 'Movie page should have detailed content').toBeGreaterThan(1500)
    expect(result.pageValidation.contentQuality.linkCount, 'Movie page should have navigation and cast links').toBeGreaterThan(5)
    
    // Movie page specific image validation
    expect(result.pageValidation.contentQuality.imageCount, 'Movie page should have poster, backdrop, and cast images').toBeGreaterThan(5)
    expect(result.ssrStructure.hasProperImages, 'Movie page images should render properly in SSR').toBe(true)
    
    // Check for essential movie elements in the HTML
    const content = await page.content()
    expect(content).toContain('movie') // Should mention "movie" somewhere
    
    console.log(`✅ Movie page loaded with cast links and detailed content`)
  })

  test('Series page loads with episodes/seasons (no JS)', async ({ page }) => {
    const seriesId = testSeriesIds.popular
    await page.goto(`/series/${seriesId}/game-of-thrones`)
    const validator = new ContentValidator(page)

    console.log(`📺 Testing series page content without JavaScript...`)
    
    const result = await validator.runFullContentValidation('series', seriesId)

    // Series-specific content assertions
    expect(result.pageValidation.hasSeriesContent, 'Series page should have series content').toBe(true)
    expect(result.pageValidation.hasPersonContent, 'Series page should have cast links').toBe(true)
    
    // Series page image validation
    expect(result.pageValidation.contentQuality.imageCount, 'Series page should have poster, backdrop, and cast images').toBeGreaterThan(5)
    expect(result.ssrStructure.hasProperImages, 'Series page images should render properly in SSR').toBe(true)
    
    // Check for series-specific elements
    const content = await page.content()
    const hasSeasonInfo = content.toLowerCase().includes('season') || content.toLowerCase().includes('episode')
    expect(hasSeasonInfo, 'Series page should mention seasons or episodes').toBe(true)
    
    console.log(`✅ Series page loaded with season/episode information and ${result.pageValidation.contentQuality.imageCount} images`)
  })

  test('Person page loads with filmography (no JS)', async ({ page }) => {
    const personId = testPersonIds.actor
    await page.goto(`/person/${personId}/brad-pitt`)
    const validator = new ContentValidator(page)

    console.log(`👤 Testing person page content without JavaScript...`)
    
    const result = await validator.runFullContentValidation('person', personId)

    // Person-specific content assertions
    expect(result.pageValidation.hasPersonContent, 'Person page should have person info').toBe(true)
    expect(result.pageValidation.hasMovieContent, 'Person page should have movie links').toBe(true)
    
    // Person page image validation
    expect(result.pageValidation.contentQuality.imageCount, 'Person page should have profile and filmography images').toBeGreaterThan(3)
    expect(result.ssrStructure.hasProperImages, 'Person page images should render properly in SSR').toBe(true)
    
    // Person page should have substantial biography content
    expect(result.pageValidation.contentQuality.textLength, 'Person page should have biography content').toBeGreaterThan(800)
    
    console.log(`✅ Person page loaded with filmography, biography, and ${result.pageValidation.contentQuality.imageCount} images`)
  })

  test('Browse page loads with filtering options (no JS)', async ({ page }) => {
    await page.goto('/browse')
    const validator = new ContentValidator(page)

    console.log(`🔍 Testing browse page content without JavaScript...`)
    
    // Browse page should have filter forms and movie grid
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    // Should have form elements for filtering
    const hasFilters = $('form, select, input').length > 0
    expect(hasFilters, 'Browse page should have filter forms').toBe(true)
    
    // Should have movie/series content
    const hasContent = $('a[href*="/movie/"], a[href*="/series/"]').length > 0
    expect(hasContent, 'Browse page should have movie/series links').toBe(true)
    
    // Basic content validation
    const ssrQuality = await validator.validateSSRQuality()
    expect(ssrQuality.hasEmptyContent, 'Browse page should not be empty').toBe(false)
    expect(ssrQuality.contentReadiness, 'Browse page should be ready').not.toBe('poor')
    
    console.log(`✅ Browse page loaded with filtering options`)
  })

  test('Topics page loads with topic links (no JS)', async ({ page }) => {
    await page.goto('/topics')
    const validator = new ContentValidator(page)

    console.log(`📑 Testing topics page content without JavaScript...`)
    
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    // Should have topic navigation
    const topicLinks = $('a[href*="/topics/"]').length
    expect(topicLinks, 'Topics page should have topic links').toBeGreaterThan(3)
    
    // Should have category content
    const categoryContent = $('h2, h3, .category, [class*="topic"]').length
    expect(categoryContent, 'Topics page should have categorized content').toBeGreaterThan(0)
    
    // Basic content validation
    const ssrQuality = await validator.validateSSRQuality()
    expect(ssrQuality.hasEmptyContent, 'Topics page should not be empty').toBe(false)
    
    console.log(`✅ Topics page loaded with category navigation`)
  })
})

test.describe('Navigation and Linking (No JavaScript)', () => {
  test('All critical pages have working navigation', async ({ page }) => {
    const pages = [
      { path: '/', name: 'Homepage' },
      { path: `/movie/${testMovieIds.popular}/fight-club`, name: 'Movie Page' },
      { path: `/series/${testSeriesIds.popular}/game-of-thrones`, name: 'Series Page' },
      { path: `/person/${testPersonIds.actor}/brad-pitt`, name: 'Person Page' }
    ]

    for (const { path, name } of pages) {
      await page.goto(path)
      const validator = new ContentValidator(page)
      
      const navigation = await validator.validateNavigationContent()
      
      expect(navigation.hasMainNavigation, `${name} should have main navigation`).toBe(true)
      expect(navigation.hasWorkingLinks, `${name} should have working links`).toBe(true)
      
      // Check for specific navigation elements (Vuetify navigation + content links)
      const navCount = await page.locator('a[href*="/movie/"], a[href*="/series/"], a[href*="/browse"], a[href*="/topics"], .navbar a, .v-bottom-navigation a').count()
      expect(navCount, `${name} should have multiple navigation links`).toBeGreaterThan(3)
      
      console.log(`✅ ${name} navigation verified`)
    }
  })

  test('Movie links lead to valid movie pages', async ({ page }) => {
    await page.goto('/')
    
    // Get the first few movie links
    const movieLinks = await page.locator('a[href*="/movie/"]').first().getAttribute('href')
    
    if (movieLinks) {
      await page.goto(movieLinks)
      
      // Verify the movie page loads properly
      const validator = new ContentValidator(page)
      const ssrQuality = await validator.validateSSRQuality()
      
      expect(ssrQuality.hasEmptyContent, 'Linked movie page should not be empty').toBe(false)
      expect(ssrQuality.contentReadiness, 'Linked movie page should be ready').not.toBe('poor')
      
      // Should have movie title
      const h1Count = await page.locator('h1').count()
      expect(h1Count, 'Movie page should have one H1 title').toBe(1)
      
      console.log(`✅ Movie link navigation verified`)
    }
  })

  test('Series links lead to valid series pages', async ({ page }) => {
    await page.goto('/')
    
    // Get the first series link if available
    const seriesLinks = await page.locator('a[href*="/series/"]').first().getAttribute('href')
    
    if (seriesLinks) {
      await page.goto(seriesLinks)
      
      // Verify the series page loads properly
      const validator = new ContentValidator(page)
      const ssrQuality = await validator.validateSSRQuality()
      
      expect(ssrQuality.hasEmptyContent, 'Linked series page should not be empty').toBe(false)
      
      console.log(`✅ Series link navigation verified`)
    }
  })
})

test.describe('SSR Structure Validation for Search Engines', () => {
  test('Homepage SSR structure is optimized for crawlers', async ({ page }) => {
    await page.goto('/')
    const validator = new ContentValidator(page)

    console.log('🔍 Validating homepage SSR structure for search engines...')
    
    const result = await validator.validateSSRStructure('homepage')

    // Log detailed findings
    console.log(`📊 SSR Structure Analysis:`)
    console.log(`   - Semantic structure: ${result.hasProperStructure ? '✅' : '❌'}`)
    console.log(`   - Visible content: ${result.hasVisibleContent ? '✅' : '❌'}`)
    console.log(`   - Working links: ${result.hasWorkingLinks ? '✅' : '❌'}`)
    console.log(`   - Proper images: ${result.hasProperImages ? '✅' : '❌'}`)
    console.log(`   - Content blocked: ${result.contentBlocked ? '❌' : '✅'}`)

    if (result.issues.length > 0) {
      console.log(`⚠️  Issues found:`)
      result.issues.forEach(issue => console.log(`   - ${issue}`))
    }

    // Assert requirements
    expect(result.hasProperStructure, 'Should have semantic HTML structure').toBe(true)
    expect(result.hasVisibleContent, 'Should have sufficient visible content').toBe(true)
    expect(result.hasWorkingLinks, 'Should have working internal links').toBe(true)
    expect(result.hasProperImages, 'Images should have proper attributes').toBe(true)
    expect(result.contentBlocked, 'Content should not be blocked').toBe(false)
  })

  test('Movie page SSR structure is search engine ready', async ({ page }) => {
    const movieId = testMovieIds.popular
    await page.goto(`/movie/${movieId}/fight-club`)
    const validator = new ContentValidator(page)

    console.log('🎬 Validating movie page SSR structure...')
    
    const result = await validator.validateSSRStructure('movie')

    // Movie pages should have at least 3 working links (nav + related content)
    const workingLinks = await page.locator('a[href^="/"]').count()
    expect(workingLinks, 'Movie page should have multiple internal links').toBeGreaterThan(3)

    // Basic structure requirements
    expect(result.hasProperStructure, 'Should have semantic structure').toBe(true)
    expect(result.hasVisibleContent, 'Should have movie content visible').toBe(true)
  })
})

test.describe('Content Quality Without JavaScript', () => {
  test('No loading states should be visible in SSR', async ({ page }) => {
    const pages = [
      '/',
      `/movie/${testMovieIds.popular}/fight-club`,
      `/series/${testSeriesIds.popular}/game-of-thrones`,
      `/person/${testPersonIds.actor}/brad-pitt`
    ]

    for (const path of pages) {
      await page.goto(path)
      
      const content = await page.content()
      const bodyText = await page.textContent('body')
      
      // Should not contain loading indicators (but allow error messages)
      const hasLoadingSpinners = bodyText?.toLowerCase().includes('loading...') || false
      const hasSkeletons = bodyText?.toLowerCase().includes('skeleton') || content.includes('v-skeleton-loader')
      const isErrorMessage = bodyText?.toLowerCase().includes('error loading') || false
      
      expect(hasLoadingSpinners && !isErrorMessage).toBe(false)
      expect(hasSkeletons).toBe(false)
      
      // Should have substantial content
      expect(bodyText?.length || 0).toBeGreaterThan(500)
      
      console.log(`✅ ${path} has no loading states and substantial content`)
    }
  })

  test('Images have proper alt text for accessibility', async ({ page }) => {
    await page.goto('/')
    
    const images = await page.locator('img').all()
    let imagesChecked = 0
    
    for (const img of images.slice(0, 10)) { // Check first 10 images
      const src = await img.getAttribute('src')
      const alt = await img.getAttribute('alt')
      
      if (src && !src.includes('skeleton') && !src.includes('placeholder') && 
          !src.includes('login_small.svg')) { // Skip system icons that don't need alt text
        expect(alt, `Image ${src} should have alt text`).toBeTruthy()
        expect(alt?.length || 0, `Image ${src} alt text should be descriptive`).toBeGreaterThan(3)
        imagesChecked++
      }
    }
    
    console.log(`✅ Checked ${imagesChecked} images for proper alt text`)
  })

  test('Forms work without JavaScript', async ({ page }) => {
    await page.goto('/browse')
    
    // Check for form elements
    const forms = await page.locator('form').count()
    const inputs = await page.locator('input, select').count()
    
    if (forms > 0 || inputs > 0) {
      // Forms should have proper action attributes or method
      const formElements = await page.locator('form').all()
      
      for (const form of formElements) {
        const action = await form.getAttribute('action')
        const method = await form.getAttribute('method')
        
        // Should have either action or be a GET form
        expect(action || method === 'get' || method === null).toBeTruthy()
      }
      
      console.log(`✅ Forms are properly configured for no-JS operation`)
    }
  })
})

test.describe('SeoImg Component & Image Loading Tests', () => {
  test.describe.configure({ mode: 'parallel' })

  test('SeoImg components render native img tags in SSR', async ({ page }) => {
    await page.goto('/')
    const validator = new ContentValidator(page)

    console.log('🖼️ Testing SeoImg SSR rendering...')
    
    // Get raw HTML to verify native img tags are present
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    // Check for native img elements (SeoImg should render these)
    const nativeImages = $('img')
    expect(nativeImages.length, 'Should have native img tags from SeoImg components').toBeGreaterThan(5)
    
    // Verify image attributes
    let imagesWithSrc = 0
    let imagesWithAlt = 0
    let imagesWithLoading = 0
    
    nativeImages.each((_, img) => {
      const src = $(img).attr('src')
      const alt = $(img).attr('alt')
      const loading = $(img).attr('loading')
      
      if (src && !src.includes('skeleton')) imagesWithSrc++
      if (alt && alt.length > 3) imagesWithAlt++
      if (loading && ['lazy', 'eager'].includes(loading)) imagesWithLoading++
    })
    
    expect(imagesWithSrc, 'Most images should have proper src attributes').toBeGreaterThan(nativeImages.length * 0.7)
    expect(imagesWithAlt, 'Most images should have descriptive alt text').toBeGreaterThan(nativeImages.length * 0.8)
    expect(imagesWithLoading, 'Images should have proper loading attributes').toBeGreaterThan(nativeImages.length * 0.5)
    
    console.log(`✅ Found ${nativeImages.length} native img tags: ${imagesWithSrc} with src, ${imagesWithAlt} with alt, ${imagesWithLoading} with loading attrs`)
  })

  test('Image fallback system works (CDN → TMDB)', async ({ page }) => {
    await page.goto('/movie/550/fight-club')
    
    console.log('🔄 Testing CDN/TMDB image fallback system...')
    
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    let cdnImages = 0
    let tmdbImages = 0
    let totalImages = 0
    
    $('img').each((_, img) => {
      const src = $(img).attr('src')
      if (src && !src.includes('skeleton')) {
        totalImages++
        if (src.includes('image.themoviebrowser.com')) {
          cdnImages++
        } else if (src.includes('image.tmdb.org')) {
          tmdbImages++
        }
      }
    })
    
    // Should have either CDN images or TMDB fallbacks (or both)
    expect(cdnImages + tmdbImages, 'Should have CDN or TMDB images').toBeGreaterThan(0)
    expect(totalImages, 'Should have images on movie page').toBeGreaterThan(3)
    
    console.log(`✅ Image sources: ${cdnImages} CDN, ${tmdbImages} TMDB out of ${totalImages} total`)
  })

  test('Image alt text is SEO-optimized', async ({ page }) => {
    await page.goto('/')
    
    console.log('🔍 Testing image alt text quality...')
    
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    let goodAltText = 0
    let totalImages = 0
    const badAltExamples: string[] = []
    
    $('img').each((_, img) => {
      const alt = $(img).attr('alt')
      const src = $(img).attr('src')
      
      if (src && !src.includes('skeleton')) {
        totalImages++
        
        if (alt) {
          // Good alt text criteria
          const isDescriptive = alt.length > 10
          const hasContext = alt.includes('movie') || alt.includes('series') || alt.includes('poster') || 
                            alt.includes('actor') || alt.includes('character') || alt.includes('TV')
          const notGeneric = !alt.toLowerCase().includes('image') || 
                           !alt.toLowerCase().includes('picture')
          
          if (isDescriptive && hasContext) {
            goodAltText++
          } else {
            badAltExamples.push(alt)
          }
        } else {
          badAltExamples.push('(missing alt text)')
        }
      }
    })
    
    const altTextQuality = totalImages > 0 ? (goodAltText / totalImages) : 1
    
    expect(altTextQuality, `Image alt text quality should be high. Bad examples: ${badAltExamples.slice(0, 3).join(', ')}`).toBeGreaterThan(0.7)
    
    console.log(`✅ Alt text quality: ${goodAltText}/${totalImages} (${Math.round(altTextQuality * 100)}%) have descriptive alt text`)
  })

  test('Images do not block critical content rendering', async ({ page }) => {
    await page.goto('/')
    
    console.log('⚡ Testing that images don\'t block content...')
    
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    // Check that we have substantial text content even with images
    const bodyText = $('body').text()
    const textLength = bodyText.length
    
    // Check for loading states that might block content
    const skeletonLoaders = $('.v-skeleton-loader, .skeleton').length
    const loadingText = bodyText.toLowerCase().includes('loading...') || 
                       bodyText.toLowerCase().includes('please wait')
    
    expect(textLength, 'Should have substantial text content').toBeGreaterThan(1000)
    expect(loadingText, 'Should not show loading text in SSR').toBe(false)
    
    // Some skeleton loaders are OK (as placeholders), but not too many
    expect(skeletonLoaders, 'Should have minimal skeleton loaders in SSR').toBeLessThan(10)
    
    console.log(`✅ Content not blocked: ${textLength} chars, ${skeletonLoaders} skeleton loaders`)
  })

  test('Lazy loading attributes are properly set', async ({ page }) => {
    await page.goto('/')
    
    console.log('🐌 Testing lazy loading implementation...')
    
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    let lazyImages = 0
    let eagerImages = 0
    let totalImages = 0
    
    $('img').each((_, img) => {
      const loading = $(img).attr('loading')
      const src = $(img).attr('src')
      
      if (src && !src.includes('skeleton')) {
        totalImages++
        if (loading === 'lazy') {
          lazyImages++
        } else if (loading === 'eager') {
          eagerImages++
        }
      }
    })
    
    // Most images should have loading attributes
    const withLoadingAttr = lazyImages + eagerImages
    const loadingAttrRate = totalImages > 0 ? (withLoadingAttr / totalImages) : 1
    
    expect(loadingAttrRate, 'Most images should have loading attributes').toBeGreaterThan(0.7)
    expect(lazyImages, 'Should have some lazy-loaded images').toBeGreaterThan(0)
    
    console.log(`✅ Loading attrs: ${lazyImages} lazy, ${eagerImages} eager out of ${totalImages} total`)
  })

  test('Image aspect ratios and sizing work correctly', async ({ page }) => {
    await page.goto('/movie/550/fight-club')
    
    console.log('📐 Testing image aspect ratios and sizing...')
    
    // Check for inline styles or CSS that sets aspect ratios
    const content = await page.content()
    const $ = await import('cheerio').then(m => m.load(content))
    
    let imagesWithSizing = 0
    let totalImages = 0
    
    $('img').each((_, img) => {
      const src = $(img).attr('src')
      const style = $(img).attr('style')
      const className = $(img).attr('class')
      
      if (src && !src.includes('skeleton')) {
        totalImages++
        
        // Check for size-related attributes
        if (style?.includes('aspect-ratio') || 
            className?.includes('aspect') || 
            style?.includes('width') || 
            style?.includes('height')) {
          imagesWithSizing++
        }
      }
    })
    
    if (totalImages > 0) {
      const sizingRate = imagesWithSizing / totalImages
      expect(sizingRate, 'Images should have proper sizing/aspect ratio CSS').toBeGreaterThan(0.5)
    }
    
    console.log(`✅ Image sizing: ${imagesWithSizing}/${totalImages} have sizing attributes`)
  })
})
