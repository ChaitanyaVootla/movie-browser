import mongoose from 'mongoose';
import { Movie } from './models/movie';
import 'dotenv/config'

async function migrateChunk(skip: number = 0, limit: number = 10000) {
  try {
    // Connect to the source database
    await mongoose.connect(`mongodb://root:${process.env.MONGO_PASS}@localhost:27017`);
    console.log('Connected to source database.');

    // Fetch data from the source collection
    const sourceMovies = await Movie.find({}).select('-_id').skip(skip).limit(limit).exec();
    console.log(sourceMovies.length, 'items found.');
    const sourceMovieIds = new Set(sourceMovies.map((item) => item.id));
    await mongoose.disconnect();

    await mongoose.connect(`mongodb://root:${process.env.MONGO_PASS}@${process.env.MONGO_IP}:27017`);
    console.log('Connected to target database.');

    // Find data with the same ids in the target collection
    const existingData = await Movie.find({ id: { $in: Array.from(sourceMovieIds) } }).select('-_id id').exec();
    const existingMovieIds = new Set(existingData.map((item) => item.id));

    console.log(existingData.length, 'existing items found.');
    
    const moviesToInsert = sourceMovies.filter((item) => !existingMovieIds.has(item.id));
    console.log(moviesToInsert.length, 'items to insert.');

    const mappedMoviesToInsert = moviesToInsert.map((item) => {
      return {
        ...item.toJSON(),
        // set updatedAt to 2 months ago
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60 * 2).getTime(),
      }
    });

    console.log('Inserting...');
    await Movie.insertMany(mappedMoviesToInsert);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

async function migrate() {
  await mongoose.connect(`mongodb://root:${process.env.MONGO_PASS}@localhost:27017`);
  console.log('Connected to source database.');
  const total = await Movie.countDocuments({}).exec();
  console.log(total, 'items found.');
  await mongoose.disconnect();

  const limit = 1000;
  const chunks = Math.ceil(total / limit);
  console.log('Total chunks:', chunks);

  for (let i = 0; i <= chunks; i++) {
    console.log('Processing chunk:', i);
    await migrateChunk(i * limit, limit);
  }

  console.log('Data migration complete.');
}

migrate();
