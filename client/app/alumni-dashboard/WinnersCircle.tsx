"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useState } from "react";

interface Lead {
  id: string;
  business_name: string;
  submissionWindowOpen?: boolean;
  voting_open?: boolean;
  winnerUserId?: string | null;
  firstCompletionAt?: string | null;
  winnerAverageScore?: number | null;
  activeBuilders?: Array<{
    userId: string;
    name: string;
  }>;
}

interface WinnersCircleProps {}

const WinnersCircle: React.FC<WinnersCircleProps> = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [evaluatingProjects, setEvaluatingProjects] = useState<Lead[]>([]);
  const [recentWinners, setRecentWinners] = useState<Array<{ lead: Lead; winnerName: string }>>([]);
  const [hallOfFame, setHallOfFame] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvaluatingProjects = async () => {
      try {
        const response = await fetch(apiUrl("/api/leads"));
        if (response.ok) {
          const data = await response.json();
          
          // Filter for projects in evaluation phase (no winner yet)
          const evaluating = data.leads.filter((lead: Lead) => 
            lead.submissionWindowOpen === false &&
            (lead.winnerUserId === null || lead.winnerUserId === undefined) &&
            lead.firstCompletionAt &&
            lead.activeBuilders &&
            lead.activeBuilders.length > 0
          );
          
          // Leads with winner (for "Today's Winner" / recent announcements)
          const withWinners = data.leads.filter((lead: Lead) => 
            lead.winnerUserId && lead.activeBuilders && lead.activeBuilders.length > 0
          );
          const withWinnerDetails = withWinners.map((lead: Lead) => {
            const winnerBuilder = lead.activeBuilders!.find(b => b.userId === lead.winnerUserId);
            return { lead, winnerName: winnerBuilder?.name || 'Unknown' };
          });
          setRecentWinners(withWinnerDetails.slice(0, 5)); // Most recent 5
          setEvaluatingProjects(evaluating);
        }
      } catch (error) {
        console.error("Failed to fetch evaluating projects:", error);
      }
    };

    fetchEvaluatingProjects();
    
    // Poll every 10s
    const interval = setInterval(fetchEvaluatingProjects, 10000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchHallOfFame = async () => {
      try {
        const response = await fetch(apiUrl('/api/alumni'));
        if (response.ok) {
          const data = await response.json();
          
          // Extract alumni array from response
          const alumni = data.alumni || [];
          
          // Sort by completed builds (descending) and quality rating
          const topBuilders = alumni
            .filter((a: any) => a.completedBuilds && a.completedBuilds.length > 0)
            .sort((a: any, b: any) => {
              if (b.completedBuilds.length !== a.completedBuilds.length) {
                return b.completedBuilds.length - a.completedBuilds.length;
              }
              return b.qualityRating - a.qualityRating;
            })
            .slice(0, 10); // Top 10
        
          setHallOfFame(topBuilders);
        }
      } catch (error) {
        console.error('Failed to fetch hall of fame:', error);
      }
    };
    
    fetchHallOfFame();
  }, []);

  // Format countdown time
  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return "Reveal Pending";
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${hours}h ${minutes}m`;
  };

  // Calculate time until reveal (48 hours after first completion)
  const getTimeRemaining = (firstCompletionAt: string | null | undefined): number => {
    if (!firstCompletionAt) return 0;
    
    const completionTime = new Date(firstCompletionAt).getTime();
    const revealTime = completionTime + (48 * 60 * 60 * 1000); // 48 hours after first completion
    const now = Date.now();
    
    return revealTime - now;
  };

  // Countdown component for each project
  const ProjectCountdown = ({ lead }: { lead: Lead }) => {
    const [timeRemaining, setTimeRemaining] = useState<number>(0);

    useEffect(() => {
      const updateTimer = () => {
        const remaining = getTimeRemaining(lead.firstCompletionAt);
        setTimeRemaining(remaining);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);

      return () => clearInterval(interval);
    }, [lead.firstCompletionAt]);

    const getColorClass = (ms: number): string => {
      const hours = ms / (1000 * 60 * 60);
      if (hours > 12) return "text-green-600";
      if (hours > 6) return "text-yellow-600";
      return "text-orange-600";
    };

    return (
      <div className="text-sm">
        <span className={`font-semibold ${getColorClass(timeRemaining)}`}>
          {formatCountdown(timeRemaining)}
        </span>
      </div>
    );
  };

  // Get number of finalists
  const getFinalistCount = (lead: Lead): number => {
    return lead.activeBuilders?.length || 0;
  };

  return (
    <>
      {/* Collapsed button */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 
            shadow-lg flex items-center justify-center text-white hover:scale-110 
            transition-transform relative"
        >
          <span className="text-xl">👑</span>
          {evaluatingProjects.length > 0 && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-orange-500 rounded-full 
              text-xs flex items-center justify-center animate-pulse text-white font-semibold">
              {evaluatingProjects.length}
            </span>
          )}
        </button>
      </div>
      
      {/* Expanded panel */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-30 z-40"
            onClick={() => setIsExpanded(false)}
          />
          
          {/* Panel */}
          <div className="fixed left-0 top-0 h-full w-80 bg-white shadow-2xl z-50 
            transform transition-transform duration-300 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-br from-green-500 to-emerald-600 text-white p-6 shadow-lg z-10">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span>👑</span>
                  Winners Circle
                </h2>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-white hover:text-gray-200 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-green-100">
                Projects awaiting winner selection
              </p>
            </div>

            {/* Project List */}
            <div className="p-4 space-y-4">
              {evaluatingProjects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">👑</div>
                  <div className="text-sm">No projects in evaluation</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Check back when sprints complete
                  </div>
                </div>
              ) : (
                evaluatingProjects.map((project) => {
                  const status = project.voting_open
                    ? "Voting open"
                    : "Pending winner announcement";
                  const statusClass = project.voting_open
                    ? "bg-cyan-100 text-cyan-700"
                    : "bg-orange-100 text-orange-700";
                  return (
                    <div
                      key={project.id}
                      className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-green-300 
                        transition-colors shadow-sm"
                    >
                      <div className="font-semibold text-gray-900 mb-2">
                        {project.business_name}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-md font-medium ${statusClass}`}>
                          {status}
                        </span>
                        {!project.voting_open && (
                          <>
                            <div className="text-xs text-gray-500">
                              <ProjectCountdown lead={project} />
                            </div>
                            <span className="text-xs text-gray-600">
                              {getFinalistCount(project)} finalist{getFinalistCount(project) !== 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Today's Winner / Just Announced */}
              {recentWinners.length > 0 && (
                <div className="mt-6 pt-6 border-t-2 border-green-200">
                  <h4 className="text-lg font-bold text-green-800 mb-4 flex items-center gap-2">
                    <span>🏆</span>
                    Today&apos;s Winner
                  </h4>
                  <div className="space-y-3">
                    {recentWinners.map(({ lead, winnerName }) => (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">{lead.business_name}</div>
                          <div className="text-sm text-green-700 font-medium">
                            Winner: {winnerName}
                            {lead?.winnerAverageScore != null && (
                              <span className="text-gray-500 ml-1">(avg: {lead.winnerAverageScore})</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hall of Fame Section */}
              <div className="mt-6 pt-6 border-t border-amber-300">
                <h4 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Hall of Fame
                </h4>
                
                <div className="space-y-3">
                  {hallOfFame.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No builders yet
                    </div>
                  ) : (
                    hallOfFame.map((builder, index) => (
                      <div
                        key={builder.id}
                        className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border border-amber-200 hover:border-amber-400 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Rank Badge */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            index === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-900' :
                            index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-700' :
                            index === 2 ? 'bg-gradient-to-br from-orange-400 to-amber-600 text-amber-900' :
                            'bg-slate-200 text-slate-600'
                          }`}>
                            {index + 1}
                          </div>
                          
                          {/* Builder Info */}
                          <div>
                            <div className="font-semibold text-slate-800">{builder.name}</div>
                            <div className="text-xs text-slate-600">{builder.specialty}</div>
                          </div>
                        </div>
                        
                        {/* Stats */}
                        <div className="text-right">
                          <div className="text-lg font-bold text-amber-600">
                            {builder.completedBuilds.length} {builder.completedBuilds.length === 1 ? 'Build' : 'Builds'}
                          </div>
                          <div className="text-xs text-slate-500">
                            Avg Quality: {builder.qualityRating}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default WinnersCircle;
