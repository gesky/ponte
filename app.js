// ============================================================
// PONTE — App Principal
// ============================================================

import {
  auth, db, storage,
  registerUser, loginUser, logoutUser, resetPw, onAuthChange,
  getUser, updateUser, uploadProfilePhoto, removeProfilePhoto, checkPhoneExists,
  getProfessional, updateProfessional,
  getEmployer, updateEmployer,
  createJob, getJob, updateJob, getOpenJobs, getJobsByEmployer,
  applyToJob, getApplicationsByJob, getApplicationsByProfessional, updateApplication,
  createReview,
  ensureChat, sendMessage, listenMessages, getChatId,
  getReviewsByProfessional,
  getAdminStats, listenCollection,
  LEVELS, CATEGORIES, BUSINESS_TYPES,
  getCategoryIcon, getCategoryLabel, fmtDate,
} from './firebase.js';

// ─── STATE ───────────────────────────────────────────────────
const STATE = {
  user: null, userData: null, profile: null,
  activeSection: null, jobDetail: null,
};

// ─── DOM HELPERS ─────────────────────────────────────────────
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// ─── TOAST ───────────────────────────────────────────────────
let _toastT;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.className = ''; }, 2800);
}

// ─── HELPERS ─────────────────────────────────────────────────
const lvlBadge = (level) => {
  const l = LEVELS[level] || LEVELS.ACESSO;
  return `<span class="lvl-badge ${l.cls}">${l.label}</span>`;
};
const statusPill = (s) => {
  const m = { open:'Aberta', filled:'Confirmada', completed:'Concluída', cancelled:'Cancelada' };
  return `<span class="status-pill status-${s}">${m[s]||s}</span>`;
};
const infoChip = (icon, text) =>
  `<div class="info-chip"><span>${icon}</span><span>${text}</span></div>`;
const avatarHTML = (user, size = 56) => user?.photoURL
  ? `<img src="${user.photoURL}" class="profile-avatar" style="width:${size}px;height:${size}px;object-fit:cover" />`
  : `<div class="profile-avatar" style="width:${size}px;height:${size}px;font-size:${size*0.4}px">${(user?.name||'?')[0].toUpperCase()}</div>`;

function buildStars(value = 0, name, readonly = false) {
  return [1,2,3,4,5].map(i =>
    `<button class="star ${i <= value ? 'on':''}" data-val="${i}" data-name="${name}"
      ${readonly ? 'disabled' : ''} type="button">★</button>`
  ).join('');
}
function initStarGroups(container) {
  $$('.star', container).forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name, val = +btn.dataset.val;
      $$(`[data-name="${name}"]`, container).forEach(s =>
        s.classList.toggle('on', +s.dataset.val <= val));
      container.dataset[name] = val;
    });
  });
}

// ─── ROUTING ─────────────────────────────────────────────────
function showAuthPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#${id}`)?.classList.add('active');
  $('.app-shell')?.classList.remove('active');
}

function showApp(section) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('.app-shell').classList.add('active');
  $$('.section').forEach(s => s.classList.remove('active'));
  $(`#sec-${section}`)?.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.sec === section));
  STATE.activeSection = section;
  ({
    inicio: loadHome, vagas: loadJobs,
    'publicar-vaga': loadPublishJob,
    equipe: loadTeam, perfil: loadProfile, admin: loadAdmin,
  })[section]?.();
}

// ─── AUTH OBSERVER ───────────────────────────────────────────
let _authBusy = false;
onAuthChange(async (user) => {
  if (_authBusy) return;
  if (user) {
    _authBusy = true;
    STATE.user = user;
    try {
      STATE.userData = await getUser(user.uid);
      if (!STATE.userData) {
        // Documento ainda nao existe — pode ser cadastro recem criado, tenta de novo em 1s
        await new Promise(r => setTimeout(r, 1000));
        STATE.userData = await getUser(user.uid);
      }
      if (!STATE.userData) {
        _authBusy = false;
        toast('Conta nao encontrada. Tente fazer login novamente.', 'red');
        await logoutUser();
        return;
      }
      const role = STATE.userData.role;
      if (role === 'professional') STATE.profile = await getProfessional(user.uid).catch(() => null);
      else if (role === 'employer') STATE.profile = await getEmployer(user.uid).catch(() => null);
      buildNav(role);
      if (role === 'admin') showApp('admin');
      else showApp('inicio');
    } catch (err) {
      console.error('Auth error:', err);
      showAuthPage('page-login');
      toast('Erro ao carregar conta: ' + (err && err.message ? err.message : err), 'red');
    } finally {
      _authBusy = false;
    }
  } else {
    STATE.user = STATE.userData = STATE.profile = null;
    showAuthPage('page-login');
  }
});

// ─── NAV ─────────────────────────────────────────────────────
const NAVS = {
  professional: [
    { sec:'inicio',        icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,        label:'Início' },
    { sec:'vagas',         icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`, label:'Vagas' },
    { sec:'perfil',        icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`, label:'Perfil' },
  ],
  employer: [
    { sec:'inicio',        icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,        label:'Início' },
    { sec:'publicar-vaga', icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,        label:'Publicar' },
    { sec:'equipe',        icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`, label:'Equipe' },
    { sec:'perfil',        icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`, label:'Perfil' },
  ],
  admin: [
    { sec:'admin', icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`, label:'Admin' },
  ],
};
function buildNav(role) {
  const nav = $('.bottom-nav');
  nav.innerHTML = (NAVS[role]||[]).map(n =>
    `<button class="nav-item" data-sec="${n.sec}">${n.icon}<span>${n.label}</span></button>`
  ).join('');
  $$('.nav-item').forEach(b => b.addEventListener('click', () => showApp(b.dataset.sec)));
}

// ─── LOGIN ───────────────────────────────────────────────────
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-login');
  btn.disabled = true; btn.textContent = '...';
  $('#login-error').style.display = 'none';
  try {
    await loginUser($('#login-email').value.trim(), $('#login-pw').value);
  } catch (err) {
    $('#login-error').textContent = friendlyErr(err.code);
    $('#login-error').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});
$('#link-to-register').addEventListener('click', (e) => { e.preventDefault(); resetRegister(); showAuthPage('page-register'); });
$('#link-forgot').addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  if (!email) { toast('Digite seu e-mail primeiro', 'red'); return; }
  try { await resetPw(email); toast('E-mail de recuperação enviado!'); }
  catch { toast('Erro ao enviar e-mail.', 'red'); }
});

// ─── REGISTER ────────────────────────────────────────────────
$('#link-to-login').addEventListener('click', (e) => { e.preventDefault(); resetRegister(); showAuthPage('page-login'); });

let selectedRole = null;

function resetRegister() {
  selectedRole = null;
  $('#reg-step1').style.display = 'flex';
  $('#form-register').style.display = 'none';
  $('#form-register').reset();
  $('#reg-error').style.display = 'none';
  $('#reg-fields-professional').style.display = 'none';
  $('#reg-fields-employer').style.display = 'none';
  const btn = $('#btn-register');
  btn.disabled = false;
  btn.textContent = 'Criar conta';
}

// CEP auto-complete via ViaCEP
async function buscarCEP() {
  const cepInput = $('#reg-cep');
  const cep = cepInput.value.replace(/\D/g, '');
  if (cep.length !== 8) { toast('CEP deve ter 8 digitos.', 'red'); return; }

  const btn = $('#btn-buscar-cep');
  btn.disabled = true; btn.textContent = 'Buscando...';

  try {
    const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) {
      toast('CEP nao encontrado.', 'red');
    } else {
      // Formata CEP
      cepInput.value = cep.replace(/(\d{5})(\d{3})/, '$1-$2');
      // Preenche campos
      const fields = $('#reg-address-fields');
      fields.style.display = 'flex';
      $('#reg-logradouro').value = data.logradouro || '';
      $('#reg-bairro').value     = data.bairro     || '';
      $('#reg-cidade').value     = data.localidade  || 'Bauru';
      $('#reg-estado').value     = data.uf          || 'SP';
      // Foca no numero
      setTimeout(() => $('#reg-numero')?.focus(), 100);
    }
  } catch {
    toast('Erro ao buscar CEP. Preencha o endereco manualmente.', 'red');
    $('#reg-address-fields').style.display = 'flex';
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar CEP';
  }
}

$$('.role-card').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRole = btn.dataset.role;
    $('#reg-step1').style.display = 'none';
    $('#form-register').style.display = 'flex';
    $('#reg-error').style.display = 'none';
    $('#reg-fields-professional').style.display = selectedRole === 'professional' ? 'flex' : 'none';
    $('#reg-fields-employer').style.display     = selectedRole === 'employer'     ? 'flex' : 'none';
  });
});

// CEP button click
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'btn-buscar-cep') buscarCEP();
});
// CEP input: auto-busca quando digitar 8 digitos
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'reg-cep') {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits.length === 8) buscarCEP();
  }
});

$('#btn-reg-back').addEventListener('click', () => {
  resetRegister();
});

$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#reg-error').style.display = 'none';

  // Garante que um role foi selecionado
  if (!selectedRole) {
    showRegError('Selecione o tipo de conta antes de continuar.');
    return;
  }

  const name  = $('#reg-name').value.trim();
  const email = $('#reg-email').value.trim();
  const pw    = $('#reg-pw').value;
  const pw2   = $('#reg-pw2').value;
  const phone = $('#reg-phone').value.trim();

  if (!name)  { showRegError('Digite seu nome.'); return; }
  if (!email) { showRegError('Digite seu e-mail.'); return; }
  if (!phone) { showRegError('Digite seu WhatsApp.'); return; }
  if (pw !== pw2) { showRegError('As senhas nao coincidem.'); return; }
  if (pw.length < 6) { showRegError('A senha deve ter pelo menos 6 caracteres.'); return; }

  if (selectedRole === 'professional' && !$('#reg-category')?.value) {
    showRegError('Selecione sua especialidade.'); return;
  }

  const btn = $('#btn-register');
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    // Verifica celular duplicado para o mesmo tipo de conta
    const phoneExists = await checkPhoneExists(phone, selectedRole);
    if (phoneExists) {
      const tipo = selectedRole === 'professional' ? 'freela' : 'estabelecimento';
      showRegError(`Este celular ja esta cadastrado como ${tipo}. Use outro numero ou faca login.`);
      btn.disabled = false; btn.textContent = 'Criar conta';
      return;
    }

    btn.textContent = 'Criando conta...';
    await registerUser(email, pw, name, selectedRole, {
      phone,
      category:     $('#reg-category')?.value      || null,
      businessName: $('#reg-business-name')?.value  || null,
      businessType: $('#reg-business-type')?.value  || null,
      cep:         $('#reg-cep')?.value             || null,
      logradouro:  $('#reg-logradouro')?.value      || null,
      numero:      $('#reg-numero')?.value          || null,
      complemento: $('#reg-complemento')?.value     || null,
      bairro:      $('#reg-bairro')?.value          || null,
      cidade:      $('#reg-cidade')?.value          || 'Bauru',
      estado:      $('#reg-estado')?.value          || 'SP',
    });
    resetRegister();
  } catch (err) {
    console.error('Register error:', err);
    showRegError(friendlyErr(err.code) || err.message || 'Erro ao criar conta.');
    btn.disabled = false;
    btn.textContent = 'Criar conta';
  }
});

function showRegError(msg) {
  const el = $('#reg-error');
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── HOME ────────────────────────────────────────────────────
async function loadHome() {
  const role = STATE.userData?.role;
  if (role === 'professional') await renderProfHome();
  else if (role === 'employer') await renderEmployerHome();
}

async function renderProfHome() {
  const sec = $('#sec-inicio');
  sec.innerHTML = loader();
  try {
    // Busca perfil e candidaturas em paralelo
    const [prof, apps] = await Promise.all([
      getProfessional(STATE.user.uid),
      getApplicationsByProfessional(STATE.user.uid).catch(e => { console.warn('apps:', e); return []; }),
    ]);
    STATE.profile = prof;

    // Busca cada vaga de forma tolerante a falha (vaga deletada nao trava o app)
    const jobsData = apps.length
      ? await Promise.all(apps.map(a => getJob(a.jobId).catch(() => null)))
      : [];
    const jobMap = Object.fromEntries(jobsData.filter(Boolean).map(j=>[j.id,j]));

    const sColors = { pending:'var(--muted)', accepted:'var(--yellow)', rejected:'#e06060' };
    const sLabels = { pending:'Aguardando', accepted:'Confirmado ✓', rejected:'Recusado' };

    sec.innerHTML = `
      <div class="home-header">
        ${avatarHTML(STATE.userData, 48)}
        <div class="home-header-text">
          <p class="greeting-sub">Olá,</p>
          <h2 class="greeting-name">${STATE.userData.name.split(' ')[0]}</h2>
          <p class="greeting-cat">${getCategoryLabel(prof?.category)}</p>
        </div>
        ${lvlBadge(prof?.level || 'ACESSO')}
      </div>

      <div class="card card-sm">
        <div class="toggle-wrap">
          <div>
            <p class="toggle-title">Disponível para trabalhar</p>
            <p class="toggle-hint">${prof?.isAvailable ? 'Você aparece para contratantes.' : 'Você está invisível no momento.'}</p>
          </div>
          <button class="toggle ${prof?.isAvailable ? 'on':''}" id="toggle-avail" aria-label="Disponibilidade"></button>
        </div>
      </div>

      <div>
        <div class="sec-header">
          <h3>Minha agenda</h3>
          <button class="see-all" id="btn-see-all">Buscar vagas →</button>
        </div>
        <div class="jobs-stack" id="home-jobs">
          ${apps.length ? apps.map(a => {
            const j = jobMap[a.jobId]; if (!j) return '';
            return `<button class="job-card" data-id="${j.id}">
              <div class="job-card-left">
                <span class="job-icon">${getCategoryIcon(j.category)}</span>
                <div>
                  <p class="job-title">${j.title}</p>
                  <p class="job-meta">${j.businessName||''} · ${j.date?new Date(j.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—'}</p>
                </div>
              </div>
              <span style="font-size:.75rem;font-weight:700;color:${sColors[a.status]}">${sLabels[a.status]}</span>
            </button>`;
          }).join('') : emptyState('📋','Nenhuma candidatura ainda','Busque vagas e candidate-se.',`<button class="btn btn-primary btn-sm" id="empty-go-vagas">Ver vagas</button>`)}
        </div>
      </div>
    `;

    $('#toggle-avail').addEventListener('click', async function() {
      const v = !prof.isAvailable; prof.isAvailable = v;
      this.classList.toggle('on', v);
      await updateProfessional(STATE.user.uid, { isAvailable: v });
      toast(v ? 'Você está disponível!' : 'Invisível no momento.');
    });
    $('#btn-see-all').addEventListener('click', () => showApp('vagas'));
    $('#empty-go-vagas')?.addEventListener('click', () => showApp('vagas'));
    // Avatar no header: toque para ver foto
    $$('.profile-avatar, .profile-avatar img', sec).forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (STATE.userData.photoURL) viewPhoto(STATE.userData.photoURL, STATE.userData.name);
        else showApp('perfil');
      });
    });
    $$('.job-card', sec).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
  } catch (err) {
    sec.innerHTML = errState('Erro ao carregar. Verifique conexão.');
  }
}

async function renderEmployerHome() {
  const sec = $('#sec-inicio');
  sec.innerHTML = loader();
  try {
    const jobs = await getJobsByEmployer(STATE.user.uid);
    const active = jobs.filter(j => j.status==='open'||j.status==='filled');
    const done   = jobs.filter(j => j.status==='completed');

    sec.innerHTML = `
      <div class="home-header">
        ${avatarHTML(STATE.userData, 48)}
        <div class="home-header-text">
          <p class="greeting-sub">Olá,</p>
          <h2 class="greeting-name">${STATE.userData.name.split(' ')[0]}</h2>
          <p class="greeting-cat" style="color:var(--yellow)">${STATE.profile?.businessName||''}</p>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-full btn-lg" id="btn-go-publish">+ Publicar nova vaga</button>
        <button class="btn btn-ghost btn-full" id="btn-go-team">👥 Minha equipe fixa</button>
      </div>

      <div class="stats-grid">
        ${statCard('📋', active.length, 'Ativas', true)}
        ${statCard('✅', done.length, 'Concluídas')}
        ${statCard('📊', jobs.length, 'Total')}
      </div>

      <div>
        <div class="sec-header"><h3>Vagas recentes</h3></div>
        <div class="jobs-stack" style="margin-top:10px">
          ${jobs.length ? jobs.slice(0,5).map(j => `
            <button class="job-card" data-id="${j.id}">
              <div class="job-card-left">
                <span class="job-icon">${getCategoryIcon(j.category)}</span>
                <div>
                  <p class="job-title">${j.title}</p>
                  <p class="job-meta">${fmtDate(j.createdAt)} · ${j.startTime||''}–${j.endTime||''}</p>
                </div>
              </div>
              ${statusPill(j.status)}
            </button>
          `).join('') : emptyState('📋','Nenhuma vaga publicada','Publique sua primeira vaga.')}
        </div>
      </div>
    `;

    $('#btn-go-publish').addEventListener('click', () => showApp('publicar-vaga'));
    $('#btn-go-team').addEventListener('click', () => showApp('equipe'));
    $$('.job-card', sec).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
  } catch (err) {
    sec.innerHTML = errState('Erro ao carregar.');
  }
}

// ─── JOB CARD HTML ───────────────────────────────────────────
function jobCardHTML(j) {
  const d = j.date ? new Date(j.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—';
  return `
    <button class="job-card" data-id="${j.id}">
      <div class="job-card-left">
        <span class="job-icon">${getCategoryIcon(j.category)}</span>
        <div>
          <p class="job-title">${j.title}</p>
          <p class="job-meta">${j.businessName||''} · ${d}</p>
        </div>
      </div>
      <div class="job-card-right">
        <p class="job-pay">R$ ${j.pay||'—'}</p>
        <p class="job-time">${j.startTime||''}–${j.endTime||''}</p>
      </div>
    </button>`;
}

// ─── BROWSE JOBS ─────────────────────────────────────────────
async function loadJobs() {
  const sec = $('#sec-vagas');
  sec.innerHTML = `
    <div>
      <h2>Vagas disponíveis</h2>
      <p style="font-size:.78rem;color:var(--muted);margin-top:2px">Bauru, SP</p>
    </div>
    <div class="filter-row" id="filter-cats">
      <button class="filter-btn active" data-cat="">Todas</button>
      ${CATEGORIES.map(c=>`<button class="filter-btn" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('')}
    </div>
    <div class="jobs-stack" id="jobs-list">${loader()}</div>
  `;
  const renderFiltered = async (cat='') => {
    const list = $('#jobs-list');
    list.innerHTML = loader();
    try {
      const all = await getOpenJobs(40);
      const filtered = cat ? all.filter(j=>j.category===cat) : all;
      list.innerHTML = filtered.length
        ? filtered.map(j=>jobCardHTML(j)).join('')
        : emptyState('🔍','Nenhuma vaga encontrada');
      $$('.job-card', list).forEach(c=>c.addEventListener('click',()=>openJobDetail(c.dataset.id)));
    } catch { list.innerHTML = errState('Erro ao carregar vagas.'); }
  };
  $$('.filter-btn', sec).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn', sec).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderFiltered(btn.dataset.cat);
    });
  });
  renderFiltered();
}

// ─── JOB DETAIL ──────────────────────────────────────────────
async function openJobDetail(jobId) {
  const secId   = `sec-${STATE.activeSection}`;
  const container = $(`#${secId}`);
  const prevHTML  = container.innerHTML;

  container.innerHTML = loader();
  try {
    const job = await getJob(jobId);
    const role = STATE.userData.role;
    let alreadyApplied = false, applications = [];

    let isConfirmedPro = false;
    if (role === 'professional') {
      const apps = await getApplicationsByProfessional(STATE.user.uid);
      alreadyApplied = apps.some(a => a.jobId === jobId);
      const myApp = apps.find(a => a.jobId === jobId);
      isConfirmedPro = job.confirmedProfessional === STATE.user.uid
                    || myApp?.status === 'accepted';
    } else {
      applications = await getApplicationsByJob(jobId);
      // Busca foto de cada candidato
      const profDocs = await Promise.all(
        applications.map(a => getUser(a.professionalUid).catch(() => null))
      );
      applications = applications.map((a, i) => ({
        ...a,
        photoURL: profDocs[i]?.photoURL || null,
      }));
    }

    container.innerHTML = `
      <button class="back-btn" id="btn-back">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        Voltar
      </button>

      <div class="card">
        <div class="detail-top">
          <div>
            <span style="font-size:2.2rem">${getCategoryIcon(job.category)}</span>
            <h2 style="margin-top:6px;font-size:1.3rem">${job.title}</h2>
            <p style="font-size:.8rem;color:var(--muted);margin-top:2px">${job.businessName||'—'}</p>
          </div>
          ${statusPill(job.status)}
        </div>
        <div class="info-grid">
          ${infoChip('📅', job.date ? new Date(job.date).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long'}) : '—')}
          ${infoChip('🕐', `${job.startTime||'—'} – ${job.endTime||'—'}`)}
          ${infoChip('📍', job.address||'Bauru, SP')}
          ${infoChip('💰', `R$ ${job.pay||'—'}`)}
        </div>
        ${job.description ? `<p class="detail-desc">${job.description}</p>` : ''}
      </div>

      ${role==='professional' && isConfirmedPro ? `
        <div class="alert alert-success">🎉 Você foi confirmado para esta vaga!</div>
        <button class="btn btn-primary btn-full btn-lg" id="btn-chat-pro">💬 Conversar com o estabelecimento</button>
      ` : role==='professional' ? `
        <button class="btn ${alreadyApplied?'btn-ghost':'btn-primary'} btn-full btn-lg" id="btn-apply"
          ${alreadyApplied||job.status!=='open' ? 'disabled' : ''}>
          ${alreadyApplied ? '✓ Candidatura enviada' : job.status!=='open' ? 'Vaga encerrada' : 'Me candidatar'}
        </button>
      ` : ''}

      ${role==='employer' && applications.length ? `
        <div>
          <h3 style="margin-bottom:10px">Candidatos (${applications.length})</h3>
          <div class="jobs-stack">
            ${applications.map(a=>`
              <div class="applicant-row ${a.status==='accepted'?'applicant-confirmed':''}" ${a.status==='accepted'?`data-chat-prof="${a.professionalUid}" data-chat-name="${a.professionalName}"`:''}>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="mini-avatar ${a.photoURL?'has-photo':''}"
                    data-photo="${a.photoURL||''}" data-name="${a.professionalName}"
                    style="${a.photoURL?`background-image:url('${a.photoURL}')`:''}"
                  >${a.photoURL?'':a.professionalName[0].toUpperCase()}</div>
                  <div>
                    <p style="font-weight:600;font-size:.9rem">${a.professionalName}</p>
                    <p style="font-size:.72rem;color:var(--muted)">${a.status==='accepted'?'Toque para conversar 💬':fmtDate(a.createdAt)}</p>
                  </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                  ${a.status==='pending' ? `
                    <button class="btn btn-sm btn-green" data-app="${a.id}" data-prof="${a.professionalUid}" data-name="${a.professionalName}" data-action="accept">Confirmar</button>
                    <button class="btn btn-sm btn-ghost" data-app="${a.id}" data-action="reject">Recusar</button>
                  ` : a.status==='accepted'
                    ? `<span class="status-pill status-filled">Confirmado</span>`
                    : `<span class="status-pill status-cancelled">Recusado</span>`}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${role==='employer' && job.status==='filled' ? `
        <button class="btn btn-yellow btn-full" id="btn-complete">Marcar como concluído</button>
      ` : ''}
      ${role==='employer' && job.status==='completed' && !job.reviewed ? `
        <button class="btn btn-primary btn-full" id="btn-review">Avaliar profissional</button>
      ` : ''}
      ${role==='employer' && job.reviewed ? `
        <div class="alert alert-success">✓ Profissional já avaliado</div>
      ` : ''}
    `;

    $('#btn-back').addEventListener('click', () => {
      container.innerHTML = prevHTML;
      $$('.job-card', container).forEach(c=>c.addEventListener('click',()=>openJobDetail(c.dataset.id)));
      $$('.filter-btn', container).forEach(b => b.addEventListener('click', () => {
        $$('.filter-btn', container).forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
      }));
    });
    $('#btn-apply')?.addEventListener('click', async () => {
      $('#btn-apply').disabled = true; $('#btn-apply').textContent = '...';
      await applyToJob(jobId, STATE.user.uid, STATE.userData.name);
      $('#btn-apply').textContent = '✓ Candidatura enviada';
      toast('Candidatura enviada!');
    });
    $('#btn-chat-pro')?.addEventListener('click', () => {
      openChat(jobId, job.employerUid, STATE.user.uid, {
        jobTitle: job.title,
        employerName: job.businessName,
        professionalName: STATE.userData.name,
        otherName: job.businessName,
      });
    });
    // Confirmar / recusar candidato
    $$('[data-action]', container).forEach(btn => {
      btn.addEventListener('click', async () => {
        const accepted = btn.dataset.action === 'accept';
        await updateApplication(btn.dataset.app, { status: accepted?'accepted':'rejected' });
        if (accepted) {
          await updateJob(jobId, {
            status: 'filled',
            confirmedProfessional: btn.dataset.prof,
            confirmedProfessionalName: btn.dataset.name,
          });
          await ensureChat(jobId, STATE.user.uid, btn.dataset.prof, {
            jobTitle: job.title,
            employerName: STATE.profile?.businessName || STATE.userData.name,
            professionalName: btn.dataset.name,
          });
        }
        toast(accepted ? 'Profissional confirmado!' : 'Candidatura recusada.');
        openJobDetail(jobId);
      });
    });
    // Mini avatar: tocar abre foto em tela cheia
    $$('.mini-avatar.has-photo', container).forEach(av => {
      av.style.cursor = 'pointer';
      av.addEventListener('click', (e) => {
        e.stopPropagation();
        viewPhoto(av.dataset.photo, av.dataset.name);
      });
    });

    // Tocar no candidato confirmado abre o chat
    $$('.applicant-confirmed', container).forEach(row => {
      row.addEventListener('click', () => {
        openChat(jobId, STATE.user.uid, row.dataset.chatProf, {
          jobTitle: job.title,
          employerName: STATE.profile?.businessName || STATE.userData.name,
          professionalName: row.dataset.chatName,
          otherName: row.dataset.chatName,
        });
      });
    });
    $('#btn-complete')?.addEventListener('click', async () => {
      await updateJob(jobId, { status:'completed' });
      toast('Vaga concluída!');
      openJobDetail(jobId);
    });
    $('#btn-review')?.addEventListener('click', () => openReviewModal(job));
  } catch (err) {
    container.innerHTML = `<button class="back-btn" id="btn-back2">← Voltar</button>${errState('Erro ao abrir vaga.')}`;
    $('#btn-back2').addEventListener('click', () => { container.innerHTML = prevHTML; });
  }
}


// ─── PUBLISH JOB ─────────────────────────────────────────────
function loadPublishJob() {
  const sec = $('#sec-publicar-vaga');
  sec.innerHTML = `
    <h2>Publicar vaga</h2>
    <form id="form-job" class="form-stack">
      <div class="field"><label>Título da vaga</label>
        <input id="job-title" placeholder="Ex: Garçom para casamento" required /></div>
      <div class="field"><label>Categoria</label>
        <select id="job-category" required>
          <option value="">Selecione...</option>
          ${CATEGORIES.map(c=>`<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}
        </select></div>
      <div class="form-row">
        <div class="field"><label>Data</label><input id="job-date" type="date" required /></div>
        <div class="field"><label>Início</label><input id="job-start" type="time" required /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Término</label><input id="job-end" type="time" required /></div>
        <div class="field"><label>Valor (R$)</label><input id="job-pay" type="number" min="0" step="0.01" placeholder="150" required /></div>
      </div>
      <div class="field"><label>Endereço / local</label>
        <input id="job-address" placeholder="Rua das Flores, 123 – Bauru" /></div>
      <div class="field"><label>Descrição (opcional)</label>
        <textarea id="job-desc" placeholder="Uniforme, detalhes do evento..."></textarea></div>
      <div id="job-error" class="alert alert-error" style="display:none"></div>
      <button class="btn btn-primary btn-full btn-lg" type="submit" id="btn-publish">Publicar vaga</button>
    </form>`;
  $('#job-date').min = new Date().toISOString().split('T')[0];
  $('#form-job').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-publish');
    btn.disabled = true; btn.textContent = '...';
    try {
      await createJob({
        title:       $('#job-title').value,
        category:    $('#job-category').value,
        date:        $('#job-date').value,
        startTime:   $('#job-start').value,
        endTime:     $('#job-end').value,
        pay:         parseFloat($('#job-pay').value),
        address:     $('#job-address').value,
        description: $('#job-desc').value,
        employerUid: STATE.user.uid,
        businessName: STATE.profile?.businessName || STATE.userData.name,
      });
      toast('Vaga publicada!');
      showApp('inicio');
    } catch {
      $('#job-error').textContent = 'Erro ao publicar. Tente novamente.';
      $('#job-error').style.display = 'block';
      btn.disabled = false; btn.textContent = 'Publicar vaga';
    }
  });
}

// ─── REVIEW MODAL ────────────────────────────────────────────
function openReviewModal(job) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h3>Avaliar profissional</h3>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:20px">${job.title}</p>
      <div id="review-form" data-punctuality="0" data-presentation="0" data-technique="0">
        ${[['punctuality','Pontualidade & Comprometimento','Chegou no horário? Ficou até o fim?'],
           ['presentation','Apresentação & Postura','Traje, higiene e relação com os convidados'],
           ['technique','Técnica','Domínio e qualidade da função']
          ].map(([key,label,desc]) => `
          <div class="pilar-row">
            <p class="pilar-label">${label}</p>
            <p class="pilar-desc">${desc}</p>
            <div class="stars" style="margin-top:8px">${buildStars(0,key)}</div>
          </div>`).join('')}
        <div class="field" style="margin-top:16px">
          <label>Comentário (opcional)</label>
          <textarea id="review-comment" placeholder="Feedback para o profissional..."></textarea>
        </div>
        <div id="review-error" class="alert alert-error" style="display:none;margin-top:10px"></div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-ghost btn-full" id="btn-cancel-review">Cancelar</button>
          <button class="btn btn-primary btn-full" id="btn-submit-review">Enviar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const form = $('#review-form', modal);
  initStarGroups(form);
  $('#btn-cancel-review', modal).addEventListener('click', () => modal.remove());
  $('#btn-submit-review', modal).addEventListener('click', async () => {
    const p = +form.dataset.punctuality, pr = +form.dataset.presentation, t = +form.dataset.technique;
    if (!p||!pr||!t) { $('#review-error',modal).textContent='Avalie os 3 pilares.'; $('#review-error',modal).style.display='block'; return; }
    const btn = $('#btn-submit-review',modal);
    btn.disabled = true; btn.textContent = '...';
    await createReview({ jobId:job.id, employerUid:STATE.user.uid, professionalUid:job.confirmedProfessional,
      punctuality:p, presentation:pr, technique:t, comment:$('#review-comment',modal).value });
    await updateJob(job.id, { reviewed:true });
    modal.remove(); toast('Avaliação enviada!'); showApp('inicio');
  });
}

// ─── TEAM ────────────────────────────────────────────────────
async function loadTeam() {
  const sec = $('#sec-equipe');
  sec.innerHTML = loader();
  try {
    const employer = await getEmployer(STATE.user.uid);
    STATE.profile = employer;
    const teamUids = employer?.fixedTeam || [];
    let members = teamUids.length ? (await Promise.all(teamUids.map(uid=>getProfessional(uid)))).filter(Boolean) : [];
    sec.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><h2>Equipe fixa</h2><p style="font-size:.78rem;color:var(--muted);margin-top:2px">Profissionais de confiança</p></div>
        <button class="btn btn-sm btn-primary" id="btn-add-member">+ Adicionar</button>
      </div>
      <div class="jobs-stack" id="team-list">
        ${members.length ? members.map(m=>`
          <div class="member-card">
            <div class="member-avatar">${m.name[0].toUpperCase()}</div>
            <div class="member-info">
              <p class="member-name">${m.name}</p>
              <p class="member-cat">${getCategoryLabel(m.category)} · ${LEVELS[m.level||'ACESSO'].label}</p>
            </div>
            <button class="btn btn-sm btn-ghost" data-uid="${m.uid}">Remover</button>
          </div>`).join('')
        : emptyState('👥','Equipe vazia','Adicione profissionais pelo e-mail.')}
      </div>`;
    $$('[data-uid]', sec).forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateEmployer(STATE.user.uid, { fixedTeam: teamUids.filter(u=>u!==btn.dataset.uid) });
        toast('Removido da equipe.'); loadTeam();
      });
    });
    $('#btn-add-member').addEventListener('click', () => openAddMemberModal(teamUids));
  } catch { sec.innerHTML = errState('Erro ao carregar equipe.'); }
}

function openAddMemberModal(currentTeam) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h3 style="margin-bottom:16px">Adicionar à equipe</h3>
      <div class="field">
        <label>E-mail do profissional</label>
        <input id="add-email" type="email" placeholder="profissional@email.com" />
      </div>
      <div id="add-result" style="margin-top:12px"></div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost btn-full" id="btn-cancel-add">Cancelar</button>
        <button class="btn btn-primary btn-full" id="btn-search">Buscar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  $('#btn-cancel-add', modal).addEventListener('click', () => modal.remove());
  $('#btn-search', modal).addEventListener('click', async () => {
    const email = $('#add-email', modal).value.trim();
    if (!email) return;
    const btn = $('#btn-search', modal);
    btn.disabled = true; btn.textContent = '...';
    try {
      const { getDocs, query, collection, where } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const snap = await getDocs(query(collection(db,'users'), where('email','==',email), where('role','==','professional')));
      if (snap.empty) {
        $('#add-result',modal).innerHTML = `<div class="alert alert-error">Nenhum profissional encontrado.</div>`;
      } else {
        const u = snap.docs[0]; const uid=u.id, name=u.data().name;
        if (currentTeam.includes(uid)) {
          $('#add-result',modal).innerHTML = `<div class="alert alert-warn">${name} já está na equipe.</div>`;
        } else {
          $('#add-result',modal).innerHTML = `
            <div class="member-card">
              <div class="member-avatar">${name[0]}</div>
              <div class="member-info"><p class="member-name">${name}</p><p class="member-cat">${email}</p></div>
              <button class="btn btn-sm btn-green" id="btn-confirm-add" data-uid="${uid}">Adicionar</button>
            </div>`;
          $('#btn-confirm-add',modal).addEventListener('click', async () => {
            await updateEmployer(STATE.user.uid, { fixedTeam:[...currentTeam,uid] });
            modal.remove(); toast(`${name} adicionado(a)!`); loadTeam();
          });
        }
      }
    } catch { $('#add-result',modal).innerHTML = `<div class="alert alert-error">Erro ao buscar.</div>`; }
    btn.disabled = false; btn.textContent = 'Buscar';
  });
}

// ─── PROFILE ─────────────────────────────────────────────────
async function loadProfile() {
  const sec = $('#sec-perfil');
  sec.innerHTML = loader();
  try {
    const role = STATE.userData.role;
    const u = STATE.userData;
    // Garante que o profile esteja carregado
    let p = STATE.profile;
    if (!p) {
      if (role === 'professional') p = await getProfessional(STATE.user.uid);
      else if (role === 'employer') p = await getEmployer(STATE.user.uid);
      STATE.profile = p;
    }
    p = p || {};

    // Carrega avaliacoes recebidas (somente profissional)
    let reviews = [];
    if (role === 'professional') {
      try { reviews = await getReviewsByProfessional(STATE.user.uid); }
      catch (e) { console.warn('reviews falhou:', e); reviews = []; }
    }

    sec.innerHTML = `
      <h2>Perfil</h2>

      <div class="profile-hero card">
        <div class="profile-avatar-wrap" id="avatar-wrap">
          ${avatarHTML(u, 72)}
          <div class="avatar-edit-badge">📷</div>
        </div>
        <div style="text-align:center">
          <p class="profile-name">${u.name}</p>
          <p class="profile-role">${role==='professional' ? getCategoryLabel(p?.category) : p?.businessName||''}</p>
          ${role==='professional' ? lvlBadge(p?.level||'ACESSO') : ''}
        </div>
      </div>

      ${role==='professional' ? `
        <div class="card">
          <h3 style="margin-bottom:14px">Desempenho</h3>
          <div class="stats-grid">
            ${statCard('🎪',p?.totalEvents||0,'Eventos')}
            ${statCard('⭐',p?.averageRating?p.averageRating.toFixed(1):'—','Média')}
            ${statCard('🏆',p?.noShows||0,'No-shows')}
          </div>
          <div style="margin-top:16px">
            <p style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Por pilar</p>
            ${[['punctuality','Pontualidade'],['presentation','Apresentação'],['technique','Técnica']].map(([k,l])=>`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${l}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:.82rem;color:var(--yellow);font-weight:600">${p?.ratings?.[k]?p.ratings[k].toFixed(1):'—'}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px">Avaliações recebidas ${reviews.length?`(${reviews.length})`:''}</h3>
          ${reviews.length ? `<div style="display:flex;flex-direction:column;gap:12px">
            ${reviews.map(r=>`
              <div class="review-item">
                <div class="review-item-top">
                  <span class="review-stars">${'★'.repeat(Math.round(r.average))}${'☆'.repeat(5-Math.round(r.average))}</span>
                  <span class="review-avg">${r.average?.toFixed(1)||'—'}</span>
                </div>
                ${r.comment?`<p class="review-comment">"${r.comment}"</p>`:''}
                <div class="review-pilares">
                  <span>Pontual. ${r.punctuality}</span>
                  <span>Apres. ${r.presentation}</span>
                  <span>Técnica ${r.technique}</span>
                </div>
                <p class="review-date">${fmtDate(r.createdAt)}</p>
              </div>`).join('')}
          </div>` : `<p style="font-size:.82rem;color:var(--muted)">Você ainda não recebeu avaliações. Elas aparecerão aqui após concluir eventos.</p>`}
        </div>
      ` : ''}

      <button class="btn btn-ghost btn-full" id="btn-toggle-edit" style="justify-content:space-between">
        <span>✏️ Editar dados</span>
        <span id="edit-chevron">▾</span>
      </button>

      <div class="card" id="edit-card" style="display:none">
        <form id="form-profile" class="form-stack">
          <div class="field"><label>Nome</label>
            <input id="prf-name" value="${u.name||''}" required /></div>
          <div class="field"><label>WhatsApp</label>
            <input id="prf-phone" type="tel" value="${u.phone||''}" placeholder="(14) 99999-9999" /></div>
          ${role==='professional' ? `
            <div class="field"><label>Especialidade</label>
              <select id="prf-category">
                ${CATEGORIES.map(c=>`<option value="${c.id}" ${p?.category===c.id?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
              </select></div>
            <div class="field"><label>Bio</label>
              <textarea id="prf-bio" placeholder="Sua experiência...">${p?.bio||''}</textarea></div>
          ` : `
            <div class="field"><label>Nome do estabelecimento</label>
              <input id="prf-business" value="${p?.businessName||''}" /></div>
          `}
          <div id="prf-ok" class="alert alert-success" style="display:none">Perfil atualizado!</div>
          <button class="btn btn-primary btn-full" type="submit" id="btn-save">Salvar alterações</button>
        </form>
      </div>

      <div class="card" style="padding:4px 8px;display:flex;flex-direction:column;gap:4px">
        <button class="btn btn-ghost btn-full" id="btn-logout-profile" style="color:var(--red);border-color:rgba(204,71,46,.3)">
          Sair da conta
        </button>
        <button class="btn btn-ghost btn-full" id="btn-delete-account" style="color:var(--muted);font-size:.78rem;border:none">
          Excluir minha conta
        </button>
      </div>
    `;

    // ── Foto de perfil ──
    const avatarWrap = $('#avatar-wrap');

    // Toque na imagem: se tem foto mostra lightbox, se nao tem abre upload
    avatarWrap.addEventListener('click', () => {
      if (STATE.userData.photoURL) {
        // Mostra menu: ver / trocar / remover
        openPhotoMenu(u);
      } else {
        startPhotoUpload();
      }
    });

    async function startPhotoUpload() {
      const wrap = $('#avatar-wrap');
      if (!wrap) return;
      const badge = wrap.querySelector('.avatar-edit-badge');
      if (badge) badge.textContent = '⏳';
      wrap.style.opacity = '.6';

      const url = await handlePhotoUpload(STATE.user.uid, (msg) => {
        toast(msg);
      });

      if (url) {
        STATE.userData.photoURL = url;
        if (wrap) {
          wrap.innerHTML = avatarHTML(STATE.userData, 72) + '<div class="avatar-edit-badge">📷</div>';
        }
        toast('Foto atualizada!');
      } else {
        if (wrap) {
          wrap.style.opacity = '1';
          const b = wrap.querySelector('.avatar-edit-badge');
          if (b) b.textContent = '📷';
        }
      }
      if (wrap) wrap.style.opacity = '1';
    }

    function openPhotoMenu(userData) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <p style="text-align:center;font-weight:700;margin-bottom:16px">Foto de perfil</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-ghost btn-full" id="pmv-view">👁 Ver foto</button>
            <button class="btn btn-ghost btn-full" id="pmv-change">📷 Trocar foto</button>
            <button class="btn btn-ghost btn-full" id="pmv-remove" style="color:#e06060;border-color:rgba(224,96,96,.3)">🗑 Remover foto</button>
            <button class="btn btn-ghost btn-full" id="pmv-cancel">Cancelar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      $('#pmv-cancel', modal).addEventListener('click', () => modal.remove());
      $('#pmv-view',   modal).addEventListener('click', () => {
        modal.remove();
        viewPhoto(userData.photoURL, userData.name);
      });
      $('#pmv-change', modal).addEventListener('click', () => {
        modal.remove();
        startPhotoUpload();
      });
      $('#pmv-remove', modal).addEventListener('click', async () => {
        modal.remove();
        const wrap = $('#avatar-wrap');
        if (wrap) wrap.style.opacity = '.5';
        toast('Removendo foto...');
        await removeProfilePhoto(STATE.user.uid);
        STATE.userData.photoURL = null;
        if (wrap) {
          wrap.innerHTML = avatarHTML(STATE.userData, 72) + '<div class="avatar-edit-badge">📷</div>';
          wrap.style.opacity = '1';
        }
        toast('Foto removida.');
      });
    }

    $('#btn-toggle-edit').addEventListener('click', () => {
      const card = $('#edit-card');
      const open = card.style.display === 'none';
      card.style.display = open ? 'block' : 'none';
      $('#edit-chevron').textContent = open ? '▴' : '▾';
    });

    $('#form-profile').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#btn-save');
      btn.disabled = true; btn.textContent = '...';
      await updateUser(STATE.user.uid, { name:$('#prf-name').value, phone:$('#prf-phone').value });
      STATE.userData.name = $('#prf-name').value;
      if (role==='professional') {
        await updateProfessional(STATE.user.uid, { name:$('#prf-name').value, category:$('#prf-category')?.value, bio:$('#prf-bio')?.value });
      } else {
        await updateEmployer(STATE.user.uid, { businessName:$('#prf-business')?.value });
      }
      $('#prf-ok').style.display = 'block';
      btn.disabled = false; btn.textContent = 'Salvar alterações';
      setTimeout(()=>{ $('#prf-ok').style.display='none'; },3000);
    });

    $('#btn-logout-profile').addEventListener('click', async () => {
      await logoutUser();
    });

    $('#btn-delete-account').addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <h3 style="margin-bottom:8px">Excluir conta</h3>
          <p style="font-size:.84rem;color:var(--muted);margin-bottom:20px">
            Essa ação é permanente e não pode ser desfeita. Todos os seus dados serão removidos.
          </p>
          <div class="field">
            <label>Confirme sua senha para continuar</label>
            <input id="confirm-pw" type="password" placeholder="••••••••" />
          </div>
          <div id="delete-error" class="alert alert-error" style="display:none;margin-top:10px"></div>
          <div style="display:flex;gap:10px;margin-top:20px">
            <button class="btn btn-ghost btn-full" id="btn-cancel-delete">Cancelar</button>
            <button class="btn btn-full" id="btn-confirm-delete" style="background:#7a2020;color:var(--cream)">
              Excluir conta
            </button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      $('#btn-cancel-delete', modal).addEventListener('click', () => modal.remove());

      $('#btn-confirm-delete', modal).addEventListener('click', async () => {
        const pw = $('#confirm-pw', modal).value;
        if (!pw) {
          $('#delete-error', modal).textContent = 'Digite sua senha para confirmar.';
          $('#delete-error', modal).style.display = 'block';
          return;
        }
        const btn = $('#btn-confirm-delete', modal);
        btn.disabled = true; btn.textContent = '...';
        try {
          // Re-autenticar antes de deletar (exigido pelo Firebase)
          const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } =
            await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
          const credential = EmailAuthProvider.credential(STATE.user.email, pw);
          await reauthenticateWithCredential(STATE.user, credential);
          // Deletar documentos do Firestore
          const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
          await deleteDoc(doc(db, 'users', STATE.user.uid));
          if (STATE.userData.role === 'professional') await deleteDoc(doc(db, 'professionals', STATE.user.uid)).catch(()=>{});
          if (STATE.userData.role === 'employer')     await deleteDoc(doc(db, 'employers',     STATE.user.uid)).catch(()=>{});
          // Deletar conta do Firebase Auth
          await deleteUser(STATE.user);
          modal.remove();
        } catch (err) {
          const msgs = {
            'auth/wrong-password':     'Senha incorreta.',
            'auth/invalid-credential': 'Senha incorreta.',
            'auth/too-many-requests':  'Muitas tentativas. Aguarde um momento.',
          };
          $('#delete-error', modal).textContent = msgs[err.code] || 'Erro ao excluir. Tente novamente.';
          $('#delete-error', modal).style.display = 'block';
          btn.disabled = false; btn.textContent = 'Excluir conta';
        }
      });
    });
  } catch (err) {
    console.error('loadProfile error:', err);
    sec.innerHTML = errState('Erro ao carregar perfil: ' + (err?.message || err));
  }
}

// ─── ADMIN ───────────────────────────────────────────────────
let _unsubUsers, _unsubJobs;
async function loadAdmin() {
  const sec = $('#sec-admin');
  sec.innerHTML = loader();
  try {
    const stats = await getAdminStats();
    sec.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><h2>Painel Admin</h2><p style="font-size:.78rem;color:var(--muted)">Visão em tempo real</p></div>
        <div class="live-dot-wrap"><span class="live-dot"></span>Ao vivo</div>
      </div>
      <div class="admin-metrics">
        ${metricCard('👥','Usuários',stats.totalUsers,'')}
        ${metricCard('👤','Profissionais',stats.totalProfessionals,'green')}
        ${metricCard('🏢','Contratantes',stats.totalEmployers,'yellow')}
        ${metricCard('📋','Abertas',stats.openJobs,'red')}
        ${metricCard('📊','Total vagas',stats.totalJobs,'')}
        ${metricCard('✅','Concluídas',stats.completedJobs,'green')}
      </div>
      <div class="card">
        <h3 style="margin-bottom:14px">Usuários recentes <span class="live-dot-wrap" style="font-size:.65rem;padding:3px 8px;margin-left:8px"><span class="live-dot"></span>Live</span></h3>
        <div style="overflow-x:auto"><table class="admin-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Cadastro</th></tr></thead>
          <tbody id="admin-users-body"></tbody>
        </table></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:14px">Vagas recentes <span class="live-dot-wrap" style="font-size:.65rem;padding:3px 8px;margin-left:8px"><span class="live-dot"></span>Live</span></h3>
        <div style="overflow-x:auto"><table class="admin-table">
          <thead><tr><th>Vaga</th><th>Status</th><th>Data</th></tr></thead>
          <tbody id="admin-jobs-body"></tbody>
        </table></div>
      </div>
      <div class="card" style="padding:4px 8px">
        <button class="btn btn-ghost btn-full" id="btn-admin-logout" style="color:var(--red);border-color:rgba(204,71,46,.3)">Sair da conta</button>
      </div>
    `;
    $('#btn-admin-logout')?.addEventListener('click', () => logoutUser());

    const rCol = { professional:'#4aa050', employer:'var(--yellow)', admin:'var(--red)' };
    const rLbl = { professional:'Profissional', employer:'Contratante', admin:'Admin' };
    const sCol = { open:'#4aa050', filled:'var(--yellow)', completed:'var(--muted)', cancelled:'#e06060' };
    const sLbl = { open:'Aberta', filled:'Confirmada', completed:'Concluída', cancelled:'Cancelada' };

    _unsubUsers?.(); _unsubJobs?.();
    _unsubUsers = listenCollection('users', docs => {
      const tb = $('#admin-users-body'); if (!tb) return;
      const sorted = docs.sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0));
      tb.innerHTML = sorted.slice(0,10).map(u=>`<tr>
        <td style="font-weight:500">${u.name||'—'}</td>
        <td style="color:${rCol[u.role]};font-weight:700;font-size:.75rem">${rLbl[u.role]||u.role}</td>
        <td style="color:var(--muted);font-size:.75rem">${fmtDate(u.createdAt)}</td>
      </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">Nenhum usuário</td></tr>`;
    });
    _unsubJobs = listenCollection('jobs', docs => {
      const tb = $('#admin-jobs-body'); if (!tb) return;
      const sorted = docs.sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0));
      tb.innerHTML = sorted.slice(0,10).map(j=>`<tr>
        <td style="font-weight:500">${j.title||'—'}</td>
        <td style="color:${sCol[j.status]};font-weight:700;font-size:.75rem">${sLbl[j.status]||j.status}</td>
        <td style="color:var(--muted);font-size:.75rem">${fmtDate(j.createdAt)}</td>
      </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">Nenhuma vaga</td></tr>`;
    });
  } catch { sec.innerHTML = errState('Erro ao carregar painel.'); }
}
function metricCard(icon,label,value,color){
  return `<div class="metric-card"><span class="metric-icon">${icon}</span><span class="metric-val ${color}">${value}</span><span class="metric-lbl">${label}</span></div>`;
}

// ─── SHARED UI BUILDERS ───────────────────────────────────────
function loader() { return `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`; }
function errState(msg) { return `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>${msg}</h3></div>`; }
function emptyState(icon,title,desc='',action='') {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><h3>${title}</h3>${desc?`<p>${desc}</p>`:''}${action}</div>`;
}
function statCard(icon,val,lbl,hl=false) {
  return `<div class="stat-card ${hl?'hl':''}"><span class="stat-icon">${icon}</span><span class="stat-val">${val}</span><span class="stat-lbl">${lbl}</span></div>`;
}

// ─── CHAT UI ─────────────────────────────────────────────────
let _unsubChat = null;
function openChat(jobId, employerUid, profUid, meta = {}) {
  const chatId = getChatId(jobId, profUid);
  const otherName = meta.otherName || 'Conversa';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay chat-overlay';
  modal.innerHTML = `
    <div class="chat-sheet">
      <div class="chat-header">
        <button class="chat-close" id="chat-close">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div class="chat-header-info">
          <p class="chat-header-name">${otherName}</p>
          <p class="chat-header-sub">${meta.jobTitle || ''}</p>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="loading-center"><div class="spinner"></div></div>
      </div>
      <form class="chat-input-bar" id="chat-form">
        <input id="chat-input" placeholder="Escreva uma mensagem..." autocomplete="off" />
        <button type="submit" class="chat-send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>`;
  document.body.appendChild(modal);

  const close = async () => {
    if (_unsubChat) { _unsubChat(); _unsubChat = null; }
    modal.remove();
  };
  $('#chat-close', modal).addEventListener('click', close);

  // Garante que o chat existe e começa a escutar mensagens
  (async () => {
    await ensureChat(jobId, employerUid, profUid, meta);
    const box = $('#chat-messages', modal);
    _unsubChat = listenMessages(chatId, (msgs) => {
      if (!msgs.length) {
        box.innerHTML = `<div class="chat-empty">Nenhuma mensagem ainda.<br>Combine os detalhes do evento por aqui.</div>`;
        return;
      }
      box.innerHTML = msgs.map(m => {
        const mine = m.senderUid === STATE.user.uid;
        const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        return `<div class="chat-bubble ${mine?'mine':'theirs'}">
          <span class="chat-text">${escapeHtml(m.text)}</span>
          <span class="chat-time">${time}</span>
        </div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
    });
  })();

  $('#chat-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#chat-input', modal);
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await sendMessage(chatId, STATE.user.uid, text);
  });
}


// ─── IMAGE UTILS ──────────────────────────────────────────────

/**
 * Converte um File/Blob de imagem para WebP usando Canvas.
 * maxSize: dimensão máxima (largura ou altura) em pixels.
 * quality: 0-1, onde 0.8 = 80%.
 */
function imageToWebP(file, maxSize = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Calcula dimensões mantendo proporção
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      else if (h > maxSize)     { w = Math.round(w * maxSize / h); h = maxSize; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao converter imagem.'));
      }, 'image/webp', quality);
    };
    img.onerror = () => reject(new Error('Imagem invalida.'));
    img.src = url;
  });
}

/**
 * Abre um lightbox simples para visualizar uma foto em tela cheia.
 */
function viewPhoto(url, name = '') {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:20px;cursor:pointer;
  `;
  overlay.innerHTML = `
    <img src="${url}" alt="${escapeHtml(name)}"
      style="max-width:100%;max-height:80vh;border-radius:12px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.6)">
    ${name ? `<p style="color:#fff;margin-top:14px;font-family:var(--font);font-size:.9rem;opacity:.7">${escapeHtml(name)}</p>` : ''}
    <button style="position:absolute;top:calc(env(safe-area-inset-top)+16px);right:16px;
      background:rgba(255,255,255,.15);border:none;border-radius:50%;width:36px;height:36px;
      cursor:pointer;color:#fff;font-size:1.2rem;display:flex;align-items:center;justify-content:center">✕</button>
  `;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

/**
 * Abre o seletor de arquivo, converte para WebP e faz upload.
 * Retorna a URL pública ou null se cancelado.
 */
async function handlePhotoUpload(uid, onProgress) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files[0];
      document.body.removeChild(input);
      if (!file) { resolve(null); return; }

      try {
        onProgress?.('Convertendo...');
        const webpBlob = await imageToWebP(file, 400, 0.8);
        onProgress?.('Enviando...');
        const url = await uploadProfilePhoto(uid, webpBlob);
        resolve(url);
      } catch (err) {
        console.error('Photo upload error:', err);
        toast('Erro ao enviar foto: ' + (err.message || err), 'red');
        resolve(null);
      }
    });

    // iOS/Safari: must append before click
    setTimeout(() => input.click(), 50);
  });
}

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// ─── ERROR MESSAGES ───────────────────────────────────────────
function friendlyErr(code) {
  return ({
    'auth/user-not-found':     'Nenhuma conta com esse e-mail.',
    'auth/wrong-password':     'Senha incorreta.',
    'auth/invalid-email':      'E-mail inválido.',
    'auth/too-many-requests':  'Muitas tentativas. Tente mais tarde.',
    'auth/email-already-in-use':'E-mail já cadastrado.',
    'auth/weak-password':      'Senha muito fraca.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
  })[code] || 'Erro. Tente novamente.';
}
