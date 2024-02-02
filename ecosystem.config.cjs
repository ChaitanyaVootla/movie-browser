module.exports = {
  apps: [
    {
        name: "nuxt",
        script: "export $(cat .env | xargs) && node .output/server/index.mjs",
    },
    {
        name: "vector",
        script: "cd VectorDB && source vector/bin/activate && python3 openai/server.py",
        max_memory_restart: "450M",
    },
  ],
};
