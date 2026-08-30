export type RouteAccessRequirements = {
  needsAuthentication: boolean;
  needsFullAccess: boolean;
  isApiRequest: boolean;
};

const fullAccessPages = ["/discover", "/rooms"];
const authenticatedPages = ["/", "/onboarding", "/account"];
const fullAccessApis = ["/api/translation", "/api/rooms"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getRouteAccessRequirements(
  pathname: string,
): RouteAccessRequirements {
  const needsFullAccess =
    matchesPrefix(pathname, fullAccessPages) ||
    matchesPrefix(pathname, fullAccessApis);

  return {
    needsFullAccess,
    needsAuthentication:
      needsFullAccess || matchesPrefix(pathname, authenticatedPages),
    isApiRequest: pathname.startsWith("/api/"),
  };
}
