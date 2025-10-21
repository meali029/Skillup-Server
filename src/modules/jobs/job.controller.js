import jobService from './job.service.js';

// @desc    Create a new job
// @route   POST /api/jobs
// @access  Private (Client only)
export const createJob = async (req, res) => {
  try {
    // Check if user is a client
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can post jobs',
      });
    }

    const job = await jobService.createJob(req.validatedData, req.user.userId);

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job,
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create job',
    });
  }
};

// @desc    Get all jobs with filters
// @route   GET /api/jobs
// @access  Public
export const getAllJobs = async (req, res) => {
  try {
    const result = await jobService.getAllJobs(req.validatedQuery);

    res.status(200).json({
      success: true,
      message: 'Jobs fetched successfully',
      data: result.jobs,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch jobs',
    });
  }
};

// @desc    Get job by ID
// @route   GET /api/jobs/:id
// @access  Public
export const getJobById = async (req, res) => {
  try {
    const job = await jobService.getJobById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Job fetched successfully',
      data: job,
    });
  } catch (error) {
    console.error('Get job by ID error:', error);
    
    if (error.message === 'Job not found') {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch job',
    });
  }
};

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private (Client only - own jobs)
export const updateJob = async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can update jobs',
      });
    }

    const job = await jobService.updateJob(
      req.params.id,
      req.user.userId,
      req.validatedData
    );

    res.status(200).json({
      success: true,
      message: 'Job updated successfully',
      data: job,
    });
  } catch (error) {
    console.error('Update job error:', error);

    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('Cannot update')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update job',
    });
  }
};

// @desc    Delete job
// @route   DELETE /api/jobs/:id
// @access  Private (Client only - own jobs)
export const deleteJob = async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can delete jobs',
      });
    }

    const result = await jobService.deleteJob(req.params.id, req.user.userId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Delete job error:', error);

    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete job',
    });
  }
};

// @desc    Get client's own jobs
// @route   GET /api/jobs/client/my-jobs
// @access  Private (Client only)
export const getMyJobs = async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can access this endpoint',
      });
    }

    const { page, limit, status } = req.query;
    const result = await jobService.getClientJobs(req.user.userId, {
      page,
      limit,
      status,
    });

    res.status(200).json({
      success: true,
      message: 'Jobs fetched successfully',
      data: result.jobs,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch jobs',
    });
  }
};

// @desc    Close job
// @route   PATCH /api/jobs/:id/close
// @access  Private (Client only - own jobs)
export const closeJob = async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can close jobs',
      });
    }

    const job = await jobService.closeJob(req.params.id, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Job closed successfully',
      data: job,
    });
  } catch (error) {
    console.error('Close job error:', error);

    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to close job',
    });
  }
};

// @desc    Get job statistics
// @route   GET /api/jobs/client/stats
// @access  Private (Client only)
export const getJobStats = async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        message: 'Only clients can access job statistics',
      });
    }

    const stats = await jobService.getJobStats(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Statistics fetched successfully',
      data: stats,
    });
  } catch (error) {
    console.error('Get job stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch statistics',
    });
  }
};
