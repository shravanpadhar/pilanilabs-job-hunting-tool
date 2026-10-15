"use client";

import { AtsPanel, CoverLetterPanel, ReferralPanel } from "@/components/jobs/job-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Notice } from "@/components/ui/notice";

export function JobTabs({
  jobId,
  company,
  description,
  hasResume,
  hasTailored,
  coverLetter,
  links,
}: {
  jobId: string;
  company: string;
  description: React.ReactNode;
  hasResume: boolean;
  hasTailored: boolean;
  coverLetter: string | null;
  links: { employees: string; sameTeam: string; recruiters: string };
}) {
  const needResume = <Notice tone="warning" title="Upload a resume first">These tools use your resume. Upload it from the onboarding page.</Notice>;
  return (
    <Tabs defaultValue="description">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList aria-label="Job tools">
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="ats">ATS score</TabsTrigger>
          <TabsTrigger value="referral">Referral helper</TabsTrigger>
          <TabsTrigger value="cover">Cover letter</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="description">{description}</TabsContent>
      <TabsContent value="ats">{hasResume ? <AtsPanel jobId={jobId} hasTailored={hasTailored} /> : needResume}</TabsContent>
      <TabsContent value="referral">{hasResume ? <ReferralPanel jobId={jobId} company={company} links={links} /> : needResume}</TabsContent>
      <TabsContent value="cover">{hasResume ? <CoverLetterPanel jobId={jobId} initial={coverLetter} /> : needResume}</TabsContent>
    </Tabs>
  );
}
