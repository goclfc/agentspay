FROM node:20-alpine
WORKDIR /app
RUN echo 'const http = require("http"); const s = http.createServer((req, res) => { res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({status:"ok",service:"agentspay-api",timestamp:new Date().toISOString()})); }); s.listen(80, "0.0.0.0", () => console.log("Listening on 80"));' > server.js
EXPOSE 80
CMD ["node", "server.js"]
