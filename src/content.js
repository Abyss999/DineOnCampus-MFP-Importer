class DuplicateFoodError extends Error {}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "logFoods") {
    createFoods(message.foods, message.logToDiary, message.mealName, message.date, message.source, message.makePublic)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "fetchMealNames") {
    fetchMealNames()
      .then((names) => sendResponse({ success: true, mealNames: names }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});

async function createFoods(foods, logToDiary = false, mealName = "", date = "", source = "Dining Hall", makePublic = false) {
  const csrfToken = await getCSRFToken();
  if (!csrfToken) throw new Error("Could not find CSRF token. Make sure you're on an MFP page and logged in.");

  const userId = await getUserId();
  if (!userId) throw new Error("Could not find user ID on MFP page.");

  let loggedNames = [];
  let duplicateNames = [];
  let failed = 0;
  let diaryed = 0;

  for (const food of foods) {
    try {
      const result = await createFood(food, userId, csrfToken, source, makePublic);
      loggedNames.push(food.name);

      if (logToDiary && mealName) {
        try {
          const foodId = result?.item?.id || result?.id;
          if (foodId) {
            await addToDiary(foodId, mealName, date, csrfToken);
            diaryed++;
          }
        } catch (diaryErr) {
          console.warn(`[MFP Logger] Failed to add "${food.name}" to diary:`, diaryErr);
        }
      }
    } catch (err) {
      if (err instanceof DuplicateFoodError) {
        duplicateNames.push(food.name);
      } else {
        console.warn(`[MFP Logger] Failed to create "${food.name}":`, err);
        failed++;
      }
    }
  }

  return { success: true, loggedNames, duplicateNames, failed, diaryed };
}

async function fetchMealNames() {
  const res = await fetch("https://www.myfitnesspal.com/food/diary", {
    credentials: "include",
  });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  // td.first.alt holds the meal name directly (confirmed from MFP's current markup)
  const names = [...doc.querySelectorAll("tr.meal_header td.first.alt")]
    .map((el) => el.textContent.replace(/ /g, " ").trim())
    .filter((n) => n.length > 0 && n.length < 60);

  if (names.length >= 2) return names;

  return ["Breakfast", "Lunch", "Dinner", "Snacks"];
}

// NOTE: diary endpoint needs verification — capture the "Add to Diary" network request
// in MFP's UI to confirm the correct endpoint and payload format.
async function addToDiary(foodId, mealName, date, csrfToken) {
  const response = await fetch("https://www.myfitnesspal.com/api/diary/entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      diary_entry: {
        food_id: foodId,
        meal_name: mealName,
        date: date || new Date().toISOString().split("T")[0],
        amount: 1,
      },
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Diary HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function getCSRFToken() {
  try {
    const res = await fetch("https://www.myfitnesspal.com/api/auth/csrf", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.csrfToken) return data.csrfToken;
    }
  } catch (e) {
    console.warn("[MFP Logger] /api/auth/csrf failed:", e);
  }

  try {
    const res = await fetch("https://www.myfitnesspal.com/food/new", {
      credentials: "include",
    });
    const html = await res.text();
    const match = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/);
    if (match) return match[1];
  } catch (e) {
    console.warn("[MFP Logger] food/new fetch failed:", e);
  }

  return null;
}

async function getUserId() {
  try {
    const res = await fetch("https://www.myfitnesspal.com/api/auth/session", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      const id = data?.user?.id || data?.user?.userId || data?.userId;
      if (id) return String(id);
    }
  } catch (e) {
    console.warn("[MFP Logger] /api/auth/session failed:", e);
  }

  try {
    const el = document.getElementById("__NEXT_DATA__");
    if (el) {
      const data = JSON.parse(el.textContent);
      const id =
        data?.props?.pageProps?.session?.user?.id ||
        data?.props?.pageProps?.currentUser?.id ||
        data?.props?.pageProps?.user?.id;
      if (id) return String(id);
    }
  } catch (e) {}

  const profileLink = document.querySelector('a[href*="/profile/"]');
  if (profileLink) {
    const match = profileLink.href.match(/\/profile\/(\d+)/);
    if (match) return match[1];
  }

  return null;
}

async function createFood(food, userId, csrfToken, source = "Dining Hall", makePublic = false) {
  const body = {
    item: {
      user_id: userId,
      brand_name: source,
      description: food.name,
      nutritional_contents: {
        energy: { unit: "calories", value: food.calories },
        protein: food.protein,
        carbohydrates: food.carbs,
        fat: food.fats,
        sugar: food.sugar,
      },
      serving_sizes: [
        {
          value: 1,
          unit: /^(n\/a|na|-|)$/i.test((food.serving_size || "").trim()) ? "serving" : food.serving_size,
          nutrition_multiplier: 1,
        },
      ],
      public: makePublic,
      country_code: "US",
    },
  };

  const response = await fetch("https://www.myfitnesspal.com/api/services/foods", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 409 || (response.status === 422 && /already|duplicate|taken/i.test(text))) {
      throw new DuplicateFoodError(food.name);
    }
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}
