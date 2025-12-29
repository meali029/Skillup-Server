import express from "express";
import {
  submitProposal,
  getMyProposals,
  getProposalDetails,
  updateProposal,
  withdrawProposal,
  getProposalStats,
  checkIfApplied,
  getJobProposals,
  getClientProposalDetails,
  acceptProposal,
  rejectProposal,
  getAllClientProposals,
  generateProposalDraft,
  regenerateProposalDraft,
} from "./proposal.controller.js";
import {
  validateSubmitProposal,
  validateUpdateProposal,
  validateProposalId,
  validateJobId,
  validateProposalQuery,
  validateRejectProposal,
} from "./proposal.validation.js";
import { authenticate, authorize, aiRateLimit } from "../../core/middlewares/index.js";

const router = express.Router();

router.use(authenticate);

// Freelancer routes
router.post("/", authorize("freelancer"), validateSubmitProposal, submitProposal);
router.get("/me", authorize("freelancer"), validateProposalQuery, getMyProposals);
router.get("/stats", authorize("freelancer"), getProposalStats);
router.get("/check/:jobId", authorize("freelancer"), validateJobId, checkIfApplied);
router.get("/freelancer/:id", authorize("freelancer"), validateProposalId, getProposalDetails);
router.put("/:id", authorize("freelancer"), validateProposalId, validateUpdateProposal, updateProposal);
router.delete("/:id", authorize("freelancer"), validateProposalId, withdrawProposal);

// AI Proposal Generation routes (accessible by freelancers and admins for testing)
router.get("/draft/:jobId", authorize("freelancer", "admin"), validateJobId, aiRateLimit("proposal", { skipAdmin: true }), generateProposalDraft);
router.post("/draft/:jobId/regenerate", authorize("freelancer", "admin"), validateJobId, aiRateLimit("proposal", { skipAdmin: true }), regenerateProposalDraft);

// Client routes
router.get("/client/all", authorize("client"), validateProposalQuery, getAllClientProposals);
router.get("/job/:jobId", authorize("client"), validateJobId, getJobProposals);
router.get("/client/:id", authorize("client"), validateProposalId, getClientProposalDetails);
router.post("/:id/accept", authorize("client"), validateProposalId, acceptProposal);
router.post("/:id/reject", authorize("client"), validateProposalId, validateRejectProposal, rejectProposal);

export default router;
