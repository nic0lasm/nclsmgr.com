import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce } from "@/lib/csp";
import { CHEMIN_DOCUMENTS, EN_TETES_DOCUMENT } from "@/lib/espace/en-tetes";
import { isLocale, negotiateLocale } from "@/lib/i18n";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  if (!isLocale(firstSegment)) {
    const locale = negotiateLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    const redirect = NextResponse.redirect(url, 307);
    redirect.headers.set("Vary", "Accept-Language");
    return redirect;
  }

  // Documents réservés (PDF) : politique fermée, sans nonce, aucun script n'y est attendu.
  // Un x-nonce ou une politique envoyés par le client sont retirés de la requête : rien en aval
  // ne doit les prendre pour ceux du proxy.
  if (CHEMIN_DOCUMENTS.test(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-nonce");
    requestHeaders.delete("Content-Security-Policy");
    requestHeaders.delete("Content-Security-Policy-Report-Only");
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", EN_TETES_DOCUMENT["Content-Security-Policy"]);
    return response;
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|healthz|favicon.ico|apple-icon.png|robots.txt|sitemap.xml|\\.well-known).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
