-- CreateTable
CREATE TABLE "job_runs" (
    "job_run_id" TEXT NOT NULL,
    "job_name" VARCHAR(80) NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("job_run_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_name_key" ON "job_runs"("job_name");

-- CreateTable
CREATE TABLE "aggregated_metrics" (
    "aggregated_metric_id" TEXT NOT NULL,
    "feature_area" VARCHAR(60) NOT NULL,
    "metric_name" VARCHAR(120) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,4),
    "breakdown_json" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregated_metrics_pkey" PRIMARY KEY ("aggregated_metric_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aggregated_metrics_feature_area_metric_name_period_start_p_key" ON "aggregated_metrics"("feature_area", "metric_name", "period_start", "period_end");
