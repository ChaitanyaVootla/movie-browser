module.exports = {
  apps: [
    {
        name: "nuxt",
        script: "cd VectorDB && export $(cat .env | xargs) && node .output/server/index.mjs",
    },
    {
        name: "vector",
        script: "source vector/bin/activate && python3 openai/server.py",
        max_memory_restart: "450m",
    },
  ],
};
