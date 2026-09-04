// 맞춤 버디 공고 알림 매칭 및 중복 방지 로직 단위 테스트 (플랫 스키마 기반)
import assert from 'assert';

function isPostMatchingAlertConditions(sub, post, kstNow = new Date()) {
  const postDate = (post.event_date || "").trim();
  const postRegion = (post.region || "").trim();
  const postActivity = (post.activity_type || "").trim();
  const postDifficulty = (post.difficulty || "").trim();
  const postPrefGender = (post.preferred_gender || "").trim();
  const postHostGender = (post.host_gender || "").trim();
  const postLevel = (post.host_aida_level || "").trim();

  // KST 오늘/주말/이번달 계산
  const utc = kstNow.getTime() + (kstNow.getTimezoneOffset() * 60000);
  const kstDate = new Date(utc + (9 * 3600000));
  const todayStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth() + 1).padStart(2, "0")}-${String(kstDate.getDate()).padStart(2, "0")}`;
  const currentMonthStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth() + 1).padStart(2, "0")}`;

  const dayOfWeek = kstDate.getDay();
  const daysToSaturday = (6 - dayOfWeek + 7) % 7;
  const satDate = new Date(kstDate);
  satDate.setDate(kstDate.getDate() + daysToSaturday);
  const sunDate = new Date(satDate);
  sunDate.setDate(satDate.getDate() + 1);
  const satStr = `${satDate.getFullYear()}-${String(satDate.getMonth() + 1).padStart(2, "0")}-${String(satDate.getDate()).padStart(2, "0")}`;
  const sunStr = `${sunDate.getFullYear()}-${String(sunDate.getMonth() + 1).padStart(2, "0")}-${String(sunDate.getDate()).padStart(2, "0")}`;

  const condRegion = (sub.region || "").trim();
  const condSubRegion = (sub.sub_region || "").trim();
  const condDateFilter = (sub.date_filter || "").trim();
  const condActivity = (sub.activity_type || "").trim();
  const condDifficulty = (sub.difficulty || "").trim();
  const condRecruitGender = (sub.recruit_gender || "").trim();
  const condHostGender = (sub.host_gender || "").trim();
  const condLevel = (sub.participant_level || "").trim();

  // 1) 지역 조건 검사
  if (condRegion) {
    if (condSubRegion) {
      const fullPostLocation = `${postRegion} ${post.point_name || ""}`;
      if (!fullPostLocation.includes(condRegion) || !fullPostLocation.includes(condSubRegion)) {
        return false;
      }
    } else {
      if (!postRegion.includes(condRegion)) {
        return false;
      }
    }
  }

  // 2) 활동 구분 조건 검사
  if (condActivity && condActivity !== "전체" && condActivity !== "") {
    if (postActivity !== condActivity) return false;
  }

  // 3) 날짜 조건 검사
  if (condDateFilter) {
    const isSpecificDate = /^\d{4}-\d{2}-\d{2}$/.test(condDateFilter);
    if (isSpecificDate) {
      if (postDate !== condDateFilter) return false;
    } else if (condDateFilter === "today") {
      if (postDate !== todayStr) return false;
    } else if (condDateFilter === "weekend") {
      if (postDate !== satStr && postDate !== sunStr) return false;
    } else if (condDateFilter === "this_month") {
      if (!postDate.startsWith(currentMonthStr)) return false;
    }
  }

  // 4) 난이도 조건 검사
  if (condDifficulty && condDifficulty !== "무관" && condDifficulty !== "전체" && condDifficulty !== "") {
    if (postDifficulty !== "무관" && postDifficulty !== condDifficulty) return false;
  }

  // 5) 모집 성별 조건 검사
  if (condRecruitGender && condRecruitGender !== "성별 무관" && condRecruitGender !== "전체" && condRecruitGender !== "") {
    if (postPrefGender !== "성별 무관" && postPrefGender !== condRecruitGender) return false;
  }

  // 6) 주최자 성별 조건 검사
  if (condHostGender && condHostGender !== "전체" && condHostGender !== "") {
    if (postHostGender !== condHostGender) return false;
  }

  // 7) 참여 레벨 조건 검사
  if (condLevel && condLevel !== "전체" && condLevel !== "") {
    if (condLevel === "없음") {
      if (postLevel && postLevel !== "없음") return false;
    } else {
      if (postLevel !== condLevel) return false;
    }
  }

  return true;
}

console.log("=== 버디 공고 맞춤 알림 매칭 조건 단위 테스트 시작 (플랫 스키마) ===");

const samplePost = {
  id: 101,
  user_id: "user_kakao_123",
  activity_type: "프리다이빙",
  region: "강원 고성",
  point_name: "문암해변",
  event_date: "2026-09-05",
  difficulty: "중급",
  preferred_gender: "성별 무관",
  host_gender: "남성",
  host_aida_level: "AIDA 2"
};

// 1. 전체(조건 없음) 구독자 -> 매칭 성공
assert.strictEqual(
  isPostMatchingAlertConditions({}, samplePost),
  true,
  "전체 조건은 모든 공고와 매칭되어야 함"
);

// 2. 지역 일치(강원) -> 매칭 성공
assert.strictEqual(
  isPostMatchingAlertConditions({ region: "강원" }, samplePost),
  true,
  "강원 지역 조건 매칭 성공해야 함"
);

// 3. 지역 불일치(제주) -> 매칭 실패
assert.strictEqual(
  isPostMatchingAlertConditions({ region: "제주" }, samplePost),
  false,
  "제주 지역 조건은 강원 공고와 매칭 실패해야 함"
);

// 4. 활동 일치(프리다이빙) -> 매칭 성공
assert.strictEqual(
  isPostMatchingAlertConditions({ activity_type: "프리다이빙" }, samplePost),
  true,
  "프리다이빙 활동 매칭 성공해야 함"
);

// 5. 활동 불일치(스노쿨링) -> 매칭 실패
assert.strictEqual(
  isPostMatchingAlertConditions({ activity_type: "스노쿨링" }, samplePost),
  false,
  "스노쿨링 활동은 프리다이빙 공고와 매칭 실패해야 함"
);

// 6. 레벨 조건 일치(AIDA 2) -> 매칭 성공
assert.strictEqual(
  isPostMatchingAlertConditions({ participant_level: "AIDA 2" }, samplePost),
  true,
  "AIDA 2 레벨 조건 매칭 성공해야 함"
);

// 7. 레벨 조건 불일치(AIDA 3) -> 매칭 실패
assert.strictEqual(
  isPostMatchingAlertConditions({ participant_level: "AIDA 3" }, samplePost),
  false,
  "AIDA 3 레벨 조건은 AIDA 2 공고와 매칭 실패해야 함"
);

// 8. 난이도 무관 공고 -> 중급 조건에서도 매칭 성공
const easyAnyPost = { ...samplePost, difficulty: "무관" };
assert.strictEqual(
  isPostMatchingAlertConditions({ difficulty: "중급" }, easyAnyPost),
  true,
  "공고 난이도가 '무관'이면 조건이 '중급'이어도 매칭되어야 함"
);

// 9. 성별 무관 공고 -> '여성' 조건에서도 매칭 성공
const genderAnyPost = { ...samplePost, preferred_gender: "성별 무관" };
assert.strictEqual(
  isPostMatchingAlertConditions({ recruit_gender: "여성" }, genderAnyPost),
  true,
  "공고 모집성별이 '성별 무관'이면 조건이 '여성'이어도 매칭되어야 함"
);

console.log("✔ 모든 알림 매칭 조건 검증 통과 (9/9)");
