-- AddUniqueConstraint
CREATE UNIQUE INDEX "child_case_details_mother_beneficiary_id_birth_order_key" ON "child_case_details"("mother_beneficiary_id", "birth_order");
