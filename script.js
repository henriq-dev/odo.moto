// ==========================================================================
// ODO.MOTO — diário de quilometragem
//
// Modo LOCAL (padrão): dados salvos no localStorage, só neste navegador.
// Modo NUVEM (após login com Google): dados salvos no Firestore, o mesmo
// login sincroniza entre celular, PC etc.
//
// Cada rodada: { id, data: "AAAA-MM-DD", km: number, nota: string, rota?: [{lat,lng}] }
// ==========================================================================

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, query, where, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provedorGoogle = new GoogleAuthProvider();

// registra o service worker — habilita instalar como app e funcionar offline
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((erro) => {
      console.warn("Service worker não registrado:", erro.message);
    });
  });
}

// ==========================================================================
// INSTALAÇÃO DO APP (PWA)
// O navegador (Android/Chrome) avisa quando o app pode ser instalado —
// guardamos esse evento e mostramos nosso próprio botão pra disparar o
// prompt oficial de instalação. No iPhone (Safari) isso não existe: lá a
// instalação é manual, via Compartilhar > Adicionar à Tela de Início.
// ==========================================================================

let promptDeInstalacao = null;

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  promptDeInstalacao = evento;
  btnInstalarApp.hidden = false;
});

btnInstalarApp.addEventListener("click", async () => {
  if (!promptDeInstalacao) return;
  promptDeInstalacao.prompt();
  await promptDeInstalacao.userChoice;
  promptDeInstalacao = null;
  btnInstalarApp.hidden = true;
});

window.addEventListener("appinstalled", () => {
  btnInstalarApp.hidden = true;
});

const STORAGE_KEY = "motoTrips";
let modoNuvem = false;       // true quando logado — usa Firestore em vez de localStorage
let usuarioAtual = null;
let cancelarListenerNuvem = null;

// --- referências do DOM (âncora: pegamos tudo uma vez só, no topo) ---
const odoDisplay     = document.getElementById("odoDisplay");
const odoStatusText  = document.getElementById("odoStatusText");
const statMes        = document.getElementById("statMes");
const statRodadas    = document.getElementById("statRodadas");
const statMedia      = document.getElementById("statMedia");
const statUltima     = document.getElementById("statUltima");
const formRodada     = document.getElementById("formRodada");
const inputData      = document.getElementById("inputData");
const inputKm        = document.getElementById("inputKm");
const inputNota      = document.getElementById("inputNota");
const listaRodadas   = document.getElementById("listaRodadas");
const rideEmptyMsg   = document.getElementById("rideEmptyMsg");
const chartCanvas    = document.getElementById("chartMensal");
const dataHojeEl     = document.getElementById("dataHoje");
const btnIniciarGps  = document.getElementById("btnIniciarGps");
const btnFinalizarGps = document.getElementById("btnFinalizarGps");
const gpsKmLive      = document.getElementById("gpsKmLive");
const gpsStatusText  = document.getElementById("gpsStatusText");
const gpsDot         = document.getElementById("gpsDot");
const authArea       = document.getElementById("authArea");
const syncBanner     = document.getElementById("syncBanner");
const mapPanel       = document.getElementById("mapPanel");
const mapaRotaLabel  = document.getElementById("mapaRotaLabel");
const btnModoPilotagem = document.getElementById("btnModoPilotagem");
const pilotView       = document.getElementById("pilotView");
const btnSairPilotagem = document.getElementById("btnSairPilotagem");
const pilotVelocidade = document.getElementById("pilotVelocidade");
const pilotKmRodada   = document.getElementById("pilotKmRodada");
const pilotKmTotal    = document.getElementById("pilotKmTotal");
const pilotGpsStatus  = document.getElementById("pilotGpsStatus");
const pilotGpsDot     = document.getElementById("pilotGpsDot");
const btnInstalarApp  = document.getElementById("btnInstalarApp");

// ==========================================================================
// AUTENTICAÇÃO (Firebase Auth — login com Google)
// ==========================================================================

function entrarComGoogle() {
  signInWithPopup(auth, provedorGoogle).catch((erro) => {
    alert("Não foi possível entrar: " + erro.message);
  });
}

function sair() {
  if (cancelarListenerNuvem) cancelarListenerNuvem();
  signOut(auth);
}

onAuthStateChanged(auth, (usuario) => {
  usuarioAtual = usuario;
  modoNuvem = !!usuario;
  renderizarAreaLogin();

  if (modoNuvem) {
    syncBanner.textContent = "modo nuvem ativo — sincronizado entre seus aparelhos";
    syncBanner.classList.add("sync-banner--ativo");
    ativarSincronizacaoNuvem();
  } else {
    syncBanner.textContent = "modo local — dados salvos só neste navegador. entre com Google para sincronizar entre aparelhos.";
    syncBanner.classList.remove("sync-banner--ativo");
    rodadas = carregarRodadasLocal();
    renderizarTudo();
  }
});

function renderizarAreaLogin() {
  if (!usuarioAtual) {
    authArea.innerHTML = `<button type="button" class="btn btn--google" id="btnLogin">entrar com Google</button>`;
    document.getElementById("btnLogin").addEventListener("click", entrarComGoogle);
    return;
  }
  authArea.innerHTML = `
    <div class="user-chip">
      <img class="user-chip__avatar" src="${usuarioAtual.photoURL || ""}" alt="">
      <span class="user-chip__nome">${escaparHtml(usuarioAtual.displayName || "conta google")}</span>
      <button type="button" class="btn--logout" id="btnLogout">sair</button>
    </div>
  `;
  document.getElementById("btnLogout").addEventListener("click", sair);
}

// ==========================================================================
// PERSISTÊNCIA — modo local (localStorage)
// ==========================================================================

function carregarRodadasLocal() {
  const bruto = localStorage.getItem(STORAGE_KEY);
  return bruto ? JSON.parse(bruto) : [];
}

function salvarRodadasLocal(lista) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

// ==========================================================================
// PERSISTÊNCIA — modo nuvem (Firestore, escopado por uid do usuário)
// ==========================================================================

function ativarSincronizacaoNuvem() {
  const referencia = query(collection(db, "rodadas"), where("uid", "==", usuarioAtual.uid));
  cancelarListenerNuvem = onSnapshot(referencia, (snapshot) => {
    rodadas = snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));
    renderizarTudo();
  });
}

async function salvarRodadaNuvem(rodada) {
  await addDoc(collection(db, "rodadas"), { ...rodada, uid: usuarioAtual.uid });
}

async function excluirRodadaNuvem(firestoreId) {
  await deleteDoc(doc(db, "rodadas", firestoreId));
}

// função única usada pelo resto do app — decide local ou nuvem automaticamente
async function adicionarRodada(rodada) {
  if (modoNuvem) {
    await salvarRodadaNuvem(rodada);
    // o onSnapshot acima já vai re-renderizar sozinho
  } else {
    rodadas.push(rodada);
    salvarRodadasLocal(rodadas);
    renderizarTudo();
  }
}

async function excluirRodada(rodada) {
  if (modoNuvem) {
    await excluirRodadaNuvem(rodada.firestoreId);
  } else {
    rodadas = rodadas.filter((r) => r.id !== rodada.id);
    salvarRodadasLocal(rodadas);
    renderizarTudo();
  }
}

// estado em memória — começa em modo local até o Firebase confirmar login ou não
let rodadas = carregarRodadasLocal();

// ==========================================================================
// CADASTRO DE NOVA RODADA
// ==========================================================================

formRodada.addEventListener("submit", async (evento) => {
  evento.preventDefault(); // evita recarregar a página

  const novaRodada = {
    id: Date.now(),                       // id local — usado só no modo localStorage
    data: inputData.value,
    km: parseFloat(inputKm.value),
    nota: inputNota.value.trim(),
  };

  await adicionarRodada(novaRodada);

  formRodada.reset();
  inputData.value = hojeISO(); // já deixa a data de hoje pronta pra próxima
});

// ==========================================================================
// RASTREAMENTO GPS AO VIVO
// Usa a Geolocation API nativa do navegador (sem bibliotecas).
// A cada nova posição, calculamos a distância até a posição anterior
// (fórmula de Haversine) e vamos somando ao total da rodada.
// ==========================================================================

let gpsWatchId = null;
let ultimaPosicao = null;
let distanciaRastreada = 0; // km acumulados na rodada em andamento
let pontosRota = [];        // [{lat, lng}] — usado depois para desenhar o percurso no mapa

// precisão mínima aceitável (metros). leituras piores que isso são ignoradas
// pra não somar "ruído" de GPS quando a moto está parada.
const PRECISAO_MAXIMA_ACEITA = 30;

function iniciarRastreioGps() {
  if (!navigator.geolocation) {
    alert("Seu navegador não suporta geolocalização.");
    return;
  }

  distanciaRastreada = 0;
  ultimaPosicao = null;
  pontosRota = [];
  atualizarKmAoVivo();

  gpsWatchId = navigator.geolocation.watchPosition(
    aoReceberPosicao,
    aoFalharGps,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );

  btnIniciarGps.disabled = true;
  btnFinalizarGps.disabled = false;
  gpsDot.classList.add("gps-dot--recording");
  gpsStatusText.textContent = "gravando... procurando sinal de GPS";
}

function aoReceberPosicao(posicao) {
  const { latitude, longitude, accuracy, speed } = posicao.coords;

  // ignora leituras muito imprecisas (comuns em túneis, prédios, início do sinal)
  if (accuracy > PRECISAO_MAXIMA_ACEITA) {
    gpsStatusText.textContent = `gravando... sinal fraco (±${Math.round(accuracy)}m)`;
    atualizarStatusPilotagem(`sinal fraco (±${Math.round(accuracy)}m)`, false);
    return;
  }

  let velocidadeKmh = null;

  if (typeof speed === "number" && speed !== null) {
    // o próprio GPS já informa velocidade (m/s) em boa parte dos celulares
    velocidadeKmh = speed * 3.6;
  } else if (ultimaPosicao && ultimaPosicao.timestamp) {
    // fallback: calcula velocidade manualmente por distância / tempo entre leituras
    const distanciaTrecho = calcularDistanciaHaversine(
      ultimaPosicao.latitude, ultimaPosicao.longitude, latitude, longitude
    );
    const segundosDecorridos = (posicao.timestamp - ultimaPosicao.timestamp) / 1000;
    if (segundosDecorridos > 0) velocidadeKmh = (distanciaTrecho / segundosDecorridos) * 3600;
  }

  if (ultimaPosicao) {
    const distancia = calcularDistanciaHaversine(
      ultimaPosicao.latitude, ultimaPosicao.longitude,
      latitude, longitude
    );
    // ignora saltos maiores que 2km entre leituras — geralmente é erro de GPS, não a moto
    if (distancia < 2) {
      distanciaRastreada += distancia;
    }
  }

  ultimaPosicao = { latitude, longitude, timestamp: posicao.timestamp };
  pontosRota.push({ lat: latitude, lng: longitude });
  gpsStatusText.textContent = `gravando... sinal bom (±${Math.round(accuracy)}m)`;
  atualizarKmAoVivo();
  atualizarPainelPilotagem(velocidadeKmh);
  atualizarStatusPilotagem(`sinal bom (±${Math.round(accuracy)}m)`, true);
}

function aoFalharGps(erro) {
  const mensagens = {
    1: "permissão de localização negada — ative o GPS para o navegador.",
    2: "não foi possível obter sua localização.",
    3: "tempo esgotado tentando obter a localização.",
  };
  gpsStatusText.textContent = mensagens[erro.code] || "erro ao acessar o GPS.";
}

async function finalizarRastreioGps() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }

  btnIniciarGps.disabled = false;
  btnFinalizarGps.disabled = true;
  gpsDot.classList.remove("gps-dot--recording");

  if (distanciaRastreada > 0) {
    await adicionarRodada({
      id: Date.now(),
      data: hojeISO(),
      km: distanciaRastreada,
      nota: "rastreado via GPS",
      rota: pontosRota, // pontos usados depois para desenhar o percurso no mapa
    });
    gpsStatusText.textContent = `rodada de ${distanciaRastreada.toFixed(1)} km salva!`;
  } else {
    gpsStatusText.textContent = "parado — nenhuma distância registrada";
  }

  distanciaRastreada = 0;
  ultimaPosicao = null;
  pontosRota = [];
  atualizarKmAoVivo();
}

function atualizarKmAoVivo() {
  gpsKmLive.innerHTML = `${distanciaRastreada.toFixed(1)}<span class="gps-live__unit">km</span>`;
}

// fórmula de Haversine: calcula a distância em km entre dois pontos
// de latitude/longitude na superfície da Terra
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // raio médio da Terra em km
  const dLat = grausParaRadianos(lat2 - lat1);
  const dLon = grausParaRadianos(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grausParaRadianos(lat1)) * Math.cos(grausParaRadianos(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function grausParaRadianos(graus) {
  return (graus * Math.PI) / 180;
}

btnIniciarGps.addEventListener("click", iniciarRastreioGps);
btnFinalizarGps.addEventListener("click", finalizarRastreioGps);

// ==========================================================================
// MODO PILOTAGEM — painel em tela cheia (para usar montado na moto)
// Mostra velocidade + km da rodada + odômetro total juntos, em números
// enormes, e usa a Wake Lock API para impedir que a tela apague sozinha
// (sem isso, o navegador pausa o GPS assim que a tela dorme).
// ==========================================================================

let travaDeTela = null; // referência do Wake Lock ativo

async function pedirTravaDeTela() {
  try {
    if ("wakeLock" in navigator) {
      travaDeTela = await navigator.wakeLock.request("screen");
    }
  } catch (erro) {
    // alguns navegadores negam se a aba perdeu o foco no instante do pedido — não é crítico
    console.warn("Não foi possível travar a tela ligada:", erro.message);
  }
}

function liberarTravaDeTela() {
  if (travaDeTela) {
    travaDeTela.release();
    travaDeTela = null;
  }
}

// a trava de tela é liberada automaticamente pelo navegador quando a aba
// fica em segundo plano — se o piloto voltar pra aba, tentamos travar de novo
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !pilotView.hidden) {
    pedirTravaDeTela();
  }
});

async function entrarModoPilotagem() {
  pilotView.hidden = false;
  document.body.classList.add("pilotagem-ativa");
  // A tela de pilotagem possui rolagem própria; o fundo continua travado.
  pilotView.scrollTop = 0;

  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {}); // tela cheia é bônus, não obrigatório
  }

  await pedirTravaDeTela();

  // se ainda não tem uma rodada em andamento, começa uma automaticamente
  if (gpsWatchId === null) {
    iniciarRastreioGps();
  }

  atualizarPainelPilotagem(null);
}

async function sairModoPilotagem() {
  await finalizarRastreioGps(); // salva a rodada normalmente, como no botão comum

  liberarTravaDeTela();
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  pilotView.hidden = true;
  document.body.classList.remove("pilotagem-ativa");
}

function atualizarPainelPilotagem(velocidadeKmh) {
  if (pilotView.hidden) return;

  if (typeof velocidadeKmh === "number" && velocidadeKmh >= 0) {
    pilotVelocidade.textContent = Math.round(velocidadeKmh);
  }
  pilotKmRodada.textContent = distanciaRastreada.toFixed(1);
  pilotKmTotal.textContent = (calcularTotalKm() + distanciaRastreada).toFixed(1);
}

function atualizarStatusPilotagem(texto, sinalBom) {
  if (pilotView.hidden) return;
  pilotGpsStatus.lastChild.textContent = ` ${texto}`;
  pilotGpsDot.classList.toggle("gps-dot--recording", !sinalBom);
}

btnModoPilotagem.addEventListener("click", entrarModoPilotagem);
btnSairPilotagem.addEventListener("click", sairModoPilotagem);

// ==========================================================================
// CÁLCULOS DE ESTATÍSTICA
// ==========================================================================

function hojeISO() {
  return new Date().toISOString().split("T")[0];
}

function calcularTotalKm() {
  return rodadas.reduce((soma, r) => soma + r.km, 0);
}

function calcularKmDoMesAtual() {
  const agora = new Date();
  return rodadas
    .filter((r) => {
      const d = new Date(r.data + "T00:00:00");
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    })
    .reduce((soma, r) => soma + r.km, 0);
}

function calcularMediaPorRodada() {
  if (rodadas.length === 0) return 0;
  return calcularTotalKm() / rodadas.length;
}

function pegarUltimaRodada() {
  if (rodadas.length === 0) return null;
  return [...rodadas].sort((a, b) => new Date(b.data) - new Date(a.data))[0];
}

// agrupa o total de km por mês, retornando os últimos 6 meses (mais antigo -> mais recente)
function calcularKmPorMes() {
  const agora = new Date();
  const meses = [];

  for (let i = 5; i >= 0; i--) {
    const referencia = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({
      chave: `${referencia.getFullYear()}-${referencia.getMonth()}`,
      rotulo: referencia.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      total: 0,
    });
  }

  rodadas.forEach((r) => {
    const d = new Date(r.data + "T00:00:00");
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    const mesCorrespondente = meses.find((m) => m.chave === chave);
    if (mesCorrespondente) mesCorrespondente.total += r.km;
  });

  return meses;
}

// ==========================================================================
// RENDERIZAÇÃO — ODÔMETRO DIGITAL
// ==========================================================================

function renderizarOdometro() {
  const total = Math.round(calcularTotalKm());
  const digitos = String(total).padStart(6, "0").split("");

  odoDisplay.innerHTML = "";
  digitos.forEach((digito) => {
    const span = document.createElement("span");
    span.className = "odo-digit";
    span.textContent = digito;
    odoDisplay.appendChild(span);
  });

  const unidade = document.createElement("span");
  unidade.className = "odo-digit odo-digit--unit";
  unidade.textContent = "km";
  odoDisplay.appendChild(unidade);

  odoStatusText.textContent =
    rodadas.length === 0
      ? "nenhuma rodada registrada ainda"
      : `${rodadas.length} rodada${rodadas.length > 1 ? "s" : ""} registrada${rodadas.length > 1 ? "s" : ""}`;
}

// ==========================================================================
// RENDERIZAÇÃO — CARDS DE ESTATÍSTICA
// ==========================================================================

function renderizarStats() {
  statMes.textContent = calcularKmDoMesAtual().toFixed(1);
  statRodadas.textContent = rodadas.length;
  statMedia.textContent = calcularMediaPorRodada().toFixed(1);

  const ultima = pegarUltimaRodada();
  statUltima.textContent = ultima
    ? `${formatarData(ultima.data)} · ${ultima.km.toFixed(1)} km`
    : "—";
}

function formatarData(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ==========================================================================
// RENDERIZAÇÃO — LISTA DE RODADAS
// ==========================================================================

function renderizarLista() {
  listaRodadas.innerHTML = "";

  const ordenadas = [...rodadas].sort((a, b) => new Date(b.data) - new Date(a.data));

  rideEmptyMsg.style.display = ordenadas.length === 0 ? "block" : "none";

  ordenadas.forEach((rodada) => {
    const temRota = Array.isArray(rodada.rota) && rodada.rota.length > 1;

    const item = document.createElement("div");
    item.className = "ride-item";
    item.innerHTML = `
      <div class="ride-item__info">
        <span class="ride-item__date">${formatarData(rodada.data)}</span>
        ${rodada.nota ? `<span class="ride-item__note">${escaparHtml(rodada.nota)}</span>` : ""}
      </div>
      <span class="ride-item__km">${rodada.km.toFixed(1)} km</span>
      ${temRota ? `<button class="ride-item__mapa-btn">ver no mapa</button>` : ""}
      <button class="ride-item__delete" title="excluir rodada" aria-label="excluir rodada">×</button>
    `;
    item.querySelector(".ride-item__delete").addEventListener("click", () => excluirRodada(rodada));
    if (temRota) {
      item.querySelector(".ride-item__mapa-btn").addEventListener("click", () => mostrarRotaNoMapa(rodada));
    }
    listaRodadas.appendChild(item);
  });

  // ao carregar, já mostra automaticamente a rota mais recente que exista
  if (!instanciaMapa) {
    const maisRecenteComRota = ordenadas.find((r) => Array.isArray(r.rota) && r.rota.length > 1);
    if (maisRecenteComRota) mostrarRotaNoMapa(maisRecenteComRota);
  }
}

// ==========================================================================
// MAPA DO PERCURSO (Leaflet + tiles gratuitos do OpenStreetMap)
// ==========================================================================

let instanciaMapa = null;
let camadaRotaAtual = null;

function mostrarRotaNoMapa(rodada) {
  mapPanel.hidden = false;
  mapaRotaLabel.textContent = `— ${formatarData(rodada.data)} · ${rodada.km.toFixed(1)} km`;

  const coordenadas = rodada.rota.map((p) => [p.lat, p.lng]);

  if (!instanciaMapa) {
    instanciaMapa = L.map("mapaRota", { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(instanciaMapa);
  }

  if (camadaRotaAtual) {
    instanciaMapa.removeLayer(camadaRotaAtual);
  }

  camadaRotaAtual = L.layerGroup().addTo(instanciaMapa);
  const linha = L.polyline(coordenadas, { color: "#ffb627", weight: 4 }).addTo(camadaRotaAtual);
  L.circleMarker(coordenadas[0], { radius: 6, color: "#8890a0" }).addTo(camadaRotaAtual).bindTooltip("início");
  L.circleMarker(coordenadas[coordenadas.length - 1], { radius: 6, color: "#ff5c5c" }).addTo(camadaRotaAtual).bindTooltip("fim");

  instanciaMapa.fitBounds(linha.getBounds(), { padding: [24, 24] });

  // Leaflet precisa recalcular o tamanho quando o painel estava escondido (hidden)
  setTimeout(() => instanciaMapa.invalidateSize(), 50);
}

// evita que texto digitado pelo usuário quebre o HTML (segurança básica)
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ==========================================================================
// RENDERIZAÇÃO — GRÁFICO DE BARRAS (Canvas puro, sem bibliotecas)
// ==========================================================================

function renderizarGrafico() {
  const ctx = chartCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  // ajusta a resolução do canvas para telas retina sem distorcer o layout
  const larguraCss = chartCanvas.clientWidth;
  const alturaCss = chartCanvas.height;
  chartCanvas.width = larguraCss * dpr;
  chartCanvas.height = alturaCss * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, larguraCss, alturaCss);

  const dados = calcularKmPorMes();
  const maiorValor = Math.max(...dados.map((m) => m.total), 1);

  const margemInferior = 28;
  const margemSuperior = 10;
  const alturaUtil = alturaCss - margemInferior - margemSuperior;
  const larguraBarra = (larguraCss / dados.length) * 0.5;
  const espacoEntreBarras = larguraCss / dados.length;

  dados.forEach((mes, i) => {
    const alturaBarra = (mes.total / maiorValor) * alturaUtil;
    const x = i * espacoEntreBarras + (espacoEntreBarras - larguraBarra) / 2;
    const y = margemSuperior + (alturaUtil - alturaBarra);

    // barra
    ctx.fillStyle = mes.total > 0 ? "#ffb627" : "#262b33";
    ctx.beginPath();
    ctx.roundRect(x, y, larguraBarra, alturaBarra, 3);
    ctx.fill();

    // rótulo do mês
    ctx.fillStyle = "#8890a0";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(mes.rotulo, x + larguraBarra / 2, alturaCss - 8);
  });
}

// ==========================================================================
// ORQUESTRAÇÃO
// ==========================================================================

function renderizarTudo() {
  renderizarOdometro();
  renderizarStats();
  renderizarLista();
  renderizarGrafico();
}

function inicializar() {
  inputData.value = hojeISO();
  dataHojeEl.textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });
  renderizarTudo();
}

// recalcula o gráfico se a janela for redimensionada (ex: girar o celular)
window.addEventListener("resize", renderizarGrafico);

inicializar();
