// True when Google rejected the request because the sign-in token is invalid/expired.
export function isGoogleAuthError(error) {
    const status = error?.status ?? error?.code ?? error?.response?.status;
    if (status === 401) return true;
    const msg = String(error?.message || error?.response?.data?.error || "");
    return /invalid_grant|invalid authentication credentials|invalid credentials|UNAUTHENTICATED/i.test(msg);
}

export const SIGN_IN_AGAIN_MESSAGE = "Your Google sign-in expired. Please sign out and sign back in.";
