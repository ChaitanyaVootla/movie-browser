import chromadb
from pymongo import MongoClient
import tiktoken
import os
import time
import numpy as np
from dotenv import load_dotenv

load_dotenv()

VOTE_COUNT_THREASHOLD = 50
CHUNK_SIZE = 2000
totalTokens = 0

# MongoDB setup
client = MongoClient(port=27017, host=os.getenv('MONGO_IP'), username='root', password=os.getenv('MONGO_PASS'))
db = client['test']
mongo_collection = db['movies']

# ChromaDB setup
# path = os.path.join(os.path.dirname(__file__), f'./db')
# chroma_client = chromadb.PersistentClient(path=path)
# chroma_collection = chroma_client.get_or_create_collection(name="movies", metadata={"hnsw:space": "cosine"})

# Embedding model
encoding = tiktoken.get_encoding("cl100k_base")

def encode_in_chunks(text):
    global totalTokens
    totalTokens = totalTokens + len(encoding.encode(text))

# Function to process and upload a chunk of movies
def process_chunk(chunk):
    for movie in chunk:
        # Extract release year and convert to release decade
        if movie.get('release_date', '') and len(movie.get('release_date', '')) >= 4 and movie.get('release_date', '')[:4].isdigit():
            release_decade = int(movie.get('release_date', '')[:3])
        else:
            # Handle invalid or missing release date
            release_decade = 0  # or some other default value

        # # extract certification
        # certification = 'unknown'
        # for release in movie.get('releaseDates', []):
        #     if release.get('iso_3166_1') == 'US':
        #         for usRelease in release.get('releaseDates', []):
        #             certification = usRelease.get('certification')
        #             break

        # extract director
        director = 'unknown'
        if movie.get('credits') is not None:
            for crew in movie.get('credits', {}).get('crew', []):
                if crew.get('job') == 'Director':
                    director = crew.get('name')
                    break

        # extract music composer
        music_composer = 'unknown'
        if movie.get('credits') is not None:
            for crew in movie.get('credits', {}).get('crew', []):
                if crew.get('job') == 'Original Music Composer':
                    music_composer = crew.get('name')
                    break

        text_strings_to_encode = [
            f"Movie Name: {movie.get('title', '')}",
            f"Released in Year {movie.get('release_date', 'unknown')[:4]}",
            f"Movie Genres: {', '.join([genre.get('name', '') for genre in movie.get('genres', [])])}",
            f"Plot Overview: {movie.get('overview', 'unknown')}",
            f"Rated: {str(movie.get('vote_average', 'unknown')) + ' out of 10'}",
            f"Movie keywords{', '.join([keyword.get('name', '') for keyword in movie.get('keywords', {}).get('keywords', [])])}",
            f"Movie Tagline: {movie.get('tagline', 'unknown')}",
            f"Starring: {', '.join([(cast.get('name', '') + ' as ' + cast.get('character', '')) for cast in movie.get('credits', {}).get('cast', [])[:5] if cast.get('name') is not None and cast.get('character') is not None])}",
            f"Director: {director}",
            f"Music Composer: {music_composer}",
            # f"Certification: {certification}",
            f"Original Language: {movie.get('original_language', 'unknown')}",
            f"Production Companies: {', '.join([company.get('name', '') for company in movie.get('production_companies', [])])}",
        ]
        if movie.get('budget') is not None:
            text_strings_to_encode.append(f"Budget: {str(round(movie.get('budget', '')/1000000, 2)) + ' million dollars'}")
        if movie.get('revenue') is not None:
            text_strings_to_encode.append(f"Revenue: {str(round(movie.get('revenue', '')/1000000, 2)) + ' million dollars'}")

        if (movie.get('belongs_to_collection') is not None) and (movie.get('belongs_to_collection').get('name') is not None):
            text_strings_to_encode.append(f"Collection: {movie.get('belongs_to_collection').get('name')}")

        text_to_encode = ', '.join(text_strings_to_encode)

        encode_in_chunks(text_to_encode)

def fetchMoviesChunk(skip):
    movies = []
    for movie in mongo_collection.find({
        'vote_count': {'$gt': VOTE_COUNT_THREASHOLD}
    }, {
        'title': 1,
        'overview': 1,
        'genres': 1,
        'keywords.keywords': 1,
        'belongs_to_collection': 1,
        'production_companies': 1,
        'tagline': 1,
        'id': 1,
        'credits.cast': 1,
        'credits.crew': 1,
        'revenue': 1,
        'vote_count': 1,
        'vote_average': 1,
        'budget': 1,
        'release_date': 1,
        'original_language': 1,
    }).skip(skip).limit(CHUNK_SIZE):
        movies.append(movie)
    # movies = [movie for movie in movies if movie['vote_count'] >= VOTE_COUNT_THREASHOLD]
    return movies

def indexDB():
    allMoviesCount = mongo_collection.count_documents({'vote_count': {'$gt': VOTE_COUNT_THREASHOLD}})
    print(f"Total movies to process: {allMoviesCount}")
    start_time = time.time()

    chunks = (allMoviesCount // CHUNK_SIZE) + 1

    for i in range(chunks):
        print(f"Processing chunk {i+1} of {chunks}")
        offset = i * CHUNK_SIZE

        print("Fetching movies from MongoDB...")
        movies = fetchMoviesChunk(offset)
        
        print("Movies in chunk: " + str(len(movies)))
        print("Processing chunk...")
        process_chunk(movies)
        print("Tokens so far: " + str(totalTokens))

        elapsed_time = time.time() - start_time
        avg_time_per_chunk = elapsed_time / (i + 1)
        remaining_chunks = chunks - (i + 1)
        eta = avg_time_per_chunk * remaining_chunks
        print(f"Estimated time remaining: {int(eta // 60)} minutes, {int(eta % 60)} seconds")

indexDB()
