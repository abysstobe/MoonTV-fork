'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // 关键改动(1): 使用一个更明确的状态来管理认证流程
  // 'verifying': 初始状态，服务器和客户端首次渲染时都处于此状态，避免不匹配。
  // 'authenticated': 验证通过。
  // 'unauthenticated': 验证失败或未登录。
  const [authStatus, setAuthStatus] = useState<
    'verifying' | 'authenticated' | 'unauthenticated'
  >('verifying');

  useEffect(() => {
    // 这个 effect 只在客户端运行，现在可以安全地访问 localStorage
    const verifyAuth = async () => {
      // 登录页或API路由是公共的，直接视为“已认证”以允许渲染
      if (pathname.startsWith('/login') || pathname.startsWith('/api')) {
        setAuthStatus('authenticated');
        return;
      }

      const password = localStorage.getItem('password');
      const username = localStorage.getItem('username');
      const fullPath =
        window.location.pathname + window.location.search;

      // 如果本地没有凭证，直接标记为未认证并跳转
      if (!password) {
        setAuthStatus('unauthenticated');
        router.replace(`/login?redirect=${encodeURIComponent(fullPath)}`);
        return;
      }

      // 如果有凭证，则在后台静默验证
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, username }),
        });

        if (res.ok) {
          // 验证成功
          setAuthStatus('authenticated');
        } else {
          // 凭证失效
          throw new Error('认证失败');
        }
      } catch (error) {
        // 任何错误都视为未认证
        localStorage.removeItem('password');
        localStorage.removeItem('username');
        setAuthStatus('unauthenticated');
        router.replace(`/login?redirect=${encodeURIComponent(fullPath)}`);
      }
    };

    verifyAuth();
  }, [pathname, router]); // 依赖 pathname, 每次路由变化时重新验证

  // 关键改动(2): 根据状态来决定渲染什么
  if (authStatus === 'authenticated') {
    // 如果已认证，渲染页面内容（包括登录页本身）
    return <>{children}</>;
  }

  // 在验证完成前，我们渲染一个空的、透明的占位符。
  // 这是服务器和客户端首次渲染时匹配的UI，从而修复 hydration error。
  // 用户对此无感知，因为它完全透明。
  return (
    <div
      className='fixed inset-0 w-full h-full bg-transparent pointer-events-none'
      aria-hidden='true'
    />
  );
}
