import {createContext, useContext, useEffect, useState, type FormEvent, type ReactNode} from 'react';
import type {Session, User} from '@supabase/supabase-js';
import {translateAuthError, type LoginProvider, type VineAuth} from './core';

// ---------- Estado de sessão ----------

interface AuthState {
  auth: VineAuth;
  session: Session | null;
  user: User | null;
  /** true até o módulo saber se já existe uma sessão salva. */
  loading: boolean;
  /** true quando a pessoa chegou pelo link de "esqueci minha senha". */
  recovering: boolean;
}

const Ctx = createContext<AuthState | null>(null);

/** Envolve o sistema e entrega a sessão para qualquer tela via useAuth(). */
export function AuthProvider({auth, children}: {auth: VineAuth; children: ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    let alive = true;
    auth.getSession().then(s => { if (alive) { setSession(s); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    const stop = auth.onChange((s, event) => {
      if (!alive) return;
      setSession(s);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => { alive = false; stop(); };
  }, [auth]);
  return <Ctx.Provider value={{auth, session, user: session?.user ?? null, loading, recovering}}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return v;
}

/**
 * Mostra o sistema só para quem entrou; os demais veem a tela de login.
 * Se a pessoa chegou pelo link de redefinir senha, mostra a tela de nova senha.
 */
export function AuthGate({children, loginProps, loadingFallback = null}: {children: ReactNode; loginProps?: Omit<LoginCardProps, 'auth'>; loadingFallback?: ReactNode}) {
  const {auth, session, loading, recovering} = useAuth();
  if (loading) return <>{loadingFallback}</>;
  if (recovering) return <NewPasswordCard auth={auth} labels={loginProps?.labels} />;
  if (!session) return <LoginCard auth={auth} {...loginProps} />;
  return <>{children}</>;
}

// ---------- Textos ----------

export interface AuthLabels {
  title: string; subtitle: string; signupTitle: string; resetTitle: string;
  email: string; password: string; showPassword: string; hidePassword: string;
  signIn: string; signUp: string; sendReset: string; google: string; googleSignUp: string;
  forgot: string; createAccount: string; backToLogin: string; resend: string; busy: string;
  resetSent: string; signUpDone: string; resendDone: string; or: string;
  newPasswordTitle: string; newPassword: string; confirmPassword: string; saveNewPassword: string; passwordsDiffer: string;
}

export const defaultLabels: AuthLabels = {
  title: 'Entrar', subtitle: '', signupTitle: 'Criar conta', resetTitle: 'Recuperar senha',
  email: 'E-mail', password: 'Senha', showPassword: 'Mostrar senha', hidePassword: 'Ocultar senha',
  signIn: 'Entrar', signUp: 'Criar conta', sendReset: 'Enviar link de recuperação', google: 'Entrar com o Google', googleSignUp: 'Cadastrar com o Google',
  forgot: 'Esqueci minha senha', createAccount: 'Criar uma conta', backToLogin: 'Voltar para o login', resend: 'Reenviar confirmação de e-mail', busy: 'Aguarde…',
  resetSent: 'Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha.',
  signUpDone: 'Conta criada! Enviamos um e-mail para confirmar o acesso.',
  resendDone: 'Se a confirmação estiver pendente, um novo e-mail será enviado.', or: 'ou',
  newPasswordTitle: 'Definir nova senha', newPassword: 'Nova senha', confirmPassword: 'Confirmar nova senha', saveNewPassword: 'Salvar nova senha', passwordsDiffer: 'As senhas precisam ser iguais.',
};

// ---------- Tela de login / cadastro ----------

export interface LoginCardProps {
  auth: VineAuth;
  /** Quais formas de entrar mostrar. Padrão: Google e e-mail/senha. */
  providers?: LoginProvider[];
  /** Permite criar conta pela própria tela (e-mail/senha e Google). Padrão: true. */
  allowSignUp?: boolean;
  /** Campos extras do cadastro por e-mail (nome, telefone…). Devolva os valores em `getSignUpMetadata`. */
  signUpFields?: ReactNode;
  getSignUpMetadata?: () => Record<string, unknown>;
  /** Validação do cadastro por e-mail; devolva a mensagem de erro ou ''. */
  validateSignUp?: () => string;
  /** Chamado depois de entrar com e-mail e senha (o Google redireciona a página). */
  onSignedIn?: () => void;
  labels?: Partial<AuthLabels>;
  /** Texto abaixo do formulário (ex.: aviso de aprovação, contato do suporte). */
  footer?: ReactNode;
  className?: string;
}

export function LoginCard(props: LoginCardProps) {
  const {auth, providers = ['google', 'password'], allowSignUp = true} = props;
  const L: AuthLabels = {...defaultLabels, ...props.labels};
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [isError, setIsError] = useState(false);
  const hasGoogle = providers.includes('google'), hasPassword = providers.includes('password');

  function say(text: string, error = false) { setMessage(text); setIsError(error); }
  function go(next: typeof mode) { setMode(next); setPassword(''); setMessage(''); }

  async function run(task: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await task(); } catch (e) { say(translateAuthError(e).message, true); } finally { setBusy(false); }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (mode === 'reset') { await auth.resetPassword(email); say(L.resetSent); return; }
      if (mode === 'signup') {
        const problem = props.validateSignUp?.() ?? '';
        if (problem) { say(problem, true); return; }
        const r = await auth.signUpWithPassword({email, password, metadata: props.getSignUpMetadata?.()});
        say(r.needsEmailConfirmation ? L.signUpDone : '');
        if (!r.needsEmailConfirmation) props.onSignedIn?.();
        setPassword('');
        return;
      }
      await auth.signInWithPassword(email, password);
      props.onSignedIn?.();
    });
  }

  const title = mode === 'signup' ? L.signupTitle : mode === 'reset' ? L.resetTitle : L.title;
  return (
    <section className={'vine-auth ' + (props.className ?? '')}>
      <h1 className="vine-auth-title">{title}</h1>
      {L.subtitle && mode === 'login' && <p className="vine-auth-subtitle">{L.subtitle}</p>}

      {hasGoogle && mode !== 'reset' && (allowSignUp || mode === 'login') && (
        <button type="button" className="vine-auth-google" disabled={busy} onClick={() => void run(() => auth.signInWithGoogle())}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.3-3.9 7.1-9.7 7.1-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          {mode === 'signup' ? L.googleSignUp : L.google}
        </button>
      )}
      {hasGoogle && hasPassword && mode !== 'reset' && <p className="vine-auth-or">{L.or}</p>}

      {hasPassword && (
        <form onSubmit={submit} className="vine-auth-form">
          <label>{L.email}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" /></label>
          {mode === 'signup' && props.signUpFields}
          {mode !== 'reset' && (
            <>
              <label>{L.password}<input required type={showPw ? 'text' : 'password'} minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
              <button type="button" className="vine-auth-link" onClick={() => setShowPw(!showPw)}>{showPw ? L.hidePassword : L.showPassword}</button>
            </>
          )}
          <button className="vine-auth-primary" disabled={busy}>{busy ? L.busy : mode === 'signup' ? L.signUp : mode === 'reset' ? L.sendReset : L.signIn}</button>
        </form>
      )}

      {hasPassword && mode === 'login' && <button type="button" className="vine-auth-link" disabled={busy} onClick={() => go('reset')}>{L.forgot}</button>}
      {allowSignUp && mode !== 'reset' && <button type="button" className="vine-auth-link" disabled={busy} onClick={() => go(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? L.createAccount : L.backToLogin}</button>}
      {mode === 'reset' && <button type="button" className="vine-auth-link" disabled={busy} onClick={() => go('login')}>{L.backToLogin}</button>}
      {hasPassword && mode !== 'reset' && <button type="button" className="vine-auth-link" disabled={busy} onClick={() => void run(async () => { if (!email.trim()) { say('Informe seu e-mail para reenviar a confirmação.', true); return; } await auth.resendConfirmation(email); say(L.resendDone); })}>{L.resend}</button>}

      {props.footer && <div className="vine-auth-footer">{props.footer}</div>}
      {message && <p role={isError ? 'alert' : 'status'} className={'vine-auth-message' + (isError ? ' is-error' : '')}>{message}</p>}
    </section>
  );
}

/** Tela de nova senha (usada depois do link de "esqueci minha senha"). */
export function NewPasswordCard({auth, labels, onDone}: {auth: VineAuth; labels?: Partial<AuthLabels>; onDone?: () => void}) {
  const L: AuthLabels = {...defaultLabels, ...labels};
  const [pw, setPw] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== confirm) { setMessage(L.passwordsDiffer); return; }
    setBusy(true); setMessage('');
    try { await auth.updatePassword(pw); onDone?.(); } catch (err) { setMessage(translateAuthError(err).message); } finally { setBusy(false); }
  }
  return (
    <section className="vine-auth">
      <h1 className="vine-auth-title">{L.newPasswordTitle}</h1>
      <form onSubmit={submit} className="vine-auth-form">
        <label>{L.newPassword}<input type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        <label>{L.confirmPassword}<input type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <button className="vine-auth-primary" disabled={busy}>{busy ? L.busy : L.saveNewPassword}</button>
      </form>
      {message && <p role="alert" className="vine-auth-message is-error">{message}</p>}
    </section>
  );
}

/** Estilo básico opcional (tema escuro). Cole num <style> ou sobrescreva as classes vine-auth-*. */
export const vineAuthCss = `
.vine-auth{max-width:420px;margin:0 auto;padding:28px;border-radius:16px;background:#152433;color:#eef3f0;display:grid;gap:12px;font-family:inherit}
.vine-auth-title{margin:0;font-size:1.6rem}.vine-auth-subtitle{margin:0;color:#a9bdbb}
.vine-auth-form{display:grid;gap:12px}.vine-auth label{display:grid;gap:4px;font-size:.9rem}
.vine-auth input{padding:10px 12px;border-radius:10px;border:1px solid rgba(236,241,238,.18);background:#0e1a24;color:inherit}
.vine-auth-primary{padding:11px;border:0;border-radius:10px;background:#4f8f5c;color:#fff;font-weight:700;cursor:pointer}
.vine-auth-google{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px;border-radius:10px;border:1px solid rgba(236,241,238,.18);background:#fff;color:#1f1f1f;font-weight:600;cursor:pointer}
.vine-auth-link{background:none;border:0;color:#a9bdbb;text-decoration:underline;cursor:pointer;padding:2px;text-align:left}
.vine-auth-or{margin:0;text-align:center;color:#6d8078}.vine-auth-footer{font-size:.85rem;color:#a9bdbb}
.vine-auth-message{margin:0;padding:10px 12px;border-radius:10px;background:#2c4a35}.vine-auth-message.is-error{background:#4a2c2c}
`;
