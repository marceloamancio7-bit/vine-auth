# vine-auth

Módulo de login reutilizável para os sistemas e apps VineOne: **Google**, **e-mail e senha**, cadastro, reenvio de confirmação e recuperação de senha. Funciona em cima do **Supabase Auth**; cada sistema usa o próprio projeto Supabase e o módulo não conhece regras de negócio (aprovação de acesso, perfis, células etc. ficam no sistema que o usa).

Duas camadas:

| Camada | Import | Para quê |
|---|---|---|
| Núcleo | `vine-auth` | Funções sem tela: `createVineAuth(client)`. Serve para web, React Native, Node, qualquer framework. |
| React | `vine-auth/react` | `AuthProvider`, `useAuth`, `AuthGate`, `LoginCard`, `NewPasswordCard`. |

## Instalar

Direto do GitHub (repositório privado: o ambiente precisa ter acesso ao repositório):

```bash
npm install github:marceloamancio7-bit/vine-auth @supabase/supabase-js
```

O `prepare` compila o pacote na instalação.

## Usar no React (exemplo mínimo)

```tsx
import {createClient} from '@supabase/supabase-js';
import {createVineAuth} from 'vine-auth';
import {AuthProvider, AuthGate, useAuth, vineAuthCss} from 'vine-auth/react';

const supabase = createClient(URL, PUBLISHABLE_KEY);
const auth = createVineAuth(supabase, {redirectTo: window.location.origin + '/login'});

export function Root() {
  return (
    <AuthProvider auth={auth}>
      <style>{vineAuthCss}</style>{/* opcional: tema escuro básico */}
      <AuthGate loginProps={{providers: ['google', 'password']}}>
        <MeuSistema />
      </AuthGate>
    </AuthProvider>
  );
}

function MeuSistema() {
  const {user, auth} = useAuth();
  return <button onClick={() => void auth.signOut()}>Sair ({user?.email})</button>;
}
```

`LoginCard` aceita: `providers`, `allowSignUp`, `signUpFields` + `getSignUpMetadata` + `validateSignUp` (campos extras do cadastro por e-mail), `labels` (textos), `footer` e `className`. Estilize pelas classes `vine-auth-*`.

## Usar sem React

```ts
const auth = createVineAuth(supabase);
await auth.signInWithGoogle();                 // redireciona; ao voltar a sessão existe
await auth.signInWithPassword(email, senha);
await auth.signUpWithPassword({email, password, metadata: {full_name: 'Maria Silva'}});
await auth.resetPassword(email);
auth.onChange((session) => { /* entrou ou saiu */ });
```

Os erros chegam como `VineAuthError` com `code` (`google_disabled`, `invalid_credentials`, `email_not_confirmed`, `rate_limited`, `network`, `unknown`) e mensagem em português.

## Ativar o login com Google (uma vez por projeto Supabase)

1. **Google Cloud Console** → *APIs e serviços* → *Tela de consentimento OAuth* (tipo Externo; escopos `email`, `profile`, `openid`; publique o app para qualquer conta Google poder entrar).
2. *Credenciais* → *Criar credenciais* → *ID do cliente OAuth* → tipo **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**: o site do sistema (ex.: `https://vineone.com.br`).
   - **URIs de redirecionamento autorizados**: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`.
3. Copie o **ID do cliente** e a **Chave secreta**.
4. **Supabase** → *Authentication* → *Sign In / Providers* → **Google** → ative e cole os dois valores.
5. **Supabase** → *Authentication* → *URL Configuration*: confira o *Site URL* e acrescente em *Redirect URLs* cada endereço usado em `redirectTo` (inclusive `http://localhost:5173/**` para desenvolvimento).

Apps nativos (iOS/Android/React Native) usam o mesmo núcleo, com um *deep link* em `redirectTo` e o cliente OAuth do tipo iOS/Android no Google Cloud.

## Boas práticas

- A chave secreta do Google fica **só** no painel do Supabase; nunca no código do app.
- Contas com o mesmo e-mail verificado são ligadas pelo Supabase (quem já tem senha entra com o Google sem duplicar o usuário).
- Entrar com o Google **não dá acesso** a dados por si só: proteja as tabelas com RLS e libere o acesso por regras do sistema (como o VineOne faz com pedidos de acesso aprovados).
- O módulo não guarda tokens: quem guarda é o `supabase-js` (localStorage no navegador).

## Desenvolvimento

```bash
npm install
npm run typecheck
npm run build
```
