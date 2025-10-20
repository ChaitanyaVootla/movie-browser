# MongoDB Migration Test Setup with S3 Storage

This setup automates the extraction of your MongoDB database from Digital Ocean, stores it in S3, and restores it to a fresh MongoDB 8.0 container locally to verify compatibility before AWS migration.

## Quick Start

1. **Configure credentials** (if not already done):
   ```bash
   # Edit the .env file with your credentials
   # The file is already configured with the provided values
   ```

2. **Run the migration test**:
   ```bash
   cd migration
   docker-compose up --abort-on-container-exit
   ```

3. **Verify the restore**:
   ```bash
   docker exec -it migration-mongodb-latest mongosh -u root -p newpassword123 --authenticationDatabase admin test
   ```

## What This Does

### Automated Execution Order:
1. **dump-initiator**: SSH into DO droplet and extract MongoDB dump
2. **mongodb-latest**: Start fresh MongoDB 8.0 container (runs in parallel)
3. **restore-runner**: Wait for both dump completion AND MongoDB health, then restore

### Services:

- **dump-initiator**: Alpine container with SSH, MongoDB tools, and AWS CLI
  - Connects to DO droplet (64.227.132.75)
  - Executes `mongodump` inside the MongoDB container
  - Compresses dump and uploads to S3 bucket
  - Creates S3 bucket if it doesn't exist

- **mongodb-latest**: MongoDB 8.0 container
  - Exposed on port 27018 (avoids conflicts)
  - Health checks ensure it's ready before restore
  - Persistent data volume for testing

- **restore-runner**: Alpine container with MongoDB tools and AWS CLI
  - Waits for MongoDB health (no longer depends on dump-initiator)
  - Downloads latest dump from S3 bucket
  - Extracts and executes `mongorestore` to import data
  - Runs verification queries and outputs statistics

## Independent Service Usage

Services can now be run independently for better iteration:

### Dump Only (to S3)
```bash
docker-compose up dump-initiator
```

### Start MongoDB Only
```bash
docker-compose up mongodb-latest
```

### Restore Only (requires MongoDB running + S3 dump)
```bash
docker-compose up restore-runner
```

## S3 Storage

- Dumps are automatically compressed and uploaded to S3
- Bucket name: `movie-browser-migration-2025-10-19` (configurable in .env)
- Path: `s3://bucket-name/mongodb-dumps/mongodb-dump.tar.gz`
- Single file (no timestamps) - overwrites on each dump for simplicity

## Test Mode

Currently configured to **exclude movies and series collections** for faster testing:
- This allows quick validation of the dump/restore process
- Once verified, remove `--excludeCollection` flags to include all data

## Output

The script will show:
- ✅ Dump completion status
- ☁️ S3 upload confirmation
- 📊 Collection counts
- 📋 List of collections
- 📈 Document counts per collection
- 🔗 Connection command for manual verification

## Troubleshooting

### Common Issues:

1. **SSH Connection Failed**:
   - Verify DO droplet is accessible: `ping 64.227.132.75`
   - Check credentials in `.env` file

2. **Container Not Found**:
   - Verify container name: `movie-browser_mongodb_container_1`
   - Check if MongoDB container is running on DO

3. **MongoDB Connection Failed**:
   - Check if MongoDB is running on DO droplet
   - Verify credentials in `.env` file

4. **Dump Not Found**:
   - Check if dump was created in `./dumps` directory
   - Verify database name matches in `.env`

### Manual Verification:

```bash
# Check dump contents
ls -la dumps/

# Connect to restored MongoDB
docker exec -it migration-mongodb-latest mongosh -u root -p newpassword123 --authenticationDatabase admin test

# List collections
db.getCollectionNames()

# Check document counts
db.getCollectionNames().forEach(function(name) { 
  print(name + ': ' + db.getCollection(name).countDocuments()); 
})
```

## Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes restored data)
docker-compose down -v

# Remove dump files
rm -rf dumps/*
```

## Next Steps

Once this test succeeds:
1. Use the same dump approach for AWS migration
2. Create Terraform configs for EC2/DocumentDB
3. Automate deployment pipeline
4. Set up continuous backup strategy

## Files Structure

```
migration/
├── docker-compose.yml    # Multi-container orchestration
├── .env                  # Credentials (gitignored)
├── .gitignore           # Excludes secrets and dumps
├── scripts/
│   ├── dump-mongo.sh    # SSH-based remote dump
│   └── restore-mongo.sh # Local restore and verification
├── dumps/               # Dump files (gitignored)
└── README.md            # This file
```
