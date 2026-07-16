# =============================================================================
# CloudFront CDN — fronts the apex (themoviebrowser.com + www)
# =============================================================================
# WHY: the 2-vCPU origin OOM-freezes on cold cache under the crawler herd. A CDN
# that edge-caches anonymous HTML and collapses the request herd (Origin Shield)
# is the real fix. See memory cdn-plan-jun11.
#
# This whole file is PURELY ADDITIVE — it does not touch aws_instance.main or
# aws_eip.main. The origin is reached via a NEW `origin.themoviebrowser.com`
# A-record (separate from the apex to avoid an origin->CDN loop). The apex/www
# alias A-records that point AT this distribution are intentionally NOT authored
# here — that's the manual cutover step (see cloudfront-cutover-records.tf.disabled).
#
# Design decisions baked in (from cdn-plan-jun11):
#   * Honor origin Cache-Control (Next emits s-maxage + stale-while-revalidate).
#   * Cache key MUST include `_rsc` (App-Router RSC variant) or client nav breaks.
#   * STRIP Set-Cookie from cached responses or one user's session leaks to all.
#   * Anonymous viewers share one cache key (CloudFront Function strips cookies).
#   * Origin Shield in ap-south-1 (Mumbai, closest to ap-south-2) = herd-collapser.
#   * No invalidations: rely on TTL + SWR; only routine purge is /* on shell deploy.

# -----------------------------------------------------------------------------
# Route53 zone (managed manually; we only read it + add records additively)
# -----------------------------------------------------------------------------
data "aws_route53_zone" "main" {
  name         = "themoviebrowser.com"
  private_zone = false
}

# -----------------------------------------------------------------------------
# ACM certificate (us-east-1 — REQUIRED for CloudFront viewer certs)
# -----------------------------------------------------------------------------
# The existing api cert is wildcard-only (*.themoviebrowser.com) and does NOT
# cover the bare apex, so we need a fresh cert with BOTH the apex and wildcard.
resource "aws_acm_certificate" "cdn" {
  provider = aws.us_east_1

  domain_name               = "themoviebrowser.com"
  subject_alternative_names = ["*.themoviebrowser.com"]
  validation_method         = "DNS"

  tags = {
    Name        = "${var.project_name}-cdn-cert"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records for the ACM cert. With apex + wildcard SANs, ACM
# typically emits a single shared validation CNAME (deduped via for_each).
resource "aws_route53_record" "cdn_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cdn" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for r in aws_route53_record.cdn_cert_validation : r.fqdn]
}

# -----------------------------------------------------------------------------
# Origin hostname — origin.themoviebrowser.com -> EIP
# -----------------------------------------------------------------------------
# MUST be a distinct hostname from the apex. If CloudFront's origin were the apex
# (which will point at CloudFront after cutover) we'd create an infinite
# origin->CDN->origin loop. Caddy will serve this vhost and require the
# X-Origin-Verify header that CloudFront injects (origin lockdown).
resource "aws_route53_record" "origin" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "origin.themoviebrowser.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.main.public_ip]
}

# -----------------------------------------------------------------------------
# Cache policy (custom) — honor origin Cache-Control + RSC-aware cache key
# -----------------------------------------------------------------------------
# We author a custom policy rather than the managed UseOriginCacheControlHeaders
# policies because we need PRECISE control of the query-string cache key:
#   * `_rsc` MUST be in the key (App-Router RSC variant hash — CDNs strip custom
#     Vary, so Next disambiguates the HTML vs RSC payload via this query param).
#   * Discover/browse filter params should also key so filtered pages cache
#     independently (page/sort/genres/...).
# The managed UseOriginCacheControlHeaders policy excludes query strings entirely
# (would break RSC nav); UseOriginCacheControlHeaders-QueryStrings forwards ALL
# query strings (over-fragments the cache). A whitelist is the correct middle.
#
# TTLs: min 0 + default 0 means "obey origin Cache-Control" (no floor); max 1y
# is the ceiling so a long s-maxage + SWR window is respected.
resource "aws_cloudfront_cache_policy" "default" {
  name        = "${var.project_name}-default-html"
  comment     = "Honor origin Cache-Control; cache key includes _rsc + discover filter params"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      # The `rsc` header MUST be in the cache key (Jun 12 2026 incident): the
      # origin-request policy forwards it, so a request with `RSC: 1` but NO
      # `_rsc` query param (bots replaying captured headers — or anyone with
      # curl) makes Next return the flight payload, and without this key entry
      # CloudFront cached that text/x-component body under the SAME key as the
      # HTML page → every user's reload showed the raw RSC payload for an hour
      # (+ a year of stale-while-revalidate). Keying `rsc` costs nothing: HTML
      # requests never send it, and real client-nav requests already split on
      # `_rsc`. Other Next headers stay out of the key (hit ratio).
      header_behavior = "whitelist"
      headers {
        items = ["rsc"]
      }
    }

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = [
          "_rsc",   # App-Router RSC variant key — REQUIRED or client nav breaks
          "page",   # discover/browse pagination
          "sort",   # discover/browse sort
          "genres", # filter
          "year",   # filter
          "rating", # filter
          "lang",    # filter
          "country", # filter
          "q"        # /search.md agent search — MUST be in the cache key or all
                     # /search.md?q=* collapse to one entry (wrong results). Origin
                     # already receives it via the origin-request policy ("all").
        ]
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Origin request policy — forward what Next needs to the custom origin
# -----------------------------------------------------------------------------
# Custom (non-S3) origins: do NOT forward the viewer Host header — the origin is
# selected by origin domain (origin.themoviebrowser.com) and Caddy matches that
# vhost; forwarding the viewer Host (apex) would break vhost routing + TLS SNI.
# Cookies = all so the origin sees the session cookie (the CloudFront Function
# has already stripped cookies for anon requests, so only logged-in cookies pass).
resource "aws_cloudfront_origin_request_policy" "default" {
  name    = "${var.project_name}-default-origin-req"
  comment = "Forward RSC/Next headers + viewer country + all cookies to origin (not Host)"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "rsc",                    # Next RSC request marker
        "next-router-prefetch",   # Next prefetch marker
        "next-router-state-tree", # Next router state
        "next-url",               # Next URL header
        "next-action",            # SERVER ACTIONS — without this the POST isn't
                                  # recognized as an action (broke series season
                                  # episodes via CDN, Jun 11)
        "Content-Type",           # server action arg encoding
        "Origin",                 # server action CSRF check (vs allowedOrigins)
        "Accept",                 # content negotiation (HTML vs RSC)
        # NOTE: Accept-Encoding must NOT be whitelisted here — CloudFront
        # rejects it in an origin-request policy when Compress=true (it manages
        # br/gzip negotiation itself). Removing it; CloudFront still negotiates
        # compression with the origin.
        "CloudFront-Viewer-Country", # geo for SSR region hints
        "CloudFront-Viewer-Address"  # real viewer ip:port — geoip city/tz for
                                     # page-view analytics + session IDs. The
                                     # connection IP at the origin is a CF POP
                                     # (geo-locating it = the Seattle/LA wonky
                                     # location bug, Jun 12). NOTE: this fills
                                     # the 10-header policy quota — an 11th
                                     # needs an AWS quota increase.
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# -----------------------------------------------------------------------------
# Response headers policy — strip Set-Cookie from cached responses
# -----------------------------------------------------------------------------
# CloudFront caches Set-Cookie on cache hits. Without removing it, the first
# (cache-filling) viewer's session/analytics Set-Cookie would be replayed to
# everyone who hits that cached object. Remove it so cached anon HTML carries no
# Set-Cookie. (Uncached paths — /api/*, logged-in — pass Set-Cookie through via
# their own behaviors which use CachingDisabled and no response policy.)
resource "aws_cloudfront_response_headers_policy" "strip_set_cookie" {
  name    = "${var.project_name}-strip-set-cookie"
  comment = "Remove Set-Cookie from cacheable responses to prevent session leak on hits"

  remove_headers_config {
    items {
      header = "Set-Cookie"
    }
  }
}

# -----------------------------------------------------------------------------
# CloudFront Function — anon cookie stripping (viewer-request)
# -----------------------------------------------------------------------------
resource "aws_cloudfront_function" "cookie_normalize" {
  name    = "${var.project_name}-cookie-normalize"
  runtime = "cloudfront-js-2.0"
  comment = "Strip cookies for anon viewers (shared cache key); keep them for logged-in"
  publish = true
  code    = file("${path.module}/cloudfront-cookie-normalize.js")
}

# -----------------------------------------------------------------------------
# AWS-managed policies referenced for static/image + disabled behaviors
# -----------------------------------------------------------------------------
// /_next/image* needs the url/w/q query params in the cache key AND forwarded
// to origin — Managed-CachingOptimized strips ALL query strings, so the image
// optimizer received no `url` and returned 400 (broke every optimized image
// incl. the logo, Jun 11). Custom policy that whitelists exactly those params.
resource "aws_cloudfront_cache_policy" "images" {
  name        = "movie-browser-beta-images"
  comment     = "Next /_next/image: cache by url/w/q, long TTL"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings { items = ["url", "w", "q"] }
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forward everything (all headers/cookies/query strings) to origin — used for
# the uncacheable /api/* behavior (auth, mutations, SSE enrich stream).
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  # AllViewerAndCloudFrontHeaders — forwards all viewer headers PLUS the
  # CloudFront-generated CloudFront-Viewer-* headers. Needed so /api/geo gets
  # CloudFront-Viewer-Country (plain AllViewer does NOT forward CF-generated
  # headers → /api/geo fell back to the edge IP → showed US, Jun 11).
  name = "Managed-AllViewerAndCloudFrontHeaders-2022-06"
}

# -----------------------------------------------------------------------------
# The distribution
# -----------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} apex CDN (themoviebrowser.com + www)"
  http_version    = "http2and3"

  # India-heavy audience. PriceClass_All keeps the India (+ global) edge POPs and
  # the ap-south-1 Origin Shield in-region. Switch to PriceClass_200 to trim cost
  # (drops South America / Australia edges) if egress becomes the dominant cost —
  # PriceClass_100 would DROP the India edges and is wrong for this audience.
  price_class = "PriceClass_All"

  aliases = [
    "themoviebrowser.com",
    "www.themoviebrowser.com"
  ]

  origin {
    domain_name = "origin.themoviebrowser.com"
    origin_id   = "ec2-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only" # CloudFront -> origin always over TLS
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Origin lockdown: Caddy on the origin will 403 any request lacking this
    # secret header, so bots can't bypass the CDN by hitting origin.* directly.
    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret
    }

    # Origin Shield (ap-south-1 Mumbai — closest region to the ap-south-2 origin).
    # THE herd-collapser: concurrent cold-URL misses across all POPs funnel through
    # one shield POP, so the origin renders each cold URL ~once instead of N times.
    #
    # DISABLED Jul 2 2026 (cost): the June bill showed 11.45M shield requests ≈
    # 13M origin fetches/mo — i.e. it collapsed ~nothing. The traffic is unique
    # long-tail URLs from an India-concentrated audience arriving through ~1 POP
    # region, so there is no multi-POP herd to collapse; it was a ~$10/mo pass-
    # through. Re-enable if a genuine multi-region herd reappears (e.g. a viral
    # spike or a deploy cold-window overwhelming the origin). stale-if-error
    # (Caddy) + the non-burstable m8g box remain the origin-freeze safety net.
    origin_shield {
      enabled              = false
      origin_shield_region = "ap-south-1"
    }
  }

  # ---- Default behavior: HTML pages (cacheable anon, RSC-aware) ----
  default_cache_behavior {
    target_origin_id       = "ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # GET/HEAD for cache; OPTIONS for CORS preflight; POST/PUT/PATCH/DELETE so
    # server actions (which POST to page routes, NOT /api/*) reach the origin.
    # POSTs are never cached by CloudFront, and the cache policy keys on safe
    # methods only — so allowing them here is safe.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id            = aws_cloudfront_cache_policy.default.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.default.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.strip_set_cookie.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.cookie_normalize.arn
    }
  }

  # ---- /_next/static/* : immutable build assets, cache hard, no function ----
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # ---- /_next/image* : optimized images, cache hard, no function ----
  ordered_cache_behavior {
    path_pattern           = "/_next/image*"
    target_origin_id       = "ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.images.id
  }

  # ---- /api/* : NEVER cache. Auth, mutations, webhooks, and the SSE enrich ----
  # stream (/api/*/enrich) live here — caching/buffering would break streaming.
  # Forward everything; no CloudFront Function (cookies must pass untouched).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "ec2-origin"
    viewer_protocol_policy    = "redirect-to-https"
    compress                 = false # don't buffer/compress SSE
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # Custom error responses: cache 5xx briefly so a burst doesn't hammer the
  # origin. NOTE: when the origin emits `stale-if-error` (Caddy on cacheable
  # HTML) AND a stale cached object exists, CloudFront serves the stale object
  # and this short error-cache does not apply — stale-if-error takes precedence.
  # This only bites when there is NO cached object to fall back to.
  custom_error_response {
    error_code            = 500
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 502
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 503
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 504
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name}-cdn"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
