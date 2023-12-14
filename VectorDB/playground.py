import spacy
from spacy import displacy

spacy.prefer_gpu()
nlp = spacy.load('en_core_web_trf')

# Your query
query = "comedy movies with Arnold that are not animated or drama"

# Process the query with SpaCy
doc = nlp(query)

# Initialize variables
genres = []
actor = None
include_adult = False
exclude_genres = []

# Define possible genres (extend this list based on your requirements)
possible_genres = ['comedy', 'action', 'drama', 'animated']

# Flags for negation
negation = False

# Iterate over tokens
for token in doc:
    # Check for negation
    if token.dep_ == 'neg':
        negation = True
        continue

    # Check for genres
    if token.text.lower() in possible_genres:
        if negation:
            exclude_genres.append(token.text.lower())
            negation = False
        else:
            genres.append(token.text.lower())

    # Check for actor
    elif token.ent_type_ == 'PERSON':
        actor = token.text

# Mapping to TMDB API parameters
tmdb_params = {
    'with_genres': ','.join(genres),  # Convert genre list to comma-separated string
    'with_people': actor,  # You will need to convert actor names to TMDB actor IDs
    'include_adult': include_adult,
    'without_genres': ','.join(exclude_genres)
}

print(tmdb_params)
