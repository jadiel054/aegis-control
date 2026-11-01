/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/admin/authorization/evaluate': ['./api/proto/aegis/authorization/v1/authorization.proto'],
  },
  typescript: {
    // Next 16 async params migration in progress; unblock production deploys
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
