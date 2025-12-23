// Central export file for all Mongoose models
// This ensures all models are registered with Mongoose at server startup

import User from "./User.js";
import Job from "./Job.js";
import Proposal from "./Proposal.js";
import Contract from "./Contract.js";
import Conversation from "./Conversation.js";
import Message from "./Message.js";
import AdminSettings from "./AdminSettings.js";
import EnvironmentVariable from "./EnvironmentVariable.js";

export { User, Job, Proposal, Contract, Conversation, Message, AdminSettings, EnvironmentVariable };

export default {
  User,
  Job,
  Proposal,
  Contract,
  Conversation,
  Message,
  AdminSettings,
  EnvironmentVariable,
};
