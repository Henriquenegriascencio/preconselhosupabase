const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Rota de teste para confirmar que a API está a funcionar
app.get('/', (req, res) => {
    res.json({ status: 'API do Pré-Conselho está ativa e operacional!' });
});

// 1. GESTÃO DE TURMAS
app.get('/api/admin/turmas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('turmas').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/turmas', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('turmas').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GESTÃO DE MATÉRIAS
app.get('/api/admin/materias', async (req, res) => {
    try {
        const { data, error } = await supabase.from('materias').select('*').order('nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/materias', async (req, res) => {
    try {
        const { nome } = req.body;
        const { data, error } = await supabase.from('materias').insert([{ nome }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. USUÁRIOS E VÍNCULOS
app.get('/api/admin/professores', async (req, res) => {
    try {
        const { data, error } = await supabase.from('usuarios').select('id, nome, email').eq('tipo', 'Professor');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/vincular-professor', async (req, res) => {
    try {
        const { professor_id, turma_id, materia_id } = req.body;
        const { data, error } = await supabase
            .from('professor_turmas')
            .insert([{ professor_id, turma_id, materia_id }])
            .select();
        if (error) throw error;
        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lista as turmas e matérias do professor sem dependência de Foreign Keys
app.get('/api/professor/turmas/:professorId', async (req, res) => {
    try {
        const { data: vinculos, error: errVinculo } = await supabase
            .from('professor_turmas')
            .select('*')
            .eq('professor_id', req.params.professorId);

        if (errVinculo) throw errVinculo;
        if (!vinculos || vinculos.length === 0) return res.json([]);

        const { data: turmas } = await supabase.from('turmas').select('id, nome');
        const { data: materias } = await supabase.from('materias').select('id, nome');

        const resultado = vinculos.map(item => {
            const turma = turmas?.find(t => t.id === item.turma_id);
            const materia = materias?.find(m => m.id === item.materia_id);

            return {
                turma_id: item.turma_id,
                turma_nome: turma ? turma.nome : `Turma ID ${item.turma_id}`,
                materia_nome: materia ? materia.nome : 'Não especificada'
            };
        });

        res.json(resultado);
    } catch (err) {
        console.error('Erro em /api/professor/turmas:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. GESTÃO DE FICHAS E PERGUNTAS
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

// Lista todas as fichas (Administrador)
app.get('/api/admin/fichas', async (req, res) => {
    try {
        const { data: fichas, error: errFichas } = await supabase
            .from('fichas_avaliacao')
            .select('*');

        if (errFichas) throw errFichas;
        if (!fichas || fichas.length === 0) return res.json([]);

        const { data: turmas } = await supabase.from('turmas').select('id, nome');
        const { data: materias } = await supabase.from('materias').select('id, nome');

        const resultado = fichas.map(f => {
            const turma = turmas?.find(t => t.id === f.turma_id);
            const materia = materias?.find(m => m.id === f.materia_id);
            return {
                id: f.id,
                titulo: f.titulo,
                turma_id: f.turma_id,
                turmas: { nome: turma ? turma.nome : `Turma ID ${f.turma_id}` },
                materias: { nome: materia ? materia.nome : `Matéria ID ${f.materia_id}` }
            };
        });

        res.json(resultado);
    } catch (err) {
        console.error('Erro em /api/admin/fichas:', err);
        res.status(500).json({ error: err.message });
    }
});

// Lista fichas por professor
app.get('/api/professor/fichas/:professorId', async (req, res) => {
    try {
        const { data: vinculos, error: errVinculo } = await supabase
            .from('professor_turmas')
            .select('turma_id')
            .eq('professor_id', req.params.professorId);

        if (errVinculo) throw errVinculo;
        if (!vinculos || vinculos.length === 0) return res.json([]);

        const turmasIds = vinculos.map(v => v.turma_id);

        const { data: fichas, error: errFichas } = await supabase
            .from('fichas_avaliacao')
            .select('*')
            .in('turma_id', turmasIds);

        if (errFichas) throw errFichas;
        if (!fichas || fichas.length === 0) return res.json([]);

        const { data: turmas } = await supabase.from('turmas').select('id, nome');
        const { data: materias } = await supabase.from('materias').select('id, nome');

        const resultado = fichas.map(f => {
            const turma = turmas?.find(t => t.id === f.turma_id);
            const materia = materias?.find(m => m.id === f.materia_id);
            return {
                id: f.id,
                titulo: f.titulo,
                turma_id: f.turma_id,
                turmas: { nome: turma ? turma.nome : `Turma ID ${f.turma_id}` },
                materias: { nome: materia ? materia.nome : `Matéria ID ${f.materia_id}` }
            };
        });

        res.json(resultado);
    } catch (err) {
        console.error('Erro em /api/professor/fichas:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fichas/:fichaId/perguntas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('perguntas')
            .select('*')
            .eq('ficha_id', req.params.fichaId);
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. RESPOSTAS E RELATÓRIOS
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

        const { error } = await supabase.from('respostas_pre_conselho').insert(registros);
        if (error) throw error;
        res.json({ message: 'Respostas salvas com sucesso' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Relatório de Desempenho
app.get('/api/admin/fichas/:id/respostas', async (req, res) => {
    try {
        const fichaId = parseInt(req.params.id, 10);
        if (isNaN(fichaId)) {
            return res.status(400).json({ error: 'ID da ficha inválido' });
        }

        const { data: respostas, error: errResp } = await supabase
            .from('respostas_pre_conselho')
            .select('*')
            .eq('ficha_id', fichaId);

        if (errResp) throw errResp;
        if (!respostas || respostas.length === 0) return res.json([]);

        const perguntaIds = [...new Set(respostas.map(r => r.pergunta_id))].filter(id => id != null);
        let perguntas = [];
        if (perguntaIds.length > 0) {
            const { data: dataPerg } = await supabase
                .from('perguntas')
                .select('id, texto_pergunta, categoria')
                .in('id', perguntaIds);
            if (dataPerg) perguntas = dataPerg;
        }

        const profIds = [...new Set(respostas.map(r => r.professor_id))].filter(id => id != null);
        let professores = [];
        if (profIds.length > 0) {
            const { data: dataProf } = await supabase
                .from('usuarios')
                .select('id, nome')
                .in('id', profIds);
            if (dataProf) professores = dataProf;
        }

        const resultadoFormatado = respostas.map(r => {
            const pergunta = perguntas.find(p => p.id === r.pergunta_id);
            const prof = professores.find(p => p.id === r.professor_id);

            return {
                id: r.id,
                texto_pergunta: pergunta ? pergunta.texto_pergunta : 'Pergunta não encontrada',
                categoria: pergunta ? pergunta.categoria : 'Geral',
                professor_nome: prof ? prof.nome : 'Professor Desconhecido',
                resposta: r.resposta || '',
                anotacoes: r.anotacoes || ''
            };
        });

        return res.json(resultadoFormatado);
    } catch (err) {
        console.error('Erro em /api/admin/fichas/respostas:', err);
        return res.status(500).json({ error: err.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));