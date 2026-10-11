const MESSAGES: Record<string, string> = {
  wrong: "That password isn't right. Try again.",
  locked: "Too many wrong passwords. Wait 15 minutes, then try again.",
  unset: "No password is set for this Headwind install. Add HEADWIND_PASSWORD to .env.local and restart the app.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] ?? "Couldn't sign you in. Try again." : null;
  return (
    <section>
      <h1>Sign in</h1>
      <p>Headwind holds your agency&apos;s forecasts, so it asks for the team password.</p>
      <form method="post" action="/api/login">
        <label>
          Password <input type="password" name="password" required autoFocus autoComplete="current-password" />
        </label>{" "}
        <button type="submit">Sign in</button>
      </form>
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
