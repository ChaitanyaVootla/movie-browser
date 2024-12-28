const keywords = require('../data/movieKeywords.js');

const themeSettings = require('../data/themeSettings.js');

const themes = themeSettings.map(theme => {
    return {
        name: theme.name,
        keywords: keywords.filter(k => {
            // Handle both array and string cases for `match`
            let isMatch = Array.isArray(theme.match)
                ? theme.match.some(match => k.name.includes(match))
                : k.name.includes(theme.match);

            // Create regex for precise matching of `negative`
            let negativeRegex = theme.negative
                ? new RegExp(`\\b${theme.negative}\\b`, 'i')
                : null;

            if (negativeRegex) {
                isMatch = isMatch && !negativeRegex.test(k.name);
            }

            return isMatch;
        })
    };
});

// warn all themese with no keywords or only one keyword
themes.forEach(theme => {
    if (theme.keywords.length === 0) {
        console.warn(`Theme "${theme.name}" has no keywords`);
    } else if (theme.keywords.length === 1) {
        console.warn(`Theme "${theme.name}" has only one keyword`);
    }
});

// write the themes to a file
const fs = require('fs');
fs.writeFileSync('data/themes.json', JSON.stringify(themes, null, 2));
