import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 開発サーバ(next dev)に localhost 以外のホスト名でアクセスすると
  // 「Cross origin request detected...」の警告が出て /_next/* の取得が拒否されるため、
  // 実際にブラウザからアクセスするホスト名を許可しておく
  allowedDevOrigins: ['typing.internal'],
};

export default nextConfig;
