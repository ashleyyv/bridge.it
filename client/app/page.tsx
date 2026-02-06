"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";

// Landing page component
function LandingPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const success = login(email);
    if (!success) {
      setError("Invalid email. Use scout@test.com or alumni@test.com");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-textPrimary mb-2">
            Bridge<span className="text-cyber-blue">.IT</span>
          </h1>
          <p className="text-textSecondary">
            Institutional Opportunity Engine
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-textPrimary mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="scout@test.com or alumni@test.com"
              className="w-full px-4 py-2 border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyber-blue"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <button
            type="submit"
            className="w-full btn-neon text-white py-2 px-4 rounded-md font-medium"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-textTertiary text-center">
            Demo credentials: scout@test.com (Scout Dashboard) or alumni@test.com (Alumni Dashboard)
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on role
      if (user.role === 'scout') {
        router.push('/scout-dashboard');
      } else if (user.role === 'alumni') {
        router.push('/alumni-dashboard');
      }
    }
  }, [isAuthenticated, user, router]);

  // Show landing page if not authenticated
  if (!isAuthenticated || !user) {
    return <LandingPage />;
  }

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textPrimary text-xl font-light">Redirecting...</div>
    </div>
  );
}
