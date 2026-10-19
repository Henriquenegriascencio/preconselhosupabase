const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Sanitização das variáveis de ambiente do Supabase
const rawUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_URL = rawUrl.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'placeholder').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Wrapper para capturar erros assíncronos
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Mapeamento relacional de apoio
async function buscarMapasRelacionais() {
    const [usersRes, turmasRes, matsRes, pergRes] = await Promise.all([
        supabase.from('usuarios').select('*'),
        supabase.from('turmas').select('*'),
        supabase.from('materias').select('*'),
        supabase.from('perguntas').select('*')
    ]);

    return {
        usersMap: Object.fromEntries((usersRes.data || []).map(u => [u.id, u])),
        turmasMap: Object.fromEntries((turmasRes.data || []).map(t => [t.id, t])),
        matsMap: Object.fromEntries((matsRes.data || []).map(m => [m.id, m])),
        pergMap: Object.fromEntries((pergRes.data || []).map(p => [p.id, p]))
    };
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ----------------------------------------------------
// AUTENTICAÇÃO E CADASTRO
// ----------------------------------------------------
app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const loginInput = String(body.email || body.usuario || body.nome || body.login || '').trim().toLowerCase();

    if (!loginInput) {
        return res.status(400).json({ success: false, error: 'Informe o e-mail ou nome de utilizador.' });
    }

    const { data: usuarios, error } = await supabase.from('usuarios').select('*');
    if (error) return res.status(500).json({ success: false, error: `Erro no Supabase: ${error.message}` });

    const usuarioEncontrado = (usuarios || []).find(u => 
        (u.email && String(u.email).toLowerCase().trim() === loginInput) ||
        (u.nome && String(u.nome).toLowerCase().trim() === loginInput)
    );

    if (usuarioEncontrado) {
        const eAdmin = usuarioEncontrado.tipo === 'admin' || usuarioEncontrado.role === 'admin';
        return res.json({
            success: true,
            redirect: eAdmin ? 'admin.html' : 'professor.html',
            usuario: usuarioEncontrado
        });
    }

    return res.status(404).json({ success: false, error: 'Utilizador não encontrado no banco de dados.' });
}));

app.post('/api/auth/cadastro', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const senha = String(body.senha || '123456').trim();
    const tipoSolicitado = String(body.tipo || body.role || 'professor').trim().toLowerCase();

    if (!nome) return res.status(400).json({ success: false, error: 'O nome é obrigatório.' });

    const isAdmin = tipoSolicitado === 'admin' || nome.toLowerCase().includes('admin') || email.includes('admin');
    const tipoFinal = isAdmin ? 'admin' : 'professor';
    const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

    const { data, error } = await supabase
        .from('usuarios')
        .insert([{ nome, email: emailFinal, senha, tipo: tipoFinal }])
        .select();

    if (error) return res.status(400).json({ success: false, error: `Falha ao gravar no Supabase: ${error.message}` });

    return res.json({
        success: true,
        redirect: isAdmin ? 'admin.html' : 'professor.html',
        message: `${isAdmin ? 'Administrador' : 'Professor'} cadastrado com sucesso!`,
        usuario: data[0]
    });
}));

// ----------------------------------------------------
// PERGUNTAS / FICHAS (SUPORTE A TEXTO_PERGUNTA, TEXTO E PERGUNTA)
// ----------------------------------------------------
app.get('/api/perguntas', asyncHandler(async (req, res) => {
    const { data, error } = await supabase.from('perguntas').select('*').order('id');
    if (error) throw error;
    res.json(data || []);
}));

app.post('/api/perguntas', asyncHandler(async (req, res) => {
    const { texto, pergunta, texto_pergunta, categoria, turma_id, materia_id } = req.body;
    const textoFinal = texto_pergunta || texto || pergunta;
    if (!textoFinal) return res.status(400).json({ error: 'O texto do critério é obrigatório.' });

    const basePayload = { categoria: categoria || 'Geral' };
    if (turma_id) basePayload.turma_id = turma_id;
    if (materia_id) basePayload.materia_id = materia_id;

    // Tentativa 1: texto_pergunta (coluna NOT NULL principal)
    let payload = { ...basePayload, texto_pergunta: textoFinal };
    let { data, error } = await supabase.from('perguntas').insert([payload]).select();

    // Tentativa 2: texto
    if (error && (error.message.includes('texto_pergunta') || error.code === 'PGRST204')) {
        payload = { ...basePayload, texto: textoFinal };
        const retry1 = await supabase.from('perguntas').insert([payload]).select();
        data = retry1.data;
        error = retry1.error;
    }

    // Tentativa 3: pergunta
    if (error && (error.message.includes('texto') || error.code === 'PGRST204')) {
        payload = { ...basePayload, pergunta: textoFinal };
        const retry2 = await supabase.from('perguntas').insert([payload]).select();
        data = retry2.data;
        error = retry2.error;
    }

    if (error) throw error;
    res.json(data ? data[0] : { success: true });
}));

app.delete('/api/perguntas/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('perguntas').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

// ----------------------------------------------------
// VÍNCULOS
// ----------------------------------------------------
app.get('/api/vinculos', asyncHandler(async (req, res) => {
    const { data: vinculos, error } = await supabase.from('professor_turmas').select('*');
    if (error) throw error;

    const { usersMap, turmasMap, matsMap } = await buscarMapasRelacionais();

    const resultado = (vinculos || []).map(v => ({
        ...v,
        professores: usersMap[v.professor_id || v.usuario_id] || null,
        turmas: turmasMap[v.turma_id] || null,
        materias: matsMap[v.materia_id] || null
    }));
    res.json(resultado);
}));

app.post('/api/vinculos', asyncHandler(async (req, res) => {
    const { professor_id, turma_id, materia_id } = req.body;
    if (!professor_id || !turma_id) {
        return res.status(400).json({ error: 'Selecione o Professor e a Turma.' });
    }

    const payload = { professor_id, turma_id };
    if (materia_id) payload.materia_id = materia_id;

    let { data, error } = await supabase.from('professor_turmas').insert([payload]).select();

    if (error && error.message.includes('professor_id')) {
        delete payload.professor_id;
        payload.usuario_id = professor_id;
        const fallback = await supabase.from('professor_turmas').insert([payload]).select();
        data = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;
    res.json(data ? data[0] : { success: true });
}));

app.delete('/api/vinculos/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('professor_turmas').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

// ----------------------------------------------------
// TURMAS, MATÉRIAS, PROFESSORES E RESPOSTAS
// ----------------------------------------------------
app.get('/api/turmas', asyncHandler(async (req, res) => {
    const { data, error } = await supabase.from('turmas').select('*').order('id');
    if (error) throw error;
    res.json(data || []);
}));

app.post('/api/turmas', asyncHandler(async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome da turma é obrigatório.' });
    const { data, error } = await supabase.from('turmas').insert([{ nome }]).select();
    if (error) throw error;
    res.json(data[0]);
}));

app.delete('/api/turmas/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('turmas').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

app.get('/api/materias', asyncHandler(async (req, res) => {
    const { data, error } = await supabase.from('materias').select('*').order('id');
    if (error) throw error;
    res.json(data || []);
}));

app.post('/api/materias', asyncHandler(async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome da matéria é obrigatório.' });
    const { data, error } = await supabase.from('materias').insert([{ nome }]).select();
    if (error) throw error;
    res.json(data[0]);
}));

app.delete('/api/materias/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('materias').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

app.get('/api/professores', asyncHandler(async (req, res) => {
    const { data, error } = await supabase.from('usuarios').select('*').order('id');
    if (error) throw error;
    res.json(data || []);
}));

app.post('/api/professores', asyncHandler(async (req, res) => {
    const { nome, email, senha } = req.body;
    const { data, error } = await supabase.from('usuarios').insert([{ nome, email, senha: senha || '123456', tipo: 'professor' }]).select();
    if (error) throw error;
    res.json(data[0]);
}));

app.delete('/api/professores/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}));

app.get('/api/respostas', asyncHandler(async (req, res) => {
    const { data: respostas, error } = await supabase.from('respostas_pre_conselho').select('*');
    if (error) throw error;

    const { usersMap, turmasMap, matsMap, pergMap } = await buscarMapasRelacionais();

    const completas = (respostas || []).map(r => ({
        ...r,
        professores: usersMap[r.professor_id || r.usuario_id] || null,
        turmas: turmasMap[r.turma_id] || null,
        materias: matsMap[r.materia_id] || null,
        perguntas: pergMap[r.pergunta_id] || null
    }));
    res.json(completas);
}));

// Fallback de erro em JSON para a API
app.use('/api', (req, res) => {
    res.status(404).json({ error: `Rota da API não encontrada: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
    console.error('Erro global na API:', err);
    res.status(500).json({ error: err.message || 'Erro interno no servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a rodar na porta ${PORT}`));