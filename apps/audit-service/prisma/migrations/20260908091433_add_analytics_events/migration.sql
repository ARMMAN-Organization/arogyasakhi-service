-- CreateTable
CREATE TABLE "analytics_events" (
    "analytics_event_id" TEXT NOT NULL,
    "sakhi_user_id" TEXT,
    "device_id" TEXT,
    "feature_area" VARCHAR(60) NOT NULL,
    "event_name" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_event_uuid" VARCHAR(80),

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("analytics_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_local_event_uuid_key" ON "analytics_events"("local_event_uuid");

-- CreateIndex
CREATE INDEX "analytics_events_feature_area_event_name_occurred_at_idx" ON "analytics_events"("feature_area", "event_name", "occurred_at");
