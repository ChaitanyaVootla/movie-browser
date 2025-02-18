module.exports = {
  apps: [
    {
        name: "nuxt",
        script: "export $(cat .env | xargs) && cd .output && node ./server/index.mjs",
        max_memory_restart: "500M",
    },
    {
        name: "vector",
        script: "cd VectorDB && source vector/bin/activate && python3 server.py",
        max_memory_restart: "450M",
    },
  ],
};
