-- Supabase Performance Advisor (get_advisors, 2026-09-05): 45 foreign key
-- columns across the schema had no covering index, which means every JOIN
-- through them and every ON DELETE CASCADE forces a sequential scan on the
-- child table (supabase/agent-skills postgres-best-practices skill,
-- "Index Foreign Key Columns"). Adding one plain index per flagged column.
-- Plain CREATE INDEX (not CONCURRENTLY) is safe here: every table involved
-- is small live-event data (largest is AuditLog at ~500 rows), so the brief
-- ACCESS EXCLUSIVE lock is effectively instant.

CREATE INDEX "Achievement_eventId_idx" ON "public"."Achievement"("eventId");
CREATE INDEX "CheckIn_checkedInById_idx" ON "public"."CheckIn"("checkedInById");
CREATE INDEX "ClassSchedule_teacherId_idx" ON "public"."ClassSchedule"("teacherId");
CREATE INDEX "Competition_createdById_idx" ON "public"."Competition"("createdById");
CREATE INDEX "Competition_templateId_idx" ON "public"."Competition"("templateId");
CREATE INDEX "CompetitionEvent_actorId_idx" ON "public"."CompetitionEvent"("actorId");
CREATE INDEX "CompetitionMember_addedById_idx" ON "public"."CompetitionMember"("addedById");
CREATE INDEX "CompetitionMember_roleId_idx" ON "public"."CompetitionMember"("roleId");
CREATE INDEX "CompetitionRules_lockedById_idx" ON "public"."CompetitionRules"("lockedById");
CREATE INDEX "Division_categoryId_idx" ON "public"."Division"("categoryId");
CREATE INDEX "Division_resultsReviewedById_idx" ON "public"."Division"("resultsReviewedById");
CREATE INDEX "DivisionStagePlan_stageId_idx" ON "public"."DivisionStagePlan"("stageId");
CREATE INDEX "Draw_createdById_idx" ON "public"."Draw"("createdById");
CREATE INDEX "DrawParticipant_registrationId_idx" ON "public"."DrawParticipant"("registrationId");
CREATE INDEX "Event_createdById_idx" ON "public"."Event"("createdById");
CREATE INDEX "Event_moderatedById_idx" ON "public"."Event"("moderatedById");
CREATE INDEX "FinalJudgeScore_criterionId_idx" ON "public"."FinalJudgeScore"("criterionId");
CREATE INDEX "FinalJudgeScore_judgeAssignmentId_idx" ON "public"."FinalJudgeScore"("judgeAssignmentId");
CREATE INDEX "FinalPair_createdById_idx" ON "public"."FinalPair"("createdById");
CREATE INDEX "FinalPair_followerRegistrationId_idx" ON "public"."FinalPair"("followerRegistrationId");
CREATE INDEX "FinalPair_leaderRegistrationId_idx" ON "public"."FinalPair"("leaderRegistrationId");
CREATE INDEX "FinalResult_finalSessionId_idx" ON "public"."FinalResult"("finalSessionId");
CREATE INDEX "FinalResult_registrationId_idx" ON "public"."FinalResult"("registrationId");
CREATE INDEX "JudgeAssignment_assignedById_idx" ON "public"."JudgeAssignment"("assignedById");
CREATE INDEX "JudgeAssignment_judgeUserId_idx" ON "public"."JudgeAssignment"("judgeUserId");
CREATE INDEX "JudgeRoundConfirmation_judgeAssignmentId_idx" ON "public"."JudgeRoundConfirmation"("judgeAssignmentId");
CREATE INDEX "JudgeScore_judgeAssignmentId_idx" ON "public"."JudgeScore"("judgeAssignmentId");
CREATE INDEX "Registration_registeredById_idx" ON "public"."Registration"("registeredById");
CREATE INDEX "Registration_roleOverrideReviewedById_idx" ON "public"."Registration"("roleOverrideReviewedById");
CREATE INDEX "Result_createdById_idx" ON "public"."Result"("createdById");
CREATE INDEX "Result_publishedById_idx" ON "public"."Result"("publishedById");
CREATE INDEX "Result_registrationId_idx" ON "public"."Result"("registrationId");
CREATE INDEX "Result_roundReachedId_idx" ON "public"."Result"("roundReachedId");
CREATE INDEX "Review_authorId_idx" ON "public"."Review"("authorId");
CREATE INDEX "Review_moderatedById_idx" ON "public"."Review"("moderatedById");
CREATE INDEX "Round_advancementPublishedById_idx" ON "public"."Round"("advancementPublishedById");
CREATE INDEX "Round_rulesId_idx" ON "public"."Round"("rulesId");
CREATE INDEX "Round_stageId_idx" ON "public"."Round"("stageId");
CREATE INDEX "Round_tieBreakOfRoundId_idx" ON "public"."Round"("tieBreakOfRoundId");
CREATE INDEX "RoundResult_registrationId_idx" ON "public"."RoundResult"("registrationId");
CREATE INDEX "School_ownerUserId_idx" ON "public"."School"("ownerUserId");
CREATE INDEX "SchoolBranch_cityId_idx" ON "public"."SchoolBranch"("cityId");
CREATE INDEX "SchoolClaim_reviewedById_idx" ON "public"."SchoolClaim"("reviewedById");
CREATE INDEX "UserRoleAssignment_grantedById_idx" ON "public"."UserRoleAssignment"("grantedById");
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "public"."UserRoleAssignment"("roleId");
