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
