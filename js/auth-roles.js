// ============================================================
// AUTH-ROLES.JS — Quick Role Switcher & Role-Based Control System
// MuniControl Enterprise v5.0
// ============================================================

(function(global) {
  'use strict';

  const ROLES = {
    INTENDENTE: {
      id: 'INTENDENTE',
      name: 'Intendente (SuperAdmin)',
      badge: '👑 Intendente',
      color: '#3b82f6',
      email: 'intendente@junin.gob.ar',
      cargo: 'Intendente Municipal de Junín',
      allowedPages: 'all'
    },
    HACIENDA: {
      id: 'HACIENDA',
      name: 'Hacienda & Contaduría',
      badge: '💰 Sec. Hacienda',
      color: '#10b981',
      email: 'hacienda@junin.gob.ar',
      cargo: 'Secretario de Hacienda y Finanzas',
      allowedPages: ['index','hacienda','presupuesto','control','reportes','analytics','inteligencia','cuentas-claras','exportar']
    },
    RRHH: {
      id: 'RRHH',
      name: 'Recursos Humanos',
      badge: '👥 Dir. RRHH',
      color: '#ec4899',
      email: 'rrhh@junin.gob.ar',
      cargo: 'Director de Recursos Humanos',
      allowedPages: ['index','rrhh','rrhh-sync','organigrama','analytics','reportes']
    },
    COMPRAS: {
      id: 'COMPRAS',
      name: 'Compras & Suministros',
      badge: '🛒 Compras',
      color: '#f59e0b',
      email: 'compras@junin.gob.ar',
      cargo: 'Jefe de Compras y Licitaciones',
      allowedPages: ['index','licitaciones','control','presupuesto','reportes']
    },
    EMPLEADO: {
      id: 'EMPLEADO',
      name: 'Empleado Municipal (Legajo 571)',
      badge: '👤 Empleado',
      color: '#a78bfa',
      email: 'empleado@junin.gob.ar',
      cargo: 'Personal de Planta (Legajo 571 - Mauricio Alonso)',
      allowedPages: ['index','rrhh','ciudadano','cuentas-claras']
    },
    VECINO: {
      id: 'VECINO',
      name: 'Vecino / Transparencia 311',
      badge: '🏙️ Vecino',
      color: '#06b6d4',
      email: 'vecino@junin.gob.ar',
      cargo: 'Vecino del Municipio de Junín',
      allowedPages: ['index','vecinos','obras','mapa','ciudadano','cuentas-claras']
    }
  };

  function getCurrentUser() {
    try {
      const sess = sessionStorage.getItem('mjunin_user') || localStorage.getItem('mjunin_user');
      if (!sess) return ROLES.INTENDENTE;
      const u = JSON.parse(sess);
      return u;
    } catch(e) {
      return ROLES.INTENDENTE;
    }
  }

  function switchRole(roleId) {
    const roleConfig = ROLES[roleId] || ROLES.INTENDENTE;
    const session = {
      name: roleConfig.cargo,
      email: roleConfig.email,
      role: roleConfig.id,
      secretaria: roleConfig.name,
      tenant: 'municipio-junin',
      loginAt: new Date().toISOString()
    };
    sessionStorage.setItem('mjunin_user', JSON.stringify(session));
    localStorage.setItem('mjunin_user', JSON.stringify(session));

    if (window.showToast) {
      window.showToast(`Modo ${roleConfig.name} Activado`, 'success');
    }

    setTimeout(() => {
      window.location.reload();
    }, 300);
  }

  function injectRoleSwitcherWidget() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    const user = getCurrentUser();
    const roleKey = (user.role || 'INTENDENTE').toUpperCase();
    const roleConfig = ROLES[roleKey] || ROLES.INTENDENTE;

    const widget = document.createElement('div');
    widget.id = 'roleSwitcherWidget';
    widget.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      background: rgba(15,23,42,0.85); border: 1px solid ${roleConfig.color}66;
      color: ${roleConfig.color}; padding: 4px 10px; border-radius: 20px;
      font-size: 0.78rem; font-weight: 800; cursor: pointer;
      transition: all 0.2s; box-shadow: 0 0 12px ${roleConfig.color}22;
    `;
    widget.title = 'Hacer clic para cambiar de rol inmediatamente (1 Clic)';
    widget.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${roleConfig.color}"></span>
      <span>${roleConfig.badge}</span>
      <span style="font-size:10px; opacity:0.7">▼</span>
    `;

    widget.onclick = showRoleModal;
    topbarRight.insertBefore(widget, topbarRight.firstChild);
  }

  function showRoleModal() {
    let modal = document.getElementById('roleSwitcherModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'roleSwitcherModal';
      modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.75);
        backdrop-filter: blur(8px); z-index: 99999;
        display: flex; align-items: center; justify-content: center; padding: 20px;
        animation: fadeIn 0.2s ease-out;
      `;

      let grid = '';
      Object.keys(ROLES).forEach(key => {
        const r = ROLES[key];
        grid += `
          <div onclick="window.AuthRoles.switchRole('${r.id}')" style="
            background: rgba(15,23,42,0.9); border: 1px solid ${r.color}44;
            border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; gap: 12px;
          " onmouseover="this.style.borderColor='${r.color}'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='${r.color}44'; this.style.transform='none'">
            <div style="font-size:24px; width:40px; height:40px; border-radius:10px; background:${r.color}22; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${r.badge.split(' ')[0]}
            </div>
            <div>
              <div style="font-size:14px; font-weight:800; color:#f8fafc">${r.name}</div>
              <div style="font-size:11px; color:#94a3b8">${r.cargo}</div>
            </div>
            <button style="margin-left:auto; background:${r.color}; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
              Activar
            </button>
          </div>
        `;
      });

      modal.innerHTML = `
        <div style="background:#060b18; border:1px solid rgba(255,255,255,0.15); border-radius:16px; width:100%; max-width:540px; padding:24px; box-shadow:0 20px 50px rgba(0,0,0,0.8)">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div>
              <h3 style="font-family:'Outfit',sans-serif; font-size:18px; font-weight:900; color:#f8fafc; margin:0">👑 Selector de Roles de Gestión</h3>
              <p style="font-size:12px; color:#94a3b8; margin:2px 0 0">Selecciona con 1 clic para probar los permisos de cada área</p>
            </div>
            <button onclick="document.getElementById('roleSwitcherModal').remove()" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer">&times;</button>
          </div>
          <div style="display:grid; grid-template-columns:1fr; gap:10px;">
            ${grid}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  // Auto Init on DOMReady
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRoleSwitcherWidget);
  } else {
    injectRoleSwitcherWidget();
  }

  global.AuthRoles = {
    ROLES,
    getCurrentUser,
    switchRole,
    showRoleModal
  };

})(typeof window !== 'undefined' ? window : this);
