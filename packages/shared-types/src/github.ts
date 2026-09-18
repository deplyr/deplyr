export interface GithubRepoSummary {
  fullName: string; // "owner/repo"
  defaultBranch: string;
  private: boolean;
  updatedAt: string;
}

export interface GithubBranchSummary {
  name: string;
}
