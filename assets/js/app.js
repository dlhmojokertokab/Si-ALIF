const titleMap = {
  dashboard: "Dashboard",
  submit: "Setor Dokumentasi",
  activities: "Aktivitas",
  gallery: "Galeri",
  map: "Peta",
  success: "Tersimpan",
  detail: "Detail Aktivitas"
};

const config = window.SI_ALIF_CONFIG || {};
const API_BASE_URL = String(config.API_BASE_URL || "").replace(/\/$/, "");

let activities = [];
let selectedFiles = [];
let coordinates = null;
let backendOnline = false;
let apiPin = localStorage.getItem("si-alif-api-pin") || "";
let lastSubmittedActivityId = null;
let currentDetailActivityId = null;
let galleryActivityId = "";
let galleryFiles = [];
let gallerySelected = new Set();
let galleryObjectUrls = new Map();
let galleryLoaded = false;
let galleryLoading = false;
let galleryFocusActivityId = null;
let galleryGroupsData = [];

const filterState = {
  query: "",
  division: "",
  month: "",
  status: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentView = "dashboard";
let handlingPopState = false;

function switchView(view, options = {}) {
  const { push = true } = options;
  const target = $(`#view-${view}`);
  if (!target) return;

  const previousView = currentView;

  $$(".view").forEach(el => el.classList.remove("active"));
  target.classList.add("active");
  currentView = view;
  $("#pageTitle").textContent = titleMap[view] || "SI ALIF";

  $$(".nav-item, .mobile-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });

  if (view === "gallery") {
    ensureAllGalleryReady();
  }

  if (push && !handlingPopState && previousView !== view) {
    history.pushState({ siAlifView: view }, "", window.location.href);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

history.replaceState({ siAlifView: "dashboard" }, "", window.location.href);

window.addEventListener("popstate", event => {
  handlingPopState = true;
  const targetView = event.state?.siAlifView || "dashboard";
  switchView(targetView, { push: false });
  handlingPopState = false;
});

$$('[data-view]').forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

$$("[data-history-back]").forEach(button => {
  button.addEventListener("click", () => {
    if (history.state?.siAlifView && currentView !== "dashboard") {
      history.back();
    } else {
      switchView("dashboard");
    }
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
        <span>${escapeHtml(item.division)} • ${escapeHtml(item.place)} • ${escapeHtml(item.date)} • ${item.photos} foto</span>
      </div>
      <div class="activity-side">
        <span class="activity-status ${item.status === "Minim" ? "warn" : ""}">${item.status === "Minim" ? "🟡" : "🟢"} ${escapeHtml(item.status)}</span>
        ${driveLink}
      </div>
    `;

    const open = event => {
      if (event?.target?.closest?.("a")) return;
      openActivityDetail(item.id);
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

function refreshLists() {
  renderActivities("#recentActivities", activities.slice(0, 4));
  populateMonthFilters();
  syncFilterControls();
  applyActivityFilters();
  updateStats();

  if (currentView === "gallery" && !galleryLoading) {
    galleryLoaded = false;
    ensureAllGalleryReady();
  } else {
    updateFilterSummaries();
  }
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

function updateFilterSummaries(activityCount = null, photoCount = null) {
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
    const totalPhotos = photoCount ?? filtered.reduce((sum, item) => sum + Number(item.photos || 0), 0);
    galleryResult.textContent = filters
      ? `${shownActivities} aktivitas • ${totalPhotos} foto • ${filters} filter aktif`
      : `${activities.length} aktivitas • ${totalPhotos} foto`;
  }
}

function applyActivityFilters() {
  const filtered = getFilteredActivities();
  renderActivities("#allActivities", filtered);
  updateFilterSummaries(filtered.length);
}

function applyGalleryFilters() {
  if (!galleryLoaded) {
    updateFilterSummaries();
    return;
  }

  const filteredGroups = galleryGroupsData.filter(group =>
    group.files.length && activityMatchesFilters(group.activity)
  );

  renderAllGalleryGroups(filteredGroups, { preserveSource: true });
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
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const dateKey = now.toISOString().slice(0, 10);

  const todayCount = activities.filter(a => a.dateIso === dateKey).length;
  const monthCount = activities.filter(a => {
    if (!a.dateIso) return false;
    const d = new Date(`${a.dateIso}T00:00:00`);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
  const totalPhotos = activities.reduce((sum, a) => sum + Number(a.photos || 0), 0);
  const complete = activities.filter(a => Number(a.photos || 0) >= 3).length;
  const completeness = activities.length ? Math.round((complete / activities.length) * 100) : 0;

  $("#statToday").textContent = todayCount;
  $("#statMonth").textContent = monthCount;
  $("#statPhotos").textContent = totalPhotos;
  $("#statCompleteness").textContent = `${completeness}%`;
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
  return {
    id: item.id,
    name: item.name || "Tanpa nama",
    division: item.division || "-",
    place: item.location || "-",
    photos: Number(item.photoCount || 0),
    status: Number(item.photoCount || 0) >= 3 ? "Lengkap" : "Minim",
    date: formatDate(item.date),
    dateIso: item.date || "",
    description: item.description || "",
    coordinates: item.coordinates || null,
    folderUrl: item.folderUrl || ""
  };
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

  currentDetailActivityId = item.id;
  $("#detailName").textContent = item.name || "Aktivitas";
  $("#detailDescription").textContent = item.description || "Belum ada keterangan singkat.";
  $("#detailPhotoCount").textContent = Number(item.photos || 0);
  $("#detailDivision").textContent = item.division || "-";
  $("#detailDate").textContent = item.date || "-";
  $("#detailLocation").textContent = item.place || "-";
  $("#detailStatus").textContent = item.status || "-";
  $("#detailCoordinates").textContent = formatCoordinates(item.coordinates);

  const drive = $("#detailDriveLink");
  if (item.folderUrl) {
    drive.href = item.folderUrl;
    drive.hidden = false;
  } else {
    drive.hidden = true;
  }

  switchView("detail");
}

function showSuccessScreen(item) {
  lastSubmittedActivityId = item?.id || null;
  $("#successActivityName").textContent = item?.name || "Aktivitas";
  $("#successActivityMeta").textContent = [
    item?.division || "-",
    item?.place || "-",
    item?.date || "-"
  ].join(" • ");
  $("#successPhotoCount").textContent = Number(item?.photos || 0);

  const drive = $("#successDriveLink");
  if (item?.folderUrl) {
    drive.href = item.folderUrl;
    drive.hidden = false;
  } else {
    drive.hidden = true;
  }

  switchView("success");
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
    if (checkbox) checkbox.textContent = selected ? "✓" : "";
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

function createGalleryCard(file) {
  const card = document.createElement("article");
  card.className = "gallery-card";
  card.dataset.fileId = file.id;
  card.tabIndex = 0;
  card.setAttribute("role", "checkbox");
  card.setAttribute("aria-checked", "false");

  const dimension = file.width && file.height ? `${file.width}×${file.height}` : "";
  const detail = [dimension, formatFileSize(file.size)].filter(Boolean).join(" • ");

  card.innerHTML = `
    <div class="gallery-photo-frame">
      <div class="gallery-image-skeleton">SI</div>
      <img alt="${escapeHtml(file.name)}" loading="lazy">
      <span class="gallery-check"></span>
    </div>
    <div class="gallery-card-info">
      <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
      <span>${escapeHtml(detail || "Foto")}</span>
    </div>
  `;

  const toggle = event => {
    if (event?.target?.closest?.("a,button")) return;
    toggleGalleryFile(file.id);
  };

  card.addEventListener("click", toggle);
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(event);
    }
  });

  loadGalleryThumbnail(file, card.querySelector("img"));
  return card;
}

function renderAllGalleryGroups(groups, options = {}) {
  const container = $("#galleryGroups");
  container.innerHTML = "";
  cleanupGalleryObjectUrls();
  gallerySelected.clear();

  const validGroups = groups.filter(group => group.files.length);

  if (!options.preserveSource) {
    galleryGroupsData = groups;
  }

  galleryFiles = validGroups.flatMap(group =>
    group.files.map(file => ({
      ...file,
      activityId: group.activity.id,
      activityName: group.activity.name
    }))
  );

  if (!galleryFiles.length) {
    $("#galleryToolbar").hidden = true;
    const filtered = activeFilterCount() > 0;
    setGalleryState(
      "empty",
      filtered ? "Tidak ada yang cocok" : "Belum ada foto",
      filtered
        ? "Coba ubah atau reset filter untuk melihat dokumentasi lain."
        : "Setor dokumentasi dulu, nanti semua fotonya langsung muncul di sini."
    );
    updateFilterSummaries(0, 0);
    return;
  }

  $("#galleryState").hidden = true;
  $("#galleryToolbar").hidden = false;

  validGroups.forEach(group => {
    const section = document.createElement("section");
    section.className = "gallery-group";
    section.dataset.activityId = group.activity.id;

    const folderLink = group.activity.folderUrl
      ? `<a class="gallery-group-drive" href="${escapeHtml(group.activity.folderUrl)}" target="_blank" rel="noopener">Drive ↗</a>`
      : "";

    section.innerHTML = `
      <div class="gallery-group-head">
        <div>
          <strong>${escapeHtml(group.activity.name)}</strong>
          <span>${escapeHtml(group.activity.date)} • ${escapeHtml(group.activity.division)} • ${escapeHtml(group.activity.place)} • ${group.files.length} foto</span>
        </div>
        ${folderLink}
      </div>
      <div class="gallery-grid"></div>
    `;

    const grid = section.querySelector(".gallery-grid");
    group.files.forEach(file => grid.appendChild(createGalleryCard(file)));
    container.appendChild(section);
  });

  updateGallerySelectionUi();
  updateFilterSummaries(
    validGroups.length,
    galleryFiles.length
  );

  if (galleryFocusActivityId) {
    requestAnimationFrame(() => {
      const target = container.querySelector(`[data-activity-id="${CSS.escape(String(galleryFocusActivityId))}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      galleryFocusActivityId = null;
    });
  }
}

async function fetchGalleryActivityGroup(activity) {
  if (!Number(activity.photos || 0)) {
    return { activity, files: [] };
  }

  try {
    const result = await apiFetch(`/api/activities/${encodeURIComponent(activity.id)}/files`);
    return { activity, files: result.files || [] };
  } catch (error) {
    console.warn(`Galeri ${activity.name} gagal dimuat:`, error);
    return { activity, files: [] };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  );

  return results;
}

async function loadAllGallery() {
  if (galleryLoading) return;

  galleryLoading = true;
  galleryLoaded = false;
  galleryFiles = [];
  gallerySelected.clear();
  cleanupGalleryObjectUrls();
  $("#galleryGroups").innerHTML = "";
  $("#galleryToolbar").hidden = true;

  const withPhotos = activities.filter(item => Number(item.photos || 0) > 0);

  if (!withPhotos.length) {
    galleryGroupsData = [];
    galleryLoading = false;
    galleryLoaded = true;
    setGalleryState("empty", "Belum ada foto", "Setor dokumentasi dulu, nanti semua fotonya langsung muncul di sini.");
    updateFilterSummaries(0, 0);
    return;
  }

  setGalleryState(
    "loading",
    "Mengambil galeri...",
    `Membaca ${withPhotos.length} aktivitas dari Google Drive.`
  );

  try {
    const groups = await mapWithConcurrency(withPhotos, 4, fetchGalleryActivityGroup);
    galleryGroupsData = groups;
    galleryLoaded = true;
    const filteredGroups = galleryGroupsData.filter(group =>
      group.files.length && activityMatchesFilters(group.activity)
    );
    renderAllGalleryGroups(filteredGroups, { preserveSource: true });
  } catch (error) {
    setGalleryState("error", "Galeri gagal dimuat", error.message);
  } finally {
    galleryLoading = false;
  }
}

function ensureAllGalleryReady() {
  if (!galleryLoaded && !galleryLoading) {
    loadAllGallery();
  } else if (galleryFocusActivityId) {
    requestAnimationFrame(() => {
      const target = $("#galleryGroups")?.querySelector(
        `[data-activity-id="${CSS.escape(String(galleryFocusActivityId))}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      galleryFocusActivityId = null;
    });
  }
}

function openActivityGallery(activityId) {
  galleryFocusActivityId = activityId || null;
  switchView("gallery");
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
    showToast(`${chosen.length} foto dikirim ke download browser.`);
  } catch (error) {
    showToast(`Download gagal: ${error.message}`);
  } finally {
    button.textContent = original;
    button.disabled = false;
    updateGallerySelectionUi();
  }
}

async function checkBackend() {
  if (!API_BASE_URL) {
    backendOnline = false;
    setBackendStatus("offline", "API belum diatur");
    refreshLists();
    return;
  }

  try {
    await apiFetch("/health", {}, false);
    backendOnline = true;
    setBackendStatus("online", "Google Drive terhubung");
    await loadActivitiesFromApi();
  } catch (error) {
    backendOnline = false;
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
}

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

  selectedFiles.slice(0, 15).forEach(file => {
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    grid.appendChild(img);
  });

  if (selectedFiles.length > 15) {
    const more = document.createElement("div");
    more.className = "activity-thumb";
    more.textContent = `+${selectedFiles.length - 15}`;
    grid.appendChild(more);
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

function resetUploadProgress() {
  const box = $("#uploadProgress");
  box.hidden = true;
  $("#uploadProgressText").textContent = "Menyiapkan upload...";
  $("#uploadProgressValue").textContent = "0%";
  $("#uploadProgressBar").style.width = "0%";
}

async function submitRemoteActivity(payload) {
  setUploadProgress(0, Math.max(selectedFiles.length, 1), "Membuat folder kegiatan di Google Drive...");

  const activity = await apiFetch("/api/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const total = selectedFiles.length;
  for (let i = 0; i < total; i++) {
    const file = selectedFiles[i];
    setUploadProgress(i, total, `Mengunggah ${i + 1}/${total}: ${file.name}`);

    const data = new FormData();
    data.append("file", file, file.name);
    await apiFetch(`/api/activities/${encodeURIComponent(activity.id)}/files`, {
      method: "POST",
      body: data
    });

    setUploadProgress(i + 1, total, `Foto ${i + 1}/${total} tersimpan.`);
  }

  if (!total) setUploadProgress(1, 1, "Kegiatan tersimpan tanpa foto.");
  return activity;
}

$("#documentationForm").addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("#activityName").value.trim();
  const division = $("#division").value;
  const location = $("#locationText").value.trim();
  const date = $("#activityDate").value;
  const description = $("#description").value.trim();
  const submitButton = $("#submitDocumentation");

  if (!name || !division || !location || !date) return;

  const photoCountAtSubmit = selectedFiles.length;
  const payload = { name, division, date, location, description, coordinates };

  submitButton.disabled = true;
  submitButton.textContent = backendOnline ? "Mengirim..." : "Menyimpan...";

  try {
    let savedActivity;

    if (backendOnline) {
      const created = await submitRemoteActivity(payload);
      await loadActivitiesFromApi();
      savedActivity = activities.find(item => String(item.id) === String(created.id)) || {
        id: created.id,
        name,
        division,
        place: location,
        photos: photoCountAtSubmit,
        status: photoCountAtSubmit >= 3 ? "Lengkap" : "Minim",
        date: formatDate(date),
        dateIso: date,
        description,
        coordinates,
        folderUrl: created.folderUrl || ""
      };
    } else {
      savedActivity = {
        id: Date.now(),
        name,
        division,
        place: location,
        photos: photoCountAtSubmit,
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
    }

    event.target.reset();
    selectedFiles = [];
    coordinates = null;
    $("#previewGrid").innerHTML = "";
    $("#gpsStatus").textContent = "Koordinat belum diambil.";
    $("#activityDate").value = new Date().toISOString().slice(0, 10);
    resetUploadProgress();
    galleryLoaded = false;
    galleryGroupsData = [];
    showSuccessScreen(savedActivity);
  } catch (error) {
    showToast(`Upload gagal: ${error.message}`);
    setUploadProgress(0, 1, `Gagal: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Kirim Dokumentasi";
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

$("#successViewGallery").addEventListener("click", () => {
  if (lastSubmittedActivityId) openActivityGallery(lastSubmittedActivityId);
  else switchView("gallery");
});

$("#successViewActivity").addEventListener("click", () => {
  if (lastSubmittedActivityId) openActivityDetail(lastSubmittedActivityId);
  else switchView("activities");
});

$("#resetButton").addEventListener("click", () => {
  selectedFiles = [];
  coordinates = null;
  $("#previewGrid").innerHTML = "";
  $("#gpsStatus").textContent = "Koordinat belum diambil.";
  resetUploadProgress();
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
checkBackend();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
