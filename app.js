const HOLDINGS_STORAGE_KEY = "uob-gold-tracker-holdings-v1";
const UOB_HISTORY_URL = "data/history.json";
const FREE_GOLD_API_URL = "https://freegoldapi.com/data/latest.json";
const FRANKFURTER_API_URL = "https://api.frankfurter.dev/v1/";

const elements = {
  refreshBtn: document.getElementById("refreshBtn"),
  hardRefreshBtn: document.getElementById("hardRefreshBtn"),
  productSelect: document.getElementById("productSelect"),
  rangeSelect: document.getElementById("rangeSelect"),
  granularitySelect: document.getElementById("granularitySelect"),
  globalGoldCurrencySelect: document.getElementById("globalGoldCurrencySelect"),
  globalGoldUnitSelect: document.getElementById("globalGoldUnitSelect"),
  globalGoldViewSelect: document.getElementById("globalGoldViewSelect"),
  uobTimestamp: document.getElementById("uobTimestamp"),
  appTimestamp: document.getElementById("appTimestamp"),
  bankSellValue: document.getElementById("bankSellValue"),
  bankBuyValue: document.getElementById("bankBuyValue"),
  sellDelta: document.getElementById("sellDelta"),
  buyDelta: document.getElementById("buyDelta"),
  snapshotCount: document.getElementById("snapshotCount"),
  historyNote: document.getElementById("historyNote"),
  latestTableBody: document.getElementById("latestTableBody"),
  chartCanvas: document.getElementById("historyChart"),
  chartEmpty: document.getElementById("chartEmpty"),
  chartStatus: document.getElementById("chartStatus"),
  historyChartTooltip: document.getElementById("historyChartTooltip"),
  globalGoldLatestValue: document.getElementById("globalGoldLatestValue"),
  globalGoldNote: document.getElementById("globalGoldNote"),
  globalGoldStartValue: document.getElementById("globalGoldStartValue"),
  globalGoldStartDate: document.getElementById("globalGoldStartDate"),
  globalGoldChangeValue: document.getElementById("globalGoldChangeValue"),
  globalGoldChangeDate: document.getElementById("globalGoldChangeDate"),
  globalGoldPointCount: document.getElementById("globalGoldPointCount"),
  globalGoldUpdatedAt: document.getElementById("globalGoldUpdatedAt"),
  globalGoldChart: document.getElementById("globalGoldChart"),
  globalGoldTooltip: document.getElementById("globalGoldTooltip"),
  globalGoldEmpty: document.getElementById("globalGoldEmpty"),
  globalGoldChartShell: document.getElementById("globalGoldChartShell"),
  forecastCards: document.getElementById("forecastCards"),
  forecastChart: document.getElementById("forecastChart"),
  forecastEmpty: document.getElementById("forecastEmpty"),
  holdingProductSelect: document.getElementById("holdingProductSelect"),
  holdingBoughtPriceInput: document.getElementById("holdingBoughtPriceInput"),
  addHoldingBtn: document.getElementById("addHoldingBtn"),
  holdingsTableBody: document.getElementById("holdingsTableBody"),
};

const state = {
  latest: null,
  history: [],
  selectedProductId: "GSA|1 GM",
  chartHoverIndex: null,
  chartPinnedIndex: null,
  chartGroupedPoints: [],
  globalGold: {
    currency: "USD",
    unit: "ozt",
    view: "year",
    loading: false,
    points: [],
    summary: null,
    updatedAt: "",
    hoverIndex: null,
    forecast: [],
  },
  holdings: loadHoldings(),
  loading: false,
};

function loadHoldings() {
  try {
    return JSON.parse(localStorage.getItem(HOLDINGS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistHoldings() {
  localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(state.holdings));
}

function currency(value, selectedCurrency = "SGD") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: selectedCurrency,
    maximumFractionDigits: 2,
  }).format(value);
}

function signedCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "No earlier snapshot yet.";
  }
  const formatter = new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    signDisplay: "always",
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}

function formatApiTimestamp(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  return date.toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatUobTimestamp(snapshot) {
  if (!snapshot) {
    return "Waiting for the first fetch…";
  }

  const time = snapshot.sourceTime || "";
  const hh = time.slice(0, 2) || "00";
  const mm = time.slice(2, 4) || "00";
  const ss = time.slice(4, 6) || "00";
  return `Saved UOB snapshot as at ${snapshot.sourceDate}, ${hh}:${mm}:${ss}`;
}

function getAllProducts() {
  return state.latest?.items || [];
}

function snapshotSortKey(snapshot) {
  const datePart = String(snapshot?.sourceDate || "");
  const timePart = String(snapshot?.sourceTime || "").padStart(6, "0");
  return `${datePart}|${timePart}`;
}

function getLatestSnapshot(history) {
  if (!Array.isArray(history) || !history.length) {
    return null;
  }

  return [...history].sort((left, right) => snapshotSortKey(left).localeCompare(snapshotSortKey(right))).at(-1) || null;
}

function ensureSelectedProduct() {
  const products = getAllProducts();
  if (!products.length) {
    state.selectedProductId = "";
    return;
  }

  const exists = products.some((item) => item.id === state.selectedProductId);
  if (!exists) {
    state.selectedProductId = products[0].id;
  }
}

function renderProductOptions() {
  const products = getAllProducts();
  ensureSelectedProduct();
  const options = products
    .map((item) => {
      const selected = item.id === state.selectedProductId ? "selected" : "";
      return `<option value="${item.id}" ${selected}>${item.name} • ${item.unit}</option>`;
    })
    .join("");

  elements.productSelect.innerHTML = options;
  elements.holdingProductSelect.innerHTML = products
    .map((item) => `<option value="${item.id}">${item.name} • ${item.unit}</option>`)
    .join("");
}

function renderLatestTable() {
  const items = getAllProducts();
  if (!items.length) {
    elements.latestTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="4">No UOB data loaded yet.</td>
      </tr>
    `;
    return;
  }

  elements.latestTableBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.unit}</td>
          <td>${currency(item.bankSell)}</td>
          <td>${currency(item.bankBuy)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderHoldingsTable() {
  const products = getAllProducts();
  if (!state.holdings.length) {
    elements.holdingsTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No saved products yet.</td>
      </tr>
    `;
    return;
  }

  elements.holdingsTableBody.innerHTML = state.holdings
    .map((holding, index) => {
      const product = products.find((item) => item.id === holding.productId);
      const label = product ? `${product.name} • ${product.unit}` : holding.label;
      const bankBuy = product?.bankBuy ?? null;
      const difference = typeof bankBuy === "number" ? bankBuy - holding.boughtPrice : null;
      const percent = typeof difference === "number" && holding.boughtPrice > 0
        ? (difference / holding.boughtPrice) * 100
        : null;
      const differenceClass = typeof difference === "number"
        ? difference >= 0 ? "positive-cell" : "negative-cell"
        : "";
      const percentClass = typeof percent === "number"
        ? percent >= 0 ? "positive-cell" : "negative-cell"
        : "";

      return `
        <tr>
          <td>${label}</td>
          <td>${currency(holding.boughtPrice)}</td>
          <td>${currency(bankBuy)}</td>
          <td class="${differenceClass}">${typeof difference === "number" ? signedCurrency(difference) : "-"}</td>
          <td class="${percentClass}">${typeof percent === "number" ? `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%` : "-"}</td>
          <td><button class="ghost-button table-action-button" type="button" data-remove-holding="${index}">Remove</button></td>
        </tr>
      `;
    })
    .join("");
}

function getProductHistory(productId) {
  return state.history
    .map((snapshot) => {
      const item = (snapshot.items || []).find((entry) => entry.id === productId);
      if (!item) {
        return null;
      }

      return {
        fetchedAt: snapshot.fetchedAt,
        labelDate: snapshot.sourceDate,
        labelTime: snapshot.sourceTime,
        bankSell: item.bankSell,
        bankBuy: item.bankBuy,
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.fetchedAt) - new Date(right.fetchedAt));
}

function groupLabel(date, granularity) {
  if (granularity === "hour") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}`;
  }
  if (granularity === "year") {
    return String(date.getFullYear());
  }
  if (granularity === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function humanLabel(groupKey, granularity) {
  if (granularity === "hour") {
    const [datePart, hourPart] = groupKey.split("T");
    return new Date(`${datePart}T${hourPart}:00:00`).toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      hour: "numeric",
    });
  }

  if (granularity === "year") {
    return groupKey;
  }

  if (granularity === "month") {
    const [year, month] = groupKey.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-SG", {
      month: "short",
      year: "numeric",
    });
  }

  return new Date(`${groupKey}T00:00:00`).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function applyRange(entries) {
  const value = elements.rangeSelect.value;
  return applyRangeByValue(entries, value);
}

function applyRangeByValue(entries, value) {
  if (value === "all") {
    return entries;
  }

  const days = Number(value);
  if (!days || !entries.length) {
    return entries;
  }

  const cutoff = new Date(entries[entries.length - 1].fetchedAt);
  cutoff.setDate(cutoff.getDate() - days);
  return entries.filter((entry) => new Date(entry.fetchedAt) >= cutoff);
}

function summarizeEntries(entries, granularity) {
  const buckets = new Map();

  entries.forEach((entry) => {
    const date = new Date(entry.fetchedAt);
    const key = groupLabel(date, granularity);
    buckets.set(key, {
      key,
      label: humanLabel(key, granularity),
      bankSell: entry.bankSell,
      bankBuy: entry.bankBuy,
      fetchedAt: entry.fetchedAt,
      rawDate: entry.labelDate,
      rawTime: entry.labelTime,
    });
  });

  return [...buckets.values()].sort((left, right) => new Date(left.fetchedAt) - new Date(right.fetchedAt));
}

function updateSpotlight() {
  const productId = state.selectedProductId;
  const latestItem = getAllProducts().find((item) => item.id === productId);
  const history = getProductHistory(productId);

  elements.snapshotCount.textContent = String(history.length);
  elements.uobTimestamp.textContent = formatUobTimestamp(state.latest);
  elements.appTimestamp.textContent = state.latest ? `Saved locally ${formatApiTimestamp(state.latest.fetchedAt)}` : "";

  if (!latestItem) {
    elements.bankSellValue.textContent = "-";
    elements.bankBuyValue.textContent = "-";
    elements.sellDelta.textContent = "Choose a gold product once data is loaded.";
    elements.buyDelta.textContent = "Choose a gold product once data is loaded.";
    return;
  }

  elements.bankSellValue.textContent = currency(latestItem.bankSell);
  elements.bankBuyValue.textContent = currency(latestItem.bankBuy);

  if (history.length >= 2) {
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const sellDelta = current.bankSell - previous.bankSell;
    const buyDelta = current.bankBuy - previous.bankBuy;
    elements.sellDelta.textContent = `Change vs previous snapshot: ${signedCurrency(sellDelta)}`;
    elements.buyDelta.textContent = `Change vs previous snapshot: ${signedCurrency(buyDelta)}`;
  } else {
    elements.sellDelta.textContent = "Need at least two snapshots to show movement.";
    elements.buyDelta.textContent = "Keep refreshing over time to build history.";
  }

  elements.historyNote.textContent = history.length
    ? `Tracking ${latestItem.name} ${latestItem.unit} with locally saved snapshots.`
    : "Refresh regularly to build a richer chart.";
}

function drawChartToCanvas({ canvas, emptyState, entries, granularity }) {
  const summarized = summarizeEntries(entries, granularity);
  state.chartGroupedPoints = canvas === elements.chartCanvas ? summarized : state.chartGroupedPoints;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (summarized.length < 2) {
    emptyState.style.display = "grid";
    if (canvas === elements.chartCanvas) {
      elements.historyChartTooltip.classList.add("chart-tooltip-hidden");
    }
    return;
  }

  emptyState.style.display = "none";

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 26, right: 28, bottom: 72, left: 82 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = summarized.flatMap((entry) => [entry.bankSell, entry.bankBuy]).filter((value) => typeof value === "number");
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || 1;
  const yMin = minValue - spread * 0.08;
  const yMax = maxValue + spread * 0.08;

  const xForIndex = (index) => padding.left + (plotWidth * index) / (summarized.length - 1);
  const yForValue = (value) => padding.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

  ctx.strokeStyle = "rgba(38, 46, 43, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "13px Space Grotesk";
  ctx.fillStyle = "#44514a";

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = padding.top + plotHeight * ratio;
    const value = yMax - (yMax - yMin) * ratio;

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillText(currency(value), 12, y + 4);
  }

  ctx.strokeStyle = "rgba(38, 46, 43, 0.2)";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  function drawSeries(key, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    summarized.forEach((entry, index) => {
      const x = xForIndex(index);
      const y = yForValue(entry[key]);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    ctx.fillStyle = color;
    summarized.forEach((entry, index) => {
      const x = xForIndex(index);
      const y = yForValue(entry[key]);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawSeries("bankSell", "#d08b2e");
  drawSeries("bankBuy", "#1f7a64");

  const activeIndex = canvas === elements.chartCanvas
    ? (state.chartPinnedIndex ?? state.chartHoverIndex)
    : null;

  if (canvas === elements.chartCanvas && activeIndex != null) {
    const activePoint = summarized[activeIndex];
    if (activePoint) {
      const x = xForIndex(activeIndex);
      const sellY = yForValue(activePoint.bankSell);
      const buyY = yForValue(activePoint.bankBuy);

      ctx.strokeStyle = "rgba(29, 36, 31, 0.35)";
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      ctx.fillStyle = "#d08b2e";
      ctx.beginPath();
      ctx.arc(x, sellY, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1f7a64";
      ctx.beginPath();
      ctx.arc(x, buyY, 5.5, 0, Math.PI * 2);
      ctx.fill();

      const tooltip = elements.historyChartTooltip;
      tooltip.classList.remove("chart-tooltip-hidden");
      tooltip.innerHTML = `
        <strong>${activePoint.label}</strong>
        <span>Bank sells: ${currency(activePoint.bankSell)}</span>
        <span>Bank buys: ${currency(activePoint.bankBuy)}</span>
        <span>Snapshot: ${activePoint.rawDate || ""} ${activePoint.rawTime ? `${activePoint.rawTime.slice(0,2)}:${activePoint.rawTime.slice(2,4)}:${activePoint.rawTime.slice(4,6)}` : ""}</span>
      `;

      const maxLeft = canvas.clientWidth - 210;
      const left = Math.max(12, Math.min((x / canvas.width) * canvas.clientWidth + 12, maxLeft));
      const top = Math.max(12, (Math.min(sellY, buyY) / canvas.height) * canvas.clientHeight - 96);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  } else if (canvas === elements.chartCanvas) {
    elements.historyChartTooltip.classList.add("chart-tooltip-hidden");
  }

  ctx.fillStyle = "#44514a";
  ctx.textAlign = "center";

  summarized.forEach((entry, index) => {
    const x = xForIndex(index);
    ctx.fillText(entry.label, x, height - 28);
  });

  ctx.textAlign = "left";
}

function drawChart() {
  const productHistory = getProductHistory(state.selectedProductId);
  const filtered = applyRange(productHistory);
  const summarized = summarizeEntries(filtered, elements.granularitySelect.value);
  if (state.chartHoverIndex != null && state.chartHoverIndex >= summarized.length) {
    state.chartHoverIndex = null;
  }
  if (state.chartPinnedIndex != null && state.chartPinnedIndex >= summarized.length) {
    state.chartPinnedIndex = null;
  }

  elements.chartStatus.textContent = `${productHistory.length} raw snapshots, ${filtered.length} in selected window, ${summarized.length} grouped points shown.`;

  drawChartToCanvas({
    canvas: elements.chartCanvas,
    emptyState: elements.chartEmpty,
    entries: filtered,
    granularity: elements.granularitySelect.value,
  });
}

function updateUobChartHoverFromClientX(clientX) {
  const points = state.chartGroupedPoints;
  if (points.length < 2) {
    return null;
  }

  const rect = elements.chartCanvas.getBoundingClientRect();
  const relativeX = ((clientX - rect.left) / rect.width) * elements.chartCanvas.width;
  const paddingLeft = 82;
  const plotWidth = elements.chartCanvas.width - 82 - 28;
  const rawIndex = ((relativeX - paddingLeft) / plotWidth) * (points.length - 1);
  const clampedIndex = Math.max(0, Math.min(points.length - 1, Math.round(rawIndex)));
  return clampedIndex;
}

function setUobChartHover(clientX) {
  const index = updateUobChartHoverFromClientX(clientX);
  if (index == null) {
    return;
  }
  state.chartHoverIndex = index;
  drawChart();
}

function humanUnit(unit) {
  if (unit === "gram") {
    return "gram";
  }
  if (unit === "kg") {
    return "kilogram";
  }
  return "troy ounce";
}

function humanView(view) {
  if (view === "day") {
    return "day";
  }
  if (view === "month") {
    return "month";
  }
  return "year";
}

function signedNumber(value, currency) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    signDisplay: "always",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPointDate(dateString, view) {
  const date = new Date(`${dateString}T00:00:00`);
  if (view === "year") {
    return date.toLocaleDateString("en-SG", { year: "numeric" });
  }
  if (view === "month") {
    return date.toLocaleDateString("en-SG", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

async function loadGlobalGoldData() {
  if (state.globalGold.loading) {
    return;
  }

  state.globalGold.loading = true;
  elements.globalGoldEmpty.style.display = "grid";
  elements.globalGoldEmpty.textContent = "Loading global gold history…";

  try {
    const payload = await buildGlobalGoldPayloadClient(
      state.globalGold.currency,
      state.globalGold.unit,
      state.globalGold.view,
    );

    state.globalGold.points = payload.points || [];
    state.globalGold.summary = payload.summary;
    state.globalGold.updatedAt = payload.updatedAt;
    state.globalGold.hoverIndex = null;
    renderGlobalGoldSection();
  } catch (error) {
    state.globalGold.points = [];
    state.globalGold.summary = null;
    elements.globalGoldEmpty.style.display = "grid";
    elements.globalGoldEmpty.textContent = error.message;
  } finally {
    state.globalGold.loading = false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }
  return response.json();
}

function getWindowStart(view) {
  const date = new Date();
  if (view === "day") {
    date.setDate(date.getDate() - 35);
    return date;
  }
  if (view === "month") {
    date.setDate(date.getDate() - 760);
    return date;
  }
  date.setDate(date.getDate() - 3652);
  return date;
}

function bucketGlobalGoldPoints(entries, view) {
  const grouped = new Map();

  entries.forEach((entry) => {
    let key = entry.date;
    if (view === "year") {
      key = entry.date.slice(0, 4);
    } else if (view === "month") {
      key = entry.date.slice(0, 7);
    }

    grouped.set(key, entry);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function convertGlobalGoldPrice(pricePerOztUsd, rate, unit) {
  const converted = pricePerOztUsd * rate;
  if (unit === "gram") {
    return converted / 31.1034768;
  }
  if (unit === "kg") {
    return converted * 32.1507465686;
  }
  return converted;
}

async function buildGlobalGoldPayloadClient(selectedCurrency, unit, view) {
  const rawItems = await fetchJson(FREE_GOLD_API_URL);
  const windowStart = getWindowStart(view);
  const filtered = rawItems
    .filter((item) => item?.date && item?.price != null && item.date >= "1999-01-01")
    .filter((item) => new Date(`${item.date}T00:00:00`) >= windowStart)
    .map((item) => ({
      date: item.date,
      price: Number(item.price),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  if (!filtered.length) {
    throw new Error("No global gold history was returned for this view.");
  }

  let fxRates = {};
  if (selectedCurrency === "SGD") {
    const startDate = filtered[0].date;
    const endDate = filtered[filtered.length - 1].date;
    const fxPayload = await fetchJson(`${FRANKFURTER_API_URL}${startDate}..${endDate}?base=USD&symbols=SGD`);
    fxRates = fxPayload.rates || {};
  }

  const fxDates = Object.keys(fxRates).sort();
  let latestRate = selectedCurrency === "SGD" && fxDates.length
    ? Number(fxRates[fxDates[0]].SGD)
    : 1;

  const convertedEntries = filtered.map((item) => {
    if (selectedCurrency === "SGD" && fxRates[item.date]?.SGD) {
      latestRate = Number(fxRates[item.date].SGD);
    }

    return {
      date: item.date,
      price: Number(convertGlobalGoldPrice(item.price, latestRate, unit).toFixed(4)),
      currency: selectedCurrency,
      unit,
    };
  });

  const points = bucketGlobalGoldPoints(convertedEntries, view);
  const firstPoint = points[0];
  const latestPoint = points[points.length - 1];

  return {
    points,
    summary: {
      latestPrice: latestPoint.price,
      latestDate: latestPoint.date,
      change: Number((latestPoint.price - firstPoint.price).toFixed(4)),
      pointCount: points.length,
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildForecast(points) {
  if (!points || points.length < 4) {
    return [];
  }

  const horizons = [
    { label: "3 days", days: 3 },
    { label: "15 days", days: 15 },
    { label: "1 month", days: 30 },
    { label: "3 months", days: 90 },
    { label: "6 months", days: 180 },
    { label: "1 year", days: 365 },
  ];

  const recent = points.slice(-Math.min(points.length, 30));
  const returns = [];
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1].price;
    const current = recent[index].price;
    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }

  const averageReturn = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0;
  const volatility = returns.length
    ? Math.sqrt(returns.reduce((sum, value) => sum + ((value - averageReturn) ** 2), 0) / returns.length)
    : 0;
  const latest = points[points.length - 1];
  const boundedReturn = Math.max(-0.015, Math.min(0.015, averageReturn));
  const boundedVolatility = Math.max(0.002, Math.min(0.04, volatility));

  return horizons.map((horizon) => {
    const projected = latest.price * Math.exp(boundedReturn * Math.min(horizon.days, 120));
    const band = boundedVolatility * Math.sqrt(Math.min(horizon.days, 90)) * 0.45;
    const cappedProjected = Math.max(latest.price * 0.45, Math.min(latest.price * 2.4, projected));
    const low = Math.max(latest.price * 0.3, cappedProjected * Math.exp(-band));
    const high = Math.min(latest.price * 3.2, cappedProjected * Math.exp(band));
    return {
      ...horizon,
      price: Number(cappedProjected.toFixed(2)),
      low: Number(low.toFixed(2)),
      high: Number(high.toFixed(2)),
    };
  });
}

function compactCurrency(value, selectedCurrency) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: selectedCurrency,
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 2,
  }).format(value);
}

function renderGlobalGoldSection() {
  const { points, summary, currency: selectedCurrency, unit, view, updatedAt } = state.globalGold;

  if (!summary || !points.length) {
    elements.globalGoldLatestValue.textContent = "-";
    elements.globalGoldStartValue.textContent = "-";
    elements.globalGoldChangeValue.textContent = "-";
    elements.globalGoldPointCount.textContent = "0";
    elements.globalGoldNote.textContent = "Move your cursor across the chart to inspect exact prices.";
    elements.globalGoldStartDate.textContent = "-";
    elements.globalGoldChangeDate.textContent = "-";
    elements.globalGoldUpdatedAt.textContent = "Waiting for history data.";
    state.globalGold.forecast = [];
    renderForecastSection();
    drawGlobalGoldChart();
    return;
  }

  const firstPoint = points[0];
  const latestPoint = points[points.length - 1];
  elements.globalGoldLatestValue.textContent = currency(summary.latestPrice, selectedCurrency);
  elements.globalGoldStartValue.textContent = currency(firstPoint.price, selectedCurrency);
  elements.globalGoldChangeValue.textContent = signedNumber(summary.change, selectedCurrency);
  elements.globalGoldPointCount.textContent = String(summary.pointCount);
  elements.globalGoldStartDate.textContent = `From ${formatPointDate(firstPoint.date, view)} per ${humanUnit(unit)}`;
  elements.globalGoldChangeDate.textContent = `To ${formatPointDate(latestPoint.date, view)} per ${humanUnit(unit)}`;
  elements.globalGoldUpdatedAt.textContent = `Updated ${formatApiTimestamp(updatedAt)}`;
  elements.globalGoldNote.textContent = `Hover the chart to see the exact ${selectedCurrency} gold price per ${humanUnit(unit)} in ${humanView(view)} view.`;
  state.globalGold.forecast = buildForecast(points);
  renderForecastSection();
  drawGlobalGoldChart();
}

function renderForecastSection() {
  const forecast = state.globalGold.forecast || [];
  const selectedCurrency = state.globalGold.currency;
  const unit = state.globalGold.unit;

  if (!forecast.length) {
    elements.forecastCards.innerHTML = `
      <article class="price-card history compact-card">
        <span class="price-label">Forecast unavailable</span>
        <strong>-</strong>
        <span class="delta-text">Need more recent history to estimate a projection.</span>
      </article>
    `;
    elements.forecastEmpty.style.display = "grid";
    const ctx = elements.forecastChart.getContext("2d");
    ctx.clearRect(0, 0, elements.forecastChart.width, elements.forecastChart.height);
    return;
  }

  elements.forecastCards.innerHTML = forecast.map((entry) => `
    <article class="price-card history compact-card">
      <span class="price-label">${entry.label}</span>
      <strong class="forecast-value">${compactCurrency(entry.price, selectedCurrency)}</strong>
      <span class="delta-text">${compactCurrency(entry.low, selectedCurrency)} to ${compactCurrency(entry.high, selectedCurrency)} per ${humanUnit(unit)}</span>
    </article>
  `).join("");

  drawForecastChart(forecast, selectedCurrency);
}

function drawForecastChart(forecast, selectedCurrency) {
  const canvas = elements.forecastChart;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (forecast.length < 2) {
    elements.forecastEmpty.style.display = "grid";
    return;
  }

  elements.forecastEmpty.style.display = "none";

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 20, right: 24, bottom: 52, left: 82 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = forecast.flatMap((entry) => [entry.low, entry.price, entry.high]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || 1;
  const yMin = minValue - spread * 0.08;
  const yMax = maxValue + spread * 0.08;

  const xForIndex = (index) => padding.left + (plotWidth * index) / (forecast.length - 1);
  const yForValue = (value) => padding.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

  ctx.strokeStyle = "rgba(38, 46, 43, 0.14)";
  ctx.lineWidth = 1;
  ctx.font = "12px Space Grotesk";
  ctx.fillStyle = "#44514a";

  for (let step = 0; step <= 3; step += 1) {
    const ratio = step / 3;
    const y = padding.top + plotHeight * ratio;
    const value = yMax - (yMax - yMin) * ratio;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(currency(value, selectedCurrency), 12, y + 4);
  }

  ctx.strokeStyle = "rgba(31, 122, 100, 0.25)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  forecast.forEach((entry, index) => {
    const x = xForIndex(index);
    ctx.beginPath();
    ctx.moveTo(x, yForValue(entry.low));
    ctx.lineTo(x, yForValue(entry.high));
    ctx.stroke();
  });

  ctx.strokeStyle = "#1f7a64";
  ctx.lineWidth = 3;
  ctx.beginPath();
  forecast.forEach((entry, index) => {
    const x = xForIndex(index);
    const y = yForValue(entry.price);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#1f7a64";
  forecast.forEach((entry, index) => {
    const x = xForIndex(index);
    const y = yForValue(entry.price);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(entry.label, x - 20, height - 18);
  });
}

function drawGlobalGoldChart() {
  const canvas = elements.globalGoldChart;
  const tooltip = elements.globalGoldTooltip;
  const ctx = canvas.getContext("2d");
  const points = state.globalGold.points;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (points.length < 2) {
    elements.globalGoldEmpty.style.display = "grid";
    tooltip.classList.add("chart-tooltip-hidden");
    return;
  }

  elements.globalGoldEmpty.style.display = "none";

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 28, right: 26, bottom: 68, left: 86 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.price);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || 1;
  const yMin = minValue - spread * 0.08;
  const yMax = maxValue + spread * 0.08;

  const xForIndex = (index) => padding.left + (plotWidth * index) / (points.length - 1);
  const yForValue = (value) => padding.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

  ctx.strokeStyle = "rgba(38, 46, 43, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "13px Space Grotesk";
  ctx.fillStyle = "#44514a";

  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = padding.top + plotHeight * ratio;
    const value = yMax - (yMax - yMin) * ratio;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(currency(value, state.globalGold.currency), 12, y + 4);
  }

  ctx.strokeStyle = "#1f7a64";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xForIndex(index);
    const y = yForValue(point.price);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#1f7a64";
  points.forEach((point, index) => {
    const x = xForIndex(index);
    const y = yForValue(point.price);
    ctx.beginPath();
    ctx.arc(x, y, 3.8, 0, Math.PI * 2);
    ctx.fill();
  });

  const labelIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((value, index, array) => array.indexOf(value) === index);
  ctx.fillStyle = "#44514a";
  ctx.textAlign = "center";
  labelIndexes.forEach((index) => {
    const x = xForIndex(index);
    ctx.fillText(formatPointDate(points[index].date, state.globalGold.view), x, height - 24);
  });
  ctx.textAlign = "left";

  if (state.globalGold.hoverIndex != null) {
    const point = points[state.globalGold.hoverIndex];
    const x = xForIndex(state.globalGold.hoverIndex);
    const y = yForValue(point.price);
    ctx.strokeStyle = "rgba(29, 36, 31, 0.35)";
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = "#d08b2e";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    tooltip.classList.remove("chart-tooltip-hidden");
    tooltip.innerHTML = `
      <strong>${new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: state.globalGold.currency,
        maximumFractionDigits: 2,
      }).format(point.price)}</strong>
      <span>${formatPointDate(point.date, state.globalGold.view)}</span>
      <span>Per ${humanUnit(state.globalGold.unit)}</span>
    `;

    const maxLeft = canvas.clientWidth - 170;
    const left = Math.max(12, Math.min((x / canvas.width) * canvas.clientWidth + 12, maxLeft));
    const top = Math.max(12, (y / canvas.height) * canvas.clientHeight - 72);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  } else {
    tooltip.classList.add("chart-tooltip-hidden");
  }
}

function syncUi() {
  renderProductOptions();
  renderLatestTable();
  renderHoldingsTable();
  updateSpotlight();
  drawChart();
  renderGlobalGoldSection();
}

function addHolding() {
  const productId = elements.holdingProductSelect.value;
  const boughtPrice = Number(elements.holdingBoughtPriceInput.value);
  const product = getAllProducts().find((item) => item.id === productId);

  if (!product || !Number.isFinite(boughtPrice) || boughtPrice <= 0) {
    return;
  }

  state.holdings.unshift({
    productId,
    label: `${product.name} • ${product.unit}`,
    boughtPrice,
  });
  persistHoldings();
  renderHoldingsTable();
  elements.holdingBoughtPriceInput.value = "";
}

async function loadData({ refresh = false } = {}) {
  if (state.loading) {
    return;
  }

  state.loading = true;
  elements.refreshBtn.disabled = true;
  elements.refreshBtn.textContent = refresh ? "Reloading…" : "Loading…";

  try {
    const history = await fetchJson(`${UOB_HISTORY_URL}?ts=${Date.now()}`);
    state.history = Array.isArray(history) ? history : [];
    state.latest = getLatestSnapshot(state.history);
    ensureSelectedProduct();
    syncUi();
  } catch (error) {
    elements.uobTimestamp.textContent = error.message;
  } finally {
    state.loading = false;
    elements.refreshBtn.disabled = false;
    elements.refreshBtn.textContent = "Reload saved prices";
  }
}

elements.refreshBtn.addEventListener("click", () => {
  loadData({ refresh: true });
});

elements.hardRefreshBtn.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("reload", String(Date.now()));
  window.location.replace(url.toString());
});

elements.productSelect.addEventListener("change", (event) => {
  state.selectedProductId = event.target.value;
  state.chartHoverIndex = null;
  state.chartPinnedIndex = null;
  syncUi();
});

elements.rangeSelect.addEventListener("change", () => {
  state.chartHoverIndex = null;
  state.chartPinnedIndex = null;
  drawChart();
});

elements.granularitySelect.addEventListener("change", () => {
  state.chartHoverIndex = null;
  state.chartPinnedIndex = null;
  drawChart();
});

elements.globalGoldCurrencySelect.addEventListener("change", (event) => {
  state.globalGold.currency = event.target.value;
  loadGlobalGoldData();
});

elements.globalGoldUnitSelect.addEventListener("change", (event) => {
  state.globalGold.unit = event.target.value;
  loadGlobalGoldData();
});

elements.globalGoldViewSelect.addEventListener("change", (event) => {
  state.globalGold.view = event.target.value;
  loadGlobalGoldData();
});

elements.globalGoldChart.addEventListener("mousemove", (event) => {
  const points = state.globalGold.points;
  if (points.length < 2) {
    return;
  }

  const rect = elements.globalGoldChart.getBoundingClientRect();
  const relativeX = ((event.clientX - rect.left) / rect.width) * elements.globalGoldChart.width;
  const paddingLeft = 86;
  const plotWidth = elements.globalGoldChart.width - 86 - 26;
  const rawIndex = ((relativeX - paddingLeft) / plotWidth) * (points.length - 1);
  const clampedIndex = Math.max(0, Math.min(points.length - 1, Math.round(rawIndex)));
  state.globalGold.hoverIndex = clampedIndex;
  drawGlobalGoldChart();
});

elements.globalGoldChart.addEventListener("mouseleave", () => {
  state.globalGold.hoverIndex = null;
  drawGlobalGoldChart();
});

elements.chartCanvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" || event.pointerType === "pen") {
    setUobChartHover(event.clientX);
  }
});

elements.chartCanvas.addEventListener("pointerdown", (event) => {
  const index = updateUobChartHoverFromClientX(event.clientX);
  if (index == null) {
    return;
  }
  state.chartPinnedIndex = index;
  state.chartHoverIndex = index;
  drawChart();
});

elements.chartCanvas.addEventListener("click", (event) => {
  const index = updateUobChartHoverFromClientX(event.clientX);
  if (index == null) {
    return;
  }
  state.chartPinnedIndex = index;
  state.chartHoverIndex = index;
  drawChart();
});

elements.chartCanvas.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }
  const index = updateUobChartHoverFromClientX(touch.clientX);
  if (index == null) {
    return;
  }
  state.chartPinnedIndex = index;
  state.chartHoverIndex = index;
  drawChart();
}, { passive: true });

elements.chartCanvas.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }
  const index = updateUobChartHoverFromClientX(touch.clientX);
  if (index == null) {
    return;
  }
  state.chartPinnedIndex = index;
  state.chartHoverIndex = index;
  drawChart();
}, { passive: true });

elements.chartCanvas.addEventListener("mouseleave", () => {
  state.chartHoverIndex = null;
  drawChart();
});

elements.chartCanvas.addEventListener("touchend", () => {
  // Keep the last tapped point visible on mobile.
});

elements.chartCanvas.addEventListener("dblclick", () => {
  state.chartHoverIndex = null;
  state.chartPinnedIndex = null;
  drawChart();
});

elements.addHoldingBtn.addEventListener("click", () => {
  addHolding();
});

elements.holdingBoughtPriceInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addHolding();
  }
});

elements.holdingsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-holding]");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.removeHolding);
  if (!Number.isInteger(index)) {
    return;
  }

  state.holdings.splice(index, 1);
  persistHoldings();
  renderHoldingsTable();
});

loadData();
loadGlobalGoldData();
