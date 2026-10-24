/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/authorization/evaluate': ['./api/proto/aegis/authorization/v1/authorization.proto'],
    },
  },
};

export default nextConfig;
