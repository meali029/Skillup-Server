import express from "express";
import {
  submitProposal,
  getMyProposals,
  getProposalDetails,
  updateProposal,
  withdrawProposal,
  getProposalStats,
  checkIfApplied,
} from "./proposal.controller.js";
import {
  validateSubmitProposal,
  validateUpdateProposal,
  validateProposalId,
  validateJobId,
  validateProposalQuery,
} from "./proposal.validation.js";
import { authenticate, authorize } from "../../core/middlewares/index.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize("freelancer"));

router.post("/", validateSubmitProposal, submitProposal);
router.get("/me", validateProposalQuery, getMyProposals);
router.get("/stats", getProposalStats);
router.get("/check/:jobId", validateJobId, checkIfApplied);
router.get("/:id", validateProposalId, getProposalDetails);
router.put("/:id", validateProposalId, validateUpdateProposal, updateProposal);
router.delete("/:id", validateProposalId, withdrawProposal);

export default router;
