const keywords = require('../data/movieKeywords.js');

const themeSettings = require('../data/themeSettings.js');

const themes = themeSettings.map(theme => {
    return {
        name: theme.name,
        keywords: keywords.filter(k => {
            let isMatch = k.name.includes(theme.match)
            if (theme.negative) {
                isMatch = !k.name.includes(theme.negative);
            } 
            return isMatch;
        })
    }
})

// write the themes to a file
const fs = require('fs');
fs.writeFileSync('data/themes.json', JSON.stringify(themes, null, 2));
