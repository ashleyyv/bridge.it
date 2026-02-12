"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import { useAuth } from "../context/AuthContext";

interface Build {
  id: string;
  lead_id: string;
  builder_user_id: string;
  builder_name: string;
  business_name: string;
  deployed_url: string;
  voteCount?: number;
  averageScore?: number;
  hasVoted?: boolean;
}

interface VotingLead {
  lead_id: string;
  business_name: string;
  builds: Build[];
  totalVotes: number;
}

export default function VotingPanel() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<VotingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [votedBuilds, setVotedBuilds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const voterId = user?.email || "anonymous";
    const fetchVoting = async () => {
      try {
        const res = await fetch(apiUrl(`/api/voting/leads?voter_id=${encodeURIComponent(voterId)}`));
        if (res.ok) {
          const data = await res.json();
          setLeads(data.leads || []);
        }
      } catch (err) {
        console.error("Failed to fetch voting leads:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchVoting();
    const interval = setInterval(fetchVoting, 15000);
    return () => clearInterval(interval);
  }, [user?.email]);

  const voterId = user?.email || "anonymous";

  const handleVote = async (buildId: string) => {
    const score = scores[buildId];
    if (!score || score < 1 || score > 5) return;

    setSubmitting((s) => ({ ...s, [buildId]: true }));
    try {
      const res = await fetch(apiUrl(`/api/builds/${buildId}/vote`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voter_id: voterId, score }),
      });
      if (res.ok) {
        setVotedBuilds((prev) => new Set([...prev, buildId]));
        setScores((s) => {
          const next = { ...s };
          delete next[buildId];
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to submit vote:", err);
    } finally {
      setSubmitting((s) => ({ ...s, [buildId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-textSecondary">Loading voting...</div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-8 text-textSecondary">
        <p className="font-medium">No projects open for voting right now.</p>
        <p className="text-sm mt-1">Voting appears when a scout opens voting for a project (at least 2 builders with all milestones complete).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-textSecondary">
        Vote on each build (1–5). Each build uses the builder’s final submission link. At least 10 votes required to determine a winner.
      </p>

      {leads.map((lead) => (
        <div
          key={lead.lead_id}
          className="bg-white border border-border rounded-lg p-4 shadow-sm"
        >
          <h3 className="font-semibold text-textPrimary mb-2">{lead.business_name}</h3>
          <p className="text-xs text-textSecondary mb-3">Votes so far: {lead.totalVotes}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {lead.builds.map((build) => {
              const hasVoted = votedBuilds.has(build.id) || !!build.hasVoted;
              const score = scores[build.id] ?? 0;

              return (
                <div
                  key={build.id}
                  className="p-3 border border-gray-200 rounded-lg"
                >
                  <div className="font-medium text-sm text-textPrimary">{build.builder_name}</div>
                  {build.deployed_url ? (
                    <a
                      href={build.deployed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-600 hover:underline truncate block mt-1"
                      title={build.deployed_url}
                    >
                      Final submission →
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">No final submission link</span>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-textSecondary">Score (1-5):</label>
                    <select
                      value={score}
                      onChange={(e) =>
                        setScores((s) => ({ ...s, [build.id]: parseInt(e.target.value, 10) }))
                      }
                      disabled={hasVoted}
                      className="border border-border rounded px-2 py-1 text-sm"
                    >
                      <option value={0}>Select</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    {!hasVoted ? (
                      <button
                        onClick={() => handleVote(build.id)}
                        disabled={!score || submitting[build.id]}
                        className="px-2 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {submitting[build.id] ? "Submitting..." : "Vote"}
                      </button>
                    ) : (
                      <span className="text-xs text-green-600 font-medium">Voted</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
