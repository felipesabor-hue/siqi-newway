"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    if (!email || !password) {
      setMessage("Preencha e-mail e senha para entrar no sistema.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("Não foi possível entrar. Verifique seu e-mail e senha.");
      setLoading(false);
      return;
    }

    router.push("/dashboard-qualidade");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">
            Sistema de Qualidade
          </p>

          <h1 className="text-3xl font-bold text-slate-900 mt-2">
            Entrar no SGQ
          </h1>

          <p className="text-sm text-slate-500 mt-3">
            Acesse o sistema de RNC, ações corretivas, evidências e dashboard
            executivo.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              E-mail
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com.br"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Senha
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {message && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs text-slate-500">
            O acesso ao sistema deve ser feito por usuários autorizados pela
            Qualidade ou Administração.
          </p>
        </div>
      </section>
    </main>
  );
}