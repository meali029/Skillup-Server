import * as jobService from './job.service.js';
import { asyncHandler, successResponse, paginatedResponse } from '../../core/utils/index.js';
import { formatJob } from '../shared/dtos/index.js';

export const createJob = asyncHandler(async (req, res) => {
  const job = await jobService.createJob(req.validatedData, req.user.id);
  successResponse(res, { job: formatJob(job) }, 'Job created successfully', 201);
});

export const getAllJobs = asyncHandler(async (req, res) => {
  const result = await jobService.getAllJobs(req.validatedQuery || req.query);
  paginatedResponse(
    res,
    result.jobs.map(job => formatJob(job)),
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

export const getJobById = asyncHandler(async (req, res) => {
  const job = await jobService.getJobById(req.params.id);
  successResponse(res, { job: formatJob(job) }, 'Job fetched successfully');
});

export const updateJob = asyncHandler(async (req, res) => {
  const job = await jobService.updateJob(req.params.id, req.user.id, req.validatedData);
  successResponse(res, { job: formatJob(job) }, 'Job updated successfully');
});

export const deleteJob = asyncHandler(async (req, res) => {
  const result = await jobService.deleteJob(req.params.id, req.user.id);
  successResponse(res, null, result.message);
});

export const getMyJobs = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await jobService.getClientJobs(req.user.id, { page, limit, status });
  paginatedResponse(
    res,
    result.jobs.map(job => formatJob(job)),
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

export const closeJob = asyncHandler(async (req, res) => {
  const job = await jobService.closeJob(req.params.id, req.user.id);
  successResponse(res, { job: formatJob(job) }, 'Job closed successfully');
});

export const getJobStats = asyncHandler(async (req, res) => {
  const stats = await jobService.getJobStats(req.user.id);
  successResponse(res, { stats }, 'Statistics fetched successfully');
});

/**
 * Get recommended jobs for freelancer
 */
export const getRecommendedJobs = asyncHandler(async (req, res) => {
  const jobs = await jobService.getRecommendedJobs(req.user.id);
  successResponse(res, { jobs: jobs.map(job => formatJob(job)) }, 'Recommended jobs fetched successfully');
});

/**
 * Get recommended freelancers for a job
 */
export const getRecommendedFreelancers = asyncHandler(async (req, res) => {
  const { limit = 10, minScore = 0 } = req.query;
  const freelancers = await jobService.getRecommendedFreelancers(req.params.id, { limit, minScore });
  successResponse(res, { freelancers }, 'Recommended freelancers fetched successfully');
});