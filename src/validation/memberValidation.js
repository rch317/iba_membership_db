const ALLOWED_STATUSES = ["active", "inactive", "lapsed", "honorary", "deceased"];

const MEMBER_UPDATE_FIELDS = [
  "firstName",
  "lastName",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalZip",
  "primaryPhone",
  "secondaryPhone",
  "tertiaryPhone",
  "emailAddress",
  "satelliteHome",
  "recurringMember",
  "renewalDate",
  "membership_list",
  "mailing_list",
  "email_news",
  "hide_email"
];

function isValidDateValue(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
}

function validateCreateMemberPayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return { errors: ["Body must be a JSON object."], value: null };
  }

  if (!body.firstName || typeof body.firstName !== "string") {
    errors.push("firstName is required and must be a string.");
  }

  if (!body.lastName || typeof body.lastName !== "string") {
    errors.push("lastName is required and must be a string.");
  }

  if (!ALLOWED_STATUSES.includes(body.currentStatus)) {
    errors.push(`currentStatus is required and must be one of: ${ALLOWED_STATUSES.join(", ")}.`);
  }

  if (!body.statusEffectiveDate || !isValidDateValue(body.statusEffectiveDate)) {
    errors.push("statusEffectiveDate is required and must be a valid date.");
  }

  if (body.renewalDate && !isValidDateValue(body.renewalDate)) {
    errors.push("renewalDate must be a valid date when provided.");
  }

  if (errors.length > 0) {
    return { errors, value: null };
  }

  const now = new Date();
  const value = {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    addressLine1: body.addressLine1 ? String(body.addressLine1).trim() : "",
    addressLine2: body.addressLine2 ? String(body.addressLine2).trim() : "",
    city: body.city ? String(body.city).trim() : "",
    state: body.state ? String(body.state).trim() : "",
    postalZip: body.postalZip ? String(body.postalZip).trim() : "",
    primaryPhone: body.primaryPhone ? String(body.primaryPhone).trim() : "",
    secondaryPhone: body.secondaryPhone ? String(body.secondaryPhone).trim() : "",
    tertiaryPhone: body.tertiaryPhone ? String(body.tertiaryPhone).trim() : "",
    emailAddress: body.emailAddress ? normalizeEmail(body.emailAddress) : null,
    satelliteHome: body.satelliteHome ? String(body.satelliteHome).trim() : "",
    recurringMember: Boolean(body.recurringMember),
    renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
    membership_list: Boolean(body.membership_list),
    mailing_list: Boolean(body.mailing_list),
    email_news: Boolean(body.email_news),
    hide_email: Boolean(body.hide_email),
    currentStatus: body.currentStatus,
    statusEffectiveDate: new Date(body.statusEffectiveDate),
    statusReason: body.statusReason ? String(body.statusReason).trim() : "",
    createdAt: now,
    updatedAt: now
  };

  return { errors: [], value };
}

function validateUpdateMemberPayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return { errors: ["Body must be a JSON object."], value: null };
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { errors: ["At least one update field is required."], value: null };
  }

  const invalidKeys = keys.filter((key) => !MEMBER_UPDATE_FIELDS.includes(key));
  if (invalidKeys.length > 0) {
    errors.push(`Unsupported update field(s): ${invalidKeys.join(", ")}.`);
  }

  if (body.renewalDate && !isValidDateValue(body.renewalDate)) {
    errors.push("renewalDate must be a valid date when provided.");
  }

  if (errors.length > 0) {
    return { errors, value: null };
  }

  const value = { ...body };

  if (typeof value.firstName === "string") value.firstName = value.firstName.trim();
  if (typeof value.lastName === "string") value.lastName = value.lastName.trim();
  if (typeof value.addressLine1 === "string") value.addressLine1 = value.addressLine1.trim();
  if (typeof value.addressLine2 === "string") value.addressLine2 = value.addressLine2.trim();
  if (typeof value.city === "string") value.city = value.city.trim();
  if (typeof value.state === "string") value.state = value.state.trim();
  if (typeof value.postalZip === "string") value.postalZip = value.postalZip.trim();
  if (typeof value.primaryPhone === "string") value.primaryPhone = value.primaryPhone.trim();
  if (typeof value.secondaryPhone === "string") value.secondaryPhone = value.secondaryPhone.trim();
  if (typeof value.tertiaryPhone === "string") value.tertiaryPhone = value.tertiaryPhone.trim();
  if (typeof value.emailAddress === "string") value.emailAddress = normalizeEmail(value.emailAddress);
  if (typeof value.satelliteHome === "string") value.satelliteHome = value.satelliteHome.trim();
  if (value.renewalDate) value.renewalDate = new Date(value.renewalDate);

  value.updatedAt = new Date();

  return { errors: [], value };
}

function validateStatusUpdatePayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return { errors: ["Body must be a JSON object."], value: null };
  }

  if (!ALLOWED_STATUSES.includes(body.newStatus)) {
    errors.push(`newStatus is required and must be one of: ${ALLOWED_STATUSES.join(", ")}.`);
  }

  if (!body.effectiveDate || !isValidDateValue(body.effectiveDate)) {
    errors.push("effectiveDate is required and must be a valid date.");
  }

  if (errors.length > 0) {
    return { errors, value: null };
  }

  const value = {
    newStatus: body.newStatus,
    effectiveDate: new Date(body.effectiveDate),
    reason: body.reason ? String(body.reason).trim() : "",
    note: body.note ? String(body.note).trim() : "",
    source: body.source ? String(body.source).trim() : "api"
  };

  return { errors: [], value };
}

module.exports = {
  ALLOWED_STATUSES,
  validateCreateMemberPayload,
  validateUpdateMemberPayload,
  validateStatusUpdatePayload
};
