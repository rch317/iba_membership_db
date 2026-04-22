const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { createApp } = require("./app");

dotenv.config({ path: process.env.ENV_FILE || ".env/dev/app.env" });

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGO_URI || "mongodb://mongo:27017/membership";
const dbName = process.env.MONGO_DB_NAME || "membership";

let mongoClient;
let isMongoReady = false;
let app;

async function connectMongo() {
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  await mongoClient.db(dbName).command({ ping: 1 });
  isMongoReady = true;
  console.log(`[mongo] connected to ${mongoUri} (db=${dbName})`);
}

async function start() {
  try {
    await connectMongo();
    app = createApp({
      db: mongoClient.db(dbName),
      dbName,
      getMongoClient: () => mongoClient,
      getMongoReady: () => isMongoReady
    });

    app.listen(port, () => {
      console.log(`[api] listening on port ${port}`);
    });
  } catch (error) {
    console.error("[api] startup failed", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

start();
