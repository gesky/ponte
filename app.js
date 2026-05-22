// ============================================================
// PONTE — App Principal
// Estado global, navegação, renderização de todas as seções.
// ============================================================

import {
  auth, db,
  registerUser, loginUser, logoutUser, resetPw, onAuthChange,
  getUser, updateUser,
  getProfessional, updateProfessional, getProfessionals,
  getEmployer, updateEmployer,
  createJob, getJob, updateJob, getOpenJobs, getJobsByEmployer,
  applyToJob, getApplicationsByJob, getApplicationsByProfessional, updateApplication,
  createReview, getReviewsByProfessional,
  getAdminStats, listenCollection,
  LEVELS, CATEGORIES, BUSINESS_TYPES,
  getCategoryIcon, getCategoryLabel, fmtDate,
} from './firebase.js';

// ─── STATE ───────────────────────────────────────────────────
let STATE = {
  user: null,       // Firebase Auth user
  userData: null,   // Firestore /users doc
  profile: null,    // /professionals or /employers doc
  activeSection: null,
  jobDetail: null,  // job being viewed
  reviewJob: null,  // job being reviewed
};

// ─── UTILS ───────────────────────────────────────────────────

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let toastTimer;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

function lvlBadge(level) {
  const l = LEVELS[level] || LEVELS.ACESSO;
  return `<span class="lvl-badge ${l.cls}">${l.label}</span>`;
}

function statusPill(status) {
  const map = { open:'Aberta', filled:'Confirmada', completed:'Concluída', cancelled:'Cancelada' };
  return `<span class="status-pill status-${status}">${map[status] || status}</span>`;
}

function buildStars(value = 0, name, readonly = false) {
  return [1,2,3,4,5].map(i => `
    <button class="star ${i <= value ? 'on' : ''}"
      data-val="${i}" data-name="${name}"
      ${readonly ? 'disabled' : ''}
      type="button">★</button>
  `).join('');
}

function initStarGroups(container) {
  $$('.star', container).forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const val  = +btn.dataset.val;
      $$(`[data-name="${name}"]`, container).forEach(s => {
        s.classList.toggle('on', +s.dataset.val <= val);
      });
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

  // Carregar dados da seção
  const loaders = {
    inicio:         loadHome,
    vagas:          loadJobs,
    'minhas-vagas': loadMyApplications,
    'publicar-vaga':loadPublishJob,
    equipe:         loadTeam,
    perfil:         loadProfile,
    admin:          loadAdmin,
  };
  loaders[section]?.();
}

// ─── AUTH FLOW ───────────────────────────────────────────────

onAuthChange(async (user) => {
  if (user) {
    STATE.user = user;
    STATE.userData = await getUser(user.uid);

    if (!STATE.userData) { await logoutUser(); return; }

    const role = STATE.userData.role;
    if (role === 'professional') STATE.profile = await getProfessional(user.uid);
    else if (role === 'employer') STATE.profile = await getEmployer(user.uid);

    // Mostrar navegação correta
    buildNav(role);
    updateHeaderUser();

    if (role === 'admin') showApp('admin');
    else showApp('inicio');
  } else {
    STATE.user = STATE.userData = STATE.profile = null;
    showAuthPage('page-login');
  }
});

function updateHeaderUser() {
  const el = $('.header-user');
  if (el) el.textContent = STATE.userData?.name?.split(' ')[0] || '';
}

// ─── NAV ─────────────────────────────────────────────────────

const NAV = {
  professional: [
    { sec:'inicio',         icon: iconHome(),    label:'Início' },
    { sec:'vagas',          icon: iconSearch(),  label:'Vagas' },
    { sec:'minhas-vagas',   icon: iconJobs(),    label:'Minhas' },
    { sec:'perfil',         icon: iconUser(),    label:'Perfil' },
  ],
  employer: [
    { sec:'inicio',         icon: iconHome(),    label:'Início' },
    { sec:'publicar-vaga',  icon: iconPlus(),    label:'Publicar' },
    { sec:'equipe',         icon: iconTeam(),    label:'Equipe' },
    { sec:'perfil',         icon: iconUser(),    label:'Perfil' },
  ],
  admin: [
    { sec:'admin',          icon: iconShield(),  label:'Dashboard' },
  ],
};

function buildNav(role) {
  const nav = $('.bottom-nav');
  nav.innerHTML = (NAV[role] || []).map(n => `
    <button class="nav-item" data-sec="${n.sec}">
      ${n.icon}
      <span>${n.label}</span>
    </button>
  `).join('');
  $$('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => showApp(btn.dataset.sec))
  );
}

// SVG icons
function iconHome()   { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`; }
function iconSearch() { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28.79-.01 5 5-1.5 1.5-5-5zm-6 0C7 14 5 12 5 9.5S7 5 9.5 5 14 7 14 9.5 12 14 9.5 14z"/></svg>`; }
function iconJobs()   { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.86.18-1a3 3 0 0 0-6 0c0 .14.11.56.18 1H10V4H4v6h16V6zm0 4H4v10h16V10z"/></svg>`; }
function iconPlus()   { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`; }
function iconTeam()   { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`; }
function iconUser()   { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`; }
function iconShield() { return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`; }
function iconBack()   { return `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`; }

// ─── LOGIN PAGE ───────────────────────────────────────────────

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-login');
  btn.disabled = true; btn.textContent = '...';
  try {
    await loginUser($('#login-email').value, $('#login-pw').value);
  } catch (err) {
    $('#login-error').textContent = friendlyAuthError(err.code);
    $('#login-error').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});
$('#link-to-register').addEventListener('click', () => showAuthPage('page-register'));
$('#link-forgot').addEventListener('click', async () => {
  const email = $('#login-email').value;
  if (!email) { toast('Digite seu e-mail primeiro', 'red'); return; }
  await resetPw(email);
  toast('E-mail de recuperação enviado!');
});

// ─── REGISTER PAGE ───────────────────────────────────────────

$('#link-to-login').addEventListener('click', () => showAuthPage('page-login'));

let selectedRole = null;
$$('.role-card').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRole = btn.dataset.role;
    $('#reg-step1').style.display = 'none';
    $('#form-register').style.display = 'flex';
    // Mostrar campos condicionais
    $('#reg-fields-professional').style.display = selectedRole === 'professional' ? 'flex' : 'none';
    $('#reg-fields-employer').style.display = selectedRole === 'employer' ? 'flex' : 'none';
  });
});
$('#btn-reg-back').addEventListener('click', () => {
  $('#reg-step1').style.display = 'flex';
  $('#form-register').style.display = 'none';
});

$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-register');
  const pw  = $('#reg-pw').value;
  const pw2 = $('#reg-pw2').value;
  if (pw !== pw2) { $('#reg-error').textContent = 'Senhas não coincidem.'; $('#reg-error').style.display='block'; return; }
  if (pw.length < 6) { $('#reg-error').textContent = 'Senha mínima: 6 caracteres.'; $('#reg-error').style.display='block'; return; }
  btn.disabled = true; btn.textContent = '...';
  try {
    await registerUser($('#reg-email').value, pw, $('#reg-name').value, selectedRole, {
      phone:        $('#reg-phone').value,
      category:     $('#reg-category')?.value,
      businessName: $('#reg-business-name')?.value,
      businessType: $('#reg-business-type')?.value,
    });
  } catch (err) {
    $('#reg-error').textContent = friendlyAuthError(err.code);
    $('#reg-error').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Criar conta';
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────

$('#btn-logout').addEventListener('click', async () => {
  await logoutUser();
  showAuthPage('page-login');
});

// ─── HOME ────────────────────────────────────────────────────

async function loadHome() {
  const role = STATE.userData?.role;
  if (role === 'professional') renderProfHome();
  else if (role === 'employer') renderEmployerHome();
}

async function renderProfHome() {
  const sec = $('#sec-inicio');
  sec.innerHTML = `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`;

  const [prof, jobs] = await Promise.all([
    getProfessional(STATE.user.uid),
    getOpenJobs(5)
  ]);
  STATE.profile = prof;
  const lvl = LEVELS[prof?.level || 'ACESSO'];

  sec.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <div>
        <p style="font-size:.82rem;color:var(--muted)">Olá,</p>
        <h2 style="font-size:1.8rem;font-weight:800;line-height:1.1">${STATE.userData.name.split(' ')[0]}</h2>
        <p style="font-size:.78rem;color:var(--red);margin-top:3px;opacity:1">${getCategoryLabel(prof?.category)}</p>
      </div>
      ${lvlBadge(prof?.level || 'ACESSO')}
    </div>

    <div class="card card-sm">
      <div class="toggle-wrap">
        <div>
          <p style="font-size:.9rem;font-weight:600">Disponível para trabalhar</p>
          <p style="font-size:.75rem;color:var(--muted);margin-top:3px;max-width:220px">
            ${prof?.isAvailable ? 'Você aparece para contratantes.' : 'Você está invisível no momento.'}
          </p>
        </div>
        <button class="toggle ${prof?.isAvailable ? 'on' : ''}" id="toggle-avail"></button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><span class="stat-icon">🎪</span><span class="stat-val">${prof?.totalEvents||0}</span><span class="stat-lbl">Eventos</span></div>
      <div class="stat-card"><span class="stat-icon">⭐</span><span class="stat-val">${prof?.averageRating ? prof.averageRating.toFixed(1) : '—'}</span><span class="stat-lbl">Média</span></div>
      <div class="stat-card hl"><span class="stat-icon">${lvl.label.split(' ')[0]}</span><span class="stat-val" style="font-size:.85rem">${lvl.label.replace(/^[^ ]+ /,'')}</span><span class="stat-lbl">Nível</span></div>
    </div>

    <div>
      <div class="sec-header">
        <h3>Vagas disponíveis</h3>
        <button class="see-all" id="see-all-jobs">Ver todas →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px" id="home-jobs-list">
        ${jobs.length === 0
          ? `<div class="empty-state"><span class="empty-icon">📭</span><h3>Nenhuma vaga agora</h3></div>`
          : jobs.map(j => jobCardHTML(j)).join('')
        }
      </div>
    </div>
  `;

  // Toggle disponibilidade
  $('#toggle-avail').addEventListener('click', async function() {
    const newVal = !prof.isAvailable;
    prof.isAvailable = newVal;
    this.classList.toggle('on', newVal);
    await updateProfessional(STATE.user.uid, { isAvailable: newVal });
    toast(newVal ? 'Você está disponível!' : 'Você está invisível agora.');
  });

  $('#see-all-jobs').addEventListener('click', () => showApp('vagas'));

  $$('.job-card', sec).forEach(card =>
    card.addEventListener('click', () => openJobDetail(card.dataset.id))
  );
}

async function renderEmployerHome() {
  const sec = $('#sec-inicio');
  sec.innerHTML = `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`;

  const jobs = await getJobsByEmployer(STATE.user.uid);
  const active = jobs.filter(j => j.status === 'open' || j.status === 'filled');
  const done   = jobs.filter(j => j.status === 'completed');

  sec.innerHTML = `
    <div>
      <p style="font-size:.82rem;color:var(--muted)">Olá,</p>
      <h2 style="font-size:1.8rem;font-weight:800;line-height:1.1">${STATE.userData.name.split(' ')[0]}</h2>
      <p style="font-size:.78rem;color:var(--yellow);margin-top:3px;opacity:1">${STATE.profile?.businessName || ''}</p>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary btn-full btn-lg" id="btn-go-publish">+ Publicar nova vaga</button>
      <button class="btn btn-ghost btn-full" id="btn-go-team">👥 Minha equipe fixa</button>
    </div>

    <div style="display:flex;gap:10px">
      <div class="stat-card" style="flex:1"><span class="stat-icon">📋</span><span class="stat-val" style="color:var(--red)">${active.length}</span><span class="stat-lbl">Ativas</span></div>
      <div class="stat-card" style="flex:1"><span class="stat-icon">✅</span><span class="stat-val">${done.length}</span><span class="stat-lbl">Concluídas</span></div>
      <div class="stat-card" style="flex:1"><span class="stat-icon">📊</span><span class="stat-val">${jobs.length}</span><span class="stat-lbl">Total</span></div>
    </div>

    <div>
      <div class="sec-header"><h3>Vagas recentes</h3></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        ${jobs.length === 0
          ? `<div class="empty-state"><span class="empty-icon">📋</span><h3>Nenhuma vaga publicada</h3><p>Publique sua primeira vaga agora.</p></div>`
          : jobs.slice(0,5).map(j => `
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
          `).join('')
        }
      </div>
    </div>
  `;

  $('#btn-go-publish').addEventListener('click', () => showApp('publicar-vaga'));
  $('#btn-go-team').addEventListener('click', () => showApp('equipe'));
  $$('.job-card', sec).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
}

// ─── JOB CARD HTML ───────────────────────────────────────────

function jobCardHTML(j) {
  return `
    <button class="job-card" data-id="${j.id}">
      <div class="job-card-left">
        <span class="job-icon">${getCategoryIcon(j.category)}</span>
        <div>
          <p class="job-title">${j.title}</p>
          <p class="job-meta">${j.businessName||''} · ${j.date ? new Date(j.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—'}</p>
        </div>
      </div>
      <div class="job-card-right">
        <p class="job-pay">R$ ${j.pay||'—'}</p>
        <p class="job-time">${j.startTime||''}–${j.endTime||''}</p>
      </div>
    </button>
  `;
}

// ─── BROWSE JOBS (profissional) ───────────────────────────────

async function loadJobs() {
  const sec = $('#sec-vagas');
  sec.innerHTML = `
    <div>
      <h2>Vagas disponíveis</h2>
      <p style="font-size:.8rem;color:var(--muted)">Bauru, SP</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="filter-cats">
      <button class="btn btn-sm ${'' === (sec.dataset.filter||'') ? 'btn-primary' : 'btn-ghost'}" data-cat="">Todas</button>
      ${CATEGORIES.map(c => `
        <button class="btn btn-sm btn-ghost" data-cat="${c.id}">${c.icon} ${c.label}</button>
      `).join('')}
    </div>
    <div id="jobs-list" style="display:flex;flex-direction:column;gap:8px">
      <div class="loading-center"><div class="spinner"></div></div>
    </div>
  `;

  const renderJobs = async (cat = '') => {
    const list = $('#jobs-list');
    list.innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
    const jobs = await getOpenJobs(30);
    const filtered = cat ? jobs.filter(j => j.category === cat) : jobs;
    list.innerHTML = filtered.length === 0
      ? `<div class="empty-state"><span class="empty-icon">🔍</span><h3>Nenhuma vaga encontrada</h3></div>`
      : filtered.map(j => jobCardHTML(j)).join('');
    $$('.job-card', list).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
  };

  $$('[data-cat]', sec).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-cat]', sec).forEach(b => b.className = 'btn btn-sm btn-ghost');
      btn.className = 'btn btn-sm btn-primary';
      renderJobs(btn.dataset.cat);
    });
  });

  renderJobs();
}

// ─── JOB DETAIL ──────────────────────────────────────────────

async function openJobDetail(jobId) {
  const sec = $('#sec-vagas') || $('#sec-inicio');
  const activeSecId = `sec-${STATE.activeSection}`;
  const container = $(`#${activeSecId}`);

  const job = await getJob(jobId);
  STATE.jobDetail = job;
  const role = STATE.userData.role;

  // Verificar se profissional já candidatou
  let alreadyApplied = false;
  let myApplication = null;
  let applications = [];

  if (role === 'professional') {
    const apps = await getApplicationsByProfessional(STATE.user.uid);
    myApplication = apps.find(a => a.jobId === jobId);
    alreadyApplied = !!myApplication;
  } else {
    applications = await getApplicationsByJob(jobId);
  }

  const prevContent = container.innerHTML;

  container.innerHTML = `
    <button class="detail-back" id="btn-detail-back">${iconBack()} Voltar</button>

    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px">
        <div>
          <span style="font-size:2rem">${getCategoryIcon(job.category)}</span>
          <h2 style="margin-top:6px">${job.title}</h2>
          <p style="font-size:.82rem;color:var(--muted);margin-top:2px;opacity:1">${job.businessName || '—'}</p>
        </div>
        ${statusPill(job.status)}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        ${infoChip('📅', job.date ? new Date(job.date).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long'}) : '—')}
        ${infoChip('🕐', `${job.startTime||'—'} – ${job.endTime||'—'}`)}
        ${infoChip('📍', job.address || 'Bauru, SP')}
        ${infoChip('💰', `R$ ${job.pay||'—'}`)}
      </div>

      ${job.description ? `<p style="font-size:.85rem;line-height:1.6;border-top:1px solid var(--border);padding-top:14px">${job.description}</p>` : ''}
    </div>

    ${role === 'professional' ? `
      <button class="btn ${alreadyApplied ? 'btn-ghost' : 'btn-primary'} btn-full btn-lg"
        id="btn-apply" ${alreadyApplied || job.status !== 'open' ? 'disabled' : ''}>
        ${alreadyApplied ? '✓ Candidatura enviada' : job.status !== 'open' ? 'Vaga encerrada' : 'Me candidatar'}
      </button>
    ` : ''}

    ${role === 'employer' && applications.length > 0 ? `
      <div>
        <h3 style="margin-bottom:10px">Candidatos (${applications.length})</h3>
        <div style="display:flex;flex-direction:column;gap:8px" id="applicants-list">
          ${applications.map(a => `
            <div class="card card-sm" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <div>
                <p style="font-weight:600;font-size:.9rem">${a.professionalName}</p>
                <p style="font-size:.72rem;color:var(--muted)">${fmtDate(a.createdAt)}</p>
              </div>
              <div style="display:flex;gap:6px">
                ${a.status === 'pending' ? `
                  <button class="btn btn-sm btn-green" data-app-id="${a.id}" data-action="accept">Confirmar</button>
                  <button class="btn btn-sm btn-ghost" data-app-id="${a.id}" data-action="reject">Recusar</button>
                ` : `<span class="status-pill status-${a.status === 'accepted' ? 'filled' : 'cancelled'}">${a.status === 'accepted' ? 'Confirmado' : 'Recusado'}</span>`}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${role === 'employer' && job.status === 'filled' ? `
      <button class="btn btn-yellow btn-full" id="btn-complete-job">Marcar como concluído</button>
    ` : ''}

    ${role === 'employer' && job.status === 'completed' && !job.reviewed ? `
      <button class="btn btn-primary btn-full" id="btn-review-job">Avaliar profissional</button>
    ` : ''}
  `;

  $('#btn-detail-back').addEventListener('click', () => {
    container.innerHTML = prevContent;
    $$('.job-card', container).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
    $$('[data-cat]', container).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-cat]', container).forEach(b => b.className = 'btn btn-sm btn-ghost');
        btn.className = 'btn btn-sm btn-primary';
      });
    });
  });

  $('#btn-apply')?.addEventListener('click', async () => {
    $('#btn-apply').disabled = true; $('#btn-apply').textContent = '...';
    await applyToJob(jobId, STATE.user.uid, STATE.userData.name);
    $('#btn-apply').textContent = '✓ Candidatura enviada';
    toast('Candidatura enviada com sucesso!');
  });

  $$('[data-action]', container).forEach(btn => {
    btn.addEventListener('click', async () => {
      const appId = btn.dataset.appId;
      const action = btn.dataset.action;
      await updateApplication(appId, { status: action === 'accept' ? 'accepted' : 'rejected' });
      if (action === 'accept') {
        await updateJob(jobId, { status: 'filled', confirmedProfessional: appId });
      }
      toast(action === 'accept' ? 'Profissional confirmado!' : 'Candidatura recusada.');
      openJobDetail(jobId);
    });
  });

  $('#btn-complete-job')?.addEventListener('click', async () => {
    await updateJob(jobId, { status: 'completed' });
    toast('Vaga marcada como concluída!');
    openJobDetail(jobId);
  });

  $('#btn-review-job')?.addEventListener('click', () => openReviewModal(job));
}

function infoChip(icon, text) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;display:flex;gap:6px;align-items:center;font-size:.8rem">
    <span>${icon}</span><span>${text}</span>
  </div>`;
}

// ─── MY APPLICATIONS (profissional) ──────────────────────────

async function loadMyApplications() {
  const sec = $('#sec-minhas-vagas');
  sec.innerHTML = `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`;

  const apps = await getApplicationsByProfessional(STATE.user.uid);

  if (apps.length === 0) {
    sec.innerHTML = `
      <h2>Minhas candidaturas</h2>
      <div class="empty-state"><span class="empty-icon">📋</span><h3>Nenhuma candidatura ainda</h3><p>Explore as vagas e candidate-se.</p>
      <button class="btn btn-primary" id="go-vagas">Ver vagas</button></div>
    `;
    $('#go-vagas').addEventListener('click', () => showApp('vagas'));
    return;
  }

  // Buscar dados das vagas
  const jobsData = await Promise.all(apps.map(a => getJob(a.jobId)));
  const jobMap = Object.fromEntries(jobsData.filter(Boolean).map(j => [j.id, j]));

  sec.innerHTML = `
    <h2>Minhas candidaturas</h2>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${apps.map(a => {
        const j = jobMap[a.jobId];
        if (!j) return '';
        const statusLabels = { pending:'Aguardando', accepted:'Confirmado ✓', rejected:'Recusado' };
        const statusColors = { pending:'var(--muted)', accepted:'var(--yellow)', rejected:'#e06060' };
        return `
          <button class="job-card" data-id="${j.id}">
            <div class="job-card-left">
              <span class="job-icon">${getCategoryIcon(j.category)}</span>
              <div>
                <p class="job-title">${j.title}</p>
                <p class="job-meta">${j.businessName||''} · ${j.date ? new Date(j.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—'}</p>
              </div>
            </div>
            <span style="font-size:.75rem;font-weight:700;color:${statusColors[a.status]}">${statusLabels[a.status]||a.status}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
  $$('.job-card', sec).forEach(c => c.addEventListener('click', () => openJobDetail(c.dataset.id)));
}

// ─── PUBLISH JOB (contratante) ────────────────────────────────

async function loadPublishJob() {
  const sec = $('#sec-publicar-vaga');
  sec.innerHTML = `
    <h2>Publicar vaga</h2>
    <form id="form-job" class="form-stack">
      <div class="field">
        <label>Título da vaga</label>
        <input id="job-title" placeholder="Ex: Garçom para casamento" required />
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="job-category" required>
          <option value="">Selecione...</option>
          ${CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Data</label>
          <input id="job-date" type="date" required />
        </div>
        <div class="field">
          <label>Início</label>
          <input id="job-start" type="time" required />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Término</label>
          <input id="job-end" type="time" required />
        </div>
        <div class="field">
          <label>Valor (R$)</label>
          <input id="job-pay" type="number" min="0" step="0.01" placeholder="150" required />
        </div>
      </div>
      <div class="field">
        <label>Endereço / local</label>
        <input id="job-address" placeholder="Rua das Flores, 123 — Bauru" />
      </div>
      <div class="field">
        <label>Descrição (opcional)</label>
        <textarea id="job-desc" placeholder="Detalhes do evento, uniforme exigido, etc."></textarea>
      </div>
      <div id="job-error" class="alert alert-error" style="display:none"></div>
      <button class="btn btn-primary btn-full btn-lg" type="submit" id="btn-publish">Publicar vaga</button>
    </form>
  `;

  // Data mínima = hoje
  $('#job-date').min = new Date().toISOString().split('T')[0];

  $('#form-job').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-publish');
    btn.disabled = true; btn.textContent = '...';
    try {
      await createJob({
        title:        $('#job-title').value,
        category:     $('#job-category').value,
        date:         $('#job-date').value,
        startTime:    $('#job-start').value,
        endTime:      $('#job-end').value,
        pay:          parseFloat($('#job-pay').value),
        address:      $('#job-address').value,
        description:  $('#job-desc').value,
        employerUid:  STATE.user.uid,
        businessName: STATE.profile?.businessName || STATE.userData.name,
      });
      toast('Vaga publicada com sucesso!');
      showApp('inicio');
    } catch (err) {
      $('#job-error').textContent = 'Erro ao publicar. Tente novamente.';
      $('#job-error').style.display = 'block';
      btn.disabled = false; btn.textContent = 'Publicar vaga';
    }
  });
}

// ─── REVIEW MODAL ────────────────────────────────────────────

function openReviewModal(job) {
  STATE.reviewJob = job;
  const modal = document.createElement('div');
  modal.id = 'modal-review';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;
    display:flex;align-items:flex-end;justify-content:center;
    padding:0 0 env(safe-area-inset-bottom);
  `;
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:24px 24px 0 0;padding:28px 20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
      <h3 style="margin-bottom:4px">Avaliar profissional</h3>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:20px">${job.title}</p>

      <div id="review-form" data-punctuality="0" data-presentation="0" data-technique="0">
        <div class="pilar-row">
          <p class="pilar-label">Pontualidade & Comprometimento</p>
          <p class="pilar-desc">Chegou no horário? Ficou até o fim?</p>
          <div class="stars" style="margin-top:8px">${buildStars(0,'punctuality')}</div>
        </div>
        <div class="pilar-row">
          <p class="pilar-label">Apresentação & Postura</p>
          <p class="pilar-desc">Traje, higiene e relação com os convidados</p>
          <div class="stars" style="margin-top:8px">${buildStars(0,'presentation')}</div>
        </div>
        <div class="pilar-row">
          <p class="pilar-label">Técnica</p>
          <p class="pilar-desc">Domínio e qualidade de execução da função</p>
          <div class="stars" style="margin-top:8px">${buildStars(0,'technique')}</div>
        </div>
        <div class="field" style="margin-top:16px">
          <label>Comentário (opcional)</label>
          <textarea id="review-comment" placeholder="Deixe um feedback para o profissional..."></textarea>
        </div>
        <div id="review-error" class="alert alert-error" style="display:none;margin-top:10px"></div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-ghost btn-full" id="btn-cancel-review">Cancelar</button>
          <button class="btn btn-primary btn-full" id="btn-submit-review">Enviar avaliação</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const form = $('#review-form', modal);
  initStarGroups(form);

  $('#btn-cancel-review', modal).addEventListener('click', () => modal.remove());

  $('#btn-submit-review', modal).addEventListener('click', async () => {
    const p = parseInt(form.dataset.punctuality || 0);
    const pr = parseInt(form.dataset.presentation || 0);
    const t = parseInt(form.dataset.technique || 0);
    if (!p || !pr || !t) {
      $('#review-error', modal).textContent = 'Avalie os 3 pilares antes de enviar.';
      $('#review-error', modal).style.display = 'block';
      return;
    }
    const btn = $('#btn-submit-review', modal);
    btn.disabled = true; btn.textContent = '...';
    await createReview({
      jobId:            job.id,
      employerUid:      STATE.user.uid,
      professionalUid:  job.confirmedProfessional,
      punctuality: p, presentation: pr, technique: t,
      comment: $('#review-comment', modal).value,
    });
    await updateJob(job.id, { reviewed: true });
    modal.remove();
    toast('Avaliação enviada!');
    showApp('inicio');
  });
}

// ─── FIXED TEAM (contratante) ─────────────────────────────────

async function loadTeam() {
  const sec = $('#sec-equipe');
  sec.innerHTML = `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`;

  const employer = await getEmployer(STATE.user.uid);
  STATE.profile = employer;
  const teamUids = employer?.fixedTeam || [];

  // Buscar perfis dos membros
  let members = [];
  if (teamUids.length > 0) {
    members = await Promise.all(teamUids.map(uid => getProfessional(uid)));
    members = members.filter(Boolean);
  }

  sec.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>Equipe fixa</h2>
      <button class="btn btn-sm btn-primary" id="btn-add-member">+ Adicionar</button>
    </div>
    <p style="font-size:.8rem;color:var(--muted)">Profissionais de confiança que você já conhece.</p>

    <div style="display:flex;flex-direction:column;gap:8px" id="team-list">
      ${members.length === 0
        ? `<div class="empty-state"><span class="empty-icon">👥</span><h3>Equipe vazia</h3><p>Adicione profissionais pelo e-mail cadastrado.</p></div>`
        : members.map(m => `
          <div class="member-card">
            <div class="member-avatar">${m.name[0].toUpperCase()}</div>
            <div class="member-info">
              <p class="member-name">${m.name}</p>
              <p class="member-cat">${getCategoryLabel(m.category)} · ${LEVELS[m.level||'ACESSO'].label}</p>
            </div>
            <button class="btn btn-sm btn-ghost" data-uid="${m.uid}" id="rm-${m.uid}">Remover</button>
          </div>
        `).join('')
      }
    </div>
  `;

  // Remove member
  members.forEach(m => {
    $(`#rm-${m.uid}`, sec)?.addEventListener('click', async () => {
      const newTeam = teamUids.filter(u => u !== m.uid);
      await updateEmployer(STATE.user.uid, { fixedTeam: newTeam });
      toast(`${m.name} removido(a) da equipe.`);
      loadTeam();
    });
  });

  // Add member by email
  $('#btn-add-member').addEventListener('click', () => openAddMemberModal(teamUids));
}

function openAddMemberModal(currentTeam) {
  const modal = document.createElement('div');
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px`;
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:20px;padding:24px 20px;width:100%;max-width:380px">
      <h3 style="margin-bottom:16px">Adicionar à equipe fixa</h3>
      <div class="field">
        <label>E-mail do profissional</label>
        <input id="add-member-email" type="email" placeholder="profissional@email.com" />
      </div>
      <div id="add-member-result" style="margin-top:12px"></div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost btn-full" id="btn-cancel-add">Cancelar</button>
        <button class="btn btn-primary btn-full" id="btn-search-member">Buscar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  $('#btn-cancel-add', modal).addEventListener('click', () => modal.remove());

  $('#btn-search-member', modal).addEventListener('click', async () => {
    const email = $('#add-member-email', modal).value.trim();
    if (!email) return;
    $('#btn-search-member', modal).textContent = '...';

    // Buscar usuário pelo email
    const { getDocs, query, collection, where } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const q = query(collection(db, 'users'), where('email', '==', email), where('role', '==', 'professional'));
    const snap = await getDocs(q);

    if (snap.empty) {
      $('#add-member-result', modal).innerHTML = `<div class="alert alert-error">Nenhum profissional encontrado com esse e-mail.</div>`;
      $('#btn-search-member', modal).textContent = 'Buscar';
      return;
    }

    const userDoc = snap.docs[0];
    const uid = userDoc.id;
    const name = userDoc.data().name;

    if (currentTeam.includes(uid)) {
      $('#add-member-result', modal).innerHTML = `<div class="alert alert-warn">${name} já está na sua equipe.</div>`;
      $('#btn-search-member', modal).textContent = 'Buscar';
      return;
    }

    $('#add-member-result', modal).innerHTML = `
      <div class="card card-sm" style="display:flex;align-items:center;gap:10px">
        <div class="member-avatar" style="width:36px;height:36px;font-size:.9rem">${name[0]}</div>
        <div><p style="font-weight:600;font-size:.9rem">${name}</p><p style="font-size:.72rem;color:var(--muted)">${email}</p></div>
        <button class="btn btn-sm btn-green" id="btn-confirm-add" data-uid="${uid}">Adicionar</button>
      </div>
    `;

    $('#btn-confirm-add', modal).addEventListener('click', async () => {
      await updateEmployer(STATE.user.uid, { fixedTeam: [...currentTeam, uid] });
      modal.remove();
      toast(`${name} adicionado(a) à equipe!`);
      loadTeam();
    });

    $('#btn-search-member', modal).textContent = 'Buscar';
  });
}

// ─── PROFILE ─────────────────────────────────────────────────

async function loadProfile() {
  const sec = $('#sec-perfil');
  const role = STATE.userData?.role;
  const u = STATE.userData;
  const p = STATE.profile;

  sec.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar">${u.name[0].toUpperCase()}</div>
      <div>
        <p class="profile-name">${u.name}</p>
        <p class="profile-role">${role === 'professional' ? getCategoryLabel(p?.category) : p?.businessName || ''}</p>
      </div>
      ${role === 'professional' ? lvlBadge(p?.level || 'ACESSO') : ''}
    </div>

    ${role === 'professional' ? `
      <div class="card">
        <h3 style="margin-bottom:12px">Desempenho</h3>
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-icon">🎪</span><span class="stat-val">${p?.totalEvents||0}</span><span class="stat-lbl">Eventos</span></div>
          <div class="stat-card"><span class="stat-icon">⭐</span><span class="stat-val">${p?.averageRating ? p.averageRating.toFixed(1) : '—'}</span><span class="stat-lbl">Média</span></div>
          <div class="stat-card"><span class="stat-icon">🏆</span><span class="stat-val">${p?.noShows||0}</span><span class="stat-lbl">No-shows</span></div>
        </div>
        <div style="margin-top:16px">
          <p style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Avaliação por pilar</p>
          ${['punctuality','presentation','technique'].map((k,i) => {
            const labels = ['Pontualidade','Apresentação','Técnica'];
            const val = p?.ratings?.[k] || 0;
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem">${labels[i]}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:.82rem;color:var(--yellow)">${val ? val.toFixed(1) : '—'}</span>
                  <div class="stars" style="font-size:.9rem">${buildStars(Math.round(val),'',true).replace(/data-name=""/g,'').replace(/<button/g,'<span').replace(/<\/button>/g,'</span>')}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card">
      <h3 style="margin-bottom:16px">Editar dados</h3>
      <form id="form-profile" class="form-stack">
        <div class="field">
          <label>Nome</label>
          <input id="prf-name" value="${u.name}" required />
        </div>
        <div class="field">
          <label>Telefone / WhatsApp</label>
          <input id="prf-phone" type="tel" value="${u.phone||''}" placeholder="(14) 99999-9999" />
        </div>
        ${role === 'professional' ? `
          <div class="field">
            <label>Especialidade</label>
            <select id="prf-category">
              ${CATEGORIES.map(c => `<option value="${c.id}" ${p?.category===c.id?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Bio / Apresentação</label>
            <textarea id="prf-bio" placeholder="Conte um pouco sobre sua experiência...">${p?.bio||''}</textarea>
          </div>
        ` : `
          <div class="field">
            <label>Nome do estabelecimento</label>
            <input id="prf-business" value="${p?.businessName||''}" />
          </div>
        `}
        <div id="prf-success" class="alert alert-success" style="display:none">Perfil atualizado!</div>
        <button class="btn btn-primary btn-full" type="submit" id="btn-save-profile">Salvar alterações</button>
      </form>
    </div>

    <button class="btn btn-ghost btn-full" id="btn-do-logout">Sair da conta</button>
  `;

  $('#form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-save-profile');
    btn.disabled = true; btn.textContent = '...';
    await updateUser(STATE.user.uid, {
      name: $('#prf-name').value,
      phone: $('#prf-phone').value,
    });
    STATE.userData.name = $('#prf-name').value;
    if (role === 'professional') {
      await updateProfessional(STATE.user.uid, {
        name:     $('#prf-name').value,
        category: $('#prf-category')?.value,
        bio:      $('#prf-bio')?.value,
      });
    } else {
      await updateEmployer(STATE.user.uid, {
        businessName: $('#prf-business')?.value,
      });
    }
    updateHeaderUser();
    $('#prf-success').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Salvar alterações';
    setTimeout(() => { $('#prf-success').style.display = 'none'; }, 3000);
  });

  $('#btn-do-logout').addEventListener('click', async () => {
    await logoutUser();
  });
}

// ─── ADMIN ───────────────────────────────────────────────────

let adminUnsubUsers, adminUnsubJobs;

async function loadAdmin() {
  const sec = $('#sec-admin');
  sec.innerHTML = `<div class="loading-center"><div class="spinner spinner-lg"></div></div>`;

  const stats = await getAdminStats();

  sec.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <h2>Painel Admin</h2>
        <p style="font-size:.8rem;color:var(--muted)">Visão geral em tempo real</p>
      </div>
      <div class="live-dot-wrap"><span class="live-dot"></span>Ao vivo</div>
    </div>

    <div class="admin-metrics">
      ${metricCard('👥','Usuários',stats.totalUsers,'')}
      ${metricCard('👤','Profissionais',stats.totalProfessionals,'green')}
      ${metricCard('🏢','Contratantes',stats.totalEmployers,'yellow')}
      ${metricCard('📋','Vagas abertas',stats.openJobs,'red')}
      ${metricCard('📊','Total vagas',stats.totalJobs,'')}
      ${metricCard('✅','Concluídas',stats.completedJobs,'green')}
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3>Usuários recentes</h3>
        <div class="live-dot-wrap" style="font-size:.68rem"><span class="live-dot"></span>Live</div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Cadastro</th></tr></thead>
          <tbody id="admin-users-body"><tr><td colspan="3" style="text-align:center;color:var(--muted);padding:20px">Carregando...</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3>Vagas recentes</h3>
        <div class="live-dot-wrap" style="font-size:.68rem"><span class="live-dot"></span>Live</div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Vaga</th><th>Status</th><th>Data</th></tr></thead>
          <tbody id="admin-jobs-body"><tr><td colspan="3" style="text-align:center;color:var(--muted);padding:20px">Carregando...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;

  const roleLabels = { professional:'Profissional', employer:'Contratante', admin:'Admin' };
  const roleColors = { professional:'#4aa050', employer:'var(--yellow)', admin:'var(--red)' };

  // Cleanup previous listeners
  adminUnsubUsers?.();
  adminUnsubJobs?.();

  adminUnsubUsers = listenCollection('users', (docs) => {
    const sorted = docs.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const tbody = $('#admin-users-body');
    if (!tbody) return;
    tbody.innerHTML = sorted.slice(0,10).map(u => `
      <tr>
        <td style="font-weight:500">${u.name}</td>
        <td style="color:${roleColors[u.role]};font-weight:700;font-size:.75rem">${roleLabels[u.role]||u.role}</td>
        <td style="color:var(--muted);font-size:.75rem">${fmtDate(u.createdAt)}</td>
      </tr>
    `).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--muted)">Nenhum usuário</td></tr>`;
  });

  const statusLabels = { open:'Aberta', filled:'Confirmada', completed:'Concluída', cancelled:'Cancelada' };
  const statusColors = { open:'#4aa050', filled:'var(--yellow)', completed:'var(--muted)', cancelled:'#e06060' };

  adminUnsubJobs = listenCollection('jobs', (docs) => {
    const sorted = docs.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const tbody = $('#admin-jobs-body');
    if (!tbody) return;
    tbody.innerHTML = sorted.slice(0,10).map(j => `
      <tr>
        <td style="font-weight:500">${j.title||'—'}</td>
        <td style="color:${statusColors[j.status]};font-weight:700;font-size:.75rem">${statusLabels[j.status]||j.status}</td>
        <td style="color:var(--muted);font-size:.75rem">${fmtDate(j.createdAt)}</td>
      </tr>
    `).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--muted)">Nenhuma vaga</td></tr>`;
  });
}

function metricCard(icon, label, value, color) {
  return `
    <div class="metric-card">
      <span class="metric-icon">${icon}</span>
      <span class="metric-val ${color}">${value}</span>
      <span class="metric-lbl">${label}</span>
    </div>
  `;
}

// ─── ERROR MESSAGES ───────────────────────────────────────────

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':     'Nenhuma conta com esse e-mail.',
    'auth/wrong-password':     'Senha incorreta.',
    'auth/invalid-email':      'E-mail inválido.',
    'auth/too-many-requests':  'Muitas tentativas. Tente mais tarde.',
    'auth/email-already-in-use':'E-mail já cadastrado.',
    'auth/weak-password':      'Senha muito fraca.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
  };
  return map[code] || 'Erro. Tente novamente.';
}
