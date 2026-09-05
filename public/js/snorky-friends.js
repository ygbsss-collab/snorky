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

  // TEST 모드 플래그: 자기 자신 대상 프렌즈/차단/신고 동작 허용 (TEST 종료 시 false로 변경)
  const TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS = true;

  function getTestSelfFriends() {
    if (!TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) return new Set();
    try {
      const raw = sessionStorage.getItem("snorky_test_self_friends");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      return new Set();
    }
  }

  function setTestSelfFriends(set) {
    try {
      sessionStorage.setItem("snorky_test_self_friends", JSON.stringify([...set]));
    } catch (_) {}
  }

  function getTestSelfBlocks() {
    if (!TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) return new Set();
    try {
      const raw = sessionStorage.getItem("snorky_test_self_blocks");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      return new Set();
    }
  }

  function setTestSelfBlocks(set) {
    try {
      sessionStorage.setItem("snorky_test_self_blocks", JSON.stringify([...set]));
    } catch (_) {}
  }

  // 1. 차단 관계 확인
  async function checkBlockStatus(userA, userB) {
    if (!userA || !userB) {
      return { blockedByMe: false, blockedByThem: false, isBlocked: false };
    }
    if (userA === userB) {
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        const selfBlocks = getTestSelfBlocks();
        const isBlocked = selfBlocks.has(userA);
        return { blockedByMe: isBlocked, blockedByThem: isBlocked, isBlocked };
      }
      return { blockedByMe: false, blockedByThem: false, isBlocked: false };
    }
    const sb = getSupabase();
    if (!sb) return { blockedByMe: false, blockedByThem: false, isBlocked: false };

    try {
      const { data, error } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`and(blocker_user_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_user_id.eq.${userB},blocked_user_id.eq.${userA})`);

      if (error) {
        console.warn("[SNORKYFriends] checkBlockStatus error:", error);
        return { blockedByMe: false, blockedByThem: false, isBlocked: false };
      }

      const rows = data || [];
      const blockedByMe = rows.some((r) => r.blocker_user_id === userA && r.blocked_user_id === userB);
      const blockedByThem = rows.some((r) => r.blocker_user_id === userB && r.blocked_user_id === userA);

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
    const blockedSet = new Set();

    if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
      const selfBlocks = getTestSelfBlocks();
      if (selfBlocks.has(myUserId)) {
        blockedSet.add(myUserId);
      }
    }

    const sb = getSupabase();
    if (!sb) return blockedSet;

    try {
      const { data, error } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`blocker_user_id.eq.${myUserId},blocked_user_id.eq.${myUserId}`);

      if (error) {
        console.warn("[SNORKYFriends] getBlockedUserIds error:", error);
        return blockedSet;
      }

      (data || []).forEach((r) => {
        if (r.blocker_user_id === myUserId && r.blocked_user_id) {
          blockedSet.add(String(r.blocked_user_id));
        }
        if (r.blocked_user_id === myUserId && r.blocker_user_id) {
          blockedSet.add(String(r.blocker_user_id));
        }
      });

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
    if (userA === userB) {
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        const selfFriends = getTestSelfFriends();
        const isFriend = selfFriends.has(userA);
        return { isFriend, friendRowId: isFriend ? `test_self_${userA}` : null };
      }
      return { isFriend: false, friendRowId: null };
    }
    const sb = getSupabase();
    if (!sb) return { isFriend: false, friendRowId: null };

    try {
      const { data, error } = await sb
        .from("snorky_friends")
        .select("id, user_id, friend_user_id")
        .or(`and(user_id.eq.${userA},friend_user_id.eq.${userB}),and(user_id.eq.${userB},friend_user_id.eq.${userA})`);

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
    if (myUserId === targetUserId) {
      if (!TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        throw new Error("자기 자신은 프렌즈로 등록할 수 없습니다.");
      }
      // TEST 전용 자기 자신 등록
      const blockStatus = await checkBlockStatus(myUserId, targetUserId);
      if (blockStatus.isBlocked) {
        throw new Error("차단한 사용자는 프렌즈로 등록할 수 없습니다.");
      }
      const selfFriends = getTestSelfFriends();
      if (selfFriends.has(myUserId)) {
        return { ok: true, alreadyFriend: true, id: `test_self_${myUserId}` };
      }
      selfFriends.add(myUserId);
      setTestSelfFriends(selfFriends);

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "add", targetUserId }
        }));
      }
      return { ok: true, id: `test_self_${myUserId}` };
    }

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    // 1) 차단 관계 검사
    const blockStatus = await checkBlockStatus(myUserId, targetUserId);
    if (blockStatus.blockedByMe) {
      throw new Error("차단한 사용자는 프렌즈로 등록할 수 없습니다.");
    }
    if (blockStatus.blockedByThem) {
      throw new Error("해당 사용자를 프렌즈로 등록할 수 없습니다.");
    }

    // 2) 이미 프렌즈인지 검사
    const friendStatus = await checkFriendStatus(myUserId, targetUserId);
    if (friendStatus.isFriend) {
      return { ok: true, alreadyFriend: true, id: friendStatus.friendRowId };
    }

    // 3) 상호 1개 row 생성 (정규화 인덱스: least, greatest)
    const { data, error } = await sb
      .from("snorky_friends")
      .insert([{ user_id: myUserId, friend_user_id: targetUserId }])
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
        detail: { action: "add", targetUserId }
      }));
    }

    return { ok: true, id: data?.id };
  }

  // 4. 프렌즈 삭제 (상호 관계 삭제)
  async function removeFriend(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) return { ok: false };
    if (myUserId === targetUserId) {
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        const selfFriends = getTestSelfFriends();
        selfFriends.delete(myUserId);
        setTestSelfFriends(selfFriends);
        if (typeof global.dispatchEvent === "function") {
          global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
            detail: { action: "remove", targetUserId }
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
        .or(`and(user_id.eq.${myUserId},friend_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_user_id.eq.${myUserId})`);

      if (error) throw error;

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "remove", targetUserId }
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
    const sb = getSupabase();
    if (!sb) return [];

    try {
      // 1) 프렌즈 row 조회
      const { data: friendRows, error: friendErr } = await sb
        .from("snorky_friends")
        .select("id, user_id, friend_user_id, created_at")
        .or(`user_id.eq.${myUserId},friend_user_id.eq.${myUserId}`)
        .order("created_at", { ascending: false });

      if (friendErr) throw friendErr;

      // 2) 상대방 user_id 추출
      const targetUserIds = (friendRows || []).map((r) => {
        return r.user_id === myUserId ? r.friend_user_id : r.user_id;
      }).filter(Boolean);

      // TEST 모드일 때 자기 자신 프렌즈 등록 상태이면 목록에 포함
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS && myUserId) {
        const selfFriends = getTestSelfFriends();
        if (selfFriends.has(myUserId) && !targetUserIds.includes(myUserId)) {
          targetUserIds.unshift(myUserId);
        }
      }

      if (!targetUserIds.length) return [];

      // 3) 차단된 사용자 목록 조회하여 제외
      const { data: blockRows } = await sb
        .from("buddy_blocks")
        .select("blocker_user_id, blocked_user_id")
        .or(`blocker_user_id.eq.${myUserId},blocked_user_id.eq.${myUserId}`);

      const blockedSet = new Set();
      (blockRows || []).forEach((b) => {
        if (b.blocker_user_id === myUserId) blockedSet.add(b.blocked_user_id);
        if (b.blocked_user_id === myUserId) blockedSet.add(b.blocker_user_id);
      });

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
    if (myUserId === targetUserId) {
      if (!TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        throw new Error("자기 자신은 차단할 수 없습니다.");
      }
      // TEST 전용 자기 자신 차단
      const selfBlocks = getTestSelfBlocks();
      selfBlocks.add(myUserId);
      setTestSelfBlocks(selfBlocks);

      // 기존 프렌즈 관계 즉시 삭제
      await removeFriend(myUserId, targetUserId).catch(() => {});

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-blocked", {
          detail: { blockerUserId: myUserId, blockedUserId: targetUserId }
        }));
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "block", targetUserId }
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
        .insert([{ blocker_user_id: myUserId, blocked_user_id: targetUserId }]);

      if (blockErr && blockErr.code !== "23505") {
        throw blockErr;
      }

      // 2) 기존 프렌즈 관계가 있으면 즉시 삭제
      await removeFriend(myUserId, targetUserId).catch(() => {});

      // 3) 이벤트 브로드캐스트
      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-blocked", {
          detail: { blockerUserId: myUserId, blockedUserId: targetUserId }
        }));
        global.dispatchEvent(new CustomEvent("snorky:friends-changed", {
          detail: { action: "block", targetUserId }
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

    const nowIso = new Date().toISOString();
    const content = [
      `[사용자 신고 접수]`,
      `- 신고 접수 시각: ${nowIso}`,
      `- 신고 사유: ${reason}`,
      `- 신고자 ID: ${reporterId || "미확인"}`,
      `- 신고자 닉네임: ${reporterNickname || "미확인"}`,
      `- 신고 대상 ID: ${targetId}`,
      `- 신고 대상 닉네임: ${targetNickname || "미확인"}`,
      `- 관련 버디 공고 ID: ${postId || "없음"}`,
      ``,
      `[상세 내용]`,
      details ? details.trim() : "(상세 내용 없음)"
    ].join("\n");

    const payload = {
      inquiry_type: "other",
      point_name: targetNickname ? `사용자 신고: ${targetNickname}` : "사용자 신고",
      content: content,
      reply_email: null
    };

    const { data, error } = await sb.functions.invoke("submit-inquiry", { body: payload });
    if (error) {
      console.error("[SNORKYFriends] reportUser error:", error);
      throw new Error("신고 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (data && data.ok === false) {
      throw new Error(data.message || "신고 접수에 실패했습니다.");
    }

    return { ok: true };
  }

  // 8. 사용자 차단 해제하기
  async function unblockUser(myUserId, targetUserId) {
    if (!myUserId || !targetUserId) {
      throw new Error("사용자 정보가 올바르지 않습니다.");
    }
    if (myUserId === targetUserId) {
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS) {
        const selfBlocks = getTestSelfBlocks();
        selfBlocks.delete(myUserId);
        setTestSelfBlocks(selfBlocks);
        if (typeof global.dispatchEvent === "function") {
          global.dispatchEvent(new CustomEvent("snorky:user-unblocked", {
            detail: { blockerUserId: myUserId, unblockedUserId: targetUserId }
          }));
        }
        return { ok: true };
      }
      return { ok: false };
    }

    const sb = getSupabase();
    if (!sb) throw new Error("데이터베이스 연결에 실패했습니다.");

    try {
      const { error } = await sb
        .from("buddy_blocks")
        .delete()
        .eq("blocker_user_id", myUserId)
        .eq("blocked_user_id", targetUserId);

      if (error) throw error;

      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("snorky:user-unblocked", {
          detail: { blockerUserId: myUserId, unblockedUserId: targetUserId }
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
    const sb = getSupabase();
    if (!sb) return [];

    try {
      // 1) 내가 차단한 유저 ID 목록 조회
      const { data: blockRows, error: blockErr } = await sb
        .from("buddy_blocks")
        .select("blocked_user_id, created_at")
        .eq("blocker_user_id", myUserId)
        .order("created_at", { ascending: false });

      if (blockErr) throw blockErr;

      const blockedUserIds = (blockRows || []).map((r) => r.blocked_user_id).filter(Boolean);

      // TEST 모드일 때 self-block 상태이면 목록에 포함
      if (TEST_MODE_ALLOW_SELF_PROFILE_ACTIONS && myUserId) {
        const selfBlocks = getTestSelfBlocks();
        if (selfBlocks.has(myUserId) && !blockedUserIds.includes(myUserId)) {
          blockedUserIds.unshift(myUserId);
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
        const isVerified = certMap.get(String(targetId)) || false;
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
})(typeof window !== "undefined" ? window : globalThis);
