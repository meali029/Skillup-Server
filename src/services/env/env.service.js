import EnvironmentVariable from '../../models/EnvironmentVariable.js';
import createAppError from '../../core/errors/AppError.js';

const AppError = createAppError;

/**
 * Environment Variable Service
 * Manages environment variables stored in the database
 */
class EnvService {
  /**
   * Get all environment variables
   */
  async getAllVariables() {
    try {
      const variables = await EnvironmentVariable.find({}).sort({ key: 1 });
      return variables;
    } catch (error) {
      throw createAppError('Failed to retrieve environment variables', 500);
    }
  }

  /**
   * Get a single environment variable by key
   */
  async getVariable(key) {
    try {
      const variable = await EnvironmentVariable.findOne({ 
        key: key.toUpperCase() 
      });
      return variable;
    } catch (error) {
      throw createAppError('Failed to retrieve environment variable', 500);
    }
  }

  /**
   * Create or update an environment variable
   */
  async setVariable(key, value, options = {}, adminId = null) {
    try {
      const updateData = {
        key: key.toUpperCase(),
        value,
        ...options,
      };

      if (adminId) {
        updateData.updatedBy = adminId;
      }

      const variable = await EnvironmentVariable.setVariable(
        key.toUpperCase(),
        value,
        updateData
      );

      return variable;
    } catch (error) {
      throw createAppError('Failed to set environment variable', 500);
    }
  }

  /**
   * Delete an environment variable
   */
  async deleteVariable(key) {
    try {
      const variable = await EnvironmentVariable.findOneAndDelete({ 
        key: key.toUpperCase() 
      });
      
      if (!variable) {
        throw createAppError('Environment variable not found', 404);
      }

      return variable;
    } catch (error) {
      if (error.statusCode) {
        throw error;
      }
      throw AppError('Failed to delete environment variable', 500);
    }
  }

  /**
   * Bulk set environment variables
   */
  async setBulkVariables(variables, adminId = null) {
    try {
      const results = [];
      
      for (const { key, value, ...options } of variables) {
        const result = await this.setVariable(key, value, options, adminId);
        results.push(result);
      }

      return results;
    } catch (error) {
      throw createAppError('Failed to set bulk environment variables', 500);
    }
  }

  /**
   * Get public variables (for frontend)
   */
  async getPublicVariables() {
    try {
      const variables = await EnvironmentVariable.getPublicVariables();
      return variables;
    } catch (error) {
      throw AppError('Failed to retrieve public environment variables', 500);
    }
  }

  /**
   * Get all variables as key-value object
   */
  async getAllAsObject() {
    try {
      const variables = await EnvironmentVariable.getAllAsObject();
      return variables;
    } catch (error) {
      throw AppError('Failed to retrieve environment variables as object', 500);
    }
  }
}

export default new EnvService();

