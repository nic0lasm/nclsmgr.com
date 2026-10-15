import { securityTxt } from "@/lib/security-txt";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(securityTxt(new Date()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
