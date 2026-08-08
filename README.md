# 🏍️ ODO.MOTO — Diário de Quilometragem

Painel digital para acompanhar os km rodados na moto — pensado como substituto de um painel/odômetro queimado. Registro manual ou automático por GPS, com painel de pilotagem em tela cheia (velocidade + km da rodada + odômetro total), sincronização opcional na nuvem e instalação como app (PWA).

**100% HTML5, CSS3 e JavaScript puro** — sem frameworks de front-end.

---

## ✨ Funcionalidades

- **Odômetro digital** — total de km rodados, em visual de painel mecânico
- **Registro manual** de rodadas (data + km + observação)
- **Rastreamento automático por GPS** — mede a distância sozinho enquanto você anda
- **Painel de pilotagem em tela cheia** — velocidade, km da rodada e odômetro total em números grandes, com a tela travada ligada (Wake Lock API) para uso montado na moto
- **Mapa do percurso** de cada rodada rastreada por GPS (Leaflet + OpenStreetMap)
- **Gráfico de km por mês** (Canvas nativo, sem bibliotecas de gráfico)
- **Login com Google + sincronização na nuvem** (Firebase) — opcional; sem login, os dados ficam salvos só no navegador (localStorage)
- **Instalável como app (PWA)** — ícone na tela inicial, abre em tela cheia, funciona offline no modo local

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Estrutura | HTML5 semântico |
| Estilo | CSS3 (Flexbox + Grid), responsivo |
| Lógica | JavaScript puro (ES Modules) |
| Localização | Geolocation API + Wake Lock API (nativas do navegador) |
| Mapa | [Leaflet](https://leafletjs.com/) + tiles do OpenStreetMap |
| Nuvem (opcional) | [Firebase](https://firebase.google.com/) — Authentication + Firestore |
| App instalável | Web App Manifest + Service Worker |

---

## 📁 Estrutura de arquivos

```
moto-km/
├── index.html            # estrutura da página
├── style.css              # todo o estilo visual
├── script.js               # toda a lógica (GPS, mapa, Firebase, PWA)
├── firebase-config.js      # credenciais do Firebase (preencher antes de usar login/nuvem)
├── manifest.json            # configuração do PWA (nome, ícone, cores)
├── service-worker.js        # cache offline do app
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-512-maskable.png
    └── icon-apple-touch.png
```

---

## 🚀 Como publicar

Funciona em qualquer hospedagem estática com HTTPS — **GitHub Pages**, **Vercel** ou **Netlify**. PWA e Geolocation API exigem HTTPS; não funcionam abrindo o `index.html` direto do computador.

**GitHub Pages:**
1. Suba a pasta inteira (incluindo `icons/`) para um repositório
2. Vá em *Settings > Pages* → selecione a branch e a pasta raiz
3. O link fica em `https://SEU_USUARIO.github.io/NOME_DO_REPO/`

**Vercel / Netlify:** basta conectar o repositório — nenhuma configuração de build é necessária (é um site estático puro).

---

## ☁️ Ativar login e sincronização na nuvem (opcional)

Sem essa etapa, o app funciona 100% no modo local (localStorage) — só o login com Google e a sincronização entre aparelhos ficam indisponíveis.

1. Crie um projeto grátis em [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication > Sign-in method** → ative "Google"
3. **Firestore Database** → criar banco de dados (modo produção)
4. Na aba **Regras** do Firestore, cole:
   ```
   match /rodadas/{id} {
     allow read, write: if request.auth != null && request.auth.uid == resource.data.uid;
     allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
   }
   ```
5. **Configurações do projeto > Geral > Seus apps** → registre um app Web (ícone `</>`) → copie o objeto `firebaseConfig`
6. Cole os valores copiados no arquivo `firebase-config.js`
7. **Authentication > Settings > Domínios autorizados** → adicione o domínio onde o app está publicado (ex: `seuusuario.github.io`)

---

## 📲 Instalar como app

- **Android (Chrome):** abra o link publicado — aparece um botão "instalar como app", ou vá em *Menu (⋮) > Instalar aplicativo*
- **iPhone (Safari):** *Compartilhar* (ícone de quadrado com seta) *> Adicionar à Tela de Início*

---

## ⚠️ Limitações importantes

- **Wake Lock (trava de tela) não funciona no Safari/iOS** — a tela pode apagar sozinha durante o uso no modo pilotagem em iPhone
- **GPS pausa se a tela apagar** — no Android, o Wake Lock evita isso; sem ele, o rastreamento é interrompido
- A **velocidade exibida vem do GPS do celular**, não é um velocímetro calibrado — serve como referência, com margem de erro de alguns km/h
- **Dados no modo local ficam presos ao navegador/aparelho** — só sincronizam entre dispositivos com login ativado
- Mapa e login exigem internet; registro manual e GPS local funcionam offline (graças ao Service Worker)

---

## 📄 Licença

Uso pessoal / educacional — projeto desenvolvido como parte dos estudos do Curso Técnico em Informática (metodologia Curso em Vídeo).
