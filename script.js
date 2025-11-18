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
            
            document.getElementById('search-apellido').value = '';
            document.getElementById('search-fecha-desde').value = '';
            document.getElementById('search-fecha-hasta').value = '';
            renderTable([], false);
            exportFilteredButton.dataset.filteredData = JSON.stringify([]);
        }
    }

    tabIngreso.addEventListener('click', () => switchTab('ingreso'));
    tabConsultas.addEventListener('click', () => switchTab('consultas'));

    // --- Ingreso ---

    ingresoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showToast('Error: Debes estar logueado', 'error');
            return;
        }

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
            // Guardar PCD y PCI
            pacienteData['pcd'] = document.getElementById('pcd').value;
            pacienteData['pci'] = document.getElementById('pci').value;
            // Membranas y Liquido Amniotico ya se guardan por FormData
            
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
            totalNacimientosSpan.textContent = allPatients.length;
        }, (error) => {
            console.error("Error en listener:", error);
            showToast("Error de conexión en tiempo real", "error");
        });
    }

    searchButton.addEventListener('click', () => {
        const apellido = document.getElementById('search-apellido').value.toLowerCase().trim();
        const fechaDesde = document.getElementById('search-fecha-desde').value;
        const fechaHasta = document.getElementById('search-fecha-hasta').value;

        if (!apellido && !fechaDesde && !fechaHasta) {
            showToast("Por favor, ingrese un criterio de búsqueda.", "error");
            renderTable([], false);
            exportFilteredButton.dataset.filteredData = JSON.stringify([]);
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
        renderTable([], false);
        exportFilteredButton.dataset.filteredData = JSON.stringify([]);
        showToast("Búsqueda limpiada", "success");
    });
    
    function renderTable(pacientes, isSearchResult) {
        pacientesTbody.innerHTML = '';
        
        if (pacientes.length === 0) {
            if (isSearchResult) {
                pacientesTbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No se encontraron pacientes.</td></tr>';
            } else {
                 pacientesTbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Realice una búsqueda para ver resultados.</td></tr>';
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
                <td class="p-4 whitespace-nowrap">${p.diagnostico ? p.diagnostico.join(', ') : ''}</td>
                <td class="p-4 whitespace-nowrap text-right">
                    <button class="btn-edit" data-id="${p.id}">Editar</button>
                    <button class="btn-danger ml-2" data-id="${p.id}">Borrar</button>
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
    }

    // --- Edición ---

    function openEditModal(patientId) {
        const paciente = allPatients.find(p => p.id === patientId);
        if (!paciente) {
            showToast("Error: Paciente no encontrado", "error");
            return;
        }

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
                    if (input.name === 'diagnostico') input.dispatchEvent(new Event('change'));
                } else {
                    input.value = paciente[key];
                }
            }
        }
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
        if (!patientId || !currentUser) return;

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
            searchButton.click();
            
        } catch (error) {
            console.error("Error actualizando:", error);
            showToast(`Error al actualizar: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    });

    // --- Borrado ---

    async function deletePatient(patientId) {
        if (!confirm("¿Estás seguro de que deseas borrar este paciente?")) return;

        try {
            const patientData = allPatients.find(p => p.id === patientId);
            const logData = {
                patientId: patientId,
                deletedBy: currentUser.email,
                deletedAt: Timestamp.now(),
                patientData: patientData || {}
            };
            await addDoc(auditLogsCollection, logData);
            await deleteDoc(doc(db, "pacientes", patientId));

            showToast("Paciente borrado exitosamente", "success");
            searchButton.click();

        } catch (error) {
            console.error("Error borrando:", error);
            showToast(`Error al borrar: ${getFirebaseErrorMessage(error)}`, 'error');
        }
    }
    
    // --- Exportación ---

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
        // (Mismos mensajes de error que antes)
        return error.message;
    }

    switchTab('ingreso');
});