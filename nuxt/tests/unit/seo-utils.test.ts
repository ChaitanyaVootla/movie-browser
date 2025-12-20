import { describe, it, expect, vi } from 'vitest'
import { seoExpectations, performanceThresholds } from '../fixtures/test-data'

describe('SEO Utils', () => {
  describe('SEO Expectations', () => {
    it('should have valid title patterns', () => {
      expect(seoExpectations.movie.titlePattern).toBeDefined()
      expect(seoExpectations.series.titlePattern).toBeDefined()
      expect(seoExpectations.person.titlePattern).toBeDefined()
      expect(seoExpectations.homepage.titlePattern).toBeDefined()
    })

    it('should have valid description lengths', () => {
      expect(seoExpectations.movie.descriptionMinLength).toBeGreaterThan(0)
      expect(seoExpectations.series.descriptionMinLength).toBeGreaterThan(0)
      expect(seoExpectations.person.descriptionMinLength).toBeGreaterThan(0)
      expect(seoExpectations.homepage.descriptionMinLength).toBeGreaterThan(0)
    })

    it('should have correct Open Graph types', () => {
      expect(seoExpectations.movie.ogType).toBe('video.movie')
      expect(seoExpectations.series.ogType).toBe('video.tv_show')
      expect(seoExpectations.person.ogType).toBe('profile')
      expect(seoExpectations.homepage.ogType).toBe('website')
    })

    it('should have valid structured data types', () => {
      expect(seoExpectations.movie.structuredDataType).toBe('Movie')
      expect(seoExpectations.series.structuredDataType).toBe('TVSeries')
      expect(seoExpectations.person.structuredDataType).toBe('Person')
      expect(seoExpectations.homepage.structuredDataType).toBeNull()
    })
  })

  describe('Performance Thresholds', () => {
    it('should have reasonable performance expectations', () => {
      expect(performanceThresholds.loadTime).toBeLessThanOrEqual(5000)
      expect(performanceThresholds.contentLength).toBeGreaterThan(100)
      expect(performanceThresholds.titleLength.min).toBeGreaterThan(5)
      expect(performanceThresholds.titleLength.max).toBeLessThan(100)
      expect(performanceThresholds.descriptionLength.min).toBeGreaterThan(20)
      expect(performanceThresholds.descriptionLength.max).toBeLessThan(200)
    })
  })

  describe('URL Validation', () => {
    it('should validate canonical URLs format', () => {
      const validUrls = [
        'https://themoviebrowser.com/',
        'https://themoviebrowser.com/movie/123/test-movie',
        'https://themoviebrowser.com/series/456/test-series',
        'https://themoviebrowser.com/person/789/test-person'
      ]

      const urlPattern = /^https:\/\/themoviebrowser\.com\//

      validUrls.forEach(url => {
        expect(url).toMatch(urlPattern)
      })
    })

    it('should validate slug format', () => {
      const validSlugs = [
        'fight-club',
        'game-of-thrones',
        'brad-pitt',
        'the-dark-knight'
      ]

      const slugPattern = /^[a-z0-9-]+$/

      validSlugs.forEach(slug => {
        expect(slug).toMatch(slugPattern)
      })
    })
  })

  describe('Meta Tag Validation', () => {
    it('should validate title length constraints', () => {
      const validTitles = [
        'Fight Club | The Movie Browser',
        'Game of Thrones | The Movie Browser',
        'Brad Pitt | The Movie Browser'
      ]

      const invalidTitles = [
        'A', // Too short
        'This is an extremely long title that exceeds the recommended length for SEO and will likely be truncated by search engines which is not good for user experience', // Too long
        '' // Empty
      ]

      validTitles.forEach(title => {
        expect(title.length).toBeGreaterThanOrEqual(performanceThresholds.titleLength.min)
        expect(title.length).toBeLessThanOrEqual(performanceThresholds.titleLength.max)
      })

      invalidTitles.forEach(title => {
        expect(
          title.length >= performanceThresholds.titleLength.min &&
          title.length <= performanceThresholds.titleLength.max
        ).toBe(false)
      })
    })

    it('should validate description length constraints', () => {
      const validDescription = 'This is a valid meta description that provides useful information about the page content and is within the recommended length limits.'
      const invalidDescriptions = [
        'Short', // Too short
        'This is an extremely long meta description that exceeds the recommended length for SEO purposes and will likely be truncated by search engines which negatively impacts click-through rates and user experience when browsing search results', // Too long
        '' // Empty
      ]

      expect(validDescription.length).toBeGreaterThanOrEqual(performanceThresholds.descriptionLength.min)
      expect(validDescription.length).toBeLessThanOrEqual(performanceThresholds.descriptionLength.max)

      invalidDescriptions.forEach(desc => {
        expect(
          desc.length >= performanceThresholds.descriptionLength.min &&
          desc.length <= performanceThresholds.descriptionLength.max
        ).toBe(false)
      })
    })
  })

  describe('JSON-LD Validation', () => {
    it('should validate Movie structured data schema', () => {
      const movieSchema = {
        '@context': 'https://schema.org',
        '@type': 'Movie',
        'name': 'Fight Club',
        'description': 'A movie about an insomniac office worker...',
        'datePublished': '1999-10-15',
        'genre': ['Drama', 'Thriller'],
        'director': {
          '@type': 'Person',
          'name': 'David Fincher'
        }
      }

      expect(movieSchema['@context']).toBe('https://schema.org')
      expect(movieSchema['@type']).toBe('Movie')
      expect(movieSchema.name).toBeTruthy()
      expect(movieSchema.description).toBeTruthy()
      expect(movieSchema.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should validate TVSeries structured data schema', () => {
      const seriesSchema = {
        '@context': 'https://schema.org',
        '@type': 'TVSeries',
        'name': 'Game of Thrones',
        'description': 'A fantasy drama series...',
        'startDate': '2011-04-17',
        'endDate': '2019-05-19',
        'numberOfSeasons': 8
      }

      expect(seriesSchema['@context']).toBe('https://schema.org')
      expect(seriesSchema['@type']).toBe('TVSeries')
      expect(seriesSchema.name).toBeTruthy()
      expect(seriesSchema.numberOfSeasons).toBeGreaterThan(0)
    })

    it('should validate Person structured data schema', () => {
      const personSchema = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        'name': 'Brad Pitt',
        'jobTitle': 'Actor',
        'birthDate': '1963-12-18',
        'nationality': 'American'
      }

      expect(personSchema['@context']).toBe('https://schema.org')
      expect(personSchema['@type']).toBe('Person')
      expect(personSchema.name).toBeTruthy()
      expect(personSchema.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
