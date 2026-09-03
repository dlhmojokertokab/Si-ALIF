const titleMap = {
  dashboard: "Dashboard",
  submit: "Setor Dokumentasi",
  activities: "Kegiatan",
  gallery: "Galeri",
  map: "Peta Kegiatan"
};

const config = window.SI_ALIF_CONFIG || {};
const API_BASE_URL = String(config.API_BASE_URL || "").replace(/\/$/, "");

let activities = [];
let selectedFiles = [];
let coordinates = null;
let backendOnline = false;
let apiPin = localStorage.getItem("si-alif-api-pin") || "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function switchView(view) {
  $$(".view").forEach(el => el.classList.remove("active"));
  $(`#view-${view}`).classList.add("active");
  $("#pageTitle").textContent = titleMap[view] || "SI ALIF";

  $$(".nav-item, .mobile-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$('[data-view]').forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
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
    box.innerHTML = `<div class="empty-state"><p>Belum ada kegiatan yang cocok.</p></div>`;
    return;
  }

  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "activity-row";
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
    box.appendChild(row);
  });
}

function refreshLists() {
  renderActivities("#recentActivities", activities.slice(0, 4));
  renderActivities("#allActivities", activities);
  updateStats();
}

function filterActivities() {
  const q = $("#searchActivity").value.trim().toLowerCase();
  const division = $("#filterDivision").value;
  const filtered = activities.filter(item => {
    const text = `${item.name} ${item.place} ${item.division}`.toLowerCase();
    return (!q || text.includes(q)) && (!division || item.division === division);
  });
  renderActivities("#allActivities", filtered);
}

$("#searchActivity").addEventListener("input", filterActivities);
$("#filterDivision").addEventListener("change", filterActivities);

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

  const payload = { name, division, date, location, description, coordinates };

  submitButton.disabled = true;
  submitButton.textContent = backendOnline ? "Mengirim..." : "Menyimpan...";

  try {
    if (backendOnline) {
      await submitRemoteActivity(payload);
      await loadActivitiesFromApi();
      showToast("Dokumentasi masuk Google Drive. HP Alif aman. 💜");
    } else {
      const newActivity = {
        id: Date.now(),
        name,
        division,
        place: location,
        photos: selectedFiles.length,
        status: selectedFiles.length >= 3 ? "Lengkap" : "Minim",
        date: formatDate(date),
        dateIso: date,
        description,
        coordinates
      };
      activities.unshift(newActivity);
      localStorage.setItem("si-alif-activities", JSON.stringify(activities));
      refreshLists();
      showToast("Backend belum online — data sementara tersimpan lokal.");
    }

    event.target.reset();
    selectedFiles = [];
    coordinates = null;
    $("#previewGrid").innerHTML = "";
    $("#gpsStatus").textContent = "Koordinat belum diambil.";
    $("#activityDate").value = new Date().toISOString().slice(0, 10);
    setTimeout(() => {
      resetUploadProgress();
      switchView("dashboard");
    }, 700);
  } catch (error) {
    showToast(`Upload gagal: ${error.message}`);
    setUploadProgress(0, 1, `Gagal: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Kirim Dokumentasi";
  }
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
