import Link from "next/link";
import { Brand } from "@/components/Brand";

const MESSAGES: Record<string, string> = {
  wrong: "That password isn't right. Try again.",
  locked: "Too many wrong passwords from this address. Wait 15 minutes, then try again.",
  unset: "No password is set for this Headwind install. Add HEADWIND_PASSWORD to the server's environment and restart the app.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] ?? "Couldn't sign you in. Try again." : null;
  return (
    <main id="main" className="login">
      <div className="login-card">
        <Brand />
        <p className="muted">Weekly revenue check for placement agencies</p>
        <form method="post" action="/api/login" className="stack">
          <label htmlFor="password">Team password</label>
          <input id="password" type="password" name="password" required autoFocus autoComplete="current-password" aria-describedby={message ? "login-error" : undefined} />
          {message && <p id="login-error" role="alert" className="field-error">{message}</p>}
          <button type="submit" className="btn btn-primary">Sign in</button>
        </form>
        <p className="meta">No password? <Link href="/#sample">See a sample review</Link> without signing in.</p>
      </div>
    </main>
  );
}
