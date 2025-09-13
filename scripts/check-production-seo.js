#!/usr/bin/env node

import fetch from 'node-fetch'
import { load } from 'cheerio'

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://themoviebrowser.com'

const testPages = [
  { path: '/', name: 'Homepage' },
  { path: '/movie/550/fight-club', name: 'Movie Page' },
  { path: '/series/1399/game-of-thrones', name: 'Series Page' },
  { path: '/person/287/brad-pitt', name: 'Person Page' },
  { path: '/browse', name: 'Browse Page' },
  { path: '/topics', name: 'Topics Page' }
]

async function checkPageSEO(url, pageName) {
  console.log(`\n🔍 Checking ${pageName}: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEO-Bot/1.0; +https://github.com/your-org/seo-bot)'
      }
    })
    
    if (!response.ok) {
      console.error(`❌ ${pageName}: HTTP ${response.status}`)
      return false
    }
    
    const html = await response.text()
    const $ = load(html)
    
    let passed = true
    
    // Check title
    const title = $('title').text()
    if (!title || title.length < 10 || title.length > 60) {
      console.error(`❌ ${pageName}: Invalid title length (${title.length})`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: Title OK (${title.length} chars)`)
    }
    
    // Check meta description
    const description = $('meta[name="description"]').attr('content')
    if (!description || description.length < 50 || description.length > 160) {
      console.error(`❌ ${pageName}: Invalid description length (${description?.length || 0})`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: Description OK (${description.length} chars)`)
    }
    
    // Check canonical URL
    const canonical = $('link[rel="canonical"]').attr('href')
    if (!canonical) {
      console.error(`❌ ${pageName}: Missing canonical URL`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: Canonical URL OK`)
    }
    
    // Check Open Graph
    const ogTitle = $('meta[property="og:title"]').attr('content')
    const ogImage = $('meta[property="og:image"]').attr('content')
    if (!ogTitle || !ogImage) {
      console.error(`❌ ${pageName}: Missing Open Graph tags`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: Open Graph OK`)
    }
    
    // Check JSON-LD
    const jsonLdScripts = $('script[type="application/ld+json"]')
    if (jsonLdScripts.length === 0) {
      console.error(`❌ ${pageName}: Missing JSON-LD structured data`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: JSON-LD structured data OK`)
    }
    
    // Check for common SEO issues
    const h1Count = $('h1').length
    if (h1Count !== 1) {
      console.error(`❌ ${pageName}: Invalid H1 count (${h1Count})`)
      passed = false
    } else {
      console.log(`✅ ${pageName}: H1 structure OK`)
    }
    
    return passed
    
  } catch (error) {
    console.error(`❌ ${pageName}: Error checking page - ${error.message}`)
    return false
  }
}

async function runProductionSEOCheck() {
  console.log(`🚀 Starting production SEO check for ${PRODUCTION_URL}`)
  
  let allPassed = true
  
  for (const page of testPages) {
    const url = `${PRODUCTION_URL}${page.path}`
    const passed = await checkPageSEO(url, page.name)
    allPassed = allPassed && passed
  }
  
  console.log('\n📊 SEO Check Summary:')
  console.log(`${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'PASSED' : 'FAILED'}`)
  
  if (!allPassed) {
    console.log('\n🔧 Action Required: Fix SEO issues found above')
    process.exit(1)
  } else {
    console.log('\n🎉 All SEO checks passed!')
  }
}

// Run the check
runProductionSEOCheck().catch(error => {
  console.error('💥 Production SEO check failed:', error)
  process.exit(1)
})
