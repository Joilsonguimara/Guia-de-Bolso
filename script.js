/* =====================================================================
   ROTEIRO DE BOLSO — script.js (VERSÃO COMENTADA)
   ---------------------------------------------------------------------
   O QUE ESTE ARQUIVO FAZ (visão geral):
   1. Busca filmes (TMDB) e livros (Open Library / Google Books)
   2. Mostra os resultados como cards
   3. Deixa salvar/editar/excluir itens numa lista pessoal (CRUD no localStorage)
   4. Cria "salas de cinema / clubes de leitura" com chat em tempo real (Firebase)

   MAPA DAS APIs (use Ctrl+F e procure pelo marcador):
   [API 1] TMDB  -> lista de gêneros de filmes
   [API 2] TMDB  -> busca de filmes
   [API 3] Datamuse -> sugestão ortográfica ("Você quis dizer...")
   [API 4] TMDB  -> vídeos/trailer (+ link do YouTube)
   [API 5] Links de loja (Estante Virtual, Amazon, Mercado Livre) -> não é API, só URL de busca
   [API 6] Open Library -> busca de livros (principal)
   [API 7] Google Books -> busca de livros (reserva)
   [API 8] Open Library -> sinopse completa de um livro
   [API 9] Firebase Realtime Database -> salas e chat em tempo real

   ORDEM GERAL DO ARQUIVO:
   Variáveis/DOM -> TMDB -> Inicialização -> Datamuse -> Trailer -> Links de livros
   -> Livros -> Busca -> Render da busca -> CRUD -> Firebase -> Abas
   ===================================================================== */


// ================= VARIÁVEIS GLOBAIS E DOM =================

// savedItems = a lista salva do usuário (array de objetos).
// Lê do localStorage; se não achar a chave nova, tenta a chave do nome antigo do projeto
// (javivover_lista); se não achar nenhuma, começa com array vazio [].
// JSON.parse transforma o texto salvo de volta em array.
let savedItems = JSON.parse(localStorage.getItem('roteirodebolso_lista') || localStorage.getItem('javivover_lista')) || [];

// currentApiItem = item que está aberto no modal agora (filme/livro clicado).
// Várias funções usam isso para saber "de qual item estamos falando".
let currentApiItem = null;

// --- Referências aos elementos do index.html (pelo id) ---
const formBusca = document.getElementById('form-busca');            // <form> da busca
const inputBuscaTitulo = document.getElementById('busca-titulo');   // campo de texto do título
const selectBuscaTipo = document.getElementById('busca-tipo');      // select escondido (filme/livro), controlado pelas abas
const divResultados = document.getElementById('resultados-busca');  // onde aparecem os cards da busca
const divListaSalva = document.getElementById('lista-salva');       // onde aparecem os cards salvos
const msgVazio = document.getElementById('msg-vazio');              // "Sua lista está vazia"

// Sugestão ortográfica ("Você quis dizer: ...")
const divSugestao = document.getElementById('sugestao-ortografica');
const termoSugerido = document.getElementById('termo-sugerido');

// Filtros da lista salva
const formFiltros = document.getElementById('form-filtros');
const filtroTipo = document.getElementById('filtro-tipo');
const filtroGenero = document.getElementById('filtro-genero');
const filtroAno = document.getElementById('filtro-ano');

// Elementos do modal de detalhes
const modal = document.getElementById('modal-item');
const btnFecharModal = document.getElementById('fechar-modal');
const formSalvar = document.getElementById('form-salvar');
const btnDeletarModal = document.getElementById('btn-deletar-modal');

// Guarda o "timer" do debounce (usado na sugestão ortográfica, veja mais abaixo)
let debounceTimer;

// Imagem de "sem capa" embutida no próprio código (data URI em SVG).
// Usada quando a API não devolve imagem. Não depende de site externo.
const SEM_CAPA = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="100%" height="100%" fill="#1f2029"/><text x="50%" y="50%" fill="#888" font-size="22" text-anchor="middle" font-family="sans-serif">Sem Capa</text></svg>'
);

// Função de segurança: troca caracteres especiais (& < > " ') por entidades HTML.
// Por quê? Os textos vêm de APIs externas e são inseridos com innerHTML.
// Sem isso, um título com <script> poderia quebrar ou atacar a página (XSS).
function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


// ================= TMDB (FILMES) =================
// TMDB = The Movie Database (themoviedb.org). API gratuita de filmes, exige uma chave (api_key).

// ⚠️ A chave está escrita direto no código, então qualquer pessoa que abrir o site consegue vê-la.
// Para a TMDB isso é tolerável (chave gratuita), mas nunca faça isso com chaves pagas/secretas.
const TMDB_KEY = 'a0323e03ef1ebc5acf8f44bf5c60db8e';
// Endereço base das imagens de pôster (w500 = largura 500px)
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
// Cache dos gêneros: objeto no formato { 28: 'Ação', 12: 'Aventura', ... }
// Começa null; depois da 1ª chamada fica guardado para não repetir a requisição.
let generosTMDB = null;

// [API 1] TMDB — lista de gêneros de filmes
// Por que precisa? A busca de filmes devolve só IDs de gênero (ex.: 28).
// Esta função baixa a tabela "id -> nome" para traduzir 28 em "Ação".
async function carregarGenerosTMDB() {
    if (generosTMDB) return generosTMDB; // já tem em cache? devolve direto
    // fetch = faz a requisição HTTP. await = espera a resposta chegar.
    const res = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_KEY}&language=pt-BR`);
    // res.ok é false se o HTTP for 401 (chave inválida), 404, 500 etc.
    if (!res.ok) throw new Error('TMDB respondeu HTTP ' + res.status + ' (verifique a chave)');
    const data = await res.json(); // converte o corpo da resposta em objeto JS
    generosTMDB = {};
    data.genres.forEach(g => generosTMDB[g.id] = g.name); // monta { id: nome }
    return generosTMDB;
}

// [API 2] TMDB — busca de filmes por título
// Devolve uma lista de filmes já no "formato padrão" do projeto (ver .map abaixo).
async function buscarFilmesTMDB(query) {
    const generos = await carregarGenerosTMDB(); // garante que a tabela de gêneros existe
    // encodeURIComponent converte espaços/acentos para algo seguro de colocar na URL
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=pt-BR&include_adult=false&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB respondeu HTTP ' + res.status);
    const data = await res.json();
    // Converte cada filme da TMDB para o MESMO formato usado pelo resto do app.
    // Livros também são convertidos para este formato, assim os cards funcionam para os dois.
    return (data.results || []).map(f => ({
        id: 'tmdb_' + f.id,                                     // prefixo evita colisão com ids de livros
        tipo: 'filme',
        titulo: f.title || 'Sem Título',
        imagem: f.poster_path ? TMDB_IMG + f.poster_path : SEM_CAPA,
        genero: f.genre_ids && f.genre_ids.length ? (generos[f.genre_ids[0]] || 'Desconhecido') : 'Desconhecido', // usa só o 1º gênero
        ano: f.release_date ? f.release_date.substring(0, 4) : 'N/D', // "2010-07-16" -> "2010"
        sinopse: f.overview || 'Sem sinopse.',
        trailer: null
    }));
}


// ================= INICIALIZAÇÃO =================
// Quando a página termina de carregar: monta o filtro de gêneros e desenha a lista salva.
document.addEventListener('DOMContentLoaded', () => {
    atualizarFiltroGeneros();
    renderSavedItems();
});


// ================= SUGESTÃO ORTOGRÁFICA (Apenas Correção) =================

// [API 3] Datamuse — endpoint /sug (autocompletar/sugestões)
// Atenção: Datamuse é uma API de palavras em INGLÊS, então funciona melhor com títulos em inglês.
async function buscarSugestaoOrtografica(termo) {
    // termo muito curto: esconde a sugestão e sai
    if (termo.length < 3) {
        divSugestao.classList.add('hidden');
        return;
    }
    try {
        const res = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(termo)}`);
        const data = await res.json(); // lista de { word, score }

        // Só mostra se existir sugestão E ela for diferente do que a pessoa digitou
        if (data.length > 0 && data[0].word.toLowerCase() !== termo.toLowerCase()) {
            termoSugerido.textContent = data[0].word;
            divSugestao.classList.remove('hidden');
        } else {
            divSugestao.classList.add('hidden');
        }
    } catch (error) {
        // Se a API falhar, apenas esconde a sugestão (não quebra o app)
        divSugestao.classList.add('hidden');
    }
}

// DEBOUNCE: em vez de chamar a API a cada tecla, espera 400 ms sem digitar.
// Cada nova tecla cancela o timer anterior (clearTimeout) e cria outro.
// O evento 'input' serve APENAS para sugerir a correção. NÃO faz busca de filmes.
inputBuscaTitulo.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        buscarSugestaoOrtografica(inputBuscaTitulo.value.trim());
    }, 400);
});


// ================= CONSUMO DE API (BUSCA MANUAL) =================

// Clicar na sugestão: coloca o termo sugerido no campo, esconde a dica e busca.
termoSugerido.addEventListener('click', () => {
    inputBuscaTitulo.value = termoSugerido.textContent;
    divSugestao.classList.add('hidden');
    realizarBusca(); 
});

// Clicar no botão Buscar ou dar Enter (ambos disparam o evento 'submit' do form)
formBusca.addEventListener('submit', (e) => {
    e.preventDefault(); // impede o navegador de recarregar a página
    divSugestao.classList.add('hidden');
    realizarBusca();
});


// ================= TRAILER (TMDB -> YouTube) =================
// Cache { idDoFilme: link } para não repetir requisição do mesmo filme.
const cacheTrailers = {};

// [API 4] TMDB — vídeos de um filme (/movie/{id}/videos)
// idioma = 'pt-BR' ou 'en-US'. Devolve o melhor vídeo encontrado ou null.
async function buscarVideoTMDB(idNumerico, idioma) {
    const url = `https://api.themoviedb.org/3/movie/${idNumerico}/videos?api_key=${TMDB_KEY}&language=${idioma}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // Só interessam vídeos hospedados no YouTube
    const videos = (data.results || []).filter(v => v.site === 'YouTube');
    // Ordem de preferência: trailer oficial > qualquer trailer > teaser > nada
    return videos.find(v => v.type === 'Trailer' && v.official)
        || videos.find(v => v.type === 'Trailer')
        || videos.find(v => v.type === 'Teaser')
        || null;
}

// Monta o link final do trailer para um item
async function obterLinkTrailer(item) {
    const idNum = String(item.id).replace('tmdb_', ''); // 'tmdb_550' -> '550'
    if (cacheTrailers[idNum] !== undefined) return cacheTrailers[idNum]; // já buscou antes
    let link = null;
    try {
        // Tenta em português; se não achar, tenta em inglês
        const video = (await buscarVideoTMDB(idNum, 'pt-BR')) || (await buscarVideoTMDB(idNum, 'en-US'));
        // "video.key" é o código do vídeo no YouTube
        if (video) link = `https://www.youtube.com/watch?v=${video.key}`;
    } catch (e) { console.warn('Erro ao buscar trailer:', e); }
    // Plano B: se a TMDB não tiver trailer, abre uma BUSCA no YouTube (não é API, é só um link)
    if (!link) link = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.titulo + ' ' + item.ano + ' trailer')}`;
    cacheTrailers[idNum] = link;
    return link;
}

// Mostra/esconde o botão "▶ Assistir trailer" do modal
async function configurarBotaoTrailer(item) {
    const btn = document.getElementById('btn-trailer');
    btn.classList.add('hidden'); // começa escondido
    // Só filmes vindos da TMDB têm trailer
    if (item.tipo !== 'filme' || !String(item.id).startsWith('tmdb_')) return;
    const link = await obterLinkTrailer(item);
    // A busca é assíncrona: se o usuário já abriu OUTRO item enquanto esperava,
    // não pode aplicar o link no item errado. Por isso essa checagem.
    if (currentApiItem === item) {
        btn.href = link;
        btn.classList.remove('hidden');
    }
}


// ================= LINKS DE COMPRA (LIVROS) =================
// [API 5] Não é API de verdade: nenhuma dessas lojas tem API pública gratuita para achar
// o produto exato, então o código MONTA o link da BUSCA da loja com título (e autor).

// Transforma "Pequeno Príncipe!" em "pequeno-principe" (formato de URL do Mercado Livre)
function slugMercadoLivre(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); // troca símbolos por "-" e limpa as pontas
}

// Preenche os 3 botões de compra do modal (só aparecem para livros)
function configurarLinksLivro(item) {
    const box = document.getElementById('links-livro');
    if (item.tipo !== 'livro') { box.classList.add('hidden'); return; }

    const titulo = item.titulo;
    // Se tiver autor, busca "título autor" (resultado mais preciso)
    const tituloAutor = item.autor ? `${item.titulo} ${item.autor}` : item.titulo;

    document.getElementById('btn-estante').href =
        `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(titulo)}`;
    document.getElementById('btn-amazon').href =
        `https://www.amazon.com.br/s?k=${encodeURIComponent(tituloAutor)}&i=stripbooks`;
    document.getElementById('btn-ml').href =
        `https://lista.mercadolivre.com.br/${slugMercadoLivre('livro ' + tituloAutor)}`;
    box.classList.remove('hidden');
}


// ================= LIVROS: OPEN LIBRARY (principal) + GOOGLE BOOKS (reserva) =================

// [API 6] Open Library — busca de livros (gratuita, SEM chave)
async function buscarLivrosOpenLibrary(query) {
    // "fields" pede só os campos necessários (resposta menor e mais rápida)
    const campos = 'key,title,author_name,first_publish_year,cover_i,subject,first_sentence';
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=30&fields=${campos}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Open Library respondeu HTTP ' + res.status);
    const data = await res.json();
    // Converte para o mesmo formato padrão dos filmes
    return (data.docs || []).map(l => {
        // first_sentence pode vir como array ou texto; padroniza para texto
        const frase = Array.isArray(l.first_sentence) ? l.first_sentence[0] : (l.first_sentence || '');
        return {
            id: 'ol_' + l.key.replace('/works/', ''),   // ex.: 'ol_OL82563W'
            tipo: 'livro',
            titulo: l.title || 'Sem Título',
            // cover_i = número da capa; a imagem fica em covers.openlibrary.org
            imagem: l.cover_i ? `https://covers.openlibrary.org/b/id/${l.cover_i}-M.jpg` : SEM_CAPA,
            genero: l.subject && l.subject.length ? l.subject[0] : 'Desconhecido',
            autor: l.author_name && l.author_name.length ? l.author_name[0] : '',
            ano: l.first_publish_year ? String(l.first_publish_year) : 'N/D',
            sinopse: frase || '',          // vazio de propósito: será buscada ao abrir o modal (API 8)
            workKey: l.key,                // guardado para a API 8 (ex.: '/works/OL82563W')
            trailer: null
        };
    });
}

// [API 7] Google Books — busca de livros (usada como RESERVA se a Open Library falhar/não achar)
async function buscarLivrosGoogle(query) {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=30`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google Books respondeu HTTP ' + res.status);
    const data = await res.json();
    return (data.items || []).map(item => ({
        id: item.id,
        tipo: 'livro',
        titulo: item.volumeInfo.title || 'Sem Título',
        // A Google devolve a capa em http; troca por https para não dar aviso de conteúdo misto
        imagem: item.volumeInfo.imageLinks && item.volumeInfo.imageLinks.thumbnail ? item.volumeInfo.imageLinks.thumbnail.replace('http:', 'https:') : SEM_CAPA,
        genero: item.volumeInfo.categories ? item.volumeInfo.categories[0] : 'Desconhecido',
        autor: item.volumeInfo.authors && item.volumeInfo.authors.length ? item.volumeInfo.authors[0] : '',
        ano: item.volumeInfo.publishedDate ? item.volumeInfo.publishedDate.substring(0, 4) : 'N/D',
        sinopse: item.volumeInfo.description || 'Sem sinopse.',
        trailer: null
    }));
}

// Escolhe a fonte de livros: tenta Open Library; se der erro OU vier vazio, usa Google Books.
async function buscarLivros(query) {
    try {
        const r = await buscarLivrosOpenLibrary(query);
        if (r.length) return r; // achou: usa
    } catch (erro) {
        console.warn('Open Library falhou, tentando Google Books:', erro);
    }
    return buscarLivrosGoogle(query); // plano B
}

// [API 8] Open Library — sinopse completa de UM livro (endpoint /works/{id}.json)
// Chamada ao abrir o modal. A busca (API 6) não traz a sinopse, então ela vem daqui.
async function carregarSinopseLivro(item) {
    if (!item.workKey || item.sinopse) return; // sem workKey (outra fonte) ou já tem sinopse: não precisa
    try {
        const res = await fetch(`https://openlibrary.org${item.workKey}.json`);
        if (!res.ok) return;
        const w = await res.json();
        // description pode ser texto simples OU objeto { value: '...' }
        const desc = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
        item.sinopse = desc || 'Sem sinopse.';
    } catch (e) { item.sinopse = 'Sem sinopse.'; }
    // Atualiza o modal só se ainda for o mesmo livro aberto
    if (currentApiItem === item) document.getElementById('modal-sinopse').textContent = item.sinopse;
}


// ================= BUSCA (decide filme ou livro) =================
async function realizarBusca() {
    const query = inputBuscaTitulo.value.trim();
    const tipo = selectBuscaTipo.value; // 'filme' ou 'livro' (definido pelas abas)
    
    if (query.length < 3) return; // evita buscas com 1-2 letras

    // Feedback visual enquanto espera a API
    divResultados.innerHTML = '<p class="msg-empty">⏳ A procurar na base de dados...</p>';
    divResultados.classList.remove('hidden');

    try {
        let resultados = [];
        
        if (tipo === 'filme') {
            resultados = await buscarFilmesTMDB(query);  // API 1 + 2
        } else {
            resultados = await buscarLivros(query);      // API 6 (ou 7)
        }

        renderResultadosBusca(resultados);
        
    } catch (error) {
        console.error('Erro na busca:', error);
        // esc() protege caso a mensagem de erro tenha caracteres especiais
        divResultados.innerHTML = `<p class="msg-empty" style="color: var(--danger);">Erro: Não foi possível ligar à base de dados (${esc(error.message)}). Tente novamente mais tarde.</p>`;
    }
}


// ================= RENDERIZAÇÃO DOM (BUSCA) =================
// Desenha um card para cada resultado da busca.
function renderResultadosBusca(resultados) {
    divResultados.innerHTML = '';
    
    if(!resultados || resultados.length === 0) {
        divResultados.innerHTML = '<p class="msg-empty">Nenhum resultado encontrado. Tente outro termo.</p>';
        return;
    }

    resultados.forEach(item => {
        const card = document.createElement('div');
        card.classList.add('card');
        card.innerHTML = `
            <img src="${esc(item.imagem)}" alt="Capa de ${esc(item.titulo)}">
            <div class="card-body">
                <h3 class="card-title">${esc(item.titulo)}</h3>
                <div>
                    <span class="badge">${esc(item.ano)}</span>
                    <span class="badge">${esc(item.genero)}</span>
                </div>
            </div>
        `;
        // Clicar no card abre o modal em modo "novo" (isEditMode = false)
        card.addEventListener('click', () => abrirModal(item, false));
        divResultados.appendChild(card);
    });
}


// ================= CRUD (CRIAR, LER, ATUALIZAR, APAGAR) =================
// C = Create  -> formSalvar 'submit' sem id (adiciona em savedItems)
// R = Read    -> renderSavedItems() (desenha a lista)
// U = Update  -> formSalvar 'submit' com id (altera status/comentário)
// D = Delete  -> btnDeletarModal 'click' (remove do array)
// Persistência: tudo é gravado no localStorage em salvarNoLocalStorage().

// Abre o modal.
// isEditMode = false -> veio da BUSCA (vai criar um item novo)
// isEditMode = true  -> veio da LISTA SALVA (vai editar/excluir um item existente)
function abrirModal(itemData, isEditMode = false) {
    currentApiItem = itemData;
    
    // Preenche as informações da direita do modal
    document.getElementById('modal-titulo').textContent = itemData.titulo;
    document.getElementById('modal-img').src = itemData.imagem;
    document.getElementById('modal-genero').textContent = itemData.genero;
    document.getElementById('modal-ano').textContent = itemData.ano;
    document.getElementById('modal-sinopse').textContent = itemData.sinopse || 'Carregando sinopse...';
    carregarSinopseLivro(itemData);   // API 8 (só livros da Open Library)
    configurarBotaoTrailer(itemData); // API 4 (só filmes)
    configurarLinksLivro(itemData);   // links de compra (só livros)
    document.getElementById('btn-criar-sala').textContent = itemData.tipo === 'filme' ? '🎟 Criar sala de cinema' : '📖 Criar clube de leitura';

    // Bloco do <video>: o projeto usa link do YouTube (botão), então item.trailer é sempre null
    // e esse <video> fica escondido. Sobrou de uma versão anterior.
    const trailerContainer = document.getElementById('trailer-container');
    const trailerVideo = document.getElementById('modal-trailer');
    if (itemData.trailer) {
        trailerVideo.src = itemData.trailer;
        trailerContainer.classList.remove('hidden');
    } else {
        trailerVideo.src = "";
        trailerContainer.classList.add('hidden');
    }

    // Campos do formulário: no modo edição carrega o que já foi salvo
    document.getElementById('item-id').value = isEditMode ? itemData.id : ''; // id preenchido = "é edição"
    document.getElementById('item-status').value = isEditMode ? itemData.status : 'Quero ver/ler';
    document.getElementById('item-comentario').value = isEditMode ? itemData.comentario : '';
    
    const btnSalvar = document.getElementById('btn-salvar-modal');
    
    // Botão Excluir só aparece em modo edição
    if(isEditMode) {
        btnDeletarModal.classList.remove('hidden');
        btnSalvar.textContent = 'Salvar Alterações';
    } else {
        btnDeletarModal.classList.add('hidden');
        btnSalvar.textContent = 'Salvar na minha lista';
    }

    modal.classList.remove('hidden'); // mostra o modal
}

// CREATE + UPDATE: ao enviar o formulário do modal
formSalvar.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('item-id').value;       // vazio = novo; preenchido = edição
    const status = document.getElementById('item-status').value;
    const comentario = document.getElementById('item-comentario').value;

    if (id) {
        // UPDATE: acha o item na lista e troca só status e comentário
        const index = savedItems.findIndex(i => i.id === id);
        if(index !== -1) {
            savedItems[index].status = status;
            savedItems[index].comentario = comentario;
        }
    } else {
        // CREATE: impede duplicados (mesmo id)
        if(savedItems.find(i => i.id === currentApiItem.id)) {
            alert('Este título já está guardado na sua lista!');
            return;
        }
        // "...currentApiItem" copia todos os campos do item e acrescenta status e comentário
        const novoItem = { ...currentApiItem, status: status, comentario: comentario };
        savedItems.push(novoItem);
    }

    salvarNoLocalStorage();
    fecharModal();
});

// DELETE: botão "Excluir da Lista"
btnDeletarModal.addEventListener('click', () => {
    const id = document.getElementById('item-id').value;
    if(confirm('Tem a certeza de que pretende eliminar este item da sua lista?')) {
        // filter mantém todos MENOS o item com esse id
        savedItems = savedItems.filter(item => item.id !== id);
        salvarNoLocalStorage();
        fecharModal();
    }
});

// READ: desenha a lista salva ("Meus Itens Salvos"), respeitando os filtros
function renderSavedItems() {
    divListaSalva.innerHTML = '';
    const tipo = filtroTipo.value;
    const genero = filtroGenero.value;
    const ano = filtroAno.value;

    // Um item passa se bater com TODOS os filtros preenchidos (filtro vazio = aceita tudo)
    const filtrados = savedItems.filter(item => {
        const matchTipo = tipo === '' || item.tipo === tipo;
        const matchGenero = genero === '' || item.genero === genero;
        const matchAno = ano === '' || item.ano === ano;
        return matchTipo && matchGenero && matchAno;
    });

    if(filtrados.length === 0) {
        msgVazio.classList.remove('hidden');
    } else {
        msgVazio.classList.add('hidden');
        filtrados.forEach(item => {
            const card = document.createElement('div');
            card.classList.add('card');
            const iconeTipo = item.tipo === 'filme' ? '🎬' : '📖';

            card.innerHTML = `
                <img src="${esc(item.imagem)}" alt="Capa de ${esc(item.titulo)}">
                <div class="card-body">
                    <h3 class="card-title">${esc(item.titulo)}</h3>
                    <div>
                        <span class="badge">${iconeTipo} ${item.tipo.toUpperCase()}</span>
                        <span class="badge">${esc(item.ano)}</span>
                    </div>
                    <span class="badge status-badge">${esc(item.status)}</span>
                </div>
            `;
            // Clicar abre o modal em modo EDIÇÃO (true)
            card.addEventListener('click', () => abrirModal(item, true));
            divListaSalva.appendChild(card);
        });
    }
}

// Recria as opções do filtro de gênero com base nos gêneros que existem na lista salva
function atualizarFiltroGeneros() {
    // reduce monta um array de gêneros SEM repetição
    const generosUnicos = savedItems.reduce((acc, item) => {
        if (!acc.includes(item.genero)) acc.push(item.genero);
        return acc;
    }, []);
    
    filtroGenero.innerHTML = '<option value="">Todos os géneros</option>';
    generosUnicos.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        filtroGenero.appendChild(opt);
    });
}

// Qualquer mudança nos filtros redesenha a lista
// 'change' = ao escolher/sair do campo; 'keyup' = a cada tecla (útil no campo de ano)
[filtroTipo, filtroGenero, filtroAno].forEach(input => {
    input.addEventListener('change', renderSavedItems);
    input.addEventListener('keyup', renderSavedItems);
});

// PERSISTÊNCIA: grava a lista no navegador (localStorage só guarda texto, por isso JSON.stringify)
function salvarNoLocalStorage() {
    localStorage.setItem('roteirodebolso_lista', JSON.stringify(savedItems));
    atualizarFiltroGeneros();
    renderSavedItems();
    // Depois de salvar, limpa a busca para a tela ficar "zerada"
    divResultados.innerHTML = '';
    divResultados.classList.add('hidden');
    document.getElementById('busca-titulo').value = '';
}

// Fecha o modal e pausa o <video> caso esteja tocando
function fecharModal() {
    modal.classList.add('hidden');
    const trailerVideo = document.getElementById('modal-trailer');
    if (!trailerVideo.paused) {
        trailerVideo.pause();
    }
}

btnFecharModal.addEventListener('click', fecharModal); // botão "×"
// Clicar no fundo escuro (fora da caixa) também fecha: e.target === modal só vale
// quando o clique foi no fundo, não dentro do conteúdo.
window.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
});


// ================= SALAS DE CINEMA / CLUBE DE LEITURA (Firebase) =================
// [API 9] Firebase Realtime Database
// O que é: um banco na nuvem do Google que avisa TODOS os navegadores conectados
// assim que algo muda. É isso que faz o chat e a lista de salas atualizarem "ao vivo".
// Estrutura dos dados no banco:
//   salas/
//     {idDaSala}/
//       tipo, titulo, imagem, ano, quando, local, criador, criadorId
//       participantes/ { idDoUsuario: apelido }
//       mensagens/     { idDaMensagem: { autor, uid, texto, hora } }
//
// 1) Crie um projeto em console.firebase.google.com, ative o "Realtime Database"
// 2) Cole abaixo a configuração do seu app web (todos os amigos usam a mesma)
const FIREBASE_CONFIG = {
    apiKey: '',
    authDomain: '',
    databaseURL: '',   // ex.: https://SEU-PROJETO-default-rtdb.firebaseio.com
    projectId: '',
    appId: ''
};

// db = conexão com o banco. Fica null se o Firebase não estiver configurado
// (aí o resto do código mostra o aviso "Salas desativadas").
let db = null;
try {
    // Só inicia se tiver databaseURL preenchido E o script do Firebase tiver carregado (index.html)
    if (FIREBASE_CONFIG.databaseURL && window.firebase) {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
    }
} catch (e) { console.error('Firebase:', e); }

// Identidade SEM login: gera um id aleatório na 1ª visita e guarda no navegador.
// É o que permite saber "esta sala/mensagem é minha" (mostrar botão Excluir, balão verde...).
// Limite: se limpar o navegador, vira outro "usuário".
const meuId = localStorage.getItem('rb_uid') || (() => {
    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('rb_uid', id);
    return id;
})();
let refMsgs = null;     // "ouvinte" das mensagens da sala aberta (precisa ser desligado ao sair)
let salaAberta = null;  // id da sala cujo chat está aberto
const $id = id => document.getElementById(id); // atalho: $id('x') = document.getElementById('x')

// Abre o modal "Criar sala" para o item atual
function abrirNovaSala() {
    if (!db) { alert('As salas ainda não estão configuradas: cole a configuração do Firebase no script.js.'); return; }
    const filme = currentApiItem.tipo === 'filme';
    $id('nova-sala-titulo').textContent = (filme ? '🎟 Sala de cinema: ' : '📖 Clube de leitura: ') + currentApiItem.titulo;
    $id('sala-apelido').value = localStorage.getItem('rb_apelido') || ''; // lembra o último apelido
    $id('modal-nova-sala').classList.remove('hidden');
}

$id('btn-criar-sala').addEventListener('click', abrirNovaSala);
$id('fechar-nova-sala').addEventListener('click', () => $id('modal-nova-sala').classList.add('hidden'));

// ESCRITA no Firebase: cria a sala
$id('form-nova-sala').addEventListener('submit', async e => {
    e.preventDefault();
    const apelido = $id('sala-apelido').value.trim();
    localStorage.setItem('rb_apelido', apelido);
    const novaRef = db.ref('salas').push();   // push() gera um id único automático dentro de "salas"
    await novaRef.set({                       // set() grava o objeto nesse id
        tipo: currentApiItem.tipo,
        titulo: currentApiItem.titulo,
        imagem: currentApiItem.imagem,
        ano: currentApiItem.ano,
        quando: $id('sala-data').value,
        local: $id('sala-local').value.trim(),
        criador: apelido,
        criadorId: meuId,
        participantes: { [meuId]: apelido }   // o criador já entra como confirmado
    });
    $id('modal-nova-sala').classList.add('hidden');
    e.target.reset();
    fecharModal();
    mostrarVista('lista');
    abrirPainel(); // mostra a sala recém-criada no painel lateral
});

// Desenha a lista de salas no painel lateral (chamada toda vez que o banco muda)
function renderSalas(salas) {
    const total = Object.keys(salas || {}).length;
    // Bolinha vermelha do botão flutuante = quantidade de salas
    $id('badge-salas').textContent = total;
    $id('badge-salas').classList.toggle('hidden', total === 0);
    const lista = $id('lista-salas');
    lista.innerHTML = '';
    // Ordena pela data do encontro (mais próxima primeiro)
    const ids = Object.keys(salas || {}).sort((a, b) => salas[a].quando.localeCompare(salas[b].quando));
    if (!ids.length) { lista.innerHTML = '<p class="msg-empty">Nenhuma sala criada ainda.</p>'; return; }
    ids.forEach(id => {
        const s = salas[id];
        const qtd = s.participantes ? Object.keys(s.participantes).length : 0;
        const quando = new Date(s.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const card = document.createElement('div');
        card.className = 'sala-card';
        // data-entrar / data-excluir guardam o id da sala no próprio botão
        // (o clique é tratado mais abaixo, em $id('lista-salas'))
        // Botão Excluir só aparece para quem criou a sala (criadorId === meuId)
        card.innerHTML = `
            <img src="${esc(s.imagem)}" alt="">
            <div class="info">
                <strong>${s.tipo === 'filme' ? '🎟' : '📖'} ${esc(s.titulo)}</strong>
                <span>📅 ${esc(quando)}</span>
                ${s.local ? `<span>📍 ${esc(s.local)}</span>` : ''}
                <span>👤 ${esc(s.criador)} • 👥 ${qtd} confirmado(s)</span>
                <div class="acoes">
                    <button data-entrar="${id}">Entrar / Chat</button>
                    ${s.criadorId === meuId ? `<button class="excluir" data-excluir="${id}">Excluir</button>` : ''}
                </div>
            </div>`;
        lista.appendChild(card);
    });
}

// LEITURA em tempo real: .on('value') dispara agora e DE NOVO a cada mudança em "salas".
// Por isso, quando um amigo cria uma sala, ela aparece na sua tela sem recarregar.
if (db) {
    db.ref('salas').on('value', snap => renderSalas(snap.val()));
} else {
    // Firebase não configurado: mostra aviso no painel
    const aviso = $id('aviso-salas');
    aviso.textContent = 'Salas desativadas: falta colar a configuração do Firebase no script.js.';
    aviso.classList.remove('hidden');
}

// Cliques na lista de salas (EVENT DELEGATION: um único ouvinte na lista inteira,
// em vez de um por botão; e.target.dataset diz qual botão foi clicado)
$id('lista-salas').addEventListener('click', async e => {
    const entrar = e.target.dataset.entrar, excluir = e.target.dataset.excluir;
    // Excluir: remove a sala inteira (inclui mensagens e participantes)
    if (excluir && confirm('Excluir esta sala e o chat?')) db.ref('salas/' + excluir).remove();
    if (!entrar) return; // clicou em outra coisa: sai

    // Pede um apelido se ainda não tiver
    let apelido = localStorage.getItem('rb_apelido');
    if (!apelido) {
        apelido = (prompt('Qual apelido você quer usar no chat?') || '').trim().slice(0, 20);
        if (!apelido) return;
        localStorage.setItem('rb_apelido', apelido);
    }
    // .once('value') = lê UMA vez (diferente de .on, que fica ouvindo)
    const snap = await db.ref('salas/' + entrar).once('value');
    const s = snap.val();
    if (!s) return; // a sala foi excluída nesse meio tempo
    db.ref(`salas/${entrar}/participantes/${meuId}`).set(apelido); // confirma presença
    $id('painel-titulo').textContent = (s.tipo === 'filme' ? '🎟 ' : '📖 ') + s.titulo;
    $id('sala-info').textContent = `📅 ${new Date(s.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` + (s.local ? ` • 📍 ${s.local}` : '') + ` • Criada por ${s.criador}`;
    $id('chat-msgs').innerHTML = '';
    salaAberta = entrar;
    if (refMsgs) refMsgs.off(); // para de ouvir a sala anterior
    mostrarVista('chat');
    // Escuta só as últimas 100 mensagens da sala.
    // 'child_added' dispara uma vez para cada mensagem existente e depois para cada nova.
    refMsgs = db.ref(`salas/${entrar}/mensagens`).limitToLast(100);
    refMsgs.on('child_added', m => {
        const msg = m.val(), box = $id('chat-msgs');
        const div = document.createElement('div');
        div.className = 'chat-msg' + (msg.uid === meuId ? ' minha' : ''); // "minha" = balão verde à direita
        const autor = document.createElement('b'); autor.textContent = msg.autor;
        div.append(autor, document.createTextNode(msg.texto)); // textContent: sem risco de HTML injetado
        box.appendChild(div);
        box.scrollTop = box.scrollHeight; // rola até a última mensagem
    });
});

// ESCRITA no Firebase: enviar mensagem no chat
$id('form-chat').addEventListener('submit', e => {
    e.preventDefault();
    const texto = $id('chat-texto').value.trim();
    if (!texto || !db) return;
    db.ref(`salas/${salaAberta}/mensagens`).push({
        autor: localStorage.getItem('rb_apelido') || 'Anônimo',
        uid: meuId,
        texto,
        hora: firebase.database.ServerValue.TIMESTAMP // horário gerado pelo SERVIDOR (não depende do relógio do usuário)
    });
    $id('chat-texto').value = '';
});

// ---------- Painel lateral (abrir / fechar / alternar entre lista e chat) ----------
// O painel tem 2 "telas": lista de salas e chat. Esta função alterna entre elas.
function mostrarVista(vista) {
    const chat = vista === 'chat';
    $id('vista-lista').classList.toggle('hidden', chat);
    $id('vista-chat').classList.toggle('hidden', !chat);
    $id('voltar-salas').classList.toggle('hidden', !chat); // seta "←" só aparece no chat
    if (!chat) {
        // Voltou para a lista: para de ouvir as mensagens e restaura o título
        if (refMsgs) { refMsgs.off(); refMsgs = null; }
        $id('painel-titulo').textContent = '🎟 Salas e Clubes';
    }
}
// A classe .aberto (no CSS) faz o painel deslizar para dentro da tela
function abrirPainel() { $id('painel-salas').classList.add('aberto'); }
function fecharPainel() { $id('painel-salas').classList.remove('aberto'); }

$id('btn-abrir-salas').addEventListener('click', () => {
    $id('painel-salas').classList.contains('aberto') ? fecharPainel() : abrirPainel();
});
$id('fechar-painel').addEventListener('click', fecharPainel);
$id('voltar-salas').addEventListener('click', () => mostrarVista('lista'));


// ================= ABAS FILMES / LIVROS (com troca de tema) =================
const abas = document.querySelectorAll('.aba');

function trocarAba(tipo) {
    selectBuscaTipo.value = tipo;                                          // o resto do código lê este valor
    // data-tema no <body> ativa as cores do CSS: verde (filmes) ou laranja (livros)
    document.body.dataset.tema = tipo === 'filme' ? 'filmes' : 'livros';
    abas.forEach(a => a.classList.toggle('ativa', a.dataset.tipo === tipo));
    inputBuscaTitulo.placeholder = tipo === 'filme'
        ? 'Digite o título do filme (Ex: Carrie, a Estranha)...'
        : 'Digite o título do livro (Ex: Harry Potter)...';
    // limpa resultados da aba anterior e, se já havia texto, busca na nova aba
    divResultados.innerHTML = '';
    divResultados.classList.add('hidden');
    divSugestao.classList.add('hidden');
    if (inputBuscaTitulo.value.trim().length >= 3) realizarBusca();
}
abas.forEach(a => a.addEventListener('click', () => trocarAba(a.dataset.tipo)));
