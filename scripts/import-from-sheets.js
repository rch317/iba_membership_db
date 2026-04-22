/**
 * import-from-sheets.js
 *
 * Pulls member data from Google Sheets and upserts into iba_members.
 * For each newly inserted member an initial lifecycle event is also written
 * to iba_membership_events.
 *
 * Usage:
 *   node scripts/import-from-sheets.js             # upsert (skip existing)
 *   node scripts/import-from-sheets.js --dry-run   # preview without writing
 *   node scripts/import-from-sheets.js --overwrite # overwrite all fields on existing records
 *
 * Requires:
 *   .secrets/google-service-account.json  — Google service-account key file
 *   MONGO_URI env var (or defaults to mongodb://localhost:27017/membership)
 */

"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const { MongoClient } = require("mongodb");

dotenv.config({ path: process.env.ENV_FILE || ".env/dev/app.env" });

// ── Config ──────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = "1ozaQD9hk7SNhxz_SKhcjLKXca6yq6Hen_YnwftXfP3I";
const SHEET_TAB = "Full Member Listing";
const KEY_FILE = path.resolve(__dirname, "../.secrets/dev/google-service-account.json");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/membership";
const DB_NAME = process.env.MONGO_DB_NAME || "membership";

const DRY_RUN = process.argv.includes("--dry-run");
const OVERWRITE = process.argv.includes("--overwrite");

// ── Column → field map ──────────────────────────────────────────────────────
// Keys are sheet header values (trimmed, lowercased).
// Skipped columns: ID, NEW, SECOND PERSON, SPOUSE, FAX, DATE PD DATABASE, CARD SENT

const COLUMN_MAP = {
  "expires":          { field: "renewalDate",      type: "date"    },
  "mem list":         { field: "membership_list",  type: "boolean" },
  "mail list":        { field: "mailing_list",     type: "boolean" },
  "e-mail news":      { field: "email_news",       type: "boolean" },
  "last name":        { field: "lastName",         type: "string"  },
  "first name":       { field: "firstName",        type: "string"  },
  "address1":         { field: "addressLine1",     type: "string"  },
  "address2":         { field: "addressLine2",     type: "string"  },
  "city":             { field: "city",             type: "string"  },
  "state":            { field: "state",            type: "string"  },
  "zip+4":            { field: "postalZip",        type: "string"  },
  "home":             { field: "primaryPhone",     type: "string"  },
  "work":             { field: "secondaryPhone",   type: "string"  },
  "cell":             { field: "tertiaryPhone",    type: "string"  },
  "e-mail address":   { field: "emailAddress",     type: "string"  },
  "hidden e-mail":    { field: "hide_email",       type: "boolean" },
  "satellite group":  { field: "satelliteHome",    type: "string"  },
  "recurring":        { field: "recurringMember",  type: "boolean" },
};

// ── Type coercions ───────────────────────────────────────────────────────────

function toBoolean(val) {
  if (val === null || val === undefined || val === "") return false;
  return ["y", "yes", "1", "true", "x"].includes(String(val).trim().toLowerCase());
}

function toDate(val) {
  if (!val || String(val).trim() === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toStr(val) {
  const s = String(val ?? "").trim();
  return s === "" ? null : s;
}

function coerce(val, type) {
  switch (type) {
    case "boolean": return toBoolean(val);
    case "date":    return toDate(val);
    default:        return toStr(val);
  }
}

function determineStatus(renewalDate) {
  if (!renewalDate) return "inactive";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  return renewal > today ? "active" : "inactive";
}

// ── Row parser ───────────────────────────────────────────────────────────────

function parseRow(row, headerIndex) {
  const doc = {};
  for (const [colKey, { field, type }] of Object.entries(COLUMN_MAP)) {
    const idx = headerIndex[colKey];
    if (idx === undefined) continue;
    const raw = row[idx] ?? "";
    const value = coerce(raw, type);
    if (value !== null && value !== undefined) doc[field] = value;
  }
  return doc;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : OVERWRITE ? "OVERWRITE" : "UPSERT (skip existing)"}\n`);

  // 1. Authenticate with service account
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 2. Fetch sheet data
  console.log(`Fetching "${SHEET_TAB}" from Google Sheets…`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_TAB}'`,
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) {
    console.error("Sheet is empty or has no data rows.");
    process.exit(1);
  }

  // 3. Build header → column index map
  const headers = rows[0];
  const headerIndex = {};
  headers.forEach((h, i) => {
    headerIndex[String(h).trim().toLowerCase()] = i;
  });

  console.log(`Found ${rows.length - 1} data rows.\n`);

  // Warn about expected columns that are missing
  for (const colKey of Object.keys(COLUMN_MAP)) {
    if (headerIndex[colKey] === undefined) {
      console.warn(`  WARNING: expected column "${colKey}" not found in sheet headers`);
    }
  }

  if (DRY_RUN) {
    const dataRows = rows.slice(1);
    for (let i = 0; i < dataRows.length; i++) {
      const doc = parseRow(dataRows[i], headerIndex);
      if (!doc.lastName && !doc.firstName) continue;
      if (!doc.firstName) doc.firstName = "UNKNOWN";
      if (!doc.lastName) doc.lastName = "UNKNOWN";
      console.log(`[DRY RUN] Row ${i + 2}:`, JSON.stringify(doc));
    }
    console.log("\nDry run complete — no writes made.");
    return;
  }

  // 4. Connect to MongoDB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const membersCol = db.collection("iba_members");
  const eventsCol = db.collection("iba_membership_events");
  console.log(`Connected to MongoDB at ${MONGO_URI} (db=${DB_NAME})\n`);

  // 5. Process rows
  const dataRows = rows.slice(1);
  let inserted = 0, updated = 0, skipped = 0, errored = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const doc = parseRow(row, headerIndex);

    // Skip completely empty rows
    if (!doc.lastName && !doc.firstName) continue;

    // Ensure required name fields are populated
    if (!doc.firstName) doc.firstName = "UNKNOWN";
    if (!doc.lastName) doc.lastName = "UNKNOWN";

    const filter = {
      lastName: doc.lastName,
      firstName: doc.firstName,
    };

    try {
      const existing = await membersCol.findOne(filter);

      if (existing && !OVERWRITE) {
        skipped++;
        continue;
      }

      const now = new Date();

      if (existing && OVERWRITE) {
        await membersCol.updateOne(filter, {
          $set: {
            ...doc,
            currentStatus: determineStatus(doc.renewalDate),
            statusEffectiveDate: doc.renewalDate || now,
            statusReason: "Imported from Google Sheets",
            updatedAt: now
          }
        });
        updated++;
        console.log(`  Updated  row ${i + 2}: ${doc.firstName} ${doc.lastName}`);
        continue;
      }

      // Insert new member with required lifecycle fields
      const memberDoc = {
        ...doc,
        currentStatus: determineStatus(doc.renewalDate),
        statusEffectiveDate: doc.renewalDate || now,
        statusReason: "Imported from Google Sheets",
        recurringMember: doc.recurringMember ?? false,
        membership_list: doc.membership_list ?? false,
        mailing_list: doc.mailing_list ?? false,
        email_news: doc.email_news ?? false,
        hide_email: doc.hide_email ?? false,
        createdAt: now,
        updatedAt: now,
      };

      const insertResult = await membersCol.insertOne(memberDoc);

      await eventsCol.insertOne({
        member: insertResult.insertedId,
        eventType: "status_change",
        previousStatus: null,
        newStatus: memberDoc.currentStatus,
        effectiveDate: memberDoc.statusEffectiveDate,
        recordedAt: now,
        source: "migration",
        actorUserId: null,
        note: "Imported from Google Sheets",
        metadata: { action: "sheet_import", sheetRow: i + 2 },
      });

      inserted++;
      console.log(`  Inserted row ${i + 2}: ${doc.firstName} ${doc.lastName}`);

    } catch (err) {
      // Duplicate email — retry with a prefixed address so the record still gets imported
      if (err.code === 11000 && err.keyPattern && err.keyPattern.emailAddress && doc.emailAddress) {
        try {
          const originalEmail = doc.emailAddress;
          doc.emailAddress = `duplicate_${doc.emailAddress}`;
          const now = new Date();
          const memberDoc = {
            ...doc,
            currentStatus: determineStatus(doc.renewalDate),
            statusEffectiveDate: doc.renewalDate || now,
            statusReason: "Imported from Google Sheets",
            recurringMember: doc.recurringMember ?? false,
            membership_list: doc.membership_list ?? false,
            mailing_list: doc.mailing_list ?? false,
            email_news: doc.email_news ?? false,
            hide_email: doc.hide_email ?? false,
            createdAt: now,
            updatedAt: now,
          };
          const insertResult = await membersCol.insertOne(memberDoc);

          await eventsCol.insertOne({
            member: insertResult.insertedId,
            eventType: "status_change",
            previousStatus: null,
            newStatus: "active",
            effectiveDate: memberDoc.statusEffectiveDate,
            recordedAt: now,
            source: "migration",
            actorUserId: null,
            note: "Imported from Google Sheets (duplicate email prefixed)",
            metadata: { action: "sheet_import", sheetRow: i + 2, originalEmail },
          });

          console.warn(`  Row ${i + 2} (${doc.firstName} ${doc.lastName}): duplicate email — saved as "${doc.emailAddress}"`);
          inserted++;
        } catch (retryErr) {
          console.error(`  Row ${i + 2} retry error (${doc.firstName} ${doc.lastName}): ${retryErr.message}`);
          errored++;
        }
      } else {
        console.error(`  Row ${i + 2} error (${doc.firstName} ${doc.lastName}): ${err.message}`);
        errored++;
      }
    }
  }

  // 6. Summary
  console.log("\n── Import Summary ───────────────────────");
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Updated  : ${updated}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errored}`);
  console.log("─────────────────────────────────────────");

  await client.close();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
