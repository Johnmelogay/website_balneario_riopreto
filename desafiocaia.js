/* ============================================
   DESAFIO CAIA — Main Logic
   Firebase Auth + Firestore + Storage
   Geofencing + NSFW + Story Export
   ============================================ */

// ─── Firebase SDK Imports (Modular via CDN) ───
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider }
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

// Tab elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// ─── State ───
let currentUser = null;
let currentUserData = null;
let selectedFile = null;
let nsfwModel = null;

// ═══════════════════════════════════════════════
// 1. AUTH FLOW
// ═══════════════════════════════════════════════

btnLogin.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Erro ao fazer login. Tente novamente.', 'error');
      console.error('Auth error:', err);
    }
  }
});

btnLogout.addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    updateUserUI(user);
    await ensureUserDoc(user);
    await loadUserData();
    loadFeed();
    loadLeaderboard();
  } else {
    currentUser = null;
    currentUserData = null;
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
});

function updateUserUI(user) {
  userAvatar.src = user.photoURL || 'images/logo_opt.webp';
  userName.textContent = user.displayName || 'Visitante';
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
    statCheckins.textContent = currentUserData.totalCheckins || 0;
    userStreakDisplay.innerHTML = `🔥 <span>${currentUserData.streakCount || 0}</span> dias`;

    // Update story card
    const storyName = $('#story-user-name');
    const storyStreak = $('#story-streak-count');
    if (storyName) storyName.textContent = currentUser.displayName || 'Visitante';
    if (storyStreak) storyStreak.textContent = `🔥 ${currentUserData.streakCount || 0} dias seguidos`;

    // Calculate rank
    await updateRank();
  }
}

async function updateRank() {
  const usersQuery = query(
    collection(db, 'users'),
    orderBy('streakCount', 'desc')
  );
  const snap = await getDocs(usersQuery);
  let rank = 1;
  let found = false;
  snap.forEach((d) => {
    if (d.id === currentUser.uid) { found = true; return; }
    if (!found && !employeeUIDs.includes(d.id)) rank++;
  });
  if (employeeUIDs.includes(currentUser.uid)) {
    statRank.textContent = '—';
  } else {
    statRank.textContent = `#${rank}`;
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

btnCheckin.addEventListener('click', async () => {
  if (!currentUser) return;

  // 1. Check if already checked in today
  const alreadyChecked = await hasCheckedInToday();
  if (alreadyChecked) {
    showToast('Você já fez check-in hoje! Volte amanhã 🌟', 'warning');
    return;
  }

  // 2. Geofence check
  showLoading('Verificando localização...');
  try {
    await checkGeolocation();
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    return;
  }

  // 3. Open camera
  cameraInput.click();
});

cameraInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show preview
  selectedFile = file;
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
});

btnConfirmUpload.addEventListener('click', async () => {
  previewModal.classList.remove('active');
  if (!selectedFile) return;

  showLoading('Analisando imagem...');

  // 4. NSFW Check
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

  // 5. Upload to Firebase Storage
  setLoadingText('Enviando foto...');
  try {
    const photoUrl = await uploadPhoto(selectedFile);

    // 6. Save check-in + update streak
    setLoadingText('Registrando check-in...');
    await saveCheckin(photoUrl);
    await updateStreak();
    await loadUserData();

    hideLoading();
    showToast('Check-in registrado com sucesso! 🎉', 'success');

    // Refresh feed
    loadFeed();
    loadLeaderboard();
  } catch (err) {
    hideLoading();
    showToast('Erro ao salvar check-in. Tente novamente.', 'error');
    console.error('Checkin error:', err);
  }

  selectedFile = null;
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

async function saveCheckin(photoUrl) {
  await addDoc(collection(db, 'checkins'), {
    userId: currentUser.uid,
    userName: currentUser.displayName || 'Visitante',
    userPhoto: currentUser.photoURL || '',
    photoUrl: photoUrl,
    dateStr: getTodayDateStr(),
    timestamp: serverTimestamp(),
    reportsCount: 0
  });
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

async function loadFeed() {
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
      return;
    }

    feedContainer.innerHTML = posts.map(post => renderFeedCard(post)).join('');
  } catch (err) {
    console.error('Feed error:', err);
    feedContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Erro ao carregar o mural.</p>
      </div>`;
  }
}

function renderFeedCard(post) {
  const ts = post.timestamp?.toDate?.() || new Date();
  const timeAgo = formatTimeAgo(ts);
  const isMine = currentUser && String(post.userId).trim() === String(currentUser.uid).trim();
  
  console.log(`[Feed Debug] post.id: ${post.id} | post.userId: ${post.userId} | currentUser.uid: ${currentUser ? currentUser.uid : 'null'} | isMine: ${isMine}`);

  const actionButton = isMine
    ? `<button class="btn-feed-action delete" onclick="deletePost('${post.id}')" title="Excluir">
         <i class="fa-solid fa-trash-can"></i>
       </button>`
    : `<button class="btn-feed-action report" onclick="reportPost('${post.id}')" title="Denunciar">
         <i class="fa-solid fa-flag"></i>
       </button>`;

  return `
    <div class="feed-card">
      ${actionButton}
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
  const q = query(
    collection(db, 'users'),
    orderBy('streakCount', 'desc'),
    limit(50)
  );

  try {
    const snap = await getDocs(q);
    const users = [];
    snap.forEach(d => {
      const data = d.data();
      // Filter out employees
      if (!employeeUIDs.includes(d.id) && (data.streakCount || 0) > 0) {
        users.push({ id: d.id, ...data });
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

    leaderboardContainer.innerHTML = users.slice(0, 20).map((u, i) => renderLeaderboardItem(u, i)).join('');
  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

function renderLeaderboardItem(user, index) {
  const rank = index + 1;
  let rankClass = 'normal';
  if (rank === 1) rankClass = 'gold';
  else if (rank === 2) rankClass = 'silver';
  else if (rank === 3) rankClass = 'bronze';

  const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
  const isMe = currentUser && user.id === currentUser.uid;

  return `
    <div class="leaderboard-item glass-card" style="${isMe ? 'border-color: rgba(46,125,50,0.4); background: rgba(46,125,50,0.08);' : ''}">
      <div class="leaderboard-rank ${rankClass}">${medal}</div>
      <img class="leaderboard-avatar" src="${escapeHtml(user.photoURL || 'images/logo_opt.webp')}" alt="" />
      <div class="leaderboard-name">${escapeHtml(user.displayName || 'Visitante')}${isMe ? ' (você)' : ''}</div>
      <div class="leaderboard-streak">🔥 ${user.streakCount || 0}</div>
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

  // Populate story card with latest check-in photo
  const storyCard = $('#story-export-card');
  const storyPhotoImg = $('#story-photo');

  // Fetch latest check-in photo
  try {
    const q = query(
      collection(db, 'checkins'),
      where('userId', '==', currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const latestCheckin = snap.docs[0].data();
      storyPhotoImg.crossOrigin = 'anonymous';
      storyPhotoImg.src = latestCheckin.photoUrl;

      // Wait for image to load
      await new Promise((resolve, reject) => {
        storyPhotoImg.onload = resolve;
        storyPhotoImg.onerror = reject;
        if (storyPhotoImg.complete) resolve();
      });
    }
  } catch (err) {
    console.warn('Could not load latest photo for story:', err);
  }

  // Temporarily position card on-screen for html2canvas
  storyCard.style.left = '0';
  storyCard.style.top = '0';
  storyCard.style.position = 'fixed';
  storyCard.style.zIndex = '-1';

  try {
    const canvas = await html2canvas(storyCard, {
      width: 1080,
      height: 1920,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null
    });

    // Reset position
    storyCard.style.left = '-9999px';
    storyCard.style.zIndex = '';

    canvas.toBlob(async (blob) => {
      hideLoading();

      if (!blob) {
        showToast('Erro ao gerar imagem.', 'error');
        return;
      }

      const file = new File([blob], 'desafio-caia-story.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Desafio CAIA — Balneário Rio Preto',
            text: '🔥 Minha sequência no Desafio CAIA! @balneario_riopreto #DesafioCAIA'
          });
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            downloadBlob(blob, 'desafio-caia-story.png');
          }
        }
      } else {
        // Fallback: download the image
        downloadBlob(blob, 'desafio-caia-story.png');
        showToast('Imagem salva! Compartilhe nos Stories 📱', 'success');
      }
    }, 'image/png');

  } catch (err) {
    storyCard.style.left = '-9999px';
    hideLoading();
    showToast('Erro ao gerar card.', 'error');
    console.error('html2canvas error:', err);
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
