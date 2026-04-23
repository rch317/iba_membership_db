const state = {
  members: [],
  groups: [],
  selectedGroup: null
};

const groupListEl = document.getElementById("groupList");
const groupCountEl = document.getElementById("groupCount");
const selectedGroupHintEl = document.getElementById("selectedGroupHint");
const groupDetailsEl = document.getElementById("groupDetails");
const toastEl = document.getElementById("toast");
const filtersForm = document.getElementById("filtersForm");

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

function groupName(member) {
  const raw = typeof member.satelliteHome === "string" ? member.satelliteHome.trim() : "";
  return raw || "Unassigned";
}

function buildGroups(members, searchText) {
  const term = String(searchText || "").trim().toLowerCase();
  const byGroup = new Map();

  members.forEach((member) => {
    const key = groupName(member);
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
    }
    byGroup.get(key).push(member);
  });

  const groups = Array.from(byGroup.entries()).map(([name, groupMembers]) => {
    const sortedMembers = groupMembers.sort((a, b) => {
      const aName = `${a.lastName || ""} ${a.firstName || ""}`.trim().toLowerCase();
      const bName = `${b.lastName || ""} ${b.firstName || ""}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });

    return {
      name,
      members: sortedMembers,
      count: sortedMembers.length
    };
  });

  let filtered = groups;

  if (term) {
    filtered = groups.filter((group) => {
      if (group.name.toLowerCase().includes(term)) {
        return true;
      }

      return group.members.some((member) => {
        const memberName = `${member.firstName || ""} ${member.lastName || ""}`.toLowerCase();
        const email = String(member.emailAddress || "").toLowerCase();
        return memberName.includes(term) || email.includes(term);
      });
    });
  }

  return filtered.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
}

function renderGroups() {
  groupListEl.innerHTML = "";
  groupCountEl.textContent = `${state.groups.length} groups`;

  state.groups.forEach((group) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "member-card";

    if (state.selectedGroup && state.selectedGroup.name === group.name) {
      button.classList.add("selected");
    }

    button.innerHTML = `
      <div class="member-title">${group.name}</div>
      <div class="member-meta">
        <span class="status-badge status-active">Active</span>
        ${group.count} member${group.count === 1 ? "" : "s"}
      </div>
    `;

    button.addEventListener("click", () => {
      selectGroup(group.name);
    });

    li.appendChild(button);
    groupListEl.appendChild(li);
  });

  if (state.groups.length === 0) {
    groupListEl.innerHTML = "<li class=\"member-meta\">No satellite groups match this search.</li>";
  }
}

function renderGroupDetails(group) {
  if (!group) {
    groupDetailsEl.classList.add("empty");
    groupDetailsEl.textContent = "No group selected.";
    selectedGroupHintEl.textContent = "Select a group to view members.";
    return;
  }

  groupDetailsEl.classList.remove("empty");
  selectedGroupHintEl.textContent = `${group.name} (${group.count})`;

  const membersMarkup = group.members.map((member) => {
    const fullName = `${member.firstName || ""} ${member.lastName || ""}`.trim();
    return `
      <li>
        <article class="member-card group-member-card">
          <div class="member-title">${fullName || "-"}</div>
          <div class="member-meta"><span class="status-badge status-active">Active</span></div>
          <div class="member-meta member-email">${member.emailAddress || "-"}</div>
          <div class="member-meta">Renewal: ${safeShortDate(member.renewalDate)}</div>
        </article>
      </li>
    `;
  }).join("");

  groupDetailsEl.innerHTML = `
    <div class="detail-section">
      <h4>${group.name}</h4>
      <div class="detail-grid">
        <span>Total members</span><strong>${group.count}</strong>
      </div>
    </div>
    <div class="detail-section">
      <h4>Members</h4>
      <ul class="member-list group-member-list">${membersMarkup || "<li class=\"member-meta\">No members in this group.</li>"}</ul>
    </div>
  `;
}

function selectGroup(groupNameValue) {
  state.selectedGroup = state.groups.find((g) => g.name === groupNameValue) || null;
  renderGroups();
  renderGroupDetails(state.selectedGroup);
}

async function loadGroups() {
  try {
    const fd = new FormData(filtersForm);
    const search = String(fd.get("search") || "").trim();

    const params = new URLSearchParams();
    params.set("status", "active");
    params.set("limit", "500");
    if (search) params.set("search", search);

    const data = await api(`/members?${params.toString()}`);
    state.members = (data.members || []).filter((m) => m.membership_list === true);
    state.groups = buildGroups(state.members, search);

    const selectedName = state.selectedGroup && state.selectedGroup.name;
    if (selectedName) {
      state.selectedGroup = state.groups.find((g) => g.name === selectedName) || null;
    }

    if (!state.selectedGroup && state.groups.length > 0) {
      state.selectedGroup = state.groups[0];
    }

    renderGroups();
    renderGroupDetails(state.selectedGroup);
  } catch (error) {
    showToast(error.message, true);
  }
}

filtersForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadGroups();
});

let searchTimer;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    await loadGroups();
  }, 320);
});

document.getElementById("searchInput").addEventListener("search", async () => {
  await loadGroups();
});

loadGroups();
