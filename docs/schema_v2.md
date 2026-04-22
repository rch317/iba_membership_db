# MongoDB Schema v2

Database: membership

This v2 schema reuses the prior model and adds explicit lifecycle tracking for long-term active/inactive history.

## Collection: iba_members

Purpose: canonical member profile with current status snapshot.

Fields:
- firstName: String, required, trim
- lastName: String, required, trim
- addressLine1: String, trim
- addressLine2: String, trim
- city: String, trim
- state: String, trim
- postalZip: String, trim
- primaryPhone: String, trim
- secondaryPhone: String, trim
- tertiaryPhone: String, trim
- emailAddress: String, lowercase, trim, unique sparse
- satelliteHome: String, trim (stores satelliteID)
- recurringMember: Boolean, default false
- renewalDate: Date
- membership_list: Boolean, default false
- mailing_list: Boolean, default false
- email_news: Boolean, default false
- hide_email: Boolean, default false
- currentStatus: String, enum: [active, inactive, lapsed, honorary, deceased], required
- statusEffectiveDate: Date, required
- statusReason: String, trim
- createdAt: Date, auto timestamp
- updatedAt: Date, auto timestamp

Indexes:
- { emailAddress: 1 }, unique, sparse
- { lastName: 1, firstName: 1 }
- { currentStatus: 1, lastName: 1 }
- { satelliteHome: 1 }

## Collection: iba_membership_events

Purpose: immutable event log for member lifecycle history.

Fields:
- member: ObjectId, required, ref -> iba_members
- eventType: String, required, enum: [status_change, renewal, reinstatement, cancellation, correction]
- previousStatus: String, enum: [active, inactive, lapsed, honorary, deceased], nullable
- newStatus: String, required, enum: [active, inactive, lapsed, honorary, deceased]
- effectiveDate: Date, required
- recordedAt: Date, default Date.now
- source: String, enum: [admin_ui, api, migration, system], default admin_ui
- actorUserId: ObjectId, ref -> iba_users, nullable
- note: String, trim
- metadata: Object, optional

Indexes:
- { member: 1, effectiveDate: -1 }
- { newStatus: 1, effectiveDate: -1 }
- { eventType: 1, effectiveDate: -1 }

Notes:
- Never update or delete events except for approved data correction workflows.
- Current status in iba_members must match the latest effective event.

## Collection: iba_satellite_groups

Purpose: satellite group records and contacts.

Fields:
- satelliteID: String, required, trim
- groupName: String, trim
- notes: String, trim
- addressLine1: String, trim
- addressLine2: String, trim
- city: String, trim
- state: String, trim
- postalZip: String, trim
- primaryContact: ObjectId, ref -> iba_members, nullable
- secondaryContact: ObjectId, ref -> iba_members, nullable
- tertiaryContact: ObjectId, ref -> iba_members, nullable
- createdAt: Date, auto timestamp
- updatedAt: Date, auto timestamp

Indexes:
- { satelliteID: 1 }, unique
- { groupName: 1 }

## Collection: iba_notes

Purpose: timestamped notes attached to individual members.

Fields:
- member: ObjectId, required, indexed, ref -> iba_members
- text: String, required, trim
- createdAt: Date, auto timestamp
- updatedAt: Date, auto timestamp

Indexes:
- { member: 1, createdAt: -1 }

## Collection: iba_users

Purpose: admin users for OAuth login and API access.

Fields:
- googleId: String, unique sparse
- email: String, required, unique
- displayName: String, default ""
- apiKey: String, unique sparse
- active: Boolean, default true
- createdAt: Date, default Date.now

Indexes:
- { email: 1 }, unique
- { googleId: 1 }, unique, sparse
- { apiKey: 1 }, unique, sparse

## Collection: iba_sessions

Purpose: managed by connect-mongo for Express sessions.

Notes:
- 7-day TTL recommended for session expiration.
- Keep this collection managed by middleware, not by direct business logic.

## Consistency rules

- On status change, write iba_members first or in a transaction with iba_membership_events.
- Write a matching event record for every status change.
- statusEffectiveDate in iba_members should equal the latest event effectiveDate.
- Avoid hard deletes for members to preserve long-term history.
