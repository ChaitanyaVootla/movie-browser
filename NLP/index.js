const nlp = require('compromise')

nlp.extend({
    tags: {
        Genre: {
            isA: 'Noun'
        },
        Negation: {
            isA: 'Verb'
        },
        PersonName: {
            isA: 'Noun'
        },
    },
    words: {
        comedy: 'Genre',
        animated: 'Genre',
        // Add other genres...
        arnold: 'PersonName', // Again, for simplicity
    },
    compute: {
        postProcess: (doc) => {
            // from docs
            // doc.match('light the lights').tag('#Verb . #Plural')
            // mine
            doc.match('not [#Genre]').tag('#Negation')
        }
    },
});

const input = "comedy movies with Arnold that are not animated";
let doc = nlp(input);

// Extract the genre
let genre = doc.match('#Genre').out('normal');

// Extract the actor name
let actor = doc.match('#PersonName').out('normal');

// Check for negated genres
let negatedGenres = doc.match('#Negation').out('array');

console.log(`Genre: ${genre}`);
console.log(`Actor: ${actor}`);
console.log(`Negated genres: ${negatedGenres}`);
