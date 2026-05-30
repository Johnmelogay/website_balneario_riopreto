/* ============================================
   DESAFIO CAIA — Main Logic
   Firebase Auth + Firestore + Storage
   Geofencing + NSFW + Story Export
   ============================================ */

// ─── Firebase SDK Imports (Modular via CDN) ───
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider, updateProfile }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  query, where, orderBy, limit, getDocs, increment, serverTimestamp, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Firebase Config ───
const firebaseConfig = {
  apiKey: "AIzaSyDQ4D9TkH8sIRynmjbZ7rN-ONjus_nx6kE",
  authDomain: "rio-preto-challange-caia.firebaseapp.com",
  projectId: "rio-preto-challange-caia",
  storageBucket: "rio-preto-challange-caia.firebasestorage.app",
  messagingSenderId: "45962724956",
  appId: "1:45962724956:web:52eefb3c22ec8329d48899",
  measurementId: "G-4P1GZRT06H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ─── Standalone PWA Detection (needed early for auth strategy) ───
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
console.log('[PWA] Standalone mode:', isStandalone);

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[PWA] Service Worker registrado com sucesso:', reg.scope))
      .catch(err => console.error('[PWA] Falha ao registrar Service Worker:', err));
  });
}

// ─── Constants ───
const CHECKIN_LOCATIONS = [
  { name: "CAIA", lat: -8.749146418212684, lng: -63.893858557669994 },
  { name: "CAIA Unidade 2", lat: -8.748246543696995, lng: -63.89409605563328 },
  { name: "Teste em Casa", lat: -8.749110544473732, lng: -63.84497781165 }
];
const GEO_RADIUS_METERS = 150;
const NSFW_THRESHOLD = 0.30;
const MAX_REPORTS = 3;

// Employee UIDs to exclude from leaderboard (add Firebase UIDs here)
const employeeUIDs = [];

// ─── DOM Elements ───
const $ = (s) => document.querySelector(s);
const loginScreen = $('#login-screen');
const appScreen = $('#app-screen');
const btnLogin = $('#btn-google-login');
const btnLogout = $('#btn-logout');
const btnCheckin = $('#btn-checkin');
const cameraInput = $('#cameraInput');
const previewModal = $('#preview-modal');
const previewImg = $('#preview-img');
const btnConfirmUpload = $('#btn-confirm-upload');
const btnCancelUpload = $('#btn-cancel-upload');
const loadingOverlay = $('#loading-overlay');
const loadingText = $('#loading-text');
const toastContainer = $('#toast-container');
const feedContainer = $('#feed-container');
const leaderboardContainer = $('#leaderboard-container');
const userAvatar = $('#user-avatar');
const userName = $('#user-name');
const userStreakDisplay = $('#user-streak');
const statStreak = $('#stat-streak');
const statCheckins = $('#stat-checkins');
const statRank = $('#stat-rank');
const btnShareStory = $('#btn-share-story');
const btnEditName = $('#btn-edit-name');
const optionTreino = $('#option-treino');
const optionLazer = $('#option-lazer');
const btnFeedback = $('#btn-feedback');
const btnOpenRules = $('#btn-open-rules');
const btnCloseRules = $('#btn-close-rules');
const rulesModal = $('#rules-modal');
const btnInstallLanding = $('#btn-install-pwa-landing');
const btnInstallApp = $('#btn-install-pwa-app');
const pwaInstallModal = $('#pwa-install-modal');
const popupBlockedModal = $('#popup-blocked-modal');
const btnClosePopupBlocked = $('#btn-close-popup-blocked');
const btnClosePopupBlockedX = $('#btn-close-popup-blocked-x');

// Story prompt modal elements
const storyPromptModal = $('#story-prompt-modal');
const btnCloseStoryPromptX = $('#btn-close-story-prompt-x');
const btnStoryPromptShare = $('#btn-story-prompt-share');
const btnStoryPromptLater = $('#btn-story-prompt-later');
const storyPromptEmoji = $('#story-prompt-emoji');
const storyPromptTitle = $('#story-prompt-title');
const storyPromptSubtitle = $('#story-prompt-subtitle');
const storyPromptStreakCount = $('#story-prompt-streak-count');
const storyPromptUserName = $('#story-prompt-user-name');

// Onboarding elements
const onboardingScreen = $('#onboarding-screen');
const onboardingForm = $('#onboarding-form');
const inputWhatsapp = $('#input-whatsapp');
const inputInstagram = $('#input-instagram');
const btnSaveOnboarding = $('#btn-save-onboarding');

// Tab elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// ─── State ───
let currentUser = null;
let currentUserData = null;
let selectedFile = null;
let nsfwModel = null;
let currentCheckinType = 'treino';

// ═══════════════════════════════════════════════
// 1. AUTH FLOW (Popup-Only — iOS Safari Compatible)
// ═══════════════════════════════════════════════
// signInWithRedirect is broken on iOS Safari due to ITP (Intelligent Tracking
// Prevention) blocking cross-origin storage when authDomain differs from the
// app domain. We use popup-only auth and show instructions if blocked.

// Helper: show the popup-blocked instructions modal
function showPopupBlockedModal() {
  if (popupBlockedModal) {
    popupBlockedModal.style.display = '';
    requestAnimationFrame(() => popupBlockedModal.classList.add('active'));
  }
}
function hidePopupBlockedModal() {
  if (popupBlockedModal) {
    popupBlockedModal.classList.remove('active');
    setTimeout(() => { popupBlockedModal.style.display = 'none'; }, 300);
  }
}

// Close popup-blocked modal handlers
if (btnClosePopupBlocked) btnClosePopupBlocked.addEventListener('click', hidePopupBlockedModal);
if (btnClosePopupBlockedX) btnClosePopupBlockedX.addEventListener('click', hidePopupBlockedModal);

// ━━━ LOGIN BUTTON ━━━
// CRITICAL: signInWithPopup MUST be the very first call inside the click handler
// (synchronous context) to satisfy Safari's strict user-gesture popup policy.
// Any async work (showLoading, DOM changes) BEFORE the popup call will cause
// Safari to block the popup window.
btnLogin.addEventListener('click', () => {
  console.log('[Auth] Login button clicked — opening popup immediately');
  signInWithPopup(auth, googleProvider)
    .then(() => {
      console.log('[Auth] Popup login successful');
      // onAuthStateChanged handles the rest
    })
    .catch((err) => {
      hideLoading();
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User cancelled — do nothing
        console.log('[Auth] User cancelled popup');
        return;
      }
      if (err.code === 'auth/popup-blocked') {
        console.warn('[Auth] Popup blocked by browser — showing instructions');
        showPopupBlockedModal();
        return;
      }
      // For in-app browsers (Instagram, Facebook, etc.)
      if (err.message && (err.message.includes('popup') || err.message.includes('cross-origin'))) {
        console.warn('[Auth] Popup error (likely in-app browser):', err.message);
        alert('⚠️ Este navegador não suporta login seguro.\n\nPor favor, abra no Safari ou Chrome:\n• No Instagram/Facebook: toque nos 3 pontinhos (⋯) e escolha "Abrir no navegador".');
        return;
      }
      console.error('[Auth] Unexpected login error:', err);
      showToast('Erro ao fazer login. Tente novamente.', 'error');
    });
});

btnLogout.addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  const isAdmin = user && user.email === 'johnmelocontato@gmail.com';
  const adminTab = document.getElementById('nav-tab-admin');
  
  if (adminTab) {
    adminTab.style.display = isAdmin ? 'block' : 'none';
  }

  loadChallenges();
  loadAnnouncement();

  if (user) {
    currentUser = user;
    await ensureUserDoc(user); // creates doc if it doesn't exist
    await loadUserData(); // populates currentUserData

    if (isAdmin) {
      loadModerationFeed();
    }

    if (!currentUserData.onboardingCompleted) {
      // Show onboarding screen
      hideLoading();
      loginScreen.classList.add('hidden');
      appScreen.classList.add('hidden');
      onboardingScreen.classList.remove('hidden');
    } else {
      // Standard flow
      hideLoading();
      loginScreen.classList.add('hidden');
      onboardingScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      updateUserUI(user);
      loadFeed();
      loadLeaderboard();
      if (typeof autoShowPwaPrompt === 'function') autoShowPwaPrompt();
    }
  } else {
    hideLoading();
    currentUser = null;
    currentUserData = null;
    loginScreen.classList.remove('hidden');
    onboardingScreen.classList.add('hidden');
    appScreen.classList.add('hidden');
    loadFeed();
  }
});

// ═══════════════════════════════════════════════
// 1.5. ONBOARDING
// ═══════════════════════════════════════════════

btnSaveOnboarding.addEventListener('click', async () => {
  if (!inputWhatsapp.value || inputWhatsapp.value.trim().length < 8) {
    showToast('Por favor, informe um WhatsApp válido.', 'warning');
    return;
  }
  
  showLoading('Salvando...');
  
  const whatsapp = inputWhatsapp.value.trim();
  let instagram = inputInstagram.value.trim();
  if (instagram && instagram.startsWith('@')) {
    instagram = instagram.substring(1);
  }

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      whatsapp: whatsapp,
      instagram: instagram,
      onboardingCompleted: true
    });
    
    // Refresh local state and enter app
    await loadUserData();
    hideLoading();
    onboardingScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    updateUserUI(currentUser);
    loadFeed();
    loadLeaderboard();
    showToast('Cadastro concluído! Bem-vindo ao Desafio.', 'success');
    if (typeof autoShowPwaPrompt === 'function') autoShowPwaPrompt();
  } catch (err) {
    hideLoading();
    showToast('Erro ao salvar dados.', 'error');
    console.error('[Onboarding] Error:', err);
  }
});

function updateUserUI(user) {
  userAvatar.src = user.photoURL || 'images/logo_opt.webp';
  userName.textContent = currentUserData?.displayName || user.displayName || 'Visitante';
}

async function ensureUserDoc(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      displayName: user.displayName || 'Visitante',
      photoURL: user.photoURL || '',
      email: user.email || '',
      streakCount: 0,
      recoverPoints: 0,
      totalCheckins: 0,
      lastCheckinDate: null,
      createdAt: serverTimestamp()
    });
  }
}

async function loadUserData() {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    currentUserData = snap.data();
    statStreak.textContent = currentUserData.streakCount || 0;
    statCheckins.textContent = currentUserData.recoverPoints || 0;
    userStreakDisplay.innerHTML = `🔥 <span>${currentUserData.streakCount || 0}</span> dias`;

    // Calculate rank
    await updateRank();
  }
}

async function updateRank() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!employeeUIDs.includes(d.id) && (data.streakCount || 0) > 0) {
        const streak = data.streakCount || 0;
        const recover = data.recoverPoints || 0;
        const xp = (streak * 100) + (recover * 10);
        list.push({ id: d.id, xp });
      }
    });

    list.sort((a, b) => b.xp - a.xp);

    const myIndex = list.findIndex(u => u.id === currentUser.uid);
    if (myIndex !== -1 && !employeeUIDs.includes(currentUser.uid)) {
      statRank.textContent = `#${myIndex + 1}`;
    } else {
      statRank.textContent = '—';
    }
  } catch (err) {
    console.error('updateRank error:', err);
    statRank.textContent = '—';
  }
}

// ═══════════════════════════════════════════════
// 2. TABS
// ═══════════════════════════════════════════════

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    navTabs.forEach(t => t.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');

    if (target === 'admin') {
      loadModerationFeed();
    }
  });
});

// ═══════════════════════════════════════════════
// 3. GEOFENCING (Haversine)
// ═══════════════════════════════════════════════

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        let nearestDist = Infinity;
        let isWithinAny = false;
        
        for (const loc of CHECKIN_LOCATIONS) {
          const dist = haversineDistance(
            pos.coords.latitude, pos.coords.longitude,
            loc.lat, loc.lng
          );
          if (dist < nearestDist) {
            nearestDist = dist;
          }
          if (dist <= GEO_RADIUS_METERS) {
            isWithinAny = true;
          }
        }
        
        if (isWithinAny) {
          resolve(true);
        } else {
          reject(new Error(`Você está a ${Math.round(nearestDist)}m do box mais próximo. Aproxime-se para fazer check-in! (máx. ${GEO_RADIUS_METERS}m)`));
        }
      },
      (err) => {
        let msg = 'Erro de geolocalização.';
        if (err.code === 1) msg = 'Permissão de localização negada. Ative nas configurações do celular.';
        if (err.code === 2) msg = 'Localização indisponível. Verifique seu GPS.';
        if (err.code === 3) msg = 'Tempo esgotado ao buscar localização.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ═══════════════════════════════════════════════
// 4. CHECK-IN FLOW
// ═══════════════════════════════════════════════

// --- Check-in Type Selector events ---
optionTreino.addEventListener('click', () => {
  optionTreino.classList.add('active');
  optionLazer.classList.remove('active');
  const inp = optionTreino.querySelector('input');
  if (inp) inp.checked = true;
  currentCheckinType = 'treino';
});

optionLazer.addEventListener('click', () => {
  optionLazer.classList.add('active');
  optionTreino.classList.remove('active');
  const inp = optionLazer.querySelector('input');
  if (inp) inp.checked = true;
  currentCheckinType = 'lazer';
});

function resetCheckinTypeSelection() {
  currentCheckinType = 'treino';
  optionTreino.classList.add('active');
  optionLazer.classList.remove('active');
  const inp = optionTreino.querySelector('input');
  if (inp) inp.checked = true;
}

// --- Edit Display Name ---
btnEditName.addEventListener('click', async () => {
  const currentName = currentUserData?.displayName || currentUser.displayName || '';
  const newName = prompt('Como você quer ser chamado(a) no desafio?', currentName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    showToast('O nome não pode ficar em branco.', 'warning');
    return;
  }
  showLoading('Salvando novo nome...');
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { displayName: trimmed });
    await updateProfile(currentUser, { displayName: trimmed });
    
    await loadUserData();
    updateUserUI(currentUser);
    loadFeed();
    loadLeaderboard();
    
    hideLoading();
    showToast('Nome atualizado com sucesso!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao atualizar nome.', 'error');
    console.error('[EditName] Error:', err);
  }
});

// ─── Helper: open / close modal overlays ───
function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'flex';
  requestAnimationFrame(() => modalEl.classList.add('active'));
}
function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('active');
  setTimeout(() => { modalEl.style.display = 'none'; }, 300);
}

// Backdrop-click closes any overlay
[rulesModal, pwaInstallModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

// --- Rules Modal triggers ---
if (btnOpenRules && rulesModal) {
  btnOpenRules.addEventListener('click', () => openModal(rulesModal));
}
const closeRulesActions = [
  document.getElementById('btn-close-rules'),
  document.getElementById('btn-close-rules-x')
];
closeRulesActions.forEach(btn => {
  if (btn && rulesModal) btn.addEventListener('click', () => closeModal(rulesModal));
});

// --- PWA Installation Flow ---
let deferredPrompt = null;
// isStandalone is already defined at the top of the file for early auth use

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showPwaInstallButtons();
});

window.addEventListener('appinstalled', () => {
  hidePwaInstallButtons();
  deferredPrompt = null;
});

function showPwaInstallButtons() {
  if (btnInstallLanding) btnInstallLanding.style.display = 'inline-flex';
  if (btnInstallApp) btnInstallApp.style.display = 'flex';
}

function hidePwaInstallButtons() {
  if (btnInstallLanding) btnInstallLanding.style.display = 'none';
  if (btnInstallApp) btnInstallApp.style.display = 'none';
}

// Check on load if not standalone, enable buttons (even without prompt, so they can access the guide modal)
if (!isStandalone) {
  showPwaInstallButtons();
}

const handleInstallClick = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
      hidePwaInstallButtons();
    }
  } else {
    // Show our custom guide modal
    if (pwaInstallModal) {
      openModal(pwaInstallModal);
      detectAndSelectPwaPlatform();
    }
  }
};

if (btnInstallLanding) btnInstallLanding.addEventListener('click', handleInstallClick);
if (btnInstallApp) btnInstallApp.addEventListener('click', handleInstallClick);

function detectAndSelectPwaPlatform() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    selectPwaPlatform('ios');
  } else {
    selectPwaPlatform('android');
  }
}

function selectPwaPlatform(platform) {
  const tabIos = document.getElementById('tab-pwa-ios');
  const tabAndroid = document.getElementById('tab-pwa-android');
  const panelIos = document.getElementById('pwa-steps-ios');
  const panelAndroid = document.getElementById('pwa-steps-android');

  if (!tabIos || !tabAndroid || !panelIos || !panelAndroid) return;

  if (platform === 'ios') {
    tabIos.classList.add('active');
    tabAndroid.classList.remove('active');
    panelIos.style.display = 'block';
    panelAndroid.style.display = 'none';
  } else {
    tabAndroid.classList.add('active');
    tabIos.classList.remove('active');
    panelAndroid.style.display = 'block';
    panelIos.style.display = 'none';
  }
}

// Platform tab click handlers inside modal
const tabIos = document.getElementById('tab-pwa-ios');
const tabAndroid = document.getElementById('tab-pwa-android');
if (tabIos) tabIos.addEventListener('click', () => selectPwaPlatform('ios'));
if (tabAndroid) tabAndroid.addEventListener('click', () => selectPwaPlatform('android'));

// Close handler
const closePwaActions = [
  document.getElementById('btn-close-pwa'),
  document.getElementById('btn-close-pwa-x')
];
closePwaActions.forEach(btn => {
  if (btn && pwaInstallModal) {
    btn.addEventListener('click', () => closeModal(pwaInstallModal));
  }
});

// Auto-show PWA prompt strategically
function autoShowPwaPrompt() {
  if (isStandalone) return;
  if (sessionStorage.getItem('pwa_prompt_shown') === 'true') return;
  
  setTimeout(() => {
    if (pwaInstallModal) {
      openModal(pwaInstallModal);
      detectAndSelectPwaPlatform();
      sessionStorage.setItem('pwa_prompt_shown', 'true');
    }
  }, 1500);
}

// ═══════════════════════════════════════════════
// STORY SHARE PROMPT MODAL
// ═══════════════════════════════════════════════

/**
 * Opens the story share prompt modal.
 * @param {'first'|'milestone'|'daily'} reason - Why the prompt is showing.
 * @param {number} streak - Current streak count.
 */
async function showStoryPrompt(reason, streak) {
  if (!storyPromptModal) return;

  // Populate dynamic content
  const name = currentUserData?.displayName || currentUser?.displayName || '';
  if (storyPromptUserName) storyPromptUserName.textContent = name;
  if (storyPromptStreakCount) {
    storyPromptStreakCount.textContent = streak;
    const streakBadge = $('#story-prompt-streak-badge');
    if (streakBadge) {
      streakBadge.innerHTML = streak === 1
        ? `🔥 <span id="story-prompt-streak-count">${streak}</span> dia seguido`
        : `🔥 <span id="story-prompt-streak-count">${streak}</span> dias seguidos`;
    }
  }

  // Set messaging based on reason
  if (reason === 'first') {
    if (storyPromptEmoji) storyPromptEmoji.textContent = '🎉';
    if (storyPromptTitle) storyPromptTitle.textContent = 'Seu primeiro check-in!';
    if (storyPromptSubtitle) storyPromptSubtitle.textContent =
      'Compartilhe seu card personalizado nos Stories e o Balneário Rio Preto pode te repostar! Não esqueça de nos seguir.';
  } else if (reason === 'milestone') {
    const milestoneEmoji = streak >= 21 ? '🏆' : streak >= 14 ? '💎' : '🔥';
    if (storyPromptEmoji) storyPromptEmoji.textContent = milestoneEmoji;
    if (storyPromptTitle) storyPromptTitle.textContent = `${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}!`;
    if (storyPromptSubtitle) storyPromptSubtitle.textContent =
      'Você está arrasando! Compartilhe esse marco nos Stories — o Balneário Rio Preto adoraria te repostar!';
  } else if (reason === 'daily') {
    if (storyPromptEmoji) storyPromptEmoji.textContent = '⚡';
    if (storyPromptTitle) storyPromptTitle.textContent = `${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}!`;
    if (storyPromptSubtitle) storyPromptSubtitle.textContent =
      'Mais um dia garantido! Compartilhe seu card personalizado nos Stories e marque @balneario_riopreto para ser repostado.';
  }

  // Populate the mini polaroid preview stack
  const stackContainer = $('#story-prompt-preview-stack');
  if (stackContainer) {
    stackContainer.innerHTML = ''; // Clear previous preview
    try {
      const q = query(
        collection(db, 'checkins'),
        where('userId', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        // Sort descending in memory (latest checkins first)
        const docs = snap.docs.sort((a, b) => {
          const tA = a.data().timestamp?.toMillis?.() || 0;
          const tB = b.data().timestamp?.toMillis?.() || 0;
          return tB - tA;
        });

        // Limit to top 3 check-ins
        const recentDocs = docs.slice(0, 3);

        // Render from bottom to top (index 2, 1, then 0)
        // so that the most recent (index 0) naturally overlaps others.
        for (let i = recentDocs.length - 1; i >= 0; i--) {
          const d = recentDocs[i].data();
          const photoUrl = d.photoUrl;
          const type = d.type || 'treino';
          const typeEmoji = type === 'lazer' ? '🌊' : '🏋️';

          const polaroidDiv = document.createElement('div');
          polaroidDiv.className = `preview-polaroid preview-polaroid-${i}`;
          polaroidDiv.innerHTML = `
            <div class="preview-polaroid-photo" style="background-image: url('${photoUrl}')">
              <span class="preview-polaroid-badge ${type === 'lazer' ? 'badge-lazer' : 'badge-treino'}">${typeEmoji}</span>
            </div>
          `;
          stackContainer.appendChild(polaroidDiv);
        }
      } else {
        // Fallback: If no checkins returned, show logo
        const logoUrl = 'images/logo_opt.webp';
        const polaroidDiv = document.createElement('div');
        polaroidDiv.className = 'preview-polaroid preview-polaroid-0';
        polaroidDiv.innerHTML = `
          <div class="preview-polaroid-photo" style="background-image: url('${logoUrl}'); background-size: contain; background-repeat: no-repeat;">
            <span class="preview-polaroid-badge badge-treino">🏋️</span>
          </div>
        `;
        stackContainer.appendChild(polaroidDiv);
      }
    } catch (err) {
      console.warn('[Preview] Failed to generate preview polaroid stack:', err);
    }
  }

  openModal(storyPromptModal);
}

function closeStoryPrompt() {
  closeModal(storyPromptModal);
}

// Story prompt close handlers
if (btnCloseStoryPromptX) btnCloseStoryPromptX.addEventListener('click', closeStoryPrompt);
if (btnStoryPromptLater) btnStoryPromptLater.addEventListener('click', closeStoryPrompt);
if (storyPromptModal) {
  storyPromptModal.addEventListener('click', (e) => {
    if (e.target === storyPromptModal) closeStoryPrompt();
  });
}

// Story prompt share button — closes modal then triggers the story generator
if (btnStoryPromptShare) {
  btnStoryPromptShare.addEventListener('click', () => {
    closeStoryPrompt();
    // Small delay so modal close animation finishes before story generation starts
    setTimeout(() => {
      if (btnShareStory) btnShareStory.click();
    }, 350);
  });
}

// --- Feedback / Whatsapp integration ---
btnFeedback.addEventListener('click', () => {
  const currentName = currentUserData?.displayName || currentUser?.displayName || 'Participante';
  const message = prompt('Digite sua sugestão, feedback ou relato de bug:');
  if (message === null) return;
  const trimmed = message.trim();
  if (!trimmed) {
    showToast('A mensagem não pode ser vazia.', 'warning');
    return;
  }
  
  const formattedText = `Olá Balneário Rio Preto, meu nome é ${currentName}. Gostaria de enviar o seguinte feedback/report sobre o Pós Treino:\n\n"${trimmed}"`;
  const whatsappUrl = `https://wa.me/5569993129559?text=${encodeURIComponent(formattedText)}`;
  window.open(whatsappUrl, '_blank');
});

btnCheckin.addEventListener('click', () => {
  if (!currentUser) return;

  // Open camera input synchronously to bypass iOS WebKit user-gesture restrictions
  cameraInput.click();
});

cameraInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show preview
  selectedFile = file;
  resetCheckinTypeSelection();
  const reader = new FileReader();
  reader.onload = (ev) => {
    previewImg.src = ev.target.result;
    previewModal.classList.add('active');
  };
  reader.readAsDataURL(file);
  cameraInput.value = '';
});

btnCancelUpload.addEventListener('click', () => {
  previewModal.classList.remove('active');
  selectedFile = null;
  previewImg.src = '';
  resetCheckinTypeSelection();
});

btnConfirmUpload.addEventListener('click', async () => {
  previewModal.classList.remove('active');
  if (!selectedFile) return;

  // 1. Geofence check
  showLoading('Verificando localização...');
  try {
    await checkGeolocation();
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    selectedFile = null;
    return;
  }

  // 2. Check if already checked in today
  setLoadingText('Verificando check-in diário...');
  try {
    const alreadyChecked = await hasCheckedInToday();
    if (alreadyChecked) {
      hideLoading();
      showToast('Você já fez check-in hoje! Volte amanhã 🌟', 'warning');
      selectedFile = null;
      return;
    }
  } catch (err) {
    hideLoading();
    showToast('Erro ao validar check-in diário.', 'error');
    selectedFile = null;
    return;
  }

  // 3. NSFW Check
  setLoadingText('Analisando imagem...');
  try {
    const isClean = await checkNSFW(previewImg);
    if (!isClean) {
      hideLoading();
      showToast('⚠️ Imagem bloqueada: conteúdo impróprio detectado.', 'error');
      selectedFile = null;
      return;
    }
  } catch (err) {
    console.warn('NSFW check failed, allowing upload:', err);
    // If NSFW model fails to load, allow the upload (graceful degradation)
  }

  // 4. Compress & Convert to Base64 WebP
  setLoadingText('Enviando foto...');
  try {
    const photoUrl = await uploadPhoto(selectedFile);

    // 5. Save check-in + update streak
    setLoadingText('Registrando check-in...');
    const savedType = currentCheckinType;
    await saveCheckin(photoUrl, savedType);
    await updateStreak();
    await loadUserData();

    hideLoading();
    showToast('Check-in registrado com sucesso! 🎉', 'success');

    // Story share prompt — fire after toast so user sees success first
    const totalCheckins = currentUserData?.totalCheckins || 0;
    const currentStreak = currentUserData?.streakCount || 0;
    const MILESTONE_STREAKS = [7, 14, 21, 30, 60, 90];

    setTimeout(() => {
      if (totalCheckins === 1) {
        // Very first check-in ever — strongest moment to encourage sharing
        showStoryPrompt('first', currentStreak);
      } else if (MILESTONE_STREAKS.includes(currentStreak)) {
        // Streak milestone — another high-emotion moment
        showStoryPrompt('milestone', currentStreak);
      } else {
        // Every other check-in shows the modal too
        showStoryPrompt('daily', currentStreak);
      }
    }, 1200);

    // Refresh feed & leaderboard
    loadFeed();
    loadLeaderboard();
  } catch (err) {
    hideLoading();
    showToast('Erro ao salvar check-in. Tente novamente.', 'error');
    console.error('Checkin error:', err);
  }

  selectedFile = null;
  resetCheckinTypeSelection();
});

// ═══════════════════════════════════════════════
// 5. NSFW VALIDATION
// ═══════════════════════════════════════════════

async function loadNSFWModel() {
  if (nsfwModel) return nsfwModel;
  try {
    nsfwModel = await nsfwjs.load();
    return nsfwModel;
  } catch (err) {
    console.error('Failed to load NSFW model:', err);
    throw err;
  }
}

async function checkNSFW(imgElement) {
  const model = await loadNSFWModel();
  const predictions = await model.classify(imgElement);

  const nsfwLabels = ['Porn', 'Hentai', 'Sexy'];
  let nsfwScore = 0;
  predictions.forEach(p => {
    if (nsfwLabels.includes(p.className)) nsfwScore += p.probability;
  });

  return nsfwScore < NSFW_THRESHOLD;
}

// ═══════════════════════════════════════════════
// 6. CLIENT-SIDE WEB COMPRESSION (No storage needed, saved as Base64 WebP in Firestore)
// ═══════════════════════════════════════════════

async function uploadPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; // Super lightweight 400px width/height
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP with 0.5 quality (extreme compression ~5KB - 15KB)
        const dataUrl = canvas.toDataURL('image/webp', 0.5);
        resolve(dataUrl);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// ═══════════════════════════════════════════════
// 7. FIRESTORE — CHECK-IN & STREAK
// ═══════════════════════════════════════════════

function getTodayDateStr() {
  // Use local timezone (Manaus UTC-4)
  const now = new Date();
  const offset = -4 * 60; // UTC-4
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  return local.toISOString().split('T')[0];
}

function getYesterdayDateStr() {
  const now = new Date();
  const offset = -4 * 60;
  const local = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  local.setDate(local.getDate() - 1);
  return local.toISOString().split('T')[0];
}

async function hasCheckedInToday() {
  const today = getTodayDateStr();
  const q = query(
    collection(db, 'checkins'),
    where('userId', '==', currentUser.uid),
    where('dateStr', '==', today),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

async function saveCheckin(photoUrl, type = 'treino') {
  await addDoc(collection(db, 'checkins'), {
    userId: currentUser.uid,
    userName: currentUserData?.displayName || currentUser.displayName || 'Visitante',
    userPhoto: currentUser.photoURL || '',
    photoUrl: photoUrl,
    dateStr: getTodayDateStr(),
    timestamp: serverTimestamp(),
    reportsCount: 0,
    type: type
  });

  if (type === 'lazer') {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      recoverPoints: increment(1)
    });
  }
}

async function updateStreak() {
  const userRef = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const lastDate = data.lastCheckinDate || null;
  const today = getTodayDateStr();
  const yesterday = getYesterdayDateStr();

  let newStreak;
  if (lastDate === yesterday) {
    // Consecutive day — increment streak
    newStreak = (data.streakCount || 0) + 1;
  } else if (lastDate === today) {
    // Already counted today (shouldn't reach here due to guard, but safety)
    return;
  } else {
    // Streak broken — reset to 1
    newStreak = 1;
  }

  await updateDoc(userRef, {
    streakCount: newStreak,
    totalCheckins: increment(1),
    lastCheckinDate: today
  });
}

// ═══════════════════════════════════════════════
// 8. MURAL / FEED
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// 8. MURAL / FEED
// ═══════════════════════════════════════════════

const MOCK_CHECKINS = [
  {
    id: 'mock1',
    userName: 'Carlos Silva',
    photoUrl: 'images/IMG_0829.webp',
    type: 'treino',
    timestamp: { toDate: () => new Date(Date.now() - 3600000 * 2) },
    userStreak: 12,
    userRank: 1
  },
  {
    id: 'mock2',
    userName: 'Mariana Costa',
    photoUrl: 'images/peopleplaying_thumbnail.webp',
    type: 'lazer',
    timestamp: { toDate: () => new Date(Date.now() - 3600000 * 5) },
    userStreak: 8,
    userRank: 3
  },
  {
    id: 'mock3',
    userName: 'Felipe Santos',
    photoUrl: 'images/IMG_0906.webp',
    type: 'treino',
    timestamp: { toDate: () => new Date(Date.now() - 3600000 * 12) },
    userStreak: 5,
    userRank: 7
  },
  {
    id: 'mock4',
    userName: 'Aline Souza',
    photoUrl: 'images/piscina.webp',
    type: 'lazer',
    timestamp: { toDate: () => new Date(Date.now() - 3600000 * 18) },
    userStreak: 15,
    userRank: 2
  }
];

async function loadFeed() {
  const landingPreview = document.getElementById('landing-mural-preview');
  
  const renderFallbackPreview = () => {
    if (landingPreview) {
      landingPreview.innerHTML = MOCK_CHECKINS.map(post => renderFeedCard(post)).join('');
    }
  };

  const q = query(
    collection(db, 'checkins'),
    orderBy('timestamp', 'desc'),
    limit(30)
  );

  try {
    const snap = await getDocs(q);
    const posts = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.reportsCount < MAX_REPORTS) {
        posts.push({ id: d.id, ...data });
      }
    });

    if (posts.length === 0) {
      feedContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-camera-retro"></i>
          <p>Nenhum check-in ainda. Seja o primeiro! 📸</p>
        </div>`;
      renderFallbackPreview();
      return;
    }

    feedContainer.innerHTML = posts.map(post => renderFeedCard(post)).join('');
    
    if (landingPreview) {
      landingPreview.innerHTML = posts.slice(0, 10).map(post => renderFeedCard(post)).join('');
    }
  } catch (err) {
    console.error('Feed error:', err);
    feedContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Erro ao carregar o mural.</p>
      </div>`;
    renderFallbackPreview();
  }
}

function renderFeedCard(post) {
  const ts = post.timestamp?.toDate?.() || new Date();
  const timeAgo = formatTimeAgo(ts);
  const isMine = currentUser && String(post.userId).trim() === String(currentUser.uid).trim();
  
  let streak = post.userStreak || 0;
  let rank = post.userRank || null;

  if (post.userId && window.usersCache && window.usersCache[post.userId]) {
    streak = window.usersCache[post.userId].streak;
    rank = window.usersCache[post.userId].rank;
  }

  const actionButton = isMine
    ? `<button class="btn-feed-action delete" onclick="deletePost('${post.id}')" title="Excluir">
         <i class="fa-solid fa-trash-can"></i>
       </button>`
    : `<button class="btn-feed-action report" onclick="reportPost('${post.id}')" title="Denunciar">
         <i class="fa-solid fa-flag"></i>
       </button>`;

  const type = post.type || 'treino';
  const typeBadge = type === 'lazer' 
    ? `<span class="badge-type lazer">🍹 Lazer</span>`
    : `<span class="badge-type treino">🏋️ Treino</span>`;

  const streakBadgeHtml = streak > 0 
    ? `<span class="badge-streak"><i class="fa-solid fa-fire"></i> ${streak}</span>`
    : '';

  let rankBadgeHtml = '';
  if (rank) {
    let rankLabelClass = '';
    if (rank === 1) rankLabelClass = 'rank-1';
    else if (rank === 2) rankLabelClass = 'rank-2';
    else if (rank === 3) rankLabelClass = 'rank-3';
    
    rankBadgeHtml = `<span class="badge-rank ${rankLabelClass}"><i class="fa-solid fa-trophy"></i> #${rank}</span>`;
  }

  return `
    <div class="feed-card">
      ${actionButton}
      ${typeBadge}
      <div class="feed-card-badges-right">
        ${streakBadgeHtml}
        ${rankBadgeHtml}
      </div>
      <img class="feed-card-img" src="${escapeHtml(post.photoUrl)}" alt="Check-in" loading="lazy" />
      <div class="feed-card-body">
        <div class="feed-card-name">${escapeHtml(post.userName)}</div>
        <div class="feed-card-meta">${timeAgo}</div>
      </div>
    </div>`;
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'ontem';
  return `${diffD} dias atrás`;
}

// Report function (global scope for onclick)
window.reportPost = async function(postId) {
  if (!currentUser) return;

  const reportKey = `reported_${postId}`;
  if (localStorage.getItem(reportKey)) {
    showToast('Você já denunciou esta publicação.', 'warning');
    return;
  }

  try {
    const postRef = doc(db, 'checkins', postId);
    await updateDoc(postRef, { reportsCount: increment(1) });
    localStorage.setItem(reportKey, '1');
    showToast('Denúncia registrada. Obrigado!', 'success');
    loadFeed();
  } catch (err) {
    showToast('Erro ao denunciar.', 'error');
    console.error('Report error:', err);
  }
};

// Delete function (global scope for onclick)
window.deletePost = async function(postId) {
  if (!currentUser) return;
  if (!confirm('Tem certeza que deseja apagar sua foto do check-in?')) return;

  try {
    const postRef = doc(db, 'checkins', postId);
    await deleteDoc(postRef);
    showToast('Publicação apagada com sucesso!', 'success');
    loadFeed();
  } catch (err) {
    showToast('Erro ao apagar a publicação.', 'error');
    console.error('Delete error:', err);
  }
};

// ═══════════════════════════════════════════════
// 9. LEADERBOARD
// ═══════════════════════════════════════════════

async function loadLeaderboard() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    let users = [];
    snap.forEach(d => {
      const data = d.data();
      if (!employeeUIDs.includes(d.id) && (data.streakCount || 0) > 0) {
        const streak = data.streakCount || 0;
        const recover = data.recoverPoints || 0;
        const xp = (streak * 100) + (recover * 10);
        users.push({ id: d.id, xp, ...data });
      }
    });

    if (users.length === 0) {
      leaderboardContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-trophy"></i>
          <p>Nenhum ranking ainda. Faça check-in para aparecer!</p>
        </div>`;
      return;
    }

    // Sort by XP descending to get global rankings
    users.sort((a, b) => b.xp - a.xp);

    // Assign global ranks (1-indexed)
    users.forEach((u, i) => {
      u.globalRank = i + 1;
    });

    // Determine final list to show
    let listToShow = [];
    const myIndex = users.findIndex(u => u.id === (currentUser ? currentUser.uid : null));

    if (myIndex !== -1) {
      const myGlobalRank = users[myIndex].globalRank;
      // Sort by proximity to my rank
      const proximityList = [...users].sort((a, b) => {
        return Math.abs(a.globalRank - myGlobalRank) - Math.abs(b.globalRank - myGlobalRank);
      });
      listToShow = proximityList.slice(0, 20);
    } else {
      // Fallback: standard top 20
      listToShow = users.slice(0, 20);
    }

    leaderboardContainer.innerHTML = listToShow.map(u => renderLeaderboardItem(u)).join('');
  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

function renderLeaderboardItem(user) {
  const rank = user.globalRank;
  let rankClass = 'normal';
  if (rank === 1) rankClass = 'gold';
  else if (rank === 2) rankClass = 'silver';
  else if (rank === 3) rankClass = 'bronze';

  const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const isMe = currentUser && user.id === currentUser.uid;
  const firstName = (user.displayName || 'Visitante').split(' ')[0];

  return `
    <div class="leaderboard-item glass-card" style="${isMe ? 'border-color: rgba(46,125,50,0.4); background: rgba(46,125,50,0.08);' : ''}">
      <div class="leaderboard-rank ${rankClass}">${medal}</div>
      <img class="leaderboard-avatar" src="${escapeHtml(user.photoURL || 'images/logo_opt.webp')}" alt="" />
      <div class="leaderboard-name">${escapeHtml(firstName)}${isMe ? ' (você)' : ''}</div>
      <div class="leaderboard-streak">🔥 ${user.streakCount || 0} foguinhos</div>
    </div>`;
}

// ═══════════════════════════════════════════════
// 10. STORY EXPORT (html2canvas + Web Share)
// ═══════════════════════════════════════════════

btnShareStory.addEventListener('click', async () => {
  if (!currentUser || !currentUserData) {
    showToast('Faça check-in primeiro para compartilhar.', 'warning');
    return;
  }

  showLoading('Gerando seu card...');

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // --- Helper: load image ---
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      if (!src) { resolve(null); return; }
      const img = new Image();
      // Only set crossOrigin for external URLs, setting it on data: URIs breaks Safari
      if (!src.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => { 
        console.warn('[Story] Failed to load image:', src.substring(0, 30) + '...', err); 
        resolve(null); 
      };
      img.src = src;
    });
  }

  // --- Helper: draw image with "cover" behaviour ---
  function drawCover(img, x, y, w, h, alignTop = false) {
    if (!img) return;
    const iR = img.width / img.height;
    const bR = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (iR > bR) { 
      sw = img.height * bR; 
      sx = (img.width - sw) / 2; 
    } else { 
      sh = img.width / bR; 
      sy = alignTop ? 0 : (img.height - sh) / 2; 
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // --- Helper: draw image with "contain" behaviour ---
  function drawContain(img, x, y, w, h) {
    if (!img) return;
    const iR = img.width / img.height;
    const bR = w / h;
    let dw, dh, dx, dy;
    if (iR > bR) { dw = w; dh = w / iR; dx = x; dy = y + (h - dh) / 2; }
    else { dh = h; dw = h * iR; dy = y; dx = x + (w - dw) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // --- Helper: draw rotated polaroid ---
  function drawPolaroid(photoObj, cx, cy, size, angle) {
    if (!photoObj || !photoObj.img) return;
    const img = photoObj.img;
    const type = photoObj.type || 'treino';
    const pad = 14;
    const bottomPad = 56;
    const totalW = size + pad * 2;
    const totalH = size + pad + bottomPad;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle * Math.PI / 180);
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    // White polaroid background
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(-totalW / 2, -totalH / 2, totalW, totalH);
    ctx.shadowColor = 'transparent';
    // Photo
    drawCover(img, -totalW / 2 + pad, -totalH / 2 + pad, size, size);

    // Type emoji pill badge (top-left corner of photo, clearly readable)
    const typeEmoji = type === 'lazer' ? '🌊' : '🏋️';
    const typeLabel = type === 'lazer' ? ' Lazer' : ' Treino';
    const badgePadX = 16;
    const badgePadY = 10;
    const badgeFontSize = 22;
    ctx.font = `700 ${badgeFontSize}px Lexend, Apple Color Emoji, Segoe UI Emoji, sans-serif`;
    const labelWidth = ctx.measureText(typeLabel).width;
    const emojiFontSize = 26;
    // Measure emoji separately with emoji font
    ctx.font = `${emojiFontSize}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
    const emojiWidth = ctx.measureText(typeEmoji).width;
    const badgeW = emojiWidth + labelWidth + badgePadX * 2 + 6;
    const badgeH = badgeFontSize + badgePadY * 2;
    const badgeX = -totalW / 2 + pad + 10;
    const badgeY = -totalH / 2 + pad + 10;

    // Pill background
    ctx.fillStyle = type === 'lazer' ? 'rgba(230,81,0,0.82)' : 'rgba(46,125,50,0.82)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 999);
    ctx.fill();

    // Emoji
    ctx.fillStyle = '#ffffff';
    ctx.font = `${emojiFontSize}px Apple Color Emoji, Segoe UI Emoji, sans-serif`;
    ctx.textAlign = 'left';
    ctx.shadowColor = 'transparent';
    ctx.fillText(typeEmoji, badgeX + badgePadX, badgeY + badgeH - badgePadY - 2);

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${badgeFontSize}px Lexend, sans-serif`;
    ctx.fillText(typeLabel, badgeX + badgePadX + emojiWidth + 4, badgeY + badgeH - badgePadY - 1);
    ctx.textAlign = 'center';

    ctx.restore();
  }

  try {
    // 1. Load all static assets in parallel
    const [bgImg, logoImg] = await Promise.all([
      loadImg('images/PROMO CAIA.png'),
      loadImg('images/logo_opt.webp')
    ]);

    // 2. Load user's check-in photos (up to 3)
    let checkinPhotos = [];
    try {
      // Avoid orderBy('timestamp', 'desc') to prevent missing composite index errors
      const q = query(
        collection(db, 'checkins'),
        where('userId', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        // Sort descending by timestamp in memory
        const docs = snap.docs.sort((a, b) => {
          const tA = a.data().timestamp?.toMillis?.() || 0;
          const tB = b.data().timestamp?.toMillis?.() || 0;
          return tB - tA;
        });
        
        // Take top 3 most recent
        const recentDocs = docs.slice(0, 3);
        
        const photoPromises = recentDocs.map(async d => {
          const img = await loadImg(d.data().photoUrl);
          return { img, type: d.data().type || 'treino' };
        });
        checkinPhotos = await Promise.all(photoPromises);
        checkinPhotos = checkinPhotos.filter(p => p.img);
      }
    } catch (err) {
      console.warn('[Story] Error fetching checkins:', err);
    }

    if (checkinPhotos.length === 0) {
      // Fallback: Use the logo image so the user can still share a card even with 0 check-ins
      if (logoImg) {
        checkinPhotos.push({ img: logoImg, type: 'lazer' });
      } else {
        hideLoading();
        showToast('Nenhum check-in com foto encontrado.', 'warning');
        return;
      }
    }

    setLoadingText('Montando card...');

    // ========== DRAW THE CARD ==========

    // A) Background photo (aligned to top)
    if (bgImg) {
      drawCover(bgImg, 0, 0, W, H, true);
    } else {
      ctx.fillStyle = '#0a1f14';
      ctx.fillRect(0, 0, W, H);
    }

    // B) Subtle gradient at the bottom for text legibility
    const grad = ctx.createLinearGradient(0, H - 700, 0, H);
    grad.addColorStop(0, 'rgba(10, 31, 20, 0)');
    grad.addColorStop(1, 'rgba(10, 31, 20, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H - 700, W, 700);

    // E) Photo stack (polaroids) — center of card
    const stackCenterY = H / 2;
    const photoSize = 380;
    if (checkinPhotos.length >= 3) {
      drawPolaroid(checkinPhotos[2], W / 2 + 35, stackCenterY + 20, photoSize, 7);
    }
    if (checkinPhotos.length >= 2) {
      drawPolaroid(checkinPhotos[1], W / 2 - 25, stackCenterY - 10, photoSize, -5);
    }
    drawPolaroid(checkinPhotos[0], W / 2, stackCenterY, photoSize, 1.5);

    // F) User name
    const nameY = stackCenterY + photoSize / 2 + 120;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 52px Lexend, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(currentUser.displayName || 'Visitante', W / 2, nameY);
    ctx.shadowColor = 'transparent';

    // G) Streak badge
    const streakCount = currentUserData.streakCount || 0;
    const streakText = `🔥 ${streakCount} ${streakCount === 1 ? 'dia seguido' : 'dias seguidos'}`;
    ctx.font = '800 38px Lexend, sans-serif';
    const tm = ctx.measureText(streakText);
    const badgeW = tm.width + 100;
    const badgeH = 80;
    const badgeY = nameY + 40;

    // Badge background
    ctx.fillStyle = 'rgba(46, 125, 50, 0.4)';
    const badgeX = W / 2 - badgeW / 2;
    const br = 999;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, br);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 38px Lexend, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(streakText, W / 2, badgeY + 54);

    // H) Brand footer
    const brandY = H - 160;
    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, brandY, 40, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, W / 2 - 40, brandY - 40, 80, 80);
      ctx.restore();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px Lexend, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Pós Treino Balneário Rio Preto', W / 2, brandY + 65);
    ctx.font = '400 24px Lexend, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('@balneario_riopreto', W / 2, brandY + 100);
    ctx.globalAlpha = 1.0;

    // ========== EXPORT ==========
    canvas.toBlob(async (blob) => {
      hideLoading();
      if (!blob) {
        showToast('Erro ao gerar imagem.', 'error');
        return;
      }

      console.log('[Story] Card generated:', blob.size, 'bytes');
      const file = new File([blob], 'pos-treino-story.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Pós Treino — Balneário Rio Preto',
            text: '🔥 Minha sequência no Pós Treino! @balneario_riopreto #PosTreinoRioPreto'
          });
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            downloadBlob(blob, 'pos-treino-story.png');
          }
        }
      } else {
        downloadBlob(blob, 'pos-treino-story.png');
        showToast('Imagem salva! Compartilhe nos Stories 📱', 'success');
      }
    }, 'image/png');

  } catch (err) {
    hideLoading();
    showToast('Erro ao gerar card.', 'error');
    console.error('[Story] Error:', err);
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════

function showLoading(text = 'Carregando...') {
  loadingText.textContent = text;
  loadingOverlay.classList.add('active');
}
function setLoadingText(text) {
  loadingText.textContent = text;
}
function hideLoading() {
  loadingOverlay.classList.remove('active');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i> ${escapeHtml(message)}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Early Geolocation Prompt on Page Load ───
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      console.log('[Early Geolocation] Permissão concedida:', pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      console.warn('[Early Geolocation] Permissão negada ou indisponível:', err.message);
      if (err.code === 1) {
        showToast('⚠️ Ative a permissão de localização para participar do desafio.', 'warning');
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ─── ADMIN PANEL & DYNAMIC CHALLENGES ───
const ADMIN_EMAILS = ['johnmelocontato@gmail.com'];

async function loadChallenges() {
  const chalContainer = document.querySelector('.challenge-list');
  if (!chalContainer) return;

  try {
    const snap = await getDocs(query(collection(db, 'challenges'), orderBy('createdAt', 'desc')));
    
    // Seed default challenges if empty
    if (snap.empty) {
      const defaults = [
        {
          title: "Super 1º Lugar do Mês",
          description: "Termine o mês na liderança do ranking de fogueiras.",
          prize: "5 Entradas Gratuitas no Balneário Rio Preto!",
          badge: "MENSAL",
          type: "mensal",
          points: "🏆 Ranking Principal",
          createdAt: Timestamp.now()
        },
        {
          title: "Foco de Aço",
          description: "Faça pelo menos 4 check-ins de treino ou lazer nesta semana.",
          prize: "1 Refrescante Suco Natural no Bar do Balneário Rio Preto.",
          badge: "SEMANAL",
          type: "semanal",
          points: "+200 XP",
          createdAt: Timestamp.now()
        },
        {
          title: "Estadia no Paraíso 🌲",
          description: "Mantenha uma sequência (streak) ativa de 10 dias seguidos de pós-treino.",
          prize: "1 Diária Grátis nos Chalés do Balneário Rio Preto!",
          badge: "DATA ESPECIAL",
          type: "especial",
          points: "SUPER PROMO",
          createdAt: Timestamp.now()
        }
      ];

      for (const d of defaults) {
        await addDoc(collection(db, 'challenges'), d);
      }
      loadChallenges();
      return;
    }

    let html = '';
    snap.forEach(docSnap => {
      const ch = docSnap.data();
      const id = docSnap.id;
      
      let badgeClass = 'badge-scheduled';
      if (ch.type === 'mensal') badgeClass = 'badge-active';
      if (ch.type === 'especial') badgeClass = 'badge-special';

      const isSpecial = ch.type === 'especial' ? 'special' : '';
      
      const deleteBtn = (currentUser && ADMIN_EMAILS.includes(currentUser.email)) 
        ? `<button onclick="window.deleteChallenge('${id}')" style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color:#ef4444; font-size:0.7rem; font-weight:700; padding:0.25rem 0.5rem; border-radius:0.3rem; cursor:pointer; margin-top:0.6rem; display:block; width:fit-content; border-radius: 0.375rem;">Excluir Desafio</button>`
        : '';

      html += `
        <div class="challenge-card ${isSpecial}">
            <div class="challenge-header">
                <span class="${badgeClass}">${ch.badge || ch.type.toUpperCase()}</span>
                <span class="challenge-points">${ch.points || ''}</span>
            </div>
            <h5>${ch.title}</h5>
            <p>${ch.description}</p>
            <div class="challenge-prize">
                <strong>Prêmio:</strong> ${ch.prize}
            </div>
            ${deleteBtn}
        </div>
      `;
    });

    chalContainer.innerHTML = html;
  } catch (err) {
    console.error('Error loading challenges:', err);
  }
}

window.deleteChallenge = async (id) => {
  if (!confirm('Deseja realmente excluir este desafio?')) return;
  try {
    await deleteDoc(doc(db, 'challenges', id));
    showToast('Desafio excluído!', 'success');
    loadChallenges();
  } catch (err) {
    showToast('Erro ao excluir desafio.', 'error');
    console.error(err);
  }
};

async function loadAnnouncement() {
  const banner = document.getElementById('announcement-banner');
  const txt = document.getElementById('announcement-text');
  if (!banner || !txt) return;

  try {
    const docSnap = await getDoc(doc(db, 'announcements', 'active'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.isActive && data.text) {
        txt.textContent = data.text;
        banner.style.display = 'block';
        
        const adminInput = document.getElementById('admin-announcement-text');
        if (adminInput && !adminInput.value) adminInput.value = data.text;
        return;
      }
    }
    banner.style.display = 'none';
  } catch (err) {
    console.error('Error loading announcement:', err);
  }
}

async function loadModerationFeed() {
  const modContainer = document.getElementById('admin-moderation-list');
  if (!modContainer) return;

  try {
    const snap = await getDocs(query(collection(db, 'checkins'), orderBy('timestamp', 'desc')));
    if (snap.empty) {
      modContainer.innerHTML = '<p style="font-size:0.8rem; color:rgba(255,255,255,0.5); text-align:center; margin:1rem 0;">Nenhum check-in publicado.</p>';
      return;
    }

    let html = '';
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      const date = data.timestamp ? new Date(data.timestamp.toMillis()).toLocaleString('pt-BR') : data.dateStr;
      
      html += `
        <div class="moderation-item" id="mod-item-${id}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:0.5rem 0.8rem; border-radius:0.5rem; border:1px solid rgba(255,255,255,0.08); margin-bottom: 0.5rem;">
            <div class="moderation-info" style="display:flex; flex-direction:column; gap:0.1rem;">
                <span class="moderation-name" style="font-size:0.8rem; font-weight:700; color:#fff;">${escapeHtml(data.userName)} (${data.type.toUpperCase()})</span>
                <span class="moderation-date" style="font-size:0.7rem; color:rgba(255,255,255,0.40);">${date}</span>
            </div>
            <button class="btn-delete-checkin" onclick="window.deleteCheckinFromMod('${id}')">Deletar</button>
        </div>
      `;
    });
    modContainer.innerHTML = html;
  } catch (err) {
    console.error('Error loading moderation feed:', err);
  }
}

window.deleteCheckinFromMod = async (id) => {
  if (!confirm('Deseja realmente deletar este check-in permanentemente?')) return;
  try {
    await deleteDoc(doc(db, 'checkins', id));
    showToast('Check-in deletado!', 'success');
    loadModerationFeed();
    loadFeed();
  } catch (err) {
    showToast('Erro ao deletar check-in.', 'error');
    console.error(err);
  }
};

// Bind Admin Actions
const btnSaveAnnouncement = document.getElementById('btn-save-announcement');
const btnClearAnnouncement = document.getElementById('btn-clear-announcement');
const btnCreateChallenge = document.getElementById('btn-create-challenge');

if (btnSaveAnnouncement) {
  btnSaveAnnouncement.addEventListener('click', async () => {
    const text = document.getElementById('admin-announcement-text').value.trim();
    if (!text) {
      showToast('O comunicado não pode estar vazio.', 'warning');
      return;
    }
    try {
      showLoading('Publicando comunicado...');
      await setDoc(doc(db, 'announcements', 'active'), {
        text,
        isActive: true,
        updatedAt: serverTimestamp()
      });
      hideLoading();
      showToast('Comunicado publicado!', 'success');
      loadAnnouncement();
    } catch (err) {
      hideLoading();
      showToast('Erro ao publicar comunicado.', 'error');
      console.error(err);
    }
  });
}

if (btnClearAnnouncement) {
  btnClearAnnouncement.addEventListener('click', async () => {
    try {
      showLoading('Removendo comunicado...');
      await setDoc(doc(db, 'announcements', 'active'), {
        text: '',
        isActive: false,
        updatedAt: serverTimestamp()
      });
      document.getElementById('admin-announcement-text').value = '';
      hideLoading();
      showToast('Comunicado removido!', 'success');
      loadAnnouncement();
    } catch (err) {
      hideLoading();
      showToast('Erro ao remover comunicado.', 'error');
      console.error(err);
    }
  });
}

if (btnCreateChallenge) {
  btnCreateChallenge.addEventListener('click', async () => {
    const title = document.getElementById('admin-challenge-title').value.trim();
    const desc = document.getElementById('admin-challenge-desc').value.trim();
    const prize = document.getElementById('admin-challenge-prize').value.trim();
    const type = document.getElementById('admin-challenge-type').value;
    const points = document.getElementById('admin-challenge-points').value.trim();

    if (!title || !desc || !prize) {
      showToast('Preencha título, regras e prêmio.', 'warning');
      return;
    }

    try {
      showLoading('Criando desafio...');
      await addDoc(collection(db, 'challenges'), {
        title,
        description: desc,
        prize,
        type,
        badge: type.toUpperCase(),
        points,
        createdAt: serverTimestamp()
      });
      document.getElementById('admin-challenge-title').value = '';
      document.getElementById('admin-challenge-desc').value = '';
      document.getElementById('admin-challenge-prize').value = '';
      document.getElementById('admin-challenge-points').value = '';

      hideLoading();
      showToast('Desafio criado!', 'success');
      loadChallenges();
    } catch (err) {
      hideLoading();
      showToast('Erro ao criar desafio.', 'error');
      console.error(err);
    }
  });
}
