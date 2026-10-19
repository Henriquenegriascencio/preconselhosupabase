const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve arquivos estáticos (HTML, CSS, JS)
app.use(express.static(__dirname));

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'placeholder';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Memória do servidor para reconhecer Administradores cadastrados
const adminsRegistrados = new Set(['admin', 'admin@escola.com']);

// ----------------------------------------------------
// ROTA RAIZ
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------------------
// AUTENTICAÇÃO / LOGIN
// ----------------------------------------------------
app.get('/api/auth/login', (req, res) => {
    res.redirect('/');
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const body = req.body || {};
        const loginInput = String(body.email || body.usuario || body.nome || body.login || '').trim();
        const inputLower = loginInput.toLowerCase();
        const tipoSolicitado = String(body.tipo || body.role || '').toLowerCase();

        if (!loginInput) {
            return res.status(400).json({ success: false, error: 'Informe o e-mail ou nome de usuário.' });
        }

        // Verifica se é Administrador (pelo tipo, palavra 'admin' ou lista de cadastrados)
        const eAdmin = tipoSolicitado === 'admin' || 
                       inputLower.includes('admin') || 
                       adminsRegistrados.has(inputLower) || 
                       adminsRegistrados.has(loginInput);

        if (eAdmin) {
            return res.json({
                success: true,
                usuario: { 
                    id: 'admin-' + Date.now(), 
                    nome: loginInput.includes('admin') ? loginInput : (body.nome || loginInput || 'Administrador'), 
                    email: inputLower.includes('@') ? inputLower : 'admin@escola.com',
                    tipo: 'admin', 
                    role: 'admin' 
                }
            });
        }

        // Busca Professor no Supabase
        let profEncontrado = null;
        try {
            const { data: professores } = await supabase.from('professores').select('*');
            if (professores && professores.length > 0) {
                profEncontrado = professores.find(p => 
                    (p.email && String(p.email).toLowerCase().trim() === inputLower) ||
                    (p.nome && String(p.nome).toLowerCase().trim() === inputLower)
                );
            }
        } catch (supaErr) {
            console.log('Aviso no Supabase:', supaErr.message);
        }

        if (profEncontrado) {
            return res.json({
                success: true,
                usuario: { 
                    id: profEncontrado.id, 
                    nome: profEncontrado.nome, 
                    email: profEncontrado.email || `${profEncontrado.nome}@escola.com`, 
                    tipo: 'professor',
                    role: 'professor'
                }
            });
        }

        // Se o tipo enviado for explicitamente admin
        if (tipoSolicitado === 'admin') {
            return res.json({
                success: true,
                usuario: { id: 'admin', nome: loginInput, email: inputLower, tipo: 'admin', role: 'admin' }
            });
        }

        // Fallback para Professor
        return res.json({
            success: true,
            usuario: { 
                id: 'prof-' + Date.now(), 
                nome: loginInput, 
                email: inputLower.includes('@') ? inputLower : `${inputLower.replace(/\s+/g, '')}@escola.com`, 
                tipo: 'professor',
                role: 'professor'
            }
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// AUTENTICAÇÃO / CADASTRO
// ----------------------------------------------------
app.get('/api/auth/cadastro', (req, res) => {
    res.redirect('/');
});

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const body = req.body || {};
        const nome = String(body.nome || body.usuario || body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const tipoSolicitado = String(body.tipo || body.role || '').trim().toLowerCase();

        if (!nome) {
            return res.status(400).json({ success: false, error: 'Informe o nome para realizar o cadastro.' });
        }

        const isAdmin = tipoSolicitado === 'admin' || nome.toLowerCase().includes('admin') || email.includes('admin');
        const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

        // 1. CADASTRO DE ADMINISTRADOR
        if (isAdmin) {
            // Regista o email e nome na lista de admins
            adminsRegistrados.add(emailFinal);
            adminsRegistrados.add(nome.toLowerCase());

            return res.json({
                success: true,
                message: 'Administrador cadastrado com sucesso!',
                usuario: {
                    id: 'admin-' + Date.now(),
                    nome: nome,
                    email: emailFinal,
                    tipo: 'admin',
                    role: 'admin'
                }
            });
        }

        // 2. CADASTRO DE PROFESSOR
        let usuarioCriado = null;
        try {
            const { data, error } = await supabase
                .from('professores')
                .insert([{ nome, email: emailFinal }])
                .select();

            if (!error && data && data.length > 0) {
                usuarioCriado = {
                    id: data[0].id,
                    nome: data[0].nome,
                    email: data[0].email,
                    tipo: 'professor',
                    role: 'professor'
                };
            }
        } catch (supaErr) {
            console.log('Aviso ao salvar no Supabase:', supaErr.message);
        }

        if (!usuarioCriado) {
            usuarioCriado = {
                id: 'prof-' + Date.now(),
                nome: nome,
                email: emailFinal,
                tipo: 'professor',
                role: 'professor'
            };
        }

        return res.json({
            success: true,
            message: 'Professor cadastrado com sucesso!',
            usuario: usuarioCriado
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// ROTAS DO PROFESSOR (TURMAS E FICHAS)
// ----------------------------------------------------
app.get('/api/professor/turmas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [vinculosRes, turmasRes, matsRes] = await Promise.all([
            supabase.from('vinculos').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*')
        ]);

        const vinculos = vinculosRes.data || [];
        const turmas = turmasRes.data || [];
        const mats = matsRes.data || [];

        const turmaMap = Object.fromEntries(turmas.map(t => [t.id, t]));
        const matMap = Object.fromEntries(mats.map(m => [m.id, m]));

        const filtrados = (id === 'admin' || id.includes('admin')) 
            ? vinculos 
            : vinculos.filter(v => String(v.professor_id) === String(id));

        let resultado = filtrados.map(v => ({
            id: v.id,
            turma_id: v.turma_id,
            materia_id: v.materia_id,
            turmas: turmaMap[v.turma_id] || { nome: 'Turma' },
            materias: matMap[v.materia_id] || { nome: 'Matéria' }
        }));

        if (resultado.length === 0 && turmas.length > 0) {
            resultado = turmas.map(t => ({
                turma_id: t.id,
                materia_id: mats[0]?.id || null,
                turmas: t,
                materias: mats[0] || { nome: 'Matéria' }
            }));
        }

        res.json(resultado);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/professor/fichas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [vinculosRes, profsRes, turmasRes, matsRes] = await Promise.all([
            supabase.from('vinculos').select('*'),
            supabase.from('professores').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*')
        ]);

        const vinculos = vinculosRes.data || [];
        const profs = profsRes.data || [];
        const turmas = turmasRes.data || [];
        const mats = matsRes.data || [];

        const profMap = Object.fromEntries(profs.map(p => [p.id, p]));
        const turmaMap = Object.fromEntries(turmas.map(t => [t.id, t]));
        const matMap = Object.fromEntries(mats.map(m => [m.id, m]));

        const filtrados = (id === 'admin' || id.includes('admin')) 
            ? vinculos 
            : vinculos.filter(v => String(v.professor_id) === String(id));

        const fichas = filtrados.map(v => ({
            id: v.id,
            professor_id: v.professor_id,
            turma_id: v.turma_id,
            materia_id: v.materia_id,
            professores: profMap[v.professor_id] || null,
            turmas: turmaMap[v.turma_id] || { nome: 'Turma Geral' },
            materias: matMap[v.materia_id] || { nome: 'Matéria Geral' }
        }));

        res.json(fichas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// ROTAS CRUD (TURMAS, MATÉRIAS, PROFESSORES, VÍNCULOS, RESPOSTAS)
// ----------------------------------------------------
app.get('/api/turmas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('turmas').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/turmas', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('turmas').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/turmas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('turmas').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/materias', async (req, res) => {
    try {
        const { data, error } = await supabase.from('materias').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/materias', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('materias').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/materias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('materias').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/professores', async (req, res) => {
    try {
        const { data, error } = await supabase.from('professores').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/professores', async (req, res) => {
    try {
        const { nome, email } = req.body;
        const { data, error } = await supabase.from('professores').insert([{ nome, email }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/professores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('professores').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/vinculos', async (req, res) => {
    try {
        const [vInc, profs, turmas, mats] = await Promise.all([
            supabase.from('vinculos').select('*'),
            supabase.from('professores').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*')
        ]);

        if (vInc.error) throw vInc.error;

        const profMap = Object.fromEntries((profs.data || []).map(p => [p.id, p]));
        const turmaMap = Object.fromEntries((turmas.data || []).map(t => [t.id, t]));
        const matMap = Object.fromEntries((mats.data || []).map(m => [m.id, m]));

        const resultado = (vInc.data || []).map(v => ({
            ...v,
            professores: profMap[v.professor_id] || null,
            turmas: turmaMap[v.turma_id] || null,
            materias: matMap[v.materia_id] || null
        }));

        res.json(resultado);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vinculos', async (req, res) => {
    try {
        const { professor_id, turma_id, materia_id } = req.body;
        const { data, error } = await supabase.from('vinculos').insert([{ professor_id, turma_id, materia_id }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/respostas', async (req, res) => {
    try {
        const [respRes, profRes, turmaRes, matRes, pergRes] = await Promise.all([
            supabase.from('respostas').select('*'),
            supabase.from('professores').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*'),
            supabase.from('perguntas').select('*')
        ]);

        if (respRes.error) throw respRes.error;

        const profMap = Object.fromEntries((profRes.data || []).map(p => [p.id, p]));
        const turmaMap = Object.fromEntries((turmaRes.data || []).map(t => [t.id, t]));
        const matMap = Object.fromEntries((matRes.data || []).map(m => [m.id, m]));
        const pergMap = Object.fromEntries((pergRes.data || []).map(p => [p.id, p]));

        const completas = (respRes.data || []).map(r => ({
            ...r,
            professores: profMap[r.professor_id] || null,
            turmas: turmaMap[r.turma_id] || null,
            materias: matMap[r.materia_id] || null,
            perguntas: pergMap[r.pergunta_id] || null
        }));

        res.json(completas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/respostas', async (req, res) => {
    try {
        const respostasArray = req.body;
        const { data, error } = await supabase.from('respostas').insert(respostasArray).select();
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ----------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));