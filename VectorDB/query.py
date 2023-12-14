import chromadb
from chromadb.utils import embedding_functions
from pymongo import MongoClient
import os

# MODEL_NAME = "all-MiniLM-L6-v2"
MODEL_NAME = "all-mpnet-base-v2"
flatModelName = MODEL_NAME.replace('-', '')

# MongoDB setup
client = MongoClient(port=27017, host='localhost', username='root', password='rootpassword')
db = client['test']
mongo_collection = db['movies']

# ChromaDB setup
path = os.path.join(os.path.dirname(__file__), f'./{flatModelName}')
chroma_client = chromadb.PersistentClient(path=path)
chroma_collection = chroma_client.get_or_create_collection(name="movies",
    embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(model_name=MODEL_NAME, device="cuda"),
    metadata={"hnsw:space": "cosine"})

# get total docs from chromaDB
# print(f"Total docs in ChromaDB: {chroma_collection.count()}")

# similarityDoc = chroma_collection.get(
#     ids=['760741'],
#     include=['embeddings', 'documents', 'metadatas'],
# )
# print(similarityDoc['documents'])
# print(similarityDoc['metadatas'])

result = chroma_collection.query(
    n_results=15,
    # query_embeddings=similarityDoc['embeddings'],
    query_texts=['avengers'],
    where={
        "$and": [
            {
                'vote_count': {'$gte': 10}
            },
            {
                'original_language': 'en',
            }
        ]
    }
)
ids = [int(id) for id in result['ids'][0]]
distances = result['distances'][0]

# fetch the documents from MongoDB
mongo_results = mongo_collection.find({'id': {'$in': ids}})
mongo_results = {doc['id']: doc for doc in mongo_results}

# print the titles sorted by distance
for id, distance in zip(ids, distances):
    print(f"{distance:.2f} - {mongo_results[id]['title']}")
