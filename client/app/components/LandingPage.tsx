'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const router = useRouter();
  const { login } = useAuth();

  const handleRoleSelection = (role: 'scout' | 'alumni') => {
    // Login with appropriate email based on role
    const email = role === 'scout' ? 'scout@test.com' : 'alumni@test.com';
    const success = login(email);
    
    if (success) {
      // Redirect to appropriate dashboard
      // For now, both redirect to '/' (scout dashboard)
      // Alumni dashboard can be added later at '/alumni'
      if (role === 'scout') {
        router.push('/');
      } else {
        // For now, redirect alumni to '/' as well
        // Can be changed to '/alumni' when that route is created
        router.push('/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white relative overflow-hidden">
      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-20">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
            Bridge<span className="text-[#00d4ff]">.it</span>
          </h1>
          <p className="text-2xl md:text-3xl font-semibold text-white mb-4">
            Bridging the gap between Institutional Scouts and Alumni Talent.
          </p>
          <p className="text-lg md:text-xl text-gray-300 font-medium">
            Where Local Friction & Technical Solutions Meet
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
          {/* Scout Portal Card */}
          <button
            onClick={() => handleRoleSelection('scout')}
            className="group relative bg-white text-[#0f172a] rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02] border-2 border-transparent hover:border-[#0f172a]"
          >
            {/* Glow effect on hover */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#0f172a] to-[#1e293b] opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#0f172a] mb-6 group-hover:bg-[#1e293b] transition-colors duration-300">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3">Scout Portal</h2>
              <p className="text-gray-700 font-medium leading-relaxed">
                Identify and analyze regional business friction
              </p>
              <div className="mt-6 flex items-center text-[#0f172a] font-semibold group-hover:text-[#1e293b] transition-colors">
                <span>Enter Portal</span>
                <svg
                  className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
            
            {/* Navy theme glow */}
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="absolute inset-0 rounded-xl" style={{
                boxShadow: '0 0 30px rgba(15, 23, 42, 0.4), 0 0 60px rgba(15, 23, 42, 0.2)'
              }}></div>
            </div>
          </button>

          {/* Alumni Portal Card */}
          <button
            onClick={() => handleRoleSelection('alumni')}
            className="group relative bg-white text-[#0f172a] rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02] border-2 border-transparent hover:border-[#10b981]"
          >
            {/* Glow effect on hover */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#10b981] mb-6 group-hover:bg-[#059669] transition-colors duration-300">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3">Alumni Portal</h2>
              <p className="text-gray-700 font-medium leading-relaxed">
                Discover and claim technical project opportunities
              </p>
              <div className="mt-6 flex items-center text-[#10b981] font-semibold group-hover:text-[#059669] transition-colors">
                <span>Enter Portal</span>
                <svg
                  className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
            
            {/* Green theme glow */}
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="absolute inset-0 rounded-xl" style={{
                boxShadow: '0 0 30px rgba(16, 185, 129, 0.4), 0 0 60px rgba(16, 185, 129, 0.2)'
              }}></div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
