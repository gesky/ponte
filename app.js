// ============================================================
// PONTE — App Principal
// ============================================================

import {
  auth, db, storage,
  registerUser, loginUser, logoutUser, resetPw, onAuthChange,
  getUser, updateUser, uploadProfilePhoto,
  getProfessional, updateProfessional,
  getEmployer, updateEmployer,
  createJob, getJob, updateJob, getOpenJobs, getJobsByEmployer,
  applyToJob, getApplicationsByJob, getApplicationsByProfessional, updateApplication,
  createReview,
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
    'minhas-vagas': loadMyApplications,
    'publicar-vaga': loadPublishJob,
    equipe: loadTeam, perfil: loadProfile, admin: loadAdmin,
  })[section]?.();
}

// ─── AUTH OBSERVER ───────────────────────────────────────────
onAuthChange(async (user) => {
  if (user) {
    STATE.user = user;
    try {
      STATE.userData = await getUser(user.uid);
      if (!STATE.userData) { await logoutUser(); return; }
      const role = STATE.userData.role;
      if (role === 'professional') STATE.profile = await getProfessional(user.uid);
      else if (role === 'employer') STATE.profile = await getEmployer(user.uid);
      buildNav(role);
      if (role === 'admin') showApp('admin');
      else showApp('inicio');
    } catch (err) {
      console.error('Auth error:', err);
      // Firestore rules might be blocking — show error instead of eternal loader
      showAuthPage('page-login');
      toast('Erro ao carregar conta. Verifique as regras do Firestore.', 'red');
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
    { sec:'vagas',         icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79l5 5-1.5 1.5-5-5zm-6 0C7 14 5 12 5 9.5S7 5 9.5 5 14 7 14 9.5 12 14 9.5 14z"/></svg>`, label:'Vagas' },
    { sec:'minhas-vagas',  icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>`, label:'Agenda' },
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
$('#link-to-register').addEventListener('click', (e) => { e.preventDefault(); showAuthPage('page-register'); });
$('#link-forgot').addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  if (!email) { toast('Digite seu e-mail primeiro', 'red'); return; }
  try { await resetPw(email); toast('E-mail de recuperação enviado!'); }
  catch { toast('Erro ao enviar e-mail.', 'red'); }
});

// ─── REGISTER ────────────────────────────────────────────────
$('#link-to-login').addEventListener('click', (e) => { e.preventDefault(); showAuthPage('page-login'); });

let selectedRole = null;
$$('.role-card').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedRole = btn.dataset.role;
    $('#reg-step1').style.display = 'none';
    $('#form-register').style.display = 'flex';
    $('#reg-fields-professional').style.display = selectedRole === 'professional' ? 'flex' : 'none';
    $('#reg-fields-employer').style.display     = selectedRole === 'employer'     ? 'flex' : 'none';
  });
});
$('#btn-reg-back').addEventListener('click', () => {
  $('#reg-step1').style.display = 'flex';
  $('#form-register').style.display = 'none';
});
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-register');
  const pw = $('#reg-pw').value, pw2 = $('#reg-pw2').value;
  if (pw !== pw2) { showRegError('Senhas não coincidem.'); return; }
  if (pw.length < 6) { showRegError('Senha mínima: 6 caracteres.'); return; }
  btn.disabled = true; btn.textContent = '...';
  try {
    await registerUser($('#reg-email').value.trim(), pw, $('#reg-name').value.trim(), selectedRole, {
      phone: $('#reg-phone').value,
      category: $('#reg-category')?.value,
      businessName: $('#reg-business-name')?.value,
      businessType: $('#reg-business-type')?.value,
    });
  } catch (err) {
    showRegError(friendlyErr(err.code));
    btn.disabled = false; btn.textContent = 'Criar conta';
  }
});
function showRegError(msg) {
  const el = $('#reg-error');
  el.textContent = msg; el.style.display = 'block';
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
    const [prof, jobs] = await Promise.all([
      getProfessional(STATE.user.uid),
      getOpenJobs(5),
    ]);
    STATE.profile = prof;
    const lvl = LEVELS[prof?.level || 'ACESSO'];

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

      <div class="stats-grid">
        ${statCard('🎪', prof?.totalEvents||0, 'Eventos')}
        ${statCard('⭐', prof?.averageRating ? prof.averageRating.toFixed(1) : '—', 'Média')}
        ${statCard(lvl.label.split(' ')[0], lvl.label.replace(/^[^ ]+ /,''), 'Nível', true)}
      </div>

      <div>
        <div class="sec-header">
          <h3>Vagas disponíveis</h3>
          <button class="see-all" id="btn-see-all">Ver todas →</button>
        </div>
        <div class="jobs-stack" id="home-jobs">
          ${jobs.length ? jobs.map(j => jobCardHTML(j)).join('') : emptyState('📭','Nenhuma vaga agora','Volte mais tarde.')}
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

    if (role === 'professional') {
      const apps = await getApplicationsByProfessional(STATE.user.uid);
      alreadyApplied = apps.some(a => a.jobId === jobId);
    } else {
      applications = await getApplicationsByJob(jobId);
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

      ${role==='professional' ? `
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
              <div class="applicant-row">
                <div>
                  <p style="font-weight:600;font-size:.9rem">${a.professionalName}</p>
                  <p style="font-size:.72rem;color:var(--muted)">${fmtDate(a.createdAt)}</p>
                </div>
                <div style="display:flex;gap:6px">
                  ${a.status==='pending' ? `
                    <button class="btn btn-sm btn-green" data-app="${a.id}" data-action="accept">Confirmar</button>
                    <button class="btn btn-sm btn-ghost" data-app="${a.id}" data-action="reject">Recusar</button>
                  ` : `<span class="status-pill ${a.status==='accepted'?'status-filled':'status-cancelled'}">${a.status==='accepted'?'Confirmado':'Recusado'}</span>`}
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
    $$('[data-action]', container).forEach(btn => {
      btn.addEventListener('click', async () => {
        const accepted = btn.dataset.action === 'accept';
        await updateApplication(btn.dataset.app, { status: accepted?'accepted':'rejected' });
        if (accepted) await updateJob(jobId, { status:'filled' });
        toast(accepted ? 'Profissional confirmado!' : 'Candidatura recusada.');
        openJobDetail(jobId);
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

// ─── MY APPLICATIONS ─────────────────────────────────────────
async function loadMyApplications() {
  const sec = $('#sec-minhas-vagas');
  sec.innerHTML = loader();
  try {
    const apps = await getApplicationsByProfessional(STATE.user.uid);
    if (!apps.length) {
      sec.innerHTML = `<h2>Agenda</h2>${emptyState('📋','Nenhuma candidatura ainda','Explore as vagas e candidate-se.',`<button class="btn btn-primary" id="go-vagas">Ver vagas</button>`)}`;
      $('#go-vagas').addEventListener('click', () => showApp('vagas'));
      return;
    }
    const jobsData = await Promise.all(apps.map(a => getJob(a.jobId)));
    const jobMap = Object.fromEntries(jobsData.filter(Boolean).map(j=>[j.id,j]));
    const sColors = { pending:'var(--muted)', accepted:'var(--yellow)', rejected:'#e06060' };
    const sLabels = { pending:'Aguardando', accepted:'Confirmado ✓', rejected:'Recusado' };
    sec.innerHTML = `
      <h2>Agenda</h2>
      <div class="jobs-stack">
        ${apps.map(a => {
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
        }).join('')}
      </div>`;
    $$('.job-card', sec).forEach(c=>c.addEventListener('click',()=>openJobDetail(c.dataset.id)));
  } catch { sec.innerHTML = `<h2>Agenda</h2>${errState('Erro ao carregar.')}`; }
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
    const p = STATE.profile;

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
        <input type="file" id="photo-input" accept="image/*" style="display:none" />
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
      ` : ''}

      <div class="card">
        <h3 style="margin-bottom:16px">Editar dados</h3>
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

      <div class="card" style="padding:4px 8px">
        <button class="btn btn-ghost btn-full" id="btn-logout-profile" style="color:var(--red);border-color:rgba(204,71,46,.3)">
          Sair da conta
        </button>
      </div>
    `;

    // Foto de perfil
    const avatarWrap = $('#avatar-wrap');
    avatarWrap.style.cursor = 'pointer';
    avatarWrap.addEventListener('click', () => $('#photo-input').click());
    $('#photo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const wrap = $('#avatar-wrap');
      wrap.style.opacity = '.5';
      try {
        const url = await uploadProfilePhoto(STATE.user.uid, file);
        STATE.userData.photoURL = url;
        wrap.innerHTML = `${avatarHTML(STATE.userData,72)}<div class="avatar-edit-badge">📷</div>`;
        wrap.style.opacity = '1';
        toast('Foto atualizada!');
      } catch { wrap.style.opacity='1'; toast('Erro ao enviar foto.','red'); }
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
  } catch (err) {
    sec.innerHTML = errState('Erro ao carregar perfil.');
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
