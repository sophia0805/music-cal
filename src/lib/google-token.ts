import type { JWT } from "next-auth/jwt";

export async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken as string | undefined;
  if (!refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!response.ok || !json.access_token) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
  const accessTokenExpires =
    Date.now() + (json.expires_in ?? 3600) * 1000;

  return {
    ...token,
    accessToken: json.access_token,
    accessTokenExpires,
    refreshToken: json.refresh_token ?? refreshToken,
    error: undefined,
  };
}
