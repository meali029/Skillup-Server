import disputeService from './dispute.service.js';

/**
 * Create a new dispute
 */
export const createDispute = async (req, res) => {
  try {
    const userId = req.user._id;
    const dispute = await disputeService.createDispute(req.body, userId);

    res.status(201).json({
      success: true,
      message: 'Dispute created successfully',
      data: dispute,
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create dispute',
    });
  }
};

/**
 * Get all disputes (admin only)
 */
export const getAllDisputes = async (req, res) => {
  try {
    const {
      status,
      contractId,
      raisedBy,
      page = 1,
      limit = 10,
      sortBy = '-createdAt',
    } = req.query;

    const filters = {};
    const options = {
      status,
      contractId,
      raisedBy,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
    };

    const result = await disputeService.getAllDisputes(filters, options);

    res.status(200).json({
      success: true,
      data: result.disputes,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes',
    });
  }
};

/**
 * Get dispute by ID
 */
export const getDisputeById = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const dispute = await disputeService.getDisputeById(disputeId);

    res.status(200).json({
      success: true,
      data: dispute,
    });
  } catch (error) {
    console.error('Error fetching dispute:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'Dispute not found',
    });
  }
};

/**
 * Get disputes by contract ID
 */
export const getDisputesByContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const disputes = await disputeService.getDisputesByContract(contractId);

    res.status(200).json({
      success: true,
      data: disputes,
    });
  } catch (error) {
    console.error('Error fetching contract disputes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes',
    });
  }
};

/**
 * Resolve a dispute (admin only)
 */
export const resolveDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { resolution } = req.body;
    const adminId = req.user._id;

    if (!resolution) {
      return res.status(400).json({
        success: false,
        message: 'Resolution is required',
      });
    }

    const dispute = await disputeService.resolveDispute(
      disputeId,
      resolution,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Dispute resolved successfully',
      data: dispute,
    });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to resolve dispute',
    });
  }
};

/**
 * Reject a dispute (admin only)
 */
export const rejectDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const dispute = await disputeService.rejectDispute(
      disputeId,
      reason,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Dispute rejected successfully',
      data: dispute,
    });
  } catch (error) {
    console.error('Error rejecting dispute:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to reject dispute',
    });
  }
};

/**
 * Add admin note to dispute
 */
export const addAdminNote = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { note } = req.body;
    const adminId = req.user._id;

    if (!note) {
      return res.status(400).json({
        success: false,
        message: 'Note is required',
      });
    }

    const dispute = await disputeService.addAdminNote(disputeId, note, adminId);

    res.status(200).json({
      success: true,
      message: 'Admin note added successfully',
      data: dispute,
    });
  } catch (error) {
    console.error('Error adding admin note:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to add admin note',
    });
  }
};

/**
 * Get dispute statistics (admin dashboard)
 */
export const getDisputeStats = async (req, res) => {
  try {
    const stats = await disputeService.getDisputeStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching dispute stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch dispute statistics',
    });
  }
};

/**
 * Update dispute status
 */
export const updateDisputeStatus = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { status, notes } = req.body;
    const adminId = req.user._id;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
      });
    }

    const validStatuses = ['OPEN', 'RESOLVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const dispute = await disputeService.updateDisputeStatus(
      disputeId,
      status,
      adminId,
      notes
    );

    res.status(200).json({
      success: true,
      message: 'Dispute status updated successfully',
      data: dispute,
    });
  } catch (error) {
    console.error('Error updating dispute status:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update dispute status',
    });
  }
};
