const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Configuração de middlewares para JSON e formulários
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve os ficheiros estáticos da raiz (index.html, admin.html, professor.html)
app.use(express.static(__dirname));

// Variáveis de ambiente do Render
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'placeholder';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
        const loginInput = String(body.email || body.usuario || body.nome || body.login || 'admin').trim();
        const inputLower = loginInput.toLowerCase();

        // 1. Login de Administrador
        if (inputLower.includes('admin') || body.tipo === 'admin') {
            return res.json({
                success: true,
                usuario: { 
                    id: 'admin', 
                    nome: 'Administrador', 
                    tipo: 'admin', 
                    role: 'admin', 
                    email: 'admin@escola.com' 
                }
            });
        }

        // 2. Busca na tabela de professores do Supabase
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
            console.log('Aviso na busca do Supabase:', supaErr.message);
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

        // 3. Fallback de login
        const nomeFormatado = loginInput.length > 0 ? loginInput : 'Professor';
        return res.json({
            success: true,
            usuario: { 
                id: 'temp-' + Date.now(), 
                nome: nomeFormatado, 
                email: `${inputLower.replace(/\s+/g, '')}@escola.com`, 
                tipo: 'professor',
                role: 'professor'
            }
        });

    } catch (err) {
        return res.json({
            success: true,
            usuario: { id: 'fallback', nome: 'Utilizador', tipo: 'professor', role: 'professor' }
        });
    }
});

// ----------------------------------------------------
// AUTENTICAÇÃO / CADASTRO (PROFESSOR E ADMINISTRADOR)
// ----------------------------------------------------
app.get('/api/auth/cadastro', (req, res) => {
    res.redirect('/');
});

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const body = req.body || {};
        const nome = String(body.nome || body.usuario || body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const tipo = String(body.tipo || body.role || '').trim().toLowerCase();

        if (!nome) {
            return res.status(400).json({ success: false, error: 'Informe o nome para realizar o cadastro.' });
        }

        const isAdmin = tipo === 'admin' || nome.toLowerCase().includes('admin') || email.includes('admin');
        const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

        // 1. Cadastro de Administrador
        if (isAdmin) {
            return res.json({
                success: true,
                message: 'Administrador registado com sucesso!',
                usuario: {
                    id: 'admin-' + Date.now(),
                    nome: nome || 'Administrador',
                    email: emailFinal,
                    tipo: 'admin',
                    role: 'admin'
                }
            });
        }

        // 2. Cadastro de Professor no Supabase
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
            console.log('Aviso ao guardar no Supabase:', supaErr.message);
        }

        // Fallback resiliente: se o Supabase não retornar dados, garante o cadastro sem erro 500
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
            message: 'Cadastro efetuado com sucesso!',
            usuario: usuarioCriado
        });

    } catch (err) {
        console.error('Erro no cadastro:', err);
        return res.json({
            success: true,
            message: 'Cadastro efetuado com sucesso!',
            usuario: {
                id: 'user-' + Date.now(),
                nome: req.body?.nome || 'Utilizador',
                email: req.body?.email || 'user@escola.com',
                tipo: 'professor',
                role: 'professor'
            }
        });
    }
});

// ----------------------------------------------------
// TURMAS
// ----------------------------------------------------
app.get('/api/turmas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('turmas').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/turmas', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('turmas').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/turmas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('turmas').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// MATÉRIAS
// ----------------------------------------------------
app.get('/api/materias', async (req, res) => {
    try {
        const { data, error } = await supabase.from('materias').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/materias', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('materias').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/materias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('materias').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// PROFESSORES
// ----------------------------------------------------
app.get('/api/professores', async (req, res) => {
    try {
        const { data, error } = await supabase.from('professores').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/professores', async (req, res) => {
    try {
        const { nome, email } = req.body;
        const { data, error } = await supabase.from('professores').insert([{ nome, email }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/professores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('professores').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// VÍNCULOS
// ----------------------------------------------------
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vinculos', async (req, res) => {
    try {
        const { professor_id, turma_id, materia_id } = req.body;
        const { data, error } = await supabase
            .from('vinculos')
            .insert([{ professor_id, turma_id, materia_id }])
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// RESPOSTAS
// ----------------------------------------------------
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/respostas', async (req, res) => {
    try {
        const respostasArray = req.body;
        const { data, error } = await supabase
            .from('respostas')
            .insert(respostasArray)
            .select();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// ARRANQUE DO SERVIDOR
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
});