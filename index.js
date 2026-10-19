const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Tratamento e limpeza da URL do Supabase para evitar 'Invalid path specified'
let rawUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_URL = rawUrl.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'placeholder').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ----------------------------------------------------
// LOGIN
// ----------------------------------------------------
app.get('/api/auth/login', (req, res) => res.redirect('/'));

app.post('/api/auth/login', async (req, res) => {
    try {
        const body = req.body || {};
        const loginInput = String(body.email || body.usuario || body.nome || body.login || '').trim();
        const inputLower = loginInput.toLowerCase();
        const tipoSolicitado = String(body.tipo || body.role || '').toLowerCase();

        if (!loginInput) {
            return res.status(400).json({ success: false, error: 'Informe o e-mail ou nome de utilizador.' });
        }

        const { data: usuarios, error } = await supabase.from('usuarios').select('*');
        if (error) {
            return res.status(500).json({ success: false, error: `Erro no Supabase: ${error.message}` });
        }

        const usuarioEncontrado = (usuarios || []).find(u => 
            (u.email && String(u.email).toLowerCase().trim() === inputLower) ||
            (u.nome && String(u.nome).toLowerCase().trim() === inputLower)
        );

        if (usuarioEncontrado) {
            const eAdmin = usuarioEncontrado.tipo === 'admin' || usuarioEncontrado.role === 'admin';
            return res.json({
                success: true,
                redirect: eAdmin ? 'admin.html' : 'professor.html',
                usuario: usuarioEncontrado
            });
        }

        if (tipoSolicitado === 'admin' || inputLower.includes('admin')) {
            return res.json({
                success: true,
                redirect: 'admin.html',
                usuario: { id: 'admin', nome: 'Administrador', email: 'admin@escola.com', tipo: 'admin' }
            });
        }

        return res.status(404).json({ success: false, error: 'Utilizador não encontrado no banco de dados.' });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// CADASTRO
// ----------------------------------------------------
app.get('/api/auth/cadastro', (req, res) => res.redirect('/'));

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const body = req.body || {};
        const nome = String(body.nome || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const senha = String(body.senha || '123456').trim();
        const tipoSolicitado = String(body.tipo || body.role || 'professor').trim().toLowerCase();

        if (!nome) {
            return res.status(400).json({ success: false, error: 'O nome é obrigatório.' });
        }

        const isAdmin = tipoSolicitado === 'admin' || nome.toLowerCase().includes('admin') || email.includes('admin');
        const tipoFinal = isAdmin ? 'admin' : 'professor';
        const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ nome, email: emailFinal, senha, tipo: tipoFinal }])
            .select();

        if (error) {
            console.error('Erro no Supabase:', error);
            return res.status(400).json({ success: false, error: `Falha ao gravar no Supabase: ${error.message}` });
        }

        return res.json({
            success: true,
            redirect: isAdmin ? 'admin.html' : 'professor.html',
            message: `${isAdmin ? 'Administrador' : 'Professor'} registado com sucesso!`,
            usuario: data[0]
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// DEMAIS ROTAS DA API
// ----------------------------------------------------
app.get('/api/professor/turmas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [vinculosRes, turmasRes, matsRes] = await Promise.all([
            supabase.from('professor_turmas').select('*'),
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
            : vinculos.filter(v => String(v.professor_id || v.usuario_id) === String(id));

        const resultado = filtrados.map(v => ({
            id: v.id,
            turma_id: v.turma_id,
            materia_id: v.materia_id,
            turmas: turmaMap[v.turma_id] || { nome: 'Turma' },
            materias: matMap[v.materia_id] || { nome: 'Matéria' }
        }));

        res.json(resultado);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/professor/fichas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [vinculosRes, usersRes, turmasRes, matsRes] = await Promise.all([
            supabase.from('professor_turmas').select('*'),
            supabase.from('usuarios').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*')
        ]);

        const vinculos = vinculosRes.data || [];
        const users = usersRes.data || [];
        const turmas = turmasRes.data || [];
        const mats = matsRes.data || [];

        const userMap = Object.fromEntries(users.map(u => [u.id, u]));
        const turmaMap = Object.fromEntries(turmas.map(t => [t.id, t]));
        const matMap = Object.fromEntries(mats.map(m => [m.id, m]));

        const filtrados = (id === 'admin' || id.includes('admin')) 
            ? vinculos 
            : vinculos.filter(v => String(v.professor_id || v.usuario_id) === String(id));

        const fichas = filtrados.map(v => ({
            id: v.id,
            professor_id: v.professor_id || v.usuario_id,
            turma_id: v.turma_id,
            materia_id: v.materia_id,
            professores: userMap[v.professor_id || v.usuario_id] || null,
            turmas: turmaMap[v.turma_id] || { nome: 'Turma Geral' },
            materias: matMap[v.materia_id] || { nome: 'Matéria Geral' }
        }));

        res.json(fichas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/professores', async (req, res) => {
    try {
        const { data, error } = await supabase.from('usuarios').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/professores', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const { data, error } = await supabase.from('usuarios').insert([{ nome, email, senha: senha || '123456', tipo: 'professor' }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/professores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

app.get('/api/vinculos', async (req, res) => {
    try {
        const [vInc, users, turmas, mats] = await Promise.all([
            supabase.from('professor_turmas').select('*'),
            supabase.from('usuarios').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*')
        ]);
        if (vInc.error) throw vInc.error;

        const userMap = Object.fromEntries((users.data || []).map(u => [u.id, u]));
        const turmaMap = Object.fromEntries((turmas.data || []).map(t => [t.id, t]));
        const matMap = Object.fromEntries((mats.data || []).map(m => [m.id, m]));

        const resultado = (vInc.data || []).map(v => ({
            ...v,
            professores: userMap[v.professor_id || v.usuario_id] || null,
            turmas: turmaMap[v.turma_id] || null,
            materias: matMap[v.materia_id] || null
        }));
        res.json(resultado);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vinculos', async (req, res) => {
    try {
        const { professor_id, turma_id, materia_id } = req.body;
        const { data, error } = await supabase.from('professor_turmas').insert([{ professor_id, turma_id, materia_id }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/respostas', async (req, res) => {
    try {
        const [respRes, userRes, turmaRes, matRes, pergRes] = await Promise.all([
            supabase.from('respostas_pre_conselho').select('*'),
            supabase.from('usuarios').select('*'),
            supabase.from('turmas').select('*'),
            supabase.from('materias').select('*'),
            supabase.from('perguntas').select('*')
        ]);
        if (respRes.error) throw respRes.error;

        const userMap = Object.fromEntries((userRes.data || []).map(u => [u.id, u]));
        const turmaMap = Object.fromEntries((turmaRes.data || []).map(t => [t.id, t]));
        const matMap = Object.fromEntries((matRes.data || []).map(m => [m.id, m]));
        const pergMap = Object.fromEntries((pergRes.data || []).map(p => [p.id, p]));

        const completas = (respRes.data || []).map(r => ({
            ...r,
            professores: userMap[r.professor_id || r.usuario_id] || null,
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
        const { data, error } = await supabase.from('respostas_pre_conselho').insert(respostasArray).select();
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a rodar na porta ${PORT}`));