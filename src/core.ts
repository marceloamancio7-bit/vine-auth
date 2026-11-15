import type {Session, SupabaseClient, User} from '@supabase/supabase-js';

/** Formas de entrar suportadas pelo módulo. */
export type LoginProvider = 'google' | 'password';

export interface VineAuthOptions {
  /**
   * Para onde o Google (e os e-mails de confirmação/recuperação) devolvem a pessoa.
   * Precisa estar na lista "Redirect URLs" do Supabase. Padrão: a página atual.
   */
  redirectTo?: string;
  /** Sempre mostrar o seletor de contas do Google (padrão: true). */
  googleSelectAccount?: boolean;
}

/** Erro com código estável, para a tela decidir o que mostrar. */
export class VineAuthError extends Error {
  constructor(public code: 'google_disabled' | 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'network' | 'unknown', message: string) {
    super(message);
    this.name = 'VineAuthError';
  }
}

/** Traduz erros do Supabase para mensagens em português. */
export function translateAuthError(err: unknown): VineAuthError {
  if (err instanceof VineAuthError) return err;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const s = raw.toLowerCase();
  if (s.includes('provider is not enabled') || s.includes('unsupported provider')) return new VineAuthError('google_disabled', 'O login com Google ainda não está ativo neste sistema.');
  if (s.includes('invalid login credentials')) return new VineAuthError('invalid_credentials', 'E-mail ou senha incorretos.');
  if (s.includes('email not confirmed')) return new VineAuthError('email_not_confirmed', 'Confirme seu e-mail antes de entrar.');
  if (s.includes('rate limit') || s.includes('too many')) return new VineAuthError('rate_limited', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  if (s.includes('fetch') || s.includes('network')) return new VineAuthError('network', 'Não foi possível conectar. Confira sua conexão e tente novamente.');
  return new VineAuthError('unknown', raw || 'Não foi possível concluir. Tente novamente.');
}

export interface SignUpInput {
  email: string;
  password: string;
  /** Dados extras guardados no usuário (user_metadata), por exemplo nome e telefone. */
  metadata?: Record<string, unknown>;
}

/**
 * Cria o módulo de login em cima de um cliente Supabase que o sistema já tem.
 * Cada sistema usa o próprio projeto Supabase; nada aqui conhece regras de negócio.
 */
export function createVineAuth(client: SupabaseClient, options: VineAuthOptions = {}) {
  const redirectTo = () => options.redirectTo ?? (typeof window !== 'undefined' ? window.location.href.split('#')[0] : undefined);

  return {
    /** O cliente Supabase usado (para o sistema continuar fazendo suas consultas). */
    client,

    async getSession(): Promise<Session | null> {
      const {data, error} = await client.auth.getSession();
      if (error) throw translateAuthError(error);
      return data.session;
    },

    /** Avisa quando a pessoa entra ou sai. Retorna a função para parar de ouvir. */
    onChange(callback: (session: Session | null, event: string) => void): () => void {
      const {data} = client.auth.onAuthStateChange((event, session) => callback(session, event));
      return () => data.subscription.unsubscribe();
    },

    /** Abre o Google. A página é redirecionada; ao voltar, a sessão já existe. */
    async signInWithGoogle(): Promise<void> {
      const {error} = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {redirectTo: redirectTo(), queryParams: options.googleSelectAccount === false ? undefined : {prompt: 'select_account'}},
      });
      if (error) throw translateAuthError(error);
    },

    async signInWithPassword(email: string, password: string): Promise<Session> {
      const {data, error} = await client.auth.signInWithPassword({email: email.trim(), password});
      if (error || !data.session) throw translateAuthError(error ?? new Error('Não foi possível entrar.'));
      return data.session;
    },

    /** Cria conta com e-mail e senha. `needsEmailConfirmation` é true quando o Supabase exige confirmar o e-mail. */
    async signUpWithPassword(input: SignUpInput): Promise<{needsEmailConfirmation: boolean; user: User | null}> {
      const {data, error} = await client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {data: input.metadata, emailRedirectTo: redirectTo()},
      });
      if (error) throw translateAuthError(error);
      return {needsEmailConfirmation: !data.session, user: data.user};
    },

    async resendConfirmation(email: string): Promise<void> {
      const {error} = await client.auth.resend({type: 'signup', email: email.trim(), options: {emailRedirectTo: redirectTo()}});
      if (error) throw translateAuthError(error);
    },

    async resetPassword(email: string): Promise<void> {
      const {error} = await client.auth.resetPasswordForEmail(email.trim(), {redirectTo: redirectTo()});
      if (error) throw translateAuthError(error);
    },

    async updatePassword(password: string): Promise<void> {
      const {error} = await client.auth.updateUser({password});
      if (error) throw translateAuthError(error);
    },

    async signOut(): Promise<void> {
      const {error} = await client.auth.signOut();
      if (error) throw translateAuthError(error);
    },
  };
}

export type VineAuth = ReturnType<typeof createVineAuth>;
