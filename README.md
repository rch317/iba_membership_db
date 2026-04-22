# iba_membership_db

Project to create a new membership database for the Indiana Blacksmithing Association. The idea is to track our active and inactive members indefinitely. It has been decided that we will be using MongoDB for our database moving forward.

This repository includes a proposed v2 schema and a dedicated membership lifecycle model:
- docs/schema_v2.md
- docs/membership_lifecycle_model.md

In this project we will be using two environments:

## dev
This environment will run locally, using docker containers.  We will have a separate db container, and an app server where our application is deployed. So our mongoDB will be a container for development purposes.

## prod
Our prod environment will run out of the cloud (likely AWS ec2) but still containerized. We will also be using MongoDB Atlas for our database.


I have several MCP's available in docker that I want to make sure we are leveraging:
	- Github Official
	- Memory
	- MongoDB (I will need the local connection string)
	- Node.js Sandbox

## Data model baseline

We will reuse the existing schema ideas from the prior project document (`mongodb_schemas.md`) as the baseline for these collections:
- iba_members
- iba_satellite_groups
- iba_notes
- iba_users
- iba_sessions

We will extend that baseline with explicit lifecycle tracking so member status changes are preserved indefinitely.

## New lifecycle requirement

The new system must retain historical membership state over time, not just current state. That means each transition (for example: active -> inactive, inactive -> active) is saved with an effective date and metadata.

Recommended implementation:
- Keep a current status snapshot in `iba_members` for fast reads.
- Store the audit timeline in a dedicated `iba_membership_events` collection.

Details are documented in:
- docs/schema_v2.md
- docs/membership_lifecycle_model.md

## Local MongoDB connection strings

For local Docker development, use one of the following depending on where the app runs:
- App running on host machine: `mongodb://localhost:27017/membership`
- App running in Docker Compose network: `mongodb://mongo:27017/membership`

## Proposed implementation plan

1. Define Docker Compose services for `app` and `mongo` in dev.
2. Stand up MongoDB locally and verify connectivity from app container.
3. Create initial MongoDB indexes for all collections in `docs/schema_v2.md`.
4. Implement core CRUD for members, satellite groups, and notes.
5. Implement lifecycle write path:
	- update current status on `iba_members`
	- append immutable record to `iba_membership_events`
6. Add query endpoints for:
	- current active members
	- current inactive members
	- member status history timeline
	- historical point-in-time status checks
7. Add data validation rules (required fields, enums, and dates).
8. Add automated tests for lifecycle transitions and history integrity.
9. Configure prod environment to use MongoDB Atlas.
10. Add migration/import scripts for legacy member records, if needed.

## Suggested next deliverables

- Add role-based auth for protected write routes.
- Add lifecycle transition integration tests.

## OpenAPI spec and examples

Request/response examples for the currently implemented health and member endpoints are now in:
- docs/openapi_members.yaml

This includes:
- Health routes (`/health`, `/health/ready`, `/health/mongo`)
- Member routes (`POST/GET/PATCH/DELETE /members`, `PATCH /members/:id/status`, `GET /members/:id/history`)
- Validation error shapes and representative success/error examples for each endpoint

To preview the spec in Swagger Editor, you can run:

```bash
npx -y swagger-ui-watcher docs/openapi_members.yaml --no-open
```

Then open the local URL printed by the command.

## Dev bootstrap (implemented)

The following files are now included:
- docker-compose.yml
- Dockerfile
- src/index.js
- scripts/init-indexes.js
- .env/dev/app.env
- package.json

### Start local dev stack

```bash
docker compose up --build
```

### Health checks

When the stack is up, test:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/mongo
```

### Open the UI (desktop + mobile)

When the app is running, open:

```bash
http://localhost:3000
```

UI behavior:
- Desktop: split-panel workspace (filters, member list, detail/history, create form)
- Mobile: stacked single-column workflow optimized for touch and narrow screens

The UI is connected to the implemented member lifecycle endpoints for:
- listing/filtering members
- creating members
- applying status transitions
- viewing lifecycle history
- soft-deleting members

### Create MongoDB indexes

From another terminal while Docker is running:

```bash
docker compose exec app npm run init:indexes
```

If you run the script from host instead of the app container, set host Mongo URI first:

```bash
ENV_FILE=.env/dev/app.env MONGO_URI=mongodb://localhost:27017/membership npm run init:indexes
```

### Seed development data

Run from host:

```bash
npm run seed:dev
```

Or from app container:

```bash
docker compose exec app npm run seed:dev
```

## Implemented member API endpoints

- POST /members
- GET /members
- GET /members/:id
- PATCH /members/:id
- PATCH /members/:id/status
- GET /members/:id/history
- DELETE /members/:id (soft delete)

Notes:
- Request validation is enforced for create, update, and status transition payloads.
- Status updates append immutable records to iba_membership_events.

## Importing members from Google Sheets

The import script reads from the **Full Member Listing** tab of the IBA Google Sheet and upserts members into `iba_members`. Each newly inserted member also gets an initial record written to `iba_membership_events` with `source: migration`.

Prerequisite: place a Google service account key file at:

```
.secrets/google-service-account.json
```

The service account needs **Viewer** access to the Google Sheet.

```bash
# Preview what would be imported (no writes)
npm run import:sheets:dry

# Upsert (insert new, skip existing by lastName+firstName match)
npm run import:sheets

# Overwrite all fields on existing records
npm run import:sheets:overwrite
```

Or run directly with host Mongo URI:

```bash
MONGO_URI=mongodb://localhost:27017/membership node scripts/import-from-sheets.js --dry-run
```

Notes:
- Rows with no first or last name are skipped.
- Blank required name fields fall back to `UNKNOWN`.
- `currentStatus` defaults to `active` (the sheet has no status column).
- Duplicate email conflicts are retried with a `duplicate_` prefix so the record is still imported.

## Integration tests (lifecycle)

Lifecycle transition integration tests are available and validate:
- status change updates the current snapshot and writes immutable history
- soft delete marks member inactive and writes a cancellation event

Run them with:

```bash
npm test
```

