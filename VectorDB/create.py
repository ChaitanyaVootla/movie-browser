import chromadb
import openai
from pymongo import MongoClient
import os
import time
import numpy as np
import tiktoken
import json
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = "text-embedding-3-small"
flatModelName = MODEL_NAME.replace('-', '')
VOTE_COUNT_THREASHOLD = 150
CHUNK_SIZE=200
TOKEN_LIMIT = 8180
TOKEN_TRACK = 0

lang = {}

with open('lang.json', 'r') as file:
    lang = json.load(file)

# MongoDB setup
client = MongoClient(port=27017, host=os.getenv('MONGO_IP'), username='root', password=os.getenv('MONGO_PASS'))
db = client['test']
mongo_collection = db['movies']

# ChromaDB setup
path = os.path.join(os.path.dirname(__file__), f'./db')
chroma_client = chromadb.PersistentClient(path=path)
chroma_collection = chroma_client.get_or_create_collection(name="movies", metadata={"hnsw:space": "cosine"})

def encode_text(texts):
    res = openai.embeddings.create(input=texts, model=MODEL_NAME)
    return [item.embedding for item in res.data]

def process_chunk(chunk):
    chroma_compatible_docs = []
    global TOKEN_TRACK
    for movie in chunk:
        # # Extract release year and convert to release decade
        # if movie.get('release_date', '') and len(movie.get('release_date', '')) >= 4 and movie.get('release_date', '')[:4].isdigit():
        #     release_decade = int(movie.get('release_date', '')[:3])
        # else:
        #     # Handle invalid or missing release date
        #     release_decade = 0  # or some other default value

        # # extract certification
        # certification = 'unknown'
        # for release in movie.get('releaseDates', []):
        #     if release.get('iso_3166_1') == 'US':
        #         for usRelease in release.get('releaseDates', []):
        #             certification = usRelease.get('certification')
        #             break

        # extract director
        # director = 'unknown'
        # if movie.get('credits') is not None:
        #     for crew in movie.get('credits', {}).get('crew', []):
        #         if crew.get('job') == 'Director':
        #             director = crew.get('name')
        #             break

        # # extract music composer
        # music_composer = 'unknown'
        # if movie.get('credits') is not None:
        #     for crew in movie.get('credits', {}).get('crew', []):
        #         if crew.get('job') == 'Original Music Composer':
        #             music_composer = crew.get('name')
        #             break

        # plot_tokens = tiktoken.get_encoding("cl100k_base").encode(movie.get('storyline') or movie.get('overview', 'unknown'))
        # TOKEN_TRACK += len(plot_tokens)
        # if (len(plot_tokens) > TOKEN_LIMIT):
        #     print(f"Truncating plot for movie {movie.get('title', '')} to {TOKEN_LIMIT} tokens, full size: {len(plot_tokens)} tokens.")
        #     plot_tokens = plot_tokens[:TOKEN_LIMIT]
        # plot = tiktoken.get_encoding("cl100k_base").decode(plot_tokens)
        text_strings_to_encode = [
            # f"Movie Name: {movie.get('title', '')}",
            # f"Released in Year {movie.get('release_date', 'unknown')[:4]}",
            # f"Movie overview: {plot}",
            f"Movie overview: {movie.get('overview', 'unknown')}",
            f"Movie Genres: {', '.join([genre.get('name', '') for genre in movie.get('genres', [])])}",
            # f"Rated: {str(movie.get('vote_average', 'unknown')) + ' out of 10'}",
            f"Movie keywords: {', '.join([keyword.get('name', '') for keyword in movie.get('keywords', {}).get('keywords', [])])}",
            # f"Movie Tagline: {movie.get('tagline', 'unknown')}",
            f"Starring: {', '.join([(cast.get('name', '') + ' as ' + cast.get('character', '')) for cast in movie.get('credits', {}).get('cast', [])[:5] if cast.get('name') is not None and cast.get('character') is not None])}",
            # f"Director: {director}",
            # f"Music Composer: {music_composer}",
            # f"Certification: {certification}",
            f"Movie Language: {movie.get('original_language', 'unknown')}",
            # f"Production Companies: {', '.join([company.get('name', '') for company in movie.get('production_companies', [])])}",
        ]
        # if movie.get('budget') is not None:
        #     text_strings_to_encode.append(f"Budget: {str(round(movie.get('budget', '')/1000000, 2)) + ' million dollars'}")
        # if movie.get('revenue') is not None:
        #     text_strings_to_encode.append(f"Revenue: {str(round(movie.get('revenue', '')/1000000, 2)) + ' million dollars'}")

        # if (movie.get('belongs_to_collection') is not None) and (movie.get('belongs_to_collection').get('name') is not None):
        #     text_strings_to_encode.append(f"Collection: {movie.get('belongs_to_collection').get('name')}")

        text_to_encode = ', '.join(text_strings_to_encode)

        chroma_compatible_docs.append({
            'id': str(movie.get('id')),
            # 'embedding': encode_text(text_to_encode),
            'document': text_to_encode,
            'text_strings_to_encode': text_strings_to_encode,
            'text_strings_len': len(text_strings_to_encode),
            'metadata': {
                # 'release_decade': release_decade,
                'revenue': int(movie.get('revenue', 0)),
                'budget': int(movie.get('budget', 0)),
                'vote_count': int(movie.get('vote_count', 0)),
                'vote_average': int(movie.get('vote_average', 0)),
                'original_language': lang[movie.get('original_language', '')],
                'title': movie.get('title', ''),
                'id': str(movie.get('id', '')),
            },
        })
    texts_to_embed = [doc['text_strings_to_encode'] for doc in chroma_compatible_docs]
    texts_to_embed = [item for sublist in texts_to_embed for item in sublist]
    embeddings = encode_text(texts_to_embed)
    length_track = 0
    for i, doc in enumerate(chroma_compatible_docs):
        doc['embedding'] = np.mean(embeddings[length_track:length_track+doc['text_strings_len']], axis=0).tolist()
        length_track += doc['text_strings_len']
    return chroma_compatible_docs

def fetchMoviesChunk(skip):
    movies = []
    for movie in mongo_collection.find({
        'vote_count': {'$gt': VOTE_COUNT_THREASHOLD},
        # 'storyline': {'$exists': True}
    }, {
        'title': 1,
        'overview': 1,
        # 'storyline': 1,
        'genres': 1,
        'keywords.keywords': 1,
        # 'belongs_to_collection': 1,
        # 'production_companies': 1,
        # 'tagline': 1,
        'id': 1,
        'credits.cast': 1,
        # 'credits.crew': 1,
        # 'revenue': 1,
        'vote_count': 1,
        'vote_average': 1,
        'budget': 1,
        'release_date': 1,
        'original_language': 1,
    }).skip(skip).limit(CHUNK_SIZE):
        movies.append(movie)
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
        chroma_docs = process_chunk(movies)

        if len(chroma_docs) == 0:
            print("No movies to process in this chunk. Skipping...")
            continue
        print("Upserting to ChromaDB...")
        # Upsert into ChromaDB
        chroma_collection.upsert(
            ids=[doc['id'] for doc in chroma_docs],
            embeddings=[doc['embedding'] for doc in chroma_docs],
            documents=[doc['document'] for doc in chroma_docs],
            metadatas=[doc['metadata'] for doc in chroma_docs],
        )
        elapsed_time = time.time() - start_time
        avg_time_per_chunk = elapsed_time / (i + 1)
        remaining_chunks = chunks - (i + 1)
        eta = avg_time_per_chunk * remaining_chunks
        print(f"Estimated time remaining: {int(eta // 60)} minutes, {int(eta % 60)} seconds")
        # print(f"Token track: {TOKEN_TRACK}")

indexDB()
