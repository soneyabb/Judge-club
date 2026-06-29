// 2026 Y2K 레트로 판단 다이어리 - Core JS

// 전역 상태 객체
const state = {
  logs: [],
  selectedCategory: '',
  selectedEditCategory: '',
  syncCode: '',
};

// [5-1] 운영(실사용자 데이터) vs 로컬 편집/테스트 환경 자동 감지
// localhost, 127.0.0.1, file:// 프로토콜(안티그래비티/로컬 더블클릭 실행 포함)에서는 개발 환경으로 간주
const IS_DEV_ENV = (
  location.protocol === 'file:' ||
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === ''
);

// [5-2] 운영 데이터 키(judgment_logs_db)는 코드에 절대 하드코딩되지 않고, 오직 사용자 기기의 localStorage에만 존재함.
// 로컬 개발 환경에서는 별도의 DEV 전용 키를 사용해 실사용자 데이터(judgment_logs_db)와 완전히 분리됨.
const LOGS_STORAGE_KEY = IS_DEV_ENV ? 'judgment_logs_db_DEV' : 'judgment_logs_db';

if (IS_DEV_ENV) {
  console.warn('[Judge Club] 로컬 개발 환경 감지됨 → DEV 전용 더미 데이터(judgment_logs_db_DEV)를 사용합니다. 실사용자 데이터(judgment_logs_db)는 로드되지 않습니다.');
}

// 무료 임시 NoSQL 키-밸류 저장소 버킷 ID (kvdb.io 공용 버킷)
// 문자열 분할로 봇의 자동 수집 방지
const KVDB_BUCKET_PARTS = ['SBg', '5FU', '8VD', '9tY', 'XfA', 'aJJ', 'FvB', '8'];
const KVDB_BUCKET = KVDB_BUCKET_PARTS.join('');
const KVDB_BASE_URL = `https://kvdb.io/${KVDB_BUCKET}/`;

// 카테고리 텍스트 및 상세 매칭 가이드 매핑 (초간결 한 줄 멘트로 교체하여 줄바꿈 최소화)
const categoryMeta = {
  money: { text: '돈 💰', colorClass: 'money', guide: '소비·저축·지름신 등 돈 관련 결정' },
  people: { text: '사람 👥', colorClass: 'people', guide: '인간관계·대화·만남 등 관계 관련 결정' },
  career: { text: '커리어 💼', colorClass: 'career', guide: '업무·공부·이직 등 커리어 관련 결정' },
  health: { text: '건강 💊', colorClass: 'health', guide: '수면·식단·운동 등 몸 관련 결정' },
  daily: { text: '일상 🍿', colorClass: 'daily', guide: '메뉴 선택, 콘텐츠 시청 등 소소한 일상 결정' },
  etc: { text: '기타 🎨', colorClass: 'etc', guide: '위 카테고리에 속하지 않는 기타 결정' }
};

// 원인 코드와 한글 레이블 및 플레이스홀더 가이드 매핑 (중복 이모지 🤔 로 교체)
const causeMeta = {
  impulse: {
    label: '⚡ 조급·충동',
    placeholder: '그때 왜 욱했는지 한 줄 적기...',
    guide: '시간적인 여유가 없거나 갑작스러운 감정 변화로 성급하게 지른 판단'
  },
  brain: {
    label: '🧠 뇌피셜',
    placeholder: '사실 확인 대신 무얼 믿었는지...',
    guide: '객관적인 통계나 데이터 없이 오직 내 직감과 막연한 희망사항을 근거로 한 판단'
  },
  lack: {
    label: '🔍 정보부족',
    placeholder: '놓치고 서둘렀던 팩트가 무엇인지...',
    guide: '마음은 조급하지 않았으나 선택에 필요한 지식과 정보 수집이 덜 된 상태의 판단'
  },
  ears: {
    label: '👥 귀가얇음',
    placeholder: '누구의 말이나 어떤 정보에 낚였는지...',
    guide: '주변인들의 섣부른 조언, 대세 유행, 여론 및 커뮤니티 댓글에 휩쓸린 판단'
  },
  lazy: {
    label: '🛌 귀찮음',
    placeholder: '귀찮아서 생략해버린 생각이 뭔지...',
    guide: '시간적 여유는 충분했으나 깊게 고민하기 피곤해서 대충 생략해 버린 판단'
  },
  luck: {
    label: '🎲 그냥운',
    placeholder: '통제 불가했던 돌발 변수가 뭔지...',
    guide: '내 계획과 대처는 완벽했으나 통제 불가능한 천재지변이나 타인의 변수로 빗나간 판단'
  },
  etc: {
    label: '🎨 기타',
    placeholder: '판단이 빗나간 솔직한 원인 적기...',
    guide: '분류하기 어렵거나 복합적인 이유로 오류가 발생한 사소한 판단'
  }
};

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
  initDateInput();
  initSyncCode();
  loadData();
  setupEventListeners();
  renderHistory();
  renderAnalysis();
});

// 오늘 날짜 자동 입력 (KST 시간 기준)
function initDateInput() {
  const dateInput = document.getElementById('input-date');
  if (dateInput) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
  }
}

// 8자리 랜덤 동기화 코드 발급 (Y2K-XXXX-XXXX 형식)
const SYNC_CODE_STORAGE_KEY = IS_DEV_ENV ? 'judgment_sync_code_DEV' : 'judgment_sync_code';

function initSyncCode() {
  let code = localStorage.getItem(SYNC_CODE_STORAGE_KEY);
  if (!code) {
    code = generateRandomSyncCode();
    localStorage.setItem(SYNC_CODE_STORAGE_KEY, code);
  }
  state.syncCode = code;
  const myCodeEl = document.getElementById('my-sync-code');
  if (myCodeEl) {
    myCodeEl.value = code;
  }
}

// 8자리 코드 생성 헬퍼 (충돌 방지를 위해 12자리 Y2K-XXXX-XXXX-XXXX로 보안 강화)
function generateRandomSyncCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint32Array(12);
  crypto.getRandomValues(array);
  let p1 = '';
  let p2 = '';
  let p3 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(array[i] % chars.length);
    p2 += chars.charAt(array[i + 4] % chars.length);
    p3 += chars.charAt(array[i + 8] % chars.length);
  }
  return `Y2K-${p1}-${p2}-${p3}`;
}

// 동기화 코드 해시 함수 (SHA-256)
async function hashSyncCode(code) {
  const encoded = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// 예시(온보딩) 데이터 버전. 예시 카드 내용을 수정할 때마다 이 값을 올리면
// 사용자 localStorage에 이미 저장된 예시 카드만 최신 내용으로 자동 교체됨 (실제 기록은 영향 없음)
const EXAMPLE_DATA_VERSION = 4;
const EXAMPLE_VERSION_KEY = IS_DEV_ENV ? 'judgment_example_version_DEV' : 'judgment_example_version';
const DISMISSED_EXAMPLES_KEY = IS_DEV_ENV ? 'judgment_dismissed_examples_DEV' : 'judgment_dismissed_examples';

function getExampleLogs() {
  return [
    {
      id: 'ex-1',
      date: '2026-06-24',
      category: 'daily',
      judgment: '오후 4시인데 아메리카노 한 잔 더 마셔도 괜찮겠지?',
      reason: '너무 졸려서 피곤하고, 난 원래 카페인에 강하니까.',
      feedbackApplied: true,
      isCorrect: false,
      isExample: true,
      errorCause: 'brain',
      memo: '새벽 3시인데 말똥말똥해... 과거의 나 반성해라. 😳'
    },
    {
      id: 'ex-2',
      date: '2026-06-25',
      category: 'money',
      judgment: '이 부츠 지금 사두면 이번 시즌 내내 잘 신을 거 같아.',
      reason: '인플루언서가 신은 거 보니까 핏도 예쁘고, 요즘 다 이 디자인 신네!',
      feedbackApplied: true,
      isCorrect: false,
      isExample: true,
      errorCause: 'ears',
      memo: '막상 사보니 생각했던 핏이 전혀 아니고 착화감도 딱딱해서 손이 안 감... 인터넷 쇼핑은 신중히ㅠ🥕'
    },
    {
      id: 'ex-3',
      date: '2026-06-26',
      category: 'people',
      judgment: '연락이 뜸해졌던 친구한테 톡이 왔는데, 내가 먼저 만나자고 해볼까?',
      reason: '먼저 톡을 보낸 걸 보면, 나랑 다시 편하게 이야기 나누고 싶어서 보낸 걸 거야.',
      feedbackApplied: true,
      isCorrect: true,
      isExample: true,
      memo: '친구가 너무 좋다고 얼른 만나자며 약속을 바로 잡았어! 역시 먼저 다가가길 잘했어! 💬'
    }
  ];
}

// 로컬 스토리지에서 데이터 로드
function loadData() {
  const localData = localStorage.getItem(LOGS_STORAGE_KEY);
  if (localData) {
    state.logs = JSON.parse(localData);

    // 예시 카드만 최신 버전으로 자동 갱신 (사용자가 직접 작성한 실제 기록은 절대 건드리지 않음)
    const savedExampleVersion = parseInt(localStorage.getItem(EXAMPLE_VERSION_KEY) || '0', 10);
    if (savedExampleVersion < EXAMPLE_DATA_VERSION) {
      const dismissedIds = new Set(JSON.parse(localStorage.getItem(DISMISSED_EXAMPLES_KEY) || '[]'));
      const freshExamples = getExampleLogs().filter(e => !dismissedIds.has(e.id));
      const freshExampleIds = new Set(freshExamples.map(e => e.id));
      // 기존 로그 중 예시가 아닌 것(실제 기록)만 남기고, 예시는 최신 버전으로 전부 교체
      const userLogsOnly = state.logs.filter(log => !log.isExample && !freshExampleIds.has(log.id));
      state.logs = [...freshExamples, ...userLogsOnly];
      localStorage.setItem(EXAMPLE_VERSION_KEY, String(EXAMPLE_DATA_VERSION));
      saveToLocalStorage();
    }
  } else {
    // 최초 실행: 예시 데이터로 시작
    state.logs = getExampleLogs();
    localStorage.setItem(EXAMPLE_VERSION_KEY, String(EXAMPLE_DATA_VERSION));
    saveToLocalStorage();
  }
}

// 로컬 스토리지에 데이터 저장
function saveToLocalStorage() {
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));
}

// 이벤트 리스너 바인딩
function setupEventListeners() {
  // 1. 탭 전환
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // 2. 일지작기 카테고리 캡슐 선택 & 동적 가이드 텍스트 노출
  const categoryBtns = document.querySelectorAll('#tab-write .capsule-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCategory = btn.getAttribute('data-category');

      const guideTextEl = document.getElementById('live-guide-text');
      const guideBoxEl = document.getElementById('live-guide-box');
      if (guideTextEl && guideBoxEl) {
        guideTextEl.textContent = categoryMeta[state.selectedCategory]?.guide || '';
        guideBoxEl.style.backgroundColor = 'var(--pastel-blue)';
      }
    });
  });

  // 3. 일지 저장 폼 제출
  const diaryForm = document.getElementById('diary-form');
  if (diaryForm) {
    diaryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveDiary();
    });
  }

  // 4. 히스토리 필터 칩 토글
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filterValue = chip.getAttribute('data-filter');
      renderHistory(filterValue);
    });
  });

  // 5. 히스토리 커스텀 기간 설정 필터 적용/리셋
  const applyPeriodBtn = document.getElementById('btn-period-apply');
  if (applyPeriodBtn) {
    applyPeriodBtn.addEventListener('click', () => {
      const filterChips = document.querySelectorAll('.filter-chip');
      filterChips.forEach(c => c.classList.remove('active'));
      renderHistory('custom');
    });
  }

  const resetPeriodBtn = document.getElementById('btn-period-reset');
  if (resetPeriodBtn) {
    resetPeriodBtn.addEventListener('click', () => {
      document.getElementById('filter-start-date').value = '';
      document.getElementById('filter-end-date').value = '';

      const filterChips = document.querySelectorAll('.filter-chip');
      filterChips.forEach(c => c.classList.remove('active'));
      const firstChip = document.querySelector('.filter-chip[data-filter="all"]');
      if (firstChip) firstChip.classList.add('active');
      renderHistory('all');
    });
  }

  // 6. 하단 데이터 백업/복구
  const exportBtn = document.getElementById('btn-export-json');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportJSON);
  }

  const importBtn = document.getElementById('btn-import-json');
  const fileInput = document.getElementById('json-file-input');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', importJSON);
  }

  // 7. 텔레파시 동기화 모달 제어
  const telepathyBtn = document.getElementById('btn-telepathy');
  const syncModal = document.getElementById('sync-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');

  if (telepathyBtn && syncModal) {
    telepathyBtn.addEventListener('click', () => {
      syncModal.classList.add('active');
    });
  }

  if (closeModalBtn && syncModal) {
    closeModalBtn.addEventListener('click', () => {
      syncModal.classList.remove('active');
    });
    syncModal.addEventListener('click', (e) => {
      if (e.target === syncModal) {
        syncModal.classList.remove('active');
      }
    });
  }

  // 8. 동기화 코드 복사
  const copyCodeBtn = document.getElementById('btn-copy-code');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', copySyncCode);
  }

  // 8-1. 동기화 코드 새로 발급
  const regenCodeBtn = document.getElementById('btn-regen-code');
  if (regenCodeBtn) {
    regenCodeBtn.addEventListener('click', () => {
      if (confirm('동기화 코드를 새로 발급할까?\n(기존 코드로 업로드한 데이터는 새 버킷 규칙과 해싱 강화 정책에 따라 연동되지 않고 새 코드를 기준으로 동기화가 진행됩니다.)')) {
        const newCode = generateRandomSyncCode();
        localStorage.setItem(SYNC_CODE_STORAGE_KEY, newCode);
        state.syncCode = newCode;
        const myCodeEl = document.getElementById('my-sync-code');
        if (myCodeEl) {
          myCodeEl.value = newCode;
        }
        alert(`🔑 새 동기화 코드 발급 완료!\n[${newCode}]`);
      }
    });
  }

  // 9. 클라우드 쏘기 (Push)
  const pushBtn = document.getElementById('btn-sync-push');
  if (pushBtn) {
    pushBtn.addEventListener('click', pushToCloud);
  }

  // 10. 클라우드 당기기 (Pull)
  const pullBtn = document.getElementById('btn-sync-pull');
  if (pullBtn) {
    pullBtn.addEventListener('click', pullFromCloud);
  }

  // 11. 다른 기기 코드 연결 적용
  const linkCodeBtn = document.getElementById('btn-link-code');
  if (linkCodeBtn) {
    linkCodeBtn.addEventListener('click', applyTargetSyncCode);
  }

  // 12. 일지 수정 모달 닫기
  const editModal = document.getElementById('edit-modal');
  const closeEditModalBtn = document.getElementById('btn-close-edit-modal');
  if (closeEditModalBtn && editModal) {
    closeEditModalBtn.addEventListener('click', () => {
      editModal.classList.remove('active');
    });
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) {
        editModal.classList.remove('active');
      }
    });
  }

  // 13. 일지 수정 모달 내 카테고리 선택
  const editCategoryBtns = document.querySelectorAll('#edit-category-capsules .capsule-btn');
  editCategoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      editCategoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedEditCategory = btn.getAttribute('data-edit-category');
    });
  });

  // 14. 일지 수정 모달 피드백 버튼 토글
  const editBtnCorrect = document.getElementById('edit-btn-correct');
  const editBtnIncorrect = document.getElementById('edit-btn-incorrect');
  const editCauseGroup = document.getElementById('edit-cause-group');

  if (editBtnCorrect && editBtnIncorrect) {
    editBtnCorrect.addEventListener('click', () => {
      editBtnCorrect.classList.add('btn-correct');
      editBtnCorrect.style.border = '2px solid var(--text-dark)';

      editBtnIncorrect.classList.remove('btn-incorrect');
      editBtnIncorrect.style.border = '1.5px solid var(--text-dark)';

      editCauseGroup.style.display = 'none';
      editBtnCorrect.setAttribute('data-selected-feedback', 'true');
    });

    editBtnIncorrect.addEventListener('click', () => {
      editBtnIncorrect.classList.add('btn-incorrect');
      editBtnIncorrect.style.border = '2px solid var(--text-dark)';

      editBtnCorrect.classList.remove('btn-correct');
      editBtnCorrect.style.border = '1.5px solid var(--text-dark)';

      editCauseGroup.style.display = 'block';
      editBtnCorrect.setAttribute('data-selected-feedback', 'false');
    });
  }

  // 15. 일지 수정 폼 제출
  const editForm = document.getElementById('edit-form');
  if (editForm) {
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEditedDiary();
    });
  }

  // 16. 분석룸 모바일 미니 그래프 탭 스위칭 기능
  const graphTabBtns = document.querySelectorAll('.graph-tab-btn');
  graphTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      graphTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetGraph = btn.getAttribute('data-graph-tab');
      const contents = document.querySelectorAll('.graph-tab-content');
      contents.forEach(c => {
        if (c.id === targetGraph) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    });
  });
}

// 탭 전환 처리
function switchTab(tabId) {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const sections = document.querySelectorAll('.tab-section');
  sections.forEach(sec => {
    if (sec.id === tabId) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  if (tabId === 'tab-history') {
    const activeFilter = document.querySelector('.filter-chip.active')?.getAttribute('data-filter') || 'all';
    renderHistory(activeFilter);
  } else if (tabId === 'tab-analysis') {
    renderAnalysis();
  }
}

// 일지 신규 저장
function saveDiary() {
  const dateVal = document.getElementById('input-date').value;
  const judgmentVal = document.getElementById('input-judgment').value.trim();
  const reasonVal = document.getElementById('input-reason').value.trim();

  if (!state.selectedCategory) {
    alert('판단을 매칭할 카테고리를 먼저 선택해줘! 🏷️');
    return;
  }

  if (!judgmentVal || !reasonVal) {
    alert('판단과 이유를 빼놓지 말고 예쁘게 적어줘! 🔮');
    return;
  }

  const newLog = {
    id: 'log-' + Date.now(),
    date: dateVal,
    category: state.selectedCategory,
    judgment: judgmentVal,
    reason: reasonVal,
    feedbackApplied: false,
    isCorrect: null,
    errorCause: '',
    memo: ''
  };

  state.logs.unshift(newLog);
  saveToLocalStorage();
  showSaveToast();

  document.getElementById('input-judgment').value = '';
  document.getElementById('input-reason').value = '';
  const categoryBtns = document.querySelectorAll('#tab-write .capsule-btn');
  categoryBtns.forEach(btn => btn.classList.remove('active'));
  state.selectedCategory = '';

  const guideTextEl = document.getElementById('live-guide-text');
  if (guideTextEl) {
    guideTextEl.textContent = '카테고리를 누르면 설명이 여기에 나타나!';
  }

  initDateInput();
  refreshUI();
}

// 토스트 팝업 띄우기
function showSaveToast() {
  const toast = document.getElementById('save-toast');
  if (toast) {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 1500);
  }
}

// 히스토리 목록 렌더링 (딱딱한 '복기' ➡️ Y2K 라이프스타일 톤인 '리얼 코멘트'로 교체)
function renderHistory(filter = 'all') {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  historyList.innerHTML = '';

  let filteredLogs = [...state.logs];
  const today = new Date();

  if (filter === 'week') {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);
    filteredLogs = filteredLogs.filter(log => new Date(log.date) >= oneWeekAgo);
  } else if (filter === 'month') {
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    filteredLogs = filteredLogs.filter(log => new Date(log.date) >= startOfMonth);
  } else if (filter === 'pending') {
    filteredLogs = filteredLogs.filter(log => !log.feedbackApplied);
  } else if (filter === 'custom') {
    const startVal = document.getElementById('filter-start-date').value;
    const endVal = document.getElementById('filter-end-date').value;

    if (!startVal || !endVal) {
      alert('시작 날짜와 종료 날짜를 모두 선택해줘! 📅');
      const allChip = document.querySelector('.filter-chip[data-filter="all"]');
      if (allChip) allChip.click();
      return;
    }

    const startDate = new Date(startVal);
    const endDate = new Date(endVal);
    endDate.setHours(23, 59, 59);

    filteredLogs = filteredLogs.filter(log => {
      const logDate = new Date(log.date);
      return logDate >= startDate && logDate <= endDate;
    });
  }

  if (filteredLogs.length === 0) {
    historyList.innerHTML = `
      <div class="empty-history sticker-shadow" style="padding: 30px; text-align: center; background-color: #FFFFFF; font-size: 0.9rem; color: #888;">
        🌸 아직 작성한 일지가 없거나 필터 조건에 맞는 내역이 없어!<br>
        상단의 [✨ 일지적기]에서 첫 결정을 내려보자!
      </div>
    `;
    return;
  }

  filteredLogs.forEach(log => {
    const card = document.createElement('div');
    card.className = 'diary-card sticker-shadow';
    card.setAttribute('data-category', log.category);
    card.setAttribute('data-id', log.id);

    const catName = categoryMeta[log.category]?.text || '기타 🎨';
    const dateFormatted = log.date.replace(/-/g, '.');

    let exampleBadgeHtml = '';
    if (log.isExample) {
      exampleBadgeHtml = `<div class="example-badge">예시 🌟</div>`;
    }

    let feedbackSectionHtml = '';
    if (!log.feedbackApplied) {
      // 피드백 미등록 상태
      // 🤔 이모지로 교체하여 중복 방지
      feedbackSectionHtml = `
        <div class="feedback-actions">
          <button type="button" class="feedback-btn btn-correct" onclick="applyFeedback('${log.id}', true)">⭕ 맞음</button>
          <button type="button" class="feedback-btn btn-incorrect" onclick="toggleIncorrectForm('${log.id}')">❌ 틀림</button>
        </div>
        <div class="incorrect-detail-form" id="incorrect-form-${log.id}">
          <span class="form-sub-label">🤔 왜 틀렸을까? (실패 원인 한 개 선택)</span>
          <div class="error-cause-grid">
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'impulse')">⚡ 조급·충동</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'brain')">🧠 뇌피셜</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'lack')">🔍 정보부족</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'ears')">👥 귀가얇음</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'lazy')">🛌 귀찮음</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'luck')">🎲 그냥운</button>
            <button type="button" class="error-cause-btn" onclick="selectErrorCause('${log.id}', 'etc')">🎨 기타</button>
          </div>
          
          <div class="cause-desc-box" id="cause-desc-${log.id}" style="display: none;"></div>

          <div class="cause-memo-wrapper" id="memo-wrapper-${log.id}">
            <input type="text" class="cause-memo-input" id="memo-input-${log.id}" placeholder="실패 원인에 대한 솔직한 생각을 남겨줘...">
          </div>
          <button type="button" class="cause-submit-btn" onclick="submitIncorrectFeedback('${log.id}')">피드백 저장 완료! 🔮</button>
        </div>
      `;
    } else {
      // 피드백 완료 상태 ('복기:' ➡️ '코멘트:' 워딩 교체)
      const badgeClass = log.isCorrect ? 'correct' : 'incorrect';
      const badgeText = log.isCorrect ? '⭕ 맞음!' : '❌ 틀림!';
      const causeText = !log.isCorrect && log.errorCause ? `(${causeMeta[log.errorCause]?.label})` : '';
      // 코멘트를 card-row 패턴(flex 들여쓰기)으로 렌더링하여 줄 넘김 시 레이블 아래로 내려가지 않게 처리
      const memoHtml = log.memo ? `<div class="card-row result-memo"><strong>💡 코멘트:</strong><span class="card-val">${log.memo}</span></div>` : '';

      feedbackSectionHtml = `
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1.5px dashed rgba(0,0,0,0.15);">
          <span class="result-badge ${badgeClass}">${badgeText} ${causeText}</span>
          ${memoHtml}
        </div>
      `;
    }

    const actionbarHtml = `
      <div class="card-action-bar">
        <button type="button" class="card-action-btn btn-card-edit" onclick="openEditModal('${log.id}')">수정 ✏️</button>
        <button type="button" class="card-action-btn btn-card-delete" onclick="deleteDiary('${log.id}')">삭제 🗑️</button>
      </div>
    `;

    // 💡 판단/이유 출력 시 정렬 구조 가독성 패치 반영 (<span class="card-val">로 감싸 정렬)
    card.innerHTML = `
      ${exampleBadgeHtml}
      <div class="card-header">
        <span class="card-date">${dateFormatted}</span>
        <span class="card-tag">${catName}</span>
      </div>
      <div class="card-row">
        <strong>판단:</strong><span class="card-val card-text">${log.judgment}</span>
      </div>
      <div class="card-row">
        <strong>이유:</strong><span class="card-val card-reason">${log.reason}</span>
      </div>
      ${feedbackSectionHtml}
      ${actionbarHtml}
    `;

    historyList.appendChild(card);
  });
}

// 피드백 ⭕ 맞음 즉시 적용
window.applyFeedback = function (logId, isCorrect) {
  const log = state.logs.find(l => l.id === logId);
  if (!log) return;

  log.feedbackApplied = true;
  log.isCorrect = isCorrect;
  log.memo = isCorrect ? '판단이 아주 정확했어! 나 자신을 더 믿어봐 ✨' : '';

  saveToLocalStorage();
  refreshUI();
};

// ❌ 틀림 시 폼 토글
window.toggleIncorrectForm = function (logId) {
  const form = document.getElementById(`incorrect-form-${logId}`);
  if (form) {
    form.classList.toggle('active');
  }
};

// 오답 원인 선택
window.selectErrorCause = function (logId, causeCode) {
  const form = document.getElementById(`incorrect-form-${logId}`);
  if (!form) return;

  const btns = form.querySelectorAll('.error-cause-btn');
  btns.forEach(btn => {
    const matches = btn.getAttribute('onclick').includes(`'${causeCode}'`);
    if (matches) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const descBox = document.getElementById(`cause-desc-${logId}`);
  if (descBox) {
    descBox.textContent = causeMeta[causeCode]?.guide || '';
    descBox.style.display = 'block';
  }

  const memoWrapper = document.getElementById(`memo-wrapper-${logId}`);
  const memoInput = document.getElementById(`memo-input-${logId}`);

  if (memoWrapper && memoInput) {
    memoWrapper.classList.add('active');
    memoInput.placeholder = causeMeta[causeCode]?.placeholder || '솔직한 한 줄 리뷰 남기기...';
    memoInput.setAttribute('data-selected-cause', causeCode);
    memoInput.focus();
  }
};

// 오답 피드백 제출
window.submitIncorrectFeedback = function (logId) {
  const log = state.logs.find(l => l.id === logId);
  if (!log) return;

  const memoInput = document.getElementById('memo-input-' + logId);
  const causeCode = memoInput ? memoInput.getAttribute('data-selected-cause') : '';
  const memoText = memoInput ? memoInput.value.trim() : '';

  if (!causeCode) {
    alert('틀린 이유를 하나 선택해줘! 🥺');
    return;
  }

  log.feedbackApplied = true;
  log.isCorrect = false;
  log.errorCause = causeCode;
  log.memo = memoText || `${causeMeta[causeCode]?.label}로 인한 판단 차이.`;

  saveToLocalStorage();
  refreshUI();
};

// 일지 삭제 기능
window.deleteDiary = function (logId) {
  const log = state.logs.find(l => l.id === logId);
  if (!log) return;

  const confirmMsg = log.isExample
    ? '이 튜토리얼 예시 카드를 정말 삭제할래? 😮'
    : `[${log.judgment.substring(0, 15)}...] 판단 일지를 정말 삭제할까? 🗑️`;

  if (confirm(confirmMsg)) {
    state.logs = state.logs.filter(l => l.id !== logId);

    // 예시 카드를 지운 경우, 이후 예시 데이터가 업데이트되어도 이 카드는 되살아나지 않도록 영구 기록
    if (log.isExample) {
      const dismissed = JSON.parse(localStorage.getItem(DISMISSED_EXAMPLES_KEY) || '[]');
      if (!dismissed.includes(logId)) {
        dismissed.push(logId);
        localStorage.setItem(DISMISSED_EXAMPLES_KEY, JSON.stringify(dismissed));
      }
    }

    saveToLocalStorage();
    refreshUI();
  }
};

// 일지 수정 모달 열기
window.openEditModal = function (logId) {
  const log = state.logs.find(l => l.id === logId);
  if (!log) return;

  const editModal = document.getElementById('edit-modal');
  if (!editModal) return;

  document.getElementById('edit-log-id').value = log.id;
  document.getElementById('edit-date').value = log.date;
  document.getElementById('edit-judgment').value = log.judgment;
  document.getElementById('edit-reason').value = log.reason;

  state.selectedEditCategory = log.category;
  const editCapsules = document.querySelectorAll('#edit-category-capsules .capsule-btn');
  editCapsules.forEach(btn => {
    if (btn.getAttribute('data-edit-category') === log.category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const fbFields = document.getElementById('edit-feedback-fields');
  const editBtnCorrect = document.getElementById('edit-btn-correct');
  const editBtnIncorrect = document.getElementById('edit-btn-incorrect');
  const editCauseGroup = document.getElementById('edit-cause-group');
  const editErrorCause = document.getElementById('edit-error-cause');
  const editMemo = document.getElementById('edit-memo');

  if (log.feedbackApplied) {
    fbFields.style.display = 'block';
    editMemo.value = log.memo;

    if (log.isCorrect) {
      editBtnCorrect.classList.add('btn-correct');
      editBtnCorrect.style.border = '2px solid var(--text-dark)';
      editBtnIncorrect.classList.remove('btn-incorrect');
      editBtnIncorrect.style.border = '1.5px solid var(--text-dark)';
      editCauseGroup.style.display = 'none';
      editBtnCorrect.setAttribute('data-selected-feedback', 'true');
    } else {
      editBtnIncorrect.classList.add('btn-incorrect');
      editBtnIncorrect.style.border = '2px solid var(--text-dark)';
      editBtnCorrect.classList.remove('btn-correct');
      editBtnCorrect.style.border = '1.5px solid var(--text-dark)';
      editCauseGroup.style.display = 'block';
      editErrorCause.value = log.errorCause || 'impulse';
      editBtnCorrect.setAttribute('data-selected-feedback', 'false');
    }
  } else {
    fbFields.style.display = 'none';
  }

  editModal.classList.add('active');
};

// 일지 수정 저장 제출
function saveEditedDiary() {
  const id = document.getElementById('edit-log-id').value;
  const log = state.logs.find(l => l.id === id);
  if (!log) return;

  const dateVal = document.getElementById('edit-date').value;
  const judgmentVal = document.getElementById('edit-judgment').value.trim();
  const reasonVal = document.getElementById('edit-reason').value.trim();

  if (!judgmentVal || !reasonVal) {
    alert('판단과 이유를 정확히 채워줘! 🔮');
    return;
  }

  log.date = dateVal;
  log.category = state.selectedEditCategory;
  log.judgment = judgmentVal;
  log.reason = reasonVal;

  if (log.feedbackApplied) {
    const editBtnCorrect = document.getElementById('edit-btn-correct');
    const isCorrect = editBtnCorrect.getAttribute('data-selected-feedback') === 'true';
    log.isCorrect = isCorrect;

    if (isCorrect) {
      log.errorCause = '';
      log.memo = document.getElementById('edit-memo').value.trim() || '판단이 아주 정확했어! 나 자신을 더 믿어봐 ✨';
    } else {
      log.errorCause = document.getElementById('edit-error-cause').value;
      log.memo = document.getElementById('edit-memo').value.trim() || `${causeMeta[log.errorCause]?.label}로 인한 판단 차이.`;
    }
  }

  saveToLocalStorage();
  document.getElementById('edit-modal').classList.remove('active');
  refreshUI();
}

// 화면 갱신 유틸
function refreshUI() {
  const activeFilter = document.querySelector('.filter-chip.active')?.getAttribute('data-filter') || 'all';
  renderHistory(activeFilter);
  renderAnalysis();
}

// 분석룸 데이터 계산 및 차트 렌더링
function renderAnalysis() {
  const accuracyValueEl = document.getElementById('accuracy-value');
  const feedbackCountEl = document.getElementById('feedback-count');
  const correctCountEl = document.getElementById('correct-count');
  const bestCategoryEl = document.getElementById('best-category');
  const worstReasonEl = document.getElementById('worst-reason');
  const guidelineContentEl = document.getElementById('guideline-content');

  const userLogs = state.logs.filter(log => !log.isExample);
  const feedbackAppliedLogs = userLogs.filter(log => log.feedbackApplied);

  const totalCount = feedbackAppliedLogs.length;
  const correctCount = feedbackAppliedLogs.filter(log => log.isCorrect).length;

  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  accuracyValueEl.textContent = `${accuracy}%`;
  feedbackCountEl.textContent = totalCount;
  correctCountEl.textContent = correctCount;

  const catStats = {
    money: { total: 0, correct: 0, text: '돈 💰' },
    people: { total: 0, correct: 0, text: '사람 👥' },
    career: { total: 0, correct: 0, text: '커리어 💼' },
    health: { total: 0, correct: 0, text: '건강 💊' },
    daily: { total: 0, correct: 0, text: '일상 🍿' },
    etc: { total: 0, correct: 0, text: '기타 🎨' }
  };

  feedbackAppliedLogs.forEach(log => {
    if (catStats[log.category]) {
      catStats[log.category].total++;
      if (log.isCorrect) {
        catStats[log.category].correct++;
      }
    }
  });

  let bestCat = '데이터 없음';
  let maxRate = -1;

  Object.keys(catStats).forEach(cat => {
    if (catStats[cat].total > 0) {
      const rate = catStats[cat].correct / catStats[cat].total;
      if (rate > maxRate) {
        maxRate = rate;
        bestCat = categoryMeta[cat]?.text || '기타';
      }
    }
  });

  bestCategoryEl.textContent = totalCount > 0 ? bestCat : '데이터 없음';

  const incorrectLogs = feedbackAppliedLogs.filter(log => !log.isCorrect);
  const causeCounts = {
    impulse: 0, brain: 0, lack: 0, ears: 0, lazy: 0, luck: 0, etc: 0
  };

  incorrectLogs.forEach(log => {
    if (log.errorCause && causeCounts[log.errorCause] !== undefined) {
      causeCounts[log.errorCause]++;
    }
  });

  let worstCause = '';
  let maxCauseCount = 0;
  Object.keys(causeCounts).forEach(cause => {
    if (causeCounts[cause] > maxCauseCount) {
      maxCauseCount = causeCounts[cause];
      worstCause = cause;
    }
  });

  worstReasonEl.textContent = (incorrectLogs.length > 0 && worstCause) ? causeMeta[worstCause]?.label : '데이터 없음';

  if (incorrectLogs.length === 0 || !worstCause) {
    guidelineContentEl.innerHTML = `
      현재까지 기록된 너의 진짜 판단 오답이 아직 없어! 😊<br>
      일지를 기록하고 히스토리에서 맞았는지 틀렸는지 솔직한 피드백을 완성해줘.<br>
      오답들이 쌓이면 너만을 위한 <strong>2026 맞춤 다이내믹 피드백</strong>을 발송해 줄게! 🔮
    `;
  } else {
    let feedbackGuideText = '';
    switch (worstCause) {
      case 'impulse':
        feedbackGuideText = `
          🚨 <strong>조급 경보 발령!</strong> 너 지금 엄청 욱하고 조급하게 지른 판단이 제일 많아! 😤 
          감정이 과잉된 상태거나 시간에 쫓길 땐 그 어떤 결정도 내리지 마. 
          결정하기 전에 <strong>딱 10분만 폰을 내려놓고 심호흡</strong>해 보자. 너의 지갑과 이불은 소중하니까! ✨
        `;
        break;
      case 'brain':
        feedbackGuideText = `
          🔮 <strong>촉은 그저 촉일 뿐!</strong> 객관적인 팩트 없는 뇌피셜로 배팅했다가 패배한 흔적이 너무 선명해! 🧠
          앞으로 중대 결정을 내릴 땐 너의 육감만 믿지 말고, 네이버/구글 검색이나 친구 교차 검증 등 
          <strong>최소 2개 이상의 팩트 정보</strong>를 수집하고 판단하는 습관을 길러봐! 꼭이야!
        `;
        break;
      case 'lack':
        feedbackGuideText = `
          🔍 <strong>아는 것이 힘!</strong> 마음은 차분했는데 공부나 지식 검색이 2% 모자라 에러가 난 것 같아. 📖
          중요한 선택을 하기 전에는 30분만 더 검색하거나 해당 분야를 잘 아는 실력자에게 
          <strong>"이거 진짜 괜찮을까?"</strong> 하고 짧게 질문 한 마디만 먼저 해보는 건 어때?
        `;
        break;
      case 'ears':
        feedbackGuideText = `
          👂 <strong>팔랑귀 차단 요망!</strong> 남들의 여론이나 유행, 커뮤니티 댓글에 휩쓸려 무심코 내린 결정들이 발목을 잡았네!
          의견을 묻기 전, 오직 너의 눈으로 보고 판단한 <strong>나만의 오리지널 기준 딱 3가지</strong>를 메모장에 먼저 적어두고 남의 얘기를 듣기 시작하자!
        `;
        break;
      case 'lazy':
        feedbackGuideText = `
          💤 <strong>귀차니즘이 범인!</strong> 에너지가 방전된 상태에서 '에라 모르겠다' 하고 대충 넘겨버린 판단들이 결국 후회를 불렀어! 🛌
          너무 피곤하거나 머리가 지쳤을 땐 절대 선택하지 않기로 약속하자. 
          그 결정은 잠시 서랍에 넣어두고, <strong>푹 자고 일어난 내일 아침의 나</strong>에게 넘겨줘!
        `;
        break;
      case 'luck':
        feedbackGuideText = `
          🎲 <strong>하늘이 도운 오답?</strong> 너의 분석과 태도는 완벽했어! 하지만 천재지변이나 타인의 행동 등 도저히 통제 불가능한 변수 때문에 틀린 거야.
          그러니 너무 자책하지 마! 털어버리고 <strong>다음 기회를 위해 컨디션을 최상으로 유지</strong>하는 게 더 이득이야! 🌈
        `;
        break;
      default:
        feedbackGuideText = `
          🎨 <strong>기타 사유 누적 중!</strong> 다양한 원인으로 인한 오류들이 생기고 있어.
          너가 남겨둔 오답 메모들을 찬찬히 읽어보며, 네 마음속 깊은 곳에 있는 진짜 판단 패턴을 돌아보는 시간을 가져보는 걸 추천해! 🔮
        `;
        break;
    }
    guidelineContentEl.innerHTML = feedbackGuideText;
  }

  // 5. 📊 그래프 1: 카테고리별 적중률 랭킹
  const catAccuracyContainer = document.getElementById('category-accuracy-bars');
  if (catAccuracyContainer) {
    catAccuracyContainer.innerHTML = '';

    const catList = Object.keys(catStats).map(key => {
      const item = catStats[key];
      const rate = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
      return { key, text: item.text, total: item.total, rate };
    });

    catList.sort((a, b) => b.rate - a.rate);

    catList.forEach(c => {
      const barItem = document.createElement('div');
      barItem.className = 'bar-item';

      const fillClass = c.rate >= 70 ? 'bar-fill-green' : (c.rate >= 40 ? 'bar-fill-cyan' : (c.rate > 0 ? 'bar-fill-pink' : 'bar-fill-yellow'));
      const subInfo = c.total > 0 ? `(${c.correct}/${c.total}건)` : '(기록 없음)';

      barItem.innerHTML = `
        <div class="bar-label-row">
          <span>${c.text} <small style="color:#777; font-weight:normal;">${subInfo}</small></span>
          <span>${c.rate}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${fillClass}" style="width: 0%;"></div>
        </div>
      `;
      catAccuracyContainer.appendChild(barItem);

      setTimeout(() => {
        const fill = barItem.querySelector('.bar-fill');
        if (fill) fill.style.width = `${c.rate}%`;
      }, 50);
    });
  }

  // 6. 📊 그래프 2: 오답 원인 분석 리포트
  const errorCauseContainer = document.getElementById('error-cause-bars');
  if (errorCauseContainer) {
    errorCauseContainer.innerHTML = '';

    const totalErrors = incorrectLogs.length;
    const causeList = Object.keys(causeCounts).map(key => {
      const count = causeCounts[key];
      const percentage = totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0;
      return { key, label: causeMeta[key]?.label || '기타', count, percentage };
    });

    causeList.sort((a, b) => b.percentage - a.percentage);

    causeList.forEach(cause => {
      const barItem = document.createElement('div');
      barItem.className = 'bar-item';

      const subInfo = cause.count > 0 ? `(${cause.count}건)` : '';

      barItem.innerHTML = `
        <div class="bar-label-row">
          <span>${cause.label} <small style="color:#777; font-weight:normal;">${subInfo}</small></span>
          <span>${cause.percentage}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-fill-pink" style="width: 0%;"></div>
        </div>
      `;
      errorCauseContainer.appendChild(barItem);

      setTimeout(() => {
        const fill = barItem.querySelector('.bar-fill');
        if (fill) fill.style.width = `${cause.percentage}%`;
      }, 50);
    });
  }
}

// ----------------------------------------------------
// [기기 간 동기화 & 백업/복구 기술 요구사항 구현 영역]
// ----------------------------------------------------

// 1. JSON 파일 내보내기
function exportJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.logs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);

  const today = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute("download", `judgment_diary_backup_${today}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// 2. JSON 파일 불러오기
function importJSON(e) {
  const fileReader = new FileReader();
  fileReader.onload = function (event) {
    try {
      const importedData = JSON.parse(event.target.result);
      if (Array.isArray(importedData)) {
        const existingIds = new Set(state.logs.map(log => log.id));
        let addedCount = 0;

        importedData.forEach(item => {
          if (item.id && !existingIds.has(item.id)) {
            state.logs.push(item);
            addedCount++;
          }
        });

        state.logs.sort((a, b) => b.id.localeCompare(a.id));
        saveToLocalStorage();
        alert(`💾 성공적으로 백업을 불러왔어! 총 ${addedCount}개의 새 일지가 안전하게 추가되었어!`);
        refreshUI();
      } else {
        alert('백업 파일 형식이 이상해! 올바른 JSON 파일이 맞는지 확인해줘 🥺');
      }
    } catch (err) {
      alert('파일을 읽는 중에 오류가 발생했어. 올바른 파일인지 다시 한 번 봐줘! 💥');
    }
  };

  if (e.target.files.length > 0) {
    fileReader.readAsText(e.target.files[0]);
  }
}

// 3. 내 동기화 코드 복사
function copySyncCode() {
  const codeInput = document.getElementById('my-sync-code');
  if (codeInput) {
    codeInput.select();
    codeInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(codeInput.value)
      .then(() => {
        alert('🔑 동기화 코드가 복사되었어! 다른 기기에 입력해봐!');
      })
      .catch(() => {
        alert('클립보드 복사에 실패했어. 수동으로 코드를 복사해줘! 🥺');
      });
  }
}

// 4. 다른 기기 코드로 연결하기
function applyTargetSyncCode() {
  const targetInput = document.getElementById('target-sync-code');
  const codeVal = targetInput ? targetInput.value.trim().toUpperCase() : '';

  if (!codeVal) {
    alert('연결할 12자리 동기화 코드를 정확히 입력해줘! 🥺');
    return;
  }

  if (!/^Y2K-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codeVal)) {
    alert('코드 형식이 올바르지 않아!\n(예시 형식: Y2K-A1B2-C3D4-E5F6)');
    return;
  }

  if (codeVal === state.syncCode) {
    alert('이건 이미 현재 기기의 코드와 같아! 😮');
    return;
  }

  if (confirm(`동기화 코드를 [${codeVal}]로 변경하고 해당 기기의 데이터를 가져올까?\n(현재 기기의 동기화 코드도 이 코드로 바뀝니다.)`)) {
    localStorage.setItem(SYNC_CODE_STORAGE_KEY, codeVal);
    state.syncCode = codeVal;

    const myCodeEl = document.getElementById('my-sync-code');
    if (myCodeEl) {
      myCodeEl.value = codeVal;
    }

    pullFromCloud();
  }
}

// 5. 🔮 텔레파시 동기화 - 데이터 클라우드에 쏘기 (Push)
async function pushToCloud() {
  const pushBtn = document.getElementById('btn-sync-push');
  const originalText = pushBtn.textContent;

  pushBtn.textContent = '🔮 텔레파시 전송 중...';
  pushBtn.disabled = true;

  try {
    const hashedKey = await hashSyncCode(state.syncCode);
    const res = await fetch(`${KVDB_BASE_URL}${hashedKey}`, {
      method: 'POST',
      body: JSON.stringify(state.logs),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      alert(`🔮 텔레파시 전송 성공!\n현재 데이터가 클라우드에 안전하게 보관되었어. 다른 기기에서 [클라우드에서 데이터 가져오기]를 눌러봐!`);
    } else {
      throw new Error('네트워크 응답 오류');
    }
  } catch (err) {
    alert('🔮 텔레파시 전송 실패 ㅠㅠ 인터넷 연결 상태를 확인하고 다시 시도해줘! 💥');
    console.error(err);
  } finally {
    pushBtn.textContent = originalText;
    pushBtn.disabled = false;
  }
}

// 6. 🔮 텔레파시 동기화 - 클라우드에서 가져오기 (Pull)
async function pullFromCloud() {
  const pullBtn = document.getElementById('btn-sync-pull');
  const originalText = pullBtn.textContent;

  pullBtn.textContent = '⚡ 텔레파시 받는 중...';
  pullBtn.disabled = true;

  try {
    const hashedKey = await hashSyncCode(state.syncCode);
    const res = await fetch(`${KVDB_BASE_URL}${hashedKey}`);
    
    if (res.status === 404) {
      alert('클라우드에 저장된 텔레파시 데이터가 아직 없어! 기기에서 먼저 [현재 데이터를 클라우드에 쏘기]를 완료해줘! ☁️');
      return;
    }
    if (!res.ok) {
      throw new Error('데이터 응답 오류');
    }
    
    const cloudLogs = await res.json();
    if (!cloudLogs) return;

      if (Array.isArray(cloudLogs)) {
        const localIds = new Set(state.logs.map(log => log.id));
        const hasUniqueLocal = state.logs.some(log => !log.id.startsWith('ex-') && !new Set(cloudLogs.map(c => c.id)).has(log.id));

        let mergeData = false;
        if (hasUniqueLocal) {
          mergeData = confirm('현재 기기에만 있는 유니크한 판단 일지가 있어!\n\n[확인]: 기존 데이터와 클라우드 데이터를 "합쳐서 병합"하기\n[취소]: 클라우드 데이터로 현재 기기를 "완전히 덮어쓰기"');
        }

        if (mergeData) {
          const cloudIds = new Set(cloudLogs.map(l => l.id));
          let addedCount = 0;

          cloudLogs.forEach(cLog => {
            if (!localIds.has(cLog.id)) {
              state.logs.push(cLog);
              addedCount++;
            }
          });

          state.logs.sort((a, b) => b.id.localeCompare(a.id));
          saveToLocalStorage();
          alert(`⚡ 동기화 완료! 클라우드에서 새 데이터 ${addedCount}건을 합쳤어!`);
        } else {
          state.logs = cloudLogs;
          saveToLocalStorage();
          alert(`⚡ 동기화 완료! 현재 기기 데이터가 클라우드 데이터로 완전히 연동되었어!`);
        }

        refreshUI();

        const syncModal = document.getElementById('sync-modal');
        if (syncModal) {
          syncModal.classList.remove('active');
        }
      } else {
        alert('가져온 텔레파시 데이터 형태가 올바르지 않아! 🥺');
      }
  } catch (err) {
    alert('⚡ 텔레파시 수신 실패 ㅠㅠ 다시 시도해줘! 💥');
    console.error(err);
  } finally {
    pullBtn.textContent = originalText;
    pullBtn.disabled = false;
  }
}
