import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    getDocs, 
    onSnapshot,
    doc, 
    updateDoc, 
    deleteDoc,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Configuración de Firebase ---
// ⚠️ ¡ATENCIÓN! PEGA TUS CREDENCIALES DE FIREBASE AQUÍ ⚠️

const firebaseConfig = {
  apiKey: "AIzaSyCmuO4U_fDthWu_vY-ghx9marNtF78_vzM",
  authDomain: "nacimientos2.firebaseapp.com",
  projectId: "nacimientos2",
  storageBucket: "nacimientos2.firebasestorage.app",
  messagingSenderId: "228024131760",
  appId: "1:228024131760:web:8159300ab19043453d9b75"
};

// --- Inicialización ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let allPatients = []; 
const patientsCollection = collection(db, "pacientes");
const auditLogsCollection = collection(db, "logs_borrado");
let patientsListenerUnsubscribe = null; 

// --- Lógica de UI ---

document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loadingView = document.getElementById('loading-view');
    const userEmailDisplay = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const totalNacimientosSpan = document.getElementById('total-nacimientos');
    const exportAllButton = document.getElementById('export-all-button');
    const exportFilteredButton = document.getElementById('export-filtered-button');

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');
    
    const ingresoView = document.getElementById('ingreso-view');
    const consultasView = document.getElementById('consultas-view');
    const tabIngreso = document.getElementById('tab-ingreso');
    const tabConsultas = document.getElementById('tab-consultas');

    const ingresoForm = document.getElementById('ingreso-form');
    const searchButton = document.getElementById('search-button');
    const clearSearchButton = document.getElementById('clear-search-button');
    const pacientesTbody = document.getElementById('pacientes-tbody');

    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const closeEditModalButton = document.getElementById('close-edit-modal');
    const cancelEditButton = document.getElementById('cancel-edit-button');
    
    // Referencia al botón de guardar del modal (oculto por defecto)
    const saveEditButton = document.getElementById('save-edit-button');
    
    const toast = document.getElementById('toast');

    // --- Lógica de Autenticación ---

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            userEmailDisplay.textContent = user.email;
            loginView.classList.add('hidden');
            appView.classList.remove('hidden');
            loadingView.classList.add('hidden');
            setupRealtimeListener();
        } else {
            currentUser = null;
            if (patientsListenerUnsubscribe) patientsListenerUnsubscribe();
            patientsListenerUnsubscribe = null;
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

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target['signup-email'].value;
        const password = e.target['signup-password'].value;
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast('Usuario creado exitosamente. Iniciando sesión...', 'success');
        } catch (error) {
            console.error("Error en signup:", error);
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

    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // --- Navegación ---

    function switchTab(tabName) {
        ingresoView.classList.add('hidden');
        consultasView.classList.add('hidden');
        tabIngreso.classList.remove('active');
        tabConsultas.classList.remove('active');
        tabIngreso.classList.add('inactive');
        tabConsultas.classList.add('inactive');

        if (tabName === 'ingreso') {
            ingresoView.classList.remove('hidden');
            tabIngreso.classList.add('active');
            tabIngreso.classList.remove('inactive');
        } else if (tabName === 'consultas') {
            consultasView.classList.remove('hidden');
            tabConsultas.classList.add('active');
            tabConsultas.classList.remove('inactive');
            
            // Limpiar inputs
            document.getElementById('search-apellido').value = '';
            document.getElementById('search-fecha-desde').value = '';
            document.getElementById('search-fecha-hasta').value = '';

            // Intentar mostrar la tabla si ya hay datos
            updateTableDefault();
        }
    }
    
    // Función para mostrar por defecto los últimos 3 si no hay filtros
    function updateTableDefault() {
        const apellido = document.getElementById('search-apellido').value;
        const fechaDesde = document.getElementById('search-fecha-desde').value;
        const fechaHasta = document.getElementById('search-fecha-hasta').value;

        // Solo si NO hay filtros activos
        if (!apellido && !fechaDesde && !fechaHasta) {
            const last3 = allPatients.slice(0, 3);
            renderTable(last3, true); 
            const exportBtn = document.getElementById('export-filtered-button');
            if(exportBtn) exportBtn.dataset.filteredData = JSON.stringify(last3);
        }
    }

    tabIngreso.addEventListener('click', () => switchTab('ingreso'));
    tabConsultas.addEventListener('click', () => switchTab('consultas'));

    // --- Ingreso (CON PREVENCIÓN DE DOBLE GUARDADO) ---

    ingresoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUser) {
            showToast('Error: Debes estar logueado', 'error');
            return;
        }

        // 1. Identificamos el botón y lo deshabilitamos para evitar doble click
        const submitButton = ingresoForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        
        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const formData = new FormData(ingresoForm);
            const pacienteData = {};
            formData.forEach((value, key) => {
                pacienteData[key] = value;
            });
            
            pacienteData['controlada'] = document.getElementById('controlada').checked;
            pacienteData['diagnostico'] = Array.from(document.getElementById('diagnostico').selectedOptions).map(opt => opt.value);
            pacienteData['diagnostico_otros'] = document.getElementById('diagnostico_otros').value;
            pacienteData['antPatologicos'] = Array.from(document.getElementById('antPatologicos').selectedOptions).map(opt => opt.value);
            
            pacienteData['pcd'] = document.getElementById('pcd').value;
            pacienteData['pci'] = document.getElementById('pci').value;
            pacienteData['presentacion'] = document.getElementById('presentacion').value;
            
            pacienteData.createdAt = Timestamp.now();
            pacienteData.createdBy = currentUser.email;
            pacienteData.lastModifiedBy = currentUser.email;

            await addDoc(patientsCollection, pacienteData);
            
            showToast('Paciente guardado exitosamente', 'success');
            ingresoForm.reset();
            document.getElementById('diagnostico_otros_wrapper').classList.add('hidden');
            document.querySelectorAll('#ingreso-form details').forEach(d => d.open = false);
            
        } catch (error) {
            console.error("Error guardando paciente:", error);
            showToast(`Error: ${getFirebaseErrorMessage(error)}`, 'error');
        } finally {
            // 2. Reactivamos el botón SIEMPRE, haya error o éxito
            submitButton.disabled = false;
            submitButton.textContent = originalText;
            submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    document.getElementById('diagnostico').addEventListener('change', (e) => {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        const otrosInput = document.getElementById('diagnostico_otros_wrapper');
        if (selected.includes('otros')) {
            otrosInput.classList.remove('hidden');
            document.getElementById('diagnostico_otros').required = true;
        } else {
            otrosInput.classList.add('hidden');
            document.getElementById('diagnostico_otros').required = false;
            document.getElementById('diagnostico_otros').value = '';
        }
    });

    document.querySelector('#edit-form select[name="diagnostico"]').addEventListener('change', (e) => {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        const otrosInput = document.getElementById('edit_diagnostico_otros_wrapper');
        if (selected.includes('otros')) {
            otrosInput.classList.remove('hidden');
            document.querySelector('#edit-form input[name="diagnostico_otros"]').required = true;
        } else {
            otrosInput.classList.add('hidden');
            document.querySelector('#edit-form input[name="diagnostico_otros"]').required = false;
            document.querySelector('#edit-form input[name="diagnostico_otros"]').value = '';
        }
    });

    // --- Consultas ---
    
    function setupRealtimeListener() {
        if (patientsListenerUnsubscribe) patientsListenerUnsubscribe();
        
        patientsListenerUnsubscribe = onSnapshot(patientsCollection, (snapshot) => {
            allPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Ordenar por fecha de creación o nacimiento (descendente)
            allPatients.sort((a, b) => {
                const getMs = (p) => {
                    if (p.createdAt && p.createdAt.toDate) return p.createdAt.toDate().getTime();
                    if (p.fecha_nacimiento) {
                        const d = new Date(p.fecha_nacimiento);
                        if (!isNaN(d.getTime())) return d.getTime();
                    }
                    return 0;
                };
                return getMs(b) - getMs(a);
            });

            // Calcular mes actual
            totalNacimientosSpan.textContent = countCurrentMonthBirths(allPatients);

            // Actualizar tabla
            updateTableDefault();

        }, (error) => {
            console.error("Error en listener:", error);
            showToast("Error de conexión en tiempo real", "error");
        });
    }

    function countCurrentMonthBirths(patients) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        return patients.filter(p => {
            if (!p.fecha_nacimiento) return false;
            const parts = p.fecha_nacimiento.split('-');
            if(parts.length < 2) return false;
            const pYear = parseInt(parts[0]);
            const pMonth = parseInt(parts[1]) - 1;
            return pMonth === currentMonth && pYear === currentYear;
        }).length;
    }

    searchButton.addEventListener('click', () => {
        const apellido = document.getElementById('search-apellido').value.toLowerCase().trim();
        const fechaDesde = document.getElementById('search-fecha-desde').value;
        const fechaHasta = document.getElementById('search-fecha-hasta').value;

        if (!apellido && !fechaDesde && !fechaHasta) {
            showToast("Mostrando últimos ingresos...", "success");
            updateTableDefault();
            return;
        }

        let filteredPatients = allPatients;

        if (apellido) {
            filteredPatients = filteredPatients.filter(p => 
                p.apellido && p.apellido.toLowerCase().includes(apellido)
            );
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

        renderTable(filteredPatients, true);
        exportFilteredButton.dataset.filteredData = JSON.stringify(filteredPatients);
    });

    clearSearchButton.addEventListener('click', () => {
        document.getElementById('search-apellido').value = '';
        document.getElementById('search-fecha-desde').value = '';
        document.getElementById('search-fecha-hasta').value = '';
        updateTableDefault();
        showToast("Búsqueda limpiada", "success");
    });
    
    function renderTable(pacientes, isSearchResult) {
        pacientesTbody.innerHTML = '';
        
        if (pacientes.length === 0) {
            if (isSearchResult) {
                pacientesTbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No se encontraron registros.</td></tr>';
            } else {
                 pacientesTbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Realice una búsqueda.</td></tr>';
            }
            return;
        }

        pacientes.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            
            // --- TABLA: Botones a la derecha. Texto siempre "Ver / Editar" ---
            tr.innerHTML = `
                <td class="p-4 whitespace-nowrap">${p.apellido || ''}</td>
                <td class="p-4 whitespace-nowrap">${p.nombre || ''}</td>
                <td class="p-4 whitespace-nowrap">${formatDate(p.fecha_nacimiento)}</td>
                <td class="p-4 whitespace-nowrap">${p.diagnostico ? p.diagnostico.join(', ') : ''}</td>
                <td class="p-4 whitespace-nowrap text-right">
                    <button class="btn-edit" data-id="${p.id}">Ver / Editar</button>
                    <button class="btn-share ml-1" data-id="${p.id}">Compartir</button>
                    <button class="btn-danger ml-1" data-id="${p.id}">Borrar</button>
                </td>
            `;
            pacientesTbody.appendChild(tr);
        });

        pacientesTbody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => openEditModal(e.target.dataset.id));
        });
        pacientesTbody.querySelectorAll('.btn-danger').forEach(btn => {
            btn.addEventListener('click', (e) => deletePatient(e.target.dataset.id));
        });
        pacientesTbody.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', (e) => sharePatient(e.target.dataset.id));
        });
    }

    // --- Funcionalidad de Compartir ---
    async function sharePatient(patientId) {
        const p = allPatients.find(x => x.id === patientId);
        if (!p) return;

        const formatArray = (arr) => Array.isArray(arr) && arr.length > 0 ? arr.join('; ') : 'Ninguno';
        const formatTimestamp = (ts) => ts && ts.toDate ? ts.toDate().toLocaleString('es-AR') : '-';
        const formatBoolean = (val) => val ? 'SI' : 'NO';

        const text = `*Registro de Nacimiento - ${p.apellido || '-'}, ${p.nombre || '-'}*

--- Datos del Paciente ---
Apellido: ${p.apellido || '-'}
Nombre: ${p.nombre || '-'}
Fecha Nacimiento: ${formatDate(p.fecha_nacimiento)}
Hora Nacimiento: ${p.hora_nacimiento || '-'}

--- Datos del Recién Nacido ---
Peso: ${p.peso || '-'} gr
Talla: ${p.talla || '-'} cm
PC: ${p.pc || '-'} cm
EG: ${p.eg || '-'} semanas
Apgar 1/5: ${p.apgar1 || '-'}/${p.apgar5 || '-'}
Diagnóstico: ${formatArray(p.diagnostico)}
Otros Diag.: ${p.diagnostico_otros || '-'}

--- Condiciones del Parto ---
Tipo Nacimiento: ${p.tipo_nacimiento || '-'}
Presentación: ${p.presentacion || '-'}
Membranas: ${p.membranas || '-'}
Líquido Amniótico: ${p.liquido_amniotico || '-'}
Evolución: ${p.evolucion || '-'}

--- Datos Maternos y Antecedentes ---
Edad Materna: ${p.edad_materna || '-'}
G/P/A: ${p.g || '-'}/${p.p || '-'}/${p.a || '-'}
Controlada: ${formatBoolean(p.controlada)} (${p.num_controles || 0} controles)
Ant. Patológicos: ${formatArray(p.antPatologicos)}

Grupo/Rh Materno: ${p.grupo_materno || '-'} / ${p.rh_materno || '-'}
Grupo/Rh Paciente: ${p.grupo_paciente || '-'} / ${p.rh_paciente || '-'}
PCD/PCI: ${p.pcd || '-'} / ${p.pci || '-'}

--- Serologías Maternas ---
VDRL: ${p.vdrl_resultado || '-'} (${formatDate(p.vdrl_fecha)})
HIV: ${p.hiv_resultado || '-'} (${formatDate(p.hiv_fecha)})
Chagas: ${p.chagas_resultado || '-'} (${formatDate(p.chagas_fecha)})
HBV: ${p.hbv_resultado || '-'} (${formatDate(p.hbv_fecha)})
Toxoplasmosis: ${p.toxo_resultado || '-'} (${formatDate(p.toxo_fecha)})
CMV: ${p.cmv_resultado || '-'} (${formatDate(p.cmv_fecha)})
Notas Serologías: ${p.serologias_notas || '-'}

--- Notas Adicionales ---
Notas: ${p.notas || '-'}

--- Auditoría ---
Creado Por: ${p.createdBy || '-'} en ${formatTimestamp(p.createdAt)}
Modificado Por: ${p.lastModifiedBy || '-'} en ${formatTimestamp(p.lastModifiedAt)}`;

        // API Nativa
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Datos del Paciente',
                    text: text
                });
                return;
            } catch (err) {
                console.log("Share API cancelado o falló, intentando fallback...");
            }
        } 
        
        // Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copiado al portapapeles', 'success');
            }).catch(() => {
                fallbackCopyTextToClipboard(text);
            });
        } else {
            fallbackCopyTextToClipboard(text);
        }
    }

    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) showToast('Copiado al portapapeles', 'success');
            else showToast('No se pudo copiar automáticamente', 'error');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            showToast('Error al copiar', 'error');
        }

        document.body.removeChild(textArea);
    }

    // --- Lógica de Edición (Modal) ---

    // Detectar cualquier cambio en el formulario para mostrar el botón de guardar
    editForm.addEventListener('input', () => {
        saveEditButton.classList.remove('hidden');
    });
    editForm.addEventListener('change', () => {
        saveEditButton.classList.remove('hidden');
    });

    function openEditModal(patientId) {
        const paciente = allPatients.find(p => p.id === patientId);
        if (!paciente) {
            showToast("Error: Paciente no encontrado", "error");
            return;
        }
        
        // --- Ocultamos el botón de guardar al abrir ---
        saveEditButton.classList.add('hidden');

        editForm.dataset.id = patientId;
        for (const key in paciente) {
            const input = editForm.elements[key];
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = paciente[key];
                } else if (input.tagName === 'SELECT' && input.multiple) {
                    Array.from(input.options).forEach(opt => {
                        opt.selected = paciente[key] && paciente[key].includes(opt.value);
                    });
                    if (input.name === 'diagnostico') {
                        input.dispatchEvent(new Event('change'));
                    }
                } else {
                    input.value = paciente[key];
                }
            }
        }
        
        editForm.querySelectorAll('details').forEach(d => {
            d.open = false; 
            const selects = d.querySelectorAll('select[multiple]');
            let hasSelection = false;
            selects.forEach(s => {
                if (paciente[s.name] && paciente[s.name].length > 0) hasSelection = true;
            });
            if (hasSelection) d.open = true;
        });
        
        editModal.classList.remove('hidden');
    }

    function closeEditModal() {
         editModal.classList.add('hidden');
    }

    closeEditModalButton.addEventListener('click', closeEditModal);
    cancelEditButton.addEventListener('click', closeEditModal);

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientId = e.target.dataset.id;
        if (!patientId || !currentUser) {
            showToast("Error: No se pudo guardar", "error");
            return;
        }

        try {
            const formData = new FormData(editForm);
            const updatedData = {};
            formData.forEach((value, key) => {
                updatedData[key] = value;
            });
            
            updatedData['controlada'] = editForm.elements['controlada'].checked;
            updatedData['diagnostico'] = Array.from(editForm.elements['diagnostico'].selectedOptions).map(opt => opt.value);
            updatedData['diagnostico_otros'] = editForm.elements['diagnostico_otros'].value;
            updatedData['antPatologicos'] = Array.from(editForm.elements['antPatologicos'].selectedOptions).map(opt => opt.value);
            
            updatedData.lastModifiedBy = currentUser.email;
            updatedData.lastModifiedAt = Timestamp.now();

            const patientDocRef = doc(db, "pacientes", patientId);
            await updateDoc(patientDocRef, updatedData);

            showToast("Paciente actualizado exitosamente", "success");
            closeEditModal();
            updateTableDefault();
            
        } catch (error) {
            console.error("Error actualizando paciente:", error);
            showToast(`Error al actualizar: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    });

    // --- Lógica de Borrado ---

    async function deletePatient(patientId) {
        if (!confirm("¿Estás seguro de que deseas borrar este paciente? Esta acción es irreversible.")) {
            return;
        }

        try {
            const patientData = allPatients.find(p => p.id === patientId);
            const logData = {
                patientId: patientId,
                deletedBy: currentUser.email,
                deletedAt: Timestamp.now(),
                patientData: patientData || {} 
            };
            await addDoc(auditLogsCollection, logData);

            const patientDocRef = doc(db, "pacientes", patientId);
            await deleteDoc(patientDocRef);

            showToast("Paciente borrado exitosamente", "success");
            
        } catch (error) {
            console.error("Error borrando paciente:", error);
            showToast(`Error al borrar: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    }
    
    // --- Lógica de Exportación a CSV ---

    function exportToCSV(data, filename) {
        if (data.length === 0) {
            showToast("No hay datos para exportar", "error");
            return;
        }

        const headersMap = {
            apellido: "Apellido",
            nombre: "Nombre",
            fecha_nacimiento: "Fecha Nacimiento",
            hora_nacimiento: "Hora Nacimiento",
            edad_materna: "Edad Materna",
            g: "G",
            p: "P",
            a: "A",
            controlada: "Controlada",
            num_controles: "N° Controles",
            antPatologicos: "Ant. Patológicos",
            tipo_nacimiento: "Tipo Nacimiento",
            presentacion: "Presentación",
            membranas: "Membranas",
            liquido_amniotico: "Liq. Amniótico",
            evolucion: "Evolución",
            peso: "Peso (gr)",
            talla: "Talla (cm)",
            pc: "PC (cm)",
            eg: "EG (sem)",
            apgar1: "Apgar 1",
            apgar5: "Apgar 5",
            grupo_materno: "Grupo Materno",
            rh_materno: "Rh Materno",
            grupo_paciente: "Grupo Paciente",
            rh_paciente: "Rh Paciente",
            pcd: "PCD",
            pci: "PCI",
            diagnostico: "Diagnóstico",
            diagnostico_otros: "Otros Diag.",
            notas: "Notas",
            vdrl_fecha: "Fecha VDRL",
            vdrl_resultado: "Res. VDRL",
            hiv_fecha: "Fecha HIV",
            hiv_resultado: "Res. HIV",
            chagas_fecha: "Fecha Chagas",
            chagas_resultado: "Res. Chagas",
            hbv_fecha: "Fecha HBV",
            hbv_resultado: "Res. HBV",
            toxo_fecha: "Fecha Toxo",
            toxo_resultado: "Res. Toxo",
            cmv_fecha: "Fecha CMV",
            cmv_resultado: "Res. CMV",
            serologias_notas: "Notas Serologías",
            createdBy: "Creado Por",
            createdAt: "Fecha Creación",
            lastModifiedBy: "Modificado Por",
            lastModifiedAt: "Fecha Modificación"
        };

        const headers = Object.keys(headersMap);
        const csvHeaders = Object.values(headersMap);
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += csvHeaders.join(",") + "\r\n";

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
    
    exportAllButton.addEventListener('click', () => exportToCSV(allPatients, "todos.csv"));
    exportFilteredButton.addEventListener('click', (e) => {
        const filtered = JSON.parse(e.target.dataset.filteredData || "[]");
        exportToCSV(filtered, "filtrados.csv");
    });

    // --- Utilidades ---

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + "T00:00:00");
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

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

    switchTab('ingreso');
});
