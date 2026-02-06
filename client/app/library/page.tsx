"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface CompletedBuild {
  id: string;
  leadId: string;
  businessName: string;
  neighborhood: string;
  borough: string;
  techStack: string[];
  completedAt: string;
  builderName: string;
  builderId: string;
  quality: number;
  repoUrl: string;
  description: string;
  isPioneer: boolean;
}

export default function LibraryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [builds, setBuilds] = useState<CompletedBuild[]>([]);
  const [filter, setFilter] = useState<"all" | "my-builds" | "pioneers">("all");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    fetchBuilds();
  }, []);

  const fetchBuilds = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/library");
      if (response.ok) {
        const data = await response.json();
        setBuilds(data.builds);
      }
    } catch (error) {
      console.error("Failed to fetch library:", error);
    }
  };

  const filteredBuilds = builds.filter(build => {
    if (filter === "my-builds") return build.builderId === "alumni_ashley";
    if (filter === "pioneers") return build.isPioneer;
    return true;
  });

  const myBuildsCount = builds.filter(b => b.builderId === "alumni_ashley").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Blueprint Library</h1>
            <p className="text-emerald-300">Explore completed builds and fork proven solutions</p>
          </div>
          <button
            onClick={() => router.push("/alumni-dashboard")}
            className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Filter Bar */}
        <div className="mt-6 flex items-center gap-4 bg-slate-800 p-4 rounded-lg">
          <span className="text-sm font-medium text-slate-300">Filter:</span>
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "all" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            All Builds ({builds.length})
          </button>
          <button
            onClick={() => setFilter("my-builds")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "my-builds" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            My Builds ({myBuildsCount})
          </button>
          <button
            onClick={() => setFilter("pioneers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "pioneers" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Pioneer Projects
          </button>
        </div>
      </div>

      {/* Build Cards Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBuilds.map((build) => (
          <div
            key={build.id}
            id={`build-${build.leadId}`}
            className="bg-slate-800 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all border border-slate-700 hover:border-emerald-500"
          >
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-slate-700 to-slate-800">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-xl font-bold text-white">{build.businessName}</h3>
                {build.isPioneer && (
                  <span className="px-2 py-1 bg-amber-500 text-amber-900 text-xs font-semibold rounded-full flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Pioneer
                  </span>
                )}
              </div>
              <p className="text-sm text-emerald-300">{build.neighborhood}, {build.borough}</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-slate-400 mb-1">Built by</div>
                <div className="font-medium text-white">{build.builderName}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Tech Stack</div>
                <div className="flex flex-wrap gap-2">
                  {build.techStack.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-slate-700 text-emerald-300 text-xs rounded"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1">Quality Score</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-green-400"
                      style={{ width: `${build.quality}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-emerald-400">{build.quality}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <a
                  href={build.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 bg-slate-700 text-white text-center rounded hover:bg-slate-600 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                  </svg>
                  View Repo
                </a>
                <button
                  onClick={() => window.open(build.repoUrl + "/fork", "_blank")}
                  className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors text-sm font-medium"
                >
                  Fork
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredBuilds.length === 0 && (
        <div className="max-w-7xl mx-auto text-center py-16">
          <div className="text-slate-400 text-lg">No builds found for this filter</div>
        </div>
      )}
    </div>
  );
}
