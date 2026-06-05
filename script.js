import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://gfqnyurmnrfiqkramsli.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmcW55dXJtbnJmaXFrcmFtc2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODEzNDMsImV4cCI6MjA5Mzk1NzM0M30.7el8O7GNLj03Xusw8RSYEi5m5l-Ke6qH2-08E_nzYXk'
const supabase = createClient(supabaseUrl, supabaseKey)

const ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ASSISTANT: 'assistant',
  ADMIN: 'admin'
};

const ASISTENCIA_ESTADOS = {
  PRESENTE: 'presente',
  AUSENTE: 'ausente',
  JUSTIFICADO: 'justificado',
  TARDANZA: 'tardanza'
};

const PERMISOS = {
  admin: {
    puede: (accion, recurso) => true
  },
  teacher: {
    puede: (accion, recurso) => {
      const accionesPermitidas = ['create', 'read', 'update', 'delete'];
      const recursosPermitidos = ['cursos', 'guias', 'tareas', 'tests', 'test_intentos', 'capsulas', 'reuniones', 'calificaciones', 'asistencias', 'participantes', 'avisos', 'inscripciones'];
      return accionesPermitidas.includes(accion) && recursosPermitidos.includes(recurso);
    }
  },
  assistant: {
    puede: (accion, recurso) => {
      const accionesPermitidas = ['create', 'read', 'update'];
      const recursosPermitidos = ['guias', 'tareas', 'capsulas', 'reuniones', 'avisos'];
      return accionesPermitidas.includes(accion) && recursosPermitidos.includes(recurso);
    }
  },
  student: {
    puede: (accion, recurso) => accion === 'read'
  }
};

let currentUserId = null;
let currentUserRole = null;
let userRoleSubscription = null;
let claseEditandoId = null;

function esRolAdmin(role = currentUserRole) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ['admin', 'administracion', 'administrador'].includes(normalizedRole);
}

function verificarPermiso(accion, recurso) {
  if (!currentUserRole) return false;

  const rol = currentUserRole.toLowerCase();
  return PERMISOS[rol]?.puede(accion, recurso) || false;
}

function esEstudianteActual() {
  return currentUserRole === ROLES.STUDENT;
}

function escaparHtml(valor = '') {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarUrlVideollamada(url) {
  const valor = String(url || '').trim();
  if (!valor) return '';
  try {
    const parsed = new URL(valor);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function normalizarUrlRecurso(url) {
  const valor = String(url || '').trim();
  if (!valor) return '';
  try {
    const parsed = new URL(valor);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function obtenerVideoEmbedCapsula(url) {
  const enlace = normalizarUrlRecurso(url);
  if (!enlace) return null;

  const parsed = new URL(enlace);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const pathname = parsed.pathname;

  if (host === 'youtu.be') {
    const videoId = pathname.split('/').filter(Boolean)[0];
    return videoId ? { tipo: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` } : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    let videoId = parsed.searchParams.get('v');
    const partes = pathname.split('/').filter(Boolean);
    if (!videoId && ['embed', 'shorts', 'live'].includes(partes[0])) {
      videoId = partes[1];
    }
    return videoId ? { tipo: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` } : null;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const partes = pathname.split('/').filter(Boolean);
    const videoId = host === 'player.vimeo.com' && partes[0] === 'video' ? partes[1] : partes.find(parte => /^\d+$/.test(parte));
    return videoId ? { tipo: 'iframe', src: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}` } : null;
  }

  if (host === 'drive.google.com') {
    const partes = pathname.split('/').filter(Boolean);
    const fileIndex = partes.indexOf('d');
    const fileId = fileIndex >= 0 ? partes[fileIndex + 1] : parsed.searchParams.get('id');
    return fileId ? { tipo: 'iframe', src: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview` } : null;
  }

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(enlace)) {
    return { tipo: 'video', src: enlace };
  }

  return null;
}

function renderizarReproductorCapsula(capsula) {
  if (capsula.tipo !== 'video') return '';
  const embed = obtenerVideoEmbedCapsula(capsula.url);
  if (!embed) {
    return `
      <div class="capsula-player-fallback">
        <i class="fas fa-circle-play"></i>
        <span>Este video no permite reproducción embebida.</span>
      </div>
    `;
  }

  const src = escaparHtml(embed.src);
  if (embed.tipo === 'video') {
    return `
      <div class="capsula-player">
        <video controls preload="metadata" src="${src}"></video>
      </div>
    `;
  }

  return `
    <div class="capsula-player">
      <iframe
        src="${src}"
        title="Reproductor de cápsula"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
      </iframe>
    </div>
  `;
}

function renderizarLinkVideollamada(url, texto = '', claseExtra = '', title = 'Abrir videollamada') {
  const enlace = normalizarUrlVideollamada(url);
  if (!enlace) return '';
  const clases = ['clase-videollamada-link', claseExtra].filter(Boolean).join(' ');
  return `
    <a href="${enlace}" class="${clases}" target="_blank" rel="noopener noreferrer" title="${title}">
      <i class="fas fa-video"></i>
      ${texto ? `<span>${escaparHtml(texto)}</span>` : ''}
    </a>
  `;
}

function obtenerEnlaceReunion(reunion) {
  const enlaceDirecto = normalizarUrlVideollamada(
    reunion?.enlace_videollamada ||
    reunion?.meeting_url ||
    reunion?.meet_link ||
    reunion?.url ||
    reunion?.enlace ||
    reunion?.link
  );
  if (enlaceDirecto) return enlaceDirecto;
  const match = String(reunion?.descripcion || '').match(/Videoconferencia:\s*(https?:\/\/\S+)/i);
  return match ? normalizarUrlVideollamada(match[1]) : '';
}

function obtenerGrabacionReunion(reunion) {
  const enlaceDirecto = normalizarUrlRecurso(
    reunion?.grabacion_url ||
    reunion?.recording_url ||
    reunion?.grabacion ||
    reunion?.url_grabacion
  );
  if (enlaceDirecto) return enlaceDirecto;
  const match = String(reunion?.descripcion || '').match(/Grabaci[oó]n:\s*(https?:\/\/\S+)/i);
  return match ? normalizarUrlRecurso(match[1]) : '';
}

function generarSalaJitsi(titulo = '', cursoId = '') {
  const base = `${titulo}-${cursoId}-${Date.now()}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `https://meet.jit.si/viformar-${base || 'clase-en-vivo'}`;
}

function obtenerPorcentajeAprobacion(test) {
  const valor = Number(test?.porcentaje_aprobacion ?? test?.porcentaje_minimo_aprobacion ?? 60);
  return Number.isFinite(valor) && valor > 0 ? valor : 60;
}

function intentoApruebaTest(intento, test) {
  if (!intento || intento.estado !== 'corregido') return false;
  const total = Number(test?.puntaje_total || 0);
  const obtenido = Number(intento.puntaje_obtenido || 0);
  return total > 0 && (obtenido / total) * 100 >= obtenerPorcentajeAprobacion(test);
}

function obtenerResumenProgresoCurso(curso) {
  if (!curso) return { porcentaje: 0, estado: 'No iniciado', certificadoDisponible: false };
  const videosTotal = capsulas.filter(c => c.curso_id === curso.id && c.tipo === 'video').length;
  const documentosTotal = guias.filter(g => g.curso_id === curso.id).length + capsulas.filter(c => c.curso_id === curso.id && c.tipo !== 'video').length;
  const evaluacionesCurso = tests.filter(test => test.curso_id === curso.id && test.estado !== 'archivado');
  const evaluacionesAprobadas = evaluacionesCurso.filter(test => {
    const intento = testIntentos.find(i => String(i.test_id) === String(test.id) && (!currentUserId || i.estudiante_id === currentUserId));
    return intentoApruebaTest(intento, test);
  }).length;
  const videosCompletados = Math.min(videosTotal, Number(localStorage.getItem(`viformar:${currentUserId}:${curso.id}:videos`) || 0));
  const documentosCompletados = Math.min(documentosTotal, Number(localStorage.getItem(`viformar:${currentUserId}:${curso.id}:documentos`) || 0));
  const porcentaje = Math.min(100, Math.round(
    (videosTotal ? (videosCompletados / videosTotal) * 50 : 0) +
    (documentosTotal ? (documentosCompletados / documentosTotal) * 20 : 0) +
    (evaluacionesCurso.length ? (evaluacionesAprobadas / evaluacionesCurso.length) * 30 : 0)
  ));
  const estado = porcentaje <= 0 ? 'No iniciado' : porcentaje >= 100 ? 'Completado' : 'En progreso';
  const evaluacionFinalAprobada = evaluacionesCurso.length > 0 && evaluacionesAprobadas === evaluacionesCurso.length;
  return {
    porcentaje,
    estado,
    videosTotal,
    videosCompletados,
    documentosTotal,
    documentosCompletados,
    evaluacionesTotal: evaluacionesCurso.length,
    evaluacionesAprobadas,
    evaluacionFinalAprobada,
    certificadoDisponible: porcentaje >= 100 && evaluacionFinalAprobada
  };
}

function renderizarBarraProgreso(porcentaje) {
  const valor = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  return `
    <div class="viformar-progress" aria-label="Avance ${valor}%">
      <div class="viformar-progress-track">
        <span class="viformar-progress-fill" style="width: ${valor}%"></span>
      </div>
      <strong>${valor}%</strong>
    </div>
  `;
}

async function refrescarRolSesion(userId, opciones = {}) {
  const { actualizarVista = true } = opciones;
  const role = await obtenerRolUsuario(userId);
  currentUserId = userId;
  currentUserRole = role;
  if (actualizarVista) {
    manejarVistaSegunRol(role);
  }
  return role;
}

async function recargarVistaPorCambioRol() {
  if (!currentUserId) return;
  const role = await refrescarRolSesion(currentUserId);
  if (document.getElementById('listaCursos') || document.getElementById('listaGuias') ||
    document.getElementById('listaTareas') || document.getElementById('listaCapsulas')) {
    await cargarDatos(role);
  }
  if (cursoActual) {
    await cargarParticipantesCurso();
    renderizarGuias();
    await renderizarTareas();
    renderizarCapsulas();
    renderizarAsistencia();
  }
  if (document.getElementById('perfil-section')?.classList.contains('active')) {
    await renderizarPerfil();
  }
  if (window.location.hash === '#avisos' || document.getElementById('avisos-section')?.classList.contains('active')) {
    await renderizarAvisos();
  }
}

function limpiarSesionLocal() {
  currentUserId = null;
  currentUserRole = null;
  if (userRoleSubscription) {
    supabase.removeChannel(userRoleSubscription);
    userRoleSubscription = null;
  }
}

function suscribirCambiosRol(userId) {
  if (userRoleSubscription) {
    supabase.removeChannel(userRoleSubscription);
  }
  userRoleSubscription = supabase
    .channel(`user-role-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${userId}` },
      recargarVistaPorCambioRol
    )
    .subscribe();
}

function mostrarModalAuth() {
  modalContent.innerHTML = `
    <div class="auth-modal">      
      <div id="login-form" class="auth-form active">
        <h2><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</h2>
        <div class="form-group">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" placeholder="tu@email.com" required>
        </div>
        <div class="form-group">
          <label for="loginPassword">Contraseña</label>
          <input type="password" id="loginPassword" placeholder="Tu contraseña" required>
        </div>
        <button onclick="iniciarSesion()" class="auth-submit">Iniciar Sesión</button>
      </div>
      
      <div id="register-form" class="auth-form">
        <h2><i class="fas fa-user-plus"></i> Registrarse</h2>
        <div class="form-group">
          <label for="registerName">Nombre Completo</label>
          <input type="text" id="registerName" placeholder="Nombre y Apellido" required>
        </div>
        <div class="form-group">
          <label for="registerEmail">Email</label>
          <input type="email" id="registerEmail" placeholder="tu@email.com" required>
        </div>
        <div class="form-group">
          <label for="registerPassword">Contraseña</label>
          <input type="password" id="registerPassword" placeholder="Mínimo 6 caracteres" required>
        </div>
        <div class="form-group">
          <label for="confirmPassword">Confirmar Contraseña</label>
          <input type="password" id="confirmPassword" placeholder="Repite tu contraseña" required>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

      const tabId = tab.getAttribute('data-tab');
      tab.classList.add('active');
      document.getElementById(`${tabId}-form`).classList.add('active');
    });
  });

  modal.style.display = 'block';
}

async function iniciarSesion() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  if (!email) {
    mostrarToast('El email es obligatorio', 'warning');
    return;
  }
  try {
    let response;
    if (password) {
      response = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
    } else {
      response = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      mostrarToast('¡Revisa tu email para el enlace mágico!');
    }
    if (response.error) throw response.error;
    cerrarModal();
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    mostrarToast('Error: ' + error.message, 'error');
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    location.reload();
  }
});

async function obtenerRolUsuario(userId) {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await asegurarRolUsuario(userId);
      return ROLES.STUDENT;
    }
    return data?.role || ROLES.STUDENT;
  } catch (error) {
    console.error('Error al obtener rol del usuario:', error);
    return ROLES.STUDENT;
  }
}

async function asegurarRolUsuario(userId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return null;

  const nombre = user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario';
  const { data, error } = await supabase
    .from('user_roles')
    .upsert(
      {
        user_id: user.id,
        role: ROLES.STUDENT,
        nombre,
        email: user.email,
        avatar_url: ''
      },
      { onConflict: 'user_id' }
    )
    .select('nombre, role')
    .maybeSingle();

  if (error) {
    console.error('Error al asegurar rol del usuario:', error);
    return null;
  }

  return data;
}

async function initAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarNotLogged = document.getElementById('sidebar-not-logged');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userEmailElement = document.getElementById('userEmail');
    const sidebarWelcomeUser = document.getElementById('sidebarWelcomeUser');
    const avisosBtn = document.getElementById('avisosBtn')
    if (session) {
      document.body.classList.add('logged-in');
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'block';
      sidebarMenu.style.display = 'block';
      sidebarNotLogged.style.display = 'none';
      const { data: userRoleData, error: roleError } = await supabase
        .from('user_roles')
        .select('nombre')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      const perfilRol = userRoleData || await asegurarRolUsuario(session.user.id);
      const nombreUsuario = perfilRol?.nombre || session.user.email.split('@')[0];
      userEmailElement.textContent = nombreUsuario;
      if (sidebarWelcomeUser) sidebarWelcomeUser.textContent = nombreUsuario;
      const userRole = await refrescarRolSesion(session.user.id, { actualizarVista: false });
      suscribirCambiosRol(session.user.id);
      manejarVistaSegunRol(userRole);
      if (window.location.hash === '#perfil' || document.getElementById('perfil-section')?.classList.contains('active')) {
        await renderizarPerfil();
      }
      if (document.getElementById('listaCursos') || document.getElementById('listaGuias') ||
        document.getElementById('listaTareas') || document.getElementById('listaCapsulas')) {
        await cargarDatos(userRole);
      }
      if (window.location.hash === '#avisos' || document.getElementById('avisos-section')?.classList.contains('active')) {
        await renderizarAvisos();
      }
      await actualizarContadorAvisos();
    } else {
      loginBtn.style.display = 'block';
      logoutBtn.style.display = 'none';
      sidebarMenu.style.display = 'none';
      sidebarNotLogged.style.display = 'block';
      userEmailElement.textContent = 'Ver Perfil';
      if (sidebarWelcomeUser) sidebarWelcomeUser.textContent = '';
      avisosBtn.style.display = 'none';

      document.body.classList.remove('logged-in');
      limpiarSesionLocal();
    }
  } catch (error) {
    console.error('Error en initAuth:', error);
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'none';
    document.getElementById('sidebar-not-logged').style.display = 'block';
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement) userEmailElement.textContent = 'Ver Perfil';
  }
}

function manejarVistaSegunRol(role) {
  const esAdmin = esRolAdmin(role);
  const esProfesor = role === ROLES.TEACHER || esAdmin;
  const esAsistente = role === ROLES.ASSISTANT;
  const esEstudiante = role === ROLES.STUDENT;
  const agregarAvisoBtn = document.getElementById('agregarAvisoBtn');
  if (agregarAvisoBtn) {
    agregarAvisoBtn.style.display = verificarPermiso('create', 'avisos') ? 'block' : 'none';
  }
  const elementosControl = [
    { id: 'agregarCurso', permiso: 'create', recurso: 'cursos' },
    { id: 'admin-panel', mostrar: esAdmin },
    { id: 'btnAsistencia', mostrar: esProfesor || esAsistente || esEstudiante },
    { id: 'btn-matricular', mostrar: esProfesor || esAsistente || esAdmin },
    { id: 'btnEditarObjetivos', mostrar: esProfesor },
    { id: 'btnEditarRequisitos', mostrar: esProfesor },
    { id: 'admin-menu', mostrar: esAdmin },
    { id: 'configBtn', mostrar: esAdmin }
  ];
  elementosControl.forEach(item => {
    const elemento = document.getElementById(item.id);
    if (elemento) {
      const displayValue = elemento.classList.contains('menu-item') ? 'flex' : 'block';
      elemento.style.display = item.mostrar !== undefined ?
        (item.mostrar ? displayValue : 'none') :
        (verificarPermiso(item.permiso, item.recurso)) ? displayValue : 'none';
    }
  });
  document.querySelectorAll('.form-container').forEach(form => {
    form.style.display = (esProfesor || esAsistente) ? 'flex' : 'none';
  });
  document.querySelectorAll('.test-form-panel').forEach(form => {
    form.style.display = verificarPermiso('create', 'tests') ? 'flex' : 'none';
  });
  const agregarCurso = document.getElementById('añadirCurso');
  if (agregarCurso) {
    agregarCurso.style.display = verificarPermiso('create', 'cursos') ? 'flex' : 'none';
  }
  const crearCursoSection = document.querySelector('#crear-curso-section .page-title-card');
  if (crearCursoSection) {
    crearCursoSection.style.display = esProfesor ? 'block' : 'none';
  }
  const crearReunionBtn = document.getElementById('crearReunionBtn');
  if (crearReunionBtn) {
    crearReunionBtn.style.display = esEstudiante ? 'none' : 'block';
  }
  document.querySelectorAll('.crear-reunion-curso-btn').forEach(btn => {
    btn.style.display = esEstudiante ? 'none' : 'inline-flex';
  });
  document.querySelectorAll('.create-btn').forEach(btn => {
    const recurso = btn.closest('.form-container') ?
      btn.closest('.form-container').parentElement.id.replace('-section', '') :
      null;
    btn.style.display = (recurso && verificarPermiso('create', recurso)) ? 'block' : 'none';
  });
  document.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => {
    const accion = btn.classList.contains('edit-btn') ? 'update' : 'delete';
    const tipoRecurso = btn.closest('.item')?.classList.contains('guia') ? 'guias' :
      btn.closest('.item')?.classList.contains('tarea') ? 'tareas' :
        btn.closest('.item')?.classList.contains('capsula') ? 'capsulas' :
          btn.closest('.item')?.classList.contains('clase') ? 'asistencias' :
            'cursos';
    btn.style.display = verificarPermiso(accion, tipoRecurso) ? 'block' : 'none';
  });
  if (esAsistente) {
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.style.display = 'none';
    });
    document.querySelectorAll('.edit-btn').forEach(btn => {
      const tipoRecurso = btn.closest('.item')?.classList.contains('clase') ? 'asistencias' : null;
      btn.style.display = (tipoRecurso && verificarPermiso('update', tipoRecurso)) ? 'block' : 'none';
    });
  }
  if (esEstudiante) {
    document.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => {
      btn.style.display = 'none';
    });
    const seccionesOcultar = ['asistencia', 'participantes'];
    seccionesOcultar.forEach(seccion => {
      const elemento = document.querySelector(`.menu-item[data-section="${seccion}"]`);
      if (elemento) elemento.style.display = 'none';
    });
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    initAuth();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', () => {
      const expanded = document.body.classList.toggle('sidebar-expanded');
      mobileSidebarToggle.setAttribute('aria-expanded', String(expanded));
      mobileSidebarToggle.setAttribute('aria-label', expanded ? 'Cerrar menú' : 'Abrir menú');
    });
  }
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-expanded')) return;
    const sidebar = document.querySelector('.sidebar');
    if (sidebar?.contains(e.target) || mobileSidebarToggle?.contains(e.target)) return;
    document.body.classList.remove('sidebar-expanded');
    mobileSidebarToggle?.setAttribute('aria-expanded', 'false');
    mobileSidebarToggle?.setAttribute('aria-label', 'Abrir menú');
  });
  document.querySelectorAll('.sidebar .menu-item').forEach(item => {
    item.addEventListener('click', () => {
      document.body.classList.remove('sidebar-expanded');
      mobileSidebarToggle?.setAttribute('aria-expanded', 'false');
      mobileSidebarToggle?.setAttribute('aria-label', 'Abrir menú');
    });
  });
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', mostrarModalAuth);
  const userEmailBtn = document.getElementById('userEmail');
  if (userEmailBtn) {
    userEmailBtn.addEventListener('click', () => {
      mostrarSeccion('perfil');
      document.getElementById('perfil-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.body.classList.remove('sidebar-expanded');
      mobileSidebarToggle?.setAttribute('aria-expanded', 'false');
      mobileSidebarToggle?.setAttribute('aria-label', 'Abrir menú');
    });
  }
  const isCoursePage = document.getElementById('listaCursos') ||
    document.getElementById('curso-detalle-section') ||
    document.getElementById('dashboard-section');
  if (isCoursePage) {
    await cargarDatos();
    const seccionInicial = window.location.hash ? window.location.hash.substring(1) : 'cursos';
    mostrarSeccion(seccionInicial);
    document.getElementById('agregarCurso')?.addEventListener('click', agregarCurso);
    document.getElementById('volverCursos')?.addEventListener('click', () => mostrarSeccion('cursos'));
    document.getElementById('avisosBtn')?.addEventListener('click', () => {
      window.location.hash = '';
      mostrarAvisosModal();
    });
    document.getElementById('btnParticipantes')?.addEventListener('click', () => mostrarSeccionCurso('participantes'));
    document.getElementById('btnAsistencia')?.addEventListener('click', () => mostrarSeccionCurso('asistencia'));
    document.getElementById('btnTareas')?.addEventListener('click', () => mostrarSeccionCurso('tareas'));
    document.getElementById('btnCapsulas')?.addEventListener('click', () => mostrarSeccionCurso('capsulas'));
    document.getElementById('btnEditarObjetivos')?.addEventListener('click', editarObjetivos);
    document.getElementById('btnEditarRequisitos')?.addEventListener('click', editarRequisitos);
    document.getElementById('agregarGuia')?.addEventListener('click', agregarGuia);
    document.getElementById('agregarTarea')?.addEventListener('click', agregarTarea);
    document.getElementById('agregarTest')?.addEventListener('click', agregarTest);
    document.getElementById('agregarPreguntaTest')?.addEventListener('click', () => agregarPreguntaBuilder());
    document.getElementById('agregarCapsula')?.addEventListener('click', agregarCapsula);
    document.getElementById('capsulaTipo')?.addEventListener('change', actualizarFormularioCapsula);
    document.getElementById('guiaArchivos')?.addEventListener('change', (e) => manejarSeleccionArchivos(e, 'guia'));
    document.getElementById('tareaArchivos')?.addEventListener('change', (e) => manejarSeleccionArchivos(e, 'tarea'));
    renderizarPreguntasBuilder('test');
  }
  if (crearReunionBtn) {
    crearReunionBtn.addEventListener('click', crearReunion);
  }
  initChatbot();
  const closeModal = document.querySelector('.close');
  if (closeModal) closeModal.addEventListener('click', cerrarModal);
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      cerrarModal();
    }
  });
});

let cursos = [];
let guias = [];
let tareas = [];
let tests = [];
let testIntentos = [];
let capsulas = [];
let cursoActual = null;
let testPreguntasBuilder = [];
let archivosTemporales = {
  guia: [],
  tarea: [],
  test: [],
  editGuia: [],
  editTarea: [],
  editTest: [],
  entrega: []
};
let enlacesTemporales = {
  guia: [],
  tarea: [],
  editGuia: [],
  editTarea: []
};
let entregas = [];
let clases = [];
let asistencias = [];
let estudiantes = [];
let avisos = [];

const secciones = {
  cursos: document.getElementById('cursos-section'),
  cursoDetalle: document.getElementById('curso-detalle-section'),
  dashboard: document.getElementById('dashboard-section'),
  cursos: document.getElementById('cursos-section'),
  participantes: document.getElementById('participantes-section'),
  tests: document.getElementById('tests-section'),
  calendario: document.getElementById('calendario-section'),
  videochat: document.getElementById('videochat-section'),
  calificaciones: document.getElementById('calificaciones-section'),
  asistencia: document.getElementById('asistencia-section'),
  avisos: document.getElementById('avisos-section'),
  ayuda: document.getElementById('ayuda-section'),
  noticias: document.getElementById('noticias-section'),
  recursos: document.getElementById('recursos-section'),
  acerca: document.getElementById('acerca-section'),
  configuracion: document.getElementById('configuracion-section'),
  perfil: document.getElementById('perfil-section'),
  crearCurso: document.getElementById('crear-curso-section')
};

const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const closeModal = document.querySelector('.close');

function mostrarSeccion(seccion) {
  if (seccion === 'crearCurso' || seccion === 'crearUsuario') {
    seccion = 'configuracion';
  }
  if (seccion === 'crearCurso' && !esRolAdmin()) {
    mostrarToast('No tienes permisos para crear cursos', 'error');
    seccion = 'cursos';
  }
  if (seccion === 'configuracion' && !esRolAdmin()) {
    mostrarToast('Solo administradores pueden acceder a configuración', 'error');
    seccion = 'cursos';
  }
  Object.keys(secciones).forEach(key => {
    if (secciones[key]) {
      secciones[key].classList.remove('active');
    }
  });
  if (secciones[seccion]) {
    secciones[seccion].classList.add('active');
  }
  switch (seccion) {
    case 'cursos':
      renderizarCursos();
      break;
    case 'calendario':
      renderizarCalendario();
      break;
    case 'videochat':
      renderizarVideochat();
      break;
    case 'calificaciones':
      renderizarCalificaciones();
      break;
    case 'curso-detalle':
      if (cursoActual) {
        renderizarGuias();
        renderizarTareas();
        renderizarTests();
        renderizarCapsulas();
      }
      break;
    case 'avisos':
      renderizarAvisos();
      break;
    case 'ayuda':
      renderizarAyuda();
      break;
    case 'noticias':
      renderizarNoticias();
      break;
    case 'recursos':
      renderizarRecursos();
      break;
    case 'acerca':
      renderizarAcerca();
      break;
    case 'perfil':
      renderizarPerfil();
      break;
  }
  window.location.hash = seccion;
}

function mostrarSeccionCurso(seccion) {
  if (currentUserRole === ROLES.STUDENT && ['participantes', 'asistencia', 'tareas', 'capsulas'].includes(seccion)) {
    seccion = 'presentacion';
  }
  document.querySelectorAll('.curso-nav button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`btn${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`)?.classList.add('active');
  document.querySelectorAll('.curso-seccion').forEach(sec => {
    sec.classList.remove('active');
  });
  document.getElementById(`${seccion}-section`)?.classList.add('active');
}

async function activarPestanaCurso(seccion) {
  mostrarSeccionCurso(seccion);
  if (seccion === 'clasesVivo') {
    await renderizarReunionesCurso();
  }
  if (seccion === 'certificado') {
    await renderizarCertificado();
  }
}

async function cargarDatos(userRole) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    cursos = [];
    guias = [];
    tareas = [];
    tests = [];
    testIntentos = [];
    capsulas = [];
    let shouldLoadData = true;
    if (userRole === ROLES.STUDENT) {
      const { data: inscripciones, error: inscripcionesError } = await supabase
        .from('inscripciones')
        .select('curso_id')
        .eq('estudiante_id', user.id);
      if (inscripcionesError) throw inscripcionesError;
      const cursosIds = inscripciones.map(i => i.curso_id);
      if (cursosIds.length === 0) {
        shouldLoadData = false;
        renderizarCursos();
        return;
      }
      const { data: cursosData, error: cursosError } = await supabase
        .from('cursos')
        .select('*')
        .in('id', cursosIds);
      if (cursosError) throw cursosError;
      cursos = cursosData || [];
    } else {
      const { data: cursosData, error: cursosError } = await supabase
        .from('cursos')
        .select('*');
      if (cursosError) throw cursosError;
      cursos = cursosData || [];
    }
    if (shouldLoadData && cursos.length > 0) {
      const cursosIds = cursos.map(c => c.id);
      const { data: guiasData, error: guiasError } = await supabase
        .from('guias')
        .select('*')
        .in('curso_id', cursosIds);
      if (!guiasError) guias = guiasData || [];
      const { data: tareasData, error: tareasError } = await supabase
        .from('tareas')
        .select('*')
        .in('curso_id', cursosIds);
      if (!tareasError) tareas = tareasData || [];
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*')
        .in('curso_id', cursosIds);
      if (!testsError) tests = testsData || [];
      const { data: capsulasData, error: capsulasError } = await supabase
        .from('capsulas')
        .select('*')
        .in('curso_id', cursosIds);
      if (!capsulasError) capsulas = capsulasData || [];
    }
    renderizarCursos();
  } catch (error) {
    console.error('Error al cargar datos:', error);
    mostrarToast('Error al cargar los datos del curso', 'error');
    cursos = [];
    guias = [];
    tareas = [];
    tests = [];
    testIntentos = [];
    capsulas = [];
    renderizarCursos();
  }
}

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function agregarCurso() {
  if (!verificarPermiso('create', 'cursos')) {
    mostrarToast('No tienes permisos para crear cursos', 'error');
    return;
  }
  const nombre = document.getElementById('cursoNombre').value.trim();
  const descripcion = document.getElementById('cursoDescripcion').value.trim();
  const color = document.getElementById('cursoColor').value;
  if (!nombre) {
    mostrarToast('El nombre del curso es obligatorio', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear un curso', 'warning');
      return;
    }
    const { data, error } = await supabase
      .from('cursos')
      .insert([
        {
          nombre,
          descripcion,
          color,
          user_id: user.id
        }
      ])
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      cursos.push(data[0]);
      renderizarCursos();
      document.getElementById('cursoNombre').value = '';
      document.getElementById('cursoDescripcion').value = '';
    }
  } catch (error) {
    console.error('Error al agregar curso:', error);
    mostrarToast('Error al crear el curso', 'error');
  }
}

async function actualizarCurso(id) {
  if (!verificarPermiso('update', 'cursos')) {
    mostrarToast('No tienes permisos para editar cursos', 'error');
    return;
  }
  const nombre = document.getElementById('editCursoNombre').value.trim();
  const descripcion = document.getElementById('editCursoDescripcion').value.trim();
  const color = document.getElementById('editCursoColor').value;
  if (!nombre) {
    mostrarToast('El nombre del curso es obligatorio', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar un curso', 'warning');
      return;
    }
    const { data, error } = await supabase
      .from('cursos')
      .update({ nombre, descripcion, color })
      .eq('id', id)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      const index = cursos.findIndex(c => c.id === id);
      if (index !== -1) {
        cursos[index] = data[0];
        renderizarCursos();
        cerrarModal();
        if (cursoActual && cursoActual.id === id) {
          cursoActual = data[0];
          document.getElementById('curso-titulo').textContent = cursoActual.nombre;
          document.getElementById('curso-descripcion').textContent = cursoActual.descripcion || 'Sin descripción';
        }
      }
    }
  } catch (error) {
    console.error('Error al actualizar curso:', error);
    mostrarToast('Error al actualizar el curso: ' + error.message, 'error');
  }
}

async function eliminarCurso(id) {
  if (!verificarPermiso('delete', 'cursos')) {
    mostrarToast('No tienes permisos para eliminar cursos', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar este curso, todas sus guías, tareas y archivos asociados?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar un curso', 'warning');
      return;
    }
    const { data: guiasCurso, error: guiasError } = await supabase
      .from('guias')
      .select('id, archivos')
      .eq('curso_id', id);
    const { data: tareasCurso, error: tareasError } = await supabase
      .from('tareas')
      .select('id, archivos')
      .eq('curso_id', id);
    if (guiasError || tareasError) throw guiasError || tareasError;
    let allPaths = [];
    if (guiasCurso) {
      guiasCurso.forEach(guia => {
        if (guia.archivos && guia.archivos.length > 0) {
          allPaths = allPaths.concat(guia.archivos.map(a => a.path));
        }
      });
    }
    if (tareasCurso) {
      tareasCurso.forEach(tarea => {
        if (tarea.archivos && tarea.archivos.length > 0) {
          allPaths = allPaths.concat(tarea.archivos.map(a => a.path));
        }
      });
    }
    if (allPaths.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < allPaths.length; i += batchSize) {
        const batch = allPaths.slice(i, i + batchSize);
        const { error: deleteError } = await supabase.storage
          .from('archivos')
          .remove(batch);
        if (deleteError) console.error("Error al eliminar archivos:", deleteError);
      }
    }
    const { error } = await supabase
      .from('cursos')
      .delete()
      .eq('id', id)
    if (error) throw error;
    cursos = cursos.filter(c => c.id !== id);
    guias = guias.filter(g => g.curso_id !== id);
    tareas = tareas.filter(t => t.curso_id !== id);
    capsulas = capsulas.filter(c => c.curso_id !== id);
    if (cursoActual && cursoActual.id === id) {
      cursoActual = null;
    }
    renderizarCursos();
  } catch (error) {
    console.error('Error al eliminar curso:', error);
    mostrarToast('Error al eliminar el curso: ' + error.message, 'error');
  }
}

async function agregarGuia() {
  if (!cursoActual) return;
  if (!verificarPermiso('create', 'guias')) {
    mostrarToast('No tienes permisos para crear guías', 'error');
    return;
  }
  const titulo = document.getElementById('guiaTitulo').value.trim();
  const contenido = document.getElementById('guiaContenido').value.trim();
  const visibilidad = document.getElementById('guiaVisibilidad').value;
  if (!titulo || !contenido) {
    mostrarToast('Todos los campos son obligatorios', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear una guía', 'warning');
      return;
    }
    const { data: guiaData, error: guiaError } = await supabase
      .from('guias')
      .insert([
        {
          curso_id: cursoActual.id,
          titulo,
          contenido,
          visibilidad,
          user_id: user.id,
          enlaces: enlacesTemporales.guia
        }
      ])
      .select();
    if (guiaError) throw guiaError;
    if (guiaData && guiaData.length > 0) {
      const nuevaGuia = guiaData[0];
      if (archivosTemporales.guia.length > 0) {
        const archivosSubidos = await subirArchivos(archivosTemporales.guia, 'guias', nuevaGuia.id);
        const { error: updateError } = await supabase
          .from('guias')
          .update({ archivos: archivosSubidos })
          .eq('id', nuevaGuia.id);
        if (updateError) throw updateError;
        nuevaGuia.archivos = archivosSubidos;
      }
      guias.push(nuevaGuia);
      renderizarGuias();
      document.getElementById('guiaTitulo').value = '';
      document.getElementById('guiaContenido').value = '';
      archivosTemporales.guia = [];
      enlacesTemporales.guia = [];
      document.getElementById('guiaArchivosPreview').innerHTML = '';
      document.getElementById('guiaEnlacesPreview').innerHTML = '';
    }
  } catch (error) {
    console.error('Error al agregar guía:', error);
    mostrarToast('Error al crear la guía', 'error');
  }
}

async function actualizarGuia(id) {
  if (!verificarPermiso('update', 'guias')) {
    mostrarToast('No tienes permisos para editar guías', 'error');
    return;
  }
  const titulo = document.getElementById('editGuiaTitulo').value.trim();
  const contenido = document.getElementById('editGuiaContenido').value.trim();
  const visibilidad = document.getElementById('editGuiaVisibilidad').value;
  if (!titulo || !contenido) {
    mostrarToast('Todos los campos son obligatorios', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar una guía', 'warning');
      return;
    }
    let nuevosArchivos = [];
    if (archivosTemporales.editGuia.length > 0) {
      nuevosArchivos = await subirArchivos(archivosTemporales.editGuia, 'guias', id);
    }
    const { data: guiaExistente } = await supabase
      .from('guias')
      .select('archivos')
      .eq('id', id)
      .single();
    const todosArchivos = [
      ...(guiaExistente?.archivos || []),
      ...nuevosArchivos
    ];
    const { data: guiaData, error } = await supabase
      .from('guias')
      .update({
        titulo,
        contenido,
        visibilidad,
        archivos: todosArchivos,
        enlaces: enlacesTemporales.editGuia || [],
        fecha_actualizacion: getChileNowISO()
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    if (guiaData && guiaData.length > 0) {
      const index = guias.findIndex(g => g.id === id);
      if (index !== -1) {
        guias[index] = guiaData[0];
        renderizarGuias();
        cerrarModal();
        archivosTemporales.editGuia = [];
        enlacesTemporales.editGuia = [];
      }
    }
  } catch (error) {
    console.error('Error al actualizar guía:', error);
    mostrarToast('Error al actualizar la guía: ' + error.message, 'error');
  }
}

async function eliminarGuia(id) {
  if (!verificarPermiso('delete', 'guias')) {
    mostrarToast('No tienes permisos para eliminar guías', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar esta guía y todos sus archivos asociados?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una guía', 'warning');
      return;
    }
    const { data: guia, error: fetchError } = await supabase
      .from('guias')
      .select('archivos')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (guia.archivos && guia.archivos.length > 0) {
      const pathsToDelete = guia.archivos.map(archivo => archivo.path);
      const { error: deleteError } = await supabase.storage
        .from('archivos')
        .remove(pathsToDelete);

      if (deleteError) console.error("Error al eliminar archivos:", deleteError);
    }
    const { error } = await supabase
      .from('guias')
      .delete()
      .eq('id', id)
    if (error) throw error;
    guias = guias.filter(g => g.id !== id);
    renderizarGuias();
  } catch (error) {
    console.error('Error al eliminar guía:', error);
    mostrarToast('Error al eliminar la guía: ' + error.message, 'error');
  }
}

async function agregarTarea() {
  if (!cursoActual) return;
  if (!verificarPermiso('create', 'tareas')) {
    mostrarToast('No tienes permisos para crear tareas', 'error');
    return;
  }
  const titulo = document.getElementById('tareaTitulo').value.trim();
  const descripcion = document.getElementById('tareaDescripcion').value.trim();
  const fechaInput = document.getElementById('tareaFecha').value;
  const puntos = parseInt(document.getElementById('tareaPuntos').value) || 0;
  if (!titulo || !descripcion || !fechaInput) {
    mostrarToast('Todos los campos son obligatorios', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear una tarea', 'warning');
      return;
    }
    const { data: tareaData, error: tareaError } = await supabase
      .from('tareas')
      .insert([
        {
          curso_id: cursoActual.id,
          titulo,
          descripcion,
          fecha_limite: chileDateTimeLocalToISO(fechaInput),
          puntos,
          user_id: user.id,
          enlaces: enlacesTemporales.tarea
        }
      ])
      .select();
    if (tareaError) throw tareaError;
    if (tareaData && tareaData.length > 0) {
      const nuevaTarea = tareaData[0];
      if (archivosTemporales.tarea.length > 0) {
        const archivosSubidos = await subirArchivos(archivosTemporales.tarea, 'tareas', nuevaTarea.id);
        const { error: updateError } = await supabase
          .from('tareas')
          .update({ archivos: archivosSubidos })
          .eq('id', nuevaTarea.id);
        if (updateError) throw updateError;
        nuevaTarea.archivos = archivosSubidos;
      }
      tareas.push(nuevaTarea);
      renderizarTareas();
      document.getElementById('tareaTitulo').value = '';
      document.getElementById('tareaDescripcion').value = '';
      document.getElementById('tareaFecha').value = '';
      document.getElementById('tareaPuntos').value = '';
      archivosTemporales.tarea = [];
      enlacesTemporales.tarea = [];
      document.getElementById('tareaArchivosPreview').innerHTML = '';
      document.getElementById('tareaEnlacesPreview').innerHTML = '';
    }
  } catch (error) {
    console.error('Error al agregar tarea:', error);
    mostrarToast('Error al crear la tarea', 'error');
  }
}

async function actualizarTarea(id) {
  if (!verificarPermiso('update', 'tareas')) {
    mostrarToast('No tienes permisos para editar tareas', 'error');
    return;
  }
  const titulo = document.getElementById('editTareaTitulo').value.trim();
  const descripcion = document.getElementById('editTareaDescripcion').value.trim();
  const fechaInput = document.getElementById('editTareaFecha').value;
  const puntos = parseInt(document.getElementById('editTareaPuntos').value) || 0;
  const completada = document.getElementById('editTareaCompletada').value === 'true';
  if (!titulo || !descripcion || !fechaInput) {
    mostrarToast('Todos los campos son obligatorios', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar una tarea', 'warning');
      return;
    }
    let nuevosArchivos = [];
    if (archivosTemporales.editTarea.length > 0) {
      nuevosArchivos = await subirArchivos(archivosTemporales.editTarea, 'tareas', id);
    }
    const { data: tareaExistente } = await supabase
      .from('tareas')
      .select('archivos, enlaces')
      .eq('id', id)
      .single();
    const todosArchivos = [
      ...(tareaExistente?.archivos || []),
      ...nuevosArchivos
    ];
    const todosEnlaces = enlacesTemporales.editTarea || [];
    const { data: tareaData, error } = await supabase
      .from('tareas')
      .update({
        titulo,
        descripcion,
        fecha_limite: chileDateTimeLocalToISO(fechaInput),
        puntos,
        completada,
        archivos: todosArchivos,
        enlaces: todosEnlaces,
        fecha_actualizacion: getChileNowISO(),
        fecha_completada: completada ? getChileNowISO() : null
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    if (tareaData && tareaData.length > 0) {
      const index = tareas.findIndex(t => t.id === id);
      if (index !== -1) {
        tareas[index] = tareaData[0];
        renderizarTareas();
        cerrarModal();
      }
    }
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    mostrarToast('Error al actualizar la tarea: ' + error.message, 'error');
  }
}

async function eliminarTarea(id) {
  if (!verificarPermiso('delete', 'tareas')) {
    mostrarToast('No tienes permisos para eliminar tareas', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar esta tarea y todos sus archivos asociados?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una tarea', 'warning');
      return;
    }
    const { data: tarea, error: fetchError } = await supabase
      .from('tareas')
      .select('archivos')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (tarea.archivos && tarea.archivos.length > 0) {
      const pathsToDelete = tarea.archivos.map(archivo => archivo.path);
      const { error: deleteError } = await supabase.storage
        .from('archivos')
        .remove(pathsToDelete);

      if (deleteError) console.error("Error al eliminar archivos:", deleteError);
    }
    const { error } = await supabase
      .from('tareas')
      .delete()
      .eq('id', id)
    if (error) throw error;
    tareas = tareas.filter(t => t.id !== id);
    renderizarTareas();
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    mostrarToast('Error al eliminar la tarea: ' + error.message, 'error');
  }
}

function crearPreguntaVacia(tipo = 'multiple') {
  return {
    id: crypto.randomUUID(),
    tipo,
    enunciado: '',
    opciones: tipo === 'multiple' ? ['', '', '', ''] : [],
    respuesta_correcta: tipo === 'multiple' ? 0 : null,
    puntaje: 1,
    pauta: ''
  };
}

function normalizarPreguntasTest(preguntas = []) {
  return preguntas.map((pregunta, index) => ({
    id: pregunta.id || crypto.randomUUID(),
    tipo: pregunta.tipo === 'desarrollo' ? 'desarrollo' : 'multiple',
    enunciado: String(pregunta.enunciado || '').trim(),
    opciones: pregunta.tipo === 'desarrollo' ? [] : (pregunta.opciones || []).map(op => String(op || '').trim()).filter(Boolean),
    respuesta_correcta: pregunta.tipo === 'desarrollo' ? null : Number(pregunta.respuesta_correcta || 0),
    puntaje: Number(pregunta.puntaje || 1),
    pauta: String(pregunta.pauta || '').trim(),
    orden: index + 1
  }));
}

function calcularPuntajePreguntas(preguntas = []) {
  return preguntas.reduce((total, pregunta) => total + Number(pregunta.puntaje || 0), 0);
}

function leerPreguntasBuilder(prefix = 'test') {
  const preguntasLeidas = testPreguntasBuilder.map(pregunta => {
    const tipo = document.getElementById(`${prefix}-pregunta-tipo-${pregunta.id}`)?.value || pregunta.tipo;
    const opciones = tipo === 'multiple'
      ? [...document.querySelectorAll(`[data-pregunta-opcion="${pregunta.id}"]`)].map(input => input.value.trim()).filter(Boolean)
      : [];
    return {
      ...pregunta,
      tipo,
      enunciado: document.getElementById(`${prefix}-pregunta-enunciado-${pregunta.id}`)?.value.trim() || '',
      opciones,
      respuesta_correcta: tipo === 'multiple' ? Number(document.getElementById(`${prefix}-pregunta-correcta-${pregunta.id}`)?.value || 0) : null,
      puntaje: Number(document.getElementById(`${prefix}-pregunta-puntaje-${pregunta.id}`)?.value || 1),
      pauta: document.getElementById(`${prefix}-pregunta-pauta-${pregunta.id}`)?.value.trim() || ''
    };
  });
  const puntajeInput = document.getElementById(prefix === 'test' ? 'testPuntaje' : 'editTestPuntaje');
  if (puntajeInput) {
    puntajeInput.value = calcularPuntajePreguntas(preguntasLeidas).toFixed(1);
  }
  return preguntasLeidas;
}

function agregarPreguntaBuilder(prefix = 'test', tipo = 'multiple') {
  testPreguntasBuilder = leerPreguntasBuilder(prefix);
  testPreguntasBuilder.push(crearPreguntaVacia(tipo));
  renderizarPreguntasBuilder(prefix);
}

function eliminarPreguntaBuilder(id, prefix = 'test') {
  testPreguntasBuilder = leerPreguntasBuilder(prefix).filter(pregunta => pregunta.id !== id);
  renderizarPreguntasBuilder(prefix);
}

function cambiarTipoPreguntaBuilder(id, prefix = 'test') {
  testPreguntasBuilder = leerPreguntasBuilder(prefix).map(pregunta => {
    if (pregunta.id !== id) return pregunta;
    const tipo = document.getElementById(`${prefix}-pregunta-tipo-${id}`)?.value || 'multiple';
    return {
      ...pregunta,
      tipo,
      opciones: tipo === 'multiple' ? (pregunta.opciones.length ? pregunta.opciones : ['', '', '', '']) : [],
      respuesta_correcta: tipo === 'multiple' ? 0 : null
    };
  });
  renderizarPreguntasBuilder(prefix);
}

function renderizarPreguntasBuilder(prefix = 'test') {
  const contenedor = document.getElementById(`${prefix}PreguntasBuilder`);
  if (!contenedor) return;
  if (testPreguntasBuilder.length === 0) {
    testPreguntasBuilder = [crearPreguntaVacia()];
  }
  contenedor.innerHTML = testPreguntasBuilder.map((pregunta, index) => {
    const opciones = pregunta.tipo === 'multiple'
      ? (pregunta.opciones.length ? pregunta.opciones : ['', '', '', ''])
      : [];
    return `
      <div class="test-question-card">
        <div class="test-question-head">
          <strong>Pregunta ${index + 1}</strong>
          <div class="test-builder-actions">
            <button type="button" class="btn-secondary" aria-expanded="true" onclick="togglePreguntaBuilder('${pregunta.id}', '${prefix}', this)" title="Colapsar pregunta">
              <i class="fas fa-chevron-up"></i> Colapsar
            </button>
            <button type="button" class="delete-btn" onclick="eliminarPreguntaBuilder('${pregunta.id}', '${prefix}')" title="Eliminar pregunta">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="test-question-body" id="${prefix}-pregunta-body-${pregunta.id}">
          <div class="task-meta-grid">
            <div class="field-group">
              <label for="${prefix}-pregunta-tipo-${pregunta.id}">Tipo</label>
              <select id="${prefix}-pregunta-tipo-${pregunta.id}" onchange="cambiarTipoPreguntaBuilder('${pregunta.id}', '${prefix}')">
                <option value="multiple" ${pregunta.tipo === 'multiple' ? 'selected' : ''}>Selección múltiple</option>
                <option value="desarrollo" ${pregunta.tipo === 'desarrollo' ? 'selected' : ''}>Desarrollo</option>
              </select>
            </div>
            <div class="field-group">
              <label for="${prefix}-pregunta-puntaje-${pregunta.id}">Puntaje</label>
              <input type="number" id="${prefix}-pregunta-puntaje-${pregunta.id}" min="0.1" step="0.1" value="${pregunta.puntaje || 1}" oninput="actualizarPuntajeTestBuilder('${prefix}')">
            </div>
          </div>
          <div class="field-group">
            <label for="${prefix}-pregunta-enunciado-${pregunta.id}">Enunciado</label>
            <textarea id="${prefix}-pregunta-enunciado-${pregunta.id}" placeholder="Escribe la pregunta">${escaparHtml(pregunta.enunciado || '')}</textarea>
          </div>
          ${pregunta.tipo === 'multiple' ? `
            <div class="test-options-builder">
              ${[0, 1, 2, 3].map(opcionIndex => `
                <div class="field-group">
                  <label>Opción ${opcionIndex + 1}</label>
                  <input type="text" data-pregunta-opcion="${pregunta.id}" value="${escaparHtml(opciones[opcionIndex] || '')}" placeholder="Alternativa ${opcionIndex + 1}">
                </div>
              `).join('')}
              <div class="field-group">
                <label for="${prefix}-pregunta-correcta-${pregunta.id}">Respuesta correcta</label>
                <select id="${prefix}-pregunta-correcta-${pregunta.id}">
                  ${[0, 1, 2, 3].map(opcionIndex => `
                    <option value="${opcionIndex}" ${Number(pregunta.respuesta_correcta) === opcionIndex ? 'selected' : ''}>Opción ${opcionIndex + 1}</option>
                  `).join('')}
                </select>
              </div>
            </div>
          ` : `
            <div class="field-group">
              <label for="${prefix}-pregunta-pauta-${pregunta.id}">Pauta de corrección</label>
              <textarea id="${prefix}-pregunta-pauta-${pregunta.id}" placeholder="Criterios esperados para corregir">${escaparHtml(pregunta.pauta || '')}</textarea>
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
  actualizarPuntajeTestBuilder(prefix);
}

function actualizarPuntajeTestBuilder(prefix = 'test') {
  const preguntas = testPreguntasBuilder.map(pregunta => ({
    ...pregunta,
    puntaje: Number(document.getElementById(`${prefix}-pregunta-puntaje-${pregunta.id}`)?.value || pregunta.puntaje || 0)
  }));
  const puntajeInput = document.getElementById(prefix === 'test' ? 'testPuntaje' : 'editTestPuntaje');
  if (puntajeInput) {
    puntajeInput.value = calcularPuntajePreguntas(preguntas).toFixed(1);
  }
}

function togglePreguntaBuilder(id, prefix = 'test', boton = null) {
  const cuerpo = document.getElementById(`${prefix}-pregunta-body-${id}`);
  if (!cuerpo || !boton) return;
  const colapsado = cuerpo.classList.toggle('is-collapsed');
  boton.setAttribute('aria-expanded', String(!colapsado));
  boton.innerHTML = colapsado
    ? '<i class="fas fa-chevron-down"></i> Expandir'
    : '<i class="fas fa-chevron-up"></i> Colapsar';
}

function validarPreguntasTest(preguntas) {
  if (!preguntas.length) return 'Agrega al menos una pregunta';
  for (const [index, pregunta] of preguntas.entries()) {
    if (!pregunta.enunciado) return `La pregunta ${index + 1} necesita enunciado`;
    if (pregunta.puntaje <= 0) return `La pregunta ${index + 1} necesita puntaje mayor a 0`;
    if (pregunta.tipo === 'multiple') {
      if (pregunta.opciones.length < 2) return `La pregunta ${index + 1} necesita al menos dos opciones`;
      if (pregunta.respuesta_correcta >= pregunta.opciones.length) return `La respuesta correcta de la pregunta ${index + 1} no coincide con sus opciones`;
    }
  }
  return '';
}

async function agregarTest() {
  if (!cursoActual) return;
  if (!verificarPermiso('create', 'tests')) {
    mostrarToast('No tienes permisos para crear tests', 'error');
    return;
  }
  const titulo = document.getElementById('testTitulo').value.trim();
  const descripcion = document.getElementById('testDescripcion').value.trim();
  const fechaInput = document.getElementById('testFecha').value;
  const preguntas = normalizarPreguntasTest(leerPreguntasBuilder('test'));
  const puntajeTotal = calcularPuntajePreguntas(preguntas);
  const errorPreguntas = validarPreguntasTest(preguntas);
  if (!titulo || !fechaInput || puntajeTotal <= 0) {
    mostrarToast('Título, fecha límite y puntaje total son obligatorios', 'warning');
    return;
  }
  if (errorPreguntas) {
    mostrarToast(errorPreguntas, 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear un test', 'warning');
      return;
    }
    const { data, error } = await supabase
      .from('tests')
      .insert([{
        curso_id: cursoActual.id,
        titulo,
        descripcion,
        fecha_limite: chileDateTimeLocalToISO(fechaInput),
        puntaje_total: puntajeTotal,
        preguntas,
        estado: 'publicado',
        user_id: user.id
      }])
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      tests.push(data[0]);
      document.getElementById('testTitulo').value = '';
      document.getElementById('testDescripcion').value = '';
      document.getElementById('testFecha').value = '';
      document.getElementById('testPuntaje').value = '1.0';
      testPreguntasBuilder = [crearPreguntaVacia()];
      renderizarPreguntasBuilder('test');
      await renderizarTests();
      mostrarToast('Test creado correctamente', 'success');
    }
  } catch (error) {
    console.error('Error al crear test:', error);
    mostrarToast('Error al crear el test: ' + error.message, 'error');
  }
}

async function actualizarTest(id) {
  if (!verificarPermiso('update', 'tests')) {
    mostrarToast('No tienes permisos para editar tests', 'error');
    return;
  }
  const titulo = document.getElementById('editTestTitulo').value.trim();
  const descripcion = document.getElementById('editTestDescripcion').value.trim();
  const fechaInput = document.getElementById('editTestFecha').value;
  const estado = document.getElementById('editTestEstado').value;
  const preguntas = normalizarPreguntasTest(leerPreguntasBuilder('editTest'));
  const puntajeTotal = calcularPuntajePreguntas(preguntas);
  const errorPreguntas = validarPreguntasTest(preguntas);
  if (!titulo || !fechaInput || puntajeTotal <= 0) {
    mostrarToast('Título, fecha límite y puntaje total son obligatorios', 'warning');
    return;
  }
  if (errorPreguntas) {
    mostrarToast(errorPreguntas, 'warning');
    return;
  }
  try {
    const { data, error } = await supabase
      .from('tests')
      .update({
        titulo,
        descripcion,
        fecha_limite: chileDateTimeLocalToISO(fechaInput),
        puntaje_total: puntajeTotal,
        preguntas,
        estado,
        fecha_actualizacion: getChileNowISO()
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      const index = tests.findIndex(test => String(test.id) === String(id));
      if (index !== -1) tests[index] = data[0];
      cerrarModal();
      await renderizarTests();
      mostrarToast('Test actualizado correctamente', 'success');
    }
  } catch (error) {
    console.error('Error al actualizar test:', error);
    mostrarToast('Error al actualizar el test: ' + error.message, 'error');
  }
}

async function eliminarTest(id) {
  if (!verificarPermiso('delete', 'tests')) {
    mostrarToast('No tienes permisos para eliminar tests', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar este test y sus respuestas?')) return;
  try {
    const { error } = await supabase
      .from('tests')
      .delete()
      .eq('id', id);
    if (error) throw error;
    tests = tests.filter(test => String(test.id) !== String(id));
    await renderizarTests();
    mostrarToast('Test eliminado correctamente', 'success');
  } catch (error) {
    console.error('Error al eliminar test:', error);
    mostrarToast('Error al eliminar el test: ' + error.message, 'error');
  }
}
async function toggleCompletada(id) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar una tarea', 'warning');
      return;
    }
    const userRole = currentUserRole;
    const userId = user.id;
    const { data: tarea, error: fetchError } = await supabase
      .from('tareas')
      .select(`
        *,
        cursos:curso_id (user_id)
      `)
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!tarea) {
      mostrarToast('Tarea no encontrada', 'error');
      return;
    }
    let puedeModificar = false;
    if (esRolAdmin(userRole)) {
      puedeModificar = true;
    }
    else if (userRole === ROLES.TEACHER || userRole === ROLES.ASSISTANT && tarea.cursos.user_id === userId) {
      puedeModificar = true;
    }
    else if (userRole === ROLES.STUDENT && tarea.estudiante_asignado_id === userId) {
      puedeModificar = true;
    }
    if (!puedeModificar) {
      mostrarToast('No tienes permisos para modificar esta tarea', 'error');
      return;
    }
    const completada = !tarea.completada;
    const { error: updateError } = await supabase
      .from('tareas')
      .update({
        completada,
        fecha_completada: completada ? getChileNowISO() : null,
        fecha_actualizacion: getChileNowISO(),
        user_id_ultima_modificacion: userId
      })
      .eq('id', id);
    if (updateError) throw updateError;
    const index = tareas.findIndex(t => t.id === id);
    if (index !== -1) {
      tareas[index] = {
        ...tareas[index],
        completada,
        fecha_completada: completada ? getChileNowISO() : undefined,
        fecha_actualizacion: getChileNowISO()
      };
      renderizarTareas();
    }
  } catch (error) {
    console.error('Error al actualizar estado de tarea:', error);
    mostrarToast('Error al actualizar la tarea: ' + error.message, 'error');
  }
}

async function agregarCapsula() {
  if (!cursoActual) return;
  if (!verificarPermiso('create', 'capsulas')) {
    mostrarToast('No tienes permisos para crear cápsulas', 'error');
    return;
  }
  const titulo = document.getElementById('capsulaTitulo').value.trim();
  const tipo = document.getElementById('capsulaTipo').value;
  const url = document.getElementById('capsulaUrl').value.trim();
  const descripcion = document.getElementById('capsulaDescripcion').value.trim();
  const duracion = parseInt(document.getElementById('capsulaDuracion').value) || 0;
  if (!titulo || !url) {
    mostrarToast('Los campos título y URL son obligatorios', 'warning');
    return;
  }
  try {
    new URL(url);
  } catch (e) {
    mostrarToast('Por favor ingrese una URL válida', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear una cápsula', 'warning');
      return;
    }
    const { data: capsulaData, error: capsulaError } = await supabase
      .from('capsulas')
      .insert([
        {
          curso_id: cursoActual.id,
          titulo,
          tipo,
          url,
          descripcion,
          duracion,
          user_id: user.id
        }
      ])
      .select();
    if (capsulaError) throw capsulaError;
    if (capsulaData && capsulaData.length > 0) {
      capsulas.push(capsulaData[0]);
      renderizarCapsulas();
      document.getElementById('capsulaTitulo').value = '';
      document.getElementById('capsulaUrl').value = '';
      document.getElementById('capsulaDescripcion').value = '';
      document.getElementById('capsulaDuracion').value = '10';
    }
  } catch (error) {
    console.error('Error al agregar cápsula:', error);
    mostrarToast('Error al crear la cápsula: ' + error.message, 'error');
  }
}

async function actualizarCapsula(id) {
  if (!verificarPermiso('update', 'capsulas')) {
    mostrarToast('No tienes permisos para editar cápsulas', 'error');
    return;
  }
  const titulo = document.getElementById('editCapsulaTitulo').value.trim();
  const tipo = document.getElementById('editCapsulaTipo').value;
  const url = document.getElementById('editCapsulaUrl').value.trim();
  const descripcion = document.getElementById('editCapsulaDescripcion').value.trim();
  const duracion = parseInt(document.getElementById('editCapsulaDuracion').value) || 0;
  if (!titulo || !url) {
    mostrarToast('Los campos título y URL son obligatorios', 'warning');
    return;
  }
  try {
    new URL(url);
  } catch (e) {
    mostrarToast('Por favor ingrese una URL válida', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar una cápsula', 'warning');
      return;
    }
    const { data: capsulaData, error } = await supabase
      .from('capsulas')
      .update({
        titulo,
        tipo,
        url,
        descripcion,
        duracion,
        fecha_actualizacion: getChileNowISO()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (capsulaData && capsulaData.length > 0) {
      const index = capsulas.findIndex(c => c.id === id);
      if (index !== -1) {
        capsulas[index] = capsulaData[0];
        renderizarCapsulas();
        cerrarModal();
      }
    }
  } catch (error) {
    console.error('Error al actualizar cápsula:', error);
    mostrarToast('Error al actualizar la cápsula: ' + error.message, 'error');
  }
}

async function eliminarCapsula(id) {
  if (!verificarPermiso('delete', 'capsulas')) {
    mostrarToast('No tienes permisos para eliminar cápsulas', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar esta cápsula?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una cápsula', 'warning');
      return;
    }
    const { error } = await supabase
      .from('capsulas')
      .delete()
      .eq('id', id)

    if (error) throw error;
    capsulas = capsulas.filter(c => c.id !== id);
    renderizarCapsulas();
  } catch (error) {
    console.error('Error al eliminar cápsula:', error);
    mostrarToast('Error al eliminar la cápsula: ' + error.message, 'error');
  }
}

window.agregarEnlace = function (tipo) {
  const isEditMode = tipo.startsWith('edit');
  const baseType = isEditMode ? tipo.replace('edit', '') : tipo;
  let container = document.getElementById(`${tipo}EnlacesContainer`);
  if (!container && isEditMode) {
    container = document.getElementById(`${baseType}EnlacesContainer`);
  }
  if (!container) {
    console.error(`Container not found for type: ${tipo}`);
    return;
  }
  const urlInput = container.querySelector('.enlace-url');
  const textoInput = container.querySelector('.enlace-texto');
  if (!urlInput || !textoInput) {
    console.error('Input elements not found');
    return;
  }
  const url = urlInput.value.trim();
  const texto = textoInput.value.trim() || url;
  if (!url) {
    mostrarToast('Por favor ingrese una URL válida', 'warning');
    return;
  }
  try {
    new URL(url);
  } catch (e) {
    mostrarToast('Por favor ingrese una URL válida (ej: https://ejemplo.com)', 'warning');
    return;
  }
  if (!enlacesTemporales[tipo]) {
    enlacesTemporales[tipo] = [];
  }
  enlacesTemporales[tipo].push({ url, texto });
  actualizarPreviaEnlaces(tipo);
  urlInput.value = '';
  textoInput.value = '';
}

function actualizarPreviaEnlaces(tipo) {
  const previewContainer = document.getElementById(`${tipo}EnlacesPreview`);
  if (!previewContainer) {
    console.error(`Contenedor de vista previa no encontrado para: ${tipo}`);
    return;
  }
  previewContainer.innerHTML = '';
  if (!enlacesTemporales[tipo] || !Array.isArray(enlacesTemporales[tipo])) {
    return;
  }
  enlacesTemporales[tipo].forEach((enlace, index) => {
    const enlaceElement = document.createElement('div');
    enlaceElement.className = 'enlace-preview';
    enlaceElement.innerHTML = `
      <a href="${enlace.url}" target="_blank">
        ${obtenerIconoPorExtension(enlace.url)}
        ${enlace.texto}
      </a>
      <i class="fas fa-times remove-enlace" data-index="${index}"></i>
    `;
    previewContainer.appendChild(enlaceElement);
  });
}

window.eliminarEnlaceTemporal = function (tipo, index) {
  if (!enlacesTemporales[tipo] || !Array.isArray(enlacesTemporales[tipo])) {
    console.error('Array de enlaces no encontrado o inválido');
    return;
  }
  if (index < 0 || index >= enlacesTemporales[tipo].length) {
    console.error('Índice de enlace fuera de rango');
    return;
  }
  enlacesTemporales[tipo].splice(index, 1);
  actualizarPreviaEnlaces(tipo);
};

function renderizarCursos() {
  const lista = document.getElementById('listaCursos');
  const sidebarCursos = document.getElementById('sidebar-cursos');
  if (!lista && !sidebarCursos) return;
  if (lista) lista.innerHTML = '';
  if (sidebarCursos) sidebarCursos.innerHTML = '';
  const userRole = currentUserRole;
  const userId = currentUserId;
  const esAdmin = esRolAdmin(userRole);
  const esProfesor = userRole === ROLES.TEACHER || userRole === ROLES.ASSISTANT;
  const esEstudiante = userRole === ROLES.STUDENT;
  if (esEstudiante && cursos.length === 0) {
    if (lista) lista.innerHTML = `
      <div class="no-courses-message">
        <i class="fas fa-book-open"></i>
        <h2>No estás matriculado en ningún curso</h2>
        <p>Contacta a tu profesor para que te matricule en los cursos correspondientes.</p>
      </div>
    `;
    if (sidebarCursos) sidebarCursos.innerHTML = '<li class="no-items" style="color: white;">No tienes cursos</li>';
    return;
  }
  if (cursos.length === 0) {
    if (lista) lista.innerHTML = '<p class="no-items">No hay cursos registrados.</p>';
    if (sidebarCursos) sidebarCursos.innerHTML = '<li class="no-items" style="color: white;">No hay cursos</li>';
    return;
  }

  function oscurecerColor(hex, cantidad) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const nuevoR = Math.max(0, r - cantidad);
    const nuevoG = Math.max(0, g - cantidad);
    const nuevoB = Math.max(0, b - cantidad);
    return `#${nuevoR.toString(16).padStart(2, '0')}${nuevoG.toString(16).padStart(2, '0')}${nuevoB.toString(16).padStart(2, '0')}`;
  }

  cursos.forEach(curso => {
    const totalGuias = guias.filter(g => g.curso_id === curso.id).length;
    const totalTareas = tareas.filter(t => t.curso_id === curso.id).length;
    const totalCapsulas = capsulas.filter(c => c.curso_id === curso.id).length;
    const esPropietario = curso.user_id === userId;
    const puedeEditar = esAdmin || (esProfesor && esPropietario);
    const puedeEliminar = esAdmin || (esProfesor && esPropietario);
    const esCursoActivo = cursoActual && cursoActual.id === curso.id;
    const colorCurso = curso.color || '#c62828';
    const headerStyle = `
      --course-color: ${colorCurso};
    `;
    if (lista) {
      const cursoElement = document.createElement('div');
      cursoElement.className = 'course-card';
      cursoElement.innerHTML = `
        <div class="course-body" style="${headerStyle}">
          <div class="course-accent" style="background-color:${colorCurso}"></div>
          <div class="course-heading">
            <div>
              <p class="course-kicker">Curso</p>
              <h2 class="course-title">${curso.nombre}</h2>
            </div>
          </div>
          ${curso.descripcion ? `<p class="course-description">${curso.descripcion.substring(0, 96)}${curso.descripcion.length > 96 ? '...' : ''}</p>` : '<p class="course-description">Sin descripción disponible.</p>'}
          <div class="course-stats">
            <span><strong>${totalGuias}</strong><small>Guías</small></span>
            <span><strong>${totalTareas}</strong><small>Tareas</small></span>
            <span><strong>${totalCapsulas}</strong><small>Cápsulas</small></span>
          </div>
          <div class="course-meta">
            <span><i class="far fa-calendar"></i> Creado ${toChileDateTimeString(curso.fecha_creacion)}</span>
          </div>
          <div class="course-actions">
            <button onclick="entrarCurso(${curso.id})" class="btn-entrar icon-btn" title="Entrar al curso" aria-label="Entrar al curso">
              <i class="fas fa-arrow-right"></i>
            </button>
            ${puedeEditar ? `
              <button class="btn-edit icon-btn" onclick="editarCurso(${curso.id})" title="Editar curso" aria-label="Editar curso">
                <i class="fas fa-pen"></i>
              </button>
            ` : ''}
            ${puedeEliminar ? `
              <button class="btn-delete icon-btn" onclick="eliminarCurso(${curso.id})" title="Eliminar curso" aria-label="Eliminar curso">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
      lista.appendChild(cursoElement);
    }
    if (sidebarCursos) {
      const sidebarItem = document.createElement('li');
      sidebarItem.className = `course-item ${esCursoActivo ? 'active' : ''}`;
      sidebarItem.innerHTML = `
        <i class="fas fa-book" style="color: ${colorCurso}"></i>
        <span>${curso.nombre}</span>
      `;
      sidebarItem.addEventListener('click', () => entrarCurso(curso.id));
      sidebarCursos.appendChild(sidebarItem);
    }
  });
  actualizarEstadisticas();
}

function actualizarEstadisticas() {
  const totalCursos = document.getElementById('total-cursos');
  const totalGuias = document.getElementById('total-guias');
  const totalTareas = document.getElementById('total-tareas');
  const totalCapsulas = document.getElementById('total-capsulas');
  if (totalCursos) totalCursos.textContent = cursos.length;
  if (totalGuias) totalGuias.textContent = guias.length;
  if (totalTareas) totalTareas.textContent = tareas.length;
  if (totalCapsulas) totalCapsulas.textContent = capsulas.length;
}

function renderizarGuias() {
  const lista = document.getElementById('listaGuias');
  lista.innerHTML = '';
  if (!cursoActual) return;
  const guiasCurso = guias.filter(g => g.curso_id === cursoActual.id);
  const userRole = currentUserRole;
  const esEstudiante = userRole === ROLES.STUDENT;
  if (guiasCurso.length === 0) {
    lista.innerHTML = `
      <div class="content-empty">
        <i class="fas fa-file-alt"></i>
        <h3>No hay guías publicadas</h3>
        <p>Crea la primera guía para centralizar apuntes, enlaces y archivos del curso.</p>
      </div>
    `;
    return;
  }
  const guiasOrdenadas = [...guiasCurso].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  let contenidoHTML = '<div class="content-card-grid">';
  guiasOrdenadas.forEach(guia => {
    const archivosHTML = guia.archivos && guia.archivos.length > 0 ? `
            <div class="archivos-list">
                ${guia.archivos.map(archivo => `
                    <div class="archivo-item">
                        <a href="${archivo.url}" target="_blank" download="${archivo.nombre}">
                            ${obtenerIconoPorExtension(archivo.nombre)}
                            ${archivo.nombre} (${formatearTamaño(archivo.tamaño)})
                        </a>
                    </div>
                `).join('')}
            </div>
        ` : '<span class="text-muted">N/A</span>';
    const enlacesHTML = guia.enlaces && guia.enlaces.length > 0 ? `
            <div class="enlaces-list">
                ${guia.enlaces.map(enlace => `
                    <div class="enlace-item">
                        <a href="${enlace.url}" target="_blank">
                            ${obtenerIconoPorExtension(enlace.url)}
                            ${enlace.texto || enlace.url}
                        </a>
                    </div>
                `).join('')}
            </div>
        ` : '<span class="text-muted">N/A</span>';
    const accionesHTML = !esEstudiante ? `
            <div class="item-actions-table">
          <button class="btn-edit icon-btn" onclick="editarGuia(${guia.id})" title="Editar" aria-label="Editar guía">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" onclick="eliminarGuia(${guia.id})" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : '';
    contenidoHTML += `
      <article class="content-card guia-card">
        <div class="content-card-top">
          <div class="content-icon"><i class="fas fa-file-alt"></i></div>
          <span class="badge badge-${guia.visibilidad}">
            ${guia.visibilidad === 'publico' ? 'Público' : 'Privado'}
          </span>
        </div>
        <h3>${guia.titulo}</h3>
        <div class="content-meta">
          <span><i class="far fa-calendar"></i> Creado: ${toChileDateTimeString(guia.fecha)}</span>
          ${guia.fecha_actualizacion ? `<span><i class="fas fa-sync-alt"></i> Actualizado: ${toChileDateTimeString(guia.fecha_actualizacion)}</span>` : ''}
        </div>
        <div class="content-preview markdown-preview">${previsualizarMarkdown(guia.contenido)}</div>
        <div class="content-resources">
          <div>
            <h4><i class="fas fa-paperclip"></i> Adjuntos</h4>
            ${archivosHTML}
          </div>
          <div>
            <h4><i class="fas fa-link"></i> Enlaces</h4>
            ${enlacesHTML}
          </div>
        </div>
        ${!esEstudiante ? `<div class="content-actions">${accionesHTML}</div>` : ''}
      </article>
    `;
  });
  contenidoHTML += '</div>';
  lista.innerHTML = contenidoHTML;
}

async function renderizarTareas() {
  const lista = document.getElementById('listaTareas');
  lista.innerHTML = '';
  if (!cursoActual) return;
  const tareasCurso = tareas.filter(t => t.curso_id === cursoActual.id);
  const userRole = currentUserRole;
  const esEstudiante = userRole === ROLES.STUDENT;
  const userId = currentUserId;
  if (tareasCurso.length === 0) {
    lista.innerHTML = `
      <div class="content-empty">
        <i class="fas fa-tasks"></i>
        <h3>No hay tareas publicadas</h3>
        <p>Crea una tarea para definir instrucciones, plazos y recursos de entrega.</p>
      </div>
    `;
    return;
  }
  const tareasOrdenadas = [...tareasCurso].sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite));
  let contenidoHTML = '<div class="content-card-grid">';
  const { data: entregasCurso, error } = await supabase
    .from('entregas')
    .select('*')
    .eq('curso_id', cursoActual.id);
  if (!error) {
    entregas = entregasCurso || [];
  } else {
    entregas = [];
  }
  const badgePorEstado = (clave) => {
    const mapa = {
      completada: 'badge-publico',
      vencida: 'badge-privado',
      proxima: 'badge-owner',
      pendiente: 'badge-inactivo'
    };
    return `badge ${mapa[clave] || 'badge-inactivo'}`;
  };
  for (const tarea of tareasOrdenadas) {
    const fechaLimite = new Date(tarea.fecha_limite);
    const ahora = new Date();
    const diasRestantes = Math.ceil((fechaLimite - ahora) / (1000 * 60 * 60 * 24));
    let textoEstado = '';
    let claveEstado = '';
    if (tarea.completada) {
      textoEstado = `<i class="fas fa-check"></i> Finalizado`;
      claveEstado = 'completada';
    } else if (fechaLimite < ahora) {
      textoEstado = `<i class="fas fa-exclamation-circle"></i> Vencida`;
      claveEstado = 'vencida';
    } else if (diasRestantes <= 3) {
      textoEstado = `<i class="fas fa-clock"></i> Próxima (${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'})`;
      claveEstado = 'proxima';
    } else {
      textoEstado = `<i class="far fa-clock"></i> Pendiente`;
      claveEstado = 'pendiente';
    }
    const entregasTarea = entregas.filter(e => e.tarea_id === tarea.id);
    const totalEntregas = entregasTarea.length || 0;
    const entregasCalificadas = entregasTarea.filter(e => e.estado === 'calificado').length || 0;
    const entregaEstudiante = esEstudiante ? entregasTarea.find(e => e.estudiante_id === userId) : null;
    const archivosHTML = tarea.archivos && tarea.archivos.length > 0 ? `
      <div class="archivos-list">
        ${tarea.archivos.map(archivo => `
          <div class="archivo-item">
            <a href="${archivo.url}" target="_blank" download="${archivo.nombre}">
              ${obtenerIconoPorExtension(archivo.nombre)}
              ${archivo.nombre}
            </a>
          </div>
        `).join('')}
      </div>
    ` : '<span class="text-muted">N/A</span>';
    const enlacesHTML = tarea.enlaces && tarea.enlaces.length > 0 ? `
      <div class="enlaces-list">
        ${tarea.enlaces.map(enlace => `
          <div class="enlace-item">
            <a href="${enlace.url}" target="_blank">
              ${obtenerIconoPorExtension(enlace.url)}
              ${enlace.texto || enlace.url}
            </a>
          </div>
        `).join('')}
      </div>
    ` : '<span class="text-muted">N/A</span>';
    const puedeEditar = verificarPermiso('update', 'tareas');
    const puedeEliminar = verificarPermiso('delete', 'tareas');
    const puedeCalificar = verificarPermiso('update', 'entregas');
    if (esEstudiante) {
      const entregaHTML = entregaEstudiante ? `
        <div class="mi-entrega">
          <span class="${'badge ' + (entregaEstudiante.estado === 'calificado' ? 'badge-publico' : 'badge-owner')}">
            ${entregaEstudiante.estado === 'calificado'
          ? `Calificado: ${Number(entregaEstudiante.calificacion ?? 0).toFixed(1)}/${tarea.puntos}`
          : 'Pendiente'}
          </span>
          ${entregaEstudiante.enlace ? `
            <a href="${entregaEstudiante.enlace}" target="_blank" class="btn-ver-entrega">
              <i class="fas fa-external-link-alt"></i> Ver enlace
            </a>
          ` : ''}
          ${renderizarArchivosEntrega(entregaEstudiante.archivos)}
        </div>
      ` : `
        <button onclick="mostrarFormularioEntrega(${tarea.id}, ${cursoActual.id})" class="btn-entregar">
          <i class="fas fa-plus"></i> Entregar
        </button>
      `;
      contenidoHTML += `
        <article class="content-card tarea-card ${claveEstado}">
          <div class="content-card-top">
            <div class="content-icon"><i class="fas fa-tasks"></i></div>
            <span class="${badgePorEstado(claveEstado)}">${textoEstado}</span>
          </div>
          <h3>${tarea.titulo}</h3>
          <p class="content-description">${tarea.descripcion || 'Sin descripción'}</p>
          <div class="content-meta">
            <span><i class="far fa-calendar-alt"></i> Límite: ${toChileDateTimeString(tarea.fecha_limite)}</span>
            <span><i class="fas fa-star"></i> Nota máxima: ${tarea.puntos}</span>
          </div>
          <div class="content-resources">
            <div>
              <h4><i class="fas fa-link"></i> Enlaces</h4>
              ${enlacesHTML}
            </div>
            <div>
              <h4><i class="fas fa-paperclip"></i> Archivos</h4>
              ${archivosHTML}
            </div>
          </div>
          <div class="student-delivery">${entregaHTML}</div>
        </article>
      `;
    } else {
      const accionesHTML = puedeEditar || puedeEliminar || puedeCalificar ? `
        <div class="item-actions-table">
          ${puedeEditar ? `
            <button class="btn-edit icon-btn" onclick="editarTarea(${tarea.id})" title="Editar" aria-label="Editar tarea">
              <i class="fas fa-edit"></i>
            </button>
          ` : ''}
          ${puedeEliminar ? `
            <button class="delete-btn" onclick="eliminarTarea(${tarea.id})" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      ` : '<span class="text-muted">N/A</span>';
      const entregasHTML = puedeCalificar ? `
        <button onclick="mostrarEntregasModal(${tarea.id})" class="btn-entregas">
          <i class="fas fa-tasks"></i> ${entregasCalificadas}/${totalEntregas} calificadas
        </button>
      ` : '<span class="text-muted">N/A</span>';
      contenidoHTML += `
        <article class="content-card tarea-card ${claveEstado}">
          <div class="content-card-top">
            <div class="content-icon"><i class="fas fa-tasks"></i></div>
            <span class="${badgePorEstado(claveEstado)}">${textoEstado}</span>
          </div>
          <h3>${tarea.titulo}</h3>
          <p class="content-description">${tarea.descripcion || 'Sin descripción'}</p>
          <div class="content-meta">
            <span><i class="far fa-calendar-alt"></i> Límite: ${toChileDateTimeString(tarea.fecha_limite)}</span>
            <span><i class="fas fa-star"></i> Nota máxima: ${tarea.puntos}</span>
          </div>
          <div class="content-resources">
            <div>
              <h4><i class="fas fa-link"></i> Enlaces</h4>
              ${enlacesHTML}
            </div>
            <div>
              <h4><i class="fas fa-paperclip"></i> Archivos</h4>
              ${archivosHTML}
            </div>
          </div>
          <div class="content-footer">
            ${entregasHTML}
            <div class="content-actions">${accionesHTML}</div>
          </div>
        </article>
      `;
    }
  }
  contenidoHTML += '</div>';
  lista.innerHTML = contenidoHTML;
}

async function cargarIntentosTestsCurso() {
  if (!cursoActual) return [];
  try {
    let query = supabase
      .from('test_intentos')
      .select('*')
      .eq('curso_id', cursoActual.id);
    if (currentUserRole === ROLES.STUDENT) {
      query = query.eq('estudiante_id', currentUserId);
    }
    const { data, error } = await query.order('fecha_envio', { ascending: false });
    if (error) throw error;
    testIntentos = data || [];
    return testIntentos;
  } catch (error) {
    console.error('Error al cargar intentos de tests:', error);
    testIntentos = [];
    return [];
  }
}

async function renderizarTests() {
  const lista = document.getElementById('listaTests');
  if (!lista || !cursoActual) return;
  const testsCurso = tests.filter(test => test.curso_id === cursoActual.id && test.estado !== 'archivado');
  const esEstudiante = currentUserRole === ROLES.STUDENT;
  await cargarIntentosTestsCurso();
  if (testsCurso.length === 0) {
    lista.innerHTML = `
      <div class="content-empty">
        <i class="fas fa-clipboard-list"></i>
        <h3>No hay tests publicados</h3>
        <p>Cuando haya evaluaciones disponibles aparecerán en este espacio.</p>
      </div>
    `;
    return;
  }
  const testsOrdenados = [...testsCurso].sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite));
  let contenidoHTML = '<div class="content-card-grid">';
  for (const test of testsOrdenados) {
    const preguntas = Array.isArray(test.preguntas) ? test.preguntas : [];
    const fechaLimite = new Date(test.fecha_limite);
    const vencido = fechaLimite < new Date();
    const intentosTest = testIntentos.filter(intento => String(intento.test_id) === String(test.id));
    const intentoEstudiante = esEstudiante ? intentosTest.find(intento => intento.estudiante_id === currentUserId) : null;
    const corregidos = intentosTest.filter(intento => intento.estado === 'corregido').length;
    const badge = intentoEstudiante
      ? `<span class="badge ${intentoEstudiante.estado === 'corregido' ? 'badge-publico' : 'badge-owner'}">${intentoEstudiante.estado === 'corregido' ? 'Corregido' : 'Enviado'}</span>`
      : vencido
        ? '<span class="badge badge-privado">Vencido</span>'
        : '<span class="badge badge-owner">Disponible</span>';
    const accionesDocente = !esEstudiante ? `
      <div class="content-footer">
        <button onclick="mostrarIntentosTest('${test.id}')" class="btn-entregas">
          <i class="fas fa-clipboard-check"></i> ${corregidos}/${intentosTest.length} corregidos
        </button>
        <div class="content-actions">
          ${verificarPermiso('update', 'tests') ? `
            <button class="btn-edit icon-btn" onclick="editarTest('${test.id}')" title="Editar" aria-label="Editar test">
              <i class="fas fa-edit"></i>
            </button>
          ` : ''}
          ${verificarPermiso('delete', 'tests') ? `
            <button class="delete-btn" onclick="eliminarTest('${test.id}')" title="Eliminar test">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
    ` : '';
    const accionesEstudiante = esEstudiante ? `
      <div class="student-delivery">
        ${intentoEstudiante ? `
          <div class="mi-entrega">
            ${badge}
            <span>${Number(intentoEstudiante.puntaje_obtenido ?? 0).toFixed(1)}/${Number(test.puntaje_total || 0).toFixed(1)} pts</span>
            <button onclick="verResultadoTest('${intentoEstudiante.id}')" class="btn-ver-entrega">
              <i class="fas fa-eye"></i> Ver resultado
            </button>
          </div>
        ` : `
          <button onclick="resolverTest('${test.id}')" class="btn-entregar" ${vencido ? 'disabled' : ''}>
            <i class="fas fa-pen"></i> ${vencido ? 'Plazo vencido' : 'Responder test'}
          </button>
        `}
      </div>
    ` : '';
    contenidoHTML += `
      <article class="content-card test-card ${vencido ? 'vencida' : 'pendiente'}">
        <div class="content-card-top">
          <div class="content-icon"><i class="fas fa-clipboard-list"></i></div>
          ${badge}
        </div>
        <h3>${escaparHtml(test.titulo)}</h3>
        <p class="content-description">${escaparHtml(test.descripcion || 'Sin descripción')}</p>
        <div class="content-meta">
          <span><i class="far fa-calendar-alt"></i> Límite: ${toChileDateTimeString(test.fecha_limite)}</span>
          <span><i class="fas fa-star"></i> Puntaje: ${Number(test.puntaje_total || 0).toFixed(1)}</span>
          <span><i class="fas fa-list-check"></i> ${preguntas.length} ${preguntas.length === 1 ? 'pregunta' : 'preguntas'}</span>
        </div>
        ${accionesEstudiante}
        ${accionesDocente}
      </article>
    `;
  }
  contenidoHTML += '</div>';
  lista.innerHTML = contenidoHTML;
}

function editarTest(id) {
  const test = tests.find(item => String(item.id) === String(id));
  if (!test) return;
  testPreguntasBuilder = normalizarPreguntasTest(test.preguntas || []);
  modalContent.innerHTML = `
    <h2><i class="fas fa-edit"></i> Editar Test</h2>
    <div class="form-container">
      <input type="text" id="editTestTitulo" value="${escaparHtml(test.titulo)}" placeholder="Título del test" required>
      <textarea id="editTestDescripcion" placeholder="Indicaciones generales">${escaparHtml(test.descripcion || '')}</textarea>
      <div class="form-row">
        <label for="editTestFecha"><i class="far fa-calendar-alt"></i> Fecha límite:</label>
        <input type="datetime-local" id="editTestFecha" value="${toChileDateTimeInputValue(test.fecha_limite)}" required>
      </div>
      <div class="form-row">
        <label for="editTestPuntaje"><i class="fas fa-star"></i> Puntaje total:</label>
        <input type="number" id="editTestPuntaje" min="1" step="0.1" value="${Number(test.puntaje_total || 1)}" readonly>
      </div>
      <div class="form-row">
        <label for="editTestEstado"><i class="fas fa-toggle-on"></i> Estado:</label>
        <select id="editTestEstado">
          <option value="publicado" ${test.estado !== 'archivado' ? 'selected' : ''}>Publicado</option>
          <option value="archivado" ${test.estado === 'archivado' ? 'selected' : ''}>Archivado</option>
        </select>
      </div>
      <div class="test-builder">
        <div class="section-header">
          <h3><i class="fas fa-list-check"></i> Preguntas</h3>
          <button type="button" class="btn-secondary" onclick="agregarPreguntaBuilder('editTest')">
            <i class="fas fa-plus"></i> Agregar pregunta
          </button>
        </div>
        <div id="editTestPreguntasBuilder" class="test-question-list"></div>
      </div>
      <button onclick="actualizarTest('${id}')"><i class="fas fa-save"></i> Actualizar Test</button>
    </div>
  `;
  renderizarPreguntasBuilder('editTest');
  modal.style.display = 'block';
}

async function resolverTest(id) {
  const test = tests.find(item => String(item.id) === String(id));
  if (!test) return;
  if (new Date(test.fecha_limite) < new Date()) {
    mostrarToast('El plazo para responder este test ya venció', 'warning');
    return;
  }
  const existente = testIntentos.find(intento => String(intento.test_id) === String(id) && intento.estudiante_id === currentUserId);
  if (existente) {
    mostrarToast('Ya enviaste este test', 'warning');
    return;
  }
  const preguntas = normalizarPreguntasTest(test.preguntas || []);
  modalContent.innerHTML = `
    <div class="test-solve-modal">
      <h2><i class="fas fa-pen"></i> ${escaparHtml(test.titulo)}</h2>
      <p>${escaparHtml(test.descripcion || '')}</p>
      <div class="test-answer-list">
        ${preguntas.map((pregunta, index) => `
          <div class="test-question-card">
            <div class="test-question-head">
              <strong>${index + 1}. ${escaparHtml(pregunta.enunciado)}</strong>
              <span class="badge badge-inactivo">${Number(pregunta.puntaje).toFixed(1)} pts</span>
            </div>
            ${pregunta.tipo === 'multiple' ? `
              <div class="test-options">
                ${pregunta.opciones.map((opcion, opcionIndex) => `
                  <label class="test-option">
                    <input type="radio" name="respuesta-${pregunta.id}" value="${opcionIndex}">
                    <span>${escaparHtml(opcion)}</span>
                  </label>
                `).join('')}
              </div>
            ` : `
              <textarea id="respuesta-${pregunta.id}" placeholder="Escribe tu respuesta"></textarea>
            `}
          </div>
        `).join('')}
      </div>
      <div class="form-actions">
        <button onclick="enviarTest('${id}')" class="auth-submit">
          <i class="fas fa-paper-plane"></i> Enviar Test
        </button>
        <button onclick="cerrarModal()" class="btn-cancelar">
          <i class="fas fa-times"></i> Cancelar
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'block';
}

async function enviarTest(id) {
  const test = tests.find(item => String(item.id) === String(id));
  if (!test) return;
  if (currentUserRole !== ROLES.STUDENT) {
    mostrarToast('Solo estudiantes pueden responder tests', 'error');
    return;
  }
  const preguntas = normalizarPreguntasTest(test.preguntas || []);
  const respuestas = [];
  let puntajeObtenido = 0;
  let requiereCorreccion = false;
  for (const pregunta of preguntas) {
    let respuesta = '';
    let puntaje = null;
    let correcta = null;
    if (pregunta.tipo === 'multiple') {
      const seleccion = document.querySelector(`input[name="respuesta-${pregunta.id}"]:checked`);
      if (!seleccion) {
        mostrarToast('Responde todas las preguntas de selección múltiple', 'warning');
        return;
      }
      respuesta = Number(seleccion.value);
      correcta = respuesta === Number(pregunta.respuesta_correcta);
      puntaje = correcta ? Number(pregunta.puntaje) : 0;
      puntajeObtenido += puntaje;
    } else {
      respuesta = document.getElementById(`respuesta-${pregunta.id}`)?.value.trim() || '';
      if (!respuesta) {
        mostrarToast('Responde todas las preguntas de desarrollo', 'warning');
        return;
      }
      requiereCorreccion = true;
    }
    respuestas.push({
      pregunta_id: pregunta.id,
      tipo: pregunta.tipo,
      respuesta,
      puntaje,
      correcta,
      feedback: ''
    });
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para enviar el test', 'warning');
      return;
    }
    const estado = requiereCorreccion ? 'enviado' : 'corregido';
    const { data, error } = await supabase
      .from('test_intentos')
      .insert([{
        test_id: test.id,
        curso_id: cursoActual.id,
        estudiante_id: user.id,
        email: user.email,
        respuestas,
        puntaje_obtenido: puntajeObtenido,
        estado,
        fecha_envio: getChileNowISO(),
        fecha_correccion: requiereCorreccion ? null : getChileNowISO()
      }])
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      testIntentos.unshift(data[0]);
      cerrarModal();
      await renderizarTests();
      mostrarToast(requiereCorreccion ? 'Test enviado para corrección' : 'Test enviado y corregido automáticamente', 'success');
    }
  } catch (error) {
    console.error('Error al enviar test:', error);
    mostrarToast('Error al enviar el test: ' + error.message, 'error');
  }
}

async function mostrarIntentosTest(testId) {
  const test = tests.find(item => String(item.id) === String(testId));
  if (!test) return;
  try {
    const { data, error } = await supabase
      .from('test_intentos')
      .select('*')
      .eq('test_id', testId)
      .order('fecha_envio', { ascending: false });
    if (error) throw error;
    const usuariosIds = [...new Set((data || []).map(intento => intento.estudiante_id).filter(Boolean))];
    const { data: usuariosData } = usuariosIds.length > 0
      ? await supabase.from('user_roles').select('user_id, nombre, email').in('user_id', usuariosIds)
      : { data: [] };
    const usuariosPorId = new Map((usuariosData || []).map(usuario => [usuario.user_id, usuario]));
    const intentosHTML = (data || []).length === 0
      ? '<p class="no-items">Aún no hay respuestas para este test.</p>'
      : data.map(intento => {
        const estudiante = usuariosPorId.get(intento.estudiante_id);
        return `
          <div class="entrega-item ${intento.estado === 'corregido' ? 'completada' : ''}">
            <div class="entrega-header">
              <h5>${escaparHtml(estudiante?.nombre || estudiante?.email || intento.email || 'Estudiante')}</h5>
              <span class="badge ${intento.estado === 'corregido' ? 'badge-publico' : 'badge-owner'}">${intento.estado === 'corregido' ? 'Corregido' : 'Pendiente de corrección'}</span>
            </div>
            <p class="meta-info">
              <i class="far fa-calendar"></i> Enviado: ${toChileDateTimeString(intento.fecha_envio)}
              | <i class="fas fa-star"></i> ${Number(intento.puntaje_obtenido || 0).toFixed(1)}/${Number(test.puntaje_total || 0).toFixed(1)} pts
            </p>
            <button onclick="corregirIntentoTest('${intento.id}')" class="edit-btn">
              <i class="fas fa-graduation-cap"></i> ${intento.estado === 'corregido' ? 'Editar corrección' : 'Corregir'}
            </button>
          </div>
        `;
      }).join('');
    modalContent.innerHTML = `
      <div class="entregas-modal">
        <h2><i class="fas fa-clipboard-check"></i> Respuestas: ${escaparHtml(test.titulo)}</h2>
        <div class="entregas-container">${intentosHTML}</div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al cargar intentos:', error);
    mostrarToast('Error al cargar respuestas del test: ' + error.message, 'error');
  }
}

async function corregirIntentoTest(intentoId) {
  try {
    const { data: intento, error } = await supabase
      .from('test_intentos')
      .select('*')
      .eq('id', intentoId)
      .single();
    if (error || !intento) throw error || new Error('Intento no encontrado');
    const { data: estudiante } = intento.estudiante_id
      ? await supabase.from('user_roles').select('nombre, email').eq('user_id', intento.estudiante_id).single()
      : { data: null };
    const test = tests.find(item => String(item.id) === String(intento.test_id));
    if (!test) throw new Error('Test no encontrado');
    const preguntas = normalizarPreguntasTest(test.preguntas || []);
    const respuestas = intento.respuestas || [];
    modalContent.innerHTML = `
      <div class="calificacion-modal">
        <h2><i class="fas fa-graduation-cap"></i> Corregir Test</h2>
        <p><strong>Estudiante:</strong> ${escaparHtml(estudiante?.nombre || estudiante?.email || intento.email || 'Estudiante')}</p>
        <div class="test-answer-list">
          ${preguntas.map((pregunta, index) => {
            const respuesta = respuestas.find(item => item.pregunta_id === pregunta.id) || {};
            const respuestaTexto = pregunta.tipo === 'multiple'
              ? pregunta.opciones[Number(respuesta.respuesta)] || 'Sin respuesta'
              : respuesta.respuesta || 'Sin respuesta';
            return `
              <div class="test-question-card">
                <div class="test-question-head">
                  <strong>${index + 1}. ${escaparHtml(pregunta.enunciado)}</strong>
                  <span class="badge badge-inactivo">${Number(pregunta.puntaje).toFixed(1)} pts</span>
                </div>
                <p><strong>Respuesta:</strong> ${escaparHtml(respuestaTexto)}</p>
                ${pregunta.tipo === 'multiple' ? `
                  <p><strong>Correcta:</strong> ${escaparHtml(pregunta.opciones[Number(pregunta.respuesta_correcta)] || '')}</p>
                ` : pregunta.pauta ? `
                  <p><strong>Pauta:</strong> ${escaparHtml(pregunta.pauta)}</p>
                ` : ''}
                <div class="task-meta-grid">
                  <div class="field-group">
                    <label for="puntaje-${pregunta.id}">Puntaje obtenido</label>
                    <input type="number" id="puntaje-${pregunta.id}" min="0" max="${pregunta.puntaje}" step="0.1" value="${respuesta.puntaje ?? (pregunta.tipo === 'multiple' && respuesta.correcta ? pregunta.puntaje : 0)}">
                  </div>
                  <div class="field-group">
                    <label for="feedback-${pregunta.id}">Feedback</label>
                    <textarea id="feedback-${pregunta.id}" placeholder="Comentario para el estudiante">${escaparHtml(respuesta.feedback || '')}</textarea>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <button onclick="guardarCorreccionTest('${intento.id}')" class="auth-submit">
          <i class="fas fa-save"></i> Guardar Corrección
        </button>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al abrir corrección:', error);
    mostrarToast('Error al abrir corrección: ' + error.message, 'error');
  }
}

async function guardarCorreccionTest(intentoId) {
  const intento = testIntentos.find(item => String(item.id) === String(intentoId));
  let intentoCompleto = intento;
  if (!intentoCompleto) {
    const { data } = await supabase.from('test_intentos').select('*').eq('id', intentoId).single();
    intentoCompleto = data;
  }
  const test = tests.find(item => String(item.id) === String(intentoCompleto?.test_id));
  if (!test || !intentoCompleto) return;
  const preguntas = normalizarPreguntasTest(test.preguntas || []);
  const respuestasOriginales = intentoCompleto.respuestas || [];
  let total = 0;
  const respuestas = preguntas.map(pregunta => {
    const respuesta = respuestasOriginales.find(item => item.pregunta_id === pregunta.id) || {};
    const puntaje = Math.min(Number(pregunta.puntaje), Math.max(0, Number(document.getElementById(`puntaje-${pregunta.id}`)?.value || 0)));
    total += puntaje;
    return {
      ...respuesta,
      pregunta_id: pregunta.id,
      tipo: pregunta.tipo,
      puntaje,
      correcta: pregunta.tipo === 'multiple' ? puntaje > 0 : null,
      feedback: document.getElementById(`feedback-${pregunta.id}`)?.value.trim() || ''
    };
  });
  try {
    const { data, error } = await supabase
      .from('test_intentos')
      .update({
        respuestas,
        puntaje_obtenido: total,
        estado: 'corregido',
        fecha_correccion: getChileNowISO(),
        corregido_por: currentUserId
      })
      .eq('id', intentoId)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      const index = testIntentos.findIndex(item => String(item.id) === String(intentoId));
      if (index !== -1) testIntentos[index] = data[0];
      cerrarModal();
      await renderizarTests();
      mostrarToast('Corrección guardada correctamente', 'success');
    }
  } catch (error) {
    console.error('Error al guardar corrección:', error);
    mostrarToast('Error al guardar la corrección: ' + error.message, 'error');
  }
}

async function verResultadoTest(intentoId) {
  try {
    const intentoLocal = testIntentos.find(item => String(item.id) === String(intentoId));
    const intento = intentoLocal || (await supabase.from('test_intentos').select('*').eq('id', intentoId).single()).data;
    if (!intento) return;
    const test = tests.find(item => String(item.id) === String(intento.test_id));
    if (!test) return;
    const preguntas = normalizarPreguntasTest(test.preguntas || []);
    const respuestas = intento.respuestas || [];
    modalContent.innerHTML = `
      <div class="test-result-modal">
        <h2><i class="fas fa-star"></i> Resultado: ${escaparHtml(test.titulo)}</h2>
        <p><strong>Puntaje:</strong> ${Number(intento.puntaje_obtenido || 0).toFixed(1)}/${Number(test.puntaje_total || 0).toFixed(1)} pts</p>
        <p><strong>Estado:</strong> ${intento.estado === 'corregido' ? 'Corregido' : 'Pendiente de corrección'}</p>
        <div class="test-answer-list">
          ${preguntas.map((pregunta, index) => {
            const respuesta = respuestas.find(item => item.pregunta_id === pregunta.id) || {};
            const respuestaTexto = pregunta.tipo === 'multiple'
              ? pregunta.opciones[Number(respuesta.respuesta)] || 'Sin respuesta'
              : respuesta.respuesta || 'Sin respuesta';
            return `
              <div class="test-question-card">
                <div class="test-question-head">
                  <strong>${index + 1}. ${escaparHtml(pregunta.enunciado)}</strong>
                  <span class="badge ${respuesta.correcta ? 'badge-publico' : 'badge-inactivo'}">${respuesta.puntaje ?? 0}/${pregunta.puntaje} pts</span>
                </div>
                <p><strong>Tu respuesta:</strong> ${escaparHtml(respuestaTexto)}</p>
                ${pregunta.tipo === 'multiple' ? `<p><strong>Respuesta correcta:</strong> ${escaparHtml(pregunta.opciones[Number(pregunta.respuesta_correcta)] || '')}</p>` : ''}
                ${respuesta.feedback ? `<p><strong>Feedback:</strong> ${escaparHtml(respuesta.feedback)}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al ver resultado:', error);
    mostrarToast('Error al cargar el resultado', 'error');
  }
}

function renderizarCapsulas() {
  const lista = document.getElementById('listaCapsulas');
  lista.innerHTML = '';
  if (!cursoActual) return;
  const capsulasCurso = capsulas.filter(c => c.curso_id === cursoActual.id);
  const userRole = currentUserRole;
  const esEstudiante = userRole === ROLES.STUDENT;
  if (capsulasCurso.length === 0) {
    lista.innerHTML = `
      <div class="content-empty">
        <i class="fas fa-video"></i>
        <h3>No hay cápsulas publicadas</h3>
        <p>Agrega un video, artículo o presentación para reforzar los contenidos del curso.</p>
      </div>
    `;
    return;
  }
  const capsulasOrdenadas = [...capsulasCurso].sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
  let contenidoHTML = '<div class="content-card-grid">';
  capsulasOrdenadas.forEach(capsula => {
    let tipoBadge = '';
    let tipoIcon = 'fa-video';
    const enlaceRecurso = normalizarUrlRecurso(capsula.url);
    const reproductorHTML = renderizarReproductorCapsula(capsula);
    if (capsula.tipo === 'video') {
      tipoIcon = 'fa-video';
      tipoBadge = '<span class="badge badge-video"><i class="fas fa-video"></i> Video</span>';
    } else if (capsula.tipo === 'articulo') {
      tipoIcon = 'fa-newspaper';
      tipoBadge = '<span class="badge badge-articulo"><i class="fas fa-newspaper"></i> Artículo</span>';
    } else if (capsula.tipo === 'presentacion') {
      tipoIcon = 'fa-file-powerpoint';
      tipoBadge = '<span class="badge badge-presentacion"><i class="fas fa-file-powerpoint"></i> Presentación</span>';
    }
    const accionesHTML = !esEstudiante ? `
            <div class="item-actions-table">
                <button class="btn-edit icon-btn" onclick="editarCapsula(${capsula.id})" title="Editar" aria-label="Editar cápsula"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" onclick="eliminarCapsula(${capsula.id})"><i class="fas fa-trash"></i> </button>
            </div>` : '';
    contenidoHTML += `
      <article class="content-card capsula-card${capsula.tipo === 'video' ? ' capsula-card-video' : ''}">
        <div class="content-card-top">
          <div class="content-icon"><i class="fas ${tipoIcon}"></i></div>
          ${tipoBadge}
        </div>
        <h3>${escaparHtml(capsula.titulo)}</h3>
        ${reproductorHTML}
        <p class="content-description">${capsula.descripcion ? escaparHtml(capsula.descripcion) : 'Sin descripción'}</p>
        <div class="content-meta">
          <span><i class="far fa-calendar"></i> Creado: ${toChileDateTimeString(capsula.fecha_creacion)}</span>
          ${capsula.fecha_actualizacion ? `<span><i class="fas fa-sync-alt"></i> Actualizado: ${toChileDateTimeString(capsula.fecha_actualizacion)}</span>` : ''}
          ${capsula.duracion ? `<span><i class="far fa-clock"></i> ${capsula.duracion} min</span>` : ''}
        </div>
        ${enlaceRecurso ? `<a class="resource-link" href="${escaparHtml(enlaceRecurso)}" target="_blank" rel="noopener noreferrer">
          <i class="fas fa-external-link-alt"></i>
          ${capsula.tipo === 'video' ? 'Abrir video en otra pestaña' : 'Abrir recurso'}
        </a>` : ''}
        ${!esEstudiante ? `<div class="content-actions">${accionesHTML}</div>` : ''}
      </article>
    `;
  });
  contenidoHTML += '</div>';
  lista.innerHTML = contenidoHTML;
}

async function entrarCurso(id) {
  cursoActual = cursos.find(c => c.id === id);
  if (!cursoActual) return;
  const colorCurso = '#c62828';
  const colorOscuro = oscurecerColor(colorCurso, 20);
  document.documentElement.style.setProperty('--curso-color', colorCurso);
  document.documentElement.style.setProperty('--curso-color-oscuro', colorOscuro);
  document.getElementById('curso-titulo').textContent = cursoActual.nombre;
  document.getElementById('curso-descripcion').textContent = cursoActual.descripcion || 'Sin descripción';
  document.getElementById('curso-titulo-presentacion').textContent = cursoActual.nombre;
  document.getElementById('curso-descripcion-presentacion').textContent = cursoActual.descripcion || 'Descripción no disponible';
  obtenerInfoProfesor(cursoActual.user_id).then(profesor => {
    document.getElementById('curso-profesor').textContent = profesor?.nombre || 'Profesor no disponible';
  });
  document.getElementById('curso-fecha-creacion').textContent = toChileDateTimeString(cursoActual.fecha_creacion);
  const guiasCurso = guias.filter(g => g.curso_id === cursoActual.id).length;
  const tareasCurso = tareas.filter(t => t.curso_id === cursoActual.id).length;
  document.getElementById('curso-total-guias').textContent = `${guiasCurso} ${guiasCurso === 1 ? 'guía' : 'guías'}`;
  document.getElementById('curso-total-tareas').textContent = `${tareasCurso} ${tareasCurso === 1 ? 'tarea' : 'tareas'}`;
  document.getElementById('curso-objetivos-content').innerHTML = cursoActual.objetivos
    ? previsualizarMarkdown(cursoActual.objetivos)
    : '<p>No se han definido objetivos para este curso.</p>';
  document.getElementById('curso-requisitos-content').innerHTML = cursoActual.requisitos
    ? previsualizarMarkdown(cursoActual.requisitos)
    : '<p>No hay requisitos previos para este curso.</p>';
  mostrarSeccion('cursoDetalle');
  mostrarSeccionCurso('presentacion');
  await cargarParticipantesCurso();
  renderizarGuias();
  renderizarTareas();
  await renderizarTests();
  renderizarCapsulas();
  renderizarAsistencia();
  renderizarPresentacionCurso();
  await renderizarCertificado();
}

async function cargarParticipantesCurso() {
  if (!cursoActual) return;
  try {
    const { data: inscripciones, error: inscripcionesError } = await supabase
      .from('inscripciones')
      .select(`
        estudiante_id,
        role_in_curso,
        user_roles:estudiante_id (nombre, email, role)
      `)
      .eq('curso_id', cursoActual.id)
      .order('role_in_curso', { ascending: true });
    if (inscripcionesError) throw inscripcionesError;
    const profesores = [];
    const asistentes = [];
    const estudiantes = [];
    inscripciones.forEach(inscripcion => {
      const participante = {
        user_id: inscripcion.estudiante_id,
        nombre: inscripcion.user_roles?.nombre,
        email: inscripcion.user_roles?.email,
        role: inscripcion.role_in_curso || inscripcion.user_roles?.role
      };
      if (inscripcion.role_in_curso === ROLES.TEACHER) {
        profesores.push(participante);
      } else if (inscripcion.role_in_curso === ROLES.ASSISTANT) {
        asistentes.push(participante);
      } else {
        estudiantes.push(participante);
      }
    });
    if (profesores.length === 0 && cursoActual.user_id) {
      const { data: creador, error: creadorError } = await supabase
        .from('user_roles')
        .select('nombre, email')
        .eq('user_id', cursoActual.user_id)
        .single();
      if (!creadorError && creador) {
        profesores.push({
          user_id: cursoActual.user_id,
          nombre: creador.nombre,
          email: creador.email,
          role: ROLES.TEACHER
        });
      }
    }
    renderizarParticipantes(estudiantes, profesores, asistentes);
  } catch (error) {
    console.error('Error al cargar participantes:', error);
    mostrarToast('Error al cargar participantes del curso', 'error');
  }
}

async function obtenerInfoProfesor(userId) {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('nombre, email')
      .eq('user_id', userId)
      .single();
    return error ? null : data;
  } catch (error) {
    console.error('Error al obtener info del profesor:', error);
    return null;
  }
}

async function editarCurso(id) {
  const tienePermiso = await verificarPermisosEdicion('cursos', id);
  if (!tienePermiso) {
    mostrarToast('No tienes permisos para editar este curso', 'error');
    return;
  }
  const curso = cursos.find(c => c.id === id);
  if (!curso) return;
  modalContent.innerHTML = `
        <div class="edit-course-modal">
          <h2><i class="fas fa-edit"></i> Editar Curso</h2>
          <div class="form-container">
            <div class="form-group">
              <label for="editCursoNombre">Nombre</label>
              <input type="text" id="editCursoNombre" value="${curso.nombre}" placeholder="Nombre del curso" required>
            </div>
            <div class="form-group">
              <label for="editCursoDescripcion">Descripción</label>
              <textarea id="editCursoDescripcion" placeholder="Descripción">${curso.descripcion || ''}</textarea>
            </div>
            <div class="form-group edit-course-color">
              <label for="editCursoColor">Color</label>
              <input type="color" id="editCursoColor" value="${curso.color || '#c62828'}">
            </div>
            <button onclick="actualizarCurso(${id})"><i class="fas fa-save"></i> Actualizar Curso</button>
          </div>
        </div>
    `;
  modal.style.display = 'block';
}

function editarGuia(id) {
  const guia = guias.find(g => g.id === id);
  if (!guia) return;
  archivosTemporales.editGuia = [];
  enlacesTemporales.editGuia = [...(guia.enlaces || [])];
  modalContent.innerHTML = `
    <h2><i class="fas fa-edit"></i> Editar Guía</h2>
    <div class="form-container">
      <input type="text" id="editGuiaTitulo" value="${guia.titulo}" placeholder="Título de la guía" required>
      <textarea id="editGuiaContenido" placeholder="Contenido (formato Markdown)" required>${guia.contenido}</textarea>
      <div class="form-row">
        <label for="editGuiaVisibilidad">Visibilidad:</label>
        <select id="editGuiaVisibilidad">
          <option value="publico" ${guia.visibilidad === 'publico' ? 'selected' : ''}>Público</option>
          <option value="privado" ${guia.visibilidad === 'privado' ? 'selected' : ''}>Privado</option>
        </select>
      </div>
      <div class="form-group">
        <label for="editGuiaArchivos"><i class="fas fa-paperclip"></i> Agregar archivos (opcional):</label>
        <input type="file" id="editGuiaArchivos" multiple>
        <div id="editGuiaArchivosPreview" class="files-preview"></div>
      </div>
      ${guia.archivos && guia.archivos.length > 0 ? `
        <div class="form-group">
          <label><i class="fas fa-paperclip"></i> Archivos existentes:</label>
          <div class="archivos-existente">
            ${guia.archivos.map((archivo, index) => `
              <div class="archivo-item">
                <a href="${archivo.url}" target="_blank" download="${archivo.nombre}">
                  ${obtenerIconoPorExtension(archivo.nombre)}
                  ${archivo.nombre} (${formatearTamaño(archivo.tamaño)})
                </a>
                <i class="fas fa-times remove-file" onclick="eliminarArchivoExistente('guia', ${guia.id}, ${index})"></i>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="form-group">
        <label><i class="fas fa-link"></i> Enlaces relacionados:</label>
        <div id="editGuiaEnlacesContainer" class="enlaces-input-container">
          <input type="url" class="enlace-url" placeholder="URL (ej: https://ejemplo.com)">
          <input type="text" class="enlace-texto" placeholder="Texto descriptivo (opcional)">
          <button class="add-enlace-btn" data-tipo="editGuia">
            <i class="fas fa-plus"></i>
          </button>
        </div>
        <div id="editGuiaEnlacesPreview" class="enlaces-preview"></div>
      </div>
      <button onclick="actualizarGuia(${id})"><i class="fas fa-save"></i> Actualizar Guía</button>
    </div>
  `;
  configurarEventDelegation();
  actualizarPreviaEnlaces('editGuia');
  document.getElementById('editGuiaArchivos').addEventListener('change', (e) => {
    manejarSeleccionArchivos(e, 'editGuia');
  });
  modal.style.display = 'block';
}

function editarTarea(id) {
  const tarea = tareas.find(t => t.id === id);
  if (!tarea) return;
  archivosTemporales.editTarea = [];
  enlacesTemporales.editTarea = [...(tarea.enlaces || [])];
  let fechaInputValue = toChileDateTimeInputValue(tarea.fecha_limite);
  modalContent.innerHTML = `
    <h2><i class="fas fa-edit"></i> Editar Tarea</h2>
    <div class="form-container">
      <input type="text" id="editTareaTitulo" value="${tarea.titulo}" placeholder="Título de la tarea" required>
      <textarea id="editTareaDescripcion" placeholder="Descripción detallada" required>${tarea.descripcion}</textarea>
      <div class="form-row">
        <label for="editTareaFecha"><i class="far fa-calendar-alt"></i> Fecha límite:</label>
        <input type="datetime-local" id="editTareaFecha" value="${fechaInputValue}" required>
      </div>
      <div class="form-row">
        <label for="editTareaPuntos"><i class="fas fa-star"></i> Puntos:</label>
        <input type="number" id="editTareaPuntos" min="0" value="${tarea.puntos || 10}">
      </div>
      <div class="form-row">
        <label for="editTareaCompletada"><i class="fas fa-check-circle"></i> Estado:</label>
        <select id="editTareaCompletada">
          <option value="false" ${!tarea.completada ? 'selected' : ''}>Pendiente</option>
          <option value="true" ${tarea.completada ? 'selected' : ''}>Completada</option>
        </select>
      </div>
      <div class="form-group">
        <label for="editTareaArchivos"><i class="fas fa-paperclip"></i> Agregar archivos (opcional):</label>
        <input type="file" id="editTareaArchivos" multiple>
        <div id="editTareaArchivosPreview" class="files-preview"></div>
      </div>
      ${tarea.archivos && tarea.archivos.length > 0 ? `
        <div class="form-group">
          <label><i class="fas fa-paperclip"></i> Archivos existentes:</label>
          <div class="archivos-existente">
            ${tarea.archivos.map((archivo, index) => `
              <div class="archivo-item">
                <a href="${archivo.url}" target="_blank" download="${archivo.nombre}">
                  ${obtenerIconoPorExtension(archivo.nombre)}
                  ${archivo.nombre} (${formatearTamaño(archivo.tamaño)})
                </a>
                <i class="fas fa-times remove-file" onclick="eliminarArchivoExistente('tarea', ${tarea.id}, ${index})"></i>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="form-group">
        <label><i class="fas fa-link"></i> Recursos adicionales:</label>
        <div id="editTareaEnlacesContainer" class="enlaces-input-container">
          <input type="url" class="enlace-url" placeholder="URL (ej: https://ejemplo.com)">
          <input type="text" class="enlace-texto" placeholder="Texto descriptivo (opcional)">
          <button class="add-enlace-btn" data-tipo="editTarea">
            <i class="fas fa-plus"></i>
          </button>
        </div>
        <div id="editTareaEnlacesPreview" class="enlaces-preview"></div>
      </div>
      <button onclick="actualizarTarea(${id})"><i class="fas fa-save"></i> Actualizar Tarea</button>
    </div>
  `;
  configurarEventDelegation();
  actualizarPreviaEnlaces('editTarea');
  document.getElementById('editTareaArchivos').addEventListener('change', (e) => {
    manejarSeleccionArchivos(e, 'editTarea');
  });
  modal.style.display = 'block';
}

function editarCapsula(id) {
  const capsula = capsulas.find(c => c.id === id);
  if (!capsula) return;
  modalContent.innerHTML = `
        <h2><i class="fas fa-edit"></i> Editar Cápsula</h2>
        <div class="form-container">
            <input type="text" id="editCapsulaTitulo" value="${capsula.titulo}" placeholder="Título de la cápsula" required>
            <div class="form-row">
                <label for="editCapsulaTipo"><i class="fas fa-tag"></i> Tipo:</label>
                <select id="editCapsulaTipo">
                    <option value="video" ${capsula.tipo === 'video' ? 'selected' : ''}>Video</option>
                    <option value="articulo" ${capsula.tipo === 'articulo' ? 'selected' : ''}>Artículo</option>
                    <option value="presentacion" ${capsula.tipo === 'presentacion' ? 'selected' : ''}>Presentación</option>
                </select>
            </div>
            <div id="editCapsulaUrlContainer">
                <label for="editCapsulaUrl"><i class="fas fa-link"></i> URL del recurso:</label>
                <input type="url" id="editCapsulaUrl" value="${capsula.url}" required>
            </div>
            <textarea id="editCapsulaDescripcion" placeholder="Descripción y notas">${capsula.descripcion || ''}</textarea>
            <div class="form-row">
                <label for="editCapsulaDuracion"><i class="far fa-clock"></i> Duración (minutos):</label>
                <input type="number" id="editCapsulaDuracion" min="1" value="${capsula.duracion || 10}">
            </div>
            <button onclick="actualizarCapsula(${id})"><i class="fas fa-save"></i> Actualizar Cápsula</button>
        </div>
    `;
  document.getElementById('editCapsulaTipo').addEventListener('change', () => {
    const tipo = document.getElementById('editCapsulaTipo').value;
    const urlContainer = document.getElementById('editCapsulaUrlContainer');
    if (tipo === 'video') {
      urlContainer.innerHTML = `
                <label for="editCapsulaUrl"><i class="fas fa-video"></i> URL del video:</label>
                <input type="url" id="editCapsulaUrl" value="${capsula.url}" required>
            `;
    } else if (tipo === 'articulo') {
      urlContainer.innerHTML = `
                <label for="editCapsulaUrl"><i class="fas fa-newspaper"></i> URL del artículo:</label>
                <input type="url" id="editCapsulaUrl" value="${capsula.url}" required>
            `;
    } else if (tipo === 'presentacion') {
      urlContainer.innerHTML = `
                <label for="editCapsulaUrl"><i class="fas fa-file-powerpoint"></i> URL de la presentación:</label>
                <input type="url" id="editCapsulaUrl" value="${capsula.url}" required>
            `;
    }
  });
  modal.style.display = 'block';
}

function cerrarModal() {
  modal.style.display = 'none';
  claseEditandoId = null;
}

function formatearTamaño(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function previsualizarMarkdown(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^# (.*$)/gm, '<h4>$1</h4>')
    .replace(/\n/g, '<br>');
}

function actualizarFormularioCapsula() {
  const tipo = document.getElementById('capsulaTipo').value;
  const urlContainer = document.getElementById('capsulaUrlContainer');
  if (tipo === 'video') {
    urlContainer.innerHTML = `
            <label for="capsulaUrl"><i class="fas fa-video"></i> URL del video:</label>
            <input type="url" id="capsulaUrl" placeholder="https://youtube.com/ejemplo" required>
        `;
  } else if (tipo === 'articulo') {
    urlContainer.innerHTML = `
            <label for="capsulaUrl"><i class="fas fa-newspaper"></i> URL del artículo:</label>
            <input type="url" id="capsulaUrl" placeholder="https://medium.com/ejemplo" required>
        `;
  } else if (tipo === 'presentacion') {
    urlContainer.innerHTML = `
            <label for="capsulaUrl"><i class="fas fa-file-powerpoint"></i> URL de la presentación:</label>
            <input type="url" id="capsulaUrl" placeholder="https://slideshare.com/ejemplo" required>
        `;
  }
}

window.actualizarRolUsuario = async function () {
  const email = document.getElementById('admin-user-email').value.trim();
  const role = document.getElementById('admin-user-role').value;
  if (!email) {
    mostrarToast('Por favor ingrese un email válido', 'warning');
    return;
  }
  try {
    const { data: user, error: userError } = await supabase
      .from('user_roles')
      .select('user_id')
      .ilike('email', email)
      .single();

    if (userError || !user) {
      throw new Error('Usuario no encontrado');
    }
    const { error } = await supabase
      .from('user_roles')
      .update({ role })
      .eq('user_id', user.user_id);
    if (error) throw error;
    if (user.user_id === currentUserId) {
      await recargarVistaPorCambioRol();
    }
    mostrarToast(`Rol actualizado correctamente a ${role}`, 'success');
    document.getElementById('admin-user-email').value = '';
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    mostrarToast('Error: ' + error.message, 'error');
  }
};

async function verificarPermisosEdicion(entidad, id) {
  const userRole = currentUserRole;
  if (!verificarPermiso('update', entidad)) {
    return false;
  }
  if (esRolAdmin(userRole)) return true;
  const userId = currentUserId;
  try {
    const { data, error } = await supabase
      .from(entidad)
      .select('user_id')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return false;
    return data.user_id === userId;
  } catch (error) {
    console.error('Error al verificar permisos:', error);
    return false;
  }
}

function puedeCrearContenido() {
  return verificarPermiso('create', 'cursos') ||
    verificarPermiso('create', 'guias') ||
    verificarPermiso('create', 'tareas') ||
    verificarPermiso('create', 'tests') ||
    verificarPermiso('create', 'capsulas');
}

function obtenerIconoPorExtension(url) {
  const extension = url.split('.').pop().toLowerCase();
  const iconos = {
    pdf: { icon: 'file-pdf', color: '#e5252a' },
    doc: { icon: 'file-word', color: '#c62828' },
    docx: { icon: 'file-word', color: '#c62828' },
    xls: { icon: 'file-excel', color: '#c62828' },
    xlsx: { icon: 'file-excel', color: '#c62828' },
    ppt: { icon: 'file-powerpoint', color: '#d14424' },
    pptx: { icon: 'file-powerpoint', color: '#d14424' },
    jpg: { icon: 'file-image', color: '#f7921e' },
    jpeg: { icon: 'file-image', color: '#f7921e' },
    png: { icon: 'file-image', color: '#f7921e' },
    gif: { icon: 'file-image', color: '#f7921e' },
    svg: { icon: 'file-image', color: '#f7921e' },
    webp: { icon: 'file-image', color: '#f7921e' },
    mp4: { icon: 'file-video', color: '#ff0000' },
    mov: { icon: 'file-video', color: '#ff0000' },
    avi: { icon: 'file-video', color: '#ff0000' },
    mkv: { icon: 'file-video', color: '#ff0000' },
    webm: { icon: 'file-video', color: '#ff0000' },
    mp3: { icon: 'file-audio', color: '#c62828' },
    wav: { icon: 'file-audio', color: '#c62828' },
    ogg: { icon: 'file-audio', color: '#c62828' },
    flac: { icon: 'file-audio', color: '#c62828' },
    zip: { icon: 'file-archive', color: '#9c27b0' },
    rar: { icon: 'file-archive', color: '#9c27b0' },
    '7z': { icon: 'file-archive', color: '#9c27b0' },
    tar: { icon: 'file-archive', color: '#9c27b0' },
    gz: { icon: 'file-archive', color: '#9c27b0' },
    txt: { icon: 'file-alt', color: '#8f5555' },
    md: { icon: 'file-alt', color: '#8f5555' },
    csv: { icon: 'file-csv', color: '#e53935' },
    tsv: { icon: 'file-csv', color: '#e53935' },
    json: { icon: 'file-code', color: '#fbc02d' },
    html: { icon: 'file-code', color: '#e44d26' },
    css: { icon: 'file-code', color: '#c62828' },
    js: { icon: 'file-code', color: '#f7df1e' },
    ts: { icon: 'file-code', color: '#c62828' },
    py: { icon: 'file-code', color: '#c62828' },
    ipynb: { icon: 'file-code', color: '#c62828' },
    java: { icon: 'file-code', color: '#c62828' },
    php: { icon: 'file-code', color: '#777bb4' },
    rb: { icon: 'file-code', color: '#cc342d' },
    cpp: { icon: 'file-code', color: '#c62828' },
    cs: { icon: 'file-code', color: '#68217a' },
    go: { icon: 'file-code', color: '#d32f2f' },
    swift: { icon: 'file-code', color: '#f05138' }
  };
  if (iconos[extension]) {
    return `<i class="fas fa-${iconos[extension].icon} file-icon" style="color: ${iconos[extension].color}"></i>`;
  }
  return `<i class="fas fa-file file-icon" style="color: #8f5555"></i>`;
}

async function renderizarCalendario() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  const { data: tareas, error } = await supabase
    .from('tareas')
    .select('*');
  if (error) {
    console.error('Error al cargar tareas:', error);
    return;
  }
  const eventos = tareas.map(tarea => {
    const fechaLocal = toChileDateTimeInputValue(tarea.fecha_limite);
    const vencida = new Date(tarea.fecha_limite) < new Date();
    return {
      title: tarea.titulo,
      start: fechaLocal,
      end: fechaLocal,
      allDay: false,
      backgroundColor: tarea.completada ? '#e53935' : vencida ? '#b83b3b' : '#c62828',
      borderColor: tarea.completada ? '#e53935' : vencida ? '#b83b3b' : '#c62828',
      textColor: '#ffffff',
      extendedProps: {
        descripcion: tarea.descripcion,
        curso_id: tarea.curso_id,
        fechaOriginal: tarea.fecha_limite
      }
    };
  });
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    buttonText: {
      today: 'Hoy',
      month: 'Mes',
      week: 'Semana',
      day: 'Día'
    },
    height: 'auto',
    dayMaxEvents: 3,
    nowIndicator: true,
    events: eventos,
    eventClick: function (info) {
      mostrarDetalleTarea(info.event);
    }
  });
  calendar.render();
}

function mostrarDetalleTarea(evento) {
  modalContent.innerHTML = `
    <div class="evento-detalle">
      <h2>${evento.title}</h2>
      <p><strong>Fecha límite:</strong> ${toChileDateTimeString(evento.extendedProps.fechaOriginal)}</p>
      <p><strong>Estado:</strong> ${evento.backgroundColor === '#e53935' ? 'Completada' : 'Pendiente'}</p>
      <p><strong>Descripción:</strong> ${evento.extendedProps.descripcion}</p>
      <button onclick="mostrarSeccion('cursos'); entrarCurso(${evento.extendedProps.curso_id}); cerrarModal();">
        Ir al curso
      </button>
    </div>
  `;
  modal.style.display = 'block';
}
async function renderizarVideochat(opciones = {}) {
  const { targetId = 'lista-reuniones', cursoId = null } = opciones;
  const listaReuniones = document.getElementById(targetId);
  if (!listaReuniones) return;
  listaReuniones.innerHTML = '<p>Cargando clases en vivo...</p>';
  try {
    let reunionesQuery = supabase
      .from('reuniones')
      .select('*')
      .order('fecha_hora', { ascending: true });
    if (cursoId) {
      reunionesQuery = reunionesQuery.eq('curso_id', cursoId);
    }
    const { data: reuniones, error: reunionesError } = await reunionesQuery;
    if (reunionesError) throw reunionesError;
    const puedeCrear = verificarPermiso('create', 'reuniones') && cursoId;
    if (reuniones.length === 0) {
      listaReuniones.innerHTML = `
        ${puedeCrear ? `
          <div class="live-class-toolbar">
            <button class="btn-primary" onclick="crearReunionCursoActual()">
              <i class="fas fa-plus"></i> Programar clase en vivo
            </button>
          </div>
        ` : ''}
        <div class="videochat-empty">
          <i class="fas fa-video"></i>
          <h3>No hay clases en vivo programadas por el momento.</h3>
          <p>Las próximas sesiones y grabaciones aparecerán aquí cuando estén disponibles.</p>
        </div>
      `;
      return;
    }
    const userIds = [...new Set(reuniones.map(r => r.user_id).filter(Boolean))];
    let usuarios = [];
    if (userIds.length > 0) {
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('user_roles')
        .select('user_id, nombre, email')
        .in('user_id', userIds);
      if (usuariosError) throw usuariosError;
      usuarios = usuariosData || [];
    }
    const usuariosMap = usuarios.reduce((map, user) => {
      map[user.user_id] = user;
      return map;
    }, {});
    const ahora = new Date();
    const proximas = reuniones.filter(reunion => new Date(reunion.fecha_hora) >= ahora);
    const pasadas = reuniones.filter(reunion => new Date(reunion.fecha_hora) < ahora);
    let reunionesHTML = `
      ${puedeCrear ? `
        <div class="live-class-toolbar">
          <button class="btn-primary" onclick="crearReunionCursoActual()">
            <i class="fas fa-plus"></i> Programar clase en vivo
          </button>
        </div>
      ` : ''}
      <div class="meetings-summary live-class-summary">
        <div>
          <strong>${proximas.length}</strong>
          <span>${proximas.length === 1 ? 'próxima sesión' : 'próximas sesiones'}</span>
        </div>
        <div>
          <strong>${pasadas.length}</strong>
          <span>${pasadas.length === 1 ? 'grabación potencial' : 'grabaciones potenciales'}</span>
        </div>
      </div>
      <div class="live-class-tabs">
        <section class="live-class-block active">
          <h3><i class="fas fa-calendar-day"></i> Próximas sesiones</h3>
          <div class="meetings-grid">
    `;
    const renderReunion = (reunion) => {
      const creador = usuariosMap[reunion.user_id] || { nombre: 'Usuario Desconocido', email: '' };
      const fechaHora = toChileDateTimeString(reunion.fecha_hora);
      const puedeAdministrar = puedeAdministrarReuniones(reunion.user_id);
      const enlaceVideollamada = obtenerEnlaceReunion(reunion);
      const grabacionUrl = obtenerGrabacionReunion(reunion);
      const accionesHTML = `
        <div class="item-actions-table reunion-actions">
          ${enlaceVideollamada ? `
            <a href="${enlaceVideollamada}" class="btn-primary clase-videollamada-icon" title="Abrir videollamada" target="_blank" rel="noopener noreferrer">
              <i class="fas fa-video"></i>
              <span>Acceder</span>
            </a>
          ` : ''}
          <button class="btn-unirse" onclick="unirseReunion('${reunion.id}')" title="Unirse a la reunión">
            <i class="fas fa-desktop"></i> Sala interna
          </button>
          ${grabacionUrl ? `
            <a href="${grabacionUrl}" class="btn-secondary" title="Ver grabación" target="_blank" rel="noopener noreferrer">
              <i class="fas fa-circle-play"></i> Grabación
            </a>
          ` : ''}
          ${puedeAdministrar ? `
            <button class="delete-btn" onclick="eliminarReunion('${reunion.id}')" title="Eliminar reunión">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      `;
      reunionesHTML += `
        <article class="meeting-card">
          <div class="meeting-icon"><i class="fas fa-video"></i></div>
          <div class="meeting-content">
            <div class="meeting-title-row">
              <h3>${reunion.titulo}</h3>
              <span class="badge badge-puntos">${reunion.estado}</span>
            </div>
            <p>${reunion.descripcion || 'Sin descripción'}</p>
            <div class="meeting-meta">
              <span><i class="far fa-calendar-alt"></i> ${fechaHora}</span>
              <span><i class="fas fa-user"></i> ${creador.nombre || creador.email}</span>
              ${enlaceVideollamada ? '<span><i class="fas fa-link"></i> Videoconferencia configurada</span>' : '<span><i class="fas fa-video-slash"></i> Sin enlace externo</span>'}
            </div>
          </div>
          <div class="meeting-actions">${accionesHTML}</div>
        </article>
      `;
    };
    reunionesHTML += proximas.length
      ? proximas.map(renderReunion).join('')
      : '<div class="videochat-empty inline-empty"><p>No hay clases en vivo programadas por el momento.</p></div>';
    reunionesHTML += `
          </div>
        </section>
        <section class="live-class-block">
          <h3><i class="fas fa-circle-play"></i> Grabaciones</h3>
          <div class="meetings-grid">
            ${pasadas.length
        ? pasadas.map(renderReunion).join('')
        : '<div class="videochat-empty inline-empty"><p>No hay grabaciones de sesiones anteriores.</p></div>'}
          </div>
        </section>
        <section class="live-class-block">
          <h3><i class="fas fa-calendar-alt"></i> Calendario</h3>
          <div class="live-calendar-list">
            ${reuniones.map(reunion => `
              <div class="live-calendar-item">
                <span>${toChileDateTimeString(reunion.fecha_hora)}</span>
                <strong>${escaparHtml(reunion.titulo)}</strong>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    `;
    listaReuniones.innerHTML = reunionesHTML;
  } catch (error) {
    console.error('Error al cargar reuniones:', error);
    listaReuniones.innerHTML = '<p class="no-items error-msg">Hubo un problema al cargar las reuniones. Por favor, intenta de nuevo.</p>';
  }
}

async function renderizarReunionesCurso() {
  if (!cursoActual) return;
  await renderizarVideochat({
    targetId: 'lista-reuniones-curso',
    cursoId: cursoActual.id
  });
}

function unirseReunion(reunionId) {
  modalContent.innerHTML = `
    <div class="videochat-container">
      <h2>Uniéndose a la reunión</h2>
      <div id="videochat-frame"></div>
      <button onclick="cerrarModal()" class="btn-salir">
        <i class="fas fa-sign-out-alt"></i> Salir
      </button>
    </div>
  `;
  const domain = 'meet.jit.si';
  const options = {
    roomName: `adecca-Reunion-${reunionId}`,
    width: '100%',
    height: 500,
    parentNode: document.querySelector('#videochat-frame')
  };
  const api = new JitsiMeetExternalAPI(domain, options);
  modal.style.display = 'block';
}

function puedeAdministrarReuniones(creadorId) {
  const userId = currentUserId;
  return verificarPermiso('delete', 'reuniones') &&
    (creadorId === userId || verificarPermiso('admin', 'reuniones'));
}

function getGradeClass(calificacion, puntosMaximos = 7.0) {
  if (calificacion === null || calificacion === undefined) return 'no-grade';
  if (calificacion >= 6.0) return 'grade-excellent';
  if (calificacion >= 5.0) return 'grade-good';
  if (calificacion >= 4.0) return 'grade-average';
  return 'grade-poor';
}

async function cargarCalificacionesCurso(cursoId, tablaCalificaciones) {
  if (!cursoId || !tablaCalificaciones) return;
  tablaCalificaciones.innerHTML = '<div class="grades-loading"><i class="fas fa-spinner fa-spin"></i> Cargando calificaciones...</div>';
  try {
    const { data: estudiantes, error: estudiantesError } = await supabase
      .from('inscripciones')
      .select('estudiante_id, user_roles:estudiante_id(nombre, email)')
      .eq('curso_id', cursoId)
      .eq('role_in_curso', 'student')
      .order('nombre', { referencedTable: 'user_roles', ascending: true });
    if (estudiantesError) throw estudiantesError;
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('id, titulo')
      .eq('curso_id', cursoId)
      .order('fecha_limite', { ascending: true });
    if (tareasError) throw tareasError;
    const { data: entregas, error: entregasError } = await supabase
      .from('entregas')
      .select('*')
      .eq('curso_id', cursoId);
    if (entregasError) throw entregasError;
    if (estudiantes.length === 0) {
      tablaCalificaciones.innerHTML = `
        <div class="grades-empty">
          <i class="fas fa-user-graduate"></i>
          <h3>No hay estudiantes matriculados</h3>
          <p>Matricula estudiantes para generar el libro de calificaciones.</p>
        </div>
      `;
      return;
    }
    if (tareas.length === 0) {
      tablaCalificaciones.innerHTML = `
        <div class="grades-empty">
          <i class="fas fa-tasks"></i>
          <h3>No hay tareas evaluables</h3>
          <p>Crea tareas para comenzar a registrar y revisar calificaciones.</p>
        </div>
      `;
      return;
    }
    const totalCeldas = estudiantes.length * tareas.length;
    const totalCalificadas = entregas.filter(e => e.calificacion !== null && e.calificacion !== undefined).length;
    const avance = totalCeldas > 0 ? Math.round((totalCalificadas / totalCeldas) * 100) : 0;
    let html = `
      <div class="grades-summary">
        <div class="grade-stat">
          <strong>${estudiantes.length}</strong>
          <span>Estudiantes</span>
        </div>
        <div class="grade-stat">
          <strong>${tareas.length}</strong>
          <span>Tareas</span>
        </div>
        <div class="grade-stat">
          <strong>${avance}%</strong>
          <span>Avance de calificación</span>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table content-table grades-book-table">
          <thead>
            <tr>
              <th>Estudiante</th>
              ${tareas.map(tarea => `<th>${tarea.titulo}</th>`).join('')}
              <th>Promedio Final</th>
            </tr>
          </thead>
          <tbody>
    `;
    estudiantes.forEach(estudiante => {
      let totalObtenido = 0;
      let tareasCalificadas = 0;
      const nombreEstudiante = estudiante.user_roles?.nombre || estudiante.user_roles?.email || 'Desconocido';
      const celdasTareas = tareas.map(tarea => {
        const entrega = entregas.find(e =>
          e.tarea_id === tarea.id && e.estudiante_id === estudiante.estudiante_id
        );
        if (entrega && entrega.calificacion !== null) {
          totalObtenido += entrega.calificacion;
          tareasCalificadas++;
          return `<td data-label="${tarea.titulo}" class="grade-cell ${getGradeClass(entrega.calificacion)}">
            ${entrega.calificacion.toFixed(1)}
          </td>`;
        }
        return `<td data-label="${tarea.titulo}" class="grade-cell no-grade">-</td>`;
      }).join('');
      const promedio = tareasCalificadas > 0
        ? (totalObtenido / tareasCalificadas).toFixed(1)
        : null;
      html += `
        <tr>
          <td data-label="Estudiante"><strong>${nombreEstudiante}</strong></td>
          ${celdasTareas}
          <td data-label="Promedio Final" class="final-grade ${promedio ? getGradeClass(parseFloat(promedio)) : 'no-grade'}">
            <strong>${promedio !== null ? promedio : '-'}</strong>
          </td>
        </tr>
      `;
    });
    html += `
          </tbody>
        </table>
      </div>
    `;
    tablaCalificaciones.innerHTML = html;
    tablaCalificaciones.insertAdjacentHTML('beforeend', `
      <div class="grades-actions">
        <button onclick="exportarCalificaciones('${cursoId}')" class="btn-export">
          <i class="fas fa-file-export"></i> Exportar a CSV
        </button>
      </div>
    `);
  } catch (error) {
    console.error('Error al cargar calificaciones:', error);
    tablaCalificaciones.innerHTML = '<p class="no-items error-msg">Error al cargar calificaciones.</p>';
  }
}

async function renderizarNotasCurso() {
  if (!cursoActual) return;
  const tablaCalificaciones = document.getElementById('tabla-calificaciones-curso');
  await cargarCalificacionesCurso(cursoActual.id, tablaCalificaciones);
}

async function renderizarCalificaciones() {
  const tablaCalificaciones = document.getElementById('tabla-calificaciones');
  const cursoSelect = document.getElementById('curso-select-grades');
  if (!tablaCalificaciones || !cursoSelect) return;
  tablaCalificaciones.innerHTML = `
    <div class="grades-empty">
      <i class="fas fa-chart-column"></i>
      <h3>Selecciona un curso</h3>
      <p>Las calificaciones aparecerán aquí cuando elijas un curso con tareas y estudiantes.</p>
    </div>
  `;
  try {
    const { data: cursosData, error: cursosError } = await supabase
      .from('cursos')
      .select('id, nombre');
    if (cursosError) throw cursosError;
    cursoSelect.innerHTML = '<option value="">Seleccionar curso...</option>';
    cursosData.forEach(curso => {
      cursoSelect.innerHTML += `<option value="${curso.id}">${curso.nombre}</option>`;
    });
  } catch (error) {
    console.error('Error al cargar cursos:', error);
    cursoSelect.innerHTML = '<option value="">Error al cargar cursos</option>';
  }
  cursoSelect.addEventListener('change', async (e) => {
    const cursoId = e.target.value;
    tablaCalificaciones.innerHTML = '';
    if (!cursoId) {
      tablaCalificaciones.innerHTML = `
        <div class="grades-empty">
          <i class="fas fa-chart-column"></i>
          <h3>Selecciona un curso</h3>
          <p>Las calificaciones aparecerán aquí cuando elijas un curso con tareas y estudiantes.</p>
        </div>
      `;
      return;
    }
    tablaCalificaciones.innerHTML = '<div class="grades-loading"><i class="fas fa-spinner fa-spin"></i> Cargando calificaciones...</div>';
    try {
      const { data: estudiantes, error: estudiantesError } = await supabase
        .from('inscripciones')
        .select('estudiante_id, user_roles:estudiante_id(nombre, email)')
        .eq('curso_id', cursoId)
        .eq('role_in_curso', 'student')
        .order('nombre', { referencedTable: 'user_roles', ascending: true });
      if (estudiantesError) throw estudiantesError;
      const { data: tareas, error: tareasError } = await supabase
        .from('tareas')
        .select('id, titulo')
        .eq('curso_id', cursoId)
        .order('fecha_limite', { ascending: true });
      if (tareasError) throw tareasError;
      const { data: entregas, error: entregasError } = await supabase
        .from('entregas')
        .select('*')
        .eq('curso_id', cursoId);
      if (entregasError) throw entregasError;
      if (estudiantes.length === 0) {
        tablaCalificaciones.innerHTML = `
          <div class="grades-empty">
            <i class="fas fa-user-graduate"></i>
            <h3>No hay estudiantes matriculados</h3>
            <p>Matricula estudiantes para generar el libro de calificaciones.</p>
          </div>
        `;
        return;
      }
      if (tareas.length === 0) {
        tablaCalificaciones.innerHTML = `
          <div class="grades-empty">
            <i class="fas fa-tasks"></i>
            <h3>No hay tareas evaluables</h3>
            <p>Crea tareas para comenzar a registrar y revisar calificaciones.</p>
          </div>
        `;
        return;
      }
      const totalCeldas = estudiantes.length * tareas.length;
      const totalCalificadas = entregas.filter(e => e.calificacion !== null && e.calificacion !== undefined).length;
      const avance = totalCeldas > 0 ? Math.round((totalCalificadas / totalCeldas) * 100) : 0;
      let html = `
        <div class="grades-summary">
          <div class="grade-stat">
            <strong>${estudiantes.length}</strong>
            <span>Estudiantes</span>
          </div>
          <div class="grade-stat">
            <strong>${tareas.length}</strong>
            <span>Tareas</span>
          </div>
          <div class="grade-stat">
            <strong>${avance}%</strong>
            <span>Avance de calificación</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table content-table grades-book-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                ${tareas.map(tarea => `<th>${tarea.titulo}</th>`).join('')}
                <th>Promedio Final</th>
              </tr>
            </thead>
            <tbody>
      `;
      estudiantes.forEach(estudiante => {
        let totalObtenido = 0;
        let tareasCalificadas = 0;
        const nombreEstudiante = estudiante.user_roles?.nombre || estudiante.user_roles?.email || 'Desconocido';
        const celdasTareas = tareas.map(tarea => {
          const entrega = entregas.find(e =>
            e.tarea_id === tarea.id && e.estudiante_id === estudiante.estudiante_id
          );
          if (entrega && entrega.calificacion !== null) {
            totalObtenido += entrega.calificacion;
            tareasCalificadas++;
            return `<td data-label="${tarea.titulo}" class="grade-cell ${getGradeClass(entrega.calificacion)}">
              ${entrega.calificacion.toFixed(1)}
            </td>`;
          } else {
            return `<td data-label="${tarea.titulo}" class="grade-cell no-grade">-</td>`;
          }
        }).join('');
        const promedio = tareasCalificadas > 0
          ? (totalObtenido / tareasCalificadas).toFixed(1)
          : null;
        html += `
          <tr>
            <td data-label="Estudiante"><strong>${nombreEstudiante}</strong></td>
            ${celdasTareas}
            <td data-label="Promedio Final" class="final-grade ${promedio ? getGradeClass(parseFloat(promedio)) : 'no-grade'}">
              <strong>${promedio !== null ? promedio : '-'}</strong>
            </td>
          </tr>
        `;
      });
      html += `
            </tbody>
          </table>
        </div>
      `;
      tablaCalificaciones.innerHTML = html;
      if (estudiantes.length > 0 && tareas.length > 0) {
        tablaCalificaciones.insertAdjacentHTML('beforeend', `
          <div class="grades-actions">
            <button onclick="exportarCalificaciones()" class="btn-export">
              <i class="fas fa-file-export"></i> Exportar a CSV
            </button>
          </div>
        `);
      }
    } catch (error) {
      console.error('Error al cargar calificaciones:', error);
      tablaCalificaciones.innerHTML = '<p class="no-items error-msg">Error al cargar calificaciones.</p>';
    }
  });
}

async function exportarCalificaciones(cursoIdParam = null) {
  const cursoId = cursoIdParam || document.getElementById('curso-select-grades')?.value;
  if (!cursoId) {
    mostrarToast('Selecciona un curso primero', 'warning');
    return;
  }
  try {
    const [
      { data: estudiantes },
      { data: tareas },
      { data: entregas }
    ] = await Promise.all([
      supabase.from('user_roles').select('user_id, nombre, email').eq('role', ROLES.STUDENT).order('nombre', { ascending: true }),
      supabase.from('tareas').select('id, titulo').eq('curso_id', cursoId).order('fecha_limite', { ascending: true }),
      supabase.from('entregas').select('*').eq('curso_id', cursoId)
    ]);
    let csvContent = "Estudiante," +
      tareas.map(t => `"${t.titulo} (Máx: 7.0)"`).join(",") +
      ",Promedio Final\n";
    estudiantes.forEach(estudiante => {
      const estudianteName = estudiante.nombre || estudiante.email;
      const row = [estudianteName];
      let totalObtenido = 0;
      let tareasCalificadas = 0;
      tareas.forEach(tarea => {
        const entrega = entregas.find(e =>
          e.tarea_id === tarea.id && e.estudiante_id === estudiante.user_id
        );
        if (entrega && entrega.calificacion !== null) {
          totalObtenido += entrega.calificacion;
          tareasCalificadas++;
          row.push(entrega.calificacion.toFixed(1));
        } else {
          row.push("-");
        }
      });
      const promedio = tareasCalificadas > 0
        ? (totalObtenido / tareasCalificadas).toFixed(1)
        : null;
      row.push(promedio !== null ? promedio : "-");
      csvContent += row.map(r => `"${r}"`).join(",") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `calificaciones_curso_${cursoId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error al exportar calificaciones:', error);
    mostrarToast('Error al exportar calificaciones', 'error');
  }
}

function puedeAdministrarParticipantes() {
  return verificarPermiso('update', 'participantes') ||
    verificarPermiso('delete', 'participantes');
}

function renderizarParticipantes(estudiantes = [], profesores = [], asistentes = []) {
  const listaParticipantes = document.getElementById('lista-participantes');
  if (!listaParticipantes) return;
  const totalParticipantes = estudiantes.length + profesores.length + asistentes.length;
  if (totalParticipantes === 0) {
    listaParticipantes.innerHTML = `
      <div class="participants-empty">
        <i class="fas fa-users"></i>
        <h3>Aún no hay participantes</h3>
        <p>Matricula estudiantes o asistentes para comenzar a gestionar el curso.</p>
      </div>
    `;
    return;
  }
  const todosLosParticipantes = [
    ...profesores.map(p => ({ ...p, rol: 'Profesor', claseRol: 'teacher', icono: 'fa-chalkboard-teacher' })),
    ...asistentes.map(a => ({ ...a, rol: 'Asistente', claseRol: 'assistant', icono: 'fa-user-tie' })),
    ...estudiantes.map(e => ({ ...e, rol: 'Estudiante', claseRol: 'student', icono: 'fa-user-graduate' })),
  ];
  let participantesHTML = `
    <div class="participants-summary">
      <div class="participant-stat">
        <strong>${totalParticipantes}</strong>
        <span>Total</span>
      </div>
      <div class="participant-stat">
        <strong>${profesores.length}</strong>
        <span>Profesores</span>
      </div>
      <div class="participant-stat">
        <strong>${asistentes.length}</strong>
        <span>Asistentes</span>
      </div>
      <div class="participant-stat">
        <strong>${estudiantes.length}</strong>
        <span>Estudiantes</span>
      </div>
    </div>
    <div class="participants-card-grid">
  `;
  todosLosParticipantes.forEach(participante => {
    const puedeEliminar = verificarPermiso('delete', 'inscripciones');
    const accionesHTML = puedeEliminar ? `
      <div class="item-actions-table">
        <button onclick="eliminarInscripcion('${cursoActual.id}', '${participante.user_id}')" class="btn-delete" title="Eliminar del curso">
          <i class="fas fa-user-minus"></i>
        </button>
      </div>
    ` : '<span class="text-muted">N/A</span>';
    const creadorBadge = participante.rol === 'Profesor' && participante.user_id === cursoActual?.user_id
      ? '<span class="badge badge-owner" title="Creador del curso">Creador</span>'
      : '';
    participantesHTML += `
      <article class="participant-card-modern participant-row-${participante.claseRol}">
        <div class="participant-avatar-modern">
          <i class="fas ${participante.icono}"></i>
        </div>
        <div class="participant-main">
          <div class="participant-name-line">
            <h3>${participante.nombre || participante.email}</h3>
            ${creadorBadge}
          </div>
          <a href="mailto:${participante.email}" class="participant-email">${participante.email}</a>
          <span class="role-badge role-${participante.claseRol}">
            <i class="fas ${participante.icono}"></i> ${participante.rol}
          </span>
        </div>
        <div class="participant-card-actions">${accionesHTML}</div>
      </article>
    `;
  });
  participantesHTML += '</div>';
  listaParticipantes.innerHTML = participantesHTML;
}

function puedeDesmatricular(estudianteId) {
  const userRole = currentUserRole;
  if (esRolAdmin(userRole)) return true;
  if (userRole === ROLES.TEACHER) {
    return true;
  }
  return false;
}

function puedeMatricular(estudianteId) {
  const userRole = currentUserRole;

  // Admins pueden matricular a cualquiera
  if (esRolAdmin(userRole)) return true;

  // Profesores pueden matricular en sus cursos
  if (userRole === ROLES.TEACHER) return true;

  return false;
}

async function mostrarFormularioInscripcion(estudianteId = null) {
  if (!cursoActual) {
    mostrarToast('Debes seleccionar un curso primero', 'warning');
    return;
  }
  if (!verificarPermiso('create', 'inscripciones')) {
    mostrarToast('No tienes permisos para matricular participantes', 'error');
    return;
  }
  try {
    const { data: inscripciones, error: inscripcionesError } = await supabase
      .from('inscripciones')
      .select('estudiante_id')
      .eq('curso_id', cursoActual.id);
    if (inscripcionesError) throw inscripcionesError;
    const usuariosInscritosIds = inscripciones.map(i => i.estudiante_id);
    const idsParaFiltrar = usuariosInscritosIds.length > 0
      ? usuariosInscritosIds
      : ['00000000-0000-0000-0000-000000000000']; // UUID dummy
    let query = supabase
      .from('user_roles')
      .select('user_id, nombre, email, role')
      .not('user_id', 'in', `(${idsParaFiltrar.join(',')})`)
      .order('nombre', { ascending: true });
    if (estudianteId) {
      query = query.eq('user_id', estudianteId);
    }
    const { data: usuarios, error: usuariosError } = await query;
    if (usuariosError) throw usuariosError;
    if (!usuarios || usuarios.length === 0) {
      mostrarToast('No hay usuarios disponibles para matricular', 'warning');
      return;
    }
    modalContent.innerHTML = `
      <div class="auth-modal">
        <h2><i class="fas fa-user-plus"></i> Matricular Participante</h2>
        <div class="form-container">
          <div class="form-group">
            <label for="inscripcionUsuario">Usuario</label>
            ${estudianteId ? `
              <input type="text" value="${usuarios[0].nombre || usuarios[0].email}" disabled>
              <input type="hidden" id="inscripcionUsuario" value="${estudianteId}">
            ` : `
              <select id="inscripcionUsuario" required>
                <option value="">Seleccionar usuario</option>
                ${usuarios.map(user => `
                  <option value="${user.user_id}" data-role="${user.role}">
                    ${user.nombre || user.email} (${user.role})
                  </option>
                `).join('')}
              </select>
            `}
          </div>
          <div class="form-group">
            <label for="inscripcionRol">Rol en este curso</label>
            <select id="inscripcionRol" required>
              <option value="">Seleccionar rol</option>
              <option value="${ROLES.STUDENT}">Estudiante</option>
              <option value="${ROLES.ASSISTANT}">Asistente</option>
              <option value="${ROLES.TEACHER}">Profesor</option>
            </select>
          </div>
          <button onclick="guardarInscripcion()" class="auth-submit">
            <i class="fas fa-save"></i> Matricular
          </button>
        </div>
      </div>
    `;
    if (estudianteId) {
      document.getElementById('inscripcionRol').value = usuarios[0].role || ROLES.STUDENT;
    }
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al mostrar formulario de inscripción:', error);
    mostrarToast('Error al cargar datos para matrícula: ' + error.message, 'error');
  }
}

async function guardarInscripcion() {
  try {
    const userId = document.getElementById('inscripcionUsuario').value;
    const role = document.getElementById('inscripcionRol').value;
    if (!userId || !role) {
      mostrarToast('Debes seleccionar un usuario y un rol', 'warning');
      return;
    }
    if (role === ROLES.TEACHER && !verificarPermiso('admin', 'inscripciones')) {
      mostrarToast('No tienes permisos para asignar el rol de profesor', 'error');
      return;
    }
    const { data: inscripcionExistente, error: checkError } = await supabase
      .from('inscripciones')
      .select('id')
      .eq('estudiante_id', userId)
      .eq('curso_id', cursoActual.id)
      .maybeSingle();
    if (checkError) throw checkError;
    if (inscripcionExistente) {
      mostrarToast('Este usuario ya está matriculado en el curso', 'warning');
      return;
    }
    const { error } = await supabase
      .from('inscripciones')
      .insert([{
        estudiante_id: userId,
        curso_id: cursoActual.id,
        role_in_curso: role,
        fecha_inscripcion: getChileNowISO()
      }]);
    if (error) throw error;
    mostrarToast('Usuario matriculado exitosamente', 'success');
    cerrarModal();
    await cargarParticipantesCurso();
  } catch (error) {
    console.error('Error al guardar inscripción:', error);
    mostrarToast('Error al matricular usuario: ' + error.message, 'error');
  }
}

async function eliminarInscripcion(cursoId, estudianteId) {
  if (!verificarPermiso('delete', 'inscripciones')) {
    mostrarToast('No tienes permisos para desmatricular estudiantes', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres desmatricular a este estudiante del curso?')) {
    return;
  }
  try {
    const { error } = await supabase
      .from('inscripciones')
      .delete()
      .eq('estudiante_id', estudianteId)
      .eq('curso_id', cursoId);
    if (error) throw error;
    mostrarToast('Estudiante desmatriculado exitosamente', 'success');
    await cargarParticipantesCurso();
  } catch (error) {
    console.error('Error al eliminar inscripción:', error);
    mostrarToast('Error al desmatricular estudiante: ' + error.message, 'error');
  }
}

function manejarSeleccionArchivos(event, tipo) {
  const files = Array.from(event.target.files);

  files.forEach(file => {
    archivosTemporales[tipo].push(file);
    actualizarPreviaArchivos(tipo);
  });

  event.target.value = '';
}

function actualizarPreviaArchivos(tipo) {
  const previewContainer = document.getElementById(`${tipo}ArchivosPreview`);
  previewContainer.innerHTML = '';
  archivosTemporales[tipo].forEach((file, index) => {
    const fileElement = document.createElement('div');
    fileElement.className = 'file-preview';
    fileElement.innerHTML = `
      <i class="fas fa-file"></i>
      <span class="archivo-nombre">${file.name}</span>
      <span class="archivo-tamaño">(${formatearTamaño(file.size)})</span>
      <i class="fas fa-times remove-file" onclick="eliminarArchivoTemporal('${tipo}', ${index})"></i>
    `;
    previewContainer.appendChild(fileElement);
  });
}

window.eliminarArchivoTemporal = function (tipo, index) {
  archivosTemporales[tipo].splice(index, 1);
  actualizarPreviaArchivos(tipo);
};

async function subirArchivos(archivos, tipo, idContenido) {
  if (!archivos || archivos.length === 0) return [];
  const uploadedFiles = [];
  const user = await getCurrentUser();
  for (const file of archivos) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = tipo === 'entregas'
      ? `${tipo}/${user.id}/${idContenido}/${fileName}`
      : `${tipo}/${idContenido}/${fileName}`;
    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('archivos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('archivos')
        .getPublicUrl(uploadData.path);

      uploadedFiles.push({
        nombre: file.name,
        tipo: file.type,
        tamaño: file.size,
        url: publicUrl,
        path: uploadData.path
      });
    } catch (error) {
      console.error(`Error al subir archivo ${file.name}:`, error);
      continue;
    }
  }

  return uploadedFiles;
}

window.eliminarArchivoExistente = async function (tipo, idContenido, indexArchivo) {
  if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) return;
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para realizar esta acción', 'warning');
      return;
    }
    const { data: contenido, error: fetchError } = await supabase
      .from(tipo === 'guia' ? 'guias' : 'tareas')
      .select('archivos')
      .eq('id', idContenido)
      .single();
    if (fetchError || !contenido) throw fetchError || new Error('Contenido no encontrado');
    const archivoAEliminar = contenido.archivos[indexArchivo];
    const nuevosArchivos = contenido.archivos.filter((_, i) => i !== indexArchivo);
    if (archivoAEliminar.path) {
      const { error: deleteError } = await supabase.storage
        .from('archivos')
        .remove([archivoAEliminar.path]);

      if (deleteError) throw deleteError;
    }
    const { error: updateError } = await supabase
      .from(tipo === 'guia' ? 'guias' : 'tareas')
      .update({ archivos: nuevosArchivos })
      .eq('id', idContenido);
    if (updateError) throw updateError;
    const contenidoIndex = tipo === 'guia' ?
      guias.findIndex(g => g.id === idContenido) :
      tareas.findIndex(t => t.id === idContenido);
    if (contenidoIndex !== -1) {
      if (tipo === 'guia') {
        guias[contenidoIndex].archivos = nuevosArchivos;
        renderizarGuias();
      } else {
        tareas[contenidoIndex].archivos = nuevosArchivos;
        renderizarTareas();
      }
    }
    if (modal.style.display === 'block') {
      if (tipo === 'guia') {
        editarGuia(idContenido);
      } else {
        editarTarea(idContenido);
      }
    }
  } catch (error) {
    console.error('Error al eliminar archivo:', error);
    mostrarToast('Error al eliminar el archivo: ' + error.message, 'error');
  }
};

function oscurecerColor(hex, cantidad) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `#${Math.max(0, r - cantidad).toString(16).padStart(2, '0')}${Math.max(0, g - cantidad).toString(16).padStart(2, '0')}${Math.max(0, b - cantidad).toString(16).padStart(2, '0')}`;
}

const crearReunionBtn = document.getElementById('crearReunionBtn');
let reunionCursoPendiente = null;

async function crearReunion(cursoId = null) {
  if (!verificarPermiso('create', 'reuniones')) {
    mostrarToast('No tienes permisos para crear reuniones', 'error');
    return;
  }
  reunionCursoPendiente = cursoId;
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-video"></i> Crear Nueva Reunión</h2>
      <div class="form-container">
        <div class="form-group">
          <label for="reunionTitulo">Título de la reunión</label>
          <input type="text" id="reunionTitulo" placeholder="Ej: Clase de Introducción a IA" required>
        </div>
        <div class="form-group">
          <label for="reunionDescripcion">Descripción (opcional)</label>
          <textarea id="reunionDescripcion" placeholder="Agrega detalles sobre la reunión"></textarea>
        </div>
        <div class="form-group">
          <label for="reunionFecha"><i class="far fa-calendar-alt"></i> Fecha y hora</label>
          <input type="datetime-local" id="reunionFecha" required>
        </div>
        <div class="form-group">
          <label for="reunionEnlace"><i class="fas fa-video"></i> Enlace de videoconferencia</label>
          <input type="url" id="reunionEnlace" placeholder="Zoom, Meet, Teams o Jitsi">
          <button type="button" class="btn-secondary" onclick="generarEnlaceReunion()">
            <i class="fas fa-wand-magic-sparkles"></i> Generar sala Jitsi
          </button>
        </div>
        <div class="form-group">
          <label for="reunionGrabacion"><i class="fas fa-circle-play"></i> Grabación posterior (opcional)</label>
          <input type="url" id="reunionGrabacion" placeholder="Enlace a la grabación cuando esté disponible">
        </div>
        <button onclick="guardarReunion()" class="auth-submit">
          <i class="fas fa-calendar-plus"></i> Programar clase en vivo
        </button>
      </div>
    </div>
  `;
  const localDateTime = getChileNowInputValue();
  document.getElementById('reunionFecha').value = localDateTime;
  modal.style.display = 'block';
}

function generarEnlaceReunion() {
  const titulo = document.getElementById('reunionTitulo')?.value.trim() || 'clase-en-vivo';
  const enlaceInput = document.getElementById('reunionEnlace');
  if (enlaceInput) {
    enlaceInput.value = generarSalaJitsi(titulo, reunionCursoPendiente || cursoActual?.id || '');
  }
}

async function guardarReunion() {
  if (!verificarPermiso('create', 'reuniones')) {
    mostrarToast('No tienes permisos para crear reuniones', 'error');
    return;
  }
  const titulo = document.getElementById('reunionTitulo').value.trim();
  const descripcion = document.getElementById('reunionDescripcion').value.trim();
  const fechaInput = document.getElementById('reunionFecha').value;
  const enlaceInput = document.getElementById('reunionEnlace')?.value.trim() || '';
  const grabacionInput = document.getElementById('reunionGrabacion')?.value.trim() || '';
  if (!titulo || !fechaInput) {
    mostrarToast('El título y la fecha son obligatorios', 'warning');
    return;
  }
  const enlaceVideollamada = enlaceInput ? normalizarUrlVideollamada(enlaceInput) : '';
  if (enlaceInput && !enlaceVideollamada) {
    mostrarToast('El enlace de videoconferencia no es válido', 'warning');
    return;
  }
  const grabacionUrl = grabacionInput ? normalizarUrlRecurso(grabacionInput) : '';
  if (grabacionInput && !grabacionUrl) {
    mostrarToast('El enlace de grabación no es válido', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear una reunión', 'warning');
      return;
    }
    const fechaLocal = chileDateTimeLocalToISO(fechaInput);
    const payload = {
      titulo,
      descripcion,
      fecha_hora: fechaLocal,
      user_id: user.id,
      estado: 'programada',
      curso_id: reunionCursoPendiente,
      enlace_videollamada: enlaceVideollamada || null,
      grabacion_url: grabacionUrl || null
    };
    let response = await supabase
      .from('reuniones')
      .insert([payload])
      .select();
    if (response.error && /enlace_videollamada|grabacion_url|column/i.test(response.error.message || '')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.enlace_videollamada;
      delete fallbackPayload.grabacion_url;
      fallbackPayload.descripcion = [
        descripcion,
        enlaceVideollamada ? `Videoconferencia: ${enlaceVideollamada}` : '',
        grabacionUrl ? `Grabación: ${grabacionUrl}` : ''
      ].filter(Boolean).join('\n\n');
      response = await supabase
        .from('reuniones')
        .insert([fallbackPayload])
        .select();
    }
    const { data, error } = response;
    if (error) throw error;
    if (data && data.length > 0) {
      mostrarToast('Reunión creada exitosamente', 'success');
      cerrarModal();
      renderizarVideochat();
      if (reunionCursoPendiente && cursoActual?.id === reunionCursoPendiente) {
        renderizarReunionesCurso();
      }
      reunionCursoPendiente = null;
    }
  } catch (error) {
    console.error('Error al crear reunión:', error);
    mostrarToast('Error al crear la reunión: ' + error.message, 'error');
  }
}

function crearReunionCursoActual() {
  if (!cursoActual) {
    mostrarToast('Selecciona un curso para crear una reunión', 'warning');
    return;
  }
  crearReunion(cursoActual.id);
}

async function eliminarReunion(id) {
  if (!verificarPermiso('delete', 'reuniones')) {
    mostrarToast('No tienes permisos para eliminar reuniones', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar esta reunión?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una reunión', 'warning');
      return;
    }
    const { data: reunion, error: fetchError } = await supabase
      .from('reuniones')
      .select('user_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (!puedeAdministrarReuniones(reunion.user_id)) {
      mostrarToast('No tienes permisos para eliminar esta reunión', 'error');
      return;
    }
    const { error } = await supabase
      .from('reuniones')
      .delete()
      .eq('id', id);
    if (error) throw error;

    mostrarToast('Reunión eliminada exitosamente', 'success');
    renderizarVideochat();
    if (cursoActual) {
      renderizarReunionesCurso();
    }
  } catch (error) {
    console.error('Error al eliminar reunión:', error);
    mostrarToast('Error al eliminar la reunión: ' + error.message, 'error');
  }
}

window.cerrarModal = function () {
  modal.style.display = 'none';
};

async function editarObjetivos() {
  if (!cursoActual) return;
  const tienePermiso = await verificarPermisosEdicion('cursos', cursoActual.id);
  if (!tienePermiso) {
    mostrarToast('No tienes permisos para editar este curso', 'error');
    return;
  }
  const objetivosContent = document.getElementById('curso-objetivos-content');
  objetivosContent.innerHTML = `
    <div class="edit-form-container">
      <textarea id="editObjetivosText" class="edit-textarea">${cursoActual.objetivos || ''}</textarea>
      <div class="edit-form-actions">
        <button onclick="guardarObjetivos()" class="btn-primary">
          <i class="fas fa-save"></i> Guardar
        </button>
        <button onclick="cancelarEdicion('objetivos')" class="btn-primary">
          <i class="fas fa-times"></i> Cancelar
        </button>
      </div>
    </div>
  `;
}

async function guardarObjetivos() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para editar el curso', 'warning');
      return;
    }
    const nuevosObjetivos = document.getElementById('editObjetivosText').value.trim();
    const { data, error } = await supabase
      .from('cursos')
      .update({
        objetivos: nuevosObjetivos,
      })
      .eq('id', cursoActual.id)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      cursoActual = data[0];
      renderizarPresentacionCurso();
    }
  } catch (error) {
    console.error('Error al guardar objetivos:', error);
  }
}

async function editarRequisitos() {
  if (!cursoActual) return;
  const tienePermiso = await verificarPermisosEdicion('cursos', cursoActual.id);
  if (!tienePermiso) {
    mostrarToast('No tienes permisos para editar este curso', 'error');
    return;
  }
  const requisitosContent = document.getElementById('curso-requisitos-content');
  requisitosContent.innerHTML = `
    <div class="edit-form-container">
      <textarea id="editRequisitosText" class="edit-textarea">${cursoActual.requisitos || ''}</textarea>
      <div class="edit-form-actions">
        <button onclick="guardarRequisitos()" class="btn-primary">
          <i class="fas fa-save"></i> Guardar
        </button>
        <button onclick="cancelarEdicion('requisitos')" class="btn-primary">
          <i class="fas fa-times"></i> Cancelar
        </button>
      </div>
    </div>
  `;
}

async function guardarRequisitos() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para editar el curso', 'warning');
      return;
    }
    const nuevosRequisitos = document.getElementById('editRequisitosText').value.trim();
    const { data, error } = await supabase
      .from('cursos')
      .update({
        requisitos: nuevosRequisitos,
      })
      .eq('id', cursoActual.id)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      cursoActual = data[0];
      renderizarPresentacionCurso();
    }
  } catch (error) {
    console.error('Error al guardar requisitos:', error);
  }
}

function mostrarToast(mensaje, tipo = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function cancelarEdicion(tipo) {
  renderizarPresentacionCurso();
}

async function renderizarPresentacionCurso() {
  if (!cursoActual) return;
  const creador = await obtenerInfoProfesor(cursoActual.user_id);
  const profesoresCurso = await obtenerProfesoresCurso(cursoActual.id);
  const profesoresHTML = profesoresCurso.length > 0
    ? profesoresCurso.map(prof => prof.nombre || prof.email).join(', ')
    : creador?.nombre || 'Profesor no disponible';
  document.getElementById('curso-profesor').textContent = profesoresHTML;
  document.getElementById('curso-objetivos-content').innerHTML = cursoActual.objetivos
    ? previsualizarMarkdown(cursoActual.objetivos)
    : '<p>No se han definido objetivos para este curso.</p>';
  document.getElementById('curso-requisitos-content').innerHTML = cursoActual.requisitos
    ? previsualizarMarkdown(cursoActual.requisitos)
    : '<p>No hay requisitos previos para este curso.</p>';
  const progresoContent = document.getElementById('curso-progreso-content');
  if (progresoContent) {
    const progreso = obtenerResumenProgresoCurso(cursoActual);
    progresoContent.innerHTML = `
      <div class="course-progress-detail">
        <span class="badge badge-owner">${progreso.estado}</span>
        ${renderizarBarraProgreso(progreso.porcentaje)}
        <div class="progress-breakdown">
          <span><strong>${progreso.videosCompletados}/${progreso.videosTotal}</strong> videos visualizados</span>
          <span><strong>${progreso.documentosCompletados}/${progreso.documentosTotal}</strong> documentos revisados</span>
          <span><strong>${progreso.evaluacionesAprobadas}/${progreso.evaluacionesTotal}</strong> evaluaciones aprobadas</span>
        </div>
      </div>
    `;
  }
}

async function obtenerPerfilActual() {
  if (!currentUserId) return null;
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('nombre, email')
      .eq('user_id', currentUserId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error al obtener perfil actual:', error);
    return null;
  }
}

async function obtenerRequisitosCertificado(curso) {
  const requisitos = {
    tareasTotal: 0,
    tareasCalificadas: 0,
    notasCompletas: false,
    clasesTotal: 0,
    asistenciasValidas: 0,
    porcentajeAsistencia: 0,
    asistenciaCumplida: false,
    certificadoDisponible: false
  };
  if (!curso || !currentUserId) return requisitos;
  try {
    const tareasCurso = tareas.filter(tarea => tarea.curso_id === curso.id);
    requisitos.tareasTotal = tareasCurso.length;
    if (tareasCurso.length > 0) {
      const { data: entregasEstudiante, error: entregasError } = await supabase
        .from('entregas')
        .select('tarea_id, calificacion, estado')
        .eq('curso_id', curso.id)
        .eq('estudiante_id', currentUserId);
      if (entregasError) throw entregasError;
      requisitos.tareasCalificadas = tareasCurso.filter(tarea => {
        const entrega = (entregasEstudiante || []).find(item => Number(item.tarea_id) === Number(tarea.id));
        return entrega && entrega.calificacion !== null && entrega.calificacion !== undefined;
      }).length;
      requisitos.notasCompletas = requisitos.tareasCalificadas === tareasCurso.length;
    }

    const { data: clasesCurso, error: clasesError } = await supabase
      .from('clases')
      .select('id')
      .eq('curso_id', curso.id);
    if (clasesError) throw clasesError;
    requisitos.clasesTotal = clasesCurso?.length || 0;
    if (requisitos.clasesTotal > 0) {
      const { data: asistenciasEstudiante, error: asistenciasError } = await supabase
        .from('asistencias')
        .select('clase_id, estado')
        .eq('estudiante_id', currentUserId)
        .in('clase_id', clasesCurso.map(clase => clase.id));
      if (asistenciasError) throw asistenciasError;
      requisitos.asistenciasValidas = (asistenciasEstudiante || []).filter(item =>
        [ASISTENCIA_ESTADOS.PRESENTE, ASISTENCIA_ESTADOS.TARDANZA].includes(item.estado)
      ).length;
      requisitos.porcentajeAsistencia = Math.round((requisitos.asistenciasValidas / requisitos.clasesTotal) * 100);
      requisitos.asistenciaCumplida = requisitos.porcentajeAsistencia >= 75;
    }
    requisitos.certificadoDisponible = requisitos.notasCompletas && requisitos.asistenciaCumplida;
  } catch (error) {
    console.error('Error al calcular requisitos de certificado:', error);
  }
  return requisitos;
}

async function renderizarCertificado() {
  const contenedor = document.getElementById('certificado-content');
  if (!contenedor || !cursoActual) return;
  if (currentUserRole === ROLES.STUDENT) {
    await cargarIntentosTestsCurso();
  }
  const progreso = obtenerResumenProgresoCurso(cursoActual);
  const requisitos = await obtenerRequisitosCertificado(cursoActual);
  const perfil = await obtenerPerfilActual();
  const nombre = perfil?.nombre || document.getElementById('userEmail')?.textContent || 'Estudiante';
  contenedor.innerHTML = `
    <div class="certificate-panel ${requisitos.certificadoDisponible ? 'is-ready' : ''}">
      <div class="certificate-summary">
        <div class="certificate-icon"><i class="fas fa-certificate"></i></div>
        <div>
          <h3>${requisitos.certificadoDisponible ? 'Certificado disponible' : 'Certificado pendiente'}</h3>
          <p>${requisitos.certificadoDisponible
      ? 'Ya cumples los requisitos para descargar tu certificado.'
      : 'Debes tener nota en todas tus tareas y una asistencia mínima del 75% para obtener el certificado.'}</p>
        </div>
      </div>
      ${renderizarBarraProgreso(progreso.porcentaje)}
      <div class="certificate-requirements">
        <span class="${requisitos.notasCompletas ? 'ok' : ''}">
          <i class="fas fa-check"></i> Tareas calificadas: ${requisitos.tareasCalificadas}/${requisitos.tareasTotal}
        </span>
        <span class="${requisitos.asistenciaCumplida ? 'ok' : ''}">
          <i class="fas fa-check"></i> Asistencia: ${requisitos.porcentajeAsistencia}% / 75%
        </span>
      </div>
      <div class="certificate-preview">
        <p><strong>Estudiante:</strong> ${escaparHtml(nombre)}</p>
        <p><strong>Curso:</strong> ${escaparHtml(cursoActual.nombre)}</p>
        <p><strong>Fecha de emisión:</strong> ${toChileDateTimeString(new Date().toISOString(), false)}</p>
      </div>
      <button class="btn-primary certificate-download" onclick="descargarCertificado()" ${requisitos.certificadoDisponible ? '' : 'disabled'}>
        <i class="fas fa-file-pdf"></i> Descargar Certificado
      </button>
    </div>
  `;
}

async function descargarCertificado() {
  if (!cursoActual) return;
  const requisitos = await obtenerRequisitosCertificado(cursoActual);
  if (!requisitos.certificadoDisponible) {
    mostrarToast('El certificado requiere todas las tareas calificadas y asistencia mínima del 75%.', 'warning');
    return;
  }
  const perfil = await obtenerPerfilActual();
  const nombre = perfil?.nombre || 'Estudiante';
  const fechaEmision = toChileDateTimeString(new Date().toISOString(), false);
  const codigo = `VIF-${cursoActual.id}-${String(currentUserId || '').slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const qrData = encodeURIComponent(`https://viformar.com/validar-certificado?codigo=${codigo}`);
  const ventana = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!ventana) {
    mostrarToast('Permite ventanas emergentes para generar el certificado.', 'warning');
    return;
  }
  ventana.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Certificado ${escaparHtml(cursoActual.nombre)}</title>
        <style>
          body { font-family: Georama, Arial, sans-serif; color: #333; margin: 0; padding: 40px; }
          .certificate { border: 10px solid #A90C0A; min-height: 620px; padding: 42px; }
          .logo { max-width: 240px; margin-bottom: 36px; }
          h1 { color: #A90C0A; font-size: 34px; margin: 0 0 22px; text-align: center; }
          .lead { font-size: 18px; line-height: 1.7; text-align: center; }
          .name { color: #E81309; font-size: 28px; font-weight: 800; margin: 18px 0; text-align: center; }
          .meta { display: grid; gap: 8px; margin-top: 34px; }
          .footer { align-items: end; display: flex; justify-content: space-between; margin-top: 56px; }
          .signature { border-top: 1px solid #808080; padding-top: 8px; text-align: center; width: 260px; }
          .qr { text-align: center; }
          .qr img { height: 112px; width: 112px; }
          @media print { body { padding: 0; } .certificate { border-width: 8px; } }
        </style>
      </head>
      <body>
        <main class="certificate">
          <img src="assets/viformar-imagotipo-horizontal-1.png" alt="Viformar" class="logo">
          <h1>Certificado de aprobación</h1>
          <p class="lead">Viformar certifica que</p>
          <p class="name">${escaparHtml(nombre)}</p>
          <p class="lead">aprobó satisfactoriamente el curso <strong>${escaparHtml(cursoActual.nombre)}</strong>, cumpliendo con tareas calificadas y asistencia mínima requerida.</p>
          <div class="meta">
            <span><strong>Fecha de emisión:</strong> ${escaparHtml(fechaEmision)}</span>
            <span><strong>Asistencia:</strong> ${requisitos.porcentajeAsistencia}%</span>
            <span><strong>Código de validación:</strong> ${escaparHtml(codigo)}</span>
          </div>
          <div class="footer">
            <div class="signature">Firma digital Viformar</div>
            <div class="qr">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${qrData}" alt="Código QR de validación">
              <div>Validación QR</div>
            </div>
          </div>
        </main>
        <script>window.addEventListener('load', () => window.print());</script>
      </body>
    </html>
  `);
  ventana.document.close();
}

async function obtenerProfesoresCurso(cursoId) {
  try {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(`
        estudiante_id,
        role_in_curso,
        user_roles:estudiante_id (nombre, email)
      `)
      .eq('curso_id', cursoId)
      .eq('role_in_curso', 'teacher');
    if (error) throw error;
    return data?.map(item => ({
      user_id: item.estudiante_id,
      nombre: item.user_roles?.nombre,
      email: item.user_roles?.email,
      role: item.role_in_curso
    })) || [];
  } catch (error) {
    console.error('Error al obtener profesores del curso:', error);
    return [];
  }
}

async function editarParticipante(userId) {
  try {
    const { data: participante, error: fetchError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (fetchError || !participante) {
      throw new Error('Participante no encontrado');
    }
    modalContent.innerHTML = `
      <div class="auth-modal">
        <h2><i class="fas fa-user-edit"></i> Editar Participante</h2>
        <div class="form-container">
          <div class="form-group">
            <label for="participanteNombre">Nombre</label>
            <input type="text" id="participanteNombre" value="${participante.nombre || ''}" placeholder="Nombre completo">
          </div>
          <div class="form-group">
            <label for="participanteEmail">Email</label>
            <input type="email" id="participanteEmail" value="${participante.email || ''}" disabled>
          </div>
          <div class="form-group">
            <label for="participanteRol">Rol</label>
            <select id="participanteRol">
              <option value="${ROLES.STUDENT}" ${participante.role === ROLES.STUDENT ? 'selected' : ''}>Estudiante</option>
              <option value="${ROLES.TEACHER}" ${participante.role === ROLES.TEACHER ? 'selected' : ''}>Profesor</option>
              <option value="${ROLES.ASSISTANT}" ${participante.role === ROLES.ASSISTANT ? 'selected' : ''}>Asistente</option>
              <option value="${ROLES.ADMIN}" ${esRolAdmin(participante.role) ? 'selected' : ''}>Administrador</option>
            </select>
          </div>
          <button onclick="guardarCambiosParticipante('${userId}')" class="auth-submit">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al editar participante:', error);
    mostrarToast('Error: ' + error.message, 'error');
  }
}

async function guardarCambiosParticipante(userId) {
  try {
    const nombre = document.getElementById('participanteNombre').value.trim();
    const rol = document.getElementById('participanteRol').value;
    if (!nombre) {
      mostrarToast('El nombre es obligatorio', 'warning');
      return;
    }
    const { error } = await supabase
      .from('user_roles')
      .update({
        nombre: nombre,
        role: rol
      })
      .eq('user_id', userId);
    if (error) throw error;
    mostrarToast('Cambios guardados exitosamente', 'success');
    cerrarModal();
    renderizarParticipantes();
  } catch (error) {
    console.error('Error al guardar cambios:', error);
    mostrarToast('Error: ' + error.message, 'error');
  }
}

window.eliminarEnlaceTemporal = function (tipo, index) {
  enlacesTemporales[tipo].splice(index, 1);
  actualizarPreviaEnlaces(tipo);
};

function configurarEventDelegation() {
  modalContent.removeEventListener('click', handleModalClick);
  modalContent.addEventListener('click', handleModalClick);
}

function handleModalClick(e) {
  if (e.target.closest('.add-enlace-btn')) {
    const tipo = e.target.closest('.add-enlace-btn').dataset.tipo;
    agregarEnlace(tipo);
    return;
  }
  if (e.target.classList.contains('remove-enlace')) {
    const tipo = e.target.closest('.enlace-preview').parentElement.id.replace('EnlacesPreview', '');
    const index = parseInt(e.target.getAttribute('data-index'));
    eliminarEnlaceTemporal(tipo, index);
    return;
  }
}

async function cargarEntregas(tareaId) {
  try {
    const { data, error } = await supabase
      .from('entregas')
      .select('*')
      .eq('tarea_id', tareaId)
      .order('fecha_entrega', { ascending: false });
    if (error) throw error;
    entregas = data || [];
    return entregas;
  } catch (error) {
    console.error('Error al cargar entregas:', error);
    return [];
  }
}

async function agregarEntrega(tareaId, cursoId, enlace, comentario, archivos = []) {
  let archivosSubidos = [];
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para realizar una entrega', 'warning');
      return false;
    }
    const userRole = currentUserRole;
    if (userRole !== ROLES.STUDENT) {
      mostrarToast('Solo los estudiantes pueden realizar entregas', 'error');
      return false;
    }
    const { data: entregasExistentes, error: fetchError } = await supabase
      .from('entregas')
      .select('id')
      .eq('tarea_id', tareaId)
      .eq('estudiante_id', user.id);
    if (fetchError) throw fetchError;
    if (entregasExistentes && entregasExistentes.length > 0) {
      mostrarToast('Ya has realizado una entrega para esta tarea', 'error');
      return false;
    }
    if (!enlace && archivos.length === 0) {
      mostrarToast('Debes agregar un enlace o subir al menos un archivo', 'warning');
      return false;
    }
    if (enlace) {
      try {
        new URL(enlace);
      } catch (e) {
        mostrarToast('Por favor ingrese una URL válida', 'error');
        return false;
      }
    }
    const entregaId = crypto.randomUUID();
    archivosSubidos = archivos.length > 0
      ? await subirArchivos(archivos, 'entregas', entregaId)
      : [];
    if (!enlace && archivos.length > 0 && archivosSubidos.length === 0) {
      mostrarToast('No se pudo subir ningún archivo para la entrega', 'error');
      return false;
    }
    const fechaActualUTC = getChileNowISO();
    const { data, error } = await supabase
      .from('entregas')
      .insert([{
        id: entregaId,
        tarea_id: tareaId,
        estudiante_id: user.id,
        curso_id: cursoId,
        enlace: enlace || null,
        comentario: comentario || null,
        estado: 'entregado',
        email: user.email,
        user_email: user.email,
        fecha_entrega: fechaActualUTC,
        archivos: archivosSubidos,
      }])
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      const nuevaEntrega = data[0];
      entregas.unshift(nuevaEntrega);
      renderizarTareas();
      mostrarToast('Entrega agregada correctamente', 'success');
      return nuevaEntrega;
    }
    return false;
  } catch (error) {
    if (archivosSubidos.length > 0) {
      await supabase.storage
        .from('archivos')
        .remove(archivosSubidos.map(archivo => archivo.path).filter(Boolean));
    }
    console.error('Error al agregar entrega:', error);
    mostrarToast('Error al realizar la entrega: ' + error.message, 'error');
    return false;
  }
}

async function calificarEntrega(entregaId, calificacion, comentario) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para calificar una entrega', 'warning');
      return false;
    }
    const userRole = currentUserRole;
    if (userRole !== ROLES.TEACHER && userRole !== ROLES.ADMIN) {
      mostrarToast('Solo profesores y administradores pueden calificar entregas', 'error');
      return false;
    }
    if (calificacion === null || calificacion === undefined) {
      mostrarToast('La calificación es obligatoria', 'warning');
      return false;
    }
    const { data, error } = await supabase
      .from('entregas')
      .update({
        calificacion,
        comentario_calificacion: comentario || null,
        estado: 'calificado',
        fecha_calificacion: getChileNowISO(),
      })
      .eq('id', entregaId)
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      const index = entregas.findIndex(e => e.id === entregaId);
      if (index !== -1) {
        entregas[index] = data[0];
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error al calificar entrega:', error);
    mostrarToast('Error al calificar la entrega: ' + error.message, 'error');
    return false;
  }
}

async function eliminarEntrega(entregaId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una entrega', 'warning');
      return false;
    }
    const userRole = currentUserRole;
    const { data: entrega, error: fetchError } = await supabase
      .from('entregas')
      .select('estudiante_id, archivos')
      .eq('id', entregaId)
      .single();
    if (fetchError) throw fetchError;
    if (userRole !== ROLES.ADMIN && entrega.estudiante_id !== user.id) {
      mostrarToast('No tienes permisos para eliminar esta entrega', 'error');
      return false;
    }
    if (entrega.archivos && entrega.archivos.length > 0) {
      const pathsToDelete = entrega.archivos.map(archivo => archivo.path).filter(Boolean);
      if (pathsToDelete.length > 0) {
        const { error: deleteError } = await supabase.storage
          .from('archivos')
          .remove(pathsToDelete);
        if (deleteError) console.error('Error al eliminar archivos de entrega:', deleteError);
      }
    }
    const { error } = await supabase
      .from('entregas')
      .delete()
      .eq('id', entregaId);
    if (error) throw error;
    entregas = entregas.filter(e => e.id !== entregaId);
    renderizarTareas();
    mostrarToast('Entrega eliminada correctamente', 'success');
    return true;
  } catch (error) {
    console.error('Error al eliminar entrega:', error);
    mostrarToast('Error al eliminar la entrega: ' + error.message, 'error');
    return false;
  }
}

async function mostrarFormularioEntrega(tareaId, cursoId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para realizar una entrega', 'warning');
      return;
    }
    const { data: entregasExistentes, error: fetchError } = await supabase
      .from('entregas')
      .select('id')
      .eq('tarea_id', tareaId)
      .eq('estudiante_id', user.id);
    if (fetchError) throw fetchError;
	    if (entregasExistentes && entregasExistentes.length > 0) {
	      mostrarToast('Ya has realizado una entrega para esta tarea', 'error');
	      return;
	    }
	    archivosTemporales.entrega = [];
	    modalContent.innerHTML = `
	      <div class="auth-modal">
	        <h2><i class="fas fa-paper-plane"></i> Realizar Entrega</h2>
	        <div class="form-container">
	          <div class="form-group">
	            <label for="entregaEnlace"><i class="fas fa-link"></i> Enlace de la entrega (opcional)</label>
	            <input type="url" id="entregaEnlace" placeholder="https://drive.google.com/...">
	          </div>
	          <div class="form-group">
	            <label for="entregaArchivos"><i class="fas fa-paperclip"></i> Archivos de la entrega</label>
	            <input type="file" id="entregaArchivos" multiple>
	            <div id="entregaArchivosPreview" class="archivos-preview"></div>
	          </div>
	          <div class="form-group">
	            <label for="entregaComentario"><i class="fas fa-comment"></i> Comentario (opcional)</label>
	            <textarea id="entregaComentario" placeholder="Agrega cualquier comentario sobre tu entrega"></textarea>
          </div>
          <button onclick="enviarEntrega(${tareaId}, ${cursoId})" class="auth-submit">
            <i class="fas fa-paper-plane"></i> Enviar Entrega
          </button>
        </div>
	      </div>
	    `;
	    document.getElementById('entregaArchivos').addEventListener('change', (e) => {
	      manejarSeleccionArchivos(e, 'entrega');
	    });
	    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al verificar entregas:', error);
    mostrarToast('Error al verificar entregas existentes', 'error');
  }
}

async function mostrarFormularioCalificacion(entregaId, puntosMaximos = 7) {
  try {
    const { data: entrega, error: entregaError } = await supabase
      .from('entregas')
      .select('*')
      .eq('id', entregaId)
      .single();
    if (entregaError || !entrega) throw entregaError || new Error('Entrega no encontrada');
    const { data: estudiante, error: estudianteError } = await supabase
      .from('user_roles')
      .select('nombre, email')
      .eq('user_id', entrega.estudiante_id)
      .single();
    modalContent.innerHTML = `
      <div class="calificacion-modal">
        <h2><i class="fas fa-graduation-cap"></i> Calificar Entrega</h2>
        <div class="entrega-info">
          <p><strong>Estudiante:</strong> ${estudiante?.nombre || estudiante?.email || 'Desconocido'}</p>
          <p><strong>Fecha entrega:</strong> ${toChileDateTimeString(entrega.fecha_entrega)}</p>
          ${entrega.enlace ? `<p><strong>Enlace:</strong> <a href="${entrega.enlace}" target="_blank">${entrega.enlace}</a></p>` : ''}
          ${renderizarArchivosEntrega(entrega.archivos)}
          ${entrega.comentario ? `<p><strong>Comentario estudiante:</strong> ${entrega.comentario}</p>` : ''}
        </div>
        <div class="form-container">
          <div class="form-group">
            <label for="calificacionPuntaje">Calificación (0-${puntosMaximos})</label>
            <input type="number" id="calificacionPuntaje" 
                   min="0" max="${puntosMaximos}" step="0.1" 
                   value="${entrega.calificacion || ''}" required>
          </div>         
          <div class="form-group">
            <label for="calificacionComentario">Retroalimentación</label>
            <textarea id="calificacionComentario" placeholder="Proporciona feedback al estudiante...">${entrega.comentario_calificacion || ''}</textarea>
          </div>
          <div class="form-actions">
            <button onclick="guardarCalificacion('${entregaId}')" class="btn-guardar">
              <i class="fas fa-save"></i> Guardar Calificación
            </button>
            <button onclick="cerrarModal()" class="btn-cancelar">
              <i class="fas fa-times"></i> Cancelar
            </button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al cargar entrega:', error);
    mostrarToast('Error al cargar la entrega: ' + error.message, 'error');
  }
}

function renderizarArchivosEntrega(archivos = []) {
  if (!archivos || archivos.length === 0) return '';
  return `
    <div class="archivos-list entrega-archivos">
      ${archivos.map(archivo => `
        <div class="archivo-item">
          <a href="${archivo.url}" target="_blank" download="${archivo.nombre}">
            ${obtenerIconoPorExtension(archivo.nombre)}
            ${archivo.nombre} (${formatearTamaño(archivo.tamaño)})
          </a>
        </div>
      `).join('')}
    </div>
  `;
}

function renderizarEntrega(entrega, esEstudiante) {
  if (!entrega) {
    console.error('La entrega no está definida');
    return;
  }
  let estadoBadge = '';
  if (entrega.estado === 'calificado') {
    estadoBadge = `<span class="badge" style="background-color: #e53935;">
      <i class="fas fa-check-circle"></i> Calificado (${entrega.calificacion.toFixed(1)}/7.0)
    </span>`;
  } else {
    estadoBadge = `<span class="badge" style="background-color: #f39c12;">
      <i class="fas fa-clock"></i> Pendiente
    </span>`;
  }
  return `
    <div class="entrega-item ${entrega.estado === 'calificado' ? 'completada' : ''}">
      <div class="entrega-header">
        ${!esEstudiante ? `<h5>Entrega de ${entrega.user_email || entrega.email || 'Desconocido'}</h5>` : ''}
        ${estadoBadge}
      </div>
      <p class="meta-info">
        <i class="far fa-calendar"></i> Fecha de entrega: ${toChileDateTimeString(entrega.fecha_entrega)}
        ${entrega.fecha_calificacion ? `
          | <i class="fas fa-graduation-cap"></i> Calificado el: ${toChileDateTimeString(entrega.fecha_calificacion)}
        ` : ''}
      </p>
      <div class="entrega-enlace">
        ${entrega.enlace ? `
          <p><strong><i class="fas fa-link"></i> Enlace:</strong> 
            <a href="${entrega.enlace}" target="_blank">${entrega.enlace}</a>
          </p>
        ` : ''}
      </div>
      ${renderizarArchivosEntrega(entrega.archivos)}
      ${entrega.comentario ? `
        <div class="entrega-comentario">
          <p><strong><i class="fas fa-comment"></i> Comentario del estudiante:</strong> ${entrega.comentario}</p>
        </div>
      ` : ''}
      ${entrega.comentario_calificacion ? `
        <div class="calificacion-comentario">
          <p><strong><i class="fas fa-comment-dots"></i> Comentario del profesor:</strong> ${entrega.comentario_calificacion}</p>
        </div>
      ` : ''}
      <div class="item-actions">
        ${esEstudiante ? `
          <button onclick="eliminarEntregaModal('${entrega.id}')" class="delete-btn">
            <i class="fas fa-trash"></i> Eliminar
          </button>
        ` : `
          ${entrega.estado !== 'calificado' ? `
            <button onclick="mostrarFormularioCalificacion('${entrega.id}')" class="edit-btn">
              <i class="fas fa-graduation-cap"></i> Calificar
            </button>
          ` : `
            <button onclick="editarCalificacion('${entrega.id}')" class="edit-btn">
              <i class="fas fa-edit"></i> Editar Calificación
            </button>
          `}
        `}
      </div>
    </div>
  `;
}

function eliminarEntregaModal(entregaId) {
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-exclamation-triangle"></i> Confirmar Eliminación</h2>
      <div class="form-container">
        <p>¿Estás seguro de que quieres eliminar esta entrega? Esta acción no se puede deshacer.</p>
        <div class="form-actions">
          <button onclick="confirmarEliminarEntrega('${entregaId}')" class="btn-secondary">
            <i class="fas fa-trash"></i> Sí, eliminar
          </button>
          <button onclick="cerrarModal()" class="btn-secondary">
            <i class="fas fa-times"></i> Cancelar
          </button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';
}

window.enviarEntrega = async function (tareaId, cursoId) {
  const enlace = document.getElementById('entregaEnlace').value.trim();
  const comentario = document.getElementById('entregaComentario').value.trim();
  const archivos = [...archivosTemporales.entrega];
  const nuevaEntrega = await agregarEntrega(tareaId, cursoId, enlace, comentario, archivos);
  if (nuevaEntrega) {
    archivosTemporales.entrega = [];
    cerrarModal();
    await renderizarTareas();
  }
};

window.enviarCalificacion = async function (entregaId) {
  const calificacion = parseInt(document.getElementById('calificacionPuntaje').value);
  const comentario = document.getElementById('calificacionComentario').value.trim();
  if (isNaN(calificacion)) {
    mostrarToast('Por favor ingrese una calificación válida', 'error');
    return;
  }
  const success = await calificarEntrega(entregaId, calificacion, comentario);
  if (success) {
    cerrarModal();
    await renderizarTareas();
  }
};

window.confirmarEliminarEntrega = async function (entregaId) {
  const entregaIndex = entregas.findIndex(e => e.id === entregaId);
  if (entregaIndex === -1) return;
  const success = await eliminarEntrega(entregaId);
  if (success) {
    cerrarModal();
    await renderizarTareas();
  }
};

async function editarCalificacion(entregaId) {
  try {
    const { data: entrega, error: entregaError } = await supabase
      .from('entregas')
      .select('*')
      .eq('id', entregaId)
      .single();

    if (entregaError || !entrega) throw entregaError || new Error('Entrega no encontrada');
    modalContent.innerHTML = `
      <div class="auth-modal">
        <h2><i class="fas fa-edit"></i> Editar Calificación</h2>
        <div class="form-container">
          <div class="form-group">
            <label for="editCalificacionPuntaje">Puntaje (0-100)</label>
            <input type="number" id="editCalificacionPuntaje" min="0" max="100" 
                   value="${entrega.calificacion || 0}" required>
          </div>
          <div class="form-group">
            <label for="editCalificacionComentario">Comentario</label>
            <textarea id="editCalificacionComentario" placeholder="Retroalimentación para el estudiante">${entrega.comentario_calificacion || ''}</textarea>
          </div>
          <button onclick="actualizarCalificacion('${entregaId}')" class="auth-submit">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al editar calificación:', error);
    mostrarToast('Error al cargar la calificación: ' + error.message, 'error');
  }
}

async function actualizarCalificacion(entregaId) {
  const puntaje = parseFloat(document.getElementById('editCalificacionPuntaje').value);
  const comentario = document.getElementById('editCalificacionComentario').value.trim();
  if (isNaN(puntaje)) {
    mostrarToast('Por favor ingrese un puntaje válido', 'error');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para calificar', 'warning');
      return;
    }
    const { error } = await supabase
      .from('entregas')
      .update({
        calificacion: puntaje,
        comentario_calificacion: comentario,
        estado: 'calificado',
        fecha_calificacion: getChileNowISO(),
      })
      .eq('id', entregaId);
    if (error) throw error;
    renderizarTareas();
    mostrarToast('Calificación actualizada exitosamente', 'success');
    cerrarModal();
    if (document.getElementById('listaEntregas')) {
      const tareaId = document.getElementById('listaEntregas').dataset.tareaId;
      cargarEntregas(tareaId);
    }
    if (document.getElementById('tabla-calificaciones')) {
      renderizarCalificaciones();
    }
    if (document.getElementById('tabla-calificaciones-curso')) {
      renderizarNotasCurso();
    }
  } catch (error) {
    console.error('Error al actualizar calificación:', error);
    mostrarToast('Error al actualizar la calificación: ' + error.message, 'error');
  }
}

async function guardarCalificacion(entregaId, tareaId, estudianteId) {
  const puntaje = parseFloat(document.getElementById('calificacionPuntaje').value);
  const comentario = document.getElementById('calificacionComentario').value.trim();
  if (isNaN(puntaje)) {
    mostrarToast('Por favor ingrese una nota válida', 'error');
    return;
  }
  if (puntaje < 1.0 || puntaje > 7.0) {
    mostrarToast('La nota debe estar entre 1.0 y 7.0', 'error');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para calificar', 'warning');
      return;
    }
    const fechaActualUTC = getChileNowISO();
    const { error: entregaError } = await supabase
      .from('entregas')
      .update({
        calificacion: puntaje,
        comentario_calificacion: comentario,
        estado: 'calificado',
        fecha_calificacion: fechaActualUTC,
      })
      .eq('id', entregaId);
    if (entregaError) throw entregaError;
    renderizarTareas();
    mostrarToast('Calificación guardada exitosamente', 'success');
    cerrarModal();
    if (document.getElementById('listaEntregas')) {
      cargarEntregas(tareaId);
    }
    if (document.getElementById('tabla-calificaciones')) {
      renderizarCalificaciones();
    }
    if (document.getElementById('tabla-calificaciones-curso')) {
      renderizarNotasCurso();
    }
  } catch (error) {
    console.error('Error al guardar calificación:', error);
    mostrarToast('Error al guardar la calificación: ' + error.message, 'error');
  }
}

async function renderizarAsistencia() {
  const asistenciaSection = document.getElementById('asistencia-section');
  if (!asistenciaSection || !cursoActual) return;
  try {
    asistenciaSection.innerHTML = '<p>Cargando asistencia...</p>';
    await cargarDatosAsistencia(cursoActual.id);
    const esEstudiante = esEstudianteActual();
    asistenciaSection.innerHTML = esEstudiante ? `
      <div class="attendance-hero attendance-hero-student">
        <div>
          <span class="attendance-eyebrow">Asistencia</span>
          <h2><i class="fas fa-video"></i> ${escaparHtml(cursoActual.nombre)}</h2>
          <p>Revisa las clases del curso y entra a la videollamada desde cada registro disponible.</p>
        </div>
        <div class="attendance-hero-count">
          <strong>${clases.length}</strong>
          <span>clases</span>
        </div>
      </div>
      <div id="clases-table-container"></div>
    ` : `
      <div class="attendance-hero">
        <div>
          <span class="attendance-eyebrow">Asistencia</span>
          <h2><i class="fas fa-clipboard-check"></i> ${escaparHtml(cursoActual.nombre)}</h2>
          <p>Consulta las clases, asistencia y avance del curso en un solo lugar.</p>
        </div>
        <div class="attendance-hero-count">
          <strong>${estudiantes.length}</strong>
          <span>estudiantes</span>
        </div>
      </div>
      <div class="asistencia-controls">
        <button id="crearClaseBtn" class="btn-primary">
          <i class="fas fa-plus"></i> Crear Nueva Clase
        </button>
        <div class="filtros">
          <label for="filtro-fecha">Filtrar por fecha</label>
          <input type="date" id="filtro-fecha" title="Filtrar clases por fecha">
        </div>
      </div>
      <div id="clases-table-container"></div>
      <div class="estadisticas-asistencia">
        <h2><i class="fas fa-chart-bar"></i> Estadísticas del Curso</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon"><i class="fas fa-chalkboard"></i></div>
            <div class="stat-value" id="total-clases">0</div>
            <div class="stat-label">Clases registradas</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
            <div class="stat-value" id="promedio-asistencia">0%</div>
            <div class="stat-label">Asistencia promedio</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><i class="fas fa-user-check"></i></div>
            <div class="stat-value" id="total-presentes">0</div>
            <div class="stat-label">Presentes (Total)</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><i class="fas fa-user-times"></i></div>
            <div class="stat-value" id="total-ausentes">0</div>
            <div class="stat-label">Ausentes (Total)</div>
          </div>
        </div>
      </div>
      <div class="tabla-asistencia-estudiantes">
        <h2><i class="fas fa-user-graduate"></i> Asistencia por Estudiante</h2>
        <div class="table-responsive">
          <table class="asistencia-table content-table">
            <thead></thead>
            <tbody id="tabla-estudiantes-body"></tbody>
          </table>
        </div>
      </div>
    `;
    if (!esEstudiante) {
      document.getElementById('crearClaseBtn')?.addEventListener('click', mostrarFormularioClase);
      document.getElementById('filtro-fecha')?.addEventListener('change', actualizarListaClases);
    }
    actualizarListaClases();
    if (!esEstudiante) {
      const estadisticasEstudiantes = calcularEstadisticasEstudiantes();
      actualizarEstadisticasAsistencia();
      actualizarTablaEstudiantes(estadisticasEstudiantes);
    }
  } catch (error) {
    console.error('Error al renderizar asistencia:', error);
    asistenciaSection.innerHTML = '<p class="no-items error-msg">Error al cargar el módulo de asistencia.</p>';
  }
}

function actualizarTablaEstudiantes() {
  const tbody = document.getElementById('tabla-estudiantes-body');
  const thead = document.querySelector('.asistencia-table thead');
  if (!tbody || !thead) return;
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if (estudiantes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (clases.length + 2) + '"><div class="attendance-empty-small">No hay estudiantes inscritos en este curso.</div></td></tr>';
    return;
  }
  const clasesOrdenadas = [...clases].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Estudiante</th>';
  clasesOrdenadas.forEach((clase, index) => {
    const numeroClase = index + 1;
    headerRow.innerHTML += `<th title="Clase ${numeroClase}: ${clase.titulo} - ${toChileDateTimeString(clase.fecha)}">${numeroClase}</th>`;
  });
  headerRow.innerHTML += '<th>Asistencia</th>';
  thead.appendChild(headerRow);
  estudiantes.forEach(estudiante => {
    const row = document.createElement('tr');
    const nombre = estudiante.user_roles?.nombre || estudiante.user_roles?.email || 'Desconocido';
    row.innerHTML = `<td>${nombre}</td>`;
    let totalPresentes = 0;
    clasesOrdenadas.forEach(clase => {
      const asistencia = asistencias.find(a =>
        a.clase_id === clase.id && a.estudiante_id === estudiante.estudiante_id
      );
      let estadoIcono = '<i class="fas fa-times-circle text-danger"></i>';
      if (asistencia) {
        if (asistencia.estado === ASISTENCIA_ESTADOS.PRESENTE) {
          estadoIcono = '<i class="fas fa-check-circle text-success"></i>';
          totalPresentes++;
        }
        else if (asistencia.estado === ASISTENCIA_ESTADOS.TARDANZA) estadoIcono = '<i class="fas fa-clock text-warning"></i>';
        else if (asistencia.estado === ASISTENCIA_ESTADOS.JUSTIFICADO) estadoIcono = '<i class="fas fa-question-circle text-info"></i>';
      }
      row.innerHTML += `<td class="asistencia-icon">${estadoIcono}</td>`;
    });
    const porcentaje = clasesOrdenadas.length > 0 ? Math.round((totalPresentes / clasesOrdenadas.length) * 100) : 0;
    row.innerHTML += `
      <td>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${porcentaje}%"></div>
          <span class="progress-text">${porcentaje}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function calcularEstadisticasEstudiantes() {
  const estadisticas = [];
  estudiantes.forEach(estudiante => {
    const asistenciasEstudiante = asistencias.filter(a => a.estudiante_id === estudiante.estudiante_id);
    const totalClases = clases.length;
    const conteo = {
      presente: 0,
      ausente: 0,
      tardanza: 0,
      justificado: 0
    };
    asistenciasEstudiante.forEach(a => {
      conteo[a.estado] = (conteo[a.estado] || 0) + 1;
    });
    const porcentajeAsistencia = totalClases > 0
      ? Math.round((conteo.presente / totalClases) * 100)
      : 0;
    estadisticas.push({
      estudiante_id: estudiante.estudiante_id,
      nombre: estudiante.user_roles?.nombre || estudiante.user_roles?.email || 'Desconocido',
      ...conteo,
      porcentajeAsistencia
    });
  });
  return estadisticas;
}

function mostrarFormularioClase(clase = null) {
  const esEdicion = Boolean(clase?.id);
  const permiso = esEdicion ? 'update' : 'create';
  if (!verificarPermiso(permiso, 'asistencias')) {
    mostrarToast(`No tienes permisos para ${esEdicion ? 'editar' : 'crear'} clases`, 'error');
    return;
  }
  claseEditandoId = clase?.id || null;
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas ${esEdicion ? 'fa-pen' : 'fa-plus'}"></i> ${esEdicion ? 'Editar Clase' : 'Nueva Clase'}</h2>
      <div class="form-container">
        <div class="form-group">
          <label for="claseTitulo">Título de la clase</label>
          <input type="text" id="claseTitulo" placeholder="Ej: Clase 1 - Introducción" required>
        </div>
        <div class="form-group">
          <label for="claseDescripcion">Descripción (opcional)</label>
          <textarea id="claseDescripcion" placeholder="Temas a tratar en esta clase"></textarea>
        </div>
        <div class="form-group">
          <label for="claseFecha"><i class="far fa-calendar-alt"></i> Fecha y hora</label>
          <input type="datetime-local" id="claseFecha" required>
        </div>
        <div class="form-group">
          <label for="claseVideollamada"><i class="fas fa-video"></i> Videollamada (opcional)</label>
          <input type="url" id="claseVideollamada" placeholder="https://meet.google.com/...">
          <small class="form-hint">Agrega el enlace para que los estudiantes puedan unirse desde asistencia.</small>
        </div>
        <button onclick="guardarClase()" class="auth-submit">
          <i class="fas fa-save"></i> ${esEdicion ? 'Guardar Cambios' : 'Guardar Clase'}
        </button>
      </div>
    </div>
  `;
  document.getElementById('claseTitulo').value = clase?.titulo || '';
  document.getElementById('claseDescripcion').value = clase?.descripcion || '';
  document.getElementById('claseFecha').value = esEdicion ? toChileDateTimeInputValue(clase.fecha) : getChileNowInputValue();
  document.getElementById('claseVideollamada').value = clase?.meet_link || '';
  modal.style.display = 'block';
}

function editarClase(claseId) {
  if (!verificarPermiso('update', 'asistencias')) {
    mostrarToast('No tienes permisos para editar clases', 'error');
    return;
  }
  const clase = clases.find(c => c.id === claseId);
  if (!clase) {
    mostrarToast('Clase no encontrada', 'error');
    return;
  }
  mostrarFormularioClase(clase);
}

async function cargarDatosAsistencia(cursoId) {
  try {
    const { data: clasesData, error: clasesError } = await supabase
      .from('clases')
      .select('*')
      .eq('curso_id', cursoId)
      .order('fecha', { ascending: false });
    if (clasesError) throw clasesError;
    clases = clasesData || [];
    if (esEstudianteActual()) {
      asistencias = [];
      estudiantes = [];
      return;
    }
    if (clases.length > 0) {
      const { data: asistenciasData, error: asistenciasError } = await supabase
        .from('asistencias')
        .select('*')
        .in('clase_id', clases.map(c => c.id));

      if (asistenciasError) throw asistenciasError;
      asistencias = asistenciasData || [];
    }
    const { data: estudiantesData, error: estudiantesError } = await supabase
      .from('inscripciones')
      .select('estudiante_id, user_roles:estudiante_id(nombre, email)')
      .eq('curso_id', cursoId)
      .eq('role_in_curso', ROLES.STUDENT);
    if (estudiantesError) throw estudiantesError;
    estudiantes = estudiantesData || [];
  } catch (error) {
    console.error('Error al cargar datos de asistencia:', error);
    throw error;
  }
}

async function guardarClase() {
  try {
    const user = await getCurrentUser();
    if (!user || !cursoActual) {
      mostrarToast('Debes iniciar sesión para guardar una clase', 'warning');
      return;
    }
    const titulo = document.getElementById('claseTitulo').value.trim();
    const descripcion = document.getElementById('claseDescripcion').value.trim();
    const fechaInput = document.getElementById('claseFecha').value;
    const videollamadaInput = document.getElementById('claseVideollamada')?.value.trim() || '';
    if (!titulo || !fechaInput) {
      mostrarToast('Título y fecha son obligatorios', 'warning');
      return;
    }
    const videollamada = videollamadaInput ? normalizarUrlVideollamada(videollamadaInput) : '';
    if (videollamadaInput && !videollamada) {
      mostrarToast('La URL de videollamada no es válida', 'warning');
      return;
    }
    const fechaLocal = chileDateTimeLocalToISO(fechaInput);
    const payload = {
      titulo,
      descripcion,
      fecha: fechaLocal,
      curso_id: cursoActual.id,
      meet_link: videollamada || null
    };
    let response;
    if (claseEditandoId) {
      response = await supabase
        .from('clases')
        .update(payload)
        .eq('id', claseEditandoId)
        .select();
    } else {
      response = await supabase
        .from('clases')
        .insert([{ ...payload, user_id: user.id }])
        .select();
    }
    const { data, error } = response;
    if (error) throw error;
    if (data && data.length > 0) {
      const claseGuardada = data[0];
      if (claseEditandoId) {
        const index = clases.findIndex(c => c.id === claseEditandoId);
        if (index !== -1) {
          clases[index] = claseGuardada;
        } else {
          clases.unshift(claseGuardada);
        }
        mostrarToast('Clase actualizada exitosamente', 'success');
      } else {
        clases.unshift(claseGuardada);
        await crearRegistrosAsistencia(claseGuardada.id, cursoActual.id);
        mostrarToast('Clase creada exitosamente', 'success');
      }
      claseEditandoId = null;
      cerrarModal();
      actualizarListaClases();
      actualizarEstadisticasAsistencia();
    }
  } catch (error) {
    console.error('Error al guardar clase:', error);
    mostrarToast('Error al guardar la clase: ' + error.message, 'error');
  }
}

async function crearRegistrosAsistencia(claseId, cursoId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para crear registros de asistencia', 'warning');
      throw new Error('Usuario no autenticado');
    }
    const { data: estudiantes, error: estudiantesError } = await supabase
      .from('inscripciones')
      .select('estudiante_id')
      .eq('curso_id', cursoId)
      .eq('role_in_curso', ROLES.STUDENT);
    if (estudiantesError) throw estudiantesError;
    if (estudiantes && estudiantes.length > 0) {
      const registros = estudiantes.map(estudiante => ({
        clase_id: claseId,
        estudiante_id: estudiante.estudiante_id,
        estado: ASISTENCIA_ESTADOS.AUSENTE, // Por defecto ausente
        fecha_actualizacion: getChileNowISO(),
      }));
      const { error } = await supabase
        .from('asistencias')
        .insert(registros);
      if (error) throw error;
      registros.forEach(registro => {
        asistencias.push(registro);
      });
      actualizarTablaEstudiantes();
    }
  } catch (error) {
    console.error('Error al crear registros de asistencia:', error);
    mostrarToast('Error al crear registros de asistencia: ' + error.message, 'error');
    throw error;
  }
}

function actualizarListaClases() {
  const listaClasesContainer = document.getElementById('clases-table-container');
  if (!listaClasesContainer) return;
  const esEstudiante = esEstudianteActual();
  const filtroFecha = !esEstudiante ? document.getElementById('filtro-fecha')?.value : null;
  let clasesFiltradas = [...clases];
  if (filtroFecha) {
    clasesFiltradas = clasesFiltradas.filter(clase => {
      const fechaClase = toChileDateTimeString(clase.fecha, false).split(' ')[0];
      return fechaClase === filtroFecha;
    });
  }
  clasesFiltradas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (esEstudiante) {
    if (clasesFiltradas.length === 0) {
      listaClasesContainer.innerHTML = `
        <div class="attendance-empty">
          <i class="fas fa-video"></i>
          <h3>No hay clases con videollamada disponibles</h3>
          <p>Cuando el docente cree una clase con enlace, aparecerá aquí para que puedas unirte.</p>
        </div>
      `;
      return;
    }
    listaClasesContainer.innerHTML = `
      <div class="attendance-student-list">
        ${clasesFiltradas.map(clase => {
          const enlaceVideollamada = normalizarUrlVideollamada(clase.meet_link);
          return `
            <article class="attendance-class-card">
              <div>
                <span class="attendance-class-eyebrow">Clase</span>
                <h3>${escaparHtml(clase.titulo)}</h3>
                <p class="attendance-class-meta"><i class="far fa-calendar-alt"></i> ${escaparHtml(toChileDateTimeString(clase.fecha))}</p>
                ${clase.descripcion ? `<p class="attendance-class-description">${escaparHtml(clase.descripcion)}</p>` : ''}
              </div>
              <div class="attendance-class-actions">
                ${enlaceVideollamada
      ? renderizarLinkVideollamada(enlaceVideollamada, 'Unirse', 'clase-videollamada-cta', 'Unirse a la videollamada')
      : '<span class="badge asistencia-badge clase-sin-enlace">Sin videollamada</span>'}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    return;
  }
  if (clasesFiltradas.length === 0) {
    listaClasesContainer.innerHTML = `
      <div class="attendance-empty">
        <i class="fas fa-calendar-plus"></i>
        <h3>No hay clases registradas</h3>
        <p>Crea una clase para comenzar a tomar asistencia o cambia el filtro de fecha.</p>
      </div>
    `;
    return;
  }
  let tablaHTML = `
    <div class="table-responsive">
      <table class="table content-table clases-table">
        <thead>
          <tr>
            <th>Título de la Clase</th>
            <th>Fecha</th>
            <th>Asistencia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
  `;
  clasesFiltradas.forEach(clase => {
    const asistenciasClase = asistencias.filter(a => a.clase_id === clase.id);
    const totalEstudiantes = estudiantes.length;
    const totalPresentes = asistenciasClase.filter(a => a.estado === ASISTENCIA_ESTADOS.PRESENTE).length;
    const porcentajeAsistencia = totalEstudiantes > 0 ? Math.round((totalPresentes / totalEstudiantes) * 100) : 0;
    const enlaceVideollamada = normalizarUrlVideollamada(clase.meet_link);
    const accionesHTML = `
      <div class="item-actions-table">
        ${enlaceVideollamada ? `
          <a href="${enlaceVideollamada}" class="btn-primary clase-videollamada-icon" title="Conectarse a la videoconferencia" target="_blank" rel="noopener noreferrer">
            <i class="fas fa-video"></i>
          </a>
        ` : ''}
        ${verificarPermiso('update', 'asistencias') ? `
          <button onclick="editarClase('${clase.id}')" class="btn-primary" title="Editar clase" aria-label="Editar clase">
            <i class="fas fa-pen"></i>
          </button>
        ` : ''}
        <button onclick="mostrarDetalleAsistencia('${clase.id}')" class="btn-primary" title="Ver y editar asistencia">
          <i class="fas fa-clipboard-list"></i> 
        </button>
        ${verificarPermiso('delete', 'asistencias') ? `
          <button onclick="eliminarClase('${clase.id}')" class="btn-primary" title="Eliminar clase">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </div>
    `;
    tablaHTML += `
      <tr>
        <td data-label="Título">
          <strong>${escaparHtml(clase.titulo)}</strong>
          ${clase.descripcion ? `<p class="descripcion-tabla">${escaparHtml(clase.descripcion)}</p>` : ''}
        </td>
        <td data-label="Fecha">${toChileDateTimeString(clase.fecha)}</td>
        <td data-label="Asistencia">
          <span class="badge asistencia-badge">${totalPresentes}/${totalEstudiantes} (${porcentajeAsistencia}%)</span>
        </td>
        <td data-label="Acciones">${accionesHTML}</td>
      </tr>
    `;
  });
  tablaHTML += `</tbody></table></div>`;
  listaClasesContainer.innerHTML = tablaHTML;
  actualizarTablaEstudiantes();
}

async function mostrarDetalleAsistencia(claseId) {
  try {
    if (esEstudianteActual()) {
      mostrarToast('La vista detallada de asistencia no está disponible para estudiantes', 'warning');
      return;
    }
    const clase = clases.find(c => c.id === claseId);
    if (!clase) {
      mostrarToast('Clase no encontrada', 'error');
      return;
    }
    const asistenciasClase = asistencias.filter(a => a.clase_id === claseId);
    let tablaHTML = `
      <div class="asistencia-detalle">
        <h2>${escaparHtml(clase.titulo)}</h2>
        <p><i class="far fa-calendar"></i> ${escaparHtml(toChileDateTimeString(clase.fecha))}</p>
        ${clase.descripcion ? `<p class="descripcion">${escaparHtml(clase.descripcion)}</p>` : ''}
        <div class="asistencia-table-container">
          <table class="asistencia-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
    `;
    estudiantes.forEach(estudiante => {
      const asistencia = asistenciasClase.find(a => a.estudiante_id === estudiante.estudiante_id);
      const estadoActual = asistencia?.estado || ASISTENCIA_ESTADOS.AUSENTE;
      tablaHTML += `
        <tr>
          <td>${estudiante.user_roles?.nombre || estudiante.user_roles?.email || 'Estudiante'}</td>
          <td>
            <span class="badge estado-${estadoActual}">
              ${estadoActual.charAt(0).toUpperCase() + estadoActual.slice(1)}
            </span>
          </td>
          <td>
            <select class="estado-select" data-estudiante-id="${estudiante.estudiante_id}" 
                    data-clase-id="${claseId}" 
                    onchange="actualizarEstadoAsistencia(this)">
              ${Object.values(ASISTENCIA_ESTADOS).map(estado => `
                <option value="${estado}" ${estado === estadoActual ? 'selected' : ''}>
                  ${estado.charAt(0).toUpperCase() + estado.slice(1)}
                </option>
              `).join('')}
            </select>
          </td>
        </tr>
      `;
    });
    tablaHTML += `
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button onclick="cerrarModal()" class="btn-secondary">
            <i class="fas fa-times"></i> Cerrar
          </button>
        </div>
      </div>
    `;
    modalContent.innerHTML = tablaHTML;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al mostrar detalle de asistencia:', error);
    mostrarToast('Error al cargar el detalle de asistencia', 'error');
  }
}

async function actualizarEstadoAsistencia(selectElement) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar asistencia', 'warning');
      return;
    }
    const estudianteId = selectElement.dataset.estudianteId;
    const claseId = selectElement.dataset.claseId;
    const nuevoEstado = selectElement.value;
    const asistenciaIndex = asistencias.findIndex(a =>
      a.clase_id === claseId && a.estudiante_id === estudianteId
    );
    if (asistenciaIndex === -1) {
      mostrarToast('Registro de asistencia no encontrado', 'error');
      return;
    }
    const { error } = await supabase
      .from('asistencias')
      .update({
        estado: nuevoEstado,
        fecha_actualizacion: getChileNowISO(),
        actualizado_por: user.id
      })
      .eq('clase_id', claseId)
      .eq('estudiante_id', estudianteId);
    if (error) throw error;
    asistencias[asistenciaIndex] = {
      ...asistencias[asistenciaIndex],
      estado: nuevoEstado,
      fecha_actualizacion: getChileNowISO()
    };
    actualizarListaClases();
    actualizarEstadisticasAsistencia();
  } catch (error) {
    console.error('Error al actualizar asistencia:', error);
    mostrarToast('Error al actualizar asistencia: ' + error.message, 'error');
  }
}

async function exportarAsistencia(claseId) {
  try {
    const clase = clases.find(c => c.id === claseId);
    if (!clase) {
      mostrarToast('Clase no encontrada', 'error');
      return;
    }
    const { data: asistenciasData, error: asistenciasError } = await supabase
      .from('asistencias')
      .select(`
        estado,
        user_roles:estudiante_id(nombre, email)
      `)
      .eq('clase_id', claseId);
    if (asistenciasError) throw asistenciasError;
    let csvContent = "Estudiante,Email,Estado\n";
    asistenciasData.forEach(asistencia => {
      const nombre = asistencia.user_roles?.nombre || 'Desconocido';
      const email = asistencia.user_roles?.email || '';
      const estado = asistencia.estado;
      csvContent += `"${nombre}","${email}","${estado}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `asistencia_${clase.titulo}_${toChileDateTimeString(clase.fecha)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error al exportar asistencia:', error);
    mostrarToast('Error al exportar asistencia', 'error');
  }
}

async function actualizarAsistencia(claseId, estudianteId, nuevoEstado) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar asistencia', 'warning');
      return;
    }
    const { data: asistenciaExistente, error: fetchError } = await supabase
      .from('asistencias')
      .select('id')
      .eq('clase_id', claseId)
      .eq('estudiante_id', estudianteId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    let result;
    if (asistenciaExistente) {
      const { error } = await supabase
        .from('asistencias')
        .update({
          estado: nuevoEstado,
          fecha_actualizacion: getChileNowISO(),
          actualizado_por: user.id
        })
        .eq('id', asistenciaExistente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('asistencias')
        .insert([{
          clase_id: claseId,
          estudiante_id: estudianteId,
          estado: nuevoEstado,
          fecha_actualizacion: getChileNowISO(),
          actualizado_por: user.id
        }]);
      if (error) throw error;
    }
    const index = asistencias.findIndex(a =>
      a.clase_id === claseId && a.estudiante_id === estudianteId
    );
    if (index !== -1) {
      asistencias[index].estado = nuevoEstado;
    } else {
      asistencias.push({
        clase_id: claseId,
        estudiante_id: estudianteId,
        estado: nuevoEstado
      });
    }
    actualizarTablaEstudiantes();
    mostrarToast('Asistencia actualizada correctamente', 'success');
    actualizarEstadisticasAsistencia();
    if (modal.style.display === 'block') {
      const claseId = document.querySelector('.asistencia-detalle h3')?.dataset?.claseId;
      if (claseId) {
        mostrarDetalleAsistencia(claseId);
      }
    }
  } catch (error) {
    console.error('Error al actualizar asistencia:', error);
    mostrarToast('Error al actualizar asistencia: ' + error.message, 'error');
  }
}

async function mostrarAsistenciaClase(claseId) {
  try {
    const clase = clases.find(c => c.id === claseId);
    if (!clase) {
      mostrarToast('Clase no encontrada', 'error');
      return;
    }
    const { data: estudiantes, error: estudiantesError } = await supabase
      .from('inscripciones')
      .select('estudiante_id, user_roles:estudiante_id (nombre, email)')
      .eq('curso_id', clase.curso_id);
    if (estudiantesError) throw estudiantesError;
    if (!estudiantes || estudiantes.length === 0) {
      mostrarToast('No hay estudiantes inscritos en este curso', 'warning');
      return;
    }
    const { data: asistenciasClase, error: asistenciasError } = await supabase
      .from('asistencias')
      .select('*')
      .eq('clase_id', claseId);
    if (asistenciasError) throw asistenciasError;
    modalContent.innerHTML = `
      <div class="auth-modal wide-modal">
        <h2><i class="fas fa-clipboard-check"></i> Asistencia: ${clase.titulo}</h2>
        <p><i class="far fa-calendar-alt"></i> ${toChileDateTimeString(clase.fecha)}</p>

        <div class="asistencia-table-container">
          <table class="asistencia-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody id="lista-asistencia">
              ${estudiantes.map(estudiante => {
      const asistencia = asistenciasClase.find(a => a.estudiante_id === estudiante.estudiante_id);
      return `
                  <tr>
                    <td>${estudiante.user_roles?.nombre || 'Desconocido'}</td>
                    <td>${estudiante.user_roles?.email || 'Sin email'}</td>
                    <td>
                      <select class="estado-asistencia" data-estudiante="${estudiante.estudiante_id}">
                        <option value="${ASISTENCIA_ESTADOS.PRESENTE}" ${asistencia?.estado === ASISTENCIA_ESTADOS.PRESENTE ? 'selected' : ''}>Presente</option>
                        <option value="${ASISTENCIA_ESTADOS.AUSENTE}" ${asistencia?.estado === ASISTENCIA_ESTADOS.AUSENTE || !asistencia ? 'selected' : ''}>Ausente</option>
                        <option value="${ASISTENCIA_ESTADOS.JUSTIFICADO}" ${asistencia?.estado === ASISTENCIA_ESTADOS.JUSTIFICADO ? 'selected' : ''}>Justificado</option>
                        <option value="${ASISTENCIA_ESTADOS.TARDANZA}" ${asistencia?.estado === ASISTENCIA_ESTADOS.TARDANZA ? 'selected' : ''}>Tardanza</option>
                      </select>
                    </td>
                    <td>
                      <input type="text" class="observaciones-asistencia" data-estudiante="${estudiante.estudiante_id}" 
                             value="${asistencia?.observaciones || ''}" placeholder="Observaciones">
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="form-actions">
          <button onclick="guardarAsistencia('${claseId}')" class="auth-submit">
            <i class="fas fa-save"></i> Guardar Asistencia
          </button>
          <button onclick="cerrarModal()" class="btn-secondary">
            <i class="fas fa-times"></i> Cancelar
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al mostrar asistencia:', error);
    mostrarToast('Error al cargar la asistencia: ' + error.message, 'error');
  }
}
async function guardarAsistencia(claseId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para guardar asistencia', 'warning');
      return;
    }
    const estados = document.querySelectorAll('.estado-asistencia');
    const observaciones = document.querySelectorAll('.observaciones-asistencia');
    const updates = [];
    estados.forEach((select, index) => {
      const estudianteId = select.getAttribute('data-estudiante');
      const estado = select.value;
      const observacion = observaciones[index].value;
      updates.push({
        clase_id: claseId,
        estudiante_id: estudianteId,
        estado,
        observaciones: observacion || null,
        fecha_actualizacion: getChileNowISO(),
      });
    });
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      const { error } = await supabase
        .from('asistencias')
        .upsert(batch, { onConflict: 'clase_id,estudiante_id' });

      if (error) throw error;
    }
    const { data: nuevasAsistencias, error: fetchError } = await supabase
      .from('asistencias')
      .select('*')
      .eq('clase_id', claseId);
    if (fetchError) throw fetchError;
    asistencias = asistencias.filter(a => a.clase_id !== claseId);
    asistencias.push(...(nuevasAsistencias || []));
    mostrarToast('Asistencia guardada exitosamente', 'success');
    cerrarModal();
    actualizarEstadisticasAsistencia();
  } catch (error) {
    console.error('Error al guardar asistencia:', error);
    mostrarToast('Error al guardar la asistencia: ' + error.message, 'error');
  }
}

async function eliminarClase(claseId) {
  if (!verificarPermiso('delete', 'asistencias')) {
    mostrarToast('No tienes permisos para eliminar clases', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar esta clase y todos sus registros de asistencia?')) {
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para eliminar una clase', 'warning');
      return;
    }
    const { error: deleteAsistenciasError } = await supabase
      .from('asistencias')
      .delete()
      .eq('clase_id', claseId);
    if (deleteAsistenciasError) throw deleteAsistenciasError;
    const { error: deleteClaseError } = await supabase
      .from('clases')
      .delete()
      .eq('id', claseId);
    if (deleteClaseError) throw deleteClaseError;
    clases = clases.filter(c => c.id !== claseId);
    asistencias = asistencias.filter(a => a.clase_id !== claseId);
    mostrarToast('Clase eliminada exitosamente', 'success');
    actualizarListaClases();
    actualizarEstadisticasAsistencia();
  } catch (error) {
    console.error('Error al eliminar clase:', error);
    mostrarToast('Error al eliminar la clase: ' + error.message, 'error');
  }
}

function actualizarEstadisticasAsistencia() {
  const totalClases = document.getElementById('total-clases');
  const promedioAsistencia = document.getElementById('promedio-asistencia');
  const totalPresentes = document.getElementById('total-presentes');
  const totalAusentes = document.getElementById('total-ausentes');
  if (!totalClases || !promedioAsistencia || !totalPresentes || !totalAusentes) return;
  const totalEstudiantes = estudiantes.length;
  const totalClasesCount = clases.length;
  if (totalClasesCount === 0 || totalEstudiantes === 0) {
    totalClases.textContent = '0';
    promedioAsistencia.textContent = '0%';
    totalPresentes.textContent = '0';
    totalAusentes.textContent = '0';
    return;
  }
  let totalGlobalPresentes = 0;
  let totalGlobalAusentes = 0;
  clases.forEach(clase => {
    const asistenciasClase = asistencias.filter(a => a.clase_id === clase.id);
    totalGlobalPresentes += asistenciasClase.filter(a => a.estado === ASISTENCIA_ESTADOS.PRESENTE).length;
    totalGlobalAusentes += asistenciasClase.filter(a => a.estado === ASISTENCIA_ESTADOS.AUSENTE).length;
  });
  const maxPossibleAttendances = totalEstudiantes * totalClasesCount;
  const promedio = maxPossibleAttendances > 0
    ? Math.round((totalGlobalPresentes / maxPossibleAttendances) * 100)
    : 0;
  totalClases.textContent = totalClasesCount;
  promedioAsistencia.textContent = `${promedio}%`;
  totalPresentes.textContent = totalGlobalPresentes;
  totalAusentes.textContent = totalGlobalAusentes;
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('estado-select')) {
    const estudianteId = e.target.dataset.estudianteId;
    const claseId = e.target.dataset.claseId;
    const nuevoEstado = e.target.value;
    actualizarAsistencia(claseId, estudianteId, nuevoEstado);
  }
});

function getChileNowISO() {
  return new Date().toISOString();
}

function getChileDateTimeParts(date = new Date(), includeSeconds = true) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds && { second: '2-digit' }),
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
    second: parts.second || '00'
  };
}

function getChileNowInputValue() {
  const parts = getChileDateTimeParts(new Date(), false);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function toChileDateInputValue(date) {
  const parts = getChileDateTimeParts(new Date(date), false);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toChileDateTimeInputValue(date) {
  const parts = getChileDateTimeParts(new Date(date), false);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function chileDateTimeLocalToISO(value) {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    throw new Error('Fecha inválida');
  }

  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 3; i++) {
    const parts = getChileDateTimeParts(utc);
    const renderedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = wantedAsUtc - renderedAsUtc;
    if (diff === 0) break;
    utc = new Date(utc.getTime() + diff);
  }

  return utc.toISOString();
}

function toChileDateTimeString(date, includeTime = true) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Fecha inválida');
  }
  const options = {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  };
  let result = d.toLocaleString('es-CL', options)
    .replace(/\//g, '-')
    .replace(',', '')
    .trim();
  const [datePart, timePart] = result.split(' ');
  const [day, month, year] = datePart.split('-');
  result = `${year}-${month}-${day}`;
  if (includeTime && timePart) {
    result += ` ${timePart}`;
  }

  return result;
}

async function renderizarAvisos() {
  const avisosSection = document.getElementById('avisos-section');
  if (!avisosSection) return;
  try {
    const { data: avisosData, error } = await supabase
      .from('avisos')
      .select('*')
      .order('fecha_creacion', { ascending: false });
    if (error) throw error;
    avisos = avisosData || [];
    avisosSection.innerHTML = `
      <h2><i class="fas fa-bell"></i> Avisos</h2>
      ${verificarPermiso('create', 'avisos') ? `
        <button id="agregarAvisoBtn" class="btn-primary">
          <i class="fas fa-plus"></i> Nuevo Aviso
        </button>
      ` : ''}
      <div class="avisos-container" id="lista-avisos"></div>
    `;
    const listaAvisos = document.getElementById('lista-avisos');
    listaAvisos.innerHTML = '';
    if (avisos.length === 0) {
      listaAvisos.innerHTML = '<p class="no-items">No hay avisos para mostrar</p>';
      return;
    }
    avisos.forEach(aviso => {
      const avisoElement = document.createElement('div');
      avisoElement.className = `aviso-item ${!aviso.leido ? 'no-leido' : ''}`;
      avisoElement.innerHTML = `
        <div class="aviso-header">
          <h2>${aviso.titulo}</h2>
          ${!aviso.leido ? '<span class="badge-nuevo">Nuevo</span>' : ''}
          <span class="aviso-fecha">${toChileDateTimeString(aviso.fecha_creacion)}</span>
        </div>
        <div class="aviso-contenido">
          ${previsualizarMarkdown(aviso.contenido)}
        </div>
        ${verificarPermiso('update', 'avisos') ? `
          <div class="aviso-actions">
            <button onclick="editarAviso('${aviso.id}')" class="btn-edit">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button onclick="eliminarAviso('${aviso.id}')" class="btn-delete">
              <i class="fas fa-trash"></i> Eliminar
            </button>
          </div>
        ` : ''}
      `;
      avisoElement.addEventListener('click', () => {
        if (!aviso.leido) {
          marcarAvisoLeido(aviso.id);
          avisoElement.classList.remove('no-leido');
          const badge = avisoElement.querySelector('.badge-nuevo');
          if (badge) badge.remove();
        }
      });
      listaAvisos.appendChild(avisoElement);
    });
    await actualizarContadorAvisos();
    document.getElementById('agregarAvisoBtn')?.addEventListener('click', mostrarFormularioAviso);
  } catch (error) {
    console.error('Error al cargar avisos:', error);
    avisosSection.innerHTML = '<p class="no-items">Error al cargar los avisos</p>';
  }
}

async function agregarAviso() {
  if (!verificarPermiso('create', 'avisos')) {
    mostrarToast('No tienes permisos para crear avisos', 'error');
    return;
  }
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-bullhorn"></i> Nuevo Aviso</h2>
      <div class="form-container">
        <div class="form-group">
          <label for="avisoTitulo">Título</label>
          <input type="text" id="avisoTitulo" placeholder="Título del aviso" required>
        </div>
        <div class="form-group">
          <label for="avisoContenido">Contenido</label>
          <textarea id="avisoContenido" placeholder="Escribe el contenido del aviso (soporta Markdown)" required></textarea>
        </div>
        <button onclick="guardarAviso()" class="auth-submit">
          <i class="fas fa-save"></i> Publicar Aviso
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'block';
}

async function guardarAviso() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para publicar un aviso', 'warning');
      return;
    }
    const titulo = document.getElementById('avisoTitulo').value.trim();
    const contenido = document.getElementById('avisoContenido').value.trim();
    if (!titulo || !contenido) {
      mostrarToast('Título y contenido son obligatorios', 'warning');
      return;
    }
    const { data, error } = await supabase
      .from('avisos')
      .insert([{
        titulo,
        contenido,
        user_id: user.id
      }])
      .select();
    if (error) throw error;
    if (data && data.length > 0) {
      avisos.unshift(data[0]);
      renderizarAvisos();
      mostrarToast('Aviso publicado exitosamente', 'success');
      cerrarModal();
    }
  } catch (error) {
    console.error('Error al guardar aviso:', error);
    mostrarToast('Error al publicar el aviso: ' + error.message, 'error');
  }
}

async function mostrarAvisosModal() {
  try {
    const { data, error } = await supabase
      .from('avisos')
      .select('*')
      .order('fecha_creacion', { ascending: false });
    if (error) throw error;
    avisos = data || [];
    const puedeCrear = verificarPermiso('create', 'avisos');
    modalContent.innerHTML = `
      <div class="avisos-modal">
        <div class="avisos-header">
          <h2><i class="fas fa-bullhorn"></i> Avisos Generales</h2>
          ${puedeCrear ? `
            <button onclick="mostrarFormularioAviso()" class="btn-primary">
              <i class="fas fa-plus"></i> Nuevo Aviso
            </button>
          ` : ''}
        </div>
        <div id="lista-avisos" class="avisos-container">
          ${avisos.length === 0 ? '<p class="no-items">No hay avisos publicados</p>' : ''}
        </div>
      </div>
    `;
    const listaAvisos = document.getElementById('lista-avisos');
    if (listaAvisos && avisos.length > 0) {
      const puedeEditar = verificarPermiso('update', 'avisos');
      const puedeEliminar = verificarPermiso('delete', 'avisos');
      avisos.forEach(aviso => {
        const avisoElement = document.createElement('div');
        avisoElement.className = 'aviso-item';
        avisoElement.innerHTML = `
          <div class="aviso-header">
            <h2>${aviso.titulo}</h2>
            <span class="aviso-fecha">
              <i class="far fa-calendar-alt"></i> ${toChileDateTimeString(aviso.fecha_creacion)}
              ${aviso.fecha_actualizacion ?
            ` | <i class="fas fa-sync-alt"></i> Actualizado: ${toChileDateTimeString(aviso.fecha_actualizacion)}` : ''}
            </span>
          </div>
          <div class="aviso-contenido">
            ${previsualizarMarkdown(aviso.contenido)}
          </div>
          ${(puedeEditar || puedeEliminar) ? `
            <div class="aviso-actions">
              ${puedeEditar ? `
                <button onclick="editarAviso('${aviso.id}')" class="edit-btn">
                  <i class="fas fa-edit"></i> Editar
                </button>
              ` : ''}
              ${puedeEliminar ? `
                <button onclick="eliminarAviso('${aviso.id}')" class="delete-btn">
                  <i class="fas fa-trash"></i> Eliminar
                </button>
              ` : ''}
            </div>
          ` : ''}
        `;
        listaAvisos.appendChild(avisoElement);
      });
    }
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al cargar avisos:', error);
    mostrarToast('Error al cargar los avisos', 'error');
  }
}

function mostrarFormularioAviso(avisoExistente = null) {
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-bullhorn"></i> ${avisoExistente ? 'Editar' : 'Nuevo'} Aviso</h2>
      <div class="form-container">
        <div class="form-group">
          <label for="avisoTitulo">Título</label>
          <input type="text" id="avisoTitulo" 
                 value="${avisoExistente ? avisoExistente.titulo : ''}" 
                 placeholder="Título del aviso" required>
        </div>
        <div class="form-group">
          <label for="avisoContenido">Contenido</label>
          <textarea id="avisoContenido" 
                    placeholder="Escribe el contenido del aviso (soporta Markdown)" 
                    required>${avisoExistente ? avisoExistente.contenido : ''}</textarea>
        </div>
        <div class="form-actions">
          <button onclick="${avisoExistente ? `actualizarAviso('${avisoExistente.id}')` : 'guardarAviso()'}" 
                  class="auth-submit">
            <i class="fas fa-save"></i> ${avisoExistente ? 'Actualizar' : 'Publicar'} Aviso
          </button>
          <button onclick="mostrarAvisosModal()" class="btn-secondary">
            <i class="fas fa-times"></i> Cancelar
          </button>
        </div>
      </div>
    </div>
  `;
}

async function editarAviso(id) {
  if (!verificarPermiso(id === 'new' ? 'create' : 'update', 'avisos')) {
    mostrarToast('No tienes permisos para esta acción', 'error');
    return;
  }
  try {
    let aviso = null;
    if (id !== 'new') {
      const { data, error } = await supabase
        .from('avisos')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      aviso = data;
    }
    modalContent.innerHTML = `
      <div class="auth-modal">
        <h2><i class="fas fa-edit"></i> ${id === 'new' ? 'Nuevo Aviso' : 'Editar Aviso'}</h2>
        <div class="form-container">
          <div class="form-group">
            <label for="avisoTitulo">Título</label>
            <input type="text" id="avisoTitulo" value="${aviso?.titulo || ''}" required>
          </div>
          <div class="form-group">
            <label for="avisoContenido">Contenido (Markdown)</label>
            <textarea id="avisoContenido" rows="6">${aviso?.contenido || ''}</textarea>
          </div>
          <div class="form-actions">
            <button onclick="guardarAviso('${id}')" class="btn-primary">
              <i class="fas fa-save"></i> Guardar
            </button>
            <button onclick="mostrarAvisosModal()" class="btn-secondary">
              <i class="fas fa-times"></i> Cancelar
            </button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'block';
  } catch (error) {
    console.error('Error al editar aviso:', error);
    mostrarToast('Error al cargar el aviso para edición', 'error');
  }
}

async function eliminarAviso(id) {
  if (!verificarPermiso('delete', 'avisos')) {
    mostrarToast('No tienes permisos para eliminar avisos', 'error');
    return;
  }
  if (!confirm('¿Estás seguro de que quieres eliminar este aviso?')) {
    return;
  }
  try {
    const { error } = await supabase
      .from('avisos')
      .delete()
      .eq('id', id);
    if (error) throw error;
    mostrarToast('Aviso eliminado exitosamente', 'success');
    await mostrarAvisosModal();
  } catch (error) {
    console.error('Error al eliminar aviso:', error);
    mostrarToast('Error al eliminar el aviso: ' + error.message, 'error');
  }
}

async function marcarAvisoLeido(avisoId) {
  try {
    const { error } = await supabase
      .from('avisos')
      .update({ leido: true })
      .eq('id', avisoId);
    if (error) throw error;
    await actualizarContadorAvisos();
  } catch (error) {
    console.error('Error al marcar aviso como leído:', error);
  }
}

async function obtenerAvisosNoLeidos() {
  try {
    const { count, error } = await supabase
      .from('avisos')
      .select('*', { count: 'exact', head: true })
      .eq('leido', false);
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error al obtener avisos no leídos:', error);
    return 0;
  }
}

async function actualizarContadorAvisos() {
  const avisosBtn = document.getElementById('avisosBtn');
  if (!avisosBtn) return;
  const contador = avisosBtn.querySelector('.badge-notificacion');
  const count = await obtenerAvisosNoLeidos();
  if (count > 0) {
    if (!contador) {
      const badge = document.createElement('span');
      badge.className = 'badge-notificacion';
      badge.textContent = count;
      avisosBtn.appendChild(badge);
    } else {
      contador.textContent = count;
    }
  } else if (contador) {
    contador.remove();
  }
}

async function renderizarAyuda() {
  const ayudaContent = document.getElementById('ayuda-content');
  if (!ayudaContent) return;
  ayudaContent.innerHTML = `
  `;
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const answer = question.nextElementSibling;
      const icon = question.querySelector('i');
      answer.classList.toggle('show');
      icon.classList.toggle('fa-chevron-down');
      icon.classList.toggle('fa-chevron-up');
    });
  });
}

async function renderizarNoticias() {
  const noticiasContent = document.getElementById('noticias-content');
  if (!noticiasContent) return;
  try {
    const { data: noticias, error } = await supabase
      .from('noticias')
      .select('*')
      .order('fecha_publicacion', { ascending: false })
      .limit(10);
    if (error) throw error;
    if (!noticias || noticias.length === 0) {
      noticiasContent.innerHTML = '<p class="no-items">No hay noticias recientes</p>';
      return;
    }
    let html = '<div class="noticias-grid">';
    noticias.forEach(noticia => {
      html += `
        <div class="noticia-card">
          <div class="noticia-header">
            <h2>${noticia.titulo}</h2>
            <span class="noticia-fecha">${toChileDateTimeString(noticia.fecha_publicacion)}</span>
          </div>
          <div class="noticia-contenido">
            ${noticia.contenido}
          </div>
          ${noticia.enlace ? `<a href="${noticia.enlace}" target="_blank" class="noticia-enlace">Ver más</a>` : ''}
        </div>
      `;
    });
    html += '</div>';
    noticiasContent.innerHTML = html;
  } catch (error) {
    console.error('Error al cargar noticias:', error);
    noticiasContent.innerHTML = '<p class="no-items">Error al cargar las noticias</p>';
  }
}

async function renderizarRecursos() {
  const recursosContent = document.getElementById('recursos-content');
  if (!recursosContent) return;
  recursosContent.innerHTML = `
    <div class="recursos-grid">
      <div class="recurso-card">
        <div class="recurso-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <span class="resource-type">PDF</span>
        <h3>Reglamento Estudiantil</h3>
        <p>Documento oficial con las normas y regulaciones para estudiantes</p>
        <a href="#" class="btn-descargar" onclick="descargarRecurso('reglamento')">
          <i class="fas fa-download"></i> Descargar
        </a>
      </div>
      <div class="recurso-card">
        <div class="recurso-icon">
          <i class="fas fa-book"></i>
        </div>
        <span class="resource-type">Guía</span>
        <h3>Manual del Usuario</h3>
        <p>Guía completa para usar la plataforma Viformar</p>
        <a href="#" class="btn-descargar" onclick="descargarRecurso('manual')">
          <i class="fas fa-download"></i> Descargar
        </a>
      </div>
      <div class="recurso-card">
        <div class="recurso-icon">
          <i class="fas fa-link"></i>
        </div>
        <span class="resource-type">Accesos</span>
        <h3>Enlaces Útiles</h3>
        <p>Acceso a otras plataformas institucionales relacionadas</p>
        <a href="#" class="btn-enlace" onclick="mostrarEnlacesUtiles()">
          <i class="fas fa-external-link-alt"></i> Ver enlaces
        </a>
      </div>
    </div>
  `;
}

async function renderizarAcerca() {
  const acercaContent = document.getElementById('acerca-content');
  if (!acercaContent) return;
  acercaContent.innerHTML = `
    <div class="acerca-container">
      <div class="acerca-mision">
        <h2><i class="fas fa-bullseye"></i> Misión</h2>
        <p>Impulsar la transformación digital de empresas, emprendedores y equipos de trabajo mediante
        soluciones tecnológicas, desarrollo de software y formación práctica orientada a resultados.</p>
      </div>
      <div class="acerca-vision">
        <h2><i class="fas fa-eye"></i> Visión</h2>
        <p>Ser un referente en innovación tecnológica, acompañando a organizaciones que buscan crecer,
        optimizar sus procesos y adoptar herramientas digitales de alto impacto.</p>
      </div>
      <div class="acerca-equipo">
        <h2><i class="fas fa-users"></i> Nuestro Equipo</h2>
        <div class="equipo-grid">
          <div class="miembro-equipo">
            <div class="miembro-avatar">
              <i class="fas fa-user"></i>
            </div>
            <h4>Adaluz Ospina</h4>
            <p>Equipo Viformar</p>
          </div>
        </div>
      </div>
      <div class="soporte-container">
        <h2><i class="fas fa-question"></i> Preguntas Frecuentes</h2>
          <div class="faq-item">
            <button class="faq-question">¿Cómo veo mis calificaciones? <i class="fas fa-chevron-down"></i></button>
            <div class="faq-answer">
              <p>Para ver tus calificaciones:</p>
              <ol>
                <li>1. Entra al curso correspondiente</li>
                <li>2. Haz clic en la pestaña "Calificaciones"</li>
                <li>3. Revisa el puntaje y los comentarios del profesor</li>
              </ol>
            </div>
          </div>
          <div class="faq-item">
            <button class="faq-question">¿Cómo participo en una videollamada? <i class="fas fa-chevron-down"></i></button>
            <div class="faq-answer">
              <p>Para unirte a una videollamada:</p>
              <ol>
                <li>1. Dirígete a la sección "Videochat"</li>
                <li>2. Selecciona la reunión agendada</li>
                <li>3. Haz clic en "Unirse"</li>
                <li>4. Asegúrate de tener activada tu cámara y micrófono</li>
              </ol>
            </div>
          </div>
          <div class="faq-item">
            <button class="faq-question">¿Cómo contacto a mi profesor? <i class="fas fa-chevron-down"></i></button>
            <div class="faq-answer">
              <p>Para contactar a tu profesor:</p>
              <ol>
                <li>1. Entra a la sección "Participantes"</li>
                <li>2. Busca el nombre del profesor</li>
                <li>3. Haz clic en el botón de mensaje o correo</li>
              </ol>
            </div>
          </div>
          <div class="faq-item">
            <button class="faq-question">¿Cómo puedo cambiar mi contraseña? <i class="fas fa-chevron-down"></i></button>
            <div class="faq-answer">
              <p>Para cambiar tu contraseña:</p>
              <ol>
                <li>1. Haz clic en tu foto o nombre en la parte superior</li>
                <li>2. Selecciona "Configuración de cuenta"</li>
                <li>3. Ve a la opción "Cambiar contraseña"</li>
                <li>4. Ingresa tu contraseña actual y la nueva</li>
                <li>5. Guarda los cambios</li>
              </ol>
            </div>
          </div>
          <div class="faq-item">
            <button class="faq-question">¿Qué hago si tengo problemas técnicos? <i class="fas fa-chevron-down"></i></button>
            <div class="faq-answer">
              <p>Si enfrentas problemas técnicos:</p>
              <ol>
                <li>1. Intenta recargar la página</li>
                <li>2. Limpia el caché de tu navegador</li>
                <li>3. Usa otro navegador</li>
                <li>4. Contacta al equipo de soporte o a tu profesor</li>
              </ol>
            </div>
          </div>
      </div>
      <div class="acerca-contacto">
        <h2><i class="fas fa-envelope"></i> Contacto</h2>
        <p>Para más información sobre Viformar:</p>
        <ul class="contact-list">
          <li>
            <span class="contact-icon"><i class="fas fa-globe"></i></span>
            <div>
              <strong>Sitio web</strong>
              <a href="https://viformar.com" target="_blank">viformar.com</a>
            </div>
          </li>
          <li>
            <span class="contact-icon"><i class="fab fa-instagram"></i></span>
            <div>
              <strong>Instagram</strong>
              <a href="https://www.instagram.com/viformar" target="_blank">@viformar</a>
            </div>
          </li>
        </ul>
      </div>
      <div class="soporte-container">
        <h2><i class="fas fa-headset"></i> Soporte Técnico</h2>
        <p>Si necesitas ayuda adicional, puedes contactar a nuestro equipo de soporte:</p>
        <ul class="contact-list support-list">
          <li>
            <span class="contact-icon"><i class="fas fa-envelope"></i></span>
            <div>
              <strong>Email</strong>
              <span>contacto@viformar.com</span>
            </div>
          </li>
          <li>
            <span class="contact-icon"><i class="fas fa-phone"></i></span>
            <div>
              <strong>Teléfono</strong>
              <span>+56 9 8430 1770</span>
            </div>
          </li>
          <li>
            <span class="contact-icon"><i class="fas fa-clock"></i></span>
            <div>
              <strong>Horario</strong>
              <span>Lunes a Viernes de 9:00 a 18:00 hrs</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `;
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const answer = question.nextElementSibling;
      const icon = question.querySelector('i');
      answer.classList.toggle('show');
      icon.classList.toggle('fa-chevron-down');
      icon.classList.toggle('fa-chevron-up');
    });
  });
}

window.descargarRecurso = async function (tipo) {
  try {
    let filePath;
    let fileName;
    if (tipo === 'manual') {
      filePath = 'recursos/manual_usuario.pdf';
      fileName = 'Manual_de_Usuario_adecca.pdf';
    } else if (tipo === 'reglamento') {
      filePath = 'assets/regimen.pdf';
      fileName = 'Reglamento_Interno_adecca.pdf';
    } else {
      mostrarToast('Tipo de recurso no válido', 'error');
      return;
    }
    const resp = await fetch(filePath, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} al obtener ${filePath}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    mostrarToast(`Descargando ${fileName}`, 'success');
  } catch (error) {
    console.error('Error al descargar recurso:', error);
    mostrarToast('Error al descargar el archivo. Por favor, intente más tarde.', 'error');
  }
};

window.mostrarEnlacesUtiles = function () {
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-external-link-alt"></i> Enlaces Institucionales</h2>
      <div class="enlaces-container">
        <a href="https://www.viformar.com" target="_blank" class="enlace-item">
          <i class="fas fa-globe"></i> Sitio Web Institucional
        </a>
        <a href="https://viformar.com/intranet" target="_blank" class="enlace-item">
          <i class="fas fa-laptop"></i> Aula Virtual
        </a>
        <a href="https://gmail.com" target="_blank" class="enlace-item">
          <i class="fas fa-envelope"></i> Correo Institucional
        </a>
      </div>
      <button onclick="cerrarModal()" class="btn-cerrar">
        <i class="fas fa-times"></i> Cerrar
      </button>
    </div>
  `;
  modal.style.display = 'block';
};

const CHATBOT_RESPUESTAS = {
  "hola": "¡Hola! 😊 ¿En qué puedo ayudarte hoy?",
  "buenos días": "¡Buenos días! ¿Cómo puedo ayudarte?",
  "buenas tardes": "¡Buenas tardes! ¿Necesitas ayuda con algo?",
  "buenas noches": "¡Buenas noches! ¿En qué te puedo ayudar?",
  "ayuda": "Puedo ayudarte con: <br>- Cómo enviar tareas<br>- Ver tus calificaciones<br>- Problemas técnicos<br>- Contactar al profesor<br>¿Qué necesitas?",
  "necesito ayuda": "Claro, dime qué necesitas. ¿Es sobre tareas, calificaciones, o algo técnico?",
  "cómo funciona esto": "Estoy aquí para ayudarte. Puedes preguntarme sobre tareas, clases, calificaciones, etc.",
  "tareas": "Para enviar una tarea:<br>1. Ve a la sección de Tareas<br>2. Haz clic en la tarea<br>3. Busca el botón 'Nueva Entrega'<br>4. Ingresa el enlace y comentarios<br>5. Haz clic en Enviar",
  "cómo entrego una tarea": "Para entregar una tarea:<br>1. Ingresa a la sección Tareas<br>2. Selecciona la tarea correspondiente<br>3. Haz clic en 'Nueva Entrega' y completa los datos",
  "no puedo subir tarea": "Verifica si estás en la sección correcta y si la tarea aún está abierta. Si persiste el problema, contacta al profesor.",
  "calificaciones": "Tus calificaciones aparecen en:<br>1. La sección Calificaciones<br>2. En el detalle de cada tarea completada<br>¿Necesitas algo más?",
  "dónde veo mis notas": "Puedes ver tus notas en la sección Calificaciones dentro del curso.",
  "no veo mi nota": "A veces puede tardar en actualizarse. Intenta recargar la página o consulta con el profesor.",
  "error": "Si tienes un error técnico:<br>1. Prueba recargando la página<br>2. Limpia el caché de tu navegador<br>3. Intenta en otro navegador<br>Si persiste, contacta al profesor",
  "problema técnico": "¿Qué tipo de error estás experimentando? También puedes probar recargar o cambiar de navegador.",
  "la plataforma no carga": "Prueba actualizar la página, verificar tu conexión a internet o limpiar el caché del navegador.",
  "profesor": "Para contactar al profesor:<br>1. Ve a la sección Participantes<br>2. Busca al profesor<br>3. Haz clic en su nombre para ver el correo",
  "cómo contacto al profesor": "Busca al profesor en la sección Participantes y encontrarás su correo ahí.",
  "necesito hablar con el docente": "Puedes enviarle un correo desde la sección Participantes del curso.",
  "gracias": "¡De nada! 😊 ¿Hay algo más en lo que pueda ayudarte?",
  "muchas gracias": "Con gusto, estoy aquí para ayudarte. ¿Necesitas algo más?",
  "guías": "Para acceder a las guías:<br>1. Entra a un curso<br>2. Ve a la pestaña 'Guías'<br>3. Haz clic en la guía para abrirla o descargarla",
  "dónde están las guías": "Dentro del curso, accede a la pestaña 'Guías' para ver los documentos disponibles.",
  "capsulas": "Las cápsulas de video están en:<br>1. La sección del curso<br>2. Pestaña 'Cápsulas'<br>3. Haz clic en una para verla",
  "videos": "Puedes ver las cápsulas de video desde la pestaña 'Cápsulas' dentro de tu curso.",
  "reuniones": "Para ver tus reuniones:<br>1. Ingresa a la sección 'Reuniones'<br>2. Verás las próximas sesiones y enlaces de videollamada",
  "videollamada": "Las videollamadas están programadas en la sección Reuniones. Revisa allí las fechas y enlaces.",
  "clases": "Las clases están organizadas dentro de cada curso. Puedes ver los materiales, tareas, y cápsulas al entrar al curso correspondiente.",
  "horario": "Por ahora el sistema no tiene un horario integrado, pero puedes usar el calendario para ver fechas importantes de tareas y reuniones.",
  "cuándo tengo clase": "Revisa la sección Reuniones o el calendario para ver fechas programadas.",
  "contacto": "Puedes contactar a asistentes o profesores desde la sección 'Participantes'. Allí verás sus correos y roles.",
  "participantes": "Desde la sección Participantes puedes ver quiénes están en el curso y sus datos de contacto.",
  "avisos": "Para ver los avisos generales:<br>1. Haz clic en el ícono de avisos 📢 en la barra superior<br>2. Lee los mensajes publicados por docentes o asistentes",
  "noticias": "Los avisos generales están en el ícono 📢 en la barra superior. Haz clic para ver los mensajes importantes.",
  "foro": "Actualmente no contamos con un foro de discusión, pero puedes comunicarte con tu profesor o compañeros desde la sección Participantes.",
  "dónde está el foro": "No contamos con foro por ahora, pero puedes escribir directamente a tus docentes o asistentes.",
  "cerrar sesión": "Para cerrar sesión:<br>1. Haz clic en tu nombre o ícono de usuario<br>2. Selecciona 'Cerrar sesión' en el menú desplegable",
  "perfil": "Puedes ver o editar tu perfil desde el ícono de usuario, normalmente en la esquina superior derecha.",
  "idioma": "Por ahora la plataforma solo está disponible en español. Estamos trabajando para ofrecer más idiomas próximamente.",
  "actualizar": "Si no ves los cambios reflejados en tu curso, prueba recargar la página o cerrar sesión y volver a entrar.",
  "mobile": "Puedes acceder desde tu celular abriendo la plataforma en el navegador. Pronto lanzaremos una app móvil.",
  "default": "Lo siento, no entendí tu pregunta. Prueba con:<br>- Ayuda con tareas<br>- Ver calificaciones<br>- Problemas técnicos<br>- Contactar profesor<br>- Acceder guías o cápsulas"
};

function manejarChatbot(mensaje) {
  const mensajeLower = mensaje.toLowerCase().trim();
  if (mensajeLower.includes('hola') || mensajeLower.includes('holi') || mensajeLower.includes('buenos')) {
    return CHATBOT_RESPUESTAS.hola;
  }
  if (mensajeLower.includes('ayuda') || mensajeLower.includes('ayud') || mensajeLower.includes('soporte')) {
    return CHATBOT_RESPUESTAS.ayuda;
  }
  if (mensajeLower.includes('tarea') || mensajeLower.includes('entreg') || mensajeLower.includes('actividad')) {
    return CHATBOT_RESPUESTAS.tareas;
  }
  if (mensajeLower.includes('calif') || mensajeLower.includes('nota') || mensajeLower.includes('puntaje')) {
    return CHATBOT_RESPUESTAS.calificaciones;
  }
  if (mensajeLower.includes('error') || mensajeLower.includes('problema') || mensajeLower.includes('no funciona')) {
    return CHATBOT_RESPUESTAS.error;
  }
  if (mensajeLower.includes('profesor') || mensajeLower.includes('maestro') || mensajeLower.includes('contactar')) {
    return CHATBOT_RESPUESTAS.profesor;
  }
  if (mensajeLower.includes('gracias') || mensajeLower.includes('agradezco') || mensajeLower.includes('thx')) {
    return CHATBOT_RESPUESTAS.gracias;
  }
  return CHATBOT_RESPUESTAS.default;
}

function initChatbot() {
  const chatbotBtn = document.getElementById('chatbot-btn');
  const chatbotContainer = document.getElementById('chatbot-container');
  const chatbotClose = document.getElementById('chatbot-close');
  const chatbotInput = document.getElementById('chatbot-input');
  const chatbotSend = document.getElementById('chatbot-send');
  const chatbotMessages = document.getElementById('chatbot-messages');
  if (!chatbotBtn || !chatbotContainer) return;
  chatbotBtn.addEventListener('click', () => {
    chatbotContainer.style.display = chatbotContainer.style.display === 'block' ? 'none' : 'block';
  });
  chatbotClose?.addEventListener('click', () => {
    chatbotContainer.style.display = 'none';
  });
  chatbotInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      enviarMensajeChatbot();
    }
  });
  chatbotSend?.addEventListener('click', enviarMensajeChatbot);

  function enviarMensajeChatbot() {
    const mensaje = chatbotInput.value.trim();
    if (!mensaje) return;
    agregarMensajeChatbot(mensaje, 'user');
    const respuesta = manejarChatbot(mensaje);
    setTimeout(() => {
      agregarMensajeChatbot(respuesta, 'bot');
    }, 500);
    chatbotInput.value = '';
  }

  function agregarMensajeChatbot(texto, tipo) {
    const mensajeElement = document.createElement('div');
    mensajeElement.className = `chatbot-message ${tipo}`;
    mensajeElement.innerHTML = texto;
    chatbotMessages.appendChild(mensajeElement);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }
}

async function renderizarPerfil() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para ver tu perfil', 'warning');
      return;
    }
    const { data: userData, error } = await supabase
      .from('user_roles')
      .select('nombre, role, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    const perfilSection = document.getElementById('perfil-section');
    if (!perfilSection) {
      console.error('Elemento perfil-section no encontrado');
      return;
    }
    const avatarUrl = userData?.avatar_url
      ? userData.avatar_url.startsWith('http')
        ? userData.avatar_url
        : `https://www.gravatar.com/avatar/?d=mp`
      : 'https://www.gravatar.com/avatar/?d=mp';
    const roleLabel = userData?.role === 'admin' ? 'Administrador' :
      userData?.role === 'teacher' ? 'Profesor' :
        userData?.role === 'assistant' ? 'Asistente' : 'Estudiante';
    perfilSection.innerHTML = `
      <div class="profile-container">
        <div class="profile-page-header">
          <span class="form-eyebrow">Cuenta</span>
          <h2><i class="fas fa-user"></i> Mi Perfil</h2>
          <p>Revisa tu información de acceso y datos asociados a la plataforma.</p>
        </div>
        <div class="profile-card">
          <div class="profile-header">
            <div class="profile-avatar">
              <img id="profile-avatar-img" src="${avatarUrl}" alt="Avatar" onerror="this.src='https://www.gravatar.com/avatar/?d=mp'">
            </div>
            <div class="profile-info">
              <h3>${userData?.nombre || 'Usuario'}</h3>
              <p class="profile-role">
                <span class="badge role-${userData?.role || 'student'}">
                  ${roleLabel}
                </span>
              </p>
              <button onclick="mostrarFormularioAvatar()" class="btn-edit-avatar">
                <i class="fas fa-camera"></i> Cambiar foto
              </button>
            </div>
          </div>
          <div class="profile-details-grid">
            <div class="profile-detail-card">
              <span><i class="fas fa-envelope"></i></span>
              <div>
                <label>Email</label>
                <p>${user.email || 'No disponible'}</p>
              </div>
            </div>
            <div class="profile-detail-card">
              <span><i class="fas fa-user-tag"></i></span>
              <div>
                <label>Nombre</label>
                <p>${userData?.nombre || 'No especificado'}</p>
              </div>
            </div>
            <div class="profile-detail-card">
              <span><i class="fas fa-shield-alt"></i></span>
              <div>
                <label>Rol</label>
                <p>${roleLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error al renderizar perfil:', error);
    mostrarToast('Error al cargar la información del perfil', 'error');
    const perfilSection = document.getElementById('perfil-section');
    if (perfilSection) {
      perfilSection.innerHTML = `
        <div class="profile-error">
          <p>No se pudo cargar la información del perfil. Intenta recargar la página.</p>
        </div>
      `;
    }
  }
}

function mostrarFormularioAvatar() {
  modalContent.innerHTML = `
    <div class="auth-modal">
      <h2><i class="fas fa-camera"></i> Cambiar foto de perfil</h2>
      <div class="form-container">
        <div class="form-group">
          <label for="avatarUrl">URL de la imagen</label>
          <input type="url" id="avatarUrl" placeholder="https://ejemplo.com/imagen.jpg" required>
          <p class="form-hint">Puedes subir tu imagen a un servicio como <a href="https://imgur.com" target="_blank">Imgur</a> y pegar el enlace aquí.</p>
        </div>
        <button onclick="actualizarAvatar()" class="auth-submit">
          <i class="fas fa-save"></i> Guardar cambios
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'block';
}

async function actualizarAvatar() {
  const avatarUrl = document.getElementById('avatarUrl').value.trim();
  if (!avatarUrl) {
    mostrarToast('Por favor ingresa una URL válida', 'warning');
    return;
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      mostrarToast('Debes iniciar sesión para actualizar tu perfil', 'warning');
      return;
    }
    try {
      new URL(avatarUrl);
    } catch (e) {
      mostrarToast('Por favor ingresa una URL válida', 'error');
      return;
    }
    const { error } = await supabase
      .from('user_roles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', user.id);
    if (error) throw error;
    mostrarToast('Foto de perfil actualizada correctamente', 'success');
    cerrarModal();
    await renderizarPerfil();
  } catch (error) {
    console.error('Error al actualizar avatar:', error);
    mostrarToast('Error al actualizar la foto de perfil', 'error');
  }
}

async function mostrarEntregasModal(tareaId) {
  try {
    modalContent.innerHTML = '<p>Cargando entregas...</p>';
    modal.style.display = 'block';
    const { data: tarea, error: tareaError } = await supabase
      .from('tareas')
      .select('titulo')
      .eq('id', tareaId)
      .single();
    if (tareaError) throw tareaError;
    const { data: entregas, error: entregasError } = await supabase
      .from('entregas')
      .select(`*`)
      .eq('tarea_id', tareaId)
      .order('fecha_entrega', { ascending: false });
    if (entregasError) throw entregasError;
    let entregasHTML = '';
    if (entregas.length === 0) {
      entregasHTML = '<p class="no-items">No hay entregas para esta tarea</p>';
    } else {
      entregas.forEach(entrega => {
        const estudianteNombre = entrega.user_roles?.nombre || entrega.user_roles?.email || 'Entrega de Tarea';
        const fechaEntrega = toChileDateTimeString(entrega.fecha_entrega);
        const estado = entrega.estado === 'calificado'
          ? `<span class="badge" style="background-color: #e53935;">Calificado (${entrega.calificacion}/7.0)</span>`
          : `<span class="badge" style="background-color: #f39c12;">Pendiente</span>`;
        entregasHTML += `
          <div class="entrega-item">
            <div class="entrega-header">
              <h4>${estudianteNombre}</h4>
              ${estado}
            </div>
            <p class="meta-info">
              <i class="far fa-calendar"></i> ${fechaEntrega}
            </p>
	            <div class="entrega-enlace">
	              ${entrega.enlace ? `
	                <p><strong><i class="fas fa-link"></i> Enlace:</strong> 
	                  <a href="${entrega.enlace}" target="_blank">${entrega.enlace}</a>
	                </p>
	              ` : ''}
	            </div>
	            ${renderizarArchivosEntrega(entrega.archivos)}
            ${entrega.comentario ? `
              <div class="entrega-comentario">
                <p><strong><i class="fas fa-comment"></i> Comentario:</strong> ${entrega.comentario}</p>
              </div>
            ` : ''}
            ${entrega.comentario_calificacion ? `
              <div class="calificacion-comentario">
                <p><strong><i class="fas fa-comment-dots"></i> Retroalimentación:</strong> ${entrega.comentario_calificacion}</p>
              </div>
            ` : ''}
            <div class="item-actions">
              <button onclick="mostrarFormularioCalificacion('${entrega.id}')" class="edit-btn">
                <i class="fas fa-graduation-cap"></i> Calificar
              </button>
            </div>
          </div>
        `;
      });
    }
    modalContent.innerHTML = `
      <div class="entregas-modal">
        <h2><i class="fas fa-tasks"></i> Entregas: ${tarea.titulo}</h2>
        <div class="entregas-container">
          ${entregasHTML}
        </div>
        <button onclick="cerrarModal()" class="btn-cerrar">
          <i class="fas fa-times"></i> Cerrar
        </button>
      </div>
    `;
  } catch (error) {
    console.error('Error al cargar entregas:', error);
    modalContent.innerHTML = `
      <div class="error-modal">
        <h2><i class="fas fa-exclamation-triangle"></i> Error</h2>
        <p>No se pudieron cargar las entregas: ${error.message}</p>
        <button onclick="cerrarModal()" class="btn-cerrar">
          <i class="fas fa-times"></i> Cerrar
        </button>
      </div>
    `;
  }
}

async function exportarEntregasCSV(tareaId) {
  try {
    const { data: tarea, error: tareaError } = await supabase
      .from('tareas')
      .select('titulo')
      .eq('id', tareaId)
      .single();
    if (tareaError) throw tareaError;
    const { data: entregas, error: entregasError } = await supabase
      .from('entregas')
      .select(`
        *,
        user_roles:estudiante_id (nombre, email)
      `)
      .eq('tarea_id', tareaId);
    if (entregasError) throw entregasError;
    let csvContent = "Estudiante,Email,Fecha Entrega,Enlace,Estado,Calificación,Comentario Estudiante,Retroalimentación\n";
    entregas.forEach(entrega => {
      const estudiante = entrega.user_roles;
      csvContent += `"${estudiante?.nombre || ''}","${estudiante?.email || ''}",`;
      csvContent += `"${toChileDateTimeString(entrega.fecha_entrega)}","${entrega.enlace}",`;
      csvContent += `"${entrega.estado}","${entrega.calificacion || ''}","${entrega.comentario || ''}","${entrega.comentario_calificacion || ''}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `entregas_${tarea.titulo.replace(/ /g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error al exportar entregas:', error);
    mostrarToast('Error al exportar entregas: ' + error.message, 'error');
  }
}

window.iniciarSesion = iniciarSesion;
window.entrarCurso = entrarCurso;
window.editarCurso = editarCurso;
window.editarClase = editarClase;
window.eliminarCurso = eliminarCurso;
window.editarGuia = editarGuia;
window.eliminarGuia = eliminarGuia;
window.editarTarea = editarTarea;
window.eliminarTarea = eliminarTarea;
window.editarTest = editarTest;
window.eliminarTest = eliminarTest;
window.actualizarTest = actualizarTest;
window.agregarPreguntaBuilder = agregarPreguntaBuilder;
window.eliminarPreguntaBuilder = eliminarPreguntaBuilder;
window.cambiarTipoPreguntaBuilder = cambiarTipoPreguntaBuilder;
window.actualizarPuntajeTestBuilder = actualizarPuntajeTestBuilder;
window.togglePreguntaBuilder = togglePreguntaBuilder;
window.resolverTest = resolverTest;
window.enviarTest = enviarTest;
window.mostrarIntentosTest = mostrarIntentosTest;
window.corregirIntentoTest = corregirIntentoTest;
window.guardarCorreccionTest = guardarCorreccionTest;
window.verResultadoTest = verResultadoTest;
window.toggleCompletada = toggleCompletada;
window.editarCapsula = editarCapsula;
window.eliminarCapsula = eliminarCapsula;
window.actualizarCurso = actualizarCurso;
window.actualizarGuia = actualizarGuia;
window.actualizarTarea = actualizarTarea;
window.actualizarCapsula = actualizarCapsula;
window.verificarPermisosEdicion = verificarPermisosEdicion;
window.puedeCrearContenido = puedeCrearContenido;
window.mostrarModalAuth = mostrarModalAuth;
window.iniciarSesion = iniciarSesion;
window.mostrarSeccion = mostrarSeccion;
window.mostrarSeccionCurso = mostrarSeccionCurso;
window.activarPestanaCurso = activarPestanaCurso;
window.editarObjetivos = editarObjetivos;
window.editarRequisitos = editarRequisitos;
window.guardarObjetivos = guardarObjetivos;
window.guardarRequisitos = guardarRequisitos;
window.cancelarEdicion = cancelarEdicion;
window.editarParticipante = editarParticipante;
window.guardarCambiosParticipante = guardarCambiosParticipante;
window.exportarCalificaciones = exportarCalificaciones;
window.renderizarCalificaciones = renderizarCalificaciones;
window.puedeAdministrarParticipantes = puedeAdministrarParticipantes;
window.puedeDesmatricular = puedeDesmatricular;
window.puedeMatricular = puedeMatricular;
window.mostrarFormularioInscripcion = mostrarFormularioInscripcion;
window.guardarInscripcion = guardarInscripcion;
window.eliminarInscripcion = eliminarInscripcion;
window.mostrarFormularioEntrega = mostrarFormularioEntrega;
window.mostrarFormularioCalificacion = mostrarFormularioCalificacion;
window.eliminarEntregaModal = eliminarEntregaModal;
window.editarCalificacion = editarCalificacion;
window.actualizarCalificacion = actualizarCalificacion;
window.guardarCalificacion = guardarCalificacion;
window.mostrarDetalleAsistencia = mostrarDetalleAsistencia;
window.exportarAsistencia = exportarAsistencia;
window.mostrarAsistenciaClase = mostrarAsistenciaClase;
window.guardarAsistencia = guardarAsistencia;
window.eliminarClase = eliminarClase;
window.guardarClase = guardarClase;
window.mostrarFormularioClase = mostrarFormularioClase;
window.actualizarEstadoAsistencia = actualizarEstadoAsistencia;
window.agregarAviso = agregarAviso;
window.guardarAviso = guardarAviso;
window.mostrarAvisosModal = mostrarAvisosModal;
window.mostrarFormularioAviso = mostrarFormularioAviso;
window.editarAviso = editarAviso;
window.eliminarAviso = eliminarAviso;
window.mostrarFormularioAvatar = mostrarFormularioAvatar;
window.actualizarAvatar = actualizarAvatar;
window.mostrarEntregasModal = mostrarEntregasModal;
window.exportarEntregasCSV = exportarEntregasCSV;
window.crearReunion = crearReunion;
window.crearReunionCursoActual = crearReunionCursoActual;
window.guardarReunion = guardarReunion;
window.eliminarReunion = eliminarReunion;
window.unirseReunion = unirseReunion;
window.generarEnlaceReunion = generarEnlaceReunion;
window.descargarCertificado = descargarCertificado;
