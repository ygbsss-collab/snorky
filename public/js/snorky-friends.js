(function (global) {
  "use strict";

  function getSupabase() {
    if (typeof global.getSnorkySupabase === "function") return global.getSnorkySupabase();
    return global.snorkySupabase || null;
  }

  function getSessionUser() {
    return global.SNORKYAuthSession?.get?.()?.user || null;
  }

  function showToast(msg) {
    if (typeof global.showToast === "function") {
      global.showToast(msg);
    } else if (typeof window.showToast === "function") {
      window.showToast(msg);
    } else {
      alert(msg);
    }
  }

  const selfBlockCleanupPromises = new Map();

  function allowDuplicateUsers() {
    return global.SNORKYTestMode?.TEST_MODE_ALLOW_DUPLICATE_USERS === true;
  }

  function getTestSelfFriends() {
    if (!allowDuplicateUsers()) return new Set();
    try {
      const raw = sessionStorage.getItem("snorky_test_self_friends");
      return new Set(raw ? JSON.parse(raw).map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function setTestSelfFriends(set) {
    try {
      sessionStorage.setItem("snorky_test_self_friends", JSON.stringify([...set].map(String)));
    } catch (_) {}
  }

  function getTestSelfBlocks() {
    if (!allowDuplicateUsers()) return new Set();
    try {
      const raw = sessionStorage.getItem("snorky_test_self_blocks");
      return new Set(raw ? JSON.parse(raw).map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function setTestSelfBlocks(set) {
    try {
      sessionStorage.setItem("snorky_test_self_blocks", JSON.stringify([...set].map(String)));
    } catch (_) {}
  }

  async function cleanupSelfBlock(userId) {
    if (allowDuplicateUsers()) return false;
    const normalizedUserId = userId ? String(userId) : "";
    if (!normalizedUserId) return false;
    if (selfBlockCleanupPromises.has(normalizedUserId)) return selfBlockCleanupPromises.get(normalizedUserId);
    const cleanupPromise = (async () => {
      const selfBlocks = getTestSelfBlocks();
      if (selfBlocks.delete(normalizedUserId)) setTestSelfBlocks(selfBlocks);
      const sb = getSupabase();
      if (!sb) return false;
      const { error } = await sb
        .from("buddy_blocks")
        .delete()
        .eq("blocker_user_id", normalizedUserId)
        .eq("blocked_user_id", normalizedUserId);
      if (error) throw error;
      return true;
    })().catch((error) => {
      console.warn("[SNORKYFriends] self block cleanup failed:", error);
      return false;
    }).finally(() => selfBlockCleanupPromises.delete(normalizedUserId));
    selfBlockCleanupPromises.set(normalizedUserId, cleanupPromise);
    return cleanupPromise;
  }

  // 1. 차단 관계 확인
  async function checkBlockStatus(userA, userB) {
    if (!userA || !userB) {
      return { blockedByMe: false, blockedByThem: false, isBlocked: false };
    }
    const normA = String(userA);
    const normB = String(userB);
    if (normA === normB) {
      if (allowDuplicateUsers()) {
        const selfBlocks = getTestSelfBlocks();
        const isSelfBlocked = selfBlocks.has(normA);
        return {
          blockedByMe: isSelfBlocked,
          blockedByThem: isSelfBlocked,
          isBlocked: isSelfBlocked
        };
      }
      await cleanupSelfBlock(normA);
      return { blockedByMe: false, blockedByThem: false, isBlocked: false };
    }
    const sb = getSupabase();
    if (!sb) return { blockedByMe: false, blockedByThem: false, isBlocked: false };

    try {
      const { data, error } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`and(blocker_user_id.eq.${normA},blocked_user_id.eq.${normB}),and(blocker_user_id.eq.${normB},blocked_user_id.eq.${normA})`);

      if (error) {
        console.warn("[SNORKYFriends] checkBlockStatus error:", error);
        return { blockedByMe: false, blockedByThem: false, isBlocked: false };
      }

      const rows = data || [];
      const blockedByMe = rows.some((r) => String(r.blocker_user_id) === normA && String(r.blocked_user_id) === normB);
      const blockedByThem = rows.some((r) => String(r.blocker_user_id) === normB && String(r.blocked_user_id) === normA);

      return {
        blockedByMe,
        blockedByThem,
        isBlocked: blockedByMe || blockedByThem
      };
    } catch (err) {
      console.warn("[SNORKYFriends] checkBlockStatus exception:", err);
      return { blockedByMe: false, blockedByThem: false, isBlocked: false };
    }
  }

  // 차단된 유저 Set 가져오기 (내가 차단한 사용자 + 나를 차단한 사용자)
  async function getBlockedUserIds(myUserId) {
    if (!myUserId) return new Set();
    const normMyId = String(myUserId);
    const blockedSet = new Set();
    if (!allowDuplicateUsers()) {
      await cleanupSelfBlock(normMyId);
    }

    const sb = getSupabase();
    if (!sb) return blockedSet;

    try {
      const { data, error } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`blocker_user_id.eq.${normMyId},blocked_user_id.eq.${normMyId}`);

      if (error) {
        console.warn("[SNORKYFriends] getBlockedUserIds error:", error);
        return blockedSet;
      }

      (data || []).forEach((r) => {
        if (allowDuplicateUsers() && String(r.blocker_user_id) === normMyId && String(r.blocked_user_id) === normMyId) return;
        if (String(r.blocker_user_id) === normMyId && r.blocked_user_id) {
          blockedSet.add(String(r.blocked_user_id));
        }
        if (String(r.blocked_user_id) === normMyId && r.blocker_user_id) {
          blockedSet.add(String(r.blocker_user_id));
        }
      });
      if (allowDuplicateUsers()) blockedSet.delete(normMyId);

      return blockedSet;
    } catch (err) {
      console.warn("[SNORKYFriends] getBlockedUserIds exception:", err);
      return blockedSet;
    }
  }

  // 2. 프렌즈 관계 확인
  async function checkFriendStatus(userA, userB) {
    if (!userA || !userB) {
      return { isFriend: false, friendRowId: null };
    }
    const normA = String(userA);
    const normB = String(userB);
    if (normA === normB) {
      if (allowDuplicateUsers()) {
        const selfFriends = getTestSelfFriends();
        const isFriend = selfFriends.has(normA);
        return { isFriend, friendRowId: isFriend ? `test_self_${normA}` : null };
      }
      return { isFriend: false, friendRowId: null };
    }
    const sb = getSupabase();
    if (!sb) return { isFriend: false, friendRowId: null };

    try {
      const { data, error } = await sb
        .from("snorky_friends")
        .select("id, user_id, friend_user_id")
        .or(`and(user_id.eq.${normA},friend_user_id.eq.${normB}),and(user_id.eq.${normB},friend_user_id.eq.${normA})`);

      if (error) {
        console.warn("[SNORKYFriends] checkFriendStatus error:", error);
        return { isFriend: false, friendRowId: null };
      }

      const row = (data || [])[0] || null;
      return {
        isFriend: Boolean(row),
        friendRowId: row ? row.id : null
      };
    } catch (err) {
      console.warn("[SNORKYFriends] checkFriendStatus exception:", err);
      return { isFriend: false, friendRowId: null };
    }
  }

  // 3. 프렌즈 등록 (상호 관계)
  async function addFriend(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) {
      throw new Error("사용자 정보가 올바르지 않습니다.");
    }
    await global.SNORKYAuthSession?.requirePostingAccess?.();
    const normMyId = String(myUserId);
    const normTargetId = String(targetUserId);

    if (normMyId === normTargetId) {
      if (!allowDuplicateUsers()) {
        throw new Error("자기 자신은 프렌즈로 등록할 수 없습니다.");
      }
      // TEST 전용 자기 자신 등록 (DB 제약 우회를 위해 세션 기반 가상 상태로 처리)
      const selfFriends = getTestSelfFriends();
      if (selfFriends.has(normMyId)) {
        return { ok: true, alreadyFriend: true, id: `test_self_${normMyId}` };
      }
      selfFriends.add(normMyId);
      setTestSelfFriends(selfFriends);

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "add", targetUserId: normMyId }
        }));
      }
      return { ok: true, id: `test_self_${normMyId}` };
    }

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    // 1) 차단 관계 검사
    const blockStatus = await checkBlockStatus(normMyId, normTargetId);
    if (blockStatus.blockedByMe) {
      throw new Error("차단한 사용자는 프렌즈로 등록할 수 없습니다.");
    }
    if (blockStatus.blockedByThem) {
      throw new Error("해당 사용자를 프렌즈로 등록할 수 없습니다.");
    }

    // 2) 이미 프렌즈인지 검사
    const friendStatus = await checkFriendStatus(normMyId, normTargetId);
    if (friendStatus.isFriend) {
      return { ok: true, alreadyFriend: true, id: friendStatus.friendRowId };
    }

    // 3) 상호 1개 row 생성 (정규화 인덱스: least, greatest)
    const { data, error } = await sb
      .from("snorky_friends")
      .insert([{ user_id: normMyId, friend_user_id: normTargetId }])
      .select("id")
      .single();

    if (error) {
      // 23505: unique constraint violation
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        return { ok: true, alreadyFriend: true };
      }
      throw error;
    }

    // 이벤트 브로드캐스트
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
        detail: { action: "add", targetUserId: normTargetId }
      }));
    }

    return { ok: true, id: data?.id };
  }

  // 4. 프렌즈 삭제 (상호 관계 삭제)
  async function removeFriend(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) return { ok: false };
    const normMyId = String(myUserId);
    const normTargetId = String(targetUserId);

    if (normMyId === normTargetId) {
      if (allowDuplicateUsers()) {
        const selfFriends = getTestSelfFriends();
        selfFriends.delete(normMyId);
        setTestSelfFriends(selfFriends);
        if (typeof global.dispatchEvent === "function") {
          global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
            detail: { action: "remove", targetUserId: normMyId }
          }));
        }
        return { ok: true };
      }
      return { ok: false };
    }
    const sb = getSupabase();
    if (!sb) return { ok: false };

    try {
      const { error } = await sb
        .from("snorky_friends")
        .delete()
        .or(`and(user_id.eq.${normMyId},friend_user_id.eq.${normTargetId}),and(user_id.eq.${normTargetId},friend_user_id.eq.${normMyId})`);

      if (error) throw error;

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "remove", targetUserId: normTargetId }
        }));
      }

      return { ok: true };
    } catch (err) {
      console.warn("[SNORKYFriends] removeFriend error:", err);
      throw err;
    }
  }

  // 5. 프렌즈 목록 조회
  async function getFriendsList(myUserId) {
    if (!myUserId) return [];
    const normMyId = String(myUserId);
    if (!allowDuplicateUsers()) {
      await cleanupSelfBlock(normMyId);
    }
    const sb = getSupabase();
    if (!sb) return [];

    try {
      // 1) 프렌즈 row 조회
      const { data: friendRows, error: friendErr } = await sb
        .from("snorky_friends")
        .select("id, user_id, friend_user_id, created_at")
        .or(`user_id.eq.${normMyId},friend_user_id.eq.${normMyId}`)
        .order("created_at", { ascending: false });

      if (friendErr) throw friendErr;

      // 2) 상대방 user_id 추출
      const targetUserIds = (friendRows || []).map((r) => {
        return String(r.user_id) === normMyId ? String(r.friend_user_id) : String(r.user_id);
      }).filter(Boolean);

      // TEST 모드일 때 자기 자신 프렌즈 등록 상태이면 목록에 포함
      if (allowDuplicateUsers() && normMyId) {
        const selfFriends = getTestSelfFriends();
        if (selfFriends.has(normMyId) && !targetUserIds.includes(normMyId)) {
          targetUserIds.unshift(normMyId);
        }
      }

      if (!targetUserIds.length) return [];

      // 3) 차단된 사용자 목록 조회하여 제외
      const { data: blockRows } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`blocker_user_id.eq.${normMyId},blocked_user_id.eq.${normMyId}`);

      const blockedSet = new Set();
      (blockRows || []).forEach((b) => {
        if (allowDuplicateUsers() && String(b.blocker_user_id) === normMyId && String(b.blocked_user_id) === normMyId) return;
        if (String(b.blocker_user_id) === normMyId) blockedSet.add(String(b.blocked_user_id));
        if (String(b.blocked_user_id) === normMyId) blockedSet.add(String(b.blocker_user_id));
      });
      if (allowDuplicateUsers()) blockedSet.delete(normMyId);

      const validTargetIds = targetUserIds.filter((id) => !blockedSet.has(id));
      if (!validTargetIds.length) return [];

      // 4) 프로필 정보 조회
      const { data: profileRows, error: profileErr } = await sb
        .from("user_profiles")
        .select("provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, bio, age_group, activity_region, activity_depth")
        .in("provider_user_id", validTargetIds);

      if (profileErr) throw profileErr;

      const profileMap = new Map();
      (profileRows || []).forEach((p) => {
        profileMap.set(String(p.provider_user_id), p);
      });

      // 5) 인증 정보 일괄 확인
      let certMap = new Map();
      if (global.SNORKYCertification?.fetchCertifications) {
        try {
          certMap = await global.SNORKYCertification.fetchCertifications(validTargetIds);
        } catch (_) {}
      }

      // 6) 프렌즈 리스트 구성 (등록 순서 유지)
      return validTargetIds.map((targetId) => {
        const p = profileMap.get(targetId) || {};
        const isVerified = certMap.get(targetId)?.status === "APPROVED" ||
          (global.SNORKYCertification ? global.SNORKYCertification.checkIsVerified(p) : false);

        return {
          userId: targetId,
          displayName: p.custom_nickname || `버디_${targetId.slice(-4)}`,
          avatarUrl: p.avatar_type !== "none" ? (p.custom_avatar_url || "") : "",
          gender: p.gender || "비공개",
          ageGroup: p.age_group || "",
          aidaLevel: p.aida_level || "",
          activityRegion: p.activity_region || "",
          activityDepth: p.activity_depth || "",
          isVerified: Boolean(isVerified && p.aida_level),
          bio: p.bio || ""
        };
      });
    } catch (err) {
      console.warn("[SNORKYFriends] getFriendsList exception:", err);
      return [];
    }
  }

  // 6. 사용자 차단하기 (차단 등록 + 기존 프렌즈 관계 즉시 삭제)
  async function blockUser(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) {
      throw new Error("차단할 수 없는 사용자입니다.");
    }
    const normMyId = String(myUserId);
    const normTargetId = String(targetUserId);

    if (normMyId === normTargetId) {
      if (!allowDuplicateUsers()) {
        await cleanupSelfBlock(normMyId);
        throw new Error("자기 자신은 차단할 수 없습니다.");
      }
      // TEST 전용 자기 자신 차단 (가상 차단 상태)
      const selfBlocks = getTestSelfBlocks();
      selfBlocks.add(normMyId);
      setTestSelfBlocks(selfBlocks);

      // 기존 프렌즈 관계가 있으면 즉시 삭제
      await removeFriend(normMyId, normTargetId).catch(() => {});

      // 이벤트 브로드캐스트
      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-blocked", {
          detail: { blockerUserId: normMyId, blockedUserId: normTargetId }
        }));
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "block", targetUserId: normTargetId }
        }));
      }

      return { ok: true };
    }

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    try {
      // 1) buddy_blocks에 차단 추가
      const { error: blockErr } = await sb
        .from("buddy_blocks")
        .insert([{ blocker_user_id: normMyId, blocked_user_id: normTargetId }]);

      if (blockErr && blockErr.code !== "23505") {
        throw blockErr;
      }

      // 2) 기존 프렌즈 관계가 있으면 즉시 삭제
      await removeFriend(normMyId, normTargetId).catch(() => {});

      // 3) 이벤트 브로드캐스트
      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-blocked", {
          detail: { blockerUserId: normMyId, blockedUserId: normTargetId }
        }));
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "block", targetUserId: normTargetId }
        }));
      }

      return { ok: true };
    } catch (err) {
      console.warn("[SNORKYFriends] blockUser error:", err);
      throw err;
    }
  }

  // 7. 사용자 신고하기 (submit-inquiry 재사용)
  async function reportUser({ reporterId, reporterNickname, targetId, targetNickname, reason, details, postId }) {
    if (!targetId) throw new Error("신고 대상 정보가 없습니다.");
    if (!reason) throw new Error("신고 사유를 선택해 주세요.");

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    const normalizedPostId = postId && Number.isSafeInteger(Number(postId)) && Number(postId) > 0 ? Number(postId) : null;
    const payload = {
      inquiry_type: "user_report",
      target_user_id: String(targetId),
      target_nickname: typeof targetNickname === "string" && targetNickname.trim() ? targetNickname.trim() : null,
      reporter_user_id: reporterId ? String(reporterId) : null,
      reporter_nickname: typeof reporterNickname === "string" && reporterNickname.trim() ? reporterNickname.trim() : null,
      reason: String(reason),
      details: typeof details === "string" && details.trim() ? details.trim() : null,
      buddy_post_id: normalizedPostId
    };

    try {
      const { data, error } = await sb.functions.invoke("submit-inquiry", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "USER_REPORT_FAILED");
      return { ok: true };
    } catch (error) {
      console.error("[SNORKYFriends] reportUser failed:", error);
      throw new Error("신고 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 8. 사용자 차단 해제하기
  async function unblockUser(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) {
      throw new Error("사용자 정보가 올바르지 않습니다.");
    }
    const normMyId = String(myUserId);
    const normTargetId = String(targetUserId);

    if (normMyId === normTargetId) {
      if (allowDuplicateUsers()) {
        const selfBlocks = getTestSelfBlocks();
        selfBlocks.delete(normMyId);
        setTestSelfBlocks(selfBlocks);

        if (typeof global.dispatchEvent === "function") {
          global.dispatchEvent(new CustomEvent("snorky:user-unblocked", {
            detail: { blockerUserId: normMyId, unblockedUserId: normTargetId }
          }));
        }
        return { ok: true };
      }
      await cleanupSelfBlock(normMyId);
      return { ok: false };
    }

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    try {
      const { error } = await sb
        .from("buddy_blocks")
        .delete()
        .eq("blocker_user_id", normMyId)
        .eq("blocked_user_id", normTargetId);

      if (error) throw error;

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-unblocked", {
          detail: { blockerUserId: normMyId, unblockedUserId: normTargetId }
        }));
      }

      return { ok: true };
    } catch (err) {
      console.warn("[SNORKYFriends] unblockUser error:", err);
      throw err;
    }
  }

  // 9. 내가 차단한 사용자 목록 조회
  async function getBlockedList(myUserId) {
    if (!myUserId) return [];
    const normMyId = String(myUserId);
    if (!allowDuplicateUsers()) {
      await cleanupSelfBlock(normMyId);
    }
    const sb = getSupabase();
    if (!sb) return [];

    try {
      // 1) 내가 차단한 유저 ID 목록 조회
      const { data: blockRows, error: blockErr } = await sb
        .from("buddy_blocks")
        .select("blocked_user_id, created_at")
        .eq("blocker_user_id", normMyId)
        .order("created_at", { ascending: false });

      if (blockErr) throw blockErr;

      const blockedUserIds = (blockRows || [])
        .map((r) => String(r.blocked_user_id))
        .filter((id) => Boolean(id) && (allowDuplicateUsers() || id !== normMyId));

      // TEST 모드일 때 가상 self-block 상태이면 목록에 포함
      if (allowDuplicateUsers() && normMyId) {
        const selfBlocks = getTestSelfBlocks();
        if (selfBlocks.has(normMyId) && !blockedUserIds.includes(normMyId)) {
          blockedUserIds.unshift(normMyId);
        }
      }

      if (!blockedUserIds.length) return [];

      // 2) 프로필 정보 조회
      const { data: profileRows, error: profileErr } = await sb
        .from("user_profiles")
        .select("provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, bio, age_group, activity_region, activity_depth")
        .in("provider_user_id", blockedUserIds);

      if (profileErr) throw profileErr;

      const profileMap = new Map();
      (profileRows || []).forEach((p) => {
        profileMap.set(String(p.provider_user_id), p);
      });

      // 3) 인증 정보 일괄 확인
      let certMap = new Map();
      if (global.SNORKYCertification?.fetchCertifications) {
        try {
          certMap = await global.SNORKYCertification.fetchCertifications(blockedUserIds);
        } catch (_) {}
      }

      // 4) 차단 리스트 구성
      return blockedUserIds.map((targetId) => {
        const p = profileMap.get(String(targetId)) || {};
        const isVerified = certMap.get(String(targetId)) || (global.SNORKYCertification ? global.SNORKYCertification.checkIsVerified(p) : false);
        return {
          userId: targetId,
          displayName: p.custom_nickname || `버디_${String(targetId).slice(-4)}`,
          avatarUrl: p.custom_avatar_url || "",
          gender: p.gender || "비공개",
          ageGroup: p.age_group || "",
          aidaLevel: p.aida_level || "",
          activityRegion: p.activity_region || "",
          activityDepth: p.activity_depth || "",
          isVerified: Boolean(isVerified && p.aida_level),
          bio: p.bio || ""
        };
      });
    } catch (err) {
      console.warn("[SNORKYFriends] getBlockedList exception:", err);
      return [];
    }
  }

  global.SNORKYFriends = Object.freeze({
    TEST_MODE_ALLOW_DUPLICATE_USERS: allowDuplicateUsers(),
    cleanupSelfBlock,
    checkBlockStatus,
    checkFriendStatus,
    getBlockedUserIds,
    addFriend,
    removeFriend,
    getFriendsList,
    blockUser,
    unblockUser,
    getBlockedList,
    reportUser,
    showToast
  });

  const currentUserId = getSessionUser()?.id;
  if (currentUserId) {
    if (global.supabase) cleanupSelfBlock(currentUserId);
    else global.addEventListener?.("snorky:supabase-ready", () => cleanupSelfBlock(currentUserId), { once: true });
  }
})(typeof window !== "undefined" ? window : globalThis);
