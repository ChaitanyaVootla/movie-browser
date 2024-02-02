from pymongo import MongoClient
import json

# MongoDB setup
client = MongoClient(port=27017, host='localhost', username='root', password='rootpassword')
db = client['test']
mongo_collection = db['movies']

def fetchAllMoviesFromDb():
    movies = []
    print("Fetching movies from MongoDB...")
    for movie in mongo_collection.find({}, {
        'title': 1,
        'overview': 1,
        'genres': 1,
        'keywords.keywords': 1,
        'id': 1,
        'credits.cast': 1,
        'credits.crew': 1,
        'revenue': 1,
        'vote_count': 1,
        'vote_average': 1,
        'budget': 1,
        'release_date': 1,
        'original_language': 1,
    }):
        movie_dict = {
            'id': str(movie.get('id')),
            'title': movie.get('title', ''),
            'overview': movie.get('overview', ''),
            'genres': [genre.get('name', '') for genre in movie.get('genres', [])],
            'keywords': [keyword.get('name', '') for keyword in movie.get('keywords', {}).get('keywords', [])],
            'cast': [(cast.get('name', ''), cast.get('character', '')) for cast in movie.get('credits', {}).get('cast', [])[0:5]],
            'crew': [(crew.get('name', ''), crew.get('job', '')) for crew in movie.get('credits', {}).get('crew', [])[0:3]],
            'revenue': int(movie.get('revenue', 0)),
            'vote_count': int(movie.get('vote_count', 0)),
            'vote_average': int(movie.get('vote_average', 0)),
            'budget': int(movie.get('budget', 0)),
            'release_date': movie.get('release_date', ''),
            'release_decade': int(movie.get('release_date', '')[:3]) if movie.get('release_date', '') and len(movie.get('release_date', '')) >= 4 and movie.get('release_date', '')[:4].isdigit() else 0,
            'original_language': movie.get('original_language', ''),
        }
        if movie_dict['vote_count'] >= 10:  # filter movies with 10 votes
            movies.append(movie_dict)
    return movies

def writeMoviesAsJsonToTxtFile():
    movies = fetchAllMoviesFromDb()
    print(f"Total movies: {len(movies)}")
    try:
        with open('movies.txt', 'w', encoding='utf-8') as f:
            for movie in movies:
                # Write each movie as a JSON object on a new line
                json_string = json.dumps(movie, ensure_ascii=False)
                f.write(json_string + '\n')
    except Exception as e:
        print(f"Error when writing to file: {e}")

if __name__ == '__main__':
    writeMoviesAsJsonToTxtFile()
