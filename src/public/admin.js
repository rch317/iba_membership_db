const state = {
  members: [],
  selectedMember: null
};

const membersListEl = document.getElementById("membersList");
const historyListEl = document.getElementById("historyList");
const memberCountEl = document.getElementById("memberCount");
const selectedMemberHintEl = document.getElementById("selectedMemberHint");
const memberDetailsEl = document.getElementById("memberDetails");
const toastEl = document.getElementById("toast");
const filtersForm = document.getElementById("filtersForm");
const createForm = document.getElementById("createForm");
const statusForm = document.getElementById("statusForm");
const statusSubmitBtn = document.getElementById("statusSubmitBtn");
const deleteMemberBtn = document.getElementById("deleteMemberBtn");

function isoFromLocalDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function safeShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function showToast(message, isError) {
  toastEl.textContent = message;
  toastEl.classList.toggle("error", Boolean(isError));
  toastEl.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2200);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data && (data.error || (Array.isArray(data.errors) ? data.errors[0] : "Request failed."))) ||
      "Request failed.";
    throw new Error(message);
  }

  return data;
}

function renderMembers() {
  membersListEl.innerHTML = "";
  memberCountEl.textContent = `${state.members.length} loaded`;

  state.members.forEach((member) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "member-card";
    if (state.selectedMember && state.selectedMember._id === member._id) {
      button.classList.add("selected");
    }

    button.innerHTML = `
      <div class="member-title">${member.firstName || ""} ${member.lastName || ""}</div>
      <div class="member-meta">
        <span class="status-badge status-${member.currentStatus || "inactive"}">${member.currentStatus || "-"}</span>
      </div>
      <div class="member-meta member-email">${member.emailAddress || "-"}</div>
      <div class="member-meta member-renewal">Renewal: ${safeShortDate(member.renewalDate)}</div>
    `;

    button.addEventListener("click", () => {
      selectMember(member._id);
    });

    li.appendChild(button);
    membersListEl.appendChild(li);
  });

  if (state.members.length === 0) {
    membersListEl.innerHTML = "<li class=\"member-meta\">No members match this filter.</li>";
  }
}

function renderMemberDetails(member) {
  if (!member) {
    memberDetailsEl.classList.add("empty");
    memberDetailsEl.textContent = "No member selected.";
    selectedMemberHintEl.textContent = "Select a member to view details and history.";
    statusSubmitBtn.disabled = true;
    deleteMemberBtn.disabled = true;
    return;
  }

  memberDetailsEl.classList.remove("empty");
  selectedMemberHintEl.textContent = member._id;
  statusSubmitBtn.disabled = false;
  deleteMemberBtn.disabled = false;

  const flag = (v) => v ? "Yes" : "No";
  const badge = (s) => `<span class="status-badge status-${s || "inactive"}">${s || "-"}</span>`;
  const phones = [
    member.primaryPhone && `Primary: ${member.primaryPhone}`,
    member.secondaryPhone && `Work: ${member.secondaryPhone}`,
    member.tertiaryPhone && `Cell: ${member.tertiaryPhone}`,
  ].filter(Boolean).join(" &bull; ") || "-";
  const addr = [member.addressLine1, member.addressLine2].filter(Boolean).join(", ") || "-";
  const cityStateZip = [member.city, member.state, member.postalZip].filter(Boolean).join(", ") || "-";

  memberDetailsEl.innerHTML = `
    <div class="detail-section">
      <h4>Identity</h4>
      <div class="detail-grid">
        <span>Name</span><strong>${member.firstName || ""} ${member.lastName || ""}</strong>
        <span>Email</span><strong>${member.emailAddress || "-"}</strong>
        <span>Phone(s)</span><strong>${phones}</strong>
        <span>Hide email</span><strong>${flag(member.hide_email)}</strong>
      </div>
    </div>
    <div class="detail-section">
      <h4>Address</h4>
      <div class="detail-grid">
        <span>Street</span><strong>${addr}</strong>
        <span>City / State / ZIP</span><strong>${cityStateZip}</strong>
        <span>Satellite group</span><strong>${member.satelliteHome || "-"}</strong>
      </div>
    </div>
    <div class="detail-section">
      <h4>Membership</h4>
      <div class="detail-grid">
        <span>Status</span><strong>${badge(member.currentStatus)}</strong>
        <span>Effective</span><strong>${safeDate(member.statusEffectiveDate)}</strong>
        <span>Reason</span><strong>${member.statusReason || "-"}</strong>
        <span>Renewal date</span><strong>${safeShortDate(member.renewalDate)}</strong>
        <span>Recurring</span><strong>${flag(member.recurringMember)}</strong>
        <span>Membership list</span><strong>${flag(member.membership_list)}</strong>
        <span>Mailing list</span><strong>${flag(member.mailing_list)}</strong>
        <span>Email news</span><strong>${flag(member.email_news)}</strong>
      </div>
    </div>
    <div class="detail-section">
      <h4>Record</h4>
      <div class="detail-grid">
        <span>Created</span><strong>${safeDate(member.createdAt)}</strong>
        <span>Updated</span><strong>${safeDate(member.updatedAt)}</strong>
        ${member.deletedAt ? `<span>Deleted</span><strong>${safeDate(member.deletedAt)}</strong>` : ""}
      </div>
    </div>
  `;
}

function renderHistory(events) {
  historyListEl.innerHTML = "";

  events.forEach((event) => {
    const item = document.createElement("li");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${event.eventType || "status_change"}: ${event.previousStatus || "none"} -> ${event.newStatus || "-"}</strong>
      <div class="event-meta">Effective: ${safeDate(event.effectiveDate)}</div>
      <div class="event-meta">Recorded: ${safeDate(event.recordedAt)}</div>
      <div class="event-meta">Note: ${event.note || "-"}</div>
    `;
    historyListEl.appendChild(item);
  });

  if (events.length === 0) {
    historyListEl.innerHTML = "<li class=\"member-meta\">No lifecycle events yet.</li>";
  }
}

async function loadMembers() {
  const fd = new FormData(filtersForm);
  const status = fd.get("status");
  const limit = fd.get("limit");
  const includeDeleted = document.getElementById("includeDeletedFilter").checked;

  const search = fd.get("search");

  const params = new URLSearchParams();
  if (search) params.set("search", search.trim());
  if (status) params.set("status", status);
  if (limit) {
    params.set("limit", String(limit));
  } else {
    params.set("limit", "200");
  }
  if (includeDeleted) params.set("includeDeleted", "true");

  const data = await api(`/members?${params.toString()}`);
  state.members = data.members || [];

  if (state.selectedMember) {
    const refreshed = state.members.find((m) => m._id === state.selectedMember._id);
    state.selectedMember = refreshed || null;
  }

  renderMembers();
  renderMemberDetails(state.selectedMember);
}

async function selectMember(memberId) {
  try {
    const includeDeleted = document.getElementById("includeDeletedFilter").checked;
    const query = includeDeleted ? "?includeDeleted=true" : "";
    const memberResponse = await api(`/members/${memberId}${query}`);
    const historyResponse = await api(`/members/${memberId}/history`);

    state.selectedMember = memberResponse.member;
    renderMembers();
    renderMemberDetails(state.selectedMember);
    renderHistory(historyResponse.events || []);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onCreateSubmit(event) {
  event.preventDefault();

  const fd = new FormData(createForm);
  const payload = {
    firstName: String(fd.get("firstName") || "").trim(),
    lastName: String(fd.get("lastName") || "").trim(),
    emailAddress: String(fd.get("emailAddress") || "").trim() || undefined,
    primaryPhone: String(fd.get("primaryPhone") || "").trim() || undefined,
    city: String(fd.get("city") || "").trim() || undefined,
    state: String(fd.get("state") || "").trim() || undefined,
    postalZip: String(fd.get("postalZip") || "").trim() || undefined,
    currentStatus: String(fd.get("currentStatus") || "active"),
    statusEffectiveDate: isoFromLocalDateTime(String(fd.get("statusEffectiveDate") || "")),
    statusReason: String(fd.get("statusReason") || "").trim() || undefined,
    membership_list: fd.get("membership_list") === "on",
    mailing_list: fd.get("mailing_list") === "on",
    email_news: fd.get("email_news") === "on",
    hide_email: fd.get("hide_email") === "on",
    recurringMember: fd.get("recurringMember") === "on"
  };

  try {
    const data = await api("/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    createForm.reset();
    setDefaultDateTimes();
    showToast("Member created.", false);
    await loadMembers();
    await selectMember(data.member._id);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onStatusSubmit(event) {
  event.preventDefault();

  if (!state.selectedMember) {
    showToast("Select a member first.", true);
    return;
  }

  const fd = new FormData(statusForm);
  const payload = {
    newStatus: String(fd.get("newStatus") || ""),
    effectiveDate: isoFromLocalDateTime(String(fd.get("effectiveDate") || "")),
    reason: String(fd.get("reason") || "").trim() || undefined,
    note: String(fd.get("note") || "").trim() || undefined,
    source: "ui"
  };

  try {
    await api(`/members/${state.selectedMember._id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    statusForm.reset();
    setDefaultDateTimes();
    showToast("Status transition recorded.", false);
    await loadMembers();
    await selectMember(state.selectedMember._id);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onDeleteClick() {
  if (!state.selectedMember) {
    showToast("Select a member first.", true);
    return;
  }

  const confirmed = window.confirm("Soft-delete this member and record cancellation event?");
  if (!confirmed) return;

  try {
    await api(`/members/${state.selectedMember._id}`, { method: "DELETE" });
    showToast("Member soft-deleted.", false);
    const deletedId = state.selectedMember._id;
    state.selectedMember = null;
    renderMemberDetails(null);
    renderHistory([]);
    await loadMembers();

    if (document.getElementById("includeDeletedFilter").checked) {
      await selectMember(deletedId);
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

function setDefaultDateTimes() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const createDateInput = createForm.querySelector("input[name=statusEffectiveDate]");
  const statusDateInput = statusForm.querySelector("input[name=effectiveDate]");

  if (createDateInput && !createDateInput.value) {
    createDateInput.value = local;
  }

  if (statusDateInput && !statusDateInput.value) {
    statusDateInput.value = local;
  }
}

filtersForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadMembers();
  } catch (error) {
    showToast(error.message, true);
  }
});

let _searchTimer;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    try { await loadMembers(); } catch (e) { showToast(e.message, true); }
  }, 320);
});
document.getElementById("searchInput").addEventListener("search", async () => {
  try { await loadMembers(); } catch (e) { showToast(e.message, true); }
});

createForm.addEventListener("submit", onCreateSubmit);
statusForm.addEventListener("submit", onStatusSubmit);
deleteMemberBtn.addEventListener("click", onDeleteClick);

async function initialize() {
  setDefaultDateTimes();

  try {
    await loadMembers();
    renderHistory([]);
  } catch (error) {
    showToast(error.message, true);
  }
}

initialize();
