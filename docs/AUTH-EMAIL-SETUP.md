# Email confirmation and recovery

Email recovery requires `PULL_APP_URL` to be the exact application origin and `PULL_OAUTH_COOKIE_SECRET` to be a private random value of at least 32 characters. HTTPS is required outside local development. This setup is independent of the Google provider switch.

In Supabase Auth, set Site URL to that application origin and allow the exact redirect URLs:

- `https://your-app.example/api/auth?flow=confirmation`
- `https://your-app.example/api/auth?flow=recovery`

For **Confirm signup**, use this email template link so confirmation runs on the server without delivering session tokens in the browser URL:

```html
<a href="{{ .SiteURL }}/api/auth?flow=confirmation&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirm email address</a>
```

Keep the **Reset password** link as `{{ .ConfirmationURL }}`. Password recovery requests use a SHA-256 PKCE challenge, and the matching verifier remains in an HttpOnly cookie. Open a recovery email in the same browser that requested it; the browser binding lasts one hour. The password change authorization lasts at most ten minutes after the link opens. A password update clears that authorization and requires a fresh password sign-in. An existing workspace session is preserved.

The server sends generic email-request responses to conceal account existence. Supabase still enforces email and authentication rate limits. Ensure a production email sender is configured before treating email delivery as verified.

Local tests verify the protocol with a fake provider. They do not verify hosted templates, sender configuration, or delivery. These settings must be checked separately before marking confirmation or recovery as a verified live connection.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), and [PKCE server authentication](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
