"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

interface CheckpointStatus {
  status: 'submitted' | 'approved' | 'rejected';
  proofLink?: string;
  submittedAt?: string;
  verifiedAt?: string;
  notes?: string;
}

interface ActiveBuilder {
  userId: string;
  name?: string;
  joinedAt: string;
  checkpointsCompleted: number;
  proofLinks?: string[];
  checkpointStatuses?: {
    [key: string]: CheckpointStatus;
  };
  scoutReview?: {
    qualityScore?: number;
    scoutReviewScore?: number;
    reviewNotes?: string;
    reviewedAt?: string;
  };
}

interface Milestone {
  id: number;
  name: string;
  description: string;
  completionWeight: number;
}

interface Lead {
  id: string;
  business_name: string;
  location: {
    neighborhood: string;
    borough: string;
  };
  activeBuilders?: ActiveBuilder[];
  milestones?: Milestone[];
  firstCompletionAt?: string;
  winnerUserId?: string | null;
}

interface FinalistScores {
  [userId: string]: {
    qualityScore: number;
    paceScore: number;
    scoutReviewScore: number;
    totalScore: number;
  };
}

export default function ScoutAuditPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<FinalistScores>({});
  const [selectedWinner, setSelectedWinner] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Route protection: Only Scouts can access
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'scout') {
      router.push('/');
    }
  }, [isAuthenticated, user, router]);

  // Fetch leads with completed submissions
  const fetchLeads = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/leads');
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      
      // Filter leads with multiple finalists (checkpointsCompleted >= 4)
      const leadsWithFinalists = data.leads.filter((lead: Lead) => {
        const finalists = lead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
        return finalists.length >= 2; // Multiple finalists
      });
      
      setLeads(leadsWithFinalists);
      
      // Auto-select first lead if available
      if (leadsWithFinalists.length > 0 && !selectedLeadId) {
        setSelectedLeadId(leadsWithFinalists[0].id);
        initializeScores(leadsWithFinalists[0]);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === 'scout') {
      fetchLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const initializeScores = (lead: Lead) => {
    const finalists = lead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
    const initialScores: FinalistScores = {};
    
    finalists.forEach(builder => {
      const existingReview = builder.scoutReview;
      
      // Calculate pace score
      const paceScore = calculatePaceScore(lead, builder);
      
      initialScores[builder.userId] = {
        qualityScore: existingReview?.qualityScore ?? 0,
        paceScore: paceScore,
        scoutReviewScore: existingReview?.scoutReviewScore ?? existingReview?.qualityScore ?? 0,
        totalScore: 0
      };
      
      // Calculate total score
      updateTotalScore(builder.userId, initialScores[builder.userId]);
    });
    
    setScores(initialScores);
    
    // Set selected winner if already determined
    if (lead.winnerUserId) {
      setSelectedWinner(lead.winnerUserId);
    }
  };

  const calculatePaceScore = (lead: Lead, builder: ActiveBuilder): number => {
    if (!lead.firstCompletionAt) return 100;
    
    const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
    
    // Find the last checkpoint completion time
    let lastCompletionTime = new Date(builder.joinedAt).getTime();
    if (builder.checkpointStatuses) {
      const checkpointKeys = Object.keys(builder.checkpointStatuses).map(k => parseInt(k)).sort((a, b) => b - a);
      if (checkpointKeys.length > 0) {
        const lastCheckpoint = builder.checkpointStatuses[checkpointKeys[0].toString()];
        if (lastCheckpoint.verifiedAt) {
          lastCompletionTime = new Date(lastCheckpoint.verifiedAt).getTime();
        } else if (lastCheckpoint.submittedAt) {
          lastCompletionTime = new Date(lastCheckpoint.submittedAt).getTime();
        }
      }
    }
    
    const timeDifference = lastCompletionTime - firstCompletionTime;
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    
    // Pace score: 100 if completed at same time, decreases by 2 points per hour after first
    const paceScore = Math.max(4, 100 - (Math.abs(hoursDifference) * 2));
    return Math.round(paceScore * 100) / 100;
  };

  const updateTotalScore = (userId: string, scoreData: { qualityScore: number; paceScore: number; scoutReviewScore: number }) => {
    const totalScore = (scoreData.qualityScore * 0.5) + (scoreData.paceScore * 0.3) + (scoreData.scoutReviewScore * 0.2);
    setScores(prev => ({
      ...prev,
      [userId]: {
        ...scoreData,
        totalScore: Math.round(totalScore * 100) / 100
      }
    }));
  };

  const handleScoreChange = (userId: string, field: 'qualityScore' | 'scoutReviewScore', value: number) => {
    const currentScore = scores[userId] || { qualityScore: 0, paceScore: 0, scoutReviewScore: 0, totalScore: 0 };
    const updatedScore = {
      ...currentScore,
      [field]: value
    };
    updateTotalScore(userId, updatedScore);
  };

  const handleLeadChange = (leadId: string) => {
    setSelectedLeadId(leadId);
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      initializeScores(lead);
      setSelectedWinner(lead.winnerUserId || '');
    }
  };

  const handleConfirmWinner = async () => {
    if (!selectedWinner || !selectedLeadId) {
      alert('Please select a winner first');
      return;
    }

    // Check if selected winner matches highest scorer
    const selectedScore = scores[selectedWinner]?.totalScore || 0;
    const highestScorer = Object.entries(scores).reduce((prev, [userId, scoreData]) => 
      scoreData.totalScore > prev.scoreData.totalScore ? { userId, scoreData } : prev,
      { userId: selectedWinner, scoreData: scores[selectedWinner] || { totalScore: 0 } }
    );

    if (highestScorer.userId !== selectedWinner) {
      const confirm = window.confirm(
        `Warning: The selected winner (${selectedScore.toFixed(1)}) does not have the highest total score. ` +
        `Highest scorer is ${highestScorer.userId} with ${highestScorer.scoreData.totalScore.toFixed(1)}. ` +
        `Do you want to proceed?`
      );
      if (!confirm) return;
    }

    setSaving(true);
    try {
      // Submit scout reviews for all finalists
      const selectedLead = leads.find(l => l.id === selectedLeadId);
      if (!selectedLead) return;

      const finalists = selectedLead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
      
      // Submit reviews for all finalists
      for (const builder of finalists) {
        const scoreData = scores[builder.userId];
        if (!scoreData) continue;

        await fetch(`http://localhost:3001/api/leads/${selectedLeadId}/scout-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: builder.userId,
            qualityScore: scoreData.qualityScore,
            scoutReviewScore: scoreData.scoutReviewScore,
            reviewNotes: builder.scoutReview?.reviewNotes || ''
          })
        });
      }

      // Calculate winner (this will set winnerUserId based on scores)
      const calculateResponse = await fetch(`http://localhost:3001/api/leads/${selectedLeadId}/calculate-winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!calculateResponse.ok) {
        const error = await calculateResponse.json();
        throw new Error(error.error || 'Failed to calculate winner');
      }

      // Refresh leads
      await fetchLeads();
      alert('Winner confirmed successfully!');
    } catch (error: any) {
      console.error('Error confirming winner:', error);
      alert(error.message || 'Failed to confirm winner');
    } finally {
      setSaving(false);
    }
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);
  const finalists = selectedLead?.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
  const milestones = selectedLead?.milestones || [
    { id: 1, name: 'Architecture', description: 'System design & database schema', completionWeight: 0.25 },
    { id: 2, name: 'Core Logic', description: 'Business logic implementation', completionWeight: 0.25 },
    { id: 3, name: 'API Integration', description: 'External services & endpoints', completionWeight: 0.25 },
    { id: 4, name: 'Demo Ready', description: 'UI polish & deployment', completionWeight: 0.25 }
  ];

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
        <div className="text-textPrimary text-xl font-light">Loading verification data...</div>
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
                Verification Desk
              </h1>
              <p className="text-textSecondary mt-1">
                Technical deliverable verification and finalist scorecard comparison
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
        {/* Lead Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-textPrimary mb-2">
            Select Project
          </label>
          <select
            value={selectedLeadId}
            onChange={(e) => handleLeadChange(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Select a project...</option>
            {leads.map(lead => {
              const leadFinalists = lead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
              return (
                <option key={lead.id} value={lead.id}>
                  {lead.business_name} ({lead.location.neighborhood}) - {leadFinalists.length} finalists
                </option>
              );
            })}
          </select>
        </div>

        {!selectedLead ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-textSecondary text-lg">
              {leads.length === 0 
                ? 'No projects with multiple finalists available for verification'
                : 'Please select a project to view verification details'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel: Technical Deliverables Checklist */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Technical Deliverables Checklist
              </h2>
              
              <div className="space-y-4">
                {milestones.map(milestone => (
                  <div key={milestone.id} className="border border-slate-700 rounded-lg p-4 bg-slate-900">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg font-medium text-white">
                        Milestone {milestone.id}: {milestone.name}
                      </span>
                      <span className="text-green-400 font-bold">✓</span>
                    </div>
                    <p className="text-sm text-slate-300 mb-3">{milestone.description}</p>
                    
                    {/* Show deliverables for each finalist */}
                    <div className="space-y-2">
                      {finalists.map(builder => {
                        const checkpoint = builder.checkpointStatuses?.[milestone.id.toString()];
                        const status = checkpoint?.status || 'pending';
                        const proofLink = checkpoint?.proofLink || '';
                        
                        return (
                          <div key={builder.userId} className="bg-gray-50 rounded p-2 text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-textPrimary">
                                {builder.name || builder.userId}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${
                                status === 'approved' ? 'bg-green-100 text-green-700' :
                                status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {status === 'approved' ? 'Approved' :
                                 status === 'submitted' ? 'Submitted' : 'Pending'}
                              </span>
                            </div>
                            {proofLink && (
                              <a
                                href={proofLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-600 hover:text-cyan-800 underline text-xs break-all"
                              >
                                {proofLink.includes('github.com') ? '🔗 GitHub' : 
                                 proofLink.includes('loom.com') ? '🎥 Loom' : '🔗 Link'}
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Panel: Finalist Scorecard */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Finalist Scorecard Comparison
              </h2>
              
              {finalists.length === 0 ? (
                <div className="text-slate-400 text-center py-8">
                  No finalists available
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-2 text-sm font-semibold text-white">Metric</th>
                          {finalists.map(builder => (
                            <th key={builder.userId} className="text-center py-3 px-2 text-sm font-semibold text-white min-w-[120px]">
                              {builder.name || builder.userId}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Quality Score Row */}
                        <tr className="border-b border-slate-700">
                          <td className="py-3 px-2 text-sm font-medium text-slate-300">Quality Score</td>
                          {finalists.map(builder => (
                            <td key={builder.userId} className="py-3 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={scores[builder.userId]?.qualityScore || 0}
                                onChange={(e) => handleScoreChange(builder.userId, 'qualityScore', parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 border border-slate-600 rounded bg-slate-900 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-500"
                              />
                            </td>
                          ))}
                        </tr>
                        
                        {/* Pace Score Row */}
                        <tr className="border-b border-slate-700 bg-slate-900">
                          <td className="py-3 px-2 text-sm font-medium text-slate-300">Pace Score</td>
                          {finalists.map(builder => (
                            <td key={builder.userId} className="py-3 px-2 text-center">
                              <span className="text-sm font-medium text-white">
                                {scores[builder.userId]?.paceScore.toFixed(1) || '0.0'}
                              </span>
                              <span className="text-xs text-slate-400 ml-1">(Auto)</span>
                            </td>
                          ))}
                        </tr>
                        
                        {/* Scout Review Row */}
                        <tr className="border-b border-slate-700">
                          <td className="py-3 px-2 text-sm font-medium text-slate-300">Scout Review</td>
                          {finalists.map(builder => (
                            <td key={builder.userId} className="py-3 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={scores[builder.userId]?.scoutReviewScore || 0}
                                onChange={(e) => handleScoreChange(builder.userId, 'scoutReviewScore', parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 border border-slate-600 rounded bg-slate-900 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-500"
                              />
                            </td>
                          ))}
                        </tr>
                        
                        {/* Total Score Row */}
                        <tr className="border-b-2 border-cyan-500 bg-cyan-900/20">
                          <td className="py-3 px-2 text-sm font-bold text-white">Total Score</td>
                          {finalists.map(builder => {
                            const totalScore = scores[builder.userId]?.totalScore || 0;
                            const isHighest = Object.values(scores).every(s => 
                              !s || s.totalScore <= totalScore
                            );
                            return (
                              <td key={builder.userId} className="py-3 px-2 text-center">
                                <span className={`text-lg font-bold ${isHighest && totalScore > 0 ? 'text-green-400' : 'text-cyan-400'}`}>
                                  {totalScore.toFixed(1)}
                                </span>
                                {isHighest && totalScore > 0 && (
                                  <span className="text-xs text-green-400 ml-1">(Highest)</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        
                        {/* Winner Selection Row */}
                        <tr className="border-b border-slate-700">
                          <td className="py-3 px-2 text-sm font-medium text-slate-300">Winner</td>
                          {finalists.map(builder => (
                            <td key={builder.userId} className="py-3 px-2 text-center">
                              <input
                                type="radio"
                                name="winner"
                                value={builder.userId}
                                checked={selectedWinner === builder.userId}
                                onChange={(e) => setSelectedWinner(e.target.value)}
                                className="w-4 h-4 text-cyan-600 focus:ring-cyan-500"
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">
                      Scoring Formula: (Quality × 0.5) + (Pace × 0.3) + (Scout Review × 0.2)
                    </div>
                    <button
                      onClick={handleConfirmWinner}
                      disabled={!selectedWinner || saving}
                      className={`w-full px-6 py-3 text-sm font-medium text-white rounded-md transition-colors ${
                        !selectedWinner || saving
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-cyan-600 hover:bg-cyan-700'
                      }`}
                    >
                      {saving ? 'Confirming...' : 'Confirm Winner'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
