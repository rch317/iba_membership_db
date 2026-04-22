const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { MongoClient } = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");

let mongoServer;
let mongoClient;
let db;
let app;

async function createMember() {
  const payload = {
    firstName: "Ada",
    lastName: "Lovelace",
    emailAddress: "ada@example.org",
    currentStatus: "active",
    statusEffectiveDate: "2026-04-22T00:00:00.000Z",
    statusReason: "Initial signup",
    membership_list: true,
    mailing_list: true,
    email_news: true,
    hide_email: false
  };

  const response = await request(app).post("/members").send(payload).expect(201);
  return response.body.member;
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  mongoClient = new MongoClient(mongoServer.getUri());
  await mongoClient.connect();
  db = mongoClient.db("membership_test");
  app = createApp({
    db,
    dbName: "membership_test",
    getMongoClient: () => mongoClient,
    getMongoReady: () => true
  });
});

test.beforeEach(async () => {
  await db.dropDatabase();
});

test.after(async () => {
  if (mongoClient) {
    await mongoClient.close();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("status transition appends immutable history and updates snapshot", async () => {
  const member = await createMember();

  const statusUpdateResponse = await request(app)
    .patch(`/members/${member._id}/status`)
    .send({
      newStatus: "inactive",
      effectiveDate: "2026-05-01T00:00:00.000Z",
      reason: "Lapsed due to non-renewal",
      note: "Reminder sent twice",
      source: "api"
    })
    .expect(200);

  assert.equal(statusUpdateResponse.body.member.currentStatus, "inactive");
  assert.equal(statusUpdateResponse.body.member.statusReason, "Lapsed due to non-renewal");
  assert.ok(statusUpdateResponse.body.membershipEventId);

  const historyResponse = await request(app).get(`/members/${member._id}/history`).expect(200);

  assert.equal(historyResponse.body.count, 2);
  assert.equal(historyResponse.body.events[0].eventType, "status_change");
  assert.equal(historyResponse.body.events[0].newStatus, "inactive");
  assert.equal(historyResponse.body.events[0].previousStatus, "active");
  assert.equal(historyResponse.body.events[1].eventType, "status_change");
  assert.equal(historyResponse.body.events[1].newStatus, "active");
  assert.equal(historyResponse.body.events[1].previousStatus, null);
});

test("soft delete marks member inactive and records cancellation event", async () => {
  const member = await createMember();

  await request(app).delete(`/members/${member._id}`).expect(200);

  await request(app).get(`/members/${member._id}`).expect(404);

  const deletedMemberResponse = await request(app)
    .get(`/members/${member._id}`)
    .query({ includeDeleted: "true" })
    .expect(200);

  assert.equal(deletedMemberResponse.body.member.currentStatus, "inactive");
  assert.ok(deletedMemberResponse.body.member.deletedAt);
  assert.equal(deletedMemberResponse.body.member.statusReason, "Soft-deleted");

  const historyResponse = await request(app).get(`/members/${member._id}/history`).expect(200);

  assert.equal(historyResponse.body.count, 2);
  assert.equal(historyResponse.body.events[0].eventType, "cancellation");
  assert.equal(historyResponse.body.events[0].newStatus, "inactive");
  assert.equal(historyResponse.body.events[0].previousStatus, "active");
  assert.equal(historyResponse.body.events[1].eventType, "status_change");
});

test("status update rejects invalid newStatus with 400 and does not append event", async () => {
  const member = await createMember();

  const invalidResponse = await request(app)
    .patch(`/members/${member._id}/status`)
    .send({
      newStatus: "paused",
      effectiveDate: "2026-06-01T00:00:00.000Z",
      reason: "Invalid status test"
    })
    .expect(400);

  assert.ok(Array.isArray(invalidResponse.body.errors));
  assert.match(invalidResponse.body.errors[0], /newStatus is required and must be one of/i);

  const historyResponse = await request(app).get(`/members/${member._id}/history`).expect(200);
  assert.equal(historyResponse.body.count, 1);
  assert.equal(historyResponse.body.events[0].eventType, "status_change");
  assert.equal(historyResponse.body.events[0].newStatus, "active");
});

test("status update rejects invalid effectiveDate with 400 and does not append event", async () => {
  const member = await createMember();

  const invalidResponse = await request(app)
    .patch(`/members/${member._id}/status`)
    .send({
      newStatus: "inactive",
      effectiveDate: "not-a-date",
      reason: "Invalid date test"
    })
    .expect(400);

  assert.ok(Array.isArray(invalidResponse.body.errors));
  assert.match(invalidResponse.body.errors[0], /effectiveDate is required and must be a valid date/i);

  const memberResponse = await request(app).get(`/members/${member._id}`).expect(200);
  assert.equal(memberResponse.body.member.currentStatus, "active");

  const historyResponse = await request(app).get(`/members/${member._id}/history`).expect(200);
  assert.equal(historyResponse.body.count, 1);
  assert.equal(historyResponse.body.events[0].newStatus, "active");
});

test("status update rejects malformed member id with 400", async () => {
  const response = await request(app)
    .patch("/members/not-a-valid-object-id/status")
    .send({
      newStatus: "inactive",
      effectiveDate: "2026-06-01T00:00:00.000Z",
      reason: "Malformed id test"
    })
    .expect(400);

  assert.equal(response.body.error, "Invalid member id.");
});

test("history lookup rejects malformed member id with 400", async () => {
  const response = await request(app).get("/members/not-a-valid-object-id/history").expect(400);

  assert.equal(response.body.error, "Invalid member id.");
});

test("member lookup rejects malformed member id with 400", async () => {
  const response = await request(app).get("/members/not-a-valid-object-id").expect(400);

  assert.equal(response.body.error, "Invalid member id.");
});

test("member patch rejects malformed member id with 400", async () => {
  const response = await request(app)
    .patch("/members/not-a-valid-object-id")
    .send({ city: "Bloomington" })
    .expect(400);

  assert.equal(response.body.error, "Invalid member id.");
});

test("member delete rejects malformed member id with 400", async () => {
  const response = await request(app).delete("/members/not-a-valid-object-id").expect(400);

  assert.equal(response.body.error, "Invalid member id.");
});