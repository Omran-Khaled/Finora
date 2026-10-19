type AuthAction = 'sign in' | 'create account';

export function getAuthFailureMessage(error: unknown, action: AuthAction): string {
  const code = (error as { error?: { code?: unknown } } | null)?.error?.code;

  if (code === 'RATE_LIMITED') {
    return 'Too many attempts. Wait a moment, then try again.';
  }

  if (action === 'sign in' && code === 'UNAUTHORIZED') {
    return 'Email or password is incorrect. Check your details and try again.';
  }

  if (action === 'create account' && code === 'DUPLICATE_REQUEST') {
    return 'An account may already exist for this email. Sign in or use a different email.';
  }

  return action === 'sign in'
    ? 'We couldn’t sign you in. Check your connection and try again.'
    : 'We couldn’t create your account. Check your connection and try again.';
}
