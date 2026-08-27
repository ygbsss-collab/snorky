const ENDPOINT =
  "https://apis.data.go.kr/1192000/apVhdService_PrdnWv3/getOpnPrdnWv3";

// Resolved offline from the official level-3 grid workbook (gid 36011).
// The official WFS guide defines level-3 geometry in EPSG:5179; this cell's
// WGS84 bounds are lon 128.50–128.55, lat 38.35–38.40.
const GAJIN = Object.freeze({
  name: "가진해변",
  latitude: 38.373191067146,
  longitude: 128.509633744093,
  gridCode: "GR3_G1E41_K",
  gridSource: "data.go.kr official level-3 grid workbook, gid 36011",
});

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const xmlText = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || null;
};
const xmlItems = (xml: string) =>
  [...xml.matchAll(/<(?:[\w.-]+:)?item(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?item>/gi)].map((match) => match[1]);
const kstDate = (ymd: string | null, hms: string | null) => {
  if (!ymd || !/^\d{8}$/.test(ymd)) return null;
  const time = String(hms || "000000").replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  const date = new Date(
    `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`,
  );
  return Number.isNaN(date.valueOf()) ? null : date;
};
const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};
Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const testSecret = Deno.env.get("KHOA_TEST_SECRET");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!testSecret) return json({ error: "KHOA_TEST_AUTH_NOT_CONFIGURED", callCount: 0 }, 503);
  if (!safeEqual(bearer, testSecret)) return json({ error: "UNAUTHORIZED", callCount: 0 }, 401);

  const apiKey = Deno.env.get("KHOA_API_KEY");
  if (!apiKey) return json({ error: "KHOA_SECRET_UNAVAILABLE", callCount: 0 }, 503);

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: "1000",
    pageNo: "1",
    gridCd: GAJIN.gridCode,
    type: "xml",
    // Officially optional. Omitted to inspect every forecast time returned.
    // prdnHms: ...
  }).toString();

  const startedAt = performance.now();
  try {
    // Exactly one KHOA request. There is deliberately no retry path.
    const response = await fetch(url, { method: "GET" });
    const status = response.status;
    const statusText = response.statusText;
    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const gatewayReasonCode = xmlText(body, "returnReasonCode");
    const gatewayAuthMessage = xmlText(body, "returnAuthMsg");
    const gatewayErrorMessage = xmlText(body, "errMsg");
    const resultCode = xmlText(body, "resultCode") || gatewayReasonCode;
    const resultMessage = xmlText(body, "resultMsg") || gatewayAuthMessage || gatewayErrorMessage;
    const totalCountText = xmlText(body, "totalCount");
    const totalCount = totalCountText !== null && Number.isFinite(Number(totalCountText))
      ? Number(totalCountText)
      : null;
    const rows = xmlItems(body).map((item) => {
      const forecastDate = xmlText(item, "prdnYmd");
      const forecastTime = xmlText(item, "prdnHms");
      const rawHeight = xmlText(item, "prdnWvhgh");
      const numericHeight = rawHeight === null ? NaN : Number(rawHeight);
      return {
        forecastDate,
        forecastTime,
        forecastAt: kstDate(forecastDate, forecastTime),
        waveHeight: Number.isFinite(numericHeight) ? numericHeight : null,
      };
    }).filter((row) => row.forecastAt !== null)
      .sort((left, right) => left.forecastAt!.valueOf() - right.forecastAt!.valueOf());

    const first = rows.at(0)?.forecastAt || null;
    const last = rows.at(-1)?.forecastAt || null;
    const firstKstDay = first
      ? new Date(first.valueOf() + 9 * 3_600_000).toISOString().slice(0, 10)
      : null;
    const startOfFirstKstDay = firstKstDay
      ? new Date(`${firstKstDay}T00:00:00+09:00`)
      : null;
    const days: Record<string, unknown> = {};
    for (let offset = 0; offset <= 5; offset += 1) {
      const date = startOfFirstKstDay
        ? new Date(startOfFirstKstDay.valueOf() + offset * 86_400_000 + 9 * 3_600_000)
          .toISOString().slice(0, 10)
        : null;
      const matches = date
        ? rows.filter((row) => {
          const value = row.forecastDate!;
          return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` === date;
        })
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

    return json({
      api: "getOpnPrdnWv3",
      point: GAJIN,
      httpStatus: status,
      statusText,
      contentType,
      resultCode,
      resultMessage,
      totalCount,
      itemCount: rows.length,
      parseStatus: gatewayReasonCode || gatewayAuthMessage
        ? "GATEWAY_ERROR_ENVELOPE"
        : resultCode !== null || totalCount !== null || rows.length
        ? "OFFICIAL_XML"
        : "UNRECOGNIZED_RESPONSE",
      gatewayError: gatewayReasonCode || gatewayAuthMessage || gatewayErrorMessage
        ? { reasonCode: gatewayReasonCode, authMessage: gatewayAuthMessage, errorMessage: gatewayErrorMessage }
        : null,
      forecastBase: null,
      earliestForecast: first?.toISOString() || null,
      maxForecastDate: last?.toISOString() || null,
      maxForecastHours: first && last
        ? Math.round((last.valueOf() - first.valueOf()) / 3_600_000)
        : null,
      days,
      fields: { waveHeight: "prdnWvhgh", wavePeriod: null, waveDirection: null },
      elapsedMs: Math.round(performance.now() - startedAt),
      callCount: 1,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      point: GAJIN,
      callCount: 1,
    }, 502);
  }
});
