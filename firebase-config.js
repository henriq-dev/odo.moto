// ==========================================================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================================================
// Preencha os valores abaixo com as credenciais do SEU projeto Firebase.
// Isso NÃO é sensível como uma senha — essas chaves ficam expostas no
// navegador em qualquer app Firebase, a segurança real vem das regras do
// Firestore (veja o passo a passo que te enviei na conversa).
//
// Passo a passo resumido:
// 1. Acesse https://console.firebase.google.com e crie um projeto (grátis).
// 2. No menu lateral: Build > Authentication > Sign-in method > ative "Google".
// 3. No menu lateral: Build > Firestore Database > Criar banco de dados.
// 4. Configurações do projeto (ícone de engrenagem) > Geral > role até
//    "Seus apps" > clique no ícone "</>" (Web) > registre o app > copie
//    o objeto "firebaseConfig" que aparece e cole substituindo abaixo.
// ==========================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyC5IsPKQkxkNfRX9bqDBWf8qWF9KCZn-3c",
  authDomain: "odomoto.firebaseapp.com",
  projectId: "odomoto",
  storageBucket: "odomoto.firebasestorage.app",
  messagingSenderId: "609498680515",
  appId: "1:609498680515:web:88949621510da11f812676",
};
