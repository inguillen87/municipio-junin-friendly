// ============================================================
// REAL-DATA-LOADER.JS - Sprint 4 Analytics Pipeline
// Fetches real JSON files from /rrhh-data and processes KPIs
// ============================================================

(function(global) {
  'use strict';

  const RealDB = {
    originalEmpleados: [],
    originalEmpleadosActivos: [],
    empleados: [],
    empleadosActivos: [],
    
    kpis: {
      totalHistorico: 0,
      totalActivos: 0,
      masaSalarial: 0,
      porSector: {},
      porGenero: { M: 0, F: 0 },
      altasPorAnio: {} // For 8-year historical chart
    },
    
    isLoaded: false,
    onReadyCallbacks: [],

    onReady(callback) {
      if (this.isLoaded) callback();
      else this.onReadyCallbacks.push(callback);
    },

    stripBOM(text) {
      return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    },

    async load() {
      try {
        console.log('[RealDB] Descargando JSONs reales...');
        
        const [resAll, resActive] = await Promise.all([
          fetch('/rrhh-data/empleados.json'),
          fetch('/rrhh-data/empleados_activos.json')
        ]);

        const textAll = await resAll.text();
        const textActive = await resActive.text();

        this.originalEmpleados = JSON.parse(this.stripBOM(textAll));
        this.originalEmpleadosActivos = JSON.parse(this.stripBOM(textActive));
        
        this.applyPeriodFilter('actual'); // Default load

        this.isLoaded = true;
        console.log('[RealDB] Listo. Activos:', this.kpis.totalActivos, '| Históricos:', this.kpis.totalHistorico);
        
        this.onReadyCallbacks.forEach(cb => cb());
        this.onReadyCallbacks = [];

      } catch (err) {
        console.error('[RealDB] Error cargando datos reales:', err);
      }
    },

    applyPeriodFilter(period) {
      // Restore arrays
      this.empleados = [...this.originalEmpleados];
      this.empleadosActivos = [...this.originalEmpleadosActivos];

      // "Gestión Actual" o "Comparativa" no significa filtrar a los empleados por fecha de ingreso, 
      // porque los empleados antiguos siguen trabajando en la gestión actual.
      // Aquí podríamos filtrar ausencias o liquidaciones si tuviéramos los arrays históricos, 
      // pero para la nómina y masa salarial debemos mantener a todos los activos.

      this.computeKPIs();
    },

    computeKPIs() {
      const all = this.empleados;
      const act = this.empleadosActivos;

      this.kpis.totalHistorico = all.length;
      this.kpis.totalActivos = act.length;
      
      let masaSalarial = 0;
      
      act.forEach(e => {
        if (e.sexo === 'M' || e.sexo === 'F') {
          this.kpis.porGenero[e.sexo]++;
        }
        
        const sector = e.sector || 'Sin Asignar';
        if (!this.kpis.porSector[sector]) this.kpis.porSector[sector] = 0;
        this.kpis.porSector[sector]++;

        const sueldo = parseFloat(e.sueldoBasico || 0);
        masaSalarial += sueldo;
      });
      
      this.kpis.masaSalarial = masaSalarial;

      const currentYear = 2026;
      const targetYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
      targetYears.forEach(y => this.kpis.altasPorAnio[y] = { altas: 0, totalAcumulado: 0 });

      let runningTotal = 0;
      const sortedByDate = [...all].filter(e => e.fechaIngreso).sort((a,b) => new Date(a.fechaIngreso) - new Date(b.fechaIngreso));
      
      sortedByDate.forEach(e => {
        const year = new Date(e.fechaIngreso).getFullYear();
        if (year <= currentYear) {
           runningTotal++;
           if (this.kpis.altasPorAnio[year]) {
             this.kpis.altasPorAnio[year].altas++;
             this.kpis.altasPorAnio[year].totalAcumulado = runningTotal;
           }
        }
      });
    }
  };

  global.RealDB = RealDB;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RealDB.load());
  } else {
    RealDB.load();
  }

})(window);
