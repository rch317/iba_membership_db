const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config({ path: process.env.ENV_FILE || ".env/dev/app.env" });

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/membership";
const dbName = process.env.MONGO_DB_NAME || "membership";

async function createIndexes(db) {
  await db.collection("iba_members").createIndexes([
    { key: { emailAddress: 1 }, name: "uniq_email_sparse", unique: true, sparse: true },
    { key: { lastName: 1, firstName: 1 }, name: "name_lookup" },
    { key: { currentStatus: 1, lastName: 1 }, name: "status_lastName" },
    { key: { satelliteHome: 1 }, name: "satellite_home" }
  ]);

  await db.collection("iba_membership_events").createIndexes([
    { key: { member: 1, effectiveDate: -1 }, name: "member_effectiveDate_desc" },
    { key: { newStatus: 1, effectiveDate: -1 }, name: "newStatus_effectiveDate_desc" },
    { key: { eventType: 1, effectiveDate: -1 }, name: "eventType_effectiveDate_desc" }
  ]);

  await db.collection("iba_satellite_groups").createIndexes([
    { key: { satelliteID: 1 }, name: "uniq_satelliteID", unique: true },
    { key: { groupName: 1 }, name: "groupName_lookup" }
  ]);

  await db.collection("iba_notes").createIndexes([
    { key: { member: 1, createdAt: -1 }, name: "member_createdAt_desc" }
  ]);

  await db.collection("iba_users").createIndexes([
    { key: { email: 1 }, name: "uniq_email", unique: true },
    { key: { googleId: 1 }, name: "uniq_googleId_sparse", unique: true, sparse: true },
    { key: { apiKey: 1 }, name: "uniq_apiKey_sparse", unique: true, sparse: true }
  ]);

  // Session TTL index used by connect-mongo style documents.
  await db.collection("iba_sessions").createIndexes([
    { key: { expires: 1 }, name: "session_expires_ttl", expireAfterSeconds: 0 }
  ]);
}

async function main() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    await createIndexes(db);
    console.log(`[indexes] created/verified on db=${dbName}`);
  } catch (error) {
    console.error("[indexes] failed", error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
