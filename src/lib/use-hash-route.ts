"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Hash-based router — keeps everything on `/` (sandbox constraint) while
 * still allowing deep links like:
 *   #/services
 *   #/service/nginx.service
 *   #/logs
 *   #/terminal
 *   #/files
 *   #/files/edit?path=/etc/nginx/nginx.conf
 *
 * Browser tabs opened with these URLs work correctly because the route is
 * encoded entirely in the hash.
 */

export interface Route {
  path: string;       // e.g. "/service/nginx.service"
  segments: string[]; // ["service", "nginx.service"]
  query: URLSearchParams;
  hash: string;       // raw hash without leading #
}

function parseHash(rawHash: string): Route {
  // strip leading #
  let h = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!h.startsWith("/")) h = "/" + h;
  const [pathPart, queryPart = ""] = h.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  return {
    path: pathPart || "/",
    segments,
    query: new URLSearchParams(queryPart),
    hash: h,
  };
}

export function useHashRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window !== "undefined" ? window.location.hash : "")
  );

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener("hashchange", onChange);
    // On first load, ensure hash exists
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((path: string) => {
    const target = path.startsWith("/") ? path : "/" + path;
    if (window.location.hash === "#" + target) {
      // force re-render even if hash unchanged (for reload-button feel)
      setRoute(parseHash("#" + target));
    } else {
      window.location.hash = "#" + target;
    }
  }, []);

  return [route, navigate];
}

export function buildHref(path: string): string {
  const target = path.startsWith("/") ? path : "/" + path;
  return "#" + target;
}
