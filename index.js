// Tenta carregar o dotenv apenas em ambiente local
try {
    require('dotenv').config();
} catch (e) {
    // No Render, as variáveis são lidas diretamente do painel Environment
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Permite servir os ficheiros estáticos do site (HTML, CSS, JS)
app.use(express.static(__dirname));

// Validação de segurança das variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERRO CRÍTICO: SUPABASE_URL ou SUPABASE_KEY não foram informadas nas variáveis de ambiente!');
}

const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co', 
    SUPABASE_KEY || 'placeholder'
);

// ----------------------------------------------------
// ROTA RAIZ (Abre diretamente o index.html)
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
// VÍNCULOS (PROFESSOR - TURMA - MATÉRIA)
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
// INICIALIZAÇÃO DO SERVIDOR
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
});