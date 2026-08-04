-- CreateEnum
CREATE TYPE "TrainingTopicStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MarkType" AS ENUM ('PRE', 'POST');

-- CreateTable
CREATE TABLE "training_topics" (
    "topic_id" TEXT NOT NULL,
    "topic_code" VARCHAR(80) NOT NULL,
    "topic_name" VARCHAR(160) NOT NULL,
    "status" "TrainingTopicStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "training_topics_pkey" PRIMARY KEY ("topic_id")
);

-- CreateTable
CREATE TABLE "event_photos" (
    "photo_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "event_photos_pkey" PRIMARY KEY ("photo_id")
);

-- CreateTable
CREATE TABLE "event_gatherings" (
    "gathering_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "gathering_date" DATE NOT NULL,
    "remarks" TEXT,
    "status" "SupervisorEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "event_gatherings_pkey" PRIMARY KEY ("gathering_id")
);

-- CreateTable
CREATE TABLE "gathering_topics" (
    "gathering_topic_id" TEXT NOT NULL,
    "gathering_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,

    CONSTRAINT "gathering_topics_pkey" PRIMARY KEY ("gathering_topic_id")
);

-- CreateTable
CREATE TABLE "gathering_attendance" (
    "gathering_attendance_id" TEXT NOT NULL,
    "gathering_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "attendance_status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gathering_attendance_pkey" PRIMARY KEY ("gathering_attendance_id")
);

-- CreateTable
CREATE TABLE "topic_marks" (
    "topic_mark_id" TEXT NOT NULL,
    "gathering_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "mark_type" "MarkType" NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "topic_marks_pkey" PRIMARY KEY ("topic_mark_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_topics_topic_code_key" ON "training_topics"("topic_code");

-- CreateIndex
CREATE UNIQUE INDEX "gathering_topics_gathering_id_topic_id_key" ON "gathering_topics"("gathering_id", "topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "gathering_attendance_gathering_id_sakhi_id_key" ON "gathering_attendance"("gathering_id", "sakhi_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_marks_gathering_id_topic_id_sakhi_id_mark_type_key" ON "topic_marks"("gathering_id", "topic_id", "sakhi_id", "mark_type");

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "supervisor_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_gatherings" ADD CONSTRAINT "event_gatherings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "supervisor_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_topics" ADD CONSTRAINT "gathering_topics_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "event_gatherings"("gathering_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_topics" ADD CONSTRAINT "gathering_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "training_topics"("topic_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_attendance" ADD CONSTRAINT "gathering_attendance_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "event_gatherings"("gathering_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_marks" ADD CONSTRAINT "topic_marks_gathering_id_fkey" FOREIGN KEY ("gathering_id") REFERENCES "event_gatherings"("gathering_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_marks" ADD CONSTRAINT "topic_marks_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "training_topics"("topic_id") ON DELETE RESTRICT ON UPDATE CASCADE;

