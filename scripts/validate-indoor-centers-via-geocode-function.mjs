#!/usr/bin/env node

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const functionUrl = `${String(supabaseUrl || "").replace(/\/$/, "")}/functions/v1/geocode-indoor-address`;

if (!supabaseUrl || !supabaseKey) {
  console.error("필수 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY");
  process.exitCode = 1;
  process.exit();
}

const supabaseHeaders = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`
};

function formatValue(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchCenters() {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/indoor_diving_centers`);
  url.searchParams.set("select", "id,name,address,lat,lng");
  url.searchParams.set("order", "id.asc");

  const response = await fetch(url, { headers: supabaseHeaders });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
}

async function geocodeAddress(address) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      ...supabaseHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ address })
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body) {
    throw new Error(`Edge Function ${response.status}`);
  }
  return body;
}

async function validateCenter(center) {
  const result = {
    id: center.id,
    name: center.name,
    address: center.address,
    existingLat: coordinate(center.lat),
    existingLng: coordinate(center.lng),
    queriedLat: null,
    queriedLng: null,
    status: "NO_RESULT"
  };

  const address = String(center.address || "").trim();
  if (!address) return result;

  try {
    const response = await geocodeAddress(address);
    if (response.reason === "MULTIPLE_RESULTS") {
      result.status = "MULTIPLE_RESULTS";
      return result;
    }
    if (response.reason === "NO_RESULT") return result;
    if (!response.ok) {
      result.status = "ERROR";
      return result;
    }

    result.queriedLat = coordinate(response.lat);
    result.queriedLng = coordinate(response.lng);
    result.status = result.queriedLat === null || result.queriedLng === null
      ? "ERROR"
      : "MATCHED";
    return result;
  } catch (error) {
    return { ...result, status: "ERROR", error: error.message };
  }
}

function printResult(result) {
  console.log([
    formatValue(result.id),
    formatValue(result.name),
    formatValue(result.address),
    formatValue(result.existingLat),
    formatValue(result.existingLng),
    formatValue(result.queriedLat),
    formatValue(result.queriedLng),
    formatValue(result.status)
  ].join(" | "));
  if (result.error) console.error(`[${result.id}] ${result.error}`);
}

try {
  const centers = await fetchCenters();
  console.log("id | name | address | 기존 lat | 기존 lng | 조회 lat | 조회 lng | 상태");
  for (const center of centers) {
    printResult(await validateCenter(center));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
