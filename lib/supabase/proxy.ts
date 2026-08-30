import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRouteAccessRequirements } from "@/lib/auth/routeAccess";
import { isSupabaseConfigured } from "./config";

type AccessContext = {
  account_status?: string;
  can_enter?: boolean;
};

function copySessionCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(({ name, value }) => {
    target.cookies.set(name, value);
  });
  return target;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const { needsFullAccess, needsAuthentication, isApiRequest } =
    getRouteAccessRequirements(pathname);

  if (!isSupabaseConfigured()) {
    if (!needsAuthentication) {
      return NextResponse.next({ request });
    }

    if (isApiRequest) {
      return NextResponse.json(
        { error: "Ponder+ identity service is not configured." },
        { status: 503 },
      );
    }

    return NextResponse.redirect(new URL("/auth", request.url));
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  if (!needsAuthentication) {
    await supabase.auth.getClaims();
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isApiRequest) {
      return copySessionCookies(
        response,
        NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        ),
      );
    }

    return copySessionCookies(
      response,
      NextResponse.redirect(new URL("/auth", request.url)),
    );
  }

  const { data, error } = await supabase.rpc("current_access_context");
  const access = data as AccessContext | null;

  if (error || !access) {
    if (isApiRequest) {
      return copySessionCookies(
        response,
        NextResponse.json(
          { error: "Authorization service unavailable." },
          { status: 503 },
        ),
      );
    }

    return copySessionCookies(
      response,
      NextResponse.redirect(new URL("/account/restricted", request.url)),
    );
  }

  if (access.account_status !== "active") {
    if (isApiRequest) {
      return copySessionCookies(
        response,
        NextResponse.json(
          { error: "Account access is restricted." },
          { status: 403 },
        ),
      );
    }

    if (pathname !== "/account/restricted") {
      return copySessionCookies(
        response,
        NextResponse.redirect(new URL("/account/restricted", request.url)),
      );
    }

    return response;
  }

  if (pathname === "/account/restricted") {
    return copySessionCookies(
      response,
      NextResponse.redirect(
        new URL(access.can_enter ? "/discover" : "/onboarding", request.url),
      ),
    );
  }

  if (needsFullAccess && !access.can_enter) {
    if (isApiRequest) {
      return copySessionCookies(
        response,
        NextResponse.json(
          { error: "Complete onboarding before entering Ponder+." },
          { status: 403 },
        ),
      );
    }

    return copySessionCookies(
      response,
      NextResponse.redirect(new URL("/onboarding", request.url)),
    );
  }

  return response;
}
