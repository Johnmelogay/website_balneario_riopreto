/* ============================================
   DESAFIO CAIA — Main Logic
   Firebase Auth + Firestore + Storage
   Geofencing + NSFW + Story Export
   ============================================ */

// ─── Firebase SDK Imports (Modular via CDN) ───
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, GoogleAuthProvider, updateProfile }
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
// 1. AUTH FLOW
// ═══════════════════════════════════════════════

// Handle the result of the redirect on page load
getRedirectResult(auth).then((result) => {
  if (result) {
    console.log('[Auth] Login via redirect bem-sucedido');
  }
}).catch((err) => {
  console.error('[Auth] Redirect error:', err);
  if (err.message && (err.message.includes('missing initial state') || err.message.includes('storage-partitioned'))) {
     alert('⚠️ Navegador incompatível com o login seguro.\n\nSe você está no iPhone ou navegadores como Instagram/Facebook, por favor toque nos 3 pontinhos e escolha "Abrir no navegador do sistema" (Safari ou Chrome).');
  } else {
     showToast('Erro ao processar login.', 'error');
  }
});

btnLogin.addEventListener('click', async () => {
  try {
    showLoading('Autenticando...');
    // Try popup first (best UX on desktop, but might be blocked on mobile/in-app browsers)
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request' || err.message.includes('popup')) {
      console.warn('[Auth] Popup blocked, falling back to redirect...');
      showLoading('Redirecionando...');
      await signInWithRedirect(auth, googleProvider);
    } else if (err.code !== 'auth/popup-closed-by-user') {
      hideLoading();
      showToast('Erro ao fazer login.', 'error');
      console.error('[Auth] Start error:', err);
    } else {
      hideLoading();
    }
  }
});

btnLogout.addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await ensureUserDoc(user); // creates doc if it doesn't exist
    await loadUserData(); // populates currentUserData

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

    // Subtle colored badge dot inside photo
    ctx.fillStyle = type === 'lazer' ? '#e65100' : '#2e7d32'; // orange or green
    ctx.beginPath();
    ctx.arc(-totalW / 2 + pad + 24, -totalH / 2 + pad + 24, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  try {
    // 1. Load all static assets in parallel
    const [bgImg, logoImg] = await Promise.all([
      loadImg('images/PROMO CAIA.webp'),
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
      hideLoading();
      showToast('Nenhum check-in com foto encontrado.', 'warning');
      return;
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
    const streakText = `🔥 ${streakCount} dias seguidos`;
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
    ctx.fillText('Pós Treino', W / 2, brandY + 65);
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
