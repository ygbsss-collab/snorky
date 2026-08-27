const ENDPOINT =
  "https://apis.data.go.kr/1192000/apVhdService_PrdnWv3/getOpnPrdnWv3";

const apiKey = Deno.env.get("KHOA_API_KEY");
const gridCode = Deno.env.get("KHOA_GRID_CD");

if (!apiKey) {
  console.error("KHOA_API_KEY is missing; API call was not made.");
  Deno.exit(2);
}
if (!gridCode) {
  console.error("KHOA_GRID_CD is missing; API call was not made.");
  Deno.exit(2);
}

const url = new URL(ENDPOINT);
url.search = new URLSearchParams({
  serviceKey: apiKey,
  numOfRows: "1000",
  pageNo: "1",
  gridCd: gridCode,
  type: "xml",
  // prdnHms is intentionally omitted to inspect the full returned horizon.
}).toString();

const report: Record<string, unknown> = {
  endpoint: ENDPOINT,
  gridCode,
  stage: "request",
  httpStatus: null,
  contentType: null,
  resultCode: null,
  resultMessage: null,
  forecastBase: null,
  maxForecastHours: null,
  maxForecastDate: null,
  fields: {
    waveHeight: "prdnWvhgh",
    wavePeriod: null,
    waveDirection: null,
  },
  days: {},
  callCount: 0,
  error: null,
};

const text = (node: Element | null) => node?.textContent?.trim() || null;
const parseKst = (date: string | null, time: string | null) => {
  if (!date || !/^\d{8}$/.test(date)) return null;
  const hhmmss = String(time || "000000").padEnd(6, "0");
  return new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}+09:00`,
  );
};

try {
  // The script contains exactly one fetch and deliberately has no retry path.
  report.callCount = 1;
  const response = await fetch(url, { method: "GET" });
  report.httpStatus = response.status;
  report.contentType = response.headers.get("content-type");

  const body = await response.text();
  report.stage = "parse";
  const document = new DOMParser().parseFromString(body, "application/xml");
  if (!document) throw new Error("XML parsing failed");

  report.resultCode = text(document.querySelector("resultCode"));
  report.resultMessage = text(document.querySelector("resultMsg"));

  const rows = [...document.querySelectorAll("item")].map((item) => {
    const forecastDate = text(item.querySelector("prdnYmd"));
    const forecastTime = text(item.querySelector("prdnHms"));
    const waveHeightText = text(item.querySelector("prdnWvhgh"));
    const waveHeight = waveHeightText === null ? null : Number(waveHeightText);
    return {
      forecastDate,
      forecastTime,
      forecastAt: parseKst(forecastDate, forecastTime),
      waveHeight: Number.isFinite(waveHeight) ? waveHeight : null,
    };
  }).filter((row) => row.forecastAt instanceof Date && !Number.isNaN(row.forecastAt.valueOf()));

  rows.sort((a, b) => a.forecastAt!.valueOf() - b.forecastAt!.valueOf());
  const first = rows.at(0)?.forecastAt || null;
  const last = rows.at(-1)?.forecastAt || null;
  report.forecastBase = first?.toISOString() || null;
  report.maxForecastDate = last?.toISOString() || null;
  report.maxForecastHours = first && last
    ? Math.round((last.valueOf() - first.valueOf()) / 3_600_000)
    : null;

  const baseKst = first
    ? new Date(first.valueOf() + 9 * 3_600_000).toISOString().slice(0, 10)
    : null;
  const baseDay = baseKst ? new Date(`${baseKst}T00:00:00+09:00`) : null;
  const days: Record<string, unknown> = {};
  for (let offset = 0; offset <= 5; offset += 1) {
    const date = baseDay
      ? new Date(baseDay.valueOf() + offset * 86_400_000 + 9 * 3_600_000)
        .toISOString().slice(0, 10)
      : null;
    const matches = date
      ? rows.filter((row) => `${row.forecastDate!.slice(0, 4)}-${row.forecastDate!.slice(4, 6)}-${row.forecastDate!.slice(6, 8)}` === date)
      : [];
    const intervals = matches.slice(1).map((row, index) =>
      (row.forecastAt!.valueOf() - matches[index].forecastAt!.valueOf()) / 3_600_000
    );
    days[offset === 0 ? "TODAY" : `D+${offset}`] = {
      date,
      dataExists: matches.length > 0,
      waveHeightExists: matches.some((row) => row.waveHeight !== null),
      timeResolutionHours: intervals.length ? Math.min(...intervals) : null,
      sampleWaveHeight: matches.find((row) => row.waveHeight !== null)?.waveHeight ?? null,
    };
  }
  report.days = days;
  report.stage = "complete";
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
}

// The request URL and API key are intentionally never logged.
console.log(JSON.stringify(report, null, 2));
