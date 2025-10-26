// Central export file for all Mongoose models
// This ensures all models are registered with Mongoose at server startup

import User from "./User.js";
import Job from "./Job.js";
import Proposal from "./Proposal.js";

export { User, Job, Proposal };

export default {
  User,
  Job,
  Proposal,
};
