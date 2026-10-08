const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Permite requisições vindas do GitHub Pages ou de qualquer outro domínio
app.use(cors());
app.use(express.json());

// --- COLE AQUI AS SUAS CREDENCIAIS DO SUPABASE ---
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co'; 
const SUPABASE_KEY = 'SUA-CHAVE-ANON-PUBLIC-AQUI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Servir arquivos estáticos (caso rode localmente)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
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
                    turma_id
                )
            `)
            .eq('ficha_id', req.params.id);

        if (error) throw error;

        const resultadoFormatado = respostas.map(r => ({
            id: r.id,
            texto_pergunta: r.perguntas?.texto_pergunta,
            categoria: r.perguntas?.categoria,
            professor_nome: r.usuarios?.nome,
            turma_id: r.fichas_avaliacao?.turma_id,
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

// Conexão com porta dinâmica
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});