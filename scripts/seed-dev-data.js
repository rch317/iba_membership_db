const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config({ path: process.env.ENV_FILE || ".env/dev/app.env" });

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/membership";
const dbName = process.env.MONGO_DB_NAME || "membership";

const seedSatellites = [
  {
    satelliteID: "SAT-001",
    groupName: "Central Forge Guild",
    city: "Indianapolis",
    state: "IN"
  },
  {
    satelliteID: "SAT-002",
    groupName: "Northern Hammer Circle",
    city: "South Bend",
    state: "IN"
  }
];

const seedMembers = [
  {
    firstName: "Avery",
    lastName: "Cole",
    emailAddress: "avery.cole@example.org",
    city: "Indianapolis",
    state: "IN",
    primaryPhone: "317-555-0101",
    satelliteHome: "SAT-001",
    currentStatus: "active",
    statusReason: "Initial seed active member"
  },
  {
    firstName: "Rowan",
    lastName: "Miller",
    emailAddress: "rowan.miller@example.org",
    city: "South Bend",
    state: "IN",
    primaryPhone: "574-555-0110",
    satelliteHome: "SAT-002",
    currentStatus: "inactive",
    statusReason: "Initial seed inactive member"
  },
  {
    firstName: "Jordan",
    lastName: "Price",
    emailAddress: "jordan.price@example.org",
    city: "Bloomington",
    state: "IN",
    primaryPhone: "812-555-0122",
    satelliteHome: "SAT-001",
    currentStatus: "active",
    statusReason: "Initial seed active member"
  }
];

async function seed() {
  const client = new MongoClient(mongoUri);
  const now = new Date();

  try {
    await client.connect();
    const db = client.db(dbName);

    const satelliteCollection = db.collection("iba_satellite_groups");
    const membersCollection = db.collection("iba_members");
    const eventsCollection = db.collection("iba_membership_events");

    for (const satellite of seedSatellites) {
      await satelliteCollection.updateOne(
        { satelliteID: satellite.satelliteID },
        {
          $set: {
            groupName: satellite.groupName,
            city: satellite.city,
            state: satellite.state,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now,
            notes: "",
            addressLine1: "",
            addressLine2: "",
            postalZip: "",
            primaryContact: null,
            secondaryContact: null,
            tertiaryContact: null
          }
        },
        { upsert: true }
      );
    }

    for (const member of seedMembers) {
      const effectiveDate = new Date("2026-01-01T00:00:00.000Z");
      const updateResult = await membersCollection.findOneAndUpdate(
        { emailAddress: member.emailAddress },
        {
          $set: {
            firstName: member.firstName,
            lastName: member.lastName,
            city: member.city,
            state: member.state,
            primaryPhone: member.primaryPhone,
            satelliteHome: member.satelliteHome,
            currentStatus: member.currentStatus,
            statusEffectiveDate: effectiveDate,
            statusReason: member.statusReason,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now,
            addressLine1: "",
            addressLine2: "",
            postalZip: "",
            secondaryPhone: "",
            tertiaryPhone: "",
            recurringMember: false,
            renewalDate: null,
            membership_list: false,
            mailing_list: false,
            email_news: false,
            hide_email: false
          }
        },
        { upsert: true, returnDocument: "after" }
      );

      const updatedMember = updateResult && (updateResult.value || updateResult);
      const memberId = updatedMember && updatedMember._id;
      if (!memberId) {
        continue;
      }

      const existingEvent = await eventsCollection.findOne({
        member: memberId,
        eventType: "status_change",
        source: "seed"
      });

      if (!existingEvent) {
        await eventsCollection.insertOne({
          member: memberId,
          eventType: "status_change",
          previousStatus: null,
          newStatus: member.currentStatus,
          effectiveDate,
          recordedAt: now,
          source: "seed",
          actorUserId: null,
          note: member.statusReason,
          metadata: { action: "seed_bootstrap" }
        });
      }
    }

    console.log("[seed] development data upsert complete");
  } catch (error) {
    console.error("[seed] failed", error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

seed();
