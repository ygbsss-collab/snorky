// Comprehensive test for buddy profile and participant count matching
import assert from 'node:assert';

function resolveProfile(userId, fallback = {}) {
  const id = String(userId || '');
  return {
    displayName: fallback.displayName || (id ? `버디_${id.slice(-4)}` : '다이버'),
    avatarUrl: fallback.avatarUrl || '',
    gender: fallback.gender || '비공개',
    aidaLevel: fallback.aidaLevel || '없음',
    bio: fallback.bio || ''
  };
}

function renderTrigger({ userId, profile, className = '' }) {
  const data = profile || {};
  return `<button class="${className}" data-user-id="${userId}">${data.displayName}</button>`;
}

function simulateRenderConfirmedParticipants(approvedApplications, post, options = {}) {
  const allowDuplicate = options.allowDuplicate !== undefined ? options.allowDuplicate : true;
  const hostId = String(post.user_id || "");
  const participants = [];
  const seenUserIds = new Set();
  if (!allowDuplicate && hostId) {
    seenUserIds.add(hostId);
  }

  approvedApplications.forEach((application) => {
    const userId = String(application.applicant_user_id || "");
    if (!userId) return;
    if (!allowDuplicate) {
      if (seenUserIds.has(userId)) return;
      seenUserIds.add(userId);
    }
    participants.push({
      applicationId: application.id,
      userId,
      profile: resolveProfile(userId, {
        displayName: application.displayName,
        gender: application.applicant_gender || "비공개",
        aidaLevel: application.applicant_aida_level || "없음",
        bio: application.introduction || ""
      })
    });
  });

  const maxVisible = 5;
  const visibleParticipants = participants.slice(0, maxVisible);
  const hiddenCount = participants.length - maxVisible;

  let html = visibleParticipants.map((participant) => renderTrigger({
    userId: participant.userId,
    profile: participant.profile,
    className: "buddy-confirmed-avatar"
  })).join("");

  if (hiddenCount > 0) {
    html += `<span class="buddy-confirmed-more">+${hiddenCount}</span>`;
  }

  return { participants, html, totalCount: 1 + participants.length };
}

// ── Scenario 1: Same user_id has 2 approved application rows in TEST mode ──
const post = { id: 1, user_id: 'host_100', capacity: 6 };
const approvedApps = [
  { id: 10, applicant_user_id: 'user_same_999', displayName: '홍길동', applicant_gender: '남성', applicant_aida_level: 'AIDA 2', status: 'APPROVED' },
  { id: 11, applicant_user_id: 'user_same_999', displayName: '홍길동', applicant_gender: '남성', applicant_aida_level: 'AIDA 2', status: 'APPROVED' }
];

const result1 = simulateRenderConfirmedParticipants(approvedApps, post, { allowDuplicate: true });

console.log('--- Scenario 1: TEST mode duplicate user_id approval ---');
console.log('Approved applications input length:', approvedApps.length);
console.log('Result participants length:', result1.participants.length);
console.log('Total count (host 1 + approved 2):', `${result1.totalCount} / ${post.capacity}명`);
console.log('Rendered HTML button count:', (result1.html.match(/<button/g) || []).length);

assert.strictEqual(result1.participants.length, 2, 'Should preserve 2 participant entries');
assert.strictEqual(result1.totalCount, 3, 'Total count must be 3 (1 host + 2 approved applications)');
assert.strictEqual((result1.html.match(/<button/g) || []).length, 2, 'Should render 2 avatar buttons in HTML');

// ── Scenario 2: Host same user_id in TEST mode ──
const approvedHostSelf = [
  { id: 12, applicant_user_id: 'host_100', displayName: '주최자본인', status: 'APPROVED' }
];
const result2 = simulateRenderConfirmedParticipants(approvedHostSelf, post, { allowDuplicate: true });
console.log('\n--- Scenario 2: Host same user_id in TEST mode ---');
console.log('Result participants length:', result2.participants.length);
console.log('Total count:', `${result2.totalCount} / ${post.capacity}명`);
assert.strictEqual(result2.participants.length, 1, 'Host same user should be rendered in TEST mode');
assert.strictEqual(result2.totalCount, 2, 'Total count must be 2');

// ── Scenario 3: Production mode (allowDuplicate: false) ──
const result3 = simulateRenderConfirmedParticipants(approvedApps, post, { allowDuplicate: false });
console.log('\n--- Scenario 3: Production mode de-duplication ---');
console.log('Result participants length:', result3.participants.length);
assert.strictEqual(result3.participants.length, 1, 'Production mode should dedupe by user_id to 1');

console.log('\n✅ ALL VERIFICATION SCENARIOS PASSED!');
