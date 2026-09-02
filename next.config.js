/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // для лёгкого production-образа в Docker
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
