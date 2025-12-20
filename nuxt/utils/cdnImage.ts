export enum IMAGE_TYPE {
    POSTER = 'poster',
    LOGO = 'logo',
    BACKDROP = 'backdrop',
    WIDE_CARD = 'widePoster',
}

// Track CDN health to avoid repeated failed requests
let cdnFailureCount = 0;
let cdnIsDown = false;
let lastCdnCheck = 0;
const CDN_CHECK_INTERVAL = 60000; // 1 minute

export const getCdnImage = (item: any, imageType: IMAGE_TYPE) => {
    // Only use CDN for valid items with numeric IDs
    if (!item || !item.id || typeof item.id !== 'number' || item.id.toString().includes('skeleton')) {
        return getTmdbFallback(item, imageType);
    }
    
    // If CDN appears down, skip CDN and go straight to TMDB
    const now = Date.now();
    if (cdnIsDown && (now - lastCdnCheck) < CDN_CHECK_INTERVAL) {
        return getTmdbFallback(item, imageType);
    }
    
    const cdnUrl = `https://image.themoviebrowser.com/${item.title?'movie':'series'}/${item.id}/${imageType}.webp`;
    return cdnUrl;
}

function getTmdbFallback(item: any, imageType: IMAGE_TYPE) {
    if (imageType === IMAGE_TYPE.POSTER) {
        return item?.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : '';
    } else if (imageType === IMAGE_TYPE.BACKDROP || imageType === IMAGE_TYPE.WIDE_CARD) {
        return item?.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : '';
    } else if (imageType === IMAGE_TYPE.LOGO) {
        return ''; // No direct TMDB logo fallback
    }
    return '';
}

// Track CDN failures to detect if CDN is down
export const reportCdnFailure = () => {
    cdnFailureCount++;
    
    // If we have multiple failures, assume CDN is down
    if (cdnFailureCount >= 5) {
        cdnIsDown = true;
        lastCdnCheck = Date.now();
    }
}

// Reset CDN status for recovery
export const resetCdnStatus = () => {
    cdnFailureCount = 0;
    cdnIsDown = false;
}
