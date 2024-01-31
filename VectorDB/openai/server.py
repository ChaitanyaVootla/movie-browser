from flask import Flask, request, jsonify
import chromadb
import openai
from pymongo import MongoClient
from flask_cors import CORS
import os
import json
import numpy as np
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

MODEL_NAME = "text-embedding-3-small"

# MongoDB setup
client = MongoClient(port=27017, host=os.getenv('MONGO_IP'), username='root', password=os.getenv('MONGO_PASS'))
db = client['test']
mongo_collection = db['movies']

# ChromaDB setup
path = os.path.join(os.path.dirname(__file__), f'./db')
chroma_client = chromadb.PersistentClient(path=path)
chroma_collection = chroma_client.get_or_create_collection(name="movies",
    metadata={"hnsw:space": "cosine"})

def getEmbeddingById(movie_id):
    return chroma_collection.get(
        ids=[str(movie_id)],
        include=['embeddings'],
    )['embeddings'][0]

def averageByIds(movie_ids):
    # fetch the embeddings from chromaDB
    similarity_docs = chroma_collection.get(
        ids=[str(id) for id in movie_ids],
        include=['embeddings'],
    )
    # average the embeddings
    embeddings = similarity_docs['embeddings']
    return np.mean(embeddings, axis=0).tolist()


def perform_query(embedding, excludeIds, ratingCutoff, n_results):
    return chroma_collection.query(
        n_results=n_results,
        where={
            "$and": [
                {
                    'id': {
                        '$nin': [str(id) for id in excludeIds]
                    }
                },
                {
                    'vote_average': {
                        '$gte': ratingCutoff
                    }
                }
            ]
        },
        query_embeddings=embedding,
    )

@app.route('/recommend', methods=['POST'])
def recommend():
    body = request.json
    similarityMovieId = body.get('similarityMovieId')
    queryString = body.get('query')
    watchedQuery = body.get('watched')
    hideWatched = bool(body.get('hideWatched'))
    ratingCutoff = int(body.get('ratingCutoff', 0))

    watchedMovieIds = json.load(open('watched.json', 'r'))
    allEmbeddings = []

    if queryString:
        allEmbeddings.append(openai.embeddings.create(input=queryString, model=MODEL_NAME).data[0].embedding
                             .toArray())

    if watchedQuery is not None and len(watchedMovieIds) > 0:
        watchedEmbedding = averageByIds(watchedMovieIds)
        if watchedQuery == 'similar':
            allEmbeddings.append(watchedEmbedding)
        elif watchedQuery == 'contrast':
            allEmbeddings.append(np.negative(watchedEmbedding))

    if similarityMovieId and (mongo_collection.find_one({'id': int(similarityMovieId)}) is not None):
        # allEmbeddings.append(getEmbeddingById(similarityMovieId))
        allEmbeddings.append(averageByIds([similarityMovieId]))

    if not allEmbeddings:
        return jsonify([])

    if len(allEmbeddings) > 1:
        print(f"avegaring {len(allEmbeddings)} embeddings")
        average_embedding = np.mean(allEmbeddings, axis=0)
    else:
        average_embedding = allEmbeddings[0]

    results = perform_query(average_embedding, hideWatched and watchedMovieIds or [0], ratingCutoff, 30)

    ids = [int(id) for id in results['ids'][0]]
    distances = results['distances'][0]

    mongo_results = mongo_collection.find({'id': {'$in': ids}})
    return jsonify(getMovieArray(mongo_results, ids, distances, watchedMovieIds))


def getMovieArray(dbMovies, ids, distances, watchedMovieIds):
    movies = []
    for movie in dbMovies:
        movies.append({
            'id': movie['id'],
            'title': movie['title'],
            'overview': movie['overview'],
            'poster_path': movie['poster_path'],
            'vote_average': movie['vote_average'],
            'vote_count': movie['vote_count'],
            'release_date': movie['release_date'],
        })

    # sort by ids
    movies = sorted(movies, key=lambda movie: ids.index(movie['id']))

    # add distance with 2 decimal points
    for i, movie in enumerate(movies):
        movie['distance'] = round(distances[i], 2)
        movie['watched'] = movie['id'] in watchedMovieIds
    return movies

if __name__ == '__main__':
    app.run()
