const express = require("express");
const { ObjectId } = require("mongodb");
const {
  validateCreateMemberPayload,
  validateUpdateMemberPayload,
  validateStatusUpdatePayload
} = require("../validation/memberValidation");

function parseObjectId(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

function sanitizeMember(member) {
  if (!member) return member;
  return member;
}

function createMembersRouter(db, options) {
  const router = express.Router();
  const membersCollection = db.collection("iba_members");
  const eventsCollection = db.collection("iba_membership_events");
  const readOnlyMode = Boolean(options && options.readOnlyMode);

  router.use((req, res, next) => {
    const isWriteMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (readOnlyMode && isWriteMethod) {
      return res.status(403).json({
        error: "API is running in read-only mode. Write operations are disabled."
      });
    }
    next();
  });

  router.post("/", async (req, res) => {
    const { errors, value } = validateCreateMemberPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    try {
      const insertResult = await membersCollection.insertOne(value);

      await eventsCollection.insertOne({
        member: insertResult.insertedId,
        eventType: "status_change",
        previousStatus: null,
        newStatus: value.currentStatus,
        effectiveDate: value.statusEffectiveDate,
        recordedAt: new Date(),
        source: "api",
        actorUserId: null,
        note: value.statusReason,
        metadata: { action: "member_create" }
      });

      const created = await membersCollection.findOne({ _id: insertResult.insertedId });
      return res.status(201).json({ member: sanitizeMember(created) });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: "Duplicate key violation (likely emailAddress)." });
      }

      return res.status(500).json({ error: "Failed to create member.", detail: error.message });
    }
  });

  router.get("/", async (req, res) => {
    const filter = {};
    if (req.query.status) {
      filter.currentStatus = String(req.query.status);
    }

    if (req.query.search) {
      const re = { $regex: String(req.query.search), $options: "i" };
      filter.$or = [{ firstName: re }, { lastName: re }, { emailAddress: re }];
    }

    if (req.query.includeDeleted !== "true") {
      filter.deletedAt = { $exists: false };
    }

    const limit = Math.min(Number(req.query.limit || 100), 500);
    const members = await membersCollection.find(filter).sort({ lastName: 1, firstName: 1 }).limit(limit).toArray();

    return res.status(200).json({ count: members.length, members: members.map(sanitizeMember) });
  });

  router.get("/:id", async (req, res) => {
    const memberId = parseObjectId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: "Invalid member id." });
    }

    const filter = { _id: memberId };
    if (req.query.includeDeleted !== "true") {
      filter.deletedAt = { $exists: false };
    }

    const member = await membersCollection.findOne(filter);
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }

    return res.status(200).json({ member: sanitizeMember(member) });
  });

  router.patch("/:id", async (req, res) => {
    const memberId = parseObjectId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: "Invalid member id." });
    }

    const { errors, value } = validateUpdateMemberPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    try {
      const updateResult = await membersCollection.findOneAndUpdate(
        { _id: memberId, deletedAt: { $exists: false } },
        { $set: value },
        { returnDocument: "after" }
      );

      const updatedMember = updateResult && (updateResult.value || updateResult);

      if (!updatedMember) {
        return res.status(404).json({ error: "Member not found." });
      }

      return res.status(200).json({ member: sanitizeMember(updatedMember) });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ error: "Duplicate key violation (likely emailAddress)." });
      }

      return res.status(500).json({ error: "Failed to update member.", detail: error.message });
    }
  });

  router.patch("/:id/status", async (req, res) => {
    const memberId = parseObjectId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: "Invalid member id." });
    }

    const { errors, value } = validateStatusUpdatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const member = await membersCollection.findOne({ _id: memberId, deletedAt: { $exists: false } });
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }

    const updatedAt = new Date();

    await membersCollection.updateOne(
      { _id: memberId },
      {
        $set: {
          currentStatus: value.newStatus,
          statusEffectiveDate: value.effectiveDate,
          statusReason: value.reason,
          updatedAt
        }
      }
    );

    const eventResult = await eventsCollection.insertOne({
      member: memberId,
      eventType: "status_change",
      previousStatus: member.currentStatus || null,
      newStatus: value.newStatus,
      effectiveDate: value.effectiveDate,
      recordedAt: updatedAt,
      source: value.source || "api",
      actorUserId: null,
      note: value.note || value.reason || "",
      metadata: { action: "member_status_update" }
    });

    const updatedMember = await membersCollection.findOne({ _id: memberId });

    return res.status(200).json({
      member: sanitizeMember(updatedMember),
      membershipEventId: eventResult.insertedId
    });
  });

  router.delete("/:id", async (req, res) => {
    const memberId = parseObjectId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: "Invalid member id." });
    }

    const member = await membersCollection.findOne({ _id: memberId, deletedAt: { $exists: false } });
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }

    const now = new Date();

    await membersCollection.updateOne(
      { _id: memberId },
      {
        $set: {
          deletedAt: now,
          currentStatus: "inactive",
          statusEffectiveDate: now,
          statusReason: "Soft-deleted",
          updatedAt: now
        }
      }
    );

    await eventsCollection.insertOne({
      member: memberId,
      eventType: "cancellation",
      previousStatus: member.currentStatus || null,
      newStatus: "inactive",
      effectiveDate: now,
      recordedAt: now,
      source: "api",
      actorUserId: null,
      note: "Member soft-deleted",
      metadata: { action: "member_delete" }
    });

    return res.status(200).json({ status: "deleted", memberId });
  });

  router.get("/:id/history", async (req, res) => {
    const memberId = parseObjectId(req.params.id);
    if (!memberId) {
      return res.status(400).json({ error: "Invalid member id." });
    }

    const events = await eventsCollection
      .find({ member: memberId })
      .sort({ effectiveDate: -1, recordedAt: -1 })
      .toArray();

    return res.status(200).json({ count: events.length, events });
  });

  return router;
}

module.exports = { createMembersRouter };
