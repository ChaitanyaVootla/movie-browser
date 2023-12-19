var fs = require('fs');
const { MongoClient } = require('mongodb');
const path = require('path');

var data = fs.readFileSync(path.join(__dirname, 'input.json'), 'utf8');

var record = JSON.parse(data);

MongoClient.connect('mongodb://root:rootpassword@localhost:27017', function(err, client) {
    if (err) throw err;
    
    console.log("connected to the mongoDB !")
    console.log("inserting data into the collection ! for user id : " + record.userId);

    const db = client.db('test');

    let collection = db.collection('watchedmovies');
    record.watchedMovieIds.forEach((movieId) => {
        collection.insertOne({ "userId": record.userId, "movieId": movieId }).catch((err) => {});
    });

    collection = db.collection('serieslists');
    record.seriesListIds.forEach((movieId) => {
        collection.insertOne({ "userId": record.userId, "seriesId": movieId }).catch((err) => {});
    });

    collection = db.collection('movieswatchlists');
    record.watchListMovieIds.forEach((movieId) => {
        collection.insertOne({ "userId": record.userId, "movieId": movieId }).catch((err) => {});
    });
});

console.log('Data inserted successfully');
