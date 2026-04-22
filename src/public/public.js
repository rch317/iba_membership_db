const state = {
  members: [],
  selectedMember: null
};

const membersListEl = document.getElementById("membersList");
const memberCountEl = document.getElementById("memberCount");
const selectedMemberHintEl = document.getElementById("selectedMemberHint");
const memberDetailsEl = document.getElementById("memberDetails");
const toastEl = document.getElementById("toast");
const filtersForm = document.getElementById("filtersForm");

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
  memberCountEl.textContent = `${state.members.length} members`;

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
    membersListEl.innerHTML = "<li class=\"member-meta\">No members with public contact information.</li>";
  }
}

function renderMemberDetails(member) {
  if (!member) {
    memberDetailsEl.classList.add("empty");
    memberDetailsEl.textContent = "No member selected.";
    selectedMemberHintEl.textContent = "Select a member to view contact information.";
    return;
  }

  memberDetailsEl.classList.remove("empty");
  selectedMemberHintEl.textContent = `${member.firstName} ${member.lastName}`;

  const phones = [
    member.primaryPhone && `Primary: ${member.primaryPhone}`,
    member.secondaryPhone && `Work: ${member.secondaryPhone}`,
    member.tertiaryPhone && `Cell: ${member.tertiaryPhone}`,
  ].filter(Boolean).join(" &bull; ") || "-";

  memberDetailsEl.innerHTML = `
    <div class="detail-section">
      <h4>Contact Information</h4>
      <div class="detail-grid">
        <span>Email</span><strong>${member.emailAddress || "-"}</strong>
        <span>Phone(s)</span><strong>${phones}</strong>
      </div>
    </div>
    <div class="detail-section">
      <h4>Satellite Group</h4>
      <div class="detail-grid">
        <span>Group</span><strong>${member.satelliteHome || "-"}</strong>
      </div>
    </div>
  `;
}

async function loadMembers() {
  try {
    const fd = new FormData(filtersForm);
    const search = fd.get("search");
    
    const params = new URLSearchParams();
    params.set("status", "active");
    params.set("limit", "500");
    if (search) params.set("search", search.trim());
    
    // Request active members from server, then client-side filter for membership_list
    const data = await api(`/members?${params.toString()}`);
    state.members = (data.members || []).filter(m => m.membership_list === true);
    state.selectedMember = null;
    renderMembers();
    renderMemberDetails(null);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function selectMember(memberId) {
  try {
    const memberResponse = await api(`/members/${memberId}`);
    state.selectedMember = memberResponse.member;
    renderMembers();
    renderMemberDetails(state.selectedMember);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function initialize() {
  try {
    await loadMembers();
  } catch (error) {
    showToast(error.message, true);
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

initialize();
