const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middlewares para aceitar requisições de qualquer origem e tratar JSON / Formulários
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve os ficheiros estáticos da pasta (HTML, CSS, JS)
app.use(express.static(__dirname));

// Leitura direta das variáveis de ambiente configuradas no Render
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'placeholder';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn('AVISO: Variáveis SUPABASE_URL ou SUPABASE_KEY não foram encontradas no ambiente.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------------------------------------
// ROTA RAIZ (Abre o index.html)
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------------------
// AUTENTICAÇÃO / LOGIN & CADASTRO
// ----------------------------------------------------
app.get('/api/auth/login', (req, res) => {
    res.redirect('/');
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const body = req.body || {};
        const loginInput = String(body.email || body.usuario || body.nome || '').trim().toLowerCase();

        if (!loginInput) {
            return res.status(400).json({ error: 'Informe o e-mail ou nome de utilizador.' });
        }

        // 1. Acesso direto para Administrador
        if (loginInput.includes('admin')) {
            return res.json({
                success: true,
                usuario: { id: 'admin', nome: 'Administrador', tipo: 'admin', email: loginInput }
            });
        }

        // 2. Consulta à tabela 'professores' no Supabase
        const { data: professores, error } = await supabase.from('professores').select('*');
        
        if (error) {
            console.error('Erro Supabase (professores):', error.message);
        }

        const profs = professores || [];
        
        // Procura por e-mail ou nome
        const prof = profs.find(p => 
            (p.email && String(p.email).trim().toLowerCase() === loginInput) ||
            (p.nome && String(p.nome).trim().toLowerCase() === loginInput)
        );

        if (!prof) {
            return res.status(401).json({ 
                error: 'Utilizador não encontrado. Registe o professor no painel ou faça o cadastro.' 
            });
        }

        return res.json({
            success: true,
            usuario: { id: prof.id, nome: prof.nome, email: prof.email || prof.nome, tipo: 'professor' }
        });

    } catch (err) {
        console.error('Erro no login:', err);
        return res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
    }
});

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const body = req.body || {};
        const nome = String(body.nome || body.usuario || '').trim();
        const email = String(body.email || '').trim().toLowerCase();

        if (!nome) {
            return res.status(400).json({ error: 'O nome é obrigatório para realizar o cadastro.' });
        }

        const emailFinal = email || `${nome.toLowerCase().replace(/\s+/g, '')}@escola.com`;

        const { data, error } = await supabase
            .from('professores')
            .insert([{ nome, email: emailFinal }])
            .select();

        if (error) throw error;

        return res.json({
            success: true,
            message: 'Cadastro efetuado com sucesso!',
            usuario: { id: data[0].id, nome: data[0].nome, email: data[0].email, tipo: 'professor' }
        });
    } catch (err) {
        console.error('Erro no cadastro:', err);
        return res.status(500).json({ error: 'Erro ao cadastrar: ' + err.message });
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
// VÍNCULOS (Interseção em memória para evitar erros PGRST)
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
    console.log(`Servidor ativo e pronto na porta ${PORT}`);
});