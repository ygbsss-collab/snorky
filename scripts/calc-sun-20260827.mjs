import pkg from '../api/_lib/sun-times.js';
const { calculateSunTimes } = pkg;

const lat = 38.373191067146;
const lng = 128.509633744093;
const date = "2026-08-27";

const sun = calculateSunTimes({ latitude: lat, longitude: lng, date, timezone: "Asia/Seoul" });
console.log(`[문암해변 2026-08-27 천문학적 일출·일몰]`);
console.log(`• 일출 (sunrise): ${sun.sunrise}`);
console.log(`• 일몰 (sunset):  ${sun.sunset}`);

const sunriseDate = new Date(sun.sunrise);
const sunsetDate = new Date(sun.sunset);
console.log(`• 일출 KST: ${sunriseDate.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}`);
console.log(`• 일몰 KST: ${sunsetDate.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}`);
