"use strict";

// LOCAL DEVELOPMENT ONLY.
// Do not point a public site at an unauthenticated LLM endpoint.
const API_URL = "http://127.0.0.1:8767/marketplace";

const byId = (id) => document.getElementById(id);

function showResult(data) {
  byId("decision").textContent = data.decision.decision;
  byId("reason").textContent = data.decision.reason;
  byId("power").textContent =
    "Idealized power upper bound: " +
    data.power_upper_bound_w + " W";

  const offers = byId("offers");
  offers.replaceChildren();

  for (const item of data.catalog_screening) {
    const container = document.createElement("div");
    container.className = "offer";

    const title = document.createElement("strong");
    title.textContent = item.product;

    const status = document.createElement("small");
    status.textContent = "Decision: " + item.status;

    const price = document.createElement("small");
    price.textContent =
      "Illustrative minimum price: $" +
      Number(item.minimum_price_usd).toFixed(2);

    container.append(title, status, price);
    offers.appendChild(container);
  }

  byId("ideas").textContent =
    data.ai_discovery.ideas || "No concepts returned.";

  const measurements = byId("measurements");
  measurements.replaceChildren();

  for (const item of data.next_measurements || []) {
    const li = document.createElement("li");
    li.textContent = item;
    measurements.appendChild(li);
  }

  byId("warning").textContent = data.warning || "";
  byId("results").hidden = false;
}

byId("market-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = byId("discover");
  const feedback = byId("feedback");

  button.disabled = true;
  feedback.classList.remove("error");
  feedback.textContent = "Running Chalk analysis...";
  byId("results").hidden = true;

  const payload = {
    panel: {
      id: byId("panel-id").value.trim(),
      voc_v: Number(byId("voc").value),
      isc_a: Number(byId("isc").value)
    },
    customer: {
      purpose: byId("purpose").value.trim(),
      budget_usd: Number(byId("budget").value),
      daily_runtime_hours: Number(byId("runtime").value)
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Marketplace request failed.");
    }

    showResult(data);
    feedback.textContent = "Analysis completed using Chalk.";
  } catch (error) {
    feedback.classList.add("error");
    feedback.textContent = error.name === "AbortError"
      ? "Request timed out. Please try again."
      : "Unable to complete analysis: " + error.message;
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});
