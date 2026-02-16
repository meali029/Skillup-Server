import Contract from '../../models/Contract.js';
import User from '../../models/User.js';
import { createAppError } from '../../core/errors/index.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';
import { CONTRACT_STATUS } from '../contracts/contract.constants.js';

/**
 * Review Service
 * 
 * Business Rules Enforced:
 * 1. Contract must be COMPLETED (not cancelled/disputed/terminated)
 * 2. Only client and freelancer of the contract can leave reviews
 * 3. Each party can submit only ONE review per contract (immutable)
 * 4. Client reviews the Freelancer's work
 * 5. Freelancer reviews the Client's collaboration
 * 6. Rating recalculation uses weighted average formula
 */

class ReviewService {
  /**
   * Submit a review for a completed contract
   * 
   * @param {string} contractId - The contract ID
   * @param {string} reviewerId - The user submitting the review
   * @param {Object} reviewData - { rating: 1-5, comment?: string }
   * @returns {Object} Updated contract with review
   */
  async submitReview(contractId, reviewerId, reviewData) {
    console.log('[REVIEW][SUBMIT] Starting review submission:', { contractId, reviewerId, reviewData });
    
    // Fetch contract with parties populated
    const contract = await Contract.findById(contractId)
      .populate('client', 'name email rating')
      .populate('freelancer', 'name email rating');

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    console.log('[REVIEW][SUBMIT] Contract found:', { 
      id: contract._id, 
      status: contract.status,
      clientReview: contract.clientReview,
      freelancerReview: contract.freelancerReview
    });

    // Business Rule: Contract must be completed
    if (contract.status !== CONTRACT_STATUS.COMPLETED) {
      throw createAppError(
        'Reviews can only be submitted for completed contracts. ' +
        `Current status: ${contract.status}`,
        400
      );
    }

    // Determine reviewer's role in contract
    const reviewerIdStr = reviewerId.toString();
    const clientIdStr = (contract.client._id || contract.client).toString();
    const freelancerIdStr = (contract.freelancer._id || contract.freelancer).toString();

    const isClient = clientIdStr === reviewerIdStr;
    const isFreelancer = freelancerIdStr === reviewerIdStr;

    // Business Rule: Only contract parties can review
    if (!isClient && !isFreelancer) {
      throw createAppError('You are not authorized to review this contract', 403);
    }

    // Determine which review field to update and who is being reviewed
    let reviewField;
    let revieweeId;
    let revieweeName;

    if (isClient) {
      // Client reviews the Freelancer
      reviewField = 'clientReview';
      revieweeId = contract.freelancer._id;
      revieweeName = contract.freelancer.name;
      
      // Business Rule: One review per party per contract
      if (contract.clientReview) {
        throw createAppError('You have already submitted a review for this contract', 400);
      }
    } else {
      // Freelancer reviews the Client
      reviewField = 'freelancerReview';
      revieweeId = contract.client._id;
      revieweeName = contract.client.name;
      
      // Business Rule: One review per party per contract
      if (contract.freelancerReview) {
        throw createAppError('You have already submitted a review for this contract', 400);
      }
    }

    // Create review object
    const review = {
      rating: reviewData.rating,
      comment: reviewData.comment?.trim() || '',
      createdAt: new Date(),
    };

    // Update contract with review
    contract[reviewField] = review;
    await contract.save();

    // Update reviewee's rating aggregate
    await this.recalculateUserRating(revieweeId);

    // Create audit log
    await createAuditLog({
      action: 'REVIEW_SUBMITTED',
      performedBy: reviewerId,
      targetType: 'Contract',
      targetId: contract._id,
      details: {
        reviewerRole: isClient ? 'client' : 'freelancer',
        revieweeId: revieweeId.toString(),
        revieweeName,
        rating: review.rating,
        hasComment: !!review.comment,
      },
    });

    const result = {
      contract: contract._id,
      review,
      reviewedUser: {
        id: revieweeId,
        name: revieweeName,
      },
    };
    
    console.log('[REVIEW][SUBMIT] Review submitted successfully:', result);
    return result;
  }

  /**
   * Recalculate a user's average rating based on all reviews
   * 
   * Rating Calculation Formula:
   * - Freelancers: Average of all clientReview.rating where they are freelancer
   * - Clients: Average of all freelancerReview.rating where they are client
   * 
   * @param {string} userId - The user whose rating to recalculate
   */
  async recalculateUserRating(userId) {
    console.log('[REVIEW][RECALCULATE] Starting rating recalculation for user:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      throw createAppError('User not found for rating recalculation', 404);
    }

    console.log('[REVIEW][RECALCULATE] Current rating:', user.rating);

    // Get all completed contracts where user participated
    // For freelancers: look at clientReview (client's review OF the freelancer)
    // For clients: look at freelancerReview (freelancer's review OF the client)
    
    const [freelancerReviews, clientReviews] = await Promise.all([
      // Reviews where user is the freelancer (rated by clients)
      Contract.find({
        freelancer: userId,
        status: CONTRACT_STATUS.COMPLETED,
        'clientReview.rating': { $exists: true },
      }).select('clientReview.rating'),
      
      // Reviews where user is the client (rated by freelancers)
      Contract.find({
        client: userId,
        status: CONTRACT_STATUS.COMPLETED,
        'freelancerReview.rating': { $exists: true },
      }).select('freelancerReview.rating'),
    ]);

    console.log('[REVIEW][RECALCULATE] Found reviews - as freelancer:', freelancerReviews.length, 'as client:', clientReviews.length);

    // Combine all ratings
    const allRatings = [
      ...freelancerReviews.map(c => c.clientReview.rating),
      ...clientReviews.map(c => c.freelancerReview.rating),
    ];

    console.log('[REVIEW][RECALCULATE] All ratings:', allRatings);

    // Calculate new average
    let newAverage = 0;
    let newCount = allRatings.length;

    if (newCount > 0) {
      const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
      newAverage = Math.round((sum / newCount) * 10) / 10; // Round to 1 decimal place
    }

    console.log('[REVIEW][RECALCULATE] Calculated new rating - average:', newAverage, 'count:', newCount);

    // Update user rating
    await User.findByIdAndUpdate(userId, {
      'rating.average': newAverage,
      'rating.count': newCount,
    });

    console.log('[REVIEW][RECALCULATE] User rating updated successfully');

    return { average: newAverage, count: newCount };
  }

  /**
   * Get review status for a contract
   * Returns whether each party has reviewed
   * 
   * @param {string} contractId - The contract ID
   * @param {string} userId - The requesting user ID
   * @returns {Object} Review status details
   */
  async getReviewStatus(contractId, userId) {
    console.log('[REVIEW][STATUS] Getting review status for contract:', contractId, 'user:', userId);
    
    const contract = await Contract.findById(contractId)
      .populate('client', 'name')
      .populate('freelancer', 'name')
      .select('status client freelancer clientReview freelancerReview');

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Check if user is a party to this contract
    const userIdStr = userId.toString();
    const clientIdStr = (contract.client._id || contract.client).toString();
    const freelancerIdStr = (contract.freelancer._id || contract.freelancer).toString();

    if (userIdStr !== clientIdStr && userIdStr !== freelancerIdStr) {
      throw createAppError('You are not authorized to view this contract', 403);
    }

    const isClient = userIdStr === clientIdStr;
    const canReview = contract.status === CONTRACT_STATUS.COMPLETED;
    const userHasReviewed = isClient ? !!contract.clientReview : !!contract.freelancerReview;
    const otherPartyHasReviewed = isClient ? !!contract.freelancerReview : !!contract.clientReview;

    const status = {
      contractId: contract._id,
      contractStatus: contract.status,
      canReview,
      userRole: isClient ? 'client' : 'freelancer',
      hasReviewed: userHasReviewed, // Use hasReviewed for consistency with frontend
      userHasReviewed, // Keep for backward compatibility
      otherPartyHasReviewed,
      // Only show review details if the review exists
      userReview: isClient ? contract.clientReview : contract.freelancerReview,
      otherPartyReview: isClient ? contract.freelancerReview : contract.clientReview,
    };
    
    console.log('[REVIEW][STATUS] Status result:', status);
    return status;
  }

  /**
   * Get all reviews received by a user
   * 
   * @param {string} userId - The user whose reviews to fetch
   * @param {Object} options - Pagination and sorting options
   * @returns {Object} Paginated reviews
   */
  async getUserReviews(userId, options = {}) {
    const { page = 1, limit = 10, sort = 'recent' } = options;
    const skip = (page - 1) * limit;

    console.log('[REVIEW][GET_USER_REVIEWS] Fetching reviews for userId:', userId);

    // Find all contracts where user received a review
    const [freelancerContracts, clientContracts] = await Promise.all([
      // User as freelancer - received clientReview
      Contract.find({
        freelancer: userId,
        status: CONTRACT_STATUS.COMPLETED,
        'clientReview.rating': { $exists: true },
      })
        .populate('client', 'name avatar')
        .populate('job', 'title')
        .select('clientReview client job createdAt')
        .sort({ 'clientReview.createdAt': -1 }),
      
      // User as client - received freelancerReview
      Contract.find({
        client: userId,
        status: CONTRACT_STATUS.COMPLETED,
        'freelancerReview.rating': { $exists: true },
      })
        .populate('freelancer', 'name avatar')
        .populate('job', 'title')
        .select('freelancerReview freelancer job createdAt')
        .sort({ 'freelancerReview.createdAt': -1 }),
    ]);

    console.log('[REVIEW][GET_USER_REVIEWS] Found contracts - freelancer:', freelancerContracts.length, 'client:', clientContracts.length);
    console.log('[REVIEW][GET_USER_REVIEWS] Freelancer contract IDs:', freelancerContracts.map(c => c._id.toString()));
    console.log('[REVIEW][GET_USER_REVIEWS] Freelancer contracts details:', freelancerContracts.map(c => ({
      contractId: c._id.toString(),
      jobTitle: c.job?.title || 'Unknown Job',
      clientName: c.client?.name,
      rating: c.clientReview?.rating,
      comment: c.clientReview?.comment,
      createdAt: c.clientReview?.createdAt
    })));
    console.log('[REVIEW][GET_USER_REVIEWS] Client contract IDs:', clientContracts.map(c => c._id.toString()));

    // Transform and combine reviews (deduplicate by contractId)
    const reviewsMap = new Map();
    
    // Add freelancer reviews (reviews received when user was the freelancer)
    freelancerContracts.forEach(contract => {
      const contractIdStr = contract._id.toString();
      if (!reviewsMap.has(contractIdStr)) {
        reviewsMap.set(contractIdStr, {
          _id: contract._id,
          contractId: contract._id,
          jobTitle: contract.job?.title || 'Unknown Job',
          reviewer: {
            id: contract.client._id,
            name: contract.client.name,
            avatar: contract.client.avatar,
            role: 'client',
          },
          rating: contract.clientReview.rating,
          comment: contract.clientReview.comment,
          createdAt: contract.clientReview.createdAt,
          reviewType: 'received_as_freelancer',
        });
      } else {
        console.log('[REVIEW][GET_USER_REVIEWS] DUPLICATE FOUND! Contract ID:', contractIdStr, 'already in map');
      }
    });
    
    // Add client reviews (reviews received when user was the client)
    clientContracts.forEach(contract => {
      const contractIdStr = contract._id.toString();
      if (!reviewsMap.has(contractIdStr)) {
        reviewsMap.set(contractIdStr, {
          _id: contract._id,
          contractId: contract._id,
          jobTitle: contract.job?.title || 'Unknown Job',
          reviewer: {
            id: contract.freelancer._id,
            name: contract.freelancer.name,
            avatar: contract.freelancer.avatar,
            role: 'freelancer',
          },
          rating: contract.freelancerReview.rating,
          comment: contract.freelancerReview.comment,
          createdAt: contract.freelancerReview.createdAt,
          reviewType: 'received_as_client',
        });
      } else {
        console.log('[REVIEW][GET_USER_REVIEWS] DUPLICATE FOUND! Contract ID:', contractIdStr, 'already in map');
      }
    });
    
    // Convert map to array
    const reviews = Array.from(reviewsMap.values());
    
    console.log('[REVIEW][GET_USER_REVIEWS] Total unique reviews after deduplication:', reviews.length);
    console.log('[REVIEW][GET_USER_REVIEWS] Review details:', reviews.map(r => ({
      contractId: r.contractId.toString(),
      reviewer: r.reviewer.name,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt
    })));

    // Sort combined reviews
    if (sort === 'recent') {
      reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'highest') {
      reviews.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'lowest') {
      reviews.sort((a, b) => a.rating - b.rating);
    }

    // Apply pagination
    const total = reviews.length;
    const paginatedReviews = reviews.slice(skip, skip + limit);
    
    console.log('[REVIEW][GET_USER_REVIEWS] Returning', paginatedReviews.length, 'reviews (page', page, 'of', Math.ceil(total / limit), ')');

    // Get user's current rating
    const user = await User.findById(userId).select('name rating');

    return {
      user: {
        id: userId,
        name: user?.name,
        rating: user?.rating || { average: 0, count: 0 },
      },
      reviews: paginatedReviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    };
  }

  /**
   * Get reviews for a specific contract
   * 
   * @param {string} contractId - The contract ID
   * @returns {Object} Both reviews for the contract
   */
  async getContractReviews(contractId) {
    const contract = await Contract.findById(contractId)
      .populate('client', 'name avatar')
      .populate('freelancer', 'name avatar')
      .populate('job', 'title')
      .select('status client freelancer clientReview freelancerReview job');

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    return {
      contractId: contract._id,
      jobTitle: contract.job?.title,
      status: contract.status,
      clientReview: contract.clientReview ? {
        rating: contract.clientReview.rating,
        comment: contract.clientReview.comment,
        createdAt: contract.clientReview.createdAt,
        reviewer: {
          id: contract.client._id,
          name: contract.client.name,
          avatar: contract.client.avatar,
        },
        reviewedUser: {
          id: contract.freelancer._id,
          name: contract.freelancer.name,
        },
      } : null,
      freelancerReview: contract.freelancerReview ? {
        rating: contract.freelancerReview.rating,
        comment: contract.freelancerReview.comment,
        createdAt: contract.freelancerReview.createdAt,
        reviewer: {
          id: contract.freelancer._id,
          name: contract.freelancer.name,
          avatar: contract.freelancer.avatar,
        },
        reviewedUser: {
          id: contract.client._id,
          name: contract.client.name,
        },
      } : null,
    };
  }
}

export default new ReviewService();
