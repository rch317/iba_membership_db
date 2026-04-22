const { MongoClient } = require("mongodb");

async function check() {
  const client = new MongoClient("mongodb://localhost:27017/membership");
  await client.connect();
  const db = client.db("membership");
  const col = db.collection("iba_members");

  // Check what statuses exist
  const statuses = await col.distinct("currentStatus");
  console.log("Distinct currentStatus values:", statuses);

  // Count by status
  for (const status of statuses) {
    const count = await col.countDocuments({ currentStatus: status, membership_list: true });
    console.log(`  ${status} + membership_list: ${count}`);
  }

  // Check if there are members with no status field
  const noStatus = await col.countDocuments({ currentStatus: { $exists: false }, membership_list: true });
  console.log(`  (no status field) + membership_list: ${noStatus}`);

  // Show a sample of the first 5 active members
  console.log("\nFirst 5 active members with membership_list:");
  const sample = await col.find({ currentStatus: "active", membership_list: true }).limit(5).toArray();
  sample.forEach(m => {
    console.log(`  ${m.firstName} ${m.lastName}: status=${m.currentStatus}, renewal=${m.renewalDate}`);
  });

  // Show a sample of members WITHOUT active status but WITH membership_list
  console.log("\nSample of non-active members with membership_list:");
  const nonActive = await col.find({ currentStatus: { $ne: "active" }, membership_list: true }).limit(5).toArray();
  nonActive.forEach(m => {
    console.log(`  ${m.firstName} ${m.lastName}: status=${m.currentStatus}, renewal=${m.renewalDate}`);
  });

  await client.close();
}

check().catch(console.error);
