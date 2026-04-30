'use client';

import React, { useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // State for password update form
  const [newPassword, setNewPassword] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError('登入失敗，請確認您的帳號與密碼。');
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
       setError('新密碼長度必須至少 6 個字元');
       return;
    }
    setLoading(true);
    try {
       if (auth.currentUser) {
          await updatePassword(auth.currentUser, newPassword);
          router.push('/');
       }
    } catch (err: any) {
      console.error(err);
      setError('更新密碼失敗，系統可能要求您重新登入再試一次。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-800">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {isUpdatingPassword ? '首次登入請建立新密碼' : 'TSBS 系統登入'}
          </h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {!isUpdatingPassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">帳號 (Email)</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">密碼</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請輸入密碼"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors mt-6 disabled:opacity-50"
              >
                {loading ? '登入中...' : '登入'}
              </button>
            </form>
          ) : (
             <form onSubmit={handleUpdatePassword} className="space-y-4">
               <div>
                <label className="block text-slate-400 text-sm font-medium mb-1">設定新密碼</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 個字元"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsUpdatingPassword(false)}
                  className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? '更新中...' : '確認更新'}
                </button>
              </div>
             </form>
          )}

        </div>
      </div>
    </div>
  );
}
