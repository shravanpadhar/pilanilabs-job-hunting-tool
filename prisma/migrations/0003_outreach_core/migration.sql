-- CreateEnum
CREATE TYPE "ConnectedProvider" AS ENUM ('GMAIL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "ConnectedStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "CampaignMode" AS ENUM ('REVIEW_ALL', 'APPROVE_FIRST', 'AUTO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TargetRole" AS ENUM ('HIRING_MANAGER', 'TEAM_LEAD', 'RECRUITER', 'WARM_PATH');

-- CreateEnum
CREATE TYPE "EmailVerification" AS ENUM ('VALID', 'RISKY', 'INVALID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TargetState" AS ENUM ('DISCOVERED', 'VERIFIED', 'DRAFTED', 'APPROVED', 'SCHEDULED', 'SENT', 'REPLIED', 'BOUNCED', 'OPTED_OUT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'LINKEDIN_NOTE', 'LINKEDIN_MESSAGE');

-- CreateEnum
CREATE TYPE "MessageState" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LinkedInState" AS ENUM ('NOT_STARTED', 'CONNECT_PENDING', 'ACCEPTED', 'MESSAGED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "MarkedBy" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReplyClass" AS ENUM ('INTERESTED', 'REFERRAL', 'NOT_NOW', 'NO', 'OUT_OF_OFFICE', 'UNSUBSCRIBE', 'OTHER');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('OPT_OUT', 'BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('PURCHASE', 'SPEND_TARGET', 'SPEND_VERIFY', 'REFUND', 'REPLY_BONUS', 'TRIAL_GRANT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "costMicros" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "ownerUserId" UUID;

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "ConnectedProvider" NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ConnectedStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailySendCap" INTEGER NOT NULL DEFAULT 20,
    "warmupStage" INTEGER NOT NULL DEFAULT 0,
    "syncCursor" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachProfile" (
    "userId" UUID NOT NULL,
    "senderName" TEXT,
    "postalAddress" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "sendingPausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "pausedBy" "MarkedBy",
    "costCeilingMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" TEXT,
    "sourceUrl" TEXT,
    "jobSnapshot" JSONB NOT NULL,
    "tailoredResumeId" TEXT,
    "companyId" TEXT,
    "companyKey" TEXT NOT NULL,
    "companyType" TEXT,
    "mode" "CampaignMode" NOT NULL DEFAULT 'REVIEW_ALL',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "roleType" "TargetRole" NOT NULL,
    "companyDomain" TEXT,
    "email" TEXT,
    "emailHash" TEXT,
    "emailVerification" "EmailVerification" NOT NULL DEFAULT 'UNKNOWN',
    "linkedinUrl" TEXT,
    "country" TEXT,
    "dataProvider" TEXT NOT NULL,
    "sourceRef" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskAcknowledgedAt" TIMESTAMP(3),
    "state" "TargetState" NOT NULL DEFAULT 'DISCOVERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "step" INTEGER NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "templateKey" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedTextHash" TEXT,
    "sendKey" TEXT,
    "attachmentSha256" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "threadId" TEXT,
    "state" "MessageState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInStep" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "state" "LinkedInState" NOT NULL DEFAULT 'NOT_STARTED',
    "requestedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "markedBy" "MarkedBy" NOT NULL DEFAULT 'USER',
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "classification" "ReplyClass" NOT NULL DEFAULT 'OTHER',
    "ruleHit" TEXT,
    "suggestedResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ConnectedAccount_status_idx" ON "ConnectedAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_provider_accountEmail_key" ON "ConnectedAccount"("userId", "provider", "accountEmail");

-- CreateIndex
CREATE INDEX "OutreachCampaign_userId_status_idx" ON "OutreachCampaign"("userId", "status");

-- CreateIndex
CREATE INDEX "OutreachCampaign_userId_companyKey_createdAt_idx" ON "OutreachCampaign"("userId", "companyKey", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachTarget_campaignId_state_idx" ON "OutreachTarget"("campaignId", "state");

-- CreateIndex
CREATE INDEX "OutreachTarget_emailHash_idx" ON "OutreachTarget"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_sendKey_key" ON "OutreachMessage"("sendKey");

-- CreateIndex
CREATE INDEX "OutreachMessage_scheduledAt_state_idx" ON "OutreachMessage"("scheduledAt", "state");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_targetId_channel_step_key" ON "OutreachMessage"("targetId", "channel", "step");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInStep_targetId_key" ON "LinkedInStep"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Reply_providerMessageId_key" ON "Reply"("providerMessageId");

-- CreateIndex
CREATE INDEX "Reply_messageId_idx" ON "Reply"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_emailHash_key" ON "SuppressionEntry"("emailHash");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_userId_reason_refType_refId_key" ON "CreditLedger"("userId", "reason", "refType", "refId");

-- CreateIndex
CREATE INDEX "ProviderUsage_userId_createdAt_idx" ON "ProviderUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderUsage_provider_createdAt_idx" ON "ProviderUsage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "Job_ownerUserId_idx" ON "Job"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachProfile" ADD CONSTRAINT "OutreachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "TailoredResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachTarget" ADD CONSTRAINT "OutreachTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "OutreachTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInStep" ADD CONSTRAINT "LinkedInStep_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "OutreachTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutreachMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsage" ADD CONSTRAINT "ProviderUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
