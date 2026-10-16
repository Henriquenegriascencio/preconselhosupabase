const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. TURMAS E MATÉRIAS
app.get('/api/admin/turmas', async (req, res) => {
    const { data, error } = await supabase.from('turmas').select('*').order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/admin/turmas', async (req, res) => {
    const { nome } = req.body;
    const { data, error } = await supabase.from('turmas').insert([{ nome }]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.get('/api/admin/materias', async (req, res) => {
    const { data, error } = await supabase.from('materias').select('*').order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/admin/materias', async (req, res) => {
    const { nome } = req.body;
    const { data, error } = await supabase.from('materias').insert([{ nome }]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.get('/api/admin/professores', async (req, res) => {
    const { data, error } = await supabase.from('usuarios').select('id, nome, email').eq('tipo', 'Professor');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 2. VÍNCULOS DE PROFESSORES COM MATÉRIAS E TURMAS
app.post('/api/admin/vincular-professor', async (req, res) => {
    const { professor_id, turma_id, materia_id } = req.body;
    const { data, error } = await supabase
        .from('professor_turmas')
        .insert([{ professor_id, turma_id, materia_id }])
        .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.get('/api/professor/turmas/:professorId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('professor_turmas')
            .select(`
                turma_id,
                turmas ( id, nome ),
                materias ( id, nome )
            `)
            .eq('professor_id', req.params.professorId);

        if (error) throw error;

        const resultado = data.map(item => ({
            turma_id: item.turmas?.id || item.turma_id,
            turma_nome: item.turmas?.nome || 'Turma não informada',
            materia_nome: item.materias?.nome || 'Matéria Geral'
        }));

        res.json(resultado);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. FICHAS E PERGUNTAS
app.post('/api/admin/fichas', async (req, res) => {
    const { titulo, turma_id, materia_id, data_limite, perguntas } = req.body;
    try {
        const { data: ficha, error: errFicha } = await supabase
            .from('fichas_avaliacao')
            .insert([{ titulo, turma_id, materia_id, data_limite }])
            .select()
            .single();

        if (errFicha) throw errFicha;

        if (perguntas && perguntas.length > 0) {
            const listaPerguntas = perguntas.map(p => ({
                ficha_id: ficha.id,
                texto_pergunta: p.texto_pergunta,
                categoria: p.categoria || 'Geral'
            }));
            const { error: errPerg } = await supabase.from('perguntas').insert(listaPerguntas);
            if (errPerg) throw errPerg;
        }

        res.json({ message: 'Ficha criada com sucesso', ficha });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lista todas as fichas ativas (para o admin)
app.get('/api/admin/fichas', async (req, res) => {
    const { data, error } = await supabase
        .from('fichas_avaliacao')
        .select(`
            id,
            titulo,
            turma_id,
            turmas ( nome ),
            materias ( nome )
        `);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Lista fichas atribuídas apenas às turmas do professor
app.get('/api/professor/fichas/:professorId', async (req, res) => {
    try {
        // Busca turmas vinculadas ao professor
        const { data: vinculos, error: errVinculo } = await supabase
            .from('professor_turmas')
            .select('turma_id')
            .eq('professor_id', req.params.professorId);

        if (errVinculo) throw errVinculo;

        if (!vinculos || vinculos.length === 0) {
            return res.json([]);
        }

        const turmasIds = vinculos.map(v => v.turma_id);

        const { data: fichas, error: errFichas } = await supabase
            .from('fichas_avaliacao')
            .select(`
                id,
                titulo,
                turma_id,
                turmas ( nome ),
                materias ( nome )
            `)
            .in('turma_id', turmasIds);

        if (errFichas) throw errFichas;

        res.json(fichas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fichas/:fichaId/perguntas', async (req, res) => {
    const { data, error } = await supabase
        .from('perguntas')
        .select('*')
        .eq('ficha_id', req.params.fichaId);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 4. RESPOSTAS E RELATÓRIO DE DESEMPENHO
app.post('/api/professor/respostas', async (req, res) => {
    const { ficha_id, professor_id, respostas } = req.body;
    try {
        const registros = respostas.map(r => ({
            ficha_id,
            professor_id,
            pergunta_id: r.pergunta_id,
            resposta: r.resposta,
            anotacoes: r.anotacoes || ''
        }));

        const { data, error } = await supabase.from('respostas_pre_conselho').insert(registros);
        if (error) throw error;
        res.json({ message: 'Respostas salvas com sucesso' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/fichas/:id/respostas', async (req, res) => {
    try {
        const { data: respostas, error } = await supabase
            .from('respostas_pre_conselho')
            .select(`
                id,
                resposta,
                anotacoes,
                perguntas ( texto_pergunta, categoria ),
                usuarios ( nome )
            `)
            .eq('ficha_id', req.params.id);

        if (error) throw error;

        const resultadoFormatado = respostas.map(r => ({
            id: r.id,
            texto_pergunta: r.perguntas?.texto_pergunta || 'Pergunta',
            categoria: r.perguntas?.categoria || 'Geral',
            professor_nome: r.usuarios?.nome || 'Professor',
            resposta: r.resposta,
            anotacoes: r.anotacoes
        }));

        res.json(resultadoFormatado);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));