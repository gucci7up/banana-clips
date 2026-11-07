-- BANANA CLIPS AI STUDIO — Initial Reproducible Migration
-- Supports PostgreSQL 16 + pgvector extension

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE "RoleType" AS ENUM ('SUPER_ADMIN', 'USER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'DOWNLOADING', 'PROBING', 'TRANSCODING', 'TRANSCRIBING', 'ANALYZING', 'SCORING', 'GENERATING_CLIPS', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELED');
CREATE TYPE "LiveStatus" AS ENUM ('IDLE', 'CONNECTING', 'RECORDING', 'PROCESSING', 'STOPPED', 'FAILED');

CREATE TABLE IF NOT EXISTS "Role" (
    "id" UUID NOT NULL,
    "name" "RoleType" NOT NULL,
    "description" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");

CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "brandKit" JSONB,
    "projectPresets" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

CREATE TABLE IF NOT EXISTS "UserResourceLimit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "maxConcurrentJobs" INTEGER NOT NULL DEFAULT 2,
    "maxFileSizeMb" INTEGER NOT NULL DEFAULT 4096,
    "maxVideoDurationSeconds" INTEGER NOT NULL DEFAULT 14400,
    "maxStorageGb" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxQueuedVideos" INTEGER NOT NULL DEFAULT 10,
    "processingPriority" INTEGER NOT NULL DEFAULT 5,
    "unlimitedMode" BOOLEAN NOT NULL DEFAULT false,
    "allowedFeatures" JSONB NOT NULL DEFAULT '["AI_CLIPPING","GAME_CLIPPING","FIND_MOMENTS","LIVE_CLIPPER","AI_MONTAGE","VIDEO_EDITOR","SOCIAL_PUBLISH"]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserResourceLimit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserResourceLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserResourceLimit_userId_key" ON "UserResourceLimit"("userId");

CREATE TABLE IF NOT EXISTS "ResourceUsage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "storageBytesUsed" BIGINT NOT NULL DEFAULT 0,
    "minutesProcessed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "videosProcessed" INTEGER NOT NULL DEFAULT 0,
    "clipsGenerated" INTEGER NOT NULL DEFAULT 0,
    "activeJobsCount" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResourceUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "gameId" TEXT,
    "presetName" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "assistantChat" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StorageObject" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "localPath" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StorageObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StorageObject_bucket_objectKey_key" ON "StorageObject"("bucket", "objectKey");

CREATE TABLE IF NOT EXISTS "Video" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageObjectId" UUID,
    "thumbnailPath" TEXT,
    "previewPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Video_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VideoSource" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "originUrl" TEXT,
    "liveStreamState" "LiveStatus",
    "protocol" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VideoSource_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoSource_videoId_key" ON "VideoSource"("videoId");

CREATE TABLE IF NOT EXISTS "VideoMetadata" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "fps" DOUBLE PRECISION NOT NULL,
    "videoCodec" TEXT NOT NULL,
    "audioCodec" TEXT,
    "bitrateKbps" INTEGER NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "hasAudio" BOOLEAN NOT NULL DEFAULT true,
    "probedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoMetadata_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VideoMetadata_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VideoMetadata_videoId_key" ON "VideoMetadata"("videoId");

CREATE TABLE IF NOT EXISTS "Transcript" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "modelUsed" TEXT NOT NULL DEFAULT 'faster-whisper-small',
    "fullText" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "srtContent" TEXT,
    "vttContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transcript_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Transcript_videoId_key" ON "Transcript"("videoId");

CREATE TABLE IF NOT EXISTS "Speaker" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "customName" TEXT,
    "faceBoxAvg" JSONB,
    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Speaker_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TranscriptSegment" (
    "id" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "speakerId" UUID,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "wordsJson" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "hasFiller" BOOLEAN NOT NULL DEFAULT false,
    "embedding" vector(384),
    "embeddingJson" JSONB,
    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranscriptSegment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Scene" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "motionScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "audioPeakScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "facesDetected" INTEGER NOT NULL DEFAULT 1,
    "thumbnailPath" TEXT,
    "visualEmbedding" vector(384),
    "embeddingJson" JSONB,
    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Scene_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VisualEvent" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "timestampSec" DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "eventType" TEXT NOT NULL,
    "gameId" TEXT,
    "presetTag" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "VisualEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VisualEvent_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AnalysisJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "videoId" UUID NOT NULL,
    "jobType" TEXT NOT NULL DEFAULT 'AI_CLIPPING',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "currentPhase" TEXT NOT NULL DEFAULT 'En cola',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "workerId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnalysisJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnalysisJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "JobAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "workerName" TEXT NOT NULL,
    "hardwareUsed" TEXT NOT NULL DEFAULT 'CPU_ONLY',
    "status" TEXT NOT NULL,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Clip" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "videoId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "altTitle" TEXT,
    "description" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "category" TEXT NOT NULL DEFAULT 'HIGHLIGHT',
    "language" TEXT NOT NULL DEFAULT 'es',
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "reframeMode" TEXT NOT NULL DEFAULT 'LEVEL_2_VISUAL_TRACKING',
    "storageObjectId" UUID,
    "previewPath" TEXT,
    "thumbnailPath" TEXT,
    "fingerprintHash" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Clip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Clip_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Clip_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ClipScore" (
    "id" UUID NOT NULL,
    "clipId" UUID NOT NULL,
    "scoreTotal" INTEGER NOT NULL,
    "scoreHook" INTEGER NOT NULL,
    "scoreStory" INTEGER NOT NULL,
    "scoreEmotion" INTEGER NOT NULL,
    "scoreEngagement" INTEGER NOT NULL,
    "scoreClarity" INTEGER NOT NULL,
    "scoreVisual" INTEGER NOT NULL,
    "scoreShareability" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1.2.0-heuristic-multimodal',
    "weightsUsed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClipScore_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClipScore_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClipScore_clipId_key" ON "ClipScore"("clipId");

CREATE TABLE IF NOT EXISTS "ClipScoreBreakdown" (
    "id" UUID NOT NULL,
    "clipScoreId" UUID NOT NULL,
    "openingStrengthNote" TEXT NOT NULL,
    "narrativeContextNote" TEXT NOT NULL,
    "emotionalPeakNote" TEXT NOT NULL,
    "pacingWps" DOUBLE PRECISION NOT NULL,
    "visualChangesCount" INTEGER NOT NULL,
    "audioClarityDb" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ClipScoreBreakdown_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClipScoreBreakdown_clipScoreId_fkey" FOREIGN KEY ("clipScoreId") REFERENCES "ClipScore"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClipScoreBreakdown_clipScoreId_key" ON "ClipScoreBreakdown"("clipScoreId");

CREATE TABLE IF NOT EXISTS "ClipTranscript" (
    "id" UUID NOT NULL,
    "clipId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "wordsJson" JSONB NOT NULL DEFAULT '[]',
    "srtContent" TEXT NOT NULL,
    "vttContent" TEXT NOT NULL,
    "assContent" TEXT,
    CONSTRAINT "ClipTranscript_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClipTranscript_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClipTranscript_clipId_key" ON "ClipTranscript"("clipId");

CREATE TABLE IF NOT EXISTS "EditProject" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "clipId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stateJson" JSONB NOT NULL,
    "historyStack" JSONB NOT NULL DEFAULT '[]',
    "redoStack" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditProject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EditProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EditProject_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "EditOperation" (
    "id" UUID NOT NULL,
    "editProjectId" UUID NOT NULL,
    "operationType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditOperation_editProjectId_fkey" FOREIGN KEY ("editProjectId") REFERENCES "EditProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Montage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL DEFAULT 'Gaming Compilation',
    "titleOverlay" TEXT,
    "subtitleStyle" JSONB,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outputStorageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Montage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Montage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Montage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MontageItem" (
    "id" UUID NOT NULL,
    "montageId" UUID NOT NULL,
    "clipId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "trimStartSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trimEndSec" DOUBLE PRECISION,
    "transitionType" TEXT NOT NULL DEFAULT 'fade',
    CONSTRAINT "MontageItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MontageItem_montageId_fkey" FOREIGN KEY ("montageId") REFERENCES "Montage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MontageItem_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Export" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clipId" UUID,
    "montageId" UUID,
    "preset" TEXT NOT NULL DEFAULT 'TikTok',
    "resolution" TEXT NOT NULL DEFAULT '1080p',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "videoCodec" TEXT NOT NULL DEFAULT 'h264',
    "audioCodec" TEXT NOT NULL DEFAULT 'aac',
    "burnSubtitles" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "storageObjectId" UUID,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Export_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Export_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Export_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Export_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Export_shareToken_key" ON "Export"("shareToken");

CREATE TABLE IF NOT EXISTS "SocialAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "accountHandle" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "socialAccountId" UUID,
    "clipId" UUID,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Template" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Template_name_key" ON "Template"("name");

CREATE TABLE IF NOT EXISTS "ProcessingWorker" (
    "id" UUID NOT NULL,
    "workerName" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "hardwareProfile" TEXT NOT NULL DEFAULT 'CPU_ONLY',
    "gpuName" TEXT,
    "vramTotalMb" INTEGER,
    "vramUsedMb" INTEGER,
    "cpuLoadPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ramUsedMb" INTEGER NOT NULL DEFAULT 0,
    "activeJobId" TEXT,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessingWorker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessingWorker_workerName_key" ON "ProcessingWorker"("workerName");

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key");
