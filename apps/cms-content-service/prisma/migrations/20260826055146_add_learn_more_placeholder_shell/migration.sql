-- CreateEnum
CREATE TYPE "LearnMoreMediaType" AS ENUM ('QNA_TEXT', 'PDF', 'INFOGRAPHIC', 'GIF', 'VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "LearnMoreContentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "learn_more_sections" (
    "learn_more_section_id" TEXT NOT NULL,
    "section_code" VARCHAR(80) NOT NULL,
    "section_name" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LearnMoreContentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "learn_more_sections_pkey" PRIMARY KEY ("learn_more_section_id")
);

-- CreateTable
CREATE TABLE "learn_more_topics" (
    "learn_more_topic_id" TEXT NOT NULL,
    "learn_more_section_id" TEXT NOT NULL,
    "topic_code" VARCHAR(80) NOT NULL,
    "topic_name" VARCHAR(160) NOT NULL,
    "media_type" "LearnMoreMediaType" NOT NULL,
    "content_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LearnMoreContentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "learn_more_topics_pkey" PRIMARY KEY ("learn_more_topic_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learn_more_sections_section_code_key" ON "learn_more_sections"("section_code");

-- CreateIndex
CREATE UNIQUE INDEX "learn_more_topics_topic_code_key" ON "learn_more_topics"("topic_code");

-- AddForeignKey
ALTER TABLE "learn_more_topics" ADD CONSTRAINT "learn_more_topics_learn_more_section_id_fkey" FOREIGN KEY ("learn_more_section_id") REFERENCES "learn_more_sections"("learn_more_section_id") ON DELETE RESTRICT ON UPDATE CASCADE;
