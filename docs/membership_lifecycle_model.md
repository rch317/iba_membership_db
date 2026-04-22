# Membership Lifecycle Model

This document defines how member active/inactive history is captured and queried indefinitely.

## Goals

- Preserve every meaningful membership status transition.
- Support current-state queries with low latency.
- Support historical timeline and point-in-time status checks.
- Keep operational logic simple and auditable.

## Status vocabulary

Allowed status values:
- active
- inactive
- lapsed
- honorary
- deceased

## Event model

Store immutable lifecycle records in iba_membership_events.

Required event payload:
- member
- eventType
- newStatus
- effectiveDate

Recommended metadata:
- previousStatus
- actorUserId
- source
- note
- metadata

## Write workflow

For every status transition:
1. Validate status transition request and effectiveDate.
2. Read current status snapshot from iba_members.
3. Update iba_members.currentStatus and iba_members.statusEffectiveDate.
4. Insert immutable event in iba_membership_events.
5. Return both updated snapshot and inserted event.

If MongoDB transactions are available in the deployed topology, run steps 3 and 4 in a single transaction.

## Read patterns

Current active members:
- Query iba_members where currentStatus = active.

Current inactive members:
- Query iba_members where currentStatus in [inactive, lapsed].

Single member timeline:
- Query iba_membership_events by member sorted by effectiveDate desc.

Point-in-time status:
- Query most recent event where effectiveDate <= targetDate.
- Fallback to initial member snapshot if no events exist.

## Data integrity checks

Run a periodic job that verifies:
- Latest event status equals iba_members.currentStatus.
- Latest event effectiveDate equals iba_members.statusEffectiveDate.
- No member has future-dated events beyond policy limits.

## Migration guidance

For legacy records without history:
- Create one bootstrap event per member from current known status.
- Set eventType = migration and source = migration.
- Use best-known effective date, otherwise import date.

## API shape suggestion

Endpoints:
- POST /members
- PATCH /members/:id/status
- GET /members?status=active
- GET /members/:id/history
- GET /members/:id/status-at?date=YYYY-MM-DD

Example status update payload:
{
  "newStatus": "inactive",
  "effectiveDate": "2026-04-22",
  "reason": "Membership not renewed",
  "note": "No payment received by grace period end"
}

## Operational notes

- Never overwrite historical events to represent a new state; always append.
- Reserve correction events for data repair cases.
- Prefer soft-deactivation over member deletion to preserve continuity.
