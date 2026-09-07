const titleMap = {
  dashboard: "Dashboard",
  submit: "Setor Dokumentasi",
  gallery: "Galeri",
  orders: "Pesanan Medsos",
  success: "Tersimpan",
  detail: "Detail Aktivitas"
};

const config = window.SI_ALIF_CONFIG || {};
const API_BASE_URL = String(config.API_BASE_URL || "").replace(/\/$/, "");

let activities = [];
let selectedFiles = [];
let coordinates = null;
let backendOnline = false;
let telegramConfigured = false;
let adminDeleteConfigured = false;
let adminToken = sessionStorage.getItem("si-alif-admin-token") || "";
let apiPin = localStorage.getItem("si-alif-api-pin") || "";
let lastSubmittedActivityId = null;
let currentDetailActivityId = null;
let galleryActivityId = "";
let galleryFiles = [];
let gallerySelected = new Set();
let galleryObjectUrls = new Map();
let folderCoverUrls = new Map();
let galleryFolderFilesCache = new Map();
let galleryLoading = false;
let lightboxIndex = -1;
let lightboxObjectUrl = "";
let documentationMode = "new";
let selectedExistingActivityId = "";
let successContext = "new";
let sharedContributionMode = false;
let siAlifTrashItems = [];

const filterState = {
  query: "",
  division: "",
  month: "",
  status: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentView = "dashboard";
let routingReady = false;
let handlingRoute = false;

function routeHash(view, options = {}) {
  const activityId = options.activityId ? encodeURIComponent(String(options.activityId)) : "";
  const galleryFolderId = options.galleryFolderId ? encodeURIComponent(String(options.galleryFolderId)) : "";
  const submitActivityId = options.submitActivityId ? encodeURIComponent(String(options.submitActivityId)) : "";

  if (view === "submit" && submitActivityId) return `#submit/${submitActivityId}`;
  if (view === "gallery" && galleryFolderId) return `#gallery/${galleryFolderId}`;
  if (view === "detail" && activityId) return `#detail/${activityId}`;
  if (view === "success" && activityId) return `#success/${activityId}`;

  const allowed = new Set([
    "dashboard",
    "submit",
    "gallery",
    "orders",
    "success",
    "detail"
  ]);

  return `#${allowed.has(view) ? view : "dashboard"}`;
}

function parseRouteHash() {
  const raw = (window.location.hash || "#dashboard").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  const view = parts[0] || "dashboard";
  const id = parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : "";

  if (view === "submit") {
    return { view: "submit", submitActivityId: id || null };
  }

  if (view === "gallery") {
    return { view: "gallery", galleryFolderId: id || null };
  }

  if (view === "detail" || view === "success") {
    return { view, activityId: id || null };
  }

  if (view === "activities") {
    return { view: "gallery" };
  }

  if (["dashboard", "orders"].includes(view)) {
    return { view };
  }

  return { view: "dashboard" };
}

function showView(view) {
  const target = $(`#view-${view}`);
  if (!target) return false;

  $$(".view").forEach(el => el.classList.remove("active"));
  target.classList.add("active");
  currentView = view;
  $("#pageTitle").textContent = titleMap[view] || "SI ALIF";

  $$(".nav-item, .mobile-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

function navigateTo(view, options = {}) {
  const { replace = false } = options;
  const hash = routeHash(view, options);

  if (window.location.hash === hash) {
    applyRouteFromHash();
    return;
  }

  const state = { siAlifRoute: true };

  if (replace) {
    history.replaceState(state, "", hash);
  } else {
    history.pushState(state, "", hash);
  }

  sessionStorage.setItem("si-alif-route", hash);
  applyRouteFromHash();
}

function switchView(view, options = {}) {
  // Compatibility wrapper for existing SI ALIF code.
  navigateTo(view, options);
}

function renderSuccessForActivity(item) {
  if (!item) return false;

  lastSubmittedActivityId = item.id || null;

  if (successContext === "existing") {
    $("#successEyebrow").textContent = "Bahan ditambahkan";
    $("#successTitle").textContent = "Berhasil gabung ke folder";
    $("#successLead").textContent = "Foto/video tambahan sudah masuk ke kegiatan yang sama. Nggak bikin folder kembar. 💜";
  } else {
    $("#successEyebrow").textContent = "Dokumentasi tersimpan";
    $("#successTitle").textContent = "Berhasil masuk SI ALIF";
    $("#successLead").textContent = "Dokumentasi asli sudah tersimpan rapi di Google Drive. 💜";
  }

  $("#successActivityName").textContent = item.name || "Aktivitas";
  $("#successActivityMeta").textContent = [
    item.division || "-",
    item.place || "-",
    item.date || "-"
  ].join(" • ");
  $("#successPhotoCount").textContent = Number(item.media || item.photos || item.videos || 0);

  const publicationBox = $("#successPublication");
  const publicationText = $("#successPublicationText");
  if (item.publication?.requested) {
    publicationBox.hidden = false;
    publicationText.textContent = [
      publicationTypeLabel(item.publication.type),
      item.publication.requesterName ? `Pemesan: ${item.publication.requesterName}` : "",
      "masuk To Do List"
    ].filter(Boolean).join(" • ");
  } else {
    publicationBox.hidden = true;
  }

  const drive = $("#successDriveLink");
  if (item.folderUrl) {
    drive.href = item.folderUrl;
    drive.hidden = false;
  } else {
    drive.hidden = true;
  }

  showView("success");
  return true;
}

function renderDetailForActivity(item) {
  if (!item) return false;

  currentDetailActivityId = item.id;
  $("#detailName").textContent = item.name || "Aktivitas";
  $("#detailDescription").textContent = item.description || "Belum ada keterangan singkat.";
  $("#detailPhotoCount").textContent = Number(item.photos || 0);
  $("#detailDivision").textContent = item.division || "-";
  $("#detailDate").textContent = item.date || "-";
  $("#detailLocation").textContent = item.place || "-";
  $("#detailStatus").textContent = item.status || "-";
  $("#detailCoordinates").textContent = formatCoordinates(item.coordinates);

  const publicationField = $("#detailPublicationField");
  if (item.publication?.requested) {
    publicationField.hidden = false;
    $("#detailPublication").textContent =
      `${publicationTypeLabel(item.publication.type)} • Pemesan: ${item.publication.requesterName || "-"} • ${publicationStatusLabel(item.publication.status)}`;
  } else {
    publicationField.hidden = true;
  }

  const drive = $("#detailDriveLink");
  if (item.folderUrl) {
    drive.href = item.folderUrl;
    drive.hidden = false;
  } else {
    drive.hidden = true;
  }

  showView("detail");
  return true;
}

function applyRouteFromHash() {
  if (!routingReady || handlingRoute) return;

  handlingRoute = true;

  try {
    const route = parseRouteHash();

    if (route.view === "submit") {
      showView("submit");

      if (route.submitActivityId) {
        applySharedContributionTarget(route.submitActivityId);
      } else {
        clearSharedContributionTarget();
        setDocumentationMode("new");
      }
      return;
    }

    if (route.view === "gallery") {
      showView("gallery");

      if (route.galleryFolderId) {
        openGalleryFolder(route.galleryFolderId, { updateRoute: false });
      } else {
        showGalleryFolders();
      }
      return;
    }

    if (route.view === "detail") {
      const item = activities.find(activity =>
        String(activity.id) === String(route.activityId || "")
      );

      if (item) {
        renderDetailForActivity(item);
      } else if (activities.length) {
        showToast("Aktivitas tidak ditemukan.");
        navigateTo("gallery", { replace: true });
      } else {
        showView("detail");
      }
      return;
    }

    if (route.view === "success") {
      const item = activities.find(activity =>
        String(activity.id) === String(route.activityId || "")
      );

      if (item) {
        renderSuccessForActivity(item);
      } else if (activities.length) {
        navigateTo("dashboard", { replace: true });
      } else {
        showView("success");
      }
      return;
    }

    showView(route.view);
  } finally {
    handlingRoute = false;
    document.body?.classList.remove("route-pending");
  }
}

function initializeRouting() {
  const savedRoute = sessionStorage.getItem("si-alif-route");
  const requestedHash =
    window.location.hash ||
    (savedRoute && savedRoute.startsWith("#") ? savedRoute : "#dashboard");

  routingReady = true;

  if (window.location.hash !== requestedHash) {
    history.replaceState({ siAlifRoute: true }, "", requestedHash);
  } else {
    history.replaceState({ siAlifRoute: true }, "", window.location.href);
  }

  sessionStorage.setItem("si-alif-route", requestedHash);
  applyRouteFromHash();
}

window.addEventListener("popstate", () => {
  if (window.location.hash) {
    sessionStorage.setItem("si-alif-route", window.location.hash);
  }
  applyRouteFromHash();
});

window.addEventListener("hashchange", () => {
  if (window.location.hash) {
    sessionStorage.setItem("si-alif-route", window.location.hash);
  }
  applyRouteFromHash();
});

$$("[data-view]").forEach(button => {
  button.addEventListener("click", () => navigateTo(button.dataset.view));
});

$$("[data-history-back]").forEach(button => {
  button.addEventListener("click", () => {
    const route = parseRouteHash();

    if (route.view === "dashboard") {
      navigateTo("dashboard", { replace: true });
      return;
    }

    history.back();
  });
});

function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function renderActivities(target, list) {
  const box = $(target);
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><p>Belum ada aktivitas yang cocok.</p></div>`;
    return;
  }

  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "activity-row activity-row-clickable";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Buka detail ${item.name}`);

    const driveLink = item.folderUrl
      ? `<a class="drive-link" href="${escapeHtml(item.folderUrl)}" target="_blank" rel="noopener">Buka Drive ↗</a>`
      : "";

    row.innerHTML = `
      <div class="activity-thumb">📷</div>
      <div class="activity-meta">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.division)} • ${escapeHtml(item.place)} • ${escapeHtml(item.date)} • ${escapeHtml(mediaSummary(item))}</span>
        ${item.publication?.requested ? `<em class="activity-order-tag">📣 ${escapeHtml(publicationTypeLabel(item.publication.type))}</em>` : ""}
      </div>
      <div class="activity-side">
        <span class="activity-status ${item.status === "Minim" ? "warn" : ""}">${item.status === "Minim" ? "🟡" : "🟢"} ${escapeHtml(item.status)}</span>
        ${driveLink}
      </div>
    `;

    const open = event => {
      if (event?.target?.closest?.("a")) return;
      navigateTo("gallery", { galleryFolderId: item.id });
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(event);
      }
    });
    box.appendChild(row);
  });
}



function buildContributionLink(activityId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#submit/${encodeURIComponent(String(activityId))}`;
}

async function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const ok = document.execCommand("copy");
  textarea.remove();

  if (!ok) throw new Error("Clipboard tidak tersedia.");
}

async function shareContributionLink(activityId) {
  const item = activities.find(
    activity => String(activity.id) === String(activityId)
  );

  if (!item) {
    showToast("Kegiatan tidak ditemukan.");
    return;
  }

  const url = buildContributionLink(item.id);
  const title = `Tambah dokumentasi — ${item.name}`;
  const text =
    `Tambahkan foto/video dokumentasi untuk kegiatan "${item.name}" melalui SI ALIF.`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("Web Share gagal, fallback ke clipboard:", error);
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      await copyTextFallback(url);
    }

    showToast("Link tambah dokumentasi disalin. Tinggal kirim ke WhatsApp/grup.");
  } catch (error) {
    window.prompt("Salin link tambah dokumentasi:", url);
  }
}

function updateSharedContributionBanner(activityId) {
  const item = activities.find(
    activity => String(activity.id) === String(activityId)
  );

  if (!item) {
    $("#sharedContributionName").textContent = "Memuat kegiatan...";
    $("#sharedContributionMeta").textContent =
      "Menunggu data kegiatan dari SI ALIF.";
    return;
  }

  $("#sharedContributionName").textContent = item.name;
  $("#sharedContributionMeta").textContent =
    `${item.division} • ${item.place} • ${item.date}`;
}

function applySharedContributionTarget(activityId) {
  sharedContributionMode = true;
  selectedExistingActivityId = String(activityId || "");

  setDocumentationMode("existing", selectedExistingActivityId);

  $(".documentation-mode").hidden = true;
  $("#existingActivityChooser").hidden = true;
  $("#sharedContributionBanner").hidden = false;

  updateSharedContributionBanner(selectedExistingActivityId);

  if (activities.length) {
    const exists = activities.some(
      item => String(item.id) === String(selectedExistingActivityId)
    );

    if (!exists) {
      showToast("Kegiatan dari link ini tidak ditemukan.");
      navigateTo("gallery", { replace: true });
    }
  }
}

function clearSharedContributionTarget() {
  sharedContributionMode = false;
  $(".documentation-mode").hidden = false;
  $("#existingActivityChooser").hidden = false;
  $("#sharedContributionBanner").hidden = true;
}

function populateExistingActivitySelect() {
  const select = $("#existingActivitySelect");
  if (!select) return;

  const current = selectedExistingActivityId || select.value;
  select.innerHTML = `<option value="">Pilih folder kegiatan</option>`;

  const eligibleActivities = activities.filter(activityHasMedia);

  eligibleActivities.forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.date} — ${item.name} • ${item.division} • ${item.place}`;
    select.appendChild(option);
  });

  if (current && eligibleActivities.some(item => String(item.id) === String(current))) {
    select.value = current;
  }

  if (!eligibleActivities.length && !sharedContributionMode) {
    const first = select.querySelector("option");
    if (first) first.textContent = "Belum ada kegiatan aktif di Galeri";
  }

  if (sharedContributionMode && selectedExistingActivityId) {
    updateSharedContributionBanner(selectedExistingActivityId);
  }
}

function setDocumentationMode(mode, activityId = "") {
  documentationMode = mode === "existing" ? "existing" : "new";

  $$("[data-dashboard-existing]").forEach(button => {
  button.addEventListener("click", () => {
    clearSharedContributionTarget();
    setDocumentationMode("existing");
    navigateTo("submit");
  });
});

$$("[data-documentation-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.documentationMode === documentationMode);
  });

  const existing = documentationMode === "existing";
  $("#existingActivitySection").hidden = !existing;

  $$(".new-activity-only").forEach(element => {
    element.hidden = existing;
  });

  ["activityName", "division", "activityDate", "locationText"].forEach(id => {
    const field = $(`#${id}`);
    if (field) field.required = !existing;
  });

  $("#existingActivitySelect").required = existing;

  if (activityId) {
    selectedExistingActivityId = String(activityId);
    populateExistingActivitySelect();
    $("#existingActivitySelect").value = selectedExistingActivityId;
  }

  $("#submitDocumentation").textContent = existing
    ? "Tambahkan Bahan"
    : "Kirim Dokumentasi";
}

function openAddMaterialForActivity(activityId) {
  selectedExistingActivityId = String(activityId || "");
  navigateTo("submit", { submitActivityId: selectedExistingActivityId });
}


function renderDashboardOrdersPreview() {
  const box = $("#dashboardOrdersPreview");
  if (!box) return;

  const orders = requestedOrders().slice(0, 3);
  box.innerHTML = "";

  if (!orders.length) {
    box.innerHTML = `
      <div class="dashboard-clear-state">
        <span>✓</span>
        <div>
          <strong>To do list aman.</strong>
          <small>Belum ada pesanan medsos yang menunggu.</small>
        </div>
      </div>
    `;
    return;
  }

  orders.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dashboard-order-row";

    const typeIcon = item.publication?.type === "instagram_reels" ? "▶" : "▧";
    const requester = item.publication?.requesterName || "Pemesan";

    row.innerHTML = `
      <span class="dashboard-order-type">${typeIcon}</span>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(publicationTypeLabel(item.publication?.type))} • ${escapeHtml(requester)}</span>
      </div>
      <span class="dashboard-order-arrow">→</span>
    `;

    row.addEventListener("click", () => navigateTo("orders"));
    box.appendChild(row);
  });
}

function updateDashboardSummary() {
  const galleryActivities = activities.filter(activityHasMedia);
  const totalMedia = galleryActivities.reduce(
    (sum, item) => sum + activityMediaCount(item),
    0
  );
  const activeOrders = requestedOrders().length;

  const orderCount = $("#dashOrderCount");
  const orderLabel = $("#dashOrderLabel");
  const folderCount = $("#dashFolderCount");
  const mediaCount = $("#dashMediaCount");

  if (orderCount) orderCount.textContent = activeOrders;
  if (folderCount) folderCount.textContent = galleryActivities.length;
  if (mediaCount) mediaCount.textContent = totalMedia;

  if (orderLabel) {
    orderLabel.textContent = activeOrders
      ? `${activeOrders} perlu diselesaikan`
      : "tidak ada yang menunggu";
  }

  renderDashboardOrdersPreview();
}

function refreshLists() {
  renderActivities(
    "#recentActivities",
    activities.filter(activityHasMedia).slice(0, 4)
  );
  populateMonthFilters();
  populateExistingActivitySelect();
  syncFilterControls();
  updateDashboardSummary();

  if (currentView === "gallery" && !galleryActivityId) {
    applyGalleryFilters();
  } else {
    updateFilterSummaries();
  }

  renderOrders();
}

function activitySearchText(item) {
  return [
    item.name,
    item.place,
    item.division,
    item.description,
    item.date
  ].filter(Boolean).join(" ").toLowerCase();
}

function activityMonthKey(item) {
  return item.dateIso ? item.dateIso.slice(0, 7) : "";
}

function activityMatchesFilters(item) {
  const query = filterState.query.trim().toLowerCase();

  return (
    (!query || activitySearchText(item).includes(query)) &&
    (!filterState.division || item.division === filterState.division) &&
    (!filterState.month || activityMonthKey(item) === filterState.month) &&
    (!filterState.status || item.status === filterState.status)
  );
}

function getFilteredActivities() {
  return activities.filter(activityMatchesFilters);
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function populateMonthFilters() {
  const monthKeys = [...new Set(
    activities
      .map(activityMonthKey)
      .filter(Boolean)
  )].sort().reverse();

  $$('[data-filter="month"]').forEach(select => {
    const current = filterState.month;
    select.innerHTML = `<option value="">Semua bulan</option>`;

    monthKeys.forEach(key => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = formatMonthLabel(key);
      select.appendChild(option);
    });

    select.value = monthKeys.includes(current) ? current : "";
  });

  if (filterState.month && !monthKeys.includes(filterState.month)) {
    filterState.month = "";
  }
}

function syncFilterControls() {
  $$('[data-filter="query"]').forEach(el => {
    if (el.value !== filterState.query) el.value = filterState.query;
  });
  $$('[data-filter="division"]').forEach(el => {
    if (el.value !== filterState.division) el.value = filterState.division;
  });
  $$('[data-filter="month"]').forEach(el => {
    if (el.value !== filterState.month) el.value = filterState.month;
  });
  $$('[data-filter="status"]').forEach(el => {
    if (el.value !== filterState.status) el.value = filterState.status;
  });
}

function activeFilterCount() {
  return Object.values(filterState).filter(Boolean).length;
}


function activityMediaCount(item) {
  const explicit = Number(item.media || 0);
  if (explicit > 0) return explicit;

  return Number(item.photos || 0) + Number(item.videos || 0);
}

function activityHasMedia(item) {
  return activityMediaCount(item) > 0;
}

function updateFilterSummaries(activityCount = null, mediaCount = null) {
  const filtered = getFilteredActivities();
  const shownActivities = activityCount ?? filtered.length;
  const filters = activeFilterCount();

  const activityResult = $("#activityFilterResult");
  if (activityResult) {
    activityResult.textContent = filters
      ? `${shownActivities} dari ${activities.length} aktivitas • ${filters} filter aktif`
      : `${activities.length} aktivitas`;
  }

  const galleryResult = $("#galleryFilterResult");
  if (galleryResult) {
    const galleryActivities = filtered.filter(activityHasMedia);
    const totalMedia = mediaCount ?? galleryActivities.reduce(
      (sum, item) => sum + activityMediaCount(item),
      0
    );
    const folderCount = activityCount ?? galleryActivities.length;

    galleryResult.textContent = filters
      ? `${folderCount} folder • ${totalMedia} media • ${filters} filter aktif`
      : `${galleryActivities.length} folder • ${totalMedia} media`;
  }
}

function applyActivityFilters() {
  const filtered = getFilteredActivities();
  updateFilterSummaries(filtered.length);
}

function applyGalleryFilters() {
  const filtered = getFilteredActivities().filter(activityHasMedia);
  renderGalleryFolders(filtered);
  updateFilterSummaries(
    filtered.length,
    filtered.reduce((sum, item) => sum + activityMediaCount(item), 0)
  );
}

function applyAllFilters() {
  syncFilterControls();
  applyActivityFilters();
  applyGalleryFilters();
}

$$("[data-filter]").forEach(control => {
  const key = control.dataset.filter;
  const eventName = key === "query" ? "input" : "change";

  control.addEventListener(eventName, event => {
    filterState[key] = event.target.value;
    syncFilterControls();
    applyActivityFilters();
    applyGalleryFilters();
  });
});

$$("[data-filter-reset]").forEach(button => {
  button.addEventListener("click", () => {
    filterState.query = "";
    filterState.division = "";
    filterState.month = "";
    filterState.status = "";
    applyAllFilters();
  });
});


function updateStats() {
  updateDashboardSummary();
}

function setBackendStatus(mode, text) {
  const pill = $("#backendStatus");
  const textEl = $("#backendStatusText");
  const sidebarText = $("#sidebarModeText");

  if (pill) pill.dataset.mode = mode;
  if (textEl) textEl.textContent = text;

  if (sidebarText) {
    if (mode === "online") sidebarText.textContent = "Google Drive • Terhubung";
    else if (mode === "offline") sidebarText.textContent = "Mode lokal • Drive tidak terhubung";
    else sidebarText.textContent = "Memeriksa Google Drive...";
  }
}

async function apiFetch(path, options = {}, canRetryPin = true) {
  if (!API_BASE_URL) throw new Error("API_BASE_URL belum diatur di assets/js/config.js");

  const headers = new Headers(options.headers || {});
  if (apiPin) headers.set("X-SI-ALIF-PIN", apiPin);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 && canRetryPin) {
    const entered = window.prompt("Masukkan PIN SI ALIF untuk terhubung ke Google Drive:", apiPin || "");
    if (entered === null) throw new Error("Akses dibatalkan.");
    apiPin = entered.trim();
    localStorage.setItem("si-alif-api-pin", apiPin);
    return apiFetch(path, options, false);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}


async function apiFetchBlob(path, options = {}, canRetryPin = true) {
  if (!API_BASE_URL) throw new Error("API_BASE_URL belum diatur di assets/js/config.js");

  const headers = new Headers(options.headers || {});
  if (apiPin) headers.set("X-SI-ALIF-PIN", apiPin);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 && canRetryPin) {
    const entered = window.prompt("Masukkan PIN SI ALIF:", apiPin || "");
    if (entered === null) throw new Error("Akses dibatalkan.");
    apiPin = entered.trim();
    localStorage.setItem("si-alif-api-pin", apiPin);
    return apiFetchBlob(path, options, false);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  return response.blob();
}

function formatDate(dateIso) {
  if (!dateIso) return "-";
  const d = new Date(`${dateIso}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(d).replace(/\./g, "");
}

function normalizeRemoteActivity(item) {
  const photos = Number(item.photoCount || 0);
  const videos = Number(item.videoCount || 0);
  const media = Number(item.mediaCount || (photos + videos));

  return {
    id: item.id,
    name: item.name || "Tanpa nama",
    division: item.division || "-",
    place: item.location || "-",
    photos,
    videos,
    media,
    status: photos >= 3 ? "Lengkap" : "Minim",
    date: formatDate(item.date),
    dateIso: item.date || "",
    description: item.description || "",
    coordinates: item.coordinates || null,
    publication: {
      requested: Boolean(item.publication?.requested),
      type: item.publication?.type || "",
      requesterName: item.publication?.requesterName || "",
      note: item.publication?.note || "",
      status: item.publication?.status || "",
      requestedAt: item.publication?.requestedAt || "",
      updatedAt: item.publication?.updatedAt || "",
      notifiedAt: item.publication?.notifiedAt || ""
    },
    folderUrl: item.folderUrl || ""
  };
}

function publicationTypeLabel(type) {
  return type === "instagram_reels" ? "Reels Instagram" : "Post Instagram";
}

function publicationStatusLabel(status) {
  return ({
    baru: "Baru",
    diproses: "Diproses",
    selesai: "Selesai"
  })[status] || "Baru";
}

function mediaSummary(item) {
  const parts = [];
  if (Number(item.photos || 0)) parts.push(`${item.photos} foto`);
  if (Number(item.videos || 0)) parts.push(`${item.videos} video`);
  return parts.length ? parts.join(" • ") : "belum ada media";
}


function formatCoordinates(value) {
  if (!value || typeof value !== "object") return "Tidak disimpan";
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Tidak disimpan";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function openActivityDetail(activityId) {
  const item = activities.find(activity => String(activity.id) === String(activityId));
  if (!item) {
    showToast("Aktivitas tidak ditemukan.");
    return;
  }

  navigateTo("detail", { activityId: item.id });
}

function showSuccessScreen(item) {
  if (!item) {
    navigateTo("dashboard");
    return;
  }

  lastSubmittedActivityId = item.id || null;
  navigateTo("success", { activityId: item.id });
}


function cleanupGalleryObjectUrls() {
  galleryObjectUrls.forEach(url => URL.revokeObjectURL(url));
  galleryObjectUrls.clear();
}

function setGalleryState(kind, title, message) {
  const state = $("#galleryState");
  if (!state) return;

  state.hidden = false;
  const icon = kind === "loading" ? "◌" : kind === "error" ? "!" : "▧";
  state.innerHTML = `
    <div class="empty-icon ${kind === "loading" ? "gallery-spinner" : ""}">${icon}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
  `;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDurationMillis(value) {
  const totalSeconds = Math.round(Number(value || 0) / 1000);
  if (!totalSeconds) return "";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cleanupFolderCoverUrls() {
  folderCoverUrls.forEach(url => URL.revokeObjectURL(url));
  folderCoverUrls.clear();
}

async function getFolderFiles(activityId, force = false) {
  const key = String(activityId);

  if (!force && galleryFolderFilesCache.has(key)) {
    return galleryFolderFilesCache.get(key);
  }

  const result = await apiFetch(`/api/activities/${encodeURIComponent(activityId)}/files`);
  const files = result.files || [];
  galleryFolderFilesCache.set(key, files);
  return files;
}

async function loadFolderCover(activity, img, placeholder) {
  try {
    const files = await getFolderFiles(activity.id);
    const cover = files.find(file => String(file.mimeType || "").startsWith("image/")) || files[0];

    if (!cover) return;

    const blob = await apiFetchBlob(`/api/files/${encodeURIComponent(cover.id)}/thumbnail`);
    const objectUrl = URL.createObjectURL(blob);
    folderCoverUrls.set(String(activity.id), objectUrl);

    img.src = objectUrl;
    img.classList.add("loaded");
    placeholder?.classList.add("has-cover");

    if (String(cover.mimeType || "").startsWith("video/")) {
      placeholder?.classList.add("video-cover");
    }
  } catch (error) {
    console.warn(`Cover ${activity.name} gagal dimuat:`, error.message);
  }
}

function showGalleryFolders() {
  galleryActivityId = "";
  galleryFiles = [];
  gallerySelected.clear();
  cleanupGalleryObjectUrls();

  $("#galleryPhotoView").hidden = true;
  $("#galleryFolderView").hidden = false;
  $("#galleryGrid").innerHTML = "";
  $("#galleryToolbar").hidden = true;

  applyGalleryFilters();
}

function renderGalleryFolders(items) {
  const grid = $("#galleryFolderGrid");
  const state = $("#galleryFolderState");
  if (!grid || !state) return;

  cleanupFolderCoverUrls();
  grid.innerHTML = "";

  const folders = items.filter(activityHasMedia);

  if (!folders.length) {
    state.hidden = false;
    state.querySelector("h3").textContent =
      activeFilterCount() ? "Tidak ada folder yang cocok" : "Belum ada dokumentasi";
    state.querySelector("p").textContent =
      activeFilterCount()
        ? "Coba ubah atau reset filter."
        : "Kegiatan yang memiliki media akan tampil di sini.";
    return;
  }

  state.hidden = true;

  folders.forEach(item => {
    const card = document.createElement("article");
    card.className = "gallery-folder-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Buka folder ${item.name}`);

    card.innerHTML = `
      <div class="gallery-folder-visual">
        <div class="gallery-folder-cover-placeholder">
          <div class="gallery-folder-tab"></div>
          <div class="gallery-folder-icon">▧</div>
        </div>
        <img class="gallery-folder-cover" alt="" loading="lazy">
        <span class="gallery-folder-count">${activityMediaCount(item)} media</span>

        <button
          class="gallery-folder-delete gallery-folder-delete-top"
          type="button"
          title="Hapus folder"
          aria-label="Hapus folder ${escapeHtml(item.name)}"
          data-delete-folder="${escapeHtml(item.id)}"
        >🗑</button>
      </div>

      <div class="gallery-folder-content">
        <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.division)} • ${escapeHtml(item.date)}</span>
        <span class="gallery-folder-location">📍 ${escapeHtml(item.place || "-")}</span>
      </div>

      <div class="gallery-folder-footer">
        <span class="activity-status ${item.status === "Minim" ? "warn" : ""}">
          ${item.status === "Minim" ? "🟡" : "🟢"} ${escapeHtml(item.status)}
        </span>
        <div class="gallery-folder-footer-actions">
          <button
            class="gallery-folder-share"
            type="button"
            title="Bagikan link tambah dokumentasi"
            aria-label="Bagikan link tambah dokumentasi ${escapeHtml(item.name)}"
            data-share-folder="${escapeHtml(item.id)}"
          >🔗 Bagikan</button>
          <span class="gallery-folder-open">Buka →</span>
        </div>
      </div>
    `;

    const open = () => navigateTo("gallery", { galleryFolderId: item.id });

    card.addEventListener("click", event => {
      if (event.target.closest("[data-delete-folder], [data-share-folder]")) return;
      open();
    });

    card.addEventListener("keydown", event => {
      if (event.target.closest?.("[data-delete-folder], [data-share-folder]")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    const deleteButton = card.querySelector("[data-delete-folder]");
    deleteButton.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await deleteGalleryFolderById(item.id, deleteButton);
    });

    const shareButton = card.querySelector("[data-share-folder]");
    shareButton.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await shareContributionLink(item.id);
    });

    grid.appendChild(card);

    loadFolderCover(
      item,
      card.querySelector(".gallery-folder-cover"),
      card.querySelector(".gallery-folder-cover-placeholder")
    );
  });
}

function updateGallerySelectionUi() {
  const count = gallerySelected.size;
  $("#gallerySelectedCount").textContent = count;
  $("#galleryDownloadSelected").disabled = count === 0;
  $("#gallerySelectAll").textContent =
    galleryFiles.length > 0 && count === galleryFiles.length ? "Semua Dipilih" : "Pilih Semua";

  $$(".gallery-card").forEach(card => {
    const selected = gallerySelected.has(card.dataset.fileId);
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-checked", String(selected));
    const checkbox = card.querySelector(".gallery-check");
    if (checkbox) {
      checkbox.textContent = selected ? "✓" : "";
      checkbox.classList.toggle("selected", selected);
      checkbox.setAttribute("aria-pressed", String(selected));
    }
  });
}

function toggleGalleryFile(fileId) {
  if (gallerySelected.has(fileId)) gallerySelected.delete(fileId);
  else gallerySelected.add(fileId);
  updateGallerySelectionUi();
}

async function loadGalleryThumbnail(file, img) {
  try {
    const blob = await apiFetchBlob(`/api/files/${encodeURIComponent(file.id)}/thumbnail`);
    const objectUrl = URL.createObjectURL(blob);
    galleryObjectUrls.set(file.id, objectUrl);
    img.src = objectUrl;
    img.classList.add("loaded");
  } catch (error) {
    img.alt = "Thumbnail gagal dimuat";
    img.closest(".gallery-photo-frame")?.classList.add("thumbnail-error");
  }
}


function closeMediaLightbox() {
  const box = $("#mediaLightbox");
  if (!box) return;

  box.hidden = true;
  document.body.classList.remove("lightbox-open");

  if (lightboxObjectUrl) {
    URL.revokeObjectURL(lightboxObjectUrl);
    lightboxObjectUrl = "";
  }

  $("#lightboxStage").innerHTML = "";
  lightboxIndex = -1;
}

async function renderMediaLightbox() {
  const file = galleryFiles[lightboxIndex];
  if (!file) {
    closeMediaLightbox();
    return;
  }

  const box = $("#mediaLightbox");
  const stage = $("#lightboxStage");
  box.hidden = false;
  document.body.classList.add("lightbox-open");

  $("#lightboxFileName").textContent = file.name || "Media";

  const meta = [
    String(file.mimeType || "").startsWith("video/") ? "🎬 Video" : "📷 Foto",
    file.width && file.height ? `${file.width}×${file.height}` : "",
    file.durationMillis ? formatDurationMillis(file.durationMillis) : "",
    formatFileSize(file.size)
  ].filter(Boolean).join(" • ");

  $("#lightboxFileMeta").textContent = meta || "Media";
  $("#lightboxDrive").href = file.driveUrl || "#";
  $("#lightboxPrev").disabled = galleryFiles.length <= 1;
  $("#lightboxNext").disabled = galleryFiles.length <= 1;

  if (lightboxObjectUrl) {
    URL.revokeObjectURL(lightboxObjectUrl);
    lightboxObjectUrl = "";
  }

  stage.innerHTML = `
    <div class="media-lightbox-loading">
      <span class="gallery-spinner">◌</span>
      <small>Memuat media asli...</small>
    </div>
  `;

  try {
    const blob = await apiFetchBlob(`/api/files/${encodeURIComponent(file.id)}/download`);
    lightboxObjectUrl = URL.createObjectURL(blob);

    if (String(file.mimeType || "").startsWith("video/")) {
      stage.innerHTML = `
        <video class="lightbox-video" controls playsinline preload="metadata">
          <source src="${lightboxObjectUrl}" type="${escapeHtml(file.mimeType || "video/mp4")}">
        </video>
      `;
    } else {
      stage.innerHTML = `<img class="lightbox-image" src="${lightboxObjectUrl}" alt="${escapeHtml(file.name)}">`;
    }
  } catch (error) {
    stage.innerHTML = `
      <div class="media-lightbox-error">
        <strong>Media gagal dimuat</strong>
        <span>${escapeHtml(error.message)}</span>
      </div>
    `;
  }
}

function openMediaLightbox(index) {
  if (!galleryFiles[index]) return;
  lightboxIndex = index;
  renderMediaLightbox();
}

function moveMediaLightbox(step) {
  if (!galleryFiles.length || lightboxIndex < 0) return;
  lightboxIndex = (lightboxIndex + step + galleryFiles.length) % galleryFiles.length;
  renderMediaLightbox();
}

async function downloadLightboxMedia() {
  const file = galleryFiles[lightboxIndex];
  if (!file) return;

  const button = $("#lightboxDownload");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Mengunduh...";

  try {
    const blob = await apiFetchBlob(`/api/files/${encodeURIComponent(file.id)}/download`);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = file.name || "media";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch (error) {
    showToast(`Download gagal: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function deleteLightboxMedia() {
  const file = galleryFiles[lightboxIndex];
  if (!file) return;

  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  const ok = window.confirm(
    `Hapus "${file.name}" dari folder ini?\n\nMedia akan dipindahkan ke Trash Google Drive dan bisa dihapus permanen lewat "Kosongkan Trash SI ALIF".`
  );
  if (!ok) return;

  const button = $("#lightboxDelete");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Menghapus...";

  try {
    await adminApiFetch(`/api/files/${encodeURIComponent(file.id)}`, {
      method: "DELETE"
    });

    galleryFolderFilesCache.delete(String(galleryActivityId));
    galleryFiles.splice(lightboxIndex, 1);
    await loadActivitiesFromApi();

    if (!galleryFiles.length) {
      closeMediaLightbox();
      renderGalleryPhotos();
      showToast("Media dihapus. Folder sekarang kosong.");
      return;
    }

    if (lightboxIndex >= galleryFiles.length) {
      lightboxIndex = galleryFiles.length - 1;
    }

    renderGalleryPhotos();
    await renderMediaLightbox();
    showToast("Media dipindahkan ke Trash SI ALIF.");
  } catch (error) {
    showToast(`Gagal menghapus media: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}


async function deleteGalleryMediaById(file, button) {
  if (!file?.id) return;

  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  const ok = window.confirm(
    `Hapus "${file.name}" dari folder ini?\n\nMedia akan dipindahkan ke Trash Google Drive dan bisa dihapus permanen lewat "Kosongkan Trash SI ALIF".`
  );
  if (!ok) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "…";

  try {
    await adminApiFetch(`/api/files/${encodeURIComponent(file.id)}`, {
      method: "DELETE"
    });

    galleryFolderFilesCache.delete(String(galleryActivityId));
    galleryFiles = galleryFiles.filter(item => String(item.id) !== String(file.id));
    gallerySelected.delete(file.id);

    await loadActivitiesFromApi();
    renderGalleryPhotos();

    showToast(`"${file.name}" masuk Trash SI ALIF. Masih bisa dipulihkan.`);
  } catch (error) {
    showToast(`Gagal menghapus media: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}

function createGalleryCard(file, index) {
  const card = document.createElement("article");
  card.className = "gallery-card gallery-card-preview";
  card.dataset.fileId = file.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Preview ${file.name}`);

  const dimension = file.width && file.height ? `${file.width}×${file.height}` : "";
  const isVideo = String(file.mimeType || "").startsWith("video/");
  const detail = [
    isVideo ? "🎬 Video" : "📷 Foto",
    dimension,
    isVideo && file.durationMillis ? formatDurationMillis(file.durationMillis) : "",
    formatFileSize(file.size)
  ].filter(Boolean).join(" • ");

  card.innerHTML = `
    <div class="gallery-photo-frame">
      <div class="gallery-image-skeleton">SI</div>
      <img alt="${escapeHtml(file.name)}" loading="lazy">
      ${isVideo ? `<span class="gallery-video-badge">▶ VIDEO</span>` : ""}
      <button class="gallery-check" type="button" aria-label="Pilih ${escapeHtml(file.name)}"></button>
      <button
        class="gallery-media-delete"
        type="button"
        title="Hapus media"
        aria-label="Hapus ${escapeHtml(file.name)}"
      >🗑</button>
      <span class="gallery-preview-hint">Lihat</span>
    </div>
    <div class="gallery-card-info">
      <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
      <span>${escapeHtml(detail || "Media")}</span>
    </div>
  `;

  card.addEventListener("click", event => {
    if (event.target.closest(".gallery-check, .gallery-media-delete")) return;
    openMediaLightbox(index);
  });

  card.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      openMediaLightbox(index);
    }
  });

  const check = card.querySelector(".gallery-check");
  check.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleGalleryFile(file.id);
  });

  const deleteButton = card.querySelector(".gallery-media-delete");
  deleteButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    await deleteGalleryMediaById(file, deleteButton);
  });

  loadGalleryThumbnail(file, card.querySelector("img"));
  return card;
}

function renderGalleryPhotos() {
  const grid = $("#galleryGrid");
  grid.innerHTML = "";
  cleanupGalleryObjectUrls();
  gallerySelected.clear();

  if (!galleryFiles.length) {
    $("#galleryToolbar").hidden = true;
    setGalleryState("empty", "Folder ini kosong", "Belum ada file foto di aktivitas ini.");
    return;
  }

  $("#galleryState").hidden = true;
  $("#galleryToolbar").hidden = false;

  galleryFiles.forEach((file, index) => {
    grid.appendChild(createGalleryCard(file, index));
  });

  updateGallerySelectionUi();
}

async function openGalleryFolder(activityId, options = {}) {
  const { updateRoute = true } = options;

  if (updateRoute) {
    navigateTo("gallery", { galleryFolderId: activityId });
    return;
  }

  const activity = activities.find(item => String(item.id) === String(activityId));

  if (!activity) {
    // Saat refresh deep-link, route dibaca sebelum daftar aktivitas selesai
    // diambil dari Drive. Tampilkan folder loading dulu; loadActivitiesFromApi()
    // akan menjalankan route ini lagi setelah data tersedia.
    if (!activities.length) {
      galleryActivityId = String(activityId);
      $("#galleryFolderView").hidden = true;
      $("#galleryPhotoView").hidden = false;
      $("#galleryToolbar").hidden = true;
      $("#galleryGrid").innerHTML = "";
      $("#galleryFolderName").textContent = "Membuka aktivitas...";
      $("#galleryFolderMeta").textContent = "Mengambil data kegiatan dari Google Drive";
      $("#galleryFolderDriveLink").hidden = true;
      setGalleryState("loading", "Membuka folder...", "Menunggu data aktivitas.");
      return;
    }

    showToast("Aktivitas tidak ditemukan.");
    navigateTo("gallery", { replace: true });
    return;
  }

  galleryActivityId = String(activity.id);
  galleryFiles = [];
  gallerySelected.clear();
  cleanupGalleryObjectUrls();

  $("#galleryFolderView").hidden = true;
  $("#galleryPhotoView").hidden = false;
  $("#galleryToolbar").hidden = true;
  $("#galleryGrid").innerHTML = "";

  $("#galleryFolderName").textContent = activity.name || "Aktivitas";
  $("#galleryFolderMeta").textContent =
    `${activity.division} • ${activity.place} • ${activity.date} • ${mediaSummary(activity)}`;

  const drive = $("#galleryFolderDriveLink");
  if (activity.folderUrl) {
    drive.href = activity.folderUrl;
    drive.hidden = false;
  } else {
    drive.hidden = true;
  }

  setGalleryState("loading", "Membuka folder...", "Mengambil thumbnail dari Google Drive.");

  try {
    galleryFiles = await getFolderFiles(activity.id);
    renderGalleryPhotos();
  } catch (error) {
    setGalleryState("error", "Folder gagal dibuka", error.message);
  }
}

function openActivityGallery(activityId) {
  navigateTo("gallery", { galleryFolderId: activityId });
}

async function downloadGalleryFile(file, index, total) {
  const button = $("#galleryDownloadSelected");
  button.textContent = `↓ Mengunduh ${index}/${total}...`;

  const blob = await apiFetchBlob(`/api/files/${encodeURIComponent(file.id)}/download`);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.name || `foto-${index}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

async function downloadSelectedGalleryFiles() {
  const chosen = galleryFiles.filter(file => gallerySelected.has(file.id));
  if (!chosen.length) return;

  const button = $("#galleryDownloadSelected");
  const original = button.textContent;
  button.disabled = true;

  try {
    for (let i = 0; i < chosen.length; i++) {
      await downloadGalleryFile(chosen[i], i + 1, chosen.length);
      if (chosen.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    showToast(`${chosen.length} file dikirim ke download browser.`);
  } catch (error) {
    showToast(`Download gagal: ${error.message}`);
  } finally {
    button.textContent = original;
    button.disabled = false;
    updateGallerySelectionUi();
  }
}




function closeEditActivityModal() {
  $("#editActivityModal").hidden = true;
  document.body.classList.remove("edit-modal-open");
}

async function openEditActivityModal() {
  const item = activities.find(
    activity => String(activity.id) === String(galleryActivityId)
  );

  if (!item) {
    showToast("Kegiatan tidak ditemukan.");
    return;
  }

  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  $("#editActivityName").value = item.name || "";
  $("#editActivityDivision").value = item.division || "";
  $("#editActivityDate").value = item.dateIso || "";
  $("#editActivityLocation").value = item.place || "";
  $("#editActivityDescription").value = item.description || "";

  $("#editActivityModal").hidden = false;
  document.body.classList.add("edit-modal-open");
}

async function saveEditedActivity(event) {
  event.preventDefault();

  const item = activities.find(
    activity => String(activity.id) === String(galleryActivityId)
  );
  if (!item) return;

  const payload = {
    name: $("#editActivityName").value.trim(),
    division: $("#editActivityDivision").value,
    date: $("#editActivityDate").value,
    location: $("#editActivityLocation").value.trim(),
    description: $("#editActivityDescription").value.trim()
  };

  if (!payload.name || !payload.division || !payload.date || !payload.location) {
    showToast("Nama, bidang, tanggal, dan lokasi wajib diisi.");
    return;
  }

  const button = $("#saveActivityInfo");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Menyimpan...";

  try {
    await adminApiFetch(`/api/activities/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    await loadActivitiesFromApi();
    closeEditActivityModal();

    const updated = activities.find(
      activity => String(activity.id) === String(item.id)
    );

    if (updated) {
      $("#galleryFolderName").textContent = updated.name;
      $("#galleryFolderMeta").textContent =
        `${updated.division} • ${updated.place} • ${updated.date} • ${mediaSummary(updated)}`;
    }

    showToast("Info kegiatan diperbarui.");
  } catch (error) {
    showToast(`Gagal menyimpan perubahan: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function ensureAdminUnlock() {
  if (!adminDeleteConfigured) {
    showToast("ADMIN_DELETE_PIN belum dikonfigurasi di Worker.");
    return false;
  }

  if (adminToken) return true;

  const pin = window.prompt("Masukkan PIN admin SI ALIF:");
  if (pin === null) return false;

  try {
    const result = await apiFetch("/api/admin/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin.trim() })
    });

    adminToken = result.token || "";
    if (!adminToken) throw new Error("Token admin tidak diterima.");

    sessionStorage.setItem("si-alif-admin-token", adminToken);
    showToast("Admin Unlock aktif untuk sesi ini.");
    return true;
  } catch (error) {
    adminToken = "";
    sessionStorage.removeItem("si-alif-admin-token");
    showToast(error.message || "PIN admin salah.");
    return false;
  }
}

async function adminApiFetch(path, options = {}) {
  const unlocked = await ensureAdminUnlock();
  if (!unlocked) throw new Error("Admin belum dibuka.");

  const headers = new Headers(options.headers || {});
  headers.set("X-SI-ALIF-Admin", adminToken);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 403) {
    adminToken = "";
    sessionStorage.removeItem("si-alif-admin-token");
  }

  let payload = {};
  try { payload = await response.json(); } catch (_) {}

  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function deleteGalleryFolderById(activityId, button) {
  const item = activities.find(activity => String(activity.id) === String(activityId));
  if (!item) {
    showToast("Folder kegiatan tidak ditemukan.");
    return;
  }

  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  const ok = window.confirm(
    `Hapus folder "${item.name}" dari Galeri SI ALIF?\n\nFolder beserta seluruh foto/video di dalamnya akan dipindahkan ke Trash Google Drive.`
  );
  if (!ok) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "…";

  try {
    await adminApiFetch(`/api/activities/${encodeURIComponent(item.id)}`, {
      method: "DELETE"
    });

    galleryFolderFilesCache.delete(String(item.id));
    await loadActivitiesFromApi();
    showToast(`"${item.name}" masuk Trash SI ALIF. Masih bisa dipulihkan.`);
  } catch (error) {
    showToast(`Gagal menghapus: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}


function formatTrashDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function closeSiAlifTrash() {
  $("#siAlifTrashModal").hidden = true;
  document.body.classList.remove("trash-modal-open");
}

function renderSiAlifTrash() {
  const list = $("#siAlifTrashList");
  const empty = $("#siAlifTrashEmpty");
  const count = $("#siAlifTrashCount");
  const emptyButton = $("#emptySiAlifTrash");

  list.innerHTML = "";
  count.textContent = `${siAlifTrashItems.length} item`;
  empty.hidden = siAlifTrashItems.length > 0;
  emptyButton.disabled = siAlifTrashItems.length === 0;

  if (!siAlifTrashItems.length) return;

  siAlifTrashItems.forEach(item => {
    const row = document.createElement("article");
    row.className = `trash-item trash-item-${item.kind}`;

    const isActivity = item.kind === "activity";
    const isVideo = String(item.mimeType || "").startsWith("video/");

    const icon = isActivity ? "▧" : (isVideo ? "▶" : "▦");

    const detail = isActivity
      ? [
          item.division || "",
          item.date || "",
          item.location || "",
          `${Number(item.mediaCount || 0)} media`
        ].filter(Boolean).join(" • ")
      : [
          isVideo ? "Video" : "Foto",
          formatFileSize(item.size),
          `dari ${item.activityName || "kegiatan"}`
        ].filter(Boolean).join(" • ");

    row.innerHTML = `
      <div class="trash-item-icon">${icon}</div>

      <div class="trash-item-main">
        <div class="trash-item-title">
          <strong>${escapeHtml(item.name || "Item SI ALIF")}</strong>
          <span>${isActivity ? "Folder kegiatan" : "Media"}</span>
        </div>

        <p>${escapeHtml(detail || "-")}</p>
        ${item.modifiedAt ? `<small>Masuk/berubah di Trash • ${escapeHtml(formatTrashDate(item.modifiedAt))}</small>` : ""}
        ${!item.canRestore ? `<small class="trash-warning">Folder asal sudah tidak tersedia — hanya bisa dihapus permanen.</small>` : ""}
      </div>

      <div class="trash-item-actions">
        <button
          class="secondary trash-restore"
          type="button"
          data-trash-restore="${escapeHtml(item.id)}"
          ${item.canRestore ? "" : "disabled"}
        >↩ Pulihkan</button>

        <button
          class="danger-ghost trash-delete-permanent"
          type="button"
          data-trash-delete="${escapeHtml(item.id)}"
        >Hapus Permanen</button>
      </div>
    `;

    row.querySelector("[data-trash-restore]")?.addEventListener("click", async event => {
      await restoreTrashItem(item, event.currentTarget);
    });

    row.querySelector("[data-trash-delete]")?.addEventListener("click", async event => {
      await deleteTrashItemPermanently(item, event.currentTarget);
    });

    list.appendChild(row);
  });
}

async function loadSiAlifTrash() {
  const list = $("#siAlifTrashList");
  list.innerHTML = `
    <div class="trash-loading">
      <span class="gallery-spinner">◌</span>
      <small>Mengecek Trash SI ALIF...</small>
    </div>
  `;
  $("#siAlifTrashEmpty").hidden = true;

  try {
    const result = await adminApiFetch("/api/admin/trash");
    siAlifTrashItems = result.items || [];
    renderSiAlifTrash();
  } catch (error) {
    list.innerHTML = `
      <div class="trash-load-error">
        <strong>Trash gagal dimuat</strong>
        <small>${escapeHtml(error.message)}</small>
      </div>
    `;
    showToast(`Gagal membuka Trash: ${error.message}`);
  }
}

async function openSiAlifTrash() {
  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  $("#siAlifTrashModal").hidden = false;
  document.body.classList.add("trash-modal-open");
  await loadSiAlifTrash();
}

async function restoreTrashItem(item, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Memulihkan...";

  try {
    const result = await adminApiFetch("/api/admin/trash/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        id: item.id
      })
    });

    if (result.activityId) {
      galleryFolderFilesCache.delete(String(result.activityId));
    }
    if (item.kind === "activity") {
      galleryFolderFilesCache.delete(String(item.id));
    }

    await loadActivitiesFromApi();
    await loadSiAlifTrash();

    showToast(
      item.kind === "activity"
        ? `"${item.name}" balik ke Galeri.`
        : `"${item.name}" balik ke folder kegiatannya.`
    );
  } catch (error) {
    showToast(`Gagal memulihkan: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}

async function deleteTrashItemPermanently(item, button) {
  const ok = window.confirm(
    `Hapus "${item.name}" PERMANEN?\n\nSetelah ini item tidak bisa dipulihkan lagi.`
  );
  if (!ok) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Menghapus...";

  try {
    await adminApiFetch("/api/admin/trash/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        id: item.id
      })
    });

    siAlifTrashItems = siAlifTrashItems.filter(
      candidate =>
        !(candidate.kind === item.kind && String(candidate.id) === String(item.id))
    );
    renderSiAlifTrash();

    showToast(`"${item.name}" dihapus permanen.`);
  } catch (error) {
    showToast(`Gagal menghapus permanen: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}

async function emptyTrashSiAlif() {
  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  if (!siAlifTrashItems.length) {
    showToast("Trash SI ALIF sudah kosong.");
    return;
  }

  const ok = window.confirm(
    `Kosongkan Trash SI ALIF?\n\n${siAlifTrashItems.length} item SI ALIF akan dihapus PERMANEN. File lain di Trash Google Drive tidak disentuh.`
  );
  if (!ok) return;

  const really = window.confirm(
    "Ini tidak bisa dibatalkan. Yakin mau menghapus permanen semuanya?"
  );
  if (!really) return;

  const button = $("#emptySiAlifTrash");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Mengosongkan...";

  try {
    const result = await adminApiFetch("/api/admin/trash/empty", {
      method: "POST"
    });

    siAlifTrashItems = [];
    renderSiAlifTrash();

    showToast(
      result.deletedCount
        ? `${result.deletedCount} item SI ALIF dihapus permanen.`
        : "Trash SI ALIF sudah kosong."
    );
  } catch (error) {
    showToast(`Gagal mengosongkan Trash: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function requestedOrders() {
  return activities.filter(item =>
    item.publication?.requested &&
    (item.publication.status || "baru") !== "selesai" &&
    (item.publication.status || "baru") !== "dihapus"
  );
}

function renderOrders() {
  const box = $("#ordersList");
  if (!box) return;

  const orders = requestedOrders();
  const activeCount = orders.length;

  $("#orderCountActive").textContent = activeCount;

  const navCount = $("#ordersNavCount");
  const mobileCount = $("#ordersMobileCount");
  [navCount, mobileCount].forEach(el => {
    if (!el) return;
    el.textContent = activeCount;
    el.hidden = activeCount === 0;
  });

  box.innerHTML = "";

  if (!orders.length) {
    box.innerHTML = `
      <div class="orders-empty">
        <div>✓</div>
        <strong>To do list kosong</strong>
        <span>Pesanan yang selesai atau dihapus otomatis hilang dari sini.</span>
      </div>
    `;
    return;
  }

  orders.forEach(item => {
    const card = document.createElement("article");
    card.className = "order-card order-baru";

    card.innerHTML = `
      <div class="order-card-top">
        <div class="order-type-icon">${item.publication.type === "instagram_reels" ? "▶" : "▧"}</div>
        <div class="order-main">
          <div class="order-badges">
            <span class="order-type">${escapeHtml(publicationTypeLabel(item.publication.type))}</span>
          </div>
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(item.division)} • ${escapeHtml(item.place)} • ${escapeHtml(item.date)}</p>
        </div>
      </div>

      <div class="order-requester">
        <span>👤 Pemesan</span>
        <strong>${escapeHtml(item.publication.requesterName || "-")}</strong>
      </div>

      <div class="order-media-line">
        <span>📎 ${escapeHtml(mediaSummary(item))}</span>
        ${item.publication.notifiedAt ? `<span>🤖 bot terkirim</span>` : ""}
      </div>

      ${item.publication.note ? `
        <div class="order-note">
          <span>Catatan</span>
          <p>${escapeHtml(item.publication.note)}</p>
        </div>
      ` : ""}

      <div class="order-actions">
        <button class="secondary order-gallery-action" data-order-gallery="${escapeHtml(item.id)}">▧ Buka Bahan</button>
        ${item.folderUrl ? `<a class="button-link" href="${escapeHtml(item.folderUrl)}" target="_blank" rel="noopener">Drive ↗</a>` : ""}
        <button class="danger-ghost order-remove-action" data-order-remove="${escapeHtml(item.id)}">Hapus Pesanan</button>
        <button class="primary order-complete-action" data-order-complete="${escapeHtml(item.id)}">✓ Sudah selesai dibuat</button>
      </div>
    `;

    box.appendChild(card);
  });

  $$(".order-complete-action").forEach(button => {
    button.addEventListener("click", async () => {
      const item = activities.find(activity => String(activity.id) === String(button.dataset.orderComplete));
      if (!item) return;

      const ok = window.confirm(
        `Tandai pesanan "${item.name}" sudah selesai dibuat?\n\nPesanan akan langsung hilang dari To Do List.`
      );
      if (!ok) return;

      await completeOrder(item.id, button);
    });
  });

  $$(".order-remove-action").forEach(button => {
    button.addEventListener("click", async () => {
      const item = activities.find(activity => String(activity.id) === String(button.dataset.orderRemove));
      if (!item) return;

      const ok = window.confirm(
        `Hapus "${item.name}" dari daftar Pesanan Medsos?\n\nAktivitas dan file Drive TIDAK akan dihapus.`
      );
      if (!ok) return;

      await removeOrder(item.id, button);
    });
  });

  $$(".order-gallery-action").forEach(button => {
    button.addEventListener("click", () => {
      navigateTo("gallery", { galleryFolderId: button.dataset.orderGallery });
    });
  });
}

async function completeOrder(activityId, button) {
  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Menyimpan...";

  try {
    await adminApiFetch(`/api/activities/${encodeURIComponent(activityId)}/publication`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "selesai" })
    });

    await loadActivitiesFromApi();
    showToast("Pesanan selesai dan dihapus dari To Do List.");
  } catch (error) {
    showToast(`Gagal menyelesaikan pesanan: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}

async function removeOrder(activityId, button) {
  const unlocked = await ensureAdminUnlock();
  if (!unlocked) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Menghapus...";

  try {
    await adminApiFetch(`/api/activities/${encodeURIComponent(activityId)}/publication`, {
      method: "DELETE"
    });

    await loadActivitiesFromApi();
    showToast("Pesanan dihapus dari daftar.");
  } catch (error) {
    showToast(`Gagal menghapus pesanan: ${error.message}`);
    button.disabled = false;
    button.textContent = original;
  }
}


function updateBotStatus() {
  const box = $("#botStatus");
  if (!box) return;

  box.classList.toggle("online", telegramConfigured);
  box.innerHTML = telegramConfigured
    ? `<span class="bot-dot"></span><div><strong>Bot aktif</strong><small>Pesanan baru akan dikirim ke Telegram.</small></div>`
    : `<span class="bot-dot"></span><div><strong>Bot belum aktif</strong><small>Antrean tetap tersimpan di SI ALIF.</small></div>`;
}

async function checkBackend() {
  if (!API_BASE_URL) {
    backendOnline = false;
    setBackendStatus("offline", "API belum diatur");
    refreshLists();
    return;
  }

  try {
    const health = await apiFetch("/health", {}, false);
    backendOnline = true;
    telegramConfigured = Boolean(health.telegramConfigured);
    adminDeleteConfigured = Boolean(health.adminDeleteConfigured);
    updateBotStatus();
    setBackendStatus("online", "Google Drive terhubung");
    await loadActivitiesFromApi();
  } catch (error) {
    backendOnline = false;
    telegramConfigured = false;
    updateBotStatus();
    setBackendStatus("offline", "Mode lokal");
    console.warn("SI ALIF backend offline:", error.message);
    activities = JSON.parse(localStorage.getItem("si-alif-activities") || "null") || [];
    refreshLists();
  }
}

async function loadActivitiesFromApi() {
  const result = await apiFetch("/api/activities");
  activities = (result.activities || []).map(normalizeRemoteActivity);
  refreshLists();

  if (routingReady) {
    applyRouteFromHash();
  }
}


function syncPublicationUi() {
  const mode = document.querySelector('input[name="publicationMode"]:checked')?.value || "documentation";
  const requested = mode === "request";
  $("#publicationOptions").hidden = !requested;

  $$(".publication-choice").forEach(label => {
    label.classList.toggle("active", label.querySelector("input")?.checked);
  });

  $$(".publication-type").forEach(label => {
    label.classList.toggle("active", label.querySelector("input")?.checked);
  });
}

$$('input[name="publicationMode"], input[name="publicationType"]').forEach(input => {
  input.addEventListener("change", syncPublicationUi);
});

syncPublicationUi();

const today = new Date();
$("#activityDate").value = today.toISOString().slice(0, 10);

$("#gpsButton").addEventListener("click", () => {
  const status = $("#gpsStatus");
  if (!navigator.geolocation) {
    status.textContent = "Perangkat/browser tidak mendukung geolocation.";
    return;
  }

  status.textContent = "Mengambil lokasi...";
  navigator.geolocation.getCurrentPosition(
    pos => {
      coordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      status.textContent = `GPS tersimpan: ${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`;
      if (!$("#locationText").value) {
        $("#locationText").value = `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`;
      }
    },
    err => {
      status.textContent = `GPS gagal: ${err.message}`;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

$("#photoInput").addEventListener("change", event => {
  selectedFiles = [...event.target.files];
  const grid = $("#previewGrid");
  grid.innerHTML = "";
  document.querySelector(".direct-video-note")?.remove();

  selectedFiles.slice(0, 15).forEach(file => {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("video/")) {
      const wrap = document.createElement("div");
      wrap.className = "preview-video";
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      wrap.appendChild(video);

      const badge = document.createElement("span");
      badge.textContent = "▶ VIDEO";
      wrap.appendChild(badge);
      grid.appendChild(wrap);
    } else {
      const img = document.createElement("img");
      img.alt = file.name;
      img.src = url;
      grid.appendChild(img);
    }
  });

  if (selectedFiles.length > 15) {
    const more = document.createElement("div");
    more.className = "activity-thumb";
    more.textContent = `+${selectedFiles.length - 15}`;
    grid.appendChild(more);
  }

  const videoCount = selectedFiles.filter(file => file.type.startsWith("video/")).length;
  if (videoCount) {
    const note = document.createElement("div");
    note.className = "direct-video-note";
    note.innerHTML = `<strong>🎬 ${videoCount} video</strong><span>Video akan dikirim bertahap per chunk agar lebih stabil.</span>`;
    grid.insertAdjacentElement("afterend", note);
  }
});

function setUploadProgress(done, total, text) {
  const box = $("#uploadProgress");
  const value = total ? Math.round((done / total) * 100) : 0;
  box.hidden = false;
  $("#uploadProgressText").textContent = text;
  $("#uploadProgressValue").textContent = `${value}%`;
  $("#uploadProgressBar").style.width = `${value}%`;
}

function setUploadProgressPercent(percent, text) {
  const box = $("#uploadProgress");
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));

  box.hidden = false;
  $("#uploadProgressText").textContent = text;
  $("#uploadProgressValue").textContent = `${value}%`;
  $("#uploadProgressBar").style.width = `${value}%`;
}

function overallUploadPercent(fileIndex, totalFiles, currentFileRatio = 0) {
  if (!totalFiles) return 100;
  return ((fileIndex + Math.max(0, Math.min(1, currentFileRatio))) / totalFiles) * 100;
}

function resetUploadProgress() {
  const box = $("#uploadProgress");
  box.hidden = true;
  $("#uploadProgressText").textContent = "Menyiapkan upload...";
  $("#uploadProgressValue").textContent = "0%";
  $("#uploadProgressBar").style.width = "0%";
}


const VIDEO_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB, kelipatan 256 KB

async function createVideoUploadSession(activityId, file) {
  return apiFetch(
    `/api/activities/${encodeURIComponent(activityId)}/uploads/resumable`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size
      })
    }
  );
}

function uploadChunkViaWorker(activityId, uploadUrl, chunk, contentRange, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(
      "POST",
      `${API_BASE_URL}/api/activities/${encodeURIComponent(activityId)}/uploads/chunk`,
      true
    );

    xhr.setRequestHeader("Content-Type", chunk.type || "application/octet-stream");
    xhr.setRequestHeader("X-SI-ALIF-Upload-URL", uploadUrl);
    xhr.setRequestHeader("X-SI-ALIF-Content-Range", contentRange);

    if (apiPin) {
      xhr.setRequestHeader("X-SI-ALIF-PIN", apiPin);
    }

    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return;
      const ratio = event.total ? event.loaded / event.total : 0;
      onProgress?.(ratio);
    });

    xhr.addEventListener("load", () => {
      let payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (_) {}

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      reject(
        new Error(
          payload?.error ||
          payload?.message ||
          `Upload chunk gagal (HTTP ${xhr.status}).`
        )
      );
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Koneksi ke SI ALIF terputus saat mengunggah video."));
    });

    xhr.addEventListener("timeout", () => {
      reject(new Error("Upload chunk video terlalu lama dan mencapai batas waktu."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload video dibatalkan."));
    });

    xhr.send(chunk);
  });
}

async function uploadVideoChunked(activityId, file, fileIndex, totalFiles) {
  const session = await createVideoUploadSession(activityId, file);

  if (!session?.uploadUrl) {
    throw new Error("Tiket upload Google Drive tidak tersedia.");
  }

  const totalBytes = file.size;
  let start = 0;
  let finalFile = null;

  while (start < totalBytes) {
    const endExclusive = Math.min(start + VIDEO_CHUNK_SIZE, totalBytes);
    const endInclusive = endExclusive - 1;
    const chunk = file.slice(start, endExclusive, file.type || "application/octet-stream");

    const chunkNumber = Math.floor(start / VIDEO_CHUNK_SIZE) + 1;
    const chunkTotal = Math.ceil(totalBytes / VIDEO_CHUNK_SIZE);

    const result = await uploadChunkViaWorker(
      activityId,
      session.uploadUrl,
      chunk,
      `bytes ${start}-${endInclusive}/${totalBytes}`,
      chunkRatio => {
        const uploadedWithinFile = start + (chunk.size * chunkRatio);
        const fileRatio = totalBytes ? uploadedWithinFile / totalBytes : 0;
        const overallPercent = overallUploadPercent(fileIndex, totalFiles, fileRatio);

        setUploadProgressPercent(
          overallPercent,
          `🎬 ${fileIndex + 1}/${totalFiles} • ${file.name} • chunk ${chunkNumber}/${chunkTotal} • ${Math.round(fileRatio * 100)}%`
        );
      }
    );

    if (result?.complete) {
      finalFile = result.file || null;
      start = totalBytes;
      break;
    }

    start = endExclusive;
  }

  if (!finalFile?.id) {
    throw new Error("Google Drive belum mengembalikan ID video setelah semua chunk dikirim.");
  }

  await apiFetch(
    `/api/activities/${encodeURIComponent(activityId)}/uploads/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: finalFile.id })
    }
  );

  return finalFile;
}

async function uploadSelectedFilesToActivity(activityId) {
  const total = selectedFiles.length;

  for (let i = 0; i < total; i++) {
    const file = selectedFiles[i];
    const isVideo = file.type.startsWith("video/");

    if (isVideo) {
      setUploadProgressPercent(
        overallUploadPercent(i, total, 0),
        `Menyiapkan upload video ${i + 1}/${total}: ${file.name}`
      );

      await uploadVideoChunked(activityId, file, i, total);

      setUploadProgressPercent(
        overallUploadPercent(i, total, 1),
        `🎬 Video ${i + 1}/${total} tersimpan utuh di Google Drive.`
      );
      continue;
    }

    setUploadProgressPercent(
      overallUploadPercent(i, total, 0),
      `📷 Mengunggah ${i + 1}/${total}: ${file.name}`
    );

    const data = new FormData();
    data.append("file", file, file.name);

    await apiFetch(
      `/api/activities/${encodeURIComponent(activityId)}/files`,
      {
        method: "POST",
        body: data
      }
    );

    setUploadProgressPercent(
      overallUploadPercent(i, total, 1),
      `📷 Foto ${i + 1}/${total} tersimpan.`
    );
  }

  return total;
}

async function submitRemoteActivity(payload) {
  setUploadProgress(
    0,
    Math.max(selectedFiles.length, 1),
    "Membuat folder kegiatan di Google Drive..."
  );

  const activity = await apiFetch("/api/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  await uploadSelectedFilesToActivity(activity.id);

  if (!selectedFiles.length) {
    setUploadProgress(1, 1, "Kegiatan tersimpan tanpa media.");
  }

  return activity;
}

async function submitAdditionalMedia(activityId) {
  if (!selectedFiles.length) {
    throw new Error("Pilih minimal satu foto atau video untuk ditambahkan.");
  }

  setUploadProgress(
    0,
    selectedFiles.length,
    "Menambahkan bahan ke folder kegiatan..."
  );

  await uploadSelectedFilesToActivity(activityId);
  return { id: activityId };
}

$("#documentationForm").addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = $("#submitDocumentation");
  const isExisting = documentationMode === "existing";

  const name = $("#activityName").value.trim();
  const division = $("#division").value;
  const location = $("#locationText").value.trim();
  const date = $("#activityDate").value;
  const description = $("#description").value.trim();

  if (isExisting) {
    if (!sharedContributionMode) {
      selectedExistingActivityId = $("#existingActivitySelect").value;
    }

    if (!selectedExistingActivityId) {
      showToast("Pilih kegiatan yang mau ditambahi bahan.");
      return;
    }

    if (!selectedFiles.length) {
      showToast("Pilih minimal satu foto atau video.");
      return;
    }
  } else if (!name || !division || !location || !date) {
    return;
  }

  const photoCountAtSubmit = selectedFiles.filter(file => file.type.startsWith("image/")).length;
  const videoCountAtSubmit = selectedFiles.filter(file => file.type.startsWith("video/")).length;
  const mediaCountAtSubmit = selectedFiles.length;

  const publicationMode =
    document.querySelector('input[name="publicationMode"]:checked')?.value || "documentation";

  const publication = !isExisting && publicationMode === "request"
    ? {
        requested: true,
        type: document.querySelector('input[name="publicationType"]:checked')?.value || "instagram_post",
        requesterName: $("#publicationRequester").value.trim(),
        note: $("#publicationNote").value.trim()
      }
    : { requested: false };

  if (publication.requested && !publication.requesterName) {
    showToast("Nama pemesan wajib diisi untuk pengajuan publikasi.");
    $("#publicationRequester").focus();
    return;
  }

  const payload = {
    name,
    division,
    date,
    location,
    description,
    coordinates,
    publication
  };

  submitButton.disabled = true;
  submitButton.textContent = isExisting
    ? "Menambahkan..."
    : (backendOnline ? "Mengirim..." : "Menyimpan...");

  try {
    let savedActivity;

    if (isExisting) {
      if (!backendOnline) {
        throw new Error("Tambah ke kegiatan lama membutuhkan koneksi ke SI ALIF.");
      }

      await submitAdditionalMedia(selectedExistingActivityId);
      galleryFolderFilesCache.delete(String(selectedExistingActivityId));
      await loadActivitiesFromApi();

      savedActivity = activities.find(
        item => String(item.id) === String(selectedExistingActivityId)
      );

      if (!savedActivity) {
        throw new Error("Kegiatan tujuan tidak ditemukan setelah upload.");
      }

      successContext = "existing";
    } else if (backendOnline) {
      const created = await submitRemoteActivity(payload);

      if (publication.requested) {
        try {
          await apiFetch(`/api/activities/${encodeURIComponent(created.id)}/publication/notify`, {
            method: "POST"
          });
        } catch (notifyError) {
          console.warn("Notifikasi bot belum terkirim:", notifyError.message);
        }
      }

      await loadActivitiesFromApi();

      savedActivity = activities.find(item => String(item.id) === String(created.id)) || {
        id: created.id,
        name,
        division,
        place: location,
        photos: photoCountAtSubmit,
        videos: videoCountAtSubmit,
        media: mediaCountAtSubmit,
        publication,
        status: photoCountAtSubmit >= 3 ? "Lengkap" : "Minim",
        date: formatDate(date),
        dateIso: date,
        description,
        coordinates,
        folderUrl: created.folderUrl || ""
      };

      successContext = "new";
    } else {
      savedActivity = {
        id: Date.now(),
        name,
        division,
        place: location,
        photos: photoCountAtSubmit,
        videos: videoCountAtSubmit,
        media: mediaCountAtSubmit,
        publication,
        status: photoCountAtSubmit >= 3 ? "Lengkap" : "Minim",
        date: formatDate(date),
        dateIso: date,
        description,
        coordinates,
        folderUrl: ""
      };

      activities.unshift(savedActivity);
      localStorage.setItem("si-alif-activities", JSON.stringify(activities));
      refreshLists();
      successContext = "new";
    }

    event.target.reset();
    selectedFiles = [];
    coordinates = null;
    selectedExistingActivityId = "";
    clearSharedContributionTarget();
    $("#previewGrid").innerHTML = "";
    document.querySelector(".direct-video-note")?.remove();
    $("#gpsStatus").textContent = "Koordinat belum diambil.";
    $("#activityDate").value = new Date().toISOString().slice(0, 10);
    $("#publicationRequester").value = "";
    $("#publicationNote").value = "";

    const docMode = document.querySelector('input[name="publicationMode"][value="documentation"]');
    if (docMode) docMode.checked = true;

    const postType = document.querySelector('input[name="publicationType"][value="instagram_post"]');
    if (postType) postType.checked = true;

    setDocumentationMode("new");
    syncPublicationUi();
    resetUploadProgress();
    showSuccessScreen(savedActivity);
  } catch (error) {
    showToast(`Upload gagal: ${error.message}`);
    setUploadProgress(0, 1, `Gagal: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = documentationMode === "existing"
      ? "Tambahkan Bahan"
      : "Kirim Dokumentasi";
  }
});

$("#successViewOrder").addEventListener("click", () => {
  navigateTo("orders");
});

$$("[data-documentation-mode]").forEach(button => {
  button.addEventListener("click", () => {
    clearSharedContributionTarget();
    setDocumentationMode(button.dataset.documentationMode);
  });
});

$("#existingActivitySelect").addEventListener("change", event => {
  selectedExistingActivityId = event.target.value;
});

$("#galleryAddMaterial").addEventListener("click", () => {
  if (galleryActivityId) openAddMaterialForActivity(galleryActivityId);
});

$("#galleryShareContribution").addEventListener("click", () => {
  if (galleryActivityId) shareContributionLink(galleryActivityId);
});

$("#galleryEditInfo").addEventListener("click", openEditActivityModal);

$$("[data-edit-close]").forEach(element => {
  element.addEventListener("click", closeEditActivityModal);
});

$("#editActivityForm").addEventListener("submit", saveEditedActivity);

$("#openSiAlifTrash").addEventListener("click", openSiAlifTrash);
$("#emptySiAlifTrash").addEventListener("click", emptyTrashSiAlif);

$$("[data-trash-close]").forEach(element => {
  element.addEventListener("click", closeSiAlifTrash);
});

$$("[data-lightbox-close]").forEach(element => {
  element.addEventListener("click", closeMediaLightbox);
});

$("#lightboxPrev").addEventListener("click", () => moveMediaLightbox(-1));
$("#lightboxNext").addEventListener("click", () => moveMediaLightbox(1));
$("#lightboxDownload").addEventListener("click", downloadLightboxMedia);
$("#lightboxDelete").addEventListener("click", deleteLightboxMedia);

window.addEventListener("keydown", event => {
  if (!$("#siAlifTrashModal")?.hidden && event.key === "Escape") {
    closeSiAlifTrash();
    return;
  }

  if ($("#mediaLightbox")?.hidden) return;

  if (event.key === "Escape") closeMediaLightbox();
  if (event.key === "ArrowLeft") moveMediaLightbox(-1);
  if (event.key === "ArrowRight") moveMediaLightbox(1);
});

$("#galleryBackFromFolder").addEventListener("click", () => {
  const route = parseRouteHash();

  if (route.view === "gallery" && route.galleryFolderId) {
    history.back();
  } else {
    navigateTo("gallery", { replace: true });
  }
});

$("#gallerySelectAll").addEventListener("click", () => {
  if (galleryFiles.length && gallerySelected.size === galleryFiles.length) {
    gallerySelected.clear();
  } else {
    gallerySelected = new Set(galleryFiles.map(file => file.id));
  }
  updateGallerySelectionUi();
});

$("#galleryClearSelection").addEventListener("click", () => {
  gallerySelected.clear();
  updateGallerySelectionUi();
});

$("#galleryDownloadSelected").addEventListener("click", downloadSelectedGalleryFiles);

$("#detailOpenGallery").addEventListener("click", () => {
  if (currentDetailActivityId) openActivityGallery(currentDetailActivityId);
});

$("#successShareContribution").addEventListener("click", () => {
  if (lastSubmittedActivityId) {
    shareContributionLink(lastSubmittedActivityId);
  }
});

$("#successViewGallery").addEventListener("click", () => {
  if (lastSubmittedActivityId) {
    navigateTo("gallery", { galleryFolderId: lastSubmittedActivityId });
  } else {
    navigateTo("gallery");
  }
});

$("#resetButton").addEventListener("click", () => {
  selectedFiles = [];
  coordinates = null;
  $("#previewGrid").innerHTML = "";
  $("#gpsStatus").textContent = "Koordinat belum diambil.";
  resetUploadProgress();

  const docMode = document.querySelector('input[name="publicationMode"][value="documentation"]');
  if (docMode) docMode.checked = true;
  const postType = document.querySelector('input[name="publicationType"][value="instagram_post"]');
  if (postType) postType.checked = true;
  selectedExistingActivityId = "";
  clearSharedContributionTarget();
  setDocumentationMode("new");
  syncPublicationUi();

  setTimeout(() => {
    $("#activityDate").value = new Date().toISOString().slice(0, 10);
  }, 0);
});

$("#backendStatus").addEventListener("click", async () => {
  setBackendStatus("checking", "Memeriksa...");
  await checkBackend();
});

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 3600);
}

refreshLists();
setDocumentationMode("new");

// Baca URL lebih dulu supaya refresh tidak sempat menampilkan Dashboard.
// Data Google Drive dimuat setelah view yang benar sudah terpilih.
initializeRouting();
checkBackend();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
