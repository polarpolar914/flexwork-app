/** @type {import('next').NextConfig} */
const nextConfig = {
  // docx is a server-only dependency; keep it external to the server bundle
  serverExternalPackages: ["docx"],
};

export default nextConfig;
