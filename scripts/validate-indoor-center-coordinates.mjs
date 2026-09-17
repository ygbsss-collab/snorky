#!/usr/bin/env node

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;

if (!supabaseUrl || !supabaseKey || !kakaoRestApiKey) {
  console.error("필수 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY, KAKAO_REST_API_KEY");
  process.exitCode = 1;
  process.exit();
}

const headers = {
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

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
}

async function searchKakaoAddress(address) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` }
  });
  if (!response.ok) throw new Error(`Kakao ${response.status}: ${await response.text()}`);
  return response.json();
}

async function validateCenter(center) {
  const base = {
    id: center.id,
    name: center.name,
    address: center.address,
    existingLat: coordinate(center.lat),
    existingLng: coordinate(center.lng),
    queriedLat: null,
    queriedLng: null,
    status: "NO_RESULT"
  };

  if (!String(center.address || "").trim()) return base;

  try {
    const result = await searchKakaoAddress(String(center.address).trim());
    const documents = Array.isArray(result.documents) ? result.documents : [];
    if (documents.length === 0) return base;

    // Kakao Local API: x is longitude, y is latitude.
    base.queriedLng = coordinate(documents[0].x);
    base.queriedLat = coordinate(documents[0].y);
    base.status = documents.length > 1 ? "MULTIPLE_RESULTS" : "MATCHED";
    return base;
  } catch (error) {
    return { ...base, status: "ERROR", error: error.message };
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
