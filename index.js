const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'placeholder';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/api/auth/login', async (req, res) => {
    try {
        const body = req.body || {};
        const loginInput = String(body.email || body.usuario || body.nome || body.login || '').trim();
        const inputLower = loginInput.toLowerCase();
        const tipoSolicitado = String(body.tipo || body.role || '').toLowerCase();

        if (!loginInput) {
            return res.status(400).json({ success: false, error: 'Informe o e-mail ou nome de usuário.' });
        }

        // 1. Busca na tabela 'usuarios'
        let usuarioEncontrado = null;
        try {
            const { data: usuarios, error } = await supabase.from('usuarios').select('*');
            if (!error && usuarios && usuarios.length > 0) {
                usuarioEncontrado = usuarios.find(u => 
                    (u.email && String(u.email).toLowerCase().trim() === inputLower) ||
                    (u.nome && String(u.nome).toLowerCase().trim() === inputLower)
                );
            }
        } catch (supaErr) {
            console.log('Aviso no Supabase (usuarios):', supaErr.message);
        }

        if (usuarioEncontrado) {
            const perfilFinal = usuarioEncontrado.tipo || usuarioEncontrado.role || (tipoSolicitado === 'admin' ? 'admin' : 'professor');
            return res.json({
                success: true,
                usuario: { 
                    id: usuarioEncontrado.id, 
                    nome: usuarioEncontrado.nome, 
                    email: usuarioEncontrado.email || `${usuarioEncontrado.nome}@escola.com`, 
                    tipo: perfilFinal,
                    role: perfilFinal
                }
            });
        }

        // 2. Administrador padrão
        if (tipoSolicitado === 'admin' || inputLower.includes('admin')) {
            return res.json({
                success: true,
                usuario: { 
                    id: 'admin', 
                    nome: loginInput.includes('admin') ? loginInput : 'Administrador', 
                    email: inputLower.includes('@') ? inputLower : 'admin@escola.com',
                    tipo: 'admin', 
                    role: 'admin' 
                }
            });
        }

        // 3. Fallback de login para Professor novo
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
        return res.status(500).json({ success: false, error: 'Erro ao processar login: ' + err.message });
    }
});

// ----------------------------------------------------
// AUTENTICAÇÃO: CADASTRO (ENVIA CAMPO SENHA)
// ----------------------------------------------------
app.get('/api/auth/cadastro', (req, res) => res.redirect('/'));

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const body = req.body || {};
        const nome = String(body.nome || body.usuario || body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const senha = String(body.senha || body.password || '123456').trim();
        const tipoSolicitado = String(body.tipo || body.role || '').trim().toLowerCase();

        if (!nome) {
            return res.status(400).json({ success: false, error: 'Informe o nome para realizar o cadastro.' });
        }

        const isAdmin = tipoSolicitado === 'admin' || nome.toLowerCase().includes('admin') || email.includes('admin');
        const tipoFinal = isAdmin ? 'admin' : 'professor';
        const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

        let usuarioCriado = null;
        try {
            const { data, error } = await supabase
                .from('usuarios')
                .insert([{ nome, email: emailFinal, senha, tipo: tipoFinal }])
                .select();

            if (!error && data && data.length > 0) {
                usuarioCriado = {
                    id: data[0].id,
                    nome: data[0].nome,
                    email: data[0].email,
                    tipo: data[0].tipo || tipoFinal,
                    role: data[0].tipo || tipoFinal
                };
            }
        } catch (supaErr) {
            console.log('Aviso ao salvar no Supabase:', supaErr.message);
        }

        if (!usuarioCriado) {
            usuarioCriado = {
                id: (isAdmin ? 'admin-' : 'prof-') + Date.now(),
                nome: nome,
                email: emailFinal,
                tipo: tipoFinal,
                role: tipoFinal
            };
        }

        return res.json({
            success: true,
            message: `${isAdmin ? 'Administrador' : 'Professor'} cadastrado com sucesso!`,
            usuario: usuarioCriado
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: 'Erro no cadastro: ' + err.message });
    }
});

// ----------------------------------------------------
// ROTAS DE TURMAS E FICHAS
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// PROFESSORES
// ----------------------------------------------------
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
        const senhaFinal = senha || '123456';
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ nome, email, senha: senhaFinal, tipo: 'professor' }])
            .select();
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

// ----------------------------------------------------
// TURMAS E MATÉRIAS
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

// ----------------------------------------------------
// VÍNCULOS
// ----------------------------------------------------
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

// ----------------------------------------------------
// RESPOSTAS
// ----------------------------------------------------
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

// ----------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));