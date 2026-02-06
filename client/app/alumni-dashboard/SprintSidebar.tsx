"use client";

import { useEffect, useState } from "react";

interface Builder {
  id?: string;
  userId?: string;
  name: string;
  qualityScore?: number;
  qualityRating?: number;
  checkpointSpeed?: string; // e.g., "2.5h avg"
  checkpointsCompleted?: number;
  projectName?: string;
  projectId?: string;
  specialty?: string;
}

interface Submission {
  id: string;
  builderName: string;
  projectName: string;
  proofType: string; // e.g., "Architecture", "Design", "MVP"
  proofUrl: string;
  submittedAt: string; // ISO timestamp
  timeAgo: string; // e.g., "5m ago"
}

interface LeaderboardData {
  builders: Builder[];
}

interface RecentSubmissionsData {
  submissions: Submission[];
}

interface ActivityEvent {
  id: string;
  builderName: string;
  action: string;
  timestamp: string;
  timeAgo: string;
  milestone?: string;
  specialty?: string;
  isAdminAction?: boolean;
  businessName?: string;
}

interface AuditLogEntry {
  action: string;
  performedBy: string;
  timestamp: string;
  details: string;
  reason?: string;
}

// Helper function to format time ago
const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const submitted = new Date(timestamp);
  const diffMs = now.getTime() - submitted.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

export default function SprintSidebar() {
  const [leaderboard, setLeaderboard] = useState<Builder[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [auditLogEntries, setAuditLogEntries] = useState<ActivityEvent[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTopBuildersCollapsed, setIsTopBuildersCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Fetch leaderboard data - focus on builders on final milestone
  const fetchLeaderboard = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/leads");
      if (!response.ok) throw new Error("Failed to fetch leads");
      const data = await response.json();
      
      // Extract all active builders with their project info
      const allBuilders = data.leads
        .flatMap((lead: any) => 
          (lead.activeBuilders || []).map((builder: any) => ({
            ...builder,
            projectName: lead.business_name,
            projectId: lead.id,
            checkpointsCompleted: builder.checkpointsCompleted || 0,
            qualityRating: builder.qualityRating || builder.scoutReview?.qualityScore || 0,
            specialty: builder.specialty || "Full-Stack"
          }))
        );
      
      // Filter builders on final milestone (3 checkpoints completed, working on 4th)
      const buildersOnFinalMilestone = allBuilders
        .filter((builder: any) => builder.checkpointsCompleted === 3)
        .sort((a: any, b: any) => b.qualityRating - a.qualityRating)
        .slice(0, 5);
      
      setLeaderboard(buildersOnFinalMilestone);
      setLoadingLeaderboard(false);
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      setError("Failed to load leaderboard");
      setLoadingLeaderboard(false);
    }
  };

  // Fetch audit log entries
  const fetchAuditLog = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/leads');
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      
      const allAuditEntries: ActivityEvent[] = data.leads
        .filter((l: any) => l.auditLog && l.auditLog.length > 0)
        .flatMap((l: any) => 
          l.auditLog.map((entry: AuditLogEntry) => ({
            id: `${l.id}-${entry.timestamp}`,
            builderName: entry.performedBy,
            action: entry.details,
            timestamp: entry.timestamp,
            timeAgo: formatTimeAgo(entry.timestamp),
            isAdminAction: true,
            businessName: l.business_name
          }))
        )
        .sort((a: ActivityEvent, b: ActivityEvent) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 10);
      
      setAuditLogEntries(allAuditEntries);
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
    }
  };

  // Mock activity events for Live Activity Feed
  const getMockActivityEvents = (): ActivityEvent[] => {
    const now = Date.now();
    const mockEvents: ActivityEvent[] = [
      {
        id: "1",
        builderName: "Alex Chen",
        action: "just verified Milestone 2: Core Logic",
        timestamp: new Date(now - 2 * 60000).toISOString(),
        timeAgo: "2m ago",
        milestone: "Architecture",
        specialty: "Full-Stack",
      },
      {
        id: "2",
        builderName: "Jordan Taylor",
        action: "completed Architecture phase",
        timestamp: new Date(now - 15 * 60000).toISOString(),
        timeAgo: "15m ago",
        milestone: "Architecture",
        specialty: "Backend",
      },
      {
        id: "3",
        builderName: "Priya Sharma",
        action: "submitted API Integration proof",
        timestamp: new Date(now - 32 * 60000).toISOString(),
        timeAgo: "32m ago",
        milestone: "API Integration",
        specialty: "Full-Stack",
      },
      {
        id: "4",
        builderName: "David Kim",
        action: "joined Sprint: DUMBO Bistro",
        timestamp: new Date(now - 45 * 60000).toISOString(),
        timeAgo: "45m ago",
        milestone: "Starting",
        specialty: "Frontend",
      },
      {
        id: "5",
        builderName: "Sarah Mitchell",
        action: "earned Quality Badge for Demo Ready",
        timestamp: new Date(now - 60 * 60000).toISOString(),
        timeAgo: "1h ago",
        milestone: "Demo Ready",
        specialty: "Full-Stack",
      },
    ];
    
    // Combine mock events with audit log entries, sorted by timestamp
    const allEvents = [...mockEvents, ...auditLogEntries].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return allEvents.slice(0, 10);
  };

  // Fetch recent submissions
  const fetchSubmissions = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/recent-submissions");
      if (!response.ok) throw new Error("Failed to fetch submissions");
      const data: RecentSubmissionsData = await response.json();
      // Format time ago for each submission
      const formattedSubmissions = (data.submissions || []).map((sub) => ({
        ...sub,
        timeAgo: formatTimeAgo(sub.submittedAt),
      }));
      setSubmissions(formattedSubmissions);
      setLoadingSubmissions(false);
    } catch (err) {
      console.error("Error fetching submissions:", err);
      // Don't set error - we'll show Live Activity Feed instead
      setLoadingSubmissions(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLeaderboard();
    fetchSubmissions();
    fetchAuditLog();
  }, []);

  // Poll for updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeaderboard();
      fetchSubmissions();
      fetchAuditLog();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Get podium emoji for top 3
  const getPodiumEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  return (
    <>
      {/* Slide-out Toggle Button (when closed) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-green-600 text-white p-3 rounded-l-lg shadow-lg hover:bg-green-700 transition-all z-40 flex items-center gap-2"
          title="Open Activity Panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-xs font-semibold">Activity</span>
        </button>
      )}

      {/* Sidebar Panel */}
      <div 
        className={`fixed right-0 top-[120px] h-[calc(100vh-120px)] w-[320px] bg-white border-l border-border shadow-lg overflow-y-auto z-40 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close Button */}
        <div className="sticky top-0 bg-white border-b border-border p-2 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold text-gray-600">Live Sprint Activity</h3>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Close Activity Panel"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
        {/* Platform Leaderboard Section */}
        <div>
          <div 
            className="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-50 p-2 rounded -m-2"
            onClick={() => setIsTopBuildersCollapsed(!isTopBuildersCollapsed)}
          >
            <h2 className="text-lg font-semibold text-textPrimary flex items-center gap-2">
              <span className="text-green-600">Top Builders</span>
              <span className="text-xs text-textTertiary font-normal">(Quality Score)</span>
            </h2>
            <svg 
              className={`w-5 h-5 text-gray-600 transition-transform ${isTopBuildersCollapsed ? '' : 'rotate-180'}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          
          {!isTopBuildersCollapsed && (
            loadingLeaderboard ? (
              <div className="text-sm text-textSecondary text-center py-4">Loading...</div>
            ) : error ? (
              <div className="text-sm text-red-600 text-center py-4">{error}</div>
            ) : leaderboard.length === 0 ? (
              <div className="text-sm text-textSecondary text-center py-4">No builders yet</div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((builder, index) => {
                const rank = index + 1;
                const podiumEmoji = getPodiumEmoji(rank);
                const isOnFinalMilestone = builder.checkpointsCompleted === 3;
                const qualityValue = builder.qualityRating || builder.qualityScore || 0;
                
                return (
                  <div
                    key={builder.id || builder.userId}
                    className={`relative group p-3 rounded-lg border transition-all ${
                      isOnFinalMilestone
                        ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-400 shadow-lg shadow-green-200/50"
                        : rank <= 3
                        ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
                        : "bg-gray-50 border-border hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {isOnFinalMilestone && (
                          <span className="text-lg">🔥</span>
                        )}
                        {podiumEmoji && !isOnFinalMilestone && (
                          <span className="text-lg">{podiumEmoji}</span>
                        )}
                        <span className="text-xs font-medium text-textSecondary">
                          #{rank}
                        </span>
                        <span className="text-sm font-semibold text-textPrimary">
                          {builder.name}
                        </span>
                      </div>
                    </div>
                    {isOnFinalMilestone && builder.projectName && (
                      <div className="text-xs text-green-700 font-medium mb-1">
                        📦 {builder.projectName}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                          Quality: {qualityValue}
                        </span>
                      </div>
                      {builder.checkpointSpeed && (
                        <span className="text-xs text-textSecondary bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                          {builder.checkpointSpeed}
                        </span>
                      )}
                    </div>
                    
                    {/* Tooltip */}
                    <div className="absolute right-full mr-2 top-0 opacity-0 group-hover:opacity-100 
                      pointer-events-none transition-opacity bg-gray-900 text-white text-xs p-3 
                      rounded-lg shadow-xl z-50 min-w-[200px] whitespace-normal">
                      <div className="font-semibold mb-1">{builder.name}</div>
                      <div className="space-y-1">
                        <div>Progress: {builder.checkpointsCompleted || 0}/4 checkpoints</div>
                        {builder.projectName && (
                          <div>Project: {builder.projectName}</div>
                        )}
                        <div>Next: Milestone 4: Demo Ready</div>
                        <div>Quality: {qualityValue}/100</div>
                        {builder.specialty && (
                          <div>Specialty: {builder.specialty}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        </div>

        {/* Divider */}
        <div className="border-t border-border"></div>

        {/* Live Activity Feed */}
        <div>
          <h2 className="text-lg font-semibold text-textPrimary mb-4 flex items-center gap-2">
            <span className="text-green-600">Live Activity Feed</span>
            <span className="inline-flex items-center justify-center w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </h2>
          
          {loadingSubmissions ? (
            <div className="text-sm text-textSecondary text-center py-4">Loading...</div>
          ) : (
            <div className="space-y-2">
              {getMockActivityEvents().map((event, index) => (
                <div
                  key={event.id}
                  className={`relative group flex items-start gap-2 p-2 rounded-lg border transition-all animate-fade-in ${
                    event.isAdminAction 
                      ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' 
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-pulse ${
                    event.isAdminAction ? 'bg-orange-500' : 'bg-green-500'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-textPrimary">
                      <span className={`font-semibold ${
                        event.isAdminAction ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {event.builderName}
                        {event.isAdminAction && ' (Scout)'}
                      </span>{" "}
                      <span className="text-textSecondary">{event.action}</span>
                    </p>
                    {event.businessName && (
                      <p className="text-xs text-orange-600 mt-0.5 font-medium">{event.businessName}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{event.timeAgo}</p>
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute right-full mr-2 top-0 opacity-0 group-hover:opacity-100 
                    pointer-events-none transition-opacity bg-gray-900 text-white text-xs p-3 
                    rounded-lg shadow-xl whitespace-normal z-50 min-w-[200px]">
                    <div className="font-semibold mb-1">Full Details</div>
                    <div className="space-y-1">
                      <div>Time: {new Date(event.timestamp).toLocaleString()}</div>
                      {event.milestone && (
                        <div>Milestone: {event.milestone}</div>
                      )}
                      {event.specialty && (
                        <div>Specialty: {event.specialty}</div>
                      )}
                      <div>Builder: {event.builderName}</div>
                      <div>Action: {event.action}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
