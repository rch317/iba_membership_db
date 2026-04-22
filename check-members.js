const { MongoClient } = require("mongodb");

async function check() {
  const client = new MongoClient("mongodb://localhost:27017/membership");
  await client.connect();
  const db = client.db("membership");
  const col = db.collection("iba_members");

  const total = await col.countDocuments({});
  const active = await col.countDocuments({ currentStatus: "active" });
  const memlist = await col.countDocuments({ membership_list: true });
  const activeMemlist = await col.countDocuments({ currentStatus: "active", membership_list: true });
  
  console.log("Total members:", total);
  console.log("Active members:", active);
  console.log("Members with membership_list:", memlist);
  console.log("Active + membership_list:", activeMemlist);

  // Sample a few renewal dates to check
  const samples = await col.find({ membership_list: true, currentStatus: "active" }).limit(3).toArray();
  console.log("\nSample active members with membership_list:");
  samples.forEach(m => {
    console.log(`  ${m.firstName} ${m.lastName}: renewal=${m.renewalDate}, status=${m.currentStatus}`);
  });

  await client.close();
}

check().catch(console.error);
