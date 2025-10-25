import jobService from './job.service.js';
import { asyncHandler, successResponse, paginatedResponse } from '../../core/utils/index.js';
import { JobDTO } from '../shared/dtos/index.js';

/**
 * Create a new job
 * @route POST /api/jobs
 * @access Private (Client only)
 */
export const createJob = asyncHandler(async (req, res) => {
  const job = await jobService.createJob(req.validatedData, req.user.id);
  successResponse(res, { job: new JobDTO(job) }, 'Job created successfully', 201);
});

/**
 * Get all jobs with filters
 * @route GET /api/jobs
 * @access Public
 */
export const getAllJobs = asyncHandler(async (req, res) => {
  const result = await jobService.getAllJobs(req.validatedQuery || req.query);
  paginatedResponse(
    res,
    result.jobs.map(job => new JobDTO(job)),
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

/**
 * Get job by ID
 * @route GET /api/jobs/:id
 * @access Public
 */
export const getJobById = asyncHandler(async (req, res) => {
  const job = await jobService.getJobById(req.params.id);
  successResponse(res, { job: new JobDTO(job) }, 'Job fetched successfully');
});

/**
 * Update job
 * @route PUT /api/jobs/:id
 * @access Private (Client only - own jobs)
 */
export const updateJob = asyncHandler(async (req, res) => {
  const job = await jobService.updateJob(req.params.id, req.user.id, req.validatedData);
  successResponse(res, { job: new JobDTO(job) }, 'Job updated successfully');
});

/**
 * Delete job
 * @route DELETE /api/jobs/:id
 * @access Private (Client only - own jobs)
 */
export const deleteJob = asyncHandler(async (req, res) => {
  const result = await jobService.deleteJob(req.params.id, req.user.id);
  successResponse(res, null, result.message);
});

/**
 * Get client's own jobs
 * @route GET /api/jobs/client/my-jobs
 * @access Private (Client only)
 */
export const getMyJobs = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await jobService.getClientJobs(req.user.id, { page, limit, status });
  paginatedResponse(
    res,
    result.jobs.map(job => new JobDTO(job)),
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

/**
 * Close job
 * @route PATCH /api/jobs/:id/close
 * @access Private (Client only - own jobs)
 */
export const closeJob = asyncHandler(async (req, res) => {
  const job = await jobService.closeJob(req.params.id, req.user.id);
  successResponse(res, { job: new JobDTO(job) }, 'Job closed successfully');
});

/**
 * Get job statistics
 * @route GET /api/jobs/client/stats
 * @access Private (Client only)
 */
export const getJobStats = asyncHandler(async (req, res) => {
  const stats = await jobService.getJobStats(req.user.id);
  successResponse(res, { stats }, 'Statistics fetched successfully');
});
