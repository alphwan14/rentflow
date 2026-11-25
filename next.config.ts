import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old v2 URLs from before the redesign.
  async redirects() {
    return [
      { source: "/buildings", destination: "/units", permanent: false },
      { source: "/buildings/new", destination: "/onboarding", permanent: false },
      { source: "/buildings/:id", destination: "/units", permanent: false },
      { source: "/buildings/:id/import", destination: "/units/add-tenants?b=:id", permanent: false },
      { source: "/statements", destination: "/payments", permanent: false },
      { source: "/statements/sample", destination: "/payments/sample", permanent: false },
      { source: "/statements/:id", destination: "/payments/upload/:id", permanent: false },
      { source: "/inbox", destination: "/payments/who-paid", permanent: false },
      { source: "/onboarding/building", destination: "/onboarding", permanent: false },
    ];
  },
};

export default nextConfig;
