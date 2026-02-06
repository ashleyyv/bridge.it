"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

interface Proof {
  id: string;
  leadId: string;
  businessName: string;
  neighborhood: string;
  builderId: string;
  builderName: string;
  milestoneId: number;
  milestoneName: string;
  proofLink: string;
  submittedAt: string;
  status: 'submitted' | 'approved' | 'rejected';
}

export default function ScoutVerifyPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<{ [proofId: string]: string }>({});
  
  // Filters
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [builderFilter, setBuilderFilter] = useState<string>('all');
  const [milestoneFilter, setMilestoneFilter] = useState<string>('all');
  
  // Stats
  const [verifiedToday, setVerifiedToday] = useState(0);

  // Route protection: Only Scouts can access
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'scout') {
      router.push('/');
    }
  }, [isAuthenticated, user, router]);

  // Fetch pending proofs
  const fetchProofs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/proofs/pending');
      if (!response.ok) throw new Error('Failed to fetch proofs');
      const data = await response.json();
      setProofs(data.proofs || []);
    } catch (error) {
      console.error('Error fetching proofs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load verified today count from localStorage
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(`verified_${today}`);
    if (stored) {
      setVerifiedToday(parseInt(stored, 10));
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'scout') {
      fetchProofs();
    }
  }, [isAuthenticated, user]);

  // Get unique values for filters
  const uniqueBusinesses = Array.from(new Set(proofs.map(p => p.businessName))).sort();
  const uniqueBuilders = Array.from(new Set(proofs.map(p => p.builderName))).sort();
  const uniqueMilestones = Array.from(new Set(proofs.map(p => p.milestoneName))).sort();

  // Filter proofs
  const filteredProofs = proofs.filter(proof => {
    if (businessFilter !== 'all' && proof.businessName !== businessFilter) return false;
    if (builderFilter !== 'all' && proof.builderName !== builderFilter) return false;
    if (milestoneFilter !== 'all' && proof.milestoneName !== milestoneFilter) return false;
    return true;
  });

  // Sort by most recent first
  const sortedProofs = [...filteredProofs].sort((a, b) => 
    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  // Detect proof link type
  const getProofType = (url: string): 'github' | 'loom' | 'other' => {
    if (url.includes('github.com')) return 'github';
    if (url.includes('loom.com')) return 'loom';
    return 'other';
  };

  // Verify a proof
  const verifyProof = async (proof: Proof, approved: boolean) => {
    const proofId = proof.id;
    setProcessing(prev => new Set(prev).add(proofId));
    
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${proof.leadId}/verify-checkpoint`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: proof.builderId,
          milestoneId: proof.milestoneId,
          approved: approved,
          notes: notes[proofId] || ''
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify proof');
      }

      // Update verified today count
      if (approved) {
        const today = new Date().toISOString().split('T')[0];
        const newCount = verifiedToday + 1;
        setVerifiedToday(newCount);
        localStorage.setItem(`verified_${today}`, newCount.toString());
      }

      // Remove note for this proof
      setNotes(prev => {
        const newNotes = { ...prev };
        delete newNotes[proofId];
        return newNotes;
      });

      // Refresh proofs list (will remove the verified one)
      await fetchProofs();
      
    } catch (error: any) {
      console.error('Error verifying proof:', error);
      alert(error.message || 'Failed to verify proof');
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(proofId);
        return newSet;
      });
    }
  };

  // Show loading/redirect if not authorized
  if (!isAuthenticated || !user || user.role !== 'scout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">Redirecting...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">Loading proofs...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-textPrimary">
                Proof Verification
              </h1>
              <p className="text-textSecondary mt-1">
                Review and verify milestone proof submissions
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/scout-dashboard')}
                className="px-4 py-2 text-sm font-medium text-textSecondary hover:text-textPrimary border border-border rounded-md hover:bg-gray-50 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2">Pending Verifications</div>
            <div className="text-4xl font-bold text-cyan-600">{proofs.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2">Verified Today</div>
            <div className="text-4xl font-bold text-blue-600">{verifiedToday}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-card border border-border rounded-lg p-4">
          <div className="text-sm font-medium text-textSecondary mb-3">Filters</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Business Filter */}
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">By Business</label>
              <select
                value={businessFilter}
                onChange={(e) => setBusinessFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All Businesses</option>
                {uniqueBusinesses.map(business => (
                  <option key={business} value={business}>{business}</option>
                ))}
              </select>
            </div>

            {/* Builder Filter */}
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">By Builder</label>
              <select
                value={builderFilter}
                onChange={(e) => setBuilderFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All Builders</option>
                {uniqueBuilders.map(builder => (
                  <option key={builder} value={builder}>{builder}</option>
                ))}
              </select>
            </div>

            {/* Milestone Filter */}
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">By Milestone</label>
              <select
                value={milestoneFilter}
                onChange={(e) => setMilestoneFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All Milestones</option>
                {uniqueMilestones.map(milestone => (
                  <option key={milestone} value={milestone}>{milestone}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Verification Queue */}
        {sortedProofs.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-textSecondary text-lg">
              {proofs.length === 0 
                ? 'No pending proofs to review'
                : 'No proofs match the selected filters'}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedProofs.map(proof => {
              const proofType = getProofType(proof.proofLink);
              const isProcessing = processing.has(proof.id);

              return (
                <div
                  key={proof.id}
                  className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-6">
                    {/* Left: Proof Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <h3 className="text-xl font-semibold text-textPrimary">
                          {proof.businessName}
                        </h3>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {proof.neighborhood}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-textSecondary mb-1">Builder</div>
                          <div className="text-base font-medium text-textPrimary">{proof.builderName}</div>
                        </div>
                        <div>
                          <div className="text-sm text-textSecondary mb-1">Milestone</div>
                          <div className="text-base font-medium text-textPrimary">{proof.milestoneName}</div>
                        </div>
                        <div>
                          <div className="text-sm text-textSecondary mb-1">Submitted</div>
                          <div className="text-sm text-textPrimary">
                            {new Date(proof.submittedAt).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-textSecondary mb-1">Proof Type</div>
                          <div className="flex items-center gap-2">
                            {proofType === 'github' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-800 text-white">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                                GitHub
                              </span>
                            )}
                            {proofType === 'loom' && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-600 text-white">
                                <span className="font-bold">L</span>
                                Loom
                              </span>
                            )}
                            {proofType === 'other' && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                                Link
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Proof Link */}
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-border">
                        <a
                          href={proof.proofLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-cyan-600 hover:text-cyan-800 underline break-all"
                        >
                          {proof.proofLink}
                        </a>
                      </div>

                      {/* Notes Field */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-textPrimary mb-2">
                          Rejection Notes (Optional)
                        </label>
                        <textarea
                          value={notes[proof.id] || ''}
                          onChange={(e) => setNotes(prev => ({ ...prev, [proof.id]: e.target.value }))}
                          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                          rows={2}
                          placeholder="Add feedback or notes (required for rejection)..."
                        />
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex flex-col gap-3 min-w-[140px]">
                      <button
                        onClick={() => verifyProof(proof, true)}
                        disabled={isProcessing}
                        className={`px-6 py-3 text-sm font-medium text-white rounded-md transition-colors ${
                          isProcessing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {isProcessing ? 'Processing...' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => verifyProof(proof, false)}
                        disabled={isProcessing}
                        className={`px-6 py-3 text-sm font-medium text-white rounded-md transition-colors ${
                          isProcessing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {isProcessing ? 'Processing...' : '✗ Reject'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
