const express = require('express');
const cors = require('cors'); // <-- Adicione esta linha
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors()); // <-- Apenas isso libera o acesso do GitHub Pages!
app.use(express.json());

// Pode colocar a URL e a KEY direto aqui para não complicar
const supabase = createClient(
    'https://qizdxvgyuophdwfltclr.supabase.co/rest/v1/', 
    'sb_publishable_yuPsroBYbFDRLXbZ7unxyw_fqarLtvK'
);

// Conexão com o Supabase usando variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// --- AUTENTICAÇÃO ---

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

// --- ROTAS DO ADMINISTRADOR ---

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
        // Consulta unindo as tabelas relacionadas
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

        // Formatação dos dados para o front-end
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

// --- ROTAS DO PROFESSOR ---

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

// Porta dinâmica (essencial para servidores online como Render/Railway)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
