// ==========================================================================
// SERVICE WORKER — ODO.MOTO
// Guarda uma cópia local dos arquivos do app (HTML, CSS, JS, ícones) para
// que ele abra instantaneamente e continue funcionando sem internet.
//
// Importante: o registro/sincronização com Firebase e o mapa (tiles do
// OpenStreetMap) continuam precisando de internet — só o "modo local"
// (registro manual e GPS sem login) funciona 100% offline.
// ==========================================================================

const CACHE_NOME = "odo-moto-v2";

const ARQUIVOS_DO_APP = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
];

// na instalação, baixa e guarda todos os arquivos do app de uma vez
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_DO_APP))
  );
  self.skipWaiting();
});

// ao ativar, remove caches de versões antigas do app
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NOME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// estratégia: cache primeiro (rápido e funciona offline) para os arquivos
// do próprio app; para tudo o mais (Firebase, mapa), vai direto pra rede
self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  const ehArquivoDoApp = url.origin === self.location.origin;

  if (!ehArquivoDoApp) return; // deixa passar direto pra rede (CDNs, Firestore etc.)

  evento.respondWith(
    caches.match(evento.request).then((respostaCacheada) => {
      return respostaCacheada || fetch(evento.request);
    })
  );
});
