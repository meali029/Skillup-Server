import Proposal from "../../models/Proposal.js";
import Job from "../../models/Job.js";
import User from "../../models/User.js";

class ProposalService {
  /**
   * Create a new proposal
   */
  async createProposal(userId, proposalData) {
    const { jobId, coverLetter, bidAmount, deliveryTime, attachments } = proposalData;

    // Verify user is a freelancer
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role !== "freelancer") {
      throw new Error("Only freelancers can submit proposals");
    }

    // Verify job exists and is active
    const job = await Job.findById(jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    if (job.status !== "open" || !job.isActive) {
      throw new Error("This job is no longer accepting proposals");
    }

    // Check for duplicate proposal
    const existingProposal = await Proposal.findOne({
      freelancerId: userId,
      jobId: jobId,
    });

    if (existingProposal) {
      throw new Error("You have already submitted a proposal for this job");
    }

    // Validate bid amount is within job budget range
    if (job.budgetMin && bidAmount < job.budgetMin) {
      throw new Error(`Bid amount must be at least $${job.budgetMin}`);
    }
    if (job.budgetMax && bidAmount > job.budgetMax) {
      throw new Error(`Bid amount cannot exceed $${job.budgetMax}`);
    }

    // Create proposal
    const proposal = await Proposal.create({
      freelancerId: userId,
      jobId,
      coverLetter,
      bidAmount,
      deliveryTime,
      attachments: attachments || [],
      status: "pending",
    });

    // Populate the proposal with job and freelancer details
    const populatedProposal = await Proposal.findById(proposal._id)
      .populate("jobId", "title description budget budgetMin budgetMax client")
      .populate("freelancerId", "name email avatar skills hourlyRate");

    // Update job's bids count (if field exists)
    if (job.bids !== undefined) {
      job.bids = (job.bids || 0) + 1;
      await job.save();
    }

    return populatedProposal;
  }

  /**
   * Get proposal by ID
   */
  async getProposalById(proposalId, userId) {
    const proposal = await Proposal.findById(proposalId)
      .populate("jobId", "title description budget budgetMin budgetMax client status")
      .populate("freelancerId", "name email avatar skills hourlyRate");

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    // Verify ownership
    if (proposal.freelancerId._id.toString() !== userId.toString()) {
      throw new Error("You don't have permission to view this proposal");
    }

    return proposal;
  }

  /**
   * Get all proposals by freelancer
   */
  async getFreelancerProposals(userId, filters = {}) {
    const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = filters;

    // Build query
    const query = { freelancerId: userId };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get proposals with pagination
    const proposals = await Proposal.find(query)
      .populate("jobId", "title description budget budgetMin budgetMax client status")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Proposal.countDocuments(query);

    return {
      proposals,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update proposal
   */
  async updateProposal(proposalId, userId, updateData) {
    const proposal = await Proposal.findById(proposalId);

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    // Verify ownership
    if (proposal.freelancerId.toString() !== userId.toString()) {
      throw new Error("You don't have permission to update this proposal");
    }

    // Only allow updates if status is pending
    if (proposal.status !== "pending") {
      throw new Error("You can only edit proposals that are pending");
    }

    // Update allowed fields
    const allowedUpdates = ["coverLetter", "bidAmount", "deliveryTime", "attachments"];
    Object.keys(updateData).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        proposal[key] = updateData[key];
      }
    });

    await proposal.save();

    // Return populated proposal
    return await Proposal.findById(proposal._id)
      .populate("jobId", "title description budget budgetMin budgetMax client")
      .populate("freelancerId", "name email avatar skills hourlyRate");
  }

  /**
   * Withdraw proposal
   */
  async withdrawProposal(proposalId, userId) {
    const proposal = await Proposal.findById(proposalId);

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    // Verify ownership
    if (proposal.freelancerId.toString() !== userId.toString()) {
      throw new Error("You don't have permission to withdraw this proposal");
    }

    // Only allow withdrawal if status is pending
    if (proposal.status !== "pending") {
      throw new Error("You can only withdraw proposals that are pending");
    }

    // Update status to withdrawn
    proposal.status = "withdrawn";
    await proposal.save();

    // Update job's bids count
    try {
      const job = await Job.findById(proposal.jobId);
      if (job && job.bids !== undefined && job.bids > 0) {
        job.bids = job.bids - 1;
        await job.save();
      }
    } catch (error) {
      console.log("Could not update job bids count:", error.message);
    }

    return { message: "Proposal withdrawn successfully" };
  }

  /**
   * Get proposal statistics
   */
  async getProposalStats(userId) {
    const [total, pending, accepted, rejected, withdrawn] = await Promise.all([
      Proposal.countDocuments({ freelancerId: userId }),
      Proposal.countDocuments({ freelancerId: userId, status: "pending" }),
      Proposal.countDocuments({ freelancerId: userId, status: "accepted" }),
      Proposal.countDocuments({ freelancerId: userId, status: "rejected" }),
      Proposal.countDocuments({ freelancerId: userId, status: "withdrawn" }),
    ]);

    const successRate = total > 0 ? ((accepted / total) * 100).toFixed(2) : 0;

    return {
      total,
      pending,
      accepted,
      rejected,
      withdrawn,
      successRate: parseFloat(successRate),
    };
  }

  /**
   * Check if freelancer has already applied to a job
   */
  async hasApplied(userId, jobId) {
    const proposal = await Proposal.findOne({
      freelancerId: userId,
      jobId: jobId,
    });

    return !!proposal;
  }
}

export default new ProposalService();
