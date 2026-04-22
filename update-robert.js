const { MongoClient } = require("mongodb");

async function update() {
  const client = new MongoClient("mongodb://localhost:27017/membership");
  await client.connect();
  const db = client.db("membership");
  const col = db.collection("iba_members");

  const result = await col.updateOne(
    { firstName: "ROBERT", lastName: "HOUGH" },
    {
      $set: {
        renewalDate: new Date("2027-06-01"),
        currentStatus: "active",
        updatedAt: new Date()
      }
    }
  );

  console.log("Matched:", result.matchedCount);
  console.log("Modified:", result.modifiedCount);

  // Verify the update
  const member = await col.findOne({ firstName: "ROBERT", lastName: "HOUGH" });
  if (member) {
    console.log(`Updated: ${member.firstName} ${member.lastName}`);
    console.log(`  Renewal date: ${member.renewalDate}`);
    console.log(`  Status: ${member.currentStatus}`);
  }

  await client.close();
}

update().catch(console.error);
