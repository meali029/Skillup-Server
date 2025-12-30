import Contract from '../models/Contract.js';
import { CONTRACT_STATUS } from '../modules/contracts/contract.constants.js';

/**
 * Freelancer History Service
 * Aggregates contract history and statistics for freelancers
 */
class FreelancerHistoryService {
  /**
   * Get comprehensive contract history statistics for a freelancer
   * @param {string} freelancerId - Freelancer user ID
   * @returns {Promise<Object>} Contract history statistics
   */
  async getFreelancerContractHistory(freelancerId) {
    if (!freelancerId) {
      return this.getEmptyStats();
    }

    try {
      // Get all contracts for this freelancer
      const contracts = await Contract.find({ freelancer: freelancerId })
        .select('status totalAmount completedAt deadline startDate cancelledAt')
        .lean();

      if (!contracts || contracts.length === 0) {
        return this.getEmptyStats();
      }

      // Calculate statistics
      const totalContracts = contracts.length;
      const completedContracts = contracts.filter(
        (c) => c.status === CONTRACT_STATUS.COMPLETED
      );
      const activeContracts = contracts.filter(
        (c) => c.status === CONTRACT_STATUS.ACTIVE
      );
      const cancelledContracts = contracts.filter(
        (c) => c.status === CONTRACT_STATUS.CANCELLED
      );
      const disputedContracts = contracts.filter(
        (c) => c.status === CONTRACT_STATUS.DISPUTED
      );

      // Calculate success rate (completed / (completed + cancelled + disputed))
      const totalFinalized = completedContracts.length + cancelledContracts.length + disputedContracts.length;
      const successRate = totalFinalized > 0 
        ? (completedContracts.length / totalFinalized) * 100 
        : 0;

      // Calculate total earnings from completed contracts
      const totalEarned = completedContracts.reduce(
        (sum, contract) => sum + (contract.totalAmount || 0),
        0
      );

      // Calculate average contract value
      const averageContractValue = totalContracts > 0
        ? contracts.reduce((sum, c) => sum + (c.totalAmount || 0), 0) / totalContracts
        : 0;

      // Calculate on-time delivery rate
      const onTimeDeliveries = completedContracts.filter((contract) => {
        if (!contract.completedAt || !contract.deadline) return false;
        return new Date(contract.completedAt) <= new Date(contract.deadline);
      });
      const onTimeDeliveryRate = completedContracts.length > 0
        ? (onTimeDeliveries.length / completedContracts.length) * 100
        : 0;

      // Calculate dispute rate
      const disputeRate = totalContracts > 0
        ? (disputedContracts.length / totalContracts) * 100
        : 0;

      // Calculate average completion time (for completed contracts with start date)
      const contractsWithDuration = completedContracts.filter(
        (c) => c.startDate && c.completedAt
      );
      const averageCompletionDays = contractsWithDuration.length > 0
        ? contractsWithDuration.reduce((sum, contract) => {
            const days = Math.ceil(
              (new Date(contract.completedAt) - new Date(contract.startDate)) / (1000 * 60 * 60 * 24)
            );
            return sum + days;
          }, 0) / contractsWithDuration.length
        : null;

      return {
        totalContracts,
        completedContracts: completedContracts.length,
        activeContracts: activeContracts.length,
        cancelledContracts: cancelledContracts.length,
        disputedContracts: disputedContracts.length,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
        totalEarned,
        averageContractValue: Math.round(averageContractValue * 100) / 100,
        onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 100) / 100,
        disputeRate: Math.round(disputeRate * 100) / 100,
        averageCompletionDays: averageCompletionDays ? Math.round(averageCompletionDays * 10) / 10 : null,
        hasHistory: true,
      };
    } catch (error) {
      console.error('[FreelancerHistory] Error fetching contract history:', error);
      return this.getEmptyStats();
    }
  }

  /**
   * Get contract statistics (alias for compatibility)
   * @param {string} freelancerId - Freelancer user ID
   * @returns {Promise<Object>} Contract statistics
   */
  async getFreelancerStats(freelancerId) {
    return this.getFreelancerContractHistory(freelancerId);
  }

  /**
   * Get contract history for multiple freelancers in batch
   * @param {Array<string>} freelancerIds - Array of freelancer IDs
   * @returns {Promise<Map>} Map of freelancerId -> contract history
   */
  async getBatchContractHistory(freelancerIds) {
    if (!freelancerIds || freelancerIds.length === 0) {
      return new Map();
    }

    try {
      const contracts = await Contract.find({
        freelancer: { $in: freelancerIds }
      })
        .select('freelancer status totalAmount completedAt deadline startDate cancelledAt')
        .lean();

      // Group contracts by freelancer
      const contractsByFreelancer = new Map();
      freelancerIds.forEach(id => {
        contractsByFreelancer.set(id.toString(), []);
      });

      contracts.forEach(contract => {
        const freelancerId = contract.freelancer.toString();
        if (contractsByFreelancer.has(freelancerId)) {
          contractsByFreelancer.get(freelancerId).push(contract);
        }
      });

      // Calculate stats for each freelancer
      const historyMap = new Map();
      for (const [freelancerId, freelancerContracts] of contractsByFreelancer) {
        if (freelancerContracts.length === 0) {
          historyMap.set(freelancerId, this.getEmptyStats());
        } else {
          // Reuse the calculation logic
          const stats = await this.calculateStatsFromContracts(freelancerContracts);
          historyMap.set(freelancerId, stats);
        }
      }

      return historyMap;
    } catch (error) {
      console.error('[FreelancerHistory] Error fetching batch contract history:', error);
      // Return empty stats for all
      const historyMap = new Map();
      freelancerIds.forEach(id => {
        historyMap.set(id.toString(), this.getEmptyStats());
      });
      return historyMap;
    }
  }

  /**
   * Calculate statistics from an array of contracts
   * @private
   */
  calculateStatsFromContracts(contracts) {
    const totalContracts = contracts.length;
    const completedContracts = contracts.filter(
      (c) => c.status === CONTRACT_STATUS.COMPLETED
    );
    const activeContracts = contracts.filter(
      (c) => c.status === CONTRACT_STATUS.ACTIVE
    );
    const cancelledContracts = contracts.filter(
      (c) => c.status === CONTRACT_STATUS.CANCELLED
    );
    const disputedContracts = contracts.filter(
      (c) => c.status === CONTRACT_STATUS.DISPUTED
    );

    const totalFinalized = completedContracts.length + cancelledContracts.length + disputedContracts.length;
    const successRate = totalFinalized > 0 
      ? (completedContracts.length / totalFinalized) * 100 
      : 0;

    const totalEarned = completedContracts.reduce(
      (sum, contract) => sum + (contract.totalAmount || 0),
      0
    );

    const averageContractValue = totalContracts > 0
      ? contracts.reduce((sum, c) => sum + (c.totalAmount || 0), 0) / totalContracts
      : 0;

    const onTimeDeliveries = completedContracts.filter((contract) => {
      if (!contract.completedAt || !contract.deadline) return false;
      return new Date(contract.completedAt) <= new Date(contract.deadline);
    });
    const onTimeDeliveryRate = completedContracts.length > 0
      ? (onTimeDeliveries.length / completedContracts.length) * 100
      : 0;

    const disputeRate = totalContracts > 0
      ? (disputedContracts.length / totalContracts) * 100
      : 0;

    const contractsWithDuration = completedContracts.filter(
      (c) => c.startDate && c.completedAt
    );
    const averageCompletionDays = contractsWithDuration.length > 0
      ? contractsWithDuration.reduce((sum, contract) => {
          const days = Math.ceil(
            (new Date(contract.completedAt) - new Date(contract.startDate)) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / contractsWithDuration.length
      : null;

    return {
      totalContracts,
      completedContracts: completedContracts.length,
      activeContracts: activeContracts.length,
      cancelledContracts: cancelledContracts.length,
      disputedContracts: disputedContracts.length,
      successRate: Math.round(successRate * 100) / 100,
      totalEarned,
      averageContractValue: Math.round(averageContractValue * 100) / 100,
      onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 100) / 100,
      disputeRate: Math.round(disputeRate * 100) / 100,
      averageCompletionDays: averageCompletionDays ? Math.round(averageCompletionDays * 10) / 10 : null,
      hasHistory: true,
    };
  }

  /**
   * Get empty stats object for freelancers with no history
   * @private
   */
  getEmptyStats() {
    return {
      totalContracts: 0,
      completedContracts: 0,
      activeContracts: 0,
      cancelledContracts: 0,
      disputedContracts: 0,
      successRate: 0,
      totalEarned: 0,
      averageContractValue: 0,
      onTimeDeliveryRate: 0,
      disputeRate: 0,
      averageCompletionDays: null,
      hasHistory: false,
    };
  }
}

export default new FreelancerHistoryService();

