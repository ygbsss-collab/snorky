// Comprehensive verification for buddy participant level features
const standardLevels = ["무관", "없음", "AIDA 1", "AIDA 2", "AIDA 3", "AIDA 4", "Instructor"];

// 1. Form validation & payload creation
function buildPayload({ levelSelect, levelCustomInput }) {
  let finalLevel = levelSelect || "무관";
  if (finalLevel === "기타") {
    finalLevel = (levelCustomInput || "").trim();
    if (!finalLevel) {
      throw new Error("참석자 레벨을 직접 입력해 주세요.");
    }
  }
  return { host_aida_level: finalLevel };
}

// 2. Edit post restoration
function restoreLevelForEdit(post) {
  const savedLvl = post.host_aida_level || "무관";
  if (standardLevels.includes(savedLvl)) {
    return { selectValue: savedLvl, customValue: "", customDisplay: "none" };
  } else {
    return { selectValue: "기타", customValue: savedLvl, customDisplay: "block" };
  }
}

// 3. Detail modal display resolution
function resolveDetailLevelDisplay(post) {
  const reqLvl = post.host_aida_level || "무관";
  return reqLvl === "무관" ? "무관 (전체)" : reqLvl;
}

// 4. Search filter matching
function filterPosts(posts, filterLevel) {
  if (!filterLevel || filterLevel === "전체" || filterLevel === "무관") return posts;
  return posts.filter(p => {
    const pLvl = (p.host_aida_level || "무관").trim();
    if (filterLevel === "없음") return pLvl === "없음" || pLvl === "무관";
    if (filterLevel === "기타") return pLvl === "무관" || !standardLevels.includes(pLvl);
    return pLvl === "무관" || pLvl === filterLevel;
  });
}

// 5. Alert notification matching
function matchAlert(subLevel, postLevel) {
  const cond = (subLevel || "").trim();
  const post = (postLevel || "무관").trim();
  if (cond && cond !== "전체" && cond !== "" && cond !== "무관") {
    if (post !== "무관" && post !== "전체") {
      if (cond === "없음") {
        if (post !== "없음") return false;
      } else if (cond === "기타") {
        if (standardLevels.includes(post)) return false;
      } else {
        if (post !== cond) return false;
      }
    }
  }
  return true;
}

console.log("=== 1. Form Payload Test ===");
console.log("Default payload (무관):", buildPayload({ levelSelect: "무관" }).host_aida_level === "무관" ? "PASS" : "FAIL");
console.log("AIDA 2 payload:", buildPayload({ levelSelect: "AIDA 2" }).host_aida_level === "AIDA 2" ? "PASS" : "FAIL");
console.log("Custom level payload:", buildPayload({ levelSelect: "기타", levelCustomInput: "SSI Level 3" }).host_aida_level === "SSI Level 3" ? "PASS" : "FAIL");
try {
  buildPayload({ levelSelect: "기타", levelCustomInput: "" });
  console.log("Empty custom error test: FAIL");
} catch (e) {
  console.log("Empty custom error test:", e.message === "참석자 레벨을 직접 입력해 주세요." ? "PASS" : "FAIL");
}

console.log("\n=== 2. Edit Post Restoration Test ===");
console.log("Restore standard (AIDA 3):", JSON.stringify(restoreLevelForEdit({ host_aida_level: "AIDA 3" })) === JSON.stringify({ selectValue: "AIDA 3", customValue: "", customDisplay: "none" }) ? "PASS" : "FAIL");
console.log("Restore custom (PADI Master):", JSON.stringify(restoreLevelForEdit({ host_aida_level: "PADI Master" })) === JSON.stringify({ selectValue: "기타", customValue: "PADI Master", customDisplay: "block" }) ? "PASS" : "FAIL");

console.log("\n=== 3. Detail Modal Display Test ===");
console.log("Display 무관 -> '무관 (전체)':", resolveDetailLevelDisplay({ host_aida_level: "무관" }) === "무관 (전체)" ? "PASS" : "FAIL");
console.log("Display AIDA 1 -> 'AIDA 1':", resolveDetailLevelDisplay({ host_aida_level: "AIDA 1" }) === "AIDA 1" ? "PASS" : "FAIL");

console.log("\n=== 4. Search Filter Test ===");
const testPosts = [
  { id: 1, host_aida_level: "무관" },
  { id: 2, host_aida_level: "AIDA 2" },
  { id: 3, host_aida_level: "AIDA 3" },
  { id: 4, host_aida_level: "없음" },
  { id: 5, host_aida_level: "PADI Divemaster" }
];
console.log("Filter 전체 (5개):", filterPosts(testPosts, "").length === 5 ? "PASS" : "FAIL");
console.log("Filter AIDA 2 (무관 1개 + AIDA 2 1개 = 2개):", filterPosts(testPosts, "AIDA 2").length === 2 ? "PASS" : "FAIL");
console.log("Filter 기타 (무관 1개 + PADI 1개 = 2개):", filterPosts(testPosts, "기타").length === 2 ? "PASS" : "FAIL");

console.log("\n=== 5. Alert Notification Match Test ===");
console.log("Sub: 'AIDA 2', Post: '무관' -> Match:", matchAlert("AIDA 2", "무관") === true ? "PASS" : "FAIL");
console.log("Sub: 'AIDA 2', Post: 'AIDA 2' -> Match:", matchAlert("AIDA 2", "AIDA 2") === true ? "PASS" : "FAIL");
console.log("Sub: 'AIDA 2', Post: 'AIDA 3' -> No Match:", matchAlert("AIDA 2", "AIDA 3") === false ? "PASS" : "FAIL");
console.log("Sub: '전체', Post: 'AIDA 3' -> Match:", matchAlert("전체", "AIDA 3") === true ? "PASS" : "FAIL");
