/**
 * Adapter Logs Reviewer — Frontend application.
 */

document.addEventListener("DOMContentLoaded", () => {
    const entryList = document.querySelector(".entry-list");
    const tabContent = document.querySelector(".tab-content");
    let currentPage = 1;
    const perPage = 50;
    let totalEntries = 0;
    let selectedId = null;
    let loading = false;

    // Filter elements
    const filterPanel = document.querySelector(".filter-panel");
    const filterToggle = document.getElementById("filter-toggle");
    const filterModel = document.getElementById("filter-model");
    const filterTimeFrom = document.getElementById("filter-time-from");
    const filterTimeTo = document.getElementById("filter-time-to");
    const filterSearch = document.getElementById("filter-search");
    const btnUpload = document.getElementById("btn-upload");
    const btnExport = document.getElementById("btn-export");

    // Collapsible filter panel
    filterToggle.addEventListener("click", () => {
        filterPanel.classList.toggle("collapsed");
    });

    // Populate models dropdown
    async function loadModels() {
        try {
            const resp = await fetch("/api/models");
            if (!resp.ok) return;
            const models = await resp.json();
            models.forEach((m) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                filterModel.appendChild(opt);
            });
        } catch (err) {
            console.error("Failed to load models:", err);
        }
    }

    function getFilterParams() {
        const params = new URLSearchParams();
        params.set("page", currentPage);
        params.set("per_page", perPage);
        if (filterModel.value) params.set("model", filterModel.value);
        if (filterTimeFrom.value) params.set("time_from", filterTimeFrom.value);
        if (filterTimeTo.value) params.set("time_to", filterTimeTo.value);
        if (filterSearch.value.trim()) params.set("search", filterSearch.value.trim());
        return params.toString();
    }

    function resetAndReload() {
        currentPage = 1;
        totalEntries = 0;
        entryList.querySelectorAll(".entry-item").forEach((el) => el.remove());
        loadMoreBtn.style.display = "block";
        loadMoreBtn.textContent = "Load More";
        loadEntries();
    }

    // Filter change handlers
    filterModel.addEventListener("change", resetAndReload);
    filterTimeFrom.addEventListener("change", resetAndReload);
    filterTimeTo.addEventListener("change", resetAndReload);

    // Debounced search
    let searchTimeout = null;
    filterSearch.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(resetAndReload, 300);
    });

    // Upload
    btnUpload.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".jsonl";
        input.addEventListener("change", async () => {
            if (!input.files.length) return;
            const formData = new FormData();
            formData.append("file", input.files[0]);
            try {
                const resp = await fetch("/api/upload", { method: "POST", body: formData });
                if (!resp.ok) throw new Error(resp.statusText);
                // Reload models and entries
                filterModel.innerHTML = '<option value="">All Models</option>';
                await loadModels();
                resetAndReload();
            } catch (err) {
                console.error("Upload failed:", err);
                alert("Upload failed: " + err.message);
            }
        });
        input.click();
    });

    // Export
    btnExport.addEventListener("click", () => {
        const params = new URLSearchParams();
        if (filterModel.value) params.set("model", filterModel.value);
        if (filterTimeFrom.value) params.set("time_from", filterTimeFrom.value);
        if (filterTimeTo.value) params.set("time_to", filterTimeTo.value);
        if (filterSearch.value.trim()) params.set("search", filterSearch.value.trim());
        window.location.href = "/api/export?" + params.toString();
    });

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Tab switching
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
        });
    });

    function formatSize(bytes) {
        if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(2) + " MB";
        }
        return (bytes / 1024).toFixed(2) + " KB";
    }

    function formatTimestamp(ts) {
        if (!ts) return "—";
        const d = new Date(ts);
        return d.toLocaleString();
    }

    function createEntryItem(entry) {
        const div = document.createElement("div");
        div.className = "entry-item";
        div.dataset.id = entry.id;
        div.innerHTML = `
            <div class="entry-header">
                <span class="entry-number">#${escapeHtml(String(entry.id))}</span>
                <span class="entry-size">${escapeHtml(formatSize(entry.size_bytes))}</span>
            </div>
            <div class="entry-timestamp">${escapeHtml(formatTimestamp(entry.timestamp))}</div>
            <div class="entry-meta">
                <span class="entry-model">${escapeHtml(entry.model || "unknown")}</span>
                <span class="entry-stats">${escapeHtml(String(entry.message_count))} msgs · ${escapeHtml(String(entry.tools_count))} tools</span>
            </div>
        `;
        div.addEventListener("click", () => selectEntry(entry.id));
        return div;
    }

    async function loadEntries() {
        if (loading) return;
        loading = true;
        try {
            const resp = await fetch(`/api/entries?${getFilterParams()}`);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            totalEntries = data.total;
            data.entries.forEach((entry) => {
                entryList.insertBefore(createEntryItem(entry), loadMoreBtn);
            });
            currentPage++;
            const loaded = entryList.querySelectorAll(".entry-item").length;
            if (loaded >= totalEntries) {
                loadMoreBtn.style.display = "none";
            }
        } catch (err) {
            console.error("Failed to load entries:", err);
            loadMoreBtn.textContent = "Failed to load — click to retry";
        } finally {
            loading = false;
        }
    }

    async function selectEntry(id) {
        selectedId = id;
        document.querySelectorAll(".entry-item").forEach((el) => {
            el.classList.toggle("selected", el.dataset.id == id);
        });
        tabContent.innerHTML = '<p class="placeholder">Loading...</p>';
        try {
            const resp = await fetch(`/api/entries/${id}`);
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            const pre = document.createElement("pre");
            pre.className = "raw-json";
            pre.textContent = JSON.stringify(data, null, 2);
            tabContent.replaceChildren(pre);
        } catch (err) {
            tabContent.innerHTML = '<p class="placeholder">Failed to load entry.</p>';
        }
    }

    // Load More button
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = "Load More";
    loadMoreBtn.addEventListener("click", loadEntries);
    entryList.appendChild(loadMoreBtn);

    // Initial load
    loadModels();
    loadEntries();
});
