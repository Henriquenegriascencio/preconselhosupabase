const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());

// --- COLE AQUI AS SUAS CREDENCIAIS DO SUPABASE ---
const SUPABASE_URL = 'https://qizdxvgyuophdwfltclr.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_yuPsroBYbFDRLXbZ7unxyw_fqarLtvK';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.static(__dirname));

// A rota raiz agora serve a página de login (index.html)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ==========================================
// AUTENTICAÇÃO (CADASTRO E LOGIN)
// ==========================================

app.post('/api/auth/cadastro', async (req, res) => {
    const { nome, email, senha, tipo } = req.body;
    try {
        const { error } = await supabase
            .from('usuarios')
            .insert([{ nome, email, senha, tipo }]);

        if (error) throw error;

        res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (err) {
        console.error('Erro no cadastro:', err);
        res.status(500).json({ error: 'Erro ao cadastrar. O e-mail pode já estar em uso.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const { data: usuarios, error } = await supabase
            .from('usuarios')
            .select('id, nome, email, tipo')
            .eq('email', email)
            .eq('senha', senha);

        if (error) throw error;

        if (!usuarios || usuarios.length === 0) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }

        res.json({ usuario: usuarios[0] });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ==========================================
// ROTAS DO ADMINISTRADOR
// ==========================================

app.post('/api/admin/turmas', async (req, res) => {
    const { nome } = req.body;
    try {
        const { data, error } = await supabase
            .from('turmas')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Turma cadastrada com sucesso!', turma: data });
    } catch (err) {
        console.error('Erro ao cadastrar turma:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/turmas', async (req, res) => {
    try {
        const { data: turmas, error } = await supabase
            .from('turmas')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        res.json(turmas);
    } catch (err) {
        console.error('Erro ao buscar turmas:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/materias', async (req, res) => {
    const { nome } = req.body;
    try {
        const { data, error } = await supabase
            .from('materias')
            .insert([{ nome }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Matéria cadastrada com sucesso!', materia: data });
    } catch (err) {
        console.error('Erro ao cadastrar matéria:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/materias', async (req, res) => {
    try {
        const { data: materias, error } = await supabase
            .from('materias')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        res.json(materias);
    } catch (err) {
        console.error('Erro ao buscar matérias:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/fichas', async (req, res) => {
    const { titulo, turma_id, materia_id, data_limite, perguntas } = req.body;
    try {
        const { data: ficha, error: errFicha } = await supabase
            .from('fichas_avaliacao')
            .insert([{ titulo, turma_id, materia_id, data_limite }])
            .select()
            .single();

        if (errFicha) throw errFicha;

        const fichaId = ficha.id;

        if (perguntas && perguntas.length > 0) {
            const perguntasParaInserir = perguntas.map(p => ({
                ficha_id: fichaId,
                texto_pergunta: p.texto_pergunta,
                categoria: p.categoria || 'Geral'
            }));

            const { error: errPerguntas } = await supabase
                .from('perguntas')
                .insert(perguntasParaInserir);

            if (errPerguntas) throw errPerguntas;
        }

        res.status(201).json({ message: 'Ficha criada com sucesso!', fichaId });
    } catch (err) {
        console.error('Erro ao criar ficha:', err);
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
                perguntas!inner (
                    texto_pergunta,
                    categoria
                ),
                usuarios!inner (
                    nome
                ),
                fichas_avaliacao!inner (
                    titulo,
                    turmas!inner ( nome ),
                    materias!inner ( nome )
                )
            `)
            .eq('ficha_id', req.params.id);

        if (error) throw error;

        const resultadoFormatado = respostas.map(r => ({
            id: r.id,
            texto_pergunta: r.perguntas?.texto_pergunta,
            categoria: r.perguntas?.categoria,
            professor_nome: r.usuarios?.nome,
            turma_nome: r.fichas_avaliacao?.turmas?.nome,
            materia_nome: r.fichas_avaliacao?.materias?.nome,
            resposta: r.resposta,
            anotacoes: r.anotacoes
        }));

        res.json(resultadoFormatado);
    } catch (err) {
        console.error('Erro ao buscar respostas:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// NOVAS ROTAS DE VÍNCULO (ADMINISTRADOR)
// ==========================================

// Listar apenas usuários com perfil 'Professor'
app.get('/api/admin/professores', async (req, res) => {
    try {
        const { data: professores, error } = await supabase
            .from('usuarios')
            .select('id, nome, email')
            .eq('tipo', 'Professor')
            .order('nome', { ascending: true });

        if (error) throw error;
        res.json(professores);
    } catch (err) {
        console.error('Erro ao buscar professores:', err);
        res.status(500).json({ error: err.message });
    }
});

// Vincular Professor a uma Turma
app.post('/api/admin/vincular-professor', async (req, res) => {
    const { professor_id, turma_id } = req.body;
    try {
        const { data, error } = await supabase
            .from('professor_turmas')
            .insert([{ professor_id, turma_id }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ message: 'Professor vinculado com sucesso!', data });
    } catch (err) {
        console.error('Erro ao vincular professor:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROTA ATUALIZADA DO PROFESSOR (FILTRADA)
// ==========================================

// Buscar fichas APENAS das turmas vinculadas ao professor
app.get('/api/professor/fichas/:professor_id', async (req, res) => {
    const { professor_id } = req.params;
    try {
        // 1. Busca os IDs das turmas onde este professor leciona
        const { data: vinculos, error: errVinculos } = await supabase
            .from('professor_turmas')
            .select('turma_id')
            .eq('professor_id', professor_id);

        if (errVinculos) throw errVinculos;

        const turmasIds = vinculos.map(v => v.turma_id);

        // Se o professor não tiver nenhuma turma vinculada, retorna lista vazia
        if (turmasIds.length === 0) {
            return res.json([]);
        }

        // 2. Busca apenas as fichas das turmas encontradas
        const { data: fichas, error: errFichas } = await supabase
            .from('fichas_avaliacao')
            .select('*')
            .in('turma_id', turmasIds)
            .order('id', { ascending: false });

        if (errFichas) throw errFichas;

        res.json(fichas);
    } catch (err) {
        console.error('Erro ao buscar fichas do professor:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROTAS DO PROFESSOR
// ==========================================

app.get('/api/professor/fichas', async (req, res) => {
    try {
        const { data: fichas, error } = await supabase
            .from('fichas_avaliacao')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        res.json(fichas);
    } catch (err) {
        console.error('Erro ao buscar fichas:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fichas/:id/perguntas', async (req, res) => {
    try {
        const { data: perguntas, error } = await supabase
            .from('perguntas')
            .select('*')
            .eq('ficha_id', req.params.id);

        if (error) throw error;

        res.json(perguntas);
    } catch (err) {
        console.error('Erro ao buscar perguntas:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/professor/respostas', async (req, res) => {
    const { ficha_id, professor_id, respostas } = req.body;
    try {
        const registrosParaInserir = respostas.map(r => ({
            ficha_id,
            pergunta_id: r.pergunta_id,
            professor_id,
            resposta: r.resposta,
            anotacoes: r.anotacoes || ''
        }));

        const { error } = await supabase
            .from('respostas_pre_conselho')
            .insert(registrosParaInserir);

        if (error) throw error;

        res.status(201).json({ message: 'Respostas enviadas com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar respostas:', err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});