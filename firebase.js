// ============================================================
// PONTE — Firebase Service
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, onAuthStateChanged, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, getDocs,
  collection, query, where, orderBy, limit, serverTimestamp, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDf-Ds8SbM0xLo8oYOqet3xqhBWZQ4buKw",
  authDomain:        "ponte-35c61.firebaseapp.com",
  projectId:         "ponte-35c61",
  storageBucket:     "ponte-35c61.firebasestorage.app",
  messagingSenderId: "455720558425",
  appId:             "1:455720558425:web:891fdc50dc13a57dfef648"
};

const app  = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// ─── AUTH ────────────────────────────────────────────────────

export const registerUser = async (email, password, name, role, extra = {}) => {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await setDoc(doc(db, 'users', user.uid), {
    name, email, role, phone: extra.phone || null, photoURL: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  if (role === 'professional') {
    await setDoc(doc(db, 'professionals', user.uid), {
      uid: user.uid, name,
      category: extra.category || null,
      bio: extra.bio || '',
      city: 'Bauru',
      level: 'ACESSO',
      totalEvents: 0,
      averageRating: 0,
      noShows: 0,
      isAvailable: false,
      ratings: { punctuality: 0, presentation: 0, technique: 0 },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  } else if (role === 'employer') {
    await setDoc(doc(db, 'employers', user.uid), {
      uid: user.uid, name,
      businessName: extra.businessName || '',
      businessType: extra.businessType || '',
      city: 'Bauru',
      fixedTeam: [],
      totalJobsPosted: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }
  return user;
};

export const loginUser    = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logoutUser   = ()          => signOut(auth);
export const resetPw      = (email)     => sendPasswordResetEmail(auth, email);
export const onAuthChange = (cb)        => onAuthStateChanged(auth, cb);

// ─── PHOTO UPLOAD ─────────────────────────────────────────────

export const uploadProfilePhoto = async (uid, file) => {
  const storageRef = ref(storage, `profile_photos/${uid}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await updateUser(uid, { photoURL: url });
  return url;
};

// ─── USERS ───────────────────────────────────────────────────

export const getUser = async (uid) => {
  const s = await getDoc(doc(db, 'users', uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};
export const updateUser = (uid, data) =>
  updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });

// ─── PROFESSIONALS ───────────────────────────────────────────

export const getProfessional = async (uid) => {
  const s = await getDoc(doc(db, 'professionals', uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};
export const updateProfessional = (uid, data) =>
  updateDoc(doc(db, 'professionals', uid), { ...data, updatedAt: serverTimestamp() });

export const getProfessionals = async (filters = {}) => {
  let q = collection(db, 'professionals');
  const c = [];
  if (filters.category)              c.push(where('category',    '==', filters.category));
  if (filters.isAvailable !== undefined) c.push(where('isAvailable','==', filters.isAvailable));
  if (c.length) q = query(q, ...c);
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── EMPLOYERS ───────────────────────────────────────────────

export const getEmployer = async (uid) => {
  const s = await getDoc(doc(db, 'employers', uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};
export const updateEmployer = (uid, data) =>
  updateDoc(doc(db, 'employers', uid), { ...data, updatedAt: serverTimestamp() });

// ─── JOBS ────────────────────────────────────────────────────

export const createJob = async (data) => {
  const ref = await addDoc(collection(db, 'jobs'), {
    ...data, status: 'open', applicants: [], confirmedProfessional: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
};
export const getJob = async (id) => {
  const s = await getDoc(doc(db, 'jobs', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};
export const updateJob = (id, data) =>
  updateDoc(doc(db, 'jobs', id), { ...data, updatedAt: serverTimestamp() });
export const getOpenJobs = async (lim = 20) => {
  const q = query(collection(db, 'jobs'), where('status','==','open'),
    orderBy('createdAt','desc'), limit(lim));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const getJobsByEmployer = async (uid) => {
  const q = query(collection(db, 'jobs'), where('employerUid','==',uid),
    orderBy('createdAt','desc'));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── APPLICATIONS ────────────────────────────────────────────

export const applyToJob = async (jobId, profUid, profName) => {
  return addDoc(collection(db, 'applications'), {
    jobId, professionalUid: profUid, professionalName: profName,
    status: 'pending', createdAt: serverTimestamp()
  });
};
export const getApplicationsByJob = async (jobId) => {
  const q = query(collection(db, 'applications'), where('jobId','==',jobId));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const getApplicationsByProfessional = async (uid) => {
  const q = query(collection(db, 'applications'), where('professionalUid','==',uid),
    orderBy('createdAt','desc'));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const updateApplication = (id, data) =>
  updateDoc(doc(db, 'applications', id), data);

// ─── REVIEWS ─────────────────────────────────────────────────

export const createReview = async (data) => {
  const avg = (data.punctuality + data.presentation + data.technique) / 3;
  return addDoc(collection(db, 'reviews'), {
    ...data, average: Math.round(avg * 10) / 10,
    createdAt: serverTimestamp()
  });
};
export const getReviewsByProfessional = async (uid) => {
  const q = query(collection(db, 'reviews'), where('professionalUid','==',uid),
    orderBy('createdAt','desc'));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── ADMIN ───────────────────────────────────────────────────

export const getAdminStats = async () => {
  const [u, j, p, e] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'jobs')),
    getDocs(collection(db, 'professionals')),
    getDocs(collection(db, 'employers')),
  ]);
  const jobs = j.docs.map(d => d.data());
  return {
    totalUsers: u.size, totalProfessionals: p.size, totalEmployers: e.size,
    totalJobs: jobs.length,
    openJobs:      jobs.filter(j => j.status === 'open').length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
  };
};
export const listenCollection = (name, cb) =>
  onSnapshot(collection(db, name), snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

// ─── CONSTANTS ───────────────────────────────────────────────

export const LEVELS = {
  ACESSO:       { label: '🔵 Acesso',       cls: 'lvl-acesso',        order: 1, notifDelay: 4 },
  PADRAO:       { label: '🟢 Padrão',       cls: 'lvl-padrao',        order: 2, notifDelay: 2 },
  ESPECIALISTA: { label: '🟡 Especialista', cls: 'lvl-especialista',  order: 3, notifDelay: 1 },
  ELITE:        { label: '✦ Elite',         cls: 'lvl-elite',         order: 4, notifDelay: 0 },
};
export const CATEGORIES = [
  { id: 'garcom',     label: 'Garçom / Atendente', icon: '🍽️' },
  { id: 'bartender',  label: 'Bartender',           icon: '🍹' },
  { id: 'cozinheiro', label: 'Cozinheiro / Chef',   icon: '👨‍🍳' },
  { id: 'staff',      label: 'Staff de Eventos',    icon: '🎪' },
];
export const BUSINESS_TYPES = [
  { id: 'bar_restaurante', label: 'Bar / Restaurante' },
  { id: 'buffet',          label: 'Buffet / Casa de Festas' },
  { id: 'hotel',           label: 'Hotel / Pousada' },
  { id: 'corporativo',     label: 'Empresa / Eventos Corporativos' },
  { id: 'produtora',       label: 'Produtora de Eventos' },
];
export const getCategoryIcon  = (id) => CATEGORIES.find(c => c.id === id)?.icon  || '💼';
export const getCategoryLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || (id || '');
export const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
