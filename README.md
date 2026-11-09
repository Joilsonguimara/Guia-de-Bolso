# 🎬📚 Roteiro de Bolso

**Roteiro de Bolso** é uma Single Page Application (SPA) projetada para ser o seu hub definitivo de entretenimento. Busque por filmes ou livros, salve seus favoritos em uma lista personalizada, assista a trailers, encontre links para compra e crie salas de cinema ou clubes de leitura para interagir com seus amigos em tempo real!

---

## ✨ Funcionalidades

*   **Busca Integrada:** Pesquise filmes e livros em um só lugar alternando perfeitamente entre as abas.
*   **Sugestão Ortográfica:** Sistema inteligente que sugere correções caso você digite o nome da obra errado (Ex: "Você quis dizer...").
*   **Gestão de Lista (CRUD):** Salve os itens na sua lista pessoal com status ("Quero ver/ler", "Já vi/li", "Abandonado") e comentários. Tudo é salvo localmente no seu navegador via `localStorage`.
*   **Filtros Avançados:** Filtre sua lista salva por Tipo (Filme/Livro), Gênero ou Ano de lançamento.
*   **Detalhes Ricos:** Modais detalhados com capa, sinopse, ano, gênero, e links úteis:
    *   **Filmes:** Botão direto para assistir ao trailer no YouTube.
    *   **Livros:** Links de compra gerados dinamicamente para Estante Virtual, Amazon e Mercado Livre.
*   **Salas e Clubes em Tempo Real:** Crie "Salas de Cinema" ou "Clubes de Leitura" e converse no chat ao vivo com outros usuários.
*   **Design Dinâmico e Responsivo:** Tema escuro moderno que muda sua cor de destaque dependendo da aba ativa (Verde para filmes, Laranja para livros). Layout 100% adaptado para celulares.

---

## 🚀 Tecnologias Utilizadas

*   **HTML5** (Semântico e estruturado)
*   **CSS3** (Variáveis, Flexbox, Grid, Animações e Responsividade nativa)
*   **JavaScript (Vanilla/ES6+)** (Consumo de APIs, manipulação do DOM, persistência de dados)
*   **LocalStorage** (Banco de dados local do navegador para a lista pessoal)
*   **Firebase Realtime Database** (Banco de dados em nuvem para sincronização do chat e salas em tempo real)

---

## 📡 Mapa de APIs

O projeto consome diversas APIs públicas para enriquecer os dados:

1.  **TMDB (The Movie Database):** Lista de gêneros de filmes.
2.  **TMDB (The Movie Database):** Busca de filmes por título e informações gerais.
3.  **Datamuse:** Sugestões ortográficas e autocompletar em inglês.
4.  **TMDB -> YouTube:** Busca de vídeos e trailers oficiais.
5.  **Links Customizados (Não-API):** Geração de URLs de busca para Estante Virtual, Amazon e Mercado Livre.
6.  **Open Library:** Busca principal e gratuita de livros.
7.  **Google Books:** API de reserva para livros (caso a Open Library falhe).
8.  **Open Library:** Busca de sinopses completas dos livros.
9.  **Firebase:** Gerenciamento das salas e mensagens de chat em tempo real.

---

## 📂 Estrutura do Projeto

```text
/
├── index.html     # Estrutura da página, modais e templates
├── style.css      # Estilos globais, temas dinâmicos e responsividade
├── script.js      # Lógica da aplicação, chamadas de API, Firebase e CRUD
├── logo.png       # Logotipo do projeto
└── README.md      # Documentação do projeto
```

---

## ⚙️ Como executar o projeto localmente

1. **Clone o repositório ou baixe os arquivos** para sua máquina.
2. **Configure o Firebase:**
   * Crie um projeto no [Console do Firebase](https://console.firebase.google.com/).
   * Ative o **Realtime Database** e configure as regras de leitura/escrita para permitir acesso (para testes, você pode usar `true`).
   * No arquivo `script.js`, procure pela constante `FIREBASE_CONFIG` e cole as credenciais do seu projeto:
     ```javascript
     const FIREBASE_CONFIG = {
         apiKey: "SUA_API_KEY",
         authDomain: "SEU_AUTH_DOMAIN",
         databaseURL: "SUA_DATABASE_URL",
         projectId: "SEU_PROJECT_ID",
         appId: "SEU_APP_ID"
     };
     ```
3. **Execute o projeto:**
   * Basta abrir o arquivo `index.html` em qualquer navegador moderno.
   * *Recomendação:* Use uma extensão como o "Live Server" do VS Code para uma melhor experiência de desenvolvimento.

---

## 📝 Notas de Desenvolvimento

* A API Key do TMDB está fixada no código (`script.js`) por se tratar de uma API gratuita com foco educacional/front-end. Em ambientes de produção rigorosos, chaves de API devem ser ocultadas no backend.
* O histórico da sua "Lista Salva" fica atrelado ao navegador em que você está usando (devido ao uso do `localStorage`). Ao limpar o cache do navegador, a lista será resetada.