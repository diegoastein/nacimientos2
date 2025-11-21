import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Configuración de Firebase ---
// ⚠️ ¡ATENCIÓN! PEGA TUS CREDENCIALES DE FIREBASE AQUÍ ⚠️const firebaseConfig = {
  apiKey: "AIzaSyCmuO4U_fDthWu_vY-ghx9marNtF78_vzM",
  authDomain: "nacimientos2.firebaseapp.com",
  projectId: "nacimientos2",
  storageBucket: "nacimientos2.firebasestorage.app",
  messagingSenderId: "228024131760",
  appId: "1:228024131760:web:8159300ab19043453d9b75"
};

let app, auth, db;

// Inicialización de Firebase
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("CRITICAL ERROR: Fallo al inicializar Firebase. Revisa tus credenciales.", error);
}

let currentUser = null;
let allPatients = []; // Cache de pacientes para reportes
const patientsCollection = db ? collection(db, "pacientes") : null;
const auditLogsCollection = db ? collection(db, "logs_borrado") : null;

let patientsListenerUnsubscribe = null; 
let logsListenerUnsubscribe = null; 

// --- Lógica de UI ---

document.addEventListener('DOMContentLoaded', () => {
    // Referencias de Vistas y Elementos
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loadingView = document.getElementById('loading-view');
    const userEmailDisplay = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const totalNacimientosSpan = document.getElementById('total-nacimientos');
    
    const loginForm = document.getElementById('login-form');
    
    const consultasView = document.getElementById('consultas-view');
    const logView = document.getElementById('log-view');
    const tabConsultas = document.getElementById('tab-consultas');
    const tabLog = document.getElementById('tab-log');
    
    const searchButton = document.getElementById('search-button');
    const clearSearchButton = document.getElementById('clear-search-button');
    const pacientesTbody = document.getElementById('pacientes-tbody');
    const logsTbody = document.getElementById('logs-tbody');
    
    const viewLogModal = document.getElementById('view-log-modal');
    const closeLogModalButton = document.getElementById('close-log-modal');
    const logDetailsContent = document.getElementById('log-details-content');

    const exportAllButton = document.getElementById('export-all-button');
    const exportFilteredButton = document.getElementById('export-filtered-button');
    
    const toast = document.getElementById('toast');
    
    // Si la inicialización de Firebase falló, mostramos el login y un error
    if (!auth) {
        loadingView.classList.add('hidden');
        loginView.classList.remove('hidden');
        showToast("Error CRÍTICO: Revisa tus credenciales de Firebase.", 'error');
        return; 
    }


    // --- Lógica de Autenticación y Carga ---

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            userEmailDisplay.textContent = user.email;
            loginView.classList.add('hidden');
            appView.classList.remove('hidden');
            loadingView.classList.add('hidden');
            
            setupRealtimeListeners();
            switchTab('consultas');
        } else {
            currentUser = null;
            if (patientsListenerUnsubscribe) patientsListenerUnsubscribe();
            if (logsListenerUnsubscribe) logsListenerUnsubscribe();
            allPatients = [];
            loginView.classList.remove('hidden');
            appView.classList.add('hidden');
            loadingView.classList.add('hidden');
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Inicio de sesión exitoso', 'success');
        } catch (error) {
            console.error("Error en login:", error);
            showToast(`Error: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    });

    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showToast('Sesión cerrada', 'success');
        } catch (error) {
            console.error("Error en logout:", error);
            showToast(`Error: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    });

    // --- Listeners de Firestore ---

    function setupRealtimeListeners() {
        // 1. Listener de Pacientes (Para Reportes)
        if (!patientsCollection) return;

        if (patientsListenerUnsubscribe) patientsListenerUnsubscribe();
        patientsListenerUnsubscribe = onSnapshot(patientsCollection, (snapshot) => {
            allPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            totalNacimientosSpan.textContent = allPatients.length;
            // No ejecutamos searchButton.click() aquí para mantener la tabla vacía al inicio
        }, (error) => {
            console.error("Error en listener de Pacientes:", error);
        });

        // 2. Listener de Logs de Borrado (Para Auditoría)
        if (!auditLogsCollection) return;

        if (logsListenerUnsubscribe) logsListenerUnsubscribe();
        logsListenerUnsubscribe = onSnapshot(auditLogsCollection, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderLogTable(logs);
        }, (error) => {
            console.error("Error en listener de Logs:", error);
            logsTbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error cargando logs.</td></tr>';
        });
    }

    // --- Navegación ---

    function switchTab(tabName) {
        consultasView.classList.add('hidden');
        logView.classList.add('hidden');
        tabConsultas.classList.remove('active');
        tabLog.classList.remove('active');
        tabConsultas.classList.add('inactive');
        tabLog.classList.add('inactive');

        if (tabName === 'consultas') {
            consultasView.classList.remove('hidden');
            tabConsultas.classList.add('active');
            tabConsultas.classList.remove('inactive');
            renderReportTable([], false); // INICIA VACÍO
        } else if (tabName === 'log') {
            logView.classList.remove('hidden');
            tabLog.classList.add('active');
            tabLog.classList.remove('inactive');
        }
    }

    tabConsultas.addEventListener('click', () => switchTab('consultas'));
    tabLog.addEventListener('click', () => switchTab('log'));

    // --- Lógica de Reportes y Búsqueda Avanzada ---

    searchButton.addEventListener('click', () => {
        const apellido = document.getElementById('search-apellido').value.toLowerCase().trim();
        const fechaDesde = document.getElementById('search-fecha-desde').value;
        const fechaHasta = document.getElementById('search-fecha-hasta').value;
        const diagnostico = document.getElementById('filter-diagnostico').value;
        const evolucion = document.getElementById('filter-evolucion').value;
        const tipoNacimiento = document.getElementById('filter-tipo-nacimiento').value;
        const rhMaterno = document.getElementById('filter-rh-materno').value;
        const pcd = document.getElementById('filter-pcd').value;
        const liquido = document.getElementById('filter-liquido').value;
        
        // Filtros de rango
        const edadMaternaDesde = document.getElementById('filter-edad-materna-desde').value ? parseInt(document.getElementById('filter-edad-materna-desde').value) : null;
        const edadMaternaHasta = document.getElementById('filter-edad-materna-hasta').value ? parseInt(document.getElementById('filter-edad-materna-hasta').value) : null;
        const controlesDesde = document.getElementById('filter-controles-desde').value ? parseInt(document.getElementById('filter-controles-desde').value) : null;
        const controlesHasta = document.getElementById('filter-controles-hasta').value ? parseInt(document.getElementById('filter-controles-hasta').value) : null;
        const pesoDesde = document.getElementById('filter-peso-desde').value ? parseFloat(document.getElementById('filter-peso-desde').value) : null;
        const pesoHasta = document.getElementById('filter-peso-hasta').value ? parseFloat(document.getElementById('filter-peso-hasta').value) : null;
        const egDesde = document.getElementById('filter-eg-desde').value ? parseInt(document.getElementById('filter-eg-desde').value) : null;
        const egHasta = document.getElementById('filter-eg-hasta').value ? parseInt(document.getElementById('filter-eg-hasta').value) : null;
        const apgar1Desde = document.getElementById('filter-apgar1-desde').value ? parseInt(document.getElementById('filter-apgar1-desde').value) : null;
        const apgar1Hasta = document.getElementById('filter-apgar1-hasta').value ? parseInt(document.getElementById('filter-apgar1-hasta').value) : null;
        const antPatologicos = document.getElementById('filter-ant-patologicos').value;
        

        // Si no hay datos cargados, no hacemos nada
        if (allPatients.length === 0) {
             renderReportTable([], true); 
             exportFilteredButton.dataset.filteredData = JSON.stringify([]);
             return;
        }

        let filteredPatients = allPatients;

        // --- Aplicar Filtros ---

        // 1. Filtros de Texto y Fecha
        if (apellido) {
            filteredPatients = filteredPatients.filter(p => p.apellido && p.apellido.toLowerCase().includes(apellido));
        }
        if (fechaDesde) {
            const desde = new Date(fechaDesde + "T00:00:00");
            filteredPatients = filteredPatients.filter(p => {
                if (!p.fecha_nacimiento) return false;
                const pDate = new Date(p.fecha_nacimiento + "T00:00:00");
                return pDate >= desde;
            });
        }
        if (fechaHasta) {
            const hasta = new Date(fechaHasta + "T23:59:59");
            filteredPatients = filteredPatients.filter(p => {
                if (!p.fecha_nacimiento) return false;
                const pDate = new Date(p.fecha_nacimiento + "T00:00:00");
                return pDate <= hasta;
            });
        }

        // 2. Filtros de Selección Avanzada
        if (diagnostico) {
            filteredPatients = filteredPatients.filter(p => 
                p.diagnostico && Array.isArray(p.diagnostico) && p.diagnostico.includes(diagnostico)
            );
        }
        if (evolucion) {
            filteredPatients = filteredPatients.filter(p => p.evolucion === evolucion);
        }
        if (rhMaterno) {
             filteredPatients = filteredPatients.filter(p => p.rh_materno === rhMaterno);
        }
        if (tipoNacimiento) {
             filteredPatients = filteredPatients.filter(p => p.tipo_nacimiento === tipoNacimiento);
        }
        if (pcd) {
             filteredPatients = filteredPatients.filter(p => p.pcd === pcd);
        }
        if (liquido) {
             filteredPatients = filteredPatients.filter(p => p.liquido_amniotico === liquido);
        }
        if (antPatologicos) {
             filteredPatients = filteredPatients.filter(p => p.antPatologicos && Array.isArray(p.antPatologicos) && p.antPatologicos.includes(antPatologicos));
        }

        // 3. Filtros de Rango Numérico
        if (edadMaternaDesde !== null) {
            filteredPatients = filteredPatients.filter(p => (p.edad_materna || 0) >= edadMaternaDesde);
        }
        if (edadMaternaHasta !== null) {
            filteredPatients = filteredPatients.filter(p => (p.edad_materna || 0) <= edadMaternaHasta);
        }
        if (controlesDesde !== null) {
            filteredPatients = filteredPatients.filter(p => (p.num_controles || 0) >= controlesDesde);
        }
        if (controlesHasta !== null) {
            filteredPatients = filteredPatients.filter(p => (p.num_controles || 0) <= controlesHasta);
        }
        if (pesoDesde !== null) {
            filteredPatients = filteredPatients.filter(p => (p.peso || 0) >= pesoDesde);
        }
        if (pesoHasta !== null) {
            filteredPatients = filteredPatients.filter(p => (p.peso || 0) <= pesoHasta);
        }
        if (egDesde !== null) {
            filteredPatients = filteredPatients.filter(p => (p.eg || 0) >= egDesde);
        }
        if (egHasta !== null) {
            filteredPatients = filteredPatients.filter(p => (p.eg || 0) <= egHasta);
        }
        if (apgar1Desde !== null) {
            filteredPatients = filteredPatients.filter(p => (p.apgar1 || 0) >= apgar1Desde);
        }
        if (apgar1Hasta !== null) {
            filteredPatients = filteredPatients.filter(p => (p.apgar1 || 0) <= apgar1Hasta);
        }


        renderReportTable(filteredPatients, true);
        exportFilteredButton.dataset.filteredData = JSON.stringify(filteredPatients);
    });

    clearSearchButton.addEventListener('click', () => {
        document.getElementById('search-apellido').value = '';
        document.getElementById('search-fecha-desde').value = '';
        document.getElementById('search-fecha-hasta').value = '';
        document.getElementById('filter-diagnostico').value = '';
        document.getElementById('filter-evolucion').value = '';
        document.getElementById('filter-rh-materno').value = '';
        document.getElementById('filter-tipo-nacimiento').value = '';
        document.getElementById('filter-pcd').value = '';
        document.getElementById('filter-liquido').value = '';
        document.getElementById('filter-edad-materna-desde').value = '';
        document.getElementById('filter-edad-materna-hasta').value = '';
        document.getElementById('filter-controles-desde').value = '';
        document.getElementById('filter-controles-hasta').value = '';
        document.getElementById('filter-peso-desde').value = '';
        document.getElementById('filter-peso-hasta').value = '';
        document.getElementById('filter-eg-desde').value = '';
        document.getElementById('filter-eg-hasta').value = '';
        document.getElementById('filter-apgar1-desde').value = '';
        document.getElementById('filter-apgar1-hasta').value = '';
        document.getElementById('filter-ant-patologicos').value = '';
        
        searchButton.click(); // Vuelve a ejecutar la búsqueda con filtros limpios
        showToast("Filtros limpiados", "success");
    });
    
    function renderReportTable(pacientes, isSearchResult) {
        pacientesTbody.innerHTML = '';
        
        if (pacientes.length === 0) {
            if (isSearchResult) {
                pacientesTbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">No se encontraron pacientes con esos criterios.</td></tr>';
            } else {
                 // INICIA VACÍO
                 pacientesTbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Aplique filtros para generar un reporte.</td></tr>';
            }
            return;
        }

        pacientes.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="p-4 whitespace-nowrap">${p.apellido || ''}</td>
                <td class="p-4 whitespace-nowrap">${p.nombre || ''}</td>
                <td class="p-4 whitespace-nowrap">${formatDate(p.fecha_nacimiento)}</td>
                <td class="p-4 whitespace-nowrap text-sm">${p.createdBy || '-'}</td> <!-- CORRECCIÓN AQUÍ -->
                <td class="p-4 whitespace-nowrap">${p.diagnostico ? p.diagnostico.join(', ') : ''}</td>
                <td class="p-4 whitespace-nowrap">${p.evolucion || '-'}</td>
                <td class="p-4 whitespace-nowrap text-right">
                    <button class="btn-detail" data-id="${p.id}" data-type="patient">Ver Ficha</button>
                </td>
            `;
            pacientesTbody.appendChild(tr);
        });

        pacientesTbody.querySelectorAll('.btn-detail').forEach(btn => {
            btn.addEventListener('click', (e) => viewPatientDetails(e.target.dataset.id));
        });
    }
    
    // Función para ver detalles del paciente (solo para esta app de auditoría)
    function viewPatientDetails(patientId) {
        const paciente = allPatients.find(p => p.id === patientId);
        if (!paciente) return showToast("Error: Paciente no encontrado", "error");

        logDetailsContent.innerHTML = formatPatientData(paciente);
        viewLogModal.classList.remove('hidden');
    }

    // --- Lógica de Log de Borrado ---
    
    function renderLogTable(logs) {
        logsTbody.innerHTML = '';
        if (logs.length === 0) {
             logsTbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay registros de borrado.</td></tr>';
             return;
        }
        
        logs.sort((a, b) => b.deletedAt.toDate() - a.deletedAt.toDate()); // Ordenar por fecha reciente

        logs.forEach(log => {
            const pacienteNombre = log.patientData.apellido ? `${log.patientData.apellido}, ${log.patientData.nombre}` : 'Paciente sin nombre';
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-red-50';
            tr.innerHTML = `
                <td class="p-4 whitespace-nowrap font-medium">${pacienteNombre}</td>
                <td class="p-4 whitespace-nowrap text-sm">${log.deletedBy || 'Usuario Desconocido'}</td>
                <td class="p-4 whitespace-nowrap text-sm">${log.deletedAt ? log.deletedAt.toDate().toLocaleString('es-AR') : '-'}</td>
                <td class="p-4 whitespace-nowrap text-right">
                    <button class="btn-detail-log" data-id="${log.id}">Ver Datos</button>
                </td>
            `;
            logsTbody.appendChild(tr);
        });

        logsTbody.querySelectorAll('.btn-detail-log').forEach(btn => {
            btn.addEventListener('click', (e) => viewLogDetails(e.target.dataset.id, logs));
        });
    }

    function viewLogDetails(logId, logs) {
        const log = logs.find(l => l.id === logId);
        if (!log || !log.patientData) return showToast("Error: Log no encontrado", "error");
        
        logDetailsContent.innerHTML = `
            <div class="space-y-2">
                <p class="font-semibold">Borrado por: <span class="font-normal">${log.deletedBy || '-'}</span></p>
                <p class="font-semibold">Fecha/Hora: <span class="font-normal">${log.deletedAt ? log.deletedAt.toDate().toLocaleString('es-AR') : '-'}</span></p>
            </div>
            <hr class="my-4">
            ${formatPatientData(log.patientData)}
        `;
        viewLogModal.classList.remove('hidden');
    }
    
    closeLogModalButton.addEventListener('click', () => viewLogModal.classList.add('hidden'));

    // --- Funciones de Utilidad ---
    
    function formatPatientData(p) {
        const formatArray = (arr) => Array.isArray(arr) ? arr.join(', ') : (arr || '-');
        const serologias = [
            `VDRL: ${p.vdrl_resultado || '-'} (${p.vdrl_fecha || '-'})`,
            `HIV: ${p.hiv_resultado || '-'} (${p.hiv_fecha || '-'})`,
            `Chagas: ${p.chagas_resultado || '-'} (${p.chagas_fecha || '-'})`,
            `HBV: ${p.hbv_resultado || '-'} (${p.hbv_fecha || '-'})`,
            `Toxoplasmosis: ${p.toxo_resultado || '-'} (${p.toxo_fecha || '-'})`,
            `CMV: ${p.cmv_resultado || '-'} (${p.cmv_fecha || '-'})`,
        ].join(' | ');

        return `
            <h4 class="font-bold text-lg text-blue-700">${p.apellido || '-'}, ${p.nombre || '-'}</h4>
            <div class="grid grid-cols-2 gap-y-1 text-sm">
                <p><strong>Nacimiento:</strong> ${formatDate(p.fecha_nacimiento)} - ${p.hora_nacimiento || '-'}</p>
                <p><strong>Edad Materna:</strong> ${p.edad_materna || '-'}</p>
                <p><strong>G/P/A:</strong> ${p.g || '-'}/${p.p || '-'}/${p.a || '-'}</p>
                <p><strong>Controles:</strong> ${p.controlada === true ? 'Sí' : 'No'} (${p.num_controles || 0})</p>
                <p class="col-span-2"><strong>Ant. Patológicos:</strong> ${formatArray(p.antPatologicos)}</p>
                <p><strong>Grupo Mat/Rh:</strong> ${p.grupo_materno || '-'}/${p.rh_materno || '-'}</p>
                <p><strong>Grupo Pac/Rh:</strong> ${p.grupo_paciente || '-'}/${p.rh_paciente || '-'}</p>
                <p><strong>PCD/PCI:</strong> ${p.pcd || '-'}/${p.pci || '-'}</p>
            </div>

            <h4 class="font-bold mt-3 text-blue-700">Datos Parto y Evolución</h4>
            <div class="grid grid-cols-2 gap-y-1 text-sm">
                <p><strong>Tipo Nacimiento:</strong> ${p.tipo_nacimiento || '-'}</p>
                <p><strong>Membranas:</strong> ${p.membranas || '-'}</p>
                <p><strong>Liq. Amniótico:</strong> ${p.liquido_amniotico || '-'}</p>
                <p><strong>Evolución:</strong> <span class="font-semibold">${p.evolucion || '-'}</span></p>
            </div>
            
            <h4 class="font-bold mt-3 text-blue-700">Mediciones</h4>
            <div class="grid grid-cols-2 gap-y-1 text-sm">
                <p><strong>Peso:</strong> ${p.peso || '-'} gr</p>
                <p><strong>Talla:</strong> ${p.talla || '-'} cm</p>
                <p><strong>PC:</strong> ${p.pc || '-'} cm</p>
                <p><strong>EG:</strong> ${p.eg || '-'} sem</p>
                <p><strong>Apgar 1/5:</strong> ${p.apgar1 || '-'}/${p.apgar5 || '-'}</p>
            </div>
            
            <h4 class="font-bold mt-3 text-blue-700">Serologías</h4>
            <p class="text-xs break-words">${serologias}</p>
            <p class="text-xs mt-1">Notas Serológicas: ${p.serologias_notas || '-'}</p>

            <h4 class="font-bold mt-3 text-blue-700">Diagnóstico</h4>
            <p class="text-sm">${formatArray(p.diagnostico)}</p>
            ${p.diagnostico_otros ? `<p class="text-sm italic">Otros: ${p.diagnostico_otros}</p>` : ''}

            <h4 class="font-bold mt-3 text-blue-700">Notas Generales</h4>
            <p class="text-sm whitespace-pre-wrap">${p.notas || '-'}</p>
            <hr class="my-3">
            <p class="text-xs text-gray-500">Ingresado por: ${p.createdBy || '-'} / Modificado por: ${p.lastModifiedBy || '-'}</p>
        `;
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + "T00:00:00");
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Exportación
    const exportHeadersMap = {
        apellido: "Apellido", nombre: "Nombre", fecha_nacimiento: "Fecha Nacimiento", hora_nacimiento: "Hora Nacimiento",
        edad_materna: "Edad Materna", g: "G", p: "P", a: "A", controlada: "Controlada", num_controles: "N° Controles",
        antPatologicos: "Ant. Patológicos", tipo_nacimiento: "Tipo Nacimiento", membranas: "Membranas", 
        liquido_amniotico: "Liq. Amniótico", evolucion: "Evolución", peso: "Peso (gr)", talla: "Talla (cm)",
        pc: "PC (cm)", eg: "EG (sem)", apgar1: "Apgar 1", apgar5: "Apgar 5", grupo_materno: "Grupo Materno",
        rh_materno: "Rh Materno", grupo_paciente: "Grupo Paciente", rh_paciente: "Rh Paciente", pcd: "PCD", pci: "PCI",
        diagnostico: "Diagnóstico", diagnostico_otros: "Otros Diag.", notas: "Notas",
        vdrl_fecha: "Fecha VDRL", vdrl_resultado: "Res. VDRL", hiv_fecha: "Fecha HIV", hiv_resultado: "Res. HIV",
        chagas_fecha: "Fecha Chagas", chagas_resultado: "Res. Chagas", hbv_fecha: "Fecha HBV", hbv_resultado: "Res. HBV",
        toxo_fecha: "Fecha Toxo", toxo_resultado: "Res. Toxo", cmv_fecha: "Fecha CMV", cmv_resultado: "Res. CMV",
        serologias_notas: "Notas Serologías", createdBy: "Creado Por", createdAt: "Fecha Creación", // Added createdBy here
        lastModifiedBy: "Modificado Por", lastModifiedAt: "Fecha Modificación"
    };

    function exportToCSV(data, filename) {
        if (data.length === 0) return showToast("No hay datos para exportar", "error");

        const headers = Object.keys(exportHeadersMap);
        const csvHeaders = Object.values(exportHeadersMap);
        let csvContent = "data:text/csv;charset=utf-8," + csvHeaders.join(",") + "\r\n";

        data.forEach(row => {
            const values = headers.map(header => {
                let value = row[header] || "";
                if (value && value.toDate) value = value.toDate().toLocaleString('es-AR');
                if (Array.isArray(value)) value = value.join('; ');
                if (typeof value === 'boolean') value = value ? "SI" : "NO";
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvContent += values.join(",") + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Exportación completada", "success");
    }

    exportAllButton.addEventListener('click', () => exportToCSV(allPatients, "reporte_todos.csv"));
    exportFilteredButton.addEventListener('click', (e) => {
        const filtered = JSON.parse(e.target.dataset.filteredData || "[]");
        exportToCSV(filtered, "reporte_filtrado.csv");
    });
    
    let toastTimer;
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = type;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function getFirebaseErrorMessage(error) {
        return error.message;
    }
}
