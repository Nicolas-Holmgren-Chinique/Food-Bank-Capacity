import type { NextConfig } from "next";

/**
 * Not a static export any more.
 *
 * It was one while the whole app was a bundled fixture plus sessionStorage.
 * The scan changed that: /api/detect calls Claude, and the API key has to stay
 * on a server, so the app now needs one. Everything else still runs client
 * side, and no scan is ever persisted.
 */
const nextConfig: NextConfig = {
  trailingSlash: true,
};

export default nextConfig;
