const TEMPLATE_HEADERS = "name,serving_size,calories,protein,carbs,fats,sugar";
const TEMPLATE_EXAMPLE =
  "\nChicken Breast,3 oz,140,26,0,3,0" +
  "\nBrown Rice,1/2 cup,110,3,23,1,0";

let foods = [];
let mealNamesLoaded = false;

// cache helpers 

function cacheKey(name, source) {
  return `${name.toLowerCase().trim()}|${source.toLowerCase().trim()}`;
}

function loadCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get("food_cache", (data) => resolve(data.food_cache || {}));
  });
}

function saveToCache(names, source) {
  loadCache().then((cache) => {
    for (const name of names) cache[cacheKey(name, source)] = true;
    chrome.storage.local.set({ food_cache: cache });
  });
}

// source + dairy preference 

chrome.storage.local.get(["pref_source", "pref_diary", "pref_public"], (data) => {
  if (data.pref_source) document.getElementById("source-input").value = data.pref_source;
  if (data.pref_public) document.getElementById("public-checkbox").checked = true;
  if (data.pref_diary) {
    document.getElementById("diary-checkbox").checked = true;
    document.getElementById("diary-checkbox").dispatchEvent(new Event("change"));
  }
});

document.getElementById("source-input").addEventListener("input", (e) => {
  chrome.storage.local.set({ pref_source: e.target.value });
});

document.getElementById("public-checkbox").addEventListener("change", (e) => {
  chrome.storage.local.set({ pref_public: e.target.checked });
});

document.getElementById("diary-checkbox").addEventListener("change", (e) => {
  chrome.storage.local.set({ pref_diary: e.target.checked });
});

// template downloader

document.getElementById("btn-template").addEventListener("click", () => {
  const blob = new Blob([TEMPLATE_HEADERS + TEMPLATE_EXAMPLE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mfp_food_template.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// csv import

document.getElementById("btn-import").addEventListener("click", () => {
  document.getElementById("csv-input").click();
});

document.getElementById("csv-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      foods = parseCSV(event.target.result);
      renderFoodList(foods);
      setStatus(`Loaded ${foods.length} food(s) from ${file.name}.`);
    } catch (err) {
      setStatus("Error parsing CSV: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// diary toggle

document.getElementById("diary-checkbox").addEventListener("change", async (e) => {
  const mealRow = document.getElementById("meal-row");
  const logBtn = document.getElementById("btn-log");

  if (e.target.checked) {
    mealRow.style.display = "block";
    if (foods.length > 0) logBtn.textContent = "Upload & Log to Diary";
    if (!mealNamesLoaded) await loadMealNames();
  } else {
    mealRow.style.display = "none";
    if (foods.length > 0) logBtn.textContent = "Upload Selected Foods to MFP";
  }
});

async function loadMealNames() {
  const select = document.getElementById("meal-select");
  select.innerHTML = '<option value="">Loading meals...</option>';
  select.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.includes("myfitnesspal.com")) {
    setStatus("Open MyFitnessPal first to load your meal names.");
    select.innerHTML = fallbackMealOptions();
    select.disabled = false;
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "fetchMealNames" }, (response) => {
    select.disabled = false;
    if (chrome.runtime.lastError || !response?.success) {
      select.innerHTML = fallbackMealOptions();
      return;
    }
    select.innerHTML = response.mealNames
      .map((name) => `<option value="${name}">${name}</option>`)
      .join("");
    mealNamesLoaded = true;
  });
}

function fallbackMealOptions() {
  return ["Breakfast", "Lunch", "Dinner", "Snacks"]
    .map((m) => `<option value="${m}">${m}</option>`)
    .join("");
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const required = ["name", "serving_size", "calories", "protein", "carbs", "fats"];
  for (const col of required) {
    if (!headers.includes(col)) throw new Error(`Missing required column: "${col}"`);
  }

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx].trim().replace(/^"|"$/g, "") : "";
    });

    return {
      name: row.name,
      serving_size: row.serving_size,
      calories: Number(row.calories) || 0,
      protein: Number(row.protein) || 0,
      carbs: Number(row.carbs) || 0,
      fats: Number(row.fats) || 0,
      sugar: Number(row.sugar) || 0,
    };
  });
}

// handles quoted fields with commas inside them
function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function renderFoodList(foods) {
  const list = document.getElementById("food-list");
  const controls = document.getElementById("select-controls");
  const logBtn = document.getElementById("btn-log");
  const isDiary = document.getElementById("diary-checkbox").checked;

  if (foods.length === 0) {
    list.innerHTML = '<div class="empty-state">No foods found in CSV.</div>';
    controls.style.display = "none";
    logBtn.disabled = true;
    return;
  }

  controls.style.display = "flex";
  logBtn.disabled = false;
  logBtn.textContent = isDiary ? "Upload & Log to Diary" : "Upload Selected Foods to MFP";

  list.innerHTML = foods
    .map(
      (food, i) => `
    <div class="food-item">
      <input type="checkbox" id="food-${i}" data-index="${i}" checked />
      <label for="food-${i}">
        <div>${food.name}</div>
        <div class="food-meta">${food.serving_size} &bull; ${food.calories} cal &bull; P: ${food.protein}g C: ${food.carbs}g F: ${food.fats}g</div>
      </label>
    </div>`
    )
    .join("");
}

document.getElementById("btn-select-all").addEventListener("click", () => {
  document.querySelectorAll("#food-list input[type=checkbox]").forEach((cb) => (cb.checked = true));
});

document.getElementById("btn-deselect-all").addEventListener("click", () => {
  document.querySelectorAll("#food-list input[type=checkbox]").forEach((cb) => (cb.checked = false));
});

document.getElementById("btn-log").addEventListener("click", async () => {
  const checked = [...document.querySelectorAll("#food-list input[type=checkbox]:checked")].map(
    (cb) => foods[Number(cb.dataset.index)]
  );

  if (checked.length === 0) {
    setStatus("No foods selected.");
    return;
  }

  const source = document.getElementById("source-input").value.trim() || "Dining Hall";

  const zeroCalCount = checked.filter((f) => f.calories <= 0).length;
  const nonZero = checked.filter((f) => f.calories > 0);

  const cache = await loadCache();
  const cacheHits = nonZero.filter((f) => cache[cacheKey(f.name, source)]);
  const toUpload = nonZero.filter((f) => !cache[cacheKey(f.name, source)]);
  const cachedCount = cacheHits.length;

  if (toUpload.length === 0) {
    showStats(0, cachedCount, zeroCalCount, 0);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.includes("myfitnesspal.com")) {
    setStatus("Please open MyFitnessPal in the active tab first.");
    return;
  }

  const logToDiary = document.getElementById("diary-checkbox").checked;
  const mealName = document.getElementById("meal-select").value;
  const makePublic = document.getElementById("public-checkbox").checked;

  const actionLabel = logToDiary
    ? `Uploading ${toUpload.length} food(s) and logging to "${mealName}"...`
    : `Uploading ${toUpload.length} food(s) to MFP...`;
  setStatus(actionLabel);
  document.getElementById("btn-log").disabled = true;

  chrome.tabs.sendMessage(
    tab.id,
    {
      action: "logFoods",
      foods: toUpload,
      logToDiary,
      mealName,
      source,
      makePublic,
      date: new Date().toISOString().split("T")[0],
    },
    (response) => {
      document.getElementById("btn-log").disabled = false;
      if (chrome.runtime.lastError) {
        setStatus("Error: could not reach content script. Reload the MFP tab and try again.");
        return;
      }
      if (response?.success) {
        // cache newly uploaded + server-side duplicates (both exist in MFP now)
        saveToCache([...response.loggedNames, ...response.duplicateNames], source);
        const totalDuplicates = cachedCount + response.duplicateNames.length;
        showStats(response.loggedNames.length, totalDuplicates, zeroCalCount, response.failed);
      } else {
        setStatus("Error: " + (response?.error ?? "Unknown error."));
      }
    }
  );
});

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function showStats(added, duplicates, zeroCal, failed) {
  const stats = [
    { label: "Added", value: added, cls: "stat-added" },
    { label: "Duplicates", value: duplicates, cls: "stat-duplicate" },
    { label: "Skipped (0 cal)", value: zeroCal, cls: "stat-skipped" },
  ];
  if (failed > 0) stats.push({ label: "Failed", value: failed, cls: "stat-failed" });

  document.getElementById("status").innerHTML =
    `<div class="stat-row">${stats.map((s) => `<span class="stat ${s.cls}">${s.value} ${s.label}</span>`).join("")}</div>`;
}
