from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib3
from pymongo import MongoClient
import os
import time
from pyquery import PyQuery as pq
import tiktoken
from dotenv import load_dotenv
import threading

load_dotenv()

VOTE_COUNT_THRESHOLD = 150
CHUNK_SIZE = 200
totalTokens = 0
processedMovies = 0 # Track processed movies for ETA calculation

# MongoDB setup
client = MongoClient(port=27017, host=os.getenv('MONGO_IP'), username='root', password=os.getenv('MONGO_PASS'))
db = client['test']
mongo_collection = db['movies']

http = urllib3.PoolManager(
    cert_reqs="CERT_REQUIRED",
    ca_certs="/opt/homebrew/etc/openssl@3/cert.pem"
)

allMovies = list(mongo_collection.find({
    # 'vote_count': {'$gt': VOTE_COUNT_THRESHOLD},
    'imdb_id': {'$exists': True},
    'storyline': {'$exists': True}
}, {
    'imdb_id': 1,
    'id': 1,
    'title': 1,
}))

print(f"Total movies: {len(allMovies)}")

# Lock for safely updating shared variables from multiple threads
# lock = threading.Lock()

# def process_movies(movies):
#     local_total_tokens = 0
#     for movie in movies:
#         with lock:
#             global processedMovies
#             processedMovies += 1
#         print(f"Processing movie: {movie['title']} (Processed: {processedMovies}/{len(allMovies)})")
#         url = f"https://www.imdb.com/title/{movie['imdb_id']}/plotsummary"
#         html = http.request(url=url, headers={'User-Agent': 'Mozilla/5.0'}, method="GET")
#         d = pq(html.data)
#         storyline = d('[data-testid=sub-section-synopsis] .ipc-html-content-inner-div').text()
#         tokens = len(tiktoken.get_encoding("cl100k_base").encode(storyline))
#         local_total_tokens += tokens
#         # Update the movie with the storyline
#         mongo_collection.update_one({'id': movie['id']}, {'$set': {'storyline': storyline}})
#     return local_total_tokens

# def chunkify(lst, n):
#     for i in range(0, len(lst), n):
#         yield lst[i:i + n]

# movie_chunks = list(chunkify(allMovies, CHUNK_SIZE))
# start_time = time.time()

# def calculate_eta(start, processed, total, chunk_size):
#     elapsed = time.time() - start
#     average_time_per_movie = elapsed / processed
#     remaining_movies = total - processed
#     eta = average_time_per_movie * remaining_movies
#     return eta

# with ThreadPoolExecutor(max_workers=5) as executor:
#     futures = [executor.submit(process_movies, chunk) for chunk in movie_chunks]
#     for future in as_completed(futures):
#         with lock:
#             totalTokens += future.result()
#             # Calculate and print ETA
#             eta = calculate_eta(start_time, processedMovies, len(allMovies), CHUNK_SIZE)
#             print(f"ETA: {int(eta // 60)} minutes, {int(eta % 60)} seconds")

# elapsed_time = time.time() - start_time
# print(f"Total tokens: {totalTokens}")
# print(f"Total movies: {len(allMovies)}")
# print(f"Average tokens per movie: {totalTokens / len(allMovies)}")
# print(f"Total time: {elapsed_time} seconds")
