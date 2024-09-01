module.exports = {
  apps: [
    {
        name: "nuxt",
        script: "export $(cat .env | xargs) && node .output/server/index.mjs",
        max_memory_restart: "500M",
    },
    {
        name: "vector",
        script: "cd VectorDB && source vector/bin/activate && python3 server.py",
        max_memory_restart: "450M",
    },
    {
      name: "mongodb_container",
      script: "docker",
      args: [
        "run",
        "--name",
        "mongodb_container",
        "-p",
        "27017:27017",
        "-e",
        `MONGO_INITDB_ROOT_USERNAME=${process.env.DB_USER}`,
        "-e",
        `MONGO_INITDB_ROOT_PASSWORD=${process.env.DB_PASSWORD}`,
        "-v",
        "movie-browser_mongodb:/data/db",
        "mongo:5.0.12"
      ],
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 1000,
    },
  ],
};
